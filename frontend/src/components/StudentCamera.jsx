import React, { useRef, useEffect, useState } from 'react';
import Webcam from 'react-webcam';
import * as faceMesh from '@mediapipe/face_mesh';
import * as cam from '@mediapipe/camera_utils';
import { io } from 'socket.io-client';

const StudentCamera = ({ onUpdate, studentId }) => {
    const webcamRef = useRef(null);
    const socketRef = useRef(null);

    // Internal state for stats to display locally
    const [displayStats, setDisplayStats] = useState({
        engagement: 100,
        isLookingDown: false,
        isLeftDesk: false,
        leftDeskCount: 0,
        lookedDownCount: 0
    });

    const [activityLogs, setActivityLogs] = useState([]);

    // Helper: Get Current Time HH:mm
    const getCurrentTime = () => {
        const now = new Date();
        return now.toLocaleTimeString('en-US', { hour12: false, hour: "2-digit", minute: "2-digit" });
    };

    // Refs for logic (avoid closure staleness in loop)
    const statsRef = useRef({
        // State Variables for Hysteresis
        isUserAway: false,
        missingFramesCount: 0,
        recoveryFramesCount: 0,
        awayStartTime: null,

        // Existing Stats
        lookedDownStart: null,
        leftDeskCount: 0,
        lookedDownCount: 0,
        lastReportTime: 0
    });

    // Initialize Socket
    useEffect(() => {
        const ENDPOINT = import.meta.env.VITE_BACKEND_URL || 'https://insight-ai-backend-ay3w.onrender.com';
        socketRef.current = io(ENDPOINT);
        return () => {
            if (socketRef.current) socketRef.current.disconnect();
        };
    }, []);

    const logActivity = (type, details = '') => {
        const timestamp = getCurrentTime();

        const logEntry = {
            studentId,
            type,
            details,
            timestamp
        };

        // 1. Emit to Server
        if (socketRef.current && studentId) {
            socketRef.current.emit('student_activity_log', logEntry);
        }

        // 2. Update Local UI
        setActivityLogs(prev => [logEntry, ...prev]);
    };

    const onResults = (results) => {
        const now = Date.now();
        let engagement = 0;
        let isLookingDown = false;
        let pitch = 0, yaw = 0, roll = 0;

        // Check if Face is Detected
        const faceDetected = results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0;

        // ------------------------------------------
        // "Sticky" Hysteresis Logic for LEFT DESK
        // ------------------------------------------

        if (!faceDetected) {
            // Face Lost
            statsRef.current.missingFramesCount += 1;
            statsRef.current.recoveryFramesCount = 0;

            // Threshold > 60 frames (~2 seconds)
            if (statsRef.current.missingFramesCount > 60) {
                if (!statsRef.current.isUserAway) {
                    statsRef.current.isUserAway = true;
                    statsRef.current.awayStartTime = now;
                    statsRef.current.leftDeskCount += 1;
                    // Note: Not logging "LEFT_DESK" start, only "End" as requested.
                }
            }
        } else {
            // Face Detected
            statsRef.current.missingFramesCount = 0;

            if (statsRef.current.isUserAway) {
                // If currently away, we need sustained detection to recover
                statsRef.current.recoveryFramesCount += 1;

                // Threshold > 30 frames (~1 second) to reset status
                if (statsRef.current.recoveryFramesCount > 30) {
                    statsRef.current.isUserAway = false;
                    statsRef.current.recoveryFramesCount = 0;

                    // Log the "End" of the event with duration
                    if (statsRef.current.awayStartTime) {
                        const durationSeconds = ((now - statsRef.current.awayStartTime) / 1000).toFixed(1);
                        logActivity('RETURNED', `${durationSeconds}s`);
                        statsRef.current.awayStartTime = null;
                    }
                }
            }
        }

        // ------------------------------------------
        // Analysis Logic
        // ------------------------------------------

        if (statsRef.current.isUserAway) {
            // While User is Away:
            // 1. Force Engagement to 0
            engagement = 0;
            // 2. UI Overlay is handled by isLeftDesk state

        } else if (faceDetected) {
            // Normal Analysis
            const landmarks = results.multiFaceLandmarks[0];
            const nose = landmarks[1];
            const leftEye = landmarks[33];
            const rightEye = landmarks[263];

            const midEyeX = (leftEye.x + rightEye.x) / 2;
            const midEyeY = (leftEye.y + rightEye.y) / 2;

            const rawPitch = nose.y - midEyeY;
            pitch = (rawPitch - 0.05) * 100 * 2;

            const rawYaw = nose.x - midEyeX;
            yaw = rawYaw * 100 * 2.5;

            const dx = rightEye.x - leftEye.x;
            const dy = rightEye.y - leftEye.y;
            roll = Math.atan2(dy, dx) * (180 / Math.PI);

            // Engagement Score Calculation
            const penalty = Math.abs(pitch) * 1.5 + Math.abs(yaw) * 2.5 + Math.abs(roll) * 0.5;
            engagement = Math.max(0, 100 - penalty);

            // Looked Down Logic
            if (pitch > 15) {
                isLookingDown = true;
                if (!statsRef.current.lookedDownStart) {
                    statsRef.current.lookedDownStart = now;
                } else if (now - statsRef.current.lookedDownStart > 2000) {
                    statsRef.current.lookedDownCount += 1;
                    statsRef.current.lookedDownStart = null;
                    logActivity('LOOKED_DOWN');
                }
            } else {
                statsRef.current.lookedDownStart = null;
            }
        }

        // Update Refs with current status
        const currentStats = {
            engagementScore: Math.round(engagement),
            isLookingDown,
            isLeftDesk: statsRef.current.isUserAway,
            leftDeskCount: statsRef.current.leftDeskCount,
            lookedDownCount: statsRef.current.lookedDownCount,
            pitch: pitch.toFixed(1),
            yaw: yaw.toFixed(1)
        };

        // Update Local State loop (triggers re-render)
        setDisplayStats({
            engagement: currentStats.engagementScore,
            isLookingDown,
            isLeftDesk: currentStats.isLeftDesk, // This drives the Overlay
            leftDeskCount: currentStats.leftDeskCount,
            lookedDownCount: currentStats.lookedDownCount
        });

        // Callback to parent (throttled)
        if (now - statsRef.current.lastReportTime > 500) {
            onUpdate(currentStats);
            statsRef.current.lastReportTime = now;
        }
    };

    useEffect(() => {
        let camera = null;
        let faceMeshSolution = null;

        const startFaceMesh = async () => {
            faceMeshSolution = new faceMesh.FaceMesh({
                locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
            });

            faceMeshSolution.setOptions({
                maxNumFaces: 1,
                refineLandmarks: true,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5,
            });

            faceMeshSolution.onResults(onResults);

            if (webcamRef.current && webcamRef.current.video) {
                camera = new cam.Camera(webcamRef.current.video, {
                    onFrame: async () => {
                        if (webcamRef.current && webcamRef.current.video) {
                            await faceMeshSolution.send({ image: webcamRef.current.video });
                        }
                    },
                    width: 640,
                    height: 480,
                });
                await camera.start();
            }
        };
        startFaceMesh();
        return () => {
            if (camera) camera.stop();
            if (faceMeshSolution) faceMeshSolution.close();
        };
    }, []);

    return (
        <div className="glass-panel p-4 flex flex-col items-center space-y-4">
            <h3 className="text-brand-primary font-bold">Live AI Analysis</h3>
            <div className="relative w-full rounded-lg overflow-hidden border border-brand-accent/20">
                <Webcam
                    ref={webcamRef}
                    mirrored={true}
                    className="w-full h-auto"
                />

                {/* HUD Overlay */}
                <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm text-xs p-2 rounded border border-white/10 pointer-events-none">
                    <p className="text-white">Engagement: <span className={displayStats.engagement > 50 ? "text-brand-success" : "text-brand-danger"}>{Math.round(displayStats.engagement)}%</span></p>
                    <div className="mt-1 space-y-1 text-slate-300">
                        <p>Left Desk Count: {displayStats.leftDeskCount}</p>
                        <p>Look Down Count: {displayStats.lookedDownCount}</p>
                    </div>
                </div>

                {/* PERSISTENT ALERTS */}
                {displayStats.isLeftDesk && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md z-50">
                        <div className="text-brand-danger font-bold text-xl md:text-2xl animate-pulse text-center p-6 border-2 border-brand-danger rounded-xl bg-black/50 shadow-[0_0_30px_rgba(255,0,0,0.3)]">
                            CẢNH BÁO: RỜI KHỎI VỊ TRÍ!<br />
                            <span className="text-white text-base md:text-lg font-normal mt-2 block opacity-90">(Vui lòng quay lại)</span>
                        </div>
                    </div>
                )}
                {displayStats.isLookingDown && !displayStats.isLeftDesk && (
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-brand-warning/90 text-black px-3 py-1 rounded-full text-xs font-bold animate-bounce">
                        Looking Down
                    </div>
                )}
            </div>

            {/* Activity Log List */}
            <div className="w-full bg-brand-surface/50 rounded-lg p-3 max-h-40 overflow-y-auto border border-brand-accent/10">
                <h4 className="text-xs font-bold text-brand-muted uppercase mb-2 sticky top-0 bg-brand-surface pb-1">Activity Log</h4>
                <div className="space-y-2">
                    {activityLogs.length === 0 && <p className="text-xs text-brand-muted italic">No events recorded yet.</p>}
                    {activityLogs.map((log, i) => (
                        <div key={i} className="flex gap-2 text-xs items-center">
                            <span className="text-brand-muted font-mono">{log.timestamp}</span>
                            <span className={`${log.type === 'LEFT_DESK' ? 'text-brand-danger' :
                                log.type === 'RETURNED' ? 'text-brand-success' : 'text-brand-warning'
                                }`}>
                                {log.type === 'LEFT_DESK' ? '⚠️ Left Desk' :
                                    log.type === 'RETURNED' ? `✅ Returned (${log.details})` :
                                        '⚠️ Looked Down'}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            <p className="text-xs text-brand-muted text-center italic">
                Processing runs locally in your browser.
            </p>
        </div>
    );
};

export default StudentCamera;
