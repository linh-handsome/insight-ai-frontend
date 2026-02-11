#!/bin/bash
echo "==================================================="
echo "Starting Classroom Insight AI (Streamlit)"
echo "==================================================="

cd "$(dirname "$0")"

if [ ! -d "venv" ]; then
    echo "[INFO] Creating Python virtual environment..."
    python3 -m venv venv
fi

echo "[INFO] Activating virtual environment..."
source venv/bin/activate

echo "[INFO] Installing/Updating dependencies..."
pip install -r requirements.txt

echo "[INFO] Launching Streamlit App..."
streamlit run app.py
