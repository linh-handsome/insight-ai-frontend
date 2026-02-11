import cv2
import mediapipe as mp
import numpy as np
import streamlit as st
from streamlit_webrtc import webrtc_streamer, WebRtcMode
import av
import time
import queue
import functools

# Initialize MediaPipe Face Mesh
mp_face_mesh = mp.solutions.face_mesh
mp_drawing = mp.solutions.drawing_utils
mp_drawing_styles = mp.solutions.drawing_styles

def calculate_ear(eye_landmarks):
    # eye_landmarks: list of [x, y]
    # Vertical distances
    A = np.linalg.norm(eye_landmarks[1] - eye_landmarks[5])
    B = np.linalg.norm(eye_landmarks[2] - eye_landmarks[4])
    # Horizontal distance
    C = np.linalg.norm(eye_landmarks[0] - eye_landmarks[3])
    ear = (A + B) / (2.0 * C)
    return ear

class VideoProcessor:
    def __init__(self, result_queue):
        self.result_queue = result_queue
        self.engagement_score = 100
        self.distracted_count = 0
        self.drowsy_count = 0
        
        self.total_frames = 0
        self.focused_frames = 0
        
        # Thresholds
        self.EAR_THRESHOLD = 0.25
        self.EAR_CONSEC_FRAMES = 15
        self.POSE_PITCH_THRESHOLD = 15
        self.POSE_YAW_THRESHOLD = 20
        
        self.drowsy_frame_counter = 0
        self.distracted_frame_counter = 0
        
        # Cooldown/State flags to avoid counting every frame as a new event
        self.drowsy_event_active = False
        self.distracted_event_active = False

        # Head Pose 3D Model Points (Generic)
        self.face_3d = np.array([
            [0.0, 0.0, 0.0],             # Nose tip
            [0.0, -330.0, -65.0],        # Chin
            [-225.0, 170.0, -135.0],     # Left eye left corner
            [225.0, 170.0, -135.0],      # Right eye right corner
            [-150.0, -150.0, -125.0],    # Left Mouth corner
            [150.0, -150.0, -125.0]      # Right mouth corner
        ], dtype=np.float64)

        try:
            self.face_mesh = mp_face_mesh.FaceMesh(
                max_num_faces=1,
                refine_landmarks=True,
                min_detection_confidence=0.5,
                min_tracking_confidence=0.5
            )
        except Exception as e:
            print(f"Error initializing MediaPipe Face Mesh: {e}")
            self.face_mesh = None

    def recv(self, frame: av.VideoFrame) -> av.VideoFrame:
        if self.face_mesh is None:
            return frame

        image = frame.to_ndarray(format="bgr24")
        h, w, c = image.shape
        
        # Convert to RGB for MediaPipe
        image.flags.writeable = False
        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        results = self.face_mesh.process(image_rgb)
        image.flags.writeable = True

        image = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)
        
        current_focused = True

        if results.multi_face_landmarks:
            for face_landmarks in results.multi_face_landmarks:
                # Draw landmarks
                mp_drawing.draw_landmarks(
                    image=image,
                    landmark_list=face_landmarks,
                    connections=mp_face_mesh.FACEMESH_TESSELATION,
                    landmark_drawing_spec=None,
                    connection_drawing_spec=mp_drawing_styles.get_default_face_mesh_tesselation_style())
                
                # Optional: Draw contours
                mp_drawing.draw_landmarks(
                    image=image,
                    landmark_list=face_landmarks,
                    connections=mp_face_mesh.FACEMESH_CONTOURS,
                    landmark_drawing_spec=None,
                    connection_drawing_spec=mp_drawing_styles.get_default_face_mesh_contours_style())

                lm_np = np.array([(lm.x * w, lm.y * h) for lm in face_landmarks.landmark])
                
                # --- Drowsiness Detection (EAR) ---
                # Left Eye Indices: 33, 160, 158, 133, 153, 144
                # Right Eye Indices: 362, 385, 387, 263, 373, 380
                left_eye = lm_np[[33, 160, 158, 133, 153, 144]]
                right_eye = lm_np[[362, 385, 387, 263, 373, 380]]
                
                ear_left = calculate_ear(left_eye)
                ear_right = calculate_ear(right_eye)
                avg_ear = (ear_left + ear_right) / 2.0
                
                if avg_ear < self.EAR_THRESHOLD:
                    self.drowsy_frame_counter += 1
                    if self.drowsy_frame_counter >= self.EAR_CONSEC_FRAMES:
                        cv2.putText(image, "DROWSY!", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
                        current_focused = False
                        if not self.drowsy_event_active:
                            self.drowsy_count += 1
                            self.drowsy_event_active = True
                else:
                    self.drowsy_frame_counter = 0
                    self.drowsy_event_active = False

                # --- Distraction Detection (Head Pose) ---
                face_2d = []
                # Points: Nose(1), Chin(152), L-Eye(33), R-Eye(263), L-Mouth(61), R-Mouth(291)
                for idx in [1, 152, 33, 263, 61, 291]:
                    face_2d.append([face_landmarks.landmark[idx].x * w, face_landmarks.landmark[idx].y * h])
                
                face_2d = np.array(face_2d, dtype=np.float64)
                focal_length = 1 * w
                cam_matrix = np.array([ [focal_length, 0, w / 2],
                                        [0, focal_length, h / 2],
                                        [0, 0, 1]])
                dist_matrix = np.zeros((4, 1), dtype=np.float64)
                
                success, rot_vec, trans_vec = cv2.solvePnP(self.face_3d, face_2d, cam_matrix, dist_matrix)
                
                if success:
                    rmat, jac = cv2.Rodrigues(rot_vec)
                    angles, mtxR, mtxQ, Qx, Qy, Qz = cv2.RQDecomp3x3(rmat)
                    
                    # Pitch (x), Yaw (y), Roll (z)
                    pitch = angles[0]
                    yaw = angles[1]
                    
                    if abs(pitch) > self.POSE_PITCH_THRESHOLD or abs(yaw) > self.POSE_YAW_THRESHOLD:
                        self.distracted_frame_counter += 1
                        if self.distracted_frame_counter >= 10: # small buffer
                            cv2.putText(image, "DISTRACTED!", (10, 70), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
                            current_focused = False
                            if not self.distracted_event_active:
                                self.distracted_count += 1
                                self.distracted_event_active = True
                    else:
                        self.distracted_frame_counter = 0
                        self.distracted_event_active = False
                        
                    # Visualize Nose Direction
                    nose_end_point2D, jac = cv2.projectPoints(np.array([(0.0, 0.0, 1000.0)]), rot_vec, trans_vec, cam_matrix, dist_matrix)
                    p1 = (int(face_2d[0][0]), int(face_2d[0][1]))
                    p2 = (int(nose_end_point2D[0][0][0]), int(nose_end_point2D[0][0][1]))
                    cv2.line(image, p1, p2, (255, 0, 0), 2)

        # Update Engagement
        self.total_frames += 1
        if current_focused:
            self.focused_frames += 1
        
        self.engagement_score = int((self.focused_frames / self.total_frames) * 100) if self.total_frames > 0 else 100

        # Send stats to queue
        stats_dict = {
            "engagement_score": self.engagement_score,
            "distracted_count": self.distracted_count,
            "drowsy_count": self.drowsy_count
        }
        self.result_queue.put(stats_dict)

        return av.VideoFrame.from_ndarray(image, format="bgr24")

def render():
    st.header("Real-time Engagement Tracking")
    
    # Create a thread-safe queue for data transfer
    result_queue = queue.Queue()
    
    # Layout for metrics
    col1, col2, col3 = st.columns(3)
    with col1:
        eng_metric = st.empty()
        eng_metric.metric("Engagement Score", "100%")
    with col2:
        dist_metric = st.empty()
        dist_metric.metric("Distracted Count", "0")
    with col3:
        drowsy_metric = st.empty()
        drowsy_metric.metric("Drowsy Count", "0")

    # Factory to pass queue to VideoProcessor
    video_processor_factory = functools.partial(VideoProcessor, result_queue=result_queue)

    # Webcam Streamer
    ctx = webrtc_streamer(
        key="engagement-tracker",
        mode=WebRtcMode.SENDRECV,
        rtc_configuration={"iceServers": [{"urls": ["stun:stun.l.google.com:19302"]}]},
        video_processor_factory=video_processor_factory,
        media_stream_constraints={"video": True, "audio": False},
        async_processing=True,
    )

    # Loop to update metrics while streaming
    if ctx.state.playing:
        while ctx.state.playing:
            try:
                # Non-blocking get with timeout
                data = result_queue.get(timeout=0.1)
                
                eng_metric.metric("Engagement Score", f"{data['engagement_score']}%")
                dist_metric.metric("Distracted Count", f"{data['distracted_count']}")
                drowsy_metric.metric("Drowsy Count", f"{data['drowsy_count']}")
            except queue.Empty:
                pass
            
            time.sleep(0.01) # Small sleep to prevent high CPU usage
