import cv2
import mediapipe as mp
import numpy as np
from math import hypot
import time

class VisionEngine:
    def __init__(self):
        self.mp_face_mesh = mp.solutions.face_mesh
        self.face_mesh = self.mp_face_mesh.FaceMesh(
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
            refine_landmarks=True
        )
        self.mp_drawing = mp.solutions.drawing_utils
        self.drawing_spec = self.mp_drawing.DrawingSpec(thickness=1, circle_radius=1)

        # EAR Thresholds
        self.EAR_THRESHOLD = 0.25
        self.CONSECUTIVE_FRAMES = 20
        
        # 3D Model Points for Head Pose (approximate generic face)
        self.face_3d = np.array([
            [0.0, 0.0, 0.0],            # Nose tip
            [0.0, -330.0, -65.0],       # Chin
            [-225.0, 170.0, -135.0],    # Left eye left corner
            [225.0, 170.0, -135.0],     # Right eye right corner
            [-150.0, -150.0, -125.0],   # Left Mouth corner
            [150.0, -150.0, -125.0]     # Right mouth corner
        ], dtype=np.float64)

        # Indices for landmarks corresponding to the 3D points
        self.nose_idx = 1
        self.chin_idx = 199
        self.left_eye_left_idx = 33
        self.right_eye_right_idx = 263
        self.left_mouth_idx = 61
        self.right_mouth_idx = 291
        
        # Eye indices for EAR
        self.LEFT_EYE = [362, 385, 387, 263, 373, 380]
        self.RIGHT_EYE = [33, 160, 158, 133, 153, 144]

        # Emotion model (Temporarily disabled to fix dependency conflicts)
        self.has_emotion_model = False
        # try:
        #      from fer import FER
        #      self.emotion_detector = FER(mtcnn=True)
        #      self.has_emotion_model = True
        # except ImportError:
        #      print("FER library not found. Running without advanced emotion detection.")
        #      self.has_emotion_model = False

        self.frame_count = 0
        self.last_emotion = "Neutral"

        # Behavioral Counters
        self.leaving_seat_count = 0
        self.looking_down_count = 0
        
        # State tracking for behaviors
        self.last_face_seen_time = time.time()
        self.is_seat_empty = False
        self.is_looking_down = False

    def calculate_ear(self, landmarks, eye_indices, w, h):
        # Extract coordinates
        coords = []
        for idx in eye_indices:
            lm = landmarks[idx]
            coords.append((int(lm.x * w), int(lm.y * h)))
        
        # Vertical distances
        v1 = hypot(coords[1][0] - coords[5][0], coords[1][1] - coords[5][1])
        v2 = hypot(coords[2][0] - coords[4][0], coords[2][1] - coords[4][1])
        
        # Horizontal distance
        h_dist = hypot(coords[0][0] - coords[3][0], coords[0][1] - coords[3][1])
        
        if h_dist == 0: return 0
        ear = (v1 + v2) / (2.0 * h_dist)
        return ear

    def get_head_pose(self, landmarks, w, h):
        face_2d = []
        for idx in [self.nose_idx, self.chin_idx, self.left_eye_left_idx, self.right_eye_right_idx, self.left_mouth_idx, self.right_mouth_idx]:
            lm = landmarks[idx]
            x, y = int(lm.x * w), int(lm.y * h)
            face_2d.append([x, y])
            
        face_2d = np.array(face_2d, dtype=np.float64)
        focal_length = 1 * w
        cam_matrix = np.array([ [focal_length, 0, w / 2],
                                [0, focal_length, h / 2],
                                [0, 0, 1]])
        dist_matrix = np.zeros((4, 1), dtype=np.float64)

        success, rot_vec, trans_vec = cv2.solvePnP(self.face_3d, face_2d, cam_matrix, dist_matrix)
        
        if not success:
            return None

        rmat, jac = cv2.Rodrigues(rot_vec)
        angles, mtxR, mtxQ, Qx, Qy, Qz = cv2.RQDecomp3x3(rmat)

        x_angle = angles[0] * 360
        y_angle = angles[1] * 360
        
        return x_angle, y_angle

    def process_frame(self, frame):
        # Frame is assumed to be a numpy array (BGR)
        h, w, c = frame.shape
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self.face_mesh.process(rgb_frame)
        
        students_data = []
        overall_status = "Active"
        
        if results.multi_face_landmarks:
            # Face Detected
            if self.is_seat_empty:
                self.is_seat_empty = False  # Student returned
            self.last_face_seen_time = time.time()

            for face_landmarks in results.multi_face_landmarks:
                # 1. Drowsiness (EAR)
                left_ear = self.calculate_ear(face_landmarks.landmark, self.LEFT_EYE, w, h)
                right_ear = self.calculate_ear(face_landmarks.landmark, self.RIGHT_EYE, w, h)
                avg_ear = (left_ear + right_ear) / 2.0
                is_drowsy = avg_ear < self.EAR_THRESHOLD

                # 2. Focus (Head Pose)
                pose_angles = self.get_head_pose(face_landmarks.landmark, w, h)
                is_distracted = False
                looking_direction = "Center"
                
                if pose_angles:
                    pitch, yaw = pose_angles
                    
                    # Pitch < -10 is Down in current logic. 
                    # Requirement: Count when looking down (Pitch > 20 deg provided in prompt, likely meaning deeply down).
                    # We interpret "Down" as pitch < -20 based on existing coordinate system.
                    
                    if pitch < -10: looking_direction = "Down"
                    elif pitch > 10: looking_direction = "Up"
                    elif yaw < -10: looking_direction = "Left"
                    elif yaw > 10: looking_direction = "Right"
                    
                    if abs(pitch) > 15 or abs(yaw) > 20:
                        is_distracted = True

                    # Looking Down Counter Logic
                    # If pitch is significantly down (e.g. < -20)
                    if pitch < -20:
                        self.is_looking_down = True
                    elif self.is_looking_down and pitch > -15:
                        # Returned to normal/up from down
                        self.looking_down_count += 1
                        self.is_looking_down = False

                # 3. Emotion
                emotion = "Neutral"
                if self.has_emotion_model:
                     # Optimization: Run emotion detection every 30 frames (approx 1-2 sec)
                     if self.frame_count % 30 == 0:
                         # Use the full frame for detection stability
                         # top_emotion returns (emotion_name, score)
                         detected_emotion, score = self.emotion_detector.top_emotion(frame)
                         if detected_emotion:
                             self.last_emotion = detected_emotion
                     
                     emotion = self.last_emotion 
                
                # Get Face Center for Heatmap
                nose = face_landmarks.landmark[1]
                cx, cy = int(nose.x * w), int(nose.y * h)

                students_data.append({
                   "id": np.random.randint(1000,9999), # Mock ID for tracking
                   "drowsy": is_drowsy,
                   "ear": round(avg_ear, 2),
                   "distracted": is_distracted,
                   "looking_at": looking_direction,
                   "emotion": emotion,
                   "position": {"x": cx, "y": cy}
                })
        else:
            # No Face Detected
            if not self.is_seat_empty:
                if time.time() - self.last_face_seen_time > 3.0:
                    self.leaving_seat_count += 1
                    self.is_seat_empty = True

        return students_data, frame
