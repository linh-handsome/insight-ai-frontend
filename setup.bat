@echo off
echo ======================================================
echo CLASSROOM INSIGHT AI - CLEAN SETUP
echo ======================================================

echo [1/4] Cleaning old environment...
if exist venv (
    echo Deleting existing venv...
    rmdir /s /q venv
)
if exist node_modules (
    echo Deleting existing node_modules...
    rmdir /s /q node_modules
)

echo [2/4] Creating new Virtual Environment...
python -m venv venv
if %errorlevel% neq 0 (
    echo [ERROR] Python not found or failed to create venv!
    pause
    exit /b
)

echo [3/4] Installing Backend Dependencies...
call venv\Scripts\activate
python -m pip install --upgrade pip
:: Force install requirements from file
pip install -r requirements.txt

echo [4/4] Installing Frontend Dependencies...
if exist frontend (
    cd frontend
    echo Installing React dependencies...
    call npm install --legacy-peer-deps
    cd ..
) else (
    echo [SKIP] Frontend folder not found.
)

echo ======================================================
echo SETUP COMPLETED SUCCESSFULLY!
echo ======================================================
pause