# Classroom Insight AI - Walkthrough

This guide provides step-by-step instructions on how to set up and run the **Classroom Insight AI** platform (React + FastAPI).

## Prerequisites

Ensure you have the following installed on your system:
- **Python 3.8+**: [Download Python](https://www.python.org/downloads/)
- **Node.js & npm** (LTS version): [Download Node.js](https://nodejs.org/)

---

## 1. Quick Start (Windows)

We have provided automated scripts for easy setup and execution.

### Step 1: Initial Setup
Run this once to install all dependencies for both Frontend and Backend.
1.  Double-click `setup.bat` in the root folder.
2.  Wait for the process to complete (it will install Python and Node.js packages).

### Step 2: Running the App
1.  Double-click `run_app.bat`.
2.  This will:
    - Start the FastAPI Backend (Port 8000).
    - Start the React Frontend (Port 3000).
    - Automatically open `http://localhost:3000` in your browser.

---

## 2. Manual Setup

If you prefer to run the commands manually or are on a stored environment:

### Backend (FastAPI)
1.  Navigate to `backend/`:
    ```bash
    cd backend
    ```
2.  Create and activate virtual environment:
    ```bash
    python -m venv venv
    venv\Scripts\activate  # Windows
    source venv/bin/activate # Mac/Linux
    ```
3.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```
4.  Run Server:
    ```bash
    uvicorn main:app --reload --host 0.0.0.0 --port 8000
    ```

### Frontend (React)
1.  Navigate to `frontend/`:
    ```bash
    cd frontend
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Run Development Server:
    ```bash
    npm run dev
    ```

---

## 3. Features

- **Real-time Dashboard**: Live Engagement, Drowsiness, and Emotion tracking.
- **Glassmorphism UI**: Modern, dark-themed interface.
- **Intervention Alerts**: Auto-suggestions based on class mood.
- **Heatmap**: Spatial tracking of student focus.
- **Reporting**: Export session data to PDF.
