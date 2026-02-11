from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import uvicorn
import cv2
import numpy as np
import base64
import json
import time
from datetime import datetime
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from vision_engine import VisionEngine
import os

app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

vision_engine = VisionEngine()

# Store session data for reporting
session_data = {
    "timestamps": [],
    "avg_engagement": [],
    "distraction_events": [],
    "emotions_log": [],
    "heatmap_points": []
}

@app.get("/")
async def root():
    return {"message": "Classroom Insight AI Backend Running"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            # Expecting base64 image: "data:image/jpeg;base64,....."
            if "base64," in data:
                header, encoded = data.split(",", 1)
                image_data = base64.b64decode(encoded)
                nparr = np.frombuffer(image_data, np.uint8)
                frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

                # Process Frame
                students, processed_frame = vision_engine.process_frame(frame)

                # Aggregate Stats
                total_students = len(students)
                if total_students > 0:
                    distracted_count = sum(1 for s in students if s['distracted'])
                    drowsy_count = sum(1 for s in students if s['drowsy'])
                    engagement_score = max(0, 100 - ((distracted_count + drowsy_count) / total_students * 100))
                    
                    # Log for report
                    now = datetime.now().isoformat()
                    session_data["timestamps"].append(now)
                    session_data["avg_engagement"].append(engagement_score)
                    if engagement_score < 70:
                        session_data["distraction_events"].append(now)
                    
                    for s in students:
                        session_data["heatmap_points"].append(s["position"])
                        session_data["emotions_log"].append(s["emotion"])
                    
                    # Logic for Intervention
                    intervention = None
                    if engagement_score < 70:
                         intervention = "Attention dropping! Suggest a 2-minute stretch break."
                    elif drowsy_count > total_students * 0.3:
                         intervention = "High drowsiness detected. Try an interactive poll/quiz."

                    response = {
                        "students": students,
                        "stats": {
                            "total": total_students,
                            "distracted": distracted_count,
                            "drowsy": drowsy_count,
                            "engagement": engagement_score
                        },
                        "intervention": intervention
                    }
                    
                    await websocket.send_text(json.dumps(response))
                else:
                    await websocket.send_text(json.dumps({"students": [], "stats": {"engagement": 100}, "intervention": None}))
            
    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"Error: {e}")

@app.get("/generate_report")
def generate_report():
    filename = "end_of_session_report.pdf"
    c = canvas.Canvas(filename, pagesize=letter)
    width, height = letter

    c.setFont("Helvetica-Bold", 20)
    c.drawString(50, height - 50, "Classroom Insight AI - Session Report")
    
    c.setFont("Helvetica", 12)
    c.drawString(50, height - 100, f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Calculate Summary Stats
    avg_eng = 0
    if len(session_data["avg_engagement"]) > 0:
        avg_eng = sum(session_data["avg_engagement"]) / len(session_data["avg_engagement"])
    
    unique_emotions = set(session_data["emotions_log"])
    dominant_emotion = "N/A"
    if session_data["emotions_log"]:
        dominant_emotion = max(set(session_data["emotions_log"]), key=session_data["emotions_log"].count)

    c.drawString(50, height - 130, f"Average Engagement Score: {avg_eng:.2f}%")
    c.drawString(50, height - 150, f"Dominant Emotion (Vibe Check): {dominant_emotion}")
    c.drawString(50, height - 170, f"Peak Distraction Events: {len(session_data['distraction_events'])}")

    # Behavioral Analysis Section
    c.setFont("Helvetica-Bold", 14)
    c.drawString(50, height - 210, "Behavioral Analysis")
    c.setFont("Helvetica", 12)
    c.drawString(50, height - 230, f"Total Times Left Seat: {vision_engine.leaving_seat_count}")
    c.drawString(50, height - 250, f"Total Times Looked Down: {vision_engine.looking_down_count}")

    c.drawString(50, height - 290, "Heatmap Analysis:")
    c.drawString(50, height - 310, "(See Live Dashboard for Interactive Heatmap Visuals)")
    
    c.save()
    
    return FileResponse(filename, media_type='application/pdf', filename=filename)

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
