@echo off
echo [1/3] Starting FastAPI Backend...
start cmd /k "call venv\Scripts\activate && cd backend && uvicorn main:app --host 127.0.0.1 --port 8000 --reload"

echo [2/3] Starting Node.js Report Server...
start cmd /k "cd server && node index.js"

echo [3/3] Starting React Frontend...
cd frontend
:: Open browser automatically
start http://localhost:3000
:: Run React interface with Vite (Vite uses npm run dev)
npm run dev