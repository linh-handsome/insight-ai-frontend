import React, { useRef, useEffect, useState } from 'react';
import Webcam from 'react-webcam';
import * as faceMesh from '@mediapipe/face_mesh';
import * as cam from '@mediapipe/camera_utils';
import { Activity, UserX, ArrowDown, Settings } from 'lucide-react';
import io from 'socket.io-client';
import * as pose from '@mediapipe/pose';

// Connect to socket server
const ENDPOINT = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
const socket = io(ENDPOINT);

const Dashboard = () => {
    // Refs
    const webcamRef = useRef(null);
    const canvasRef = useRef(null);
    const studentNameRef = useRef(`Student-${Math.floor(Math.random() * 1000)}`);

    // State
    const [stats, setStats] = useState({
        engagement: 0,
        isLookingDown: false,
        isLeftDesk: false,
        leftDeskCount: 0,
        lookedDownCount: 0,
        pitch: 0,
        yaw: 0
    });

    const [logs, setLogs] = useState([]); // [{ time: "HH:mm:ss", type: "Left Desk" }]
    const [studentName, setStudentName] = useState(studentNameRef.current);

    // Logic Refs (avoid closure staleness)
    const logicRef = useRef({
        leftDeskStart: null,
        lookedDownStart: null,
        leftDeskCount: 0,
        lookedDownCount: 0
    });

    // --- Helper: Timestamp ---
    const getTimestamp = () => new Date().toLocaleTimeString('vi-VN', { hour12: false });

    // Helper to translate violation types for display
    const translateViolation = (type) => {
        if (type === "Left Desk" || type === "Left_Desk") return "Rời khỏi vị trí";
        if (type === "Looking Down" || type === "Looking_Down") return "Mất tập trung";
        return type;
    };

    // --- Emit Updates to Teacher ---
    const emitUpdate = (engagement, currentLogs) => {
        socket.emit('student_update', {
            name: studentNameRef.current,
            engagement: engagement,
            violations: currentLogs
        });
    };

    // --- Init WebCam & AI ---
    useEffect(() => {
        // 1. Initialize Face Mesh
        const faceMeshSolution = new faceMesh.FaceMesh({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
        });

        faceMeshSolution.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
        });

        // 2. Initialize Pose
        const poseSolution = new pose.Pose({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
        });

        poseSolution.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        // Shared processing state
        let latestFaceResults = null;
        let latestPoseResults = null;
        const lastEmitRef = { current: 0 };

        // Custom processing loop to handle both results
        const processCombinedResults = () => {
            const now = Date.now();
            let engagement = 0;
            let isLookingDown = false;
            let isLeftDesk = false;
            let pitch = 0, yaw = 0;

            const isFacePresent = latestFaceResults && latestFaceResults.multiFaceLandmarks && latestFaceResults.multiFaceLandmarks.length > 0;

            // --- Logic 1: Check Shoulders (Pose) ---
            let isShouldersVisible = false;

            if (latestPoseResults && latestPoseResults.poseLandmarks) {
                const landmarks = latestPoseResults.poseLandmarks;
                // 11 = left shoulder, 12 = right shoulder
                const leftShoulder = landmarks[11];
                const rightShoulder = landmarks[12];

                // Visibility score (0.0 - 1.0). > 0.4 usually means "likely in frame"
                const visibleThreshold = 0.4;

                if ((leftShoulder && leftShoulder.visibility > visibleThreshold) ||
                    (rightShoulder && rightShoulder.visibility > visibleThreshold)) {
                    isShouldersVisible = true;
                }
            } else {
                // Creating a grace period: if Pose hasn't initialized yet, assume they are there.
                // We don't want to trigger "Left Desk" just because the model is loading.
                // Only if we actively receive "no landmarks" or empty landmarks would we consider absence?
                // MediaPipe sends empty results if nothing found? Usually poseLandmarks is undefined or empty array.
                // Let's assume if latestPoseResults is NULL, we are starting up -> Safe.
                // If latestPoseResults exists but no landmarks -> Body missing -> Not Safe.
                if (latestPoseResults === null) {
                    isShouldersVisible = true; // Startup
                } else {
                    isShouldersVisible = false; // Model ran, found nothing.
                }
            }

            // --- Logic 2: Determine "Left Desk" ---
            // Condition: Both Face and Shoulders must be absent.
            if (!isFacePresent && !isShouldersVisible) {
                isLeftDesk = true;

                if (!logicRef.current.leftDeskStart) {
                    logicRef.current.leftDeskStart = now;
                } else if (now - logicRef.current.leftDeskStart > 3000) { // > 3 seconds threshold
                    if (!logicRef.current.justLoggedLeftDesk) {
                        logicRef.current.leftDeskCount += 1;
                        const newLog = { time: getTimestamp(), type: "Left Desk" };
                        setLogs(prev => {
                            const updated = [newLog, ...prev];
                            emitUpdate(0, updated);
                            return updated;
                        });
                        logicRef.current.justLoggedLeftDesk = true;
                        logicRef.current.leftDeskStart = null;

                        // Force engagement to 0
                        engagement = 0;
                    }
                }
            } else {
                // User is present (Face OR Shoulders visible)
                logicRef.current.leftDeskStart = null;
                logicRef.current.justLoggedLeftDesk = false;

                // If Face is missing but Shoulders visible -> They might be looking away/down.
                if (!isFacePresent && isShouldersVisible) {
                    // We can't calculate pitch/yaw, but we know they are here.
                    // Maybe set a low "Attention" score but NOT "Left Desk".
                    engagement = 20; // Default low engagement
                }
            }

            // --- Logic 3: Engagement & Looking Down (Requires Face) ---
            if (isFacePresent) {
                const landmarks = latestFaceResults.multiFaceLandmarks[0];
                const nose = landmarks[1];
                const leftEye = landmarks[33];
                const rightEye = landmarks[263];

                const midEyeY = (leftEye.y + rightEye.y) / 2;
                const midEyeX = (leftEye.x + rightEye.x) / 2;

                const rawPitch = nose.y - midEyeY;
                pitch = (rawPitch - 0.05) * 200;

                const rawYaw = nose.x - midEyeX;
                yaw = rawYaw * 200;

                const headMovementPenalty = Math.abs(pitch) * 2 + Math.abs(yaw) * 3;
                engagement = Math.max(0, 100 - headMovementPenalty);

                if (pitch > 10) { // Threshold for looking down
                    isLookingDown = true;
                    if (!logicRef.current.lookedDownStart) {
                        logicRef.current.lookedDownStart = now;
                    } else if (now - logicRef.current.lookedDownStart > 2000) { // > 2 seconds
                        if (!logicRef.current.justLoggedLookDown) {
                            logicRef.current.lookedDownCount += 1;
                            const newLog = { time: getTimestamp(), type: "Looking Down" };
                            setLogs(prev => {
                                const updated = [newLog, ...prev];
                                emitUpdate(Math.round(engagement), updated); // Immediate update
                                return updated;
                            });
                            logicRef.current.justLoggedLookDown = true;
                            logicRef.current.lookedDownStart = null;
                        }
                    }
                } else {
                    logicRef.current.lookedDownStart = null;
                    logicRef.current.justLoggedLookDown = false;
                }
            }

            // Update UI State
            setStats({
                engagement: Math.round(engagement),
                isLookingDown,
                isLeftDesk,
                pitch: typeof pitch === 'number' ? pitch.toFixed(1) : 0,
                yaw: typeof yaw === 'number' ? yaw.toFixed(1) : 0,
                leftDeskCount: logicRef.current.leftDeskCount,
                lookedDownCount: logicRef.current.lookedDownCount
            });

            // Throttle standard updates
            if (Date.now() - lastEmitRef.current > 1000) {
                lastEmitRef.current = Date.now();
                // We rely on the periodic update or event update for logging
            }
        };

        // Hook up results
        faceMeshSolution.onResults((results) => {
            latestFaceResults = results;
            processCombinedResults();
        });

        poseSolution.onResults((results) => {
            latestPoseResults = results;
        });

        // Camera setup
        if (webcamRef.current && webcamRef.current.video) {
            const camera = new cam.Camera(webcamRef.current.video, {
                onFrame: async () => {
                    if (webcamRef.current && webcamRef.current.video) {
                        const video = webcamRef.current.video;

                        // optimization: Always run FaceMesh (engagement)
                        await faceMeshSolution.send({ image: video });

                        // optimization: Run Pose only every 10 frames (~3 FPS) for "Left Desk" check.
                        // This prevents freezing low-end devices.
                        if (!window.frameCounter) window.frameCounter = 0;
                        window.frameCounter++;

                        if (window.frameCounter % 10 === 0) {
                            await poseSolution.send({ image: video });
                        }
                    }
                },
                width: 640,
                height: 480,
            });
            camera.start();
        }
    }, []);

    // Effect to Sync Engagement constantly (every 1s) using latest state
    useEffect(() => {
        const timer = setInterval(() => {
            socket.emit('student_update', {
                name: studentName, // Use state name
                engagement: stats.engagement,
                violations: logs // Use state logs
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [stats.engagement, logs, studentName]);

    return (
        <div className="flex flex-col h-screen bg-gray-900 text-white p-6 overflow-hidden">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-brand-primary">Classroom Insight AI</h1>
                    <p className="text-gray-400 text-sm">Giao diện Học sinh</p>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex flex-col items-end">
                        <span className="text-xs text-gray-400 uppercase tracking-wider">Tên học sinh</span>
                        <input
                            type="text"
                            value={studentName}
                            onChange={(e) => {
                                setStudentName(e.target.value);
                                studentNameRef.current = e.target.value;
                            }}
                            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-right focus:outline-none focus:border-brand-primary transition-colors"
                        />
                    </div>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">

                {/* 1. Camera Feed Section */}
                <div className="flex-1 bg-gray-800 rounded-2xl p-1 relative overflow-hidden flex items-center justify-center border border-gray-700">
                    <Webcam
                        ref={webcamRef}
                        mirrored={true}
                        className="rounded-xl w-full h-full object-cover"
                    />

                    {/* HUD Overlay */}
                    <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md p-4 rounded-xl border border-white/10">
                        <div className="text-sm text-gray-300 mb-1">Mức độ Tập trung</div>
                        <div className={`text-4xl font-bold ${stats.engagement > 50 ? 'text-green-400' : 'text-red-400'}`}>
                            {stats.engagement}%
                        </div>
                    </div>

                    {/* Alerts */}
                    {stats.isLeftDesk && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm z-10">
                            <div className="text-center animate-pulse">
                                <UserX size={64} className="mx-auto text-red-500 mb-2" />
                                <h2 className="text-3xl font-bold text-red-500">Nhắc nhở: Bạn đã rời khỏi vị trí học tập</h2>
                            </div>
                        </div>
                    )}

                    {stats.isLookingDown && !stats.isLeftDesk && (
                        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-yellow-500/90 text-black px-6 py-2 rounded-full font-bold shadow-lg animate-bounce flex items-center gap-2">
                            <ArrowDown size={20} /> Cần tập trung hơn
                        </div>
                    )}
                </div>

                {/* 2. Analytics Sidebar */}
                <div className="w-full lg:w-96 flex flex-col gap-4">

                    {/* KPI Cards */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gray-800 p-5 rounded-xl border border-gray-700">
                            <div className="flex items-center gap-2 text-red-400 mb-2 font-semibold">
                                <UserX size={18} /> Rời vị trí
                            </div>
                            <div className="text-3xl font-bold">{stats.leftDeskCount}</div>
                        </div>
                        <div className="bg-gray-800 p-5 rounded-xl border border-gray-700">
                            <div className="flex items-center gap-2 text-yellow-400 mb-2 font-semibold">
                                <ArrowDown size={18} /> Mất tập trung
                            </div>
                            <div className="text-3xl font-bold">{stats.lookedDownCount}</div>
                        </div>
                    </div>

                    {/* Activity Log List */}
                    <div className="bg-gray-800 rounded-xl border border-gray-700 flex-1 overflow-hidden flex flex-col">
                        <div className="p-4 border-b border-gray-700 bg-gray-800/50">
                            <h3 className="font-bold flex items-center gap-2">
                                <Activity size={18} className="text-blue-400" />
                                Hoạt động phiên học
                            </h3>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                            {logs.length === 0 ? (
                                <div className="text-center text-gray-500 py-10 italic text-sm">
                                    Chưa ghi nhận vi phạm nào.
                                </div>
                            ) : (
                                logs.map((log, i) => (
                                    <div key={i} className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg text-sm">
                                        <span className="font-mono text-gray-400">{log.time}</span>
                                        <span className={`font-semibold ${log.type === "Left Desk" ? "text-red-400" : "text-yellow-400"}`}>
                                            {translateViolation(log.type)}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
