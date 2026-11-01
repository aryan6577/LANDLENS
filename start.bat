@echo off
REM One-command launcher (Windows). Creates a virtual environment, installs dependencies and starts LandLens.
cd /d "%~dp0backend"
if not exist venv ( python -m venv venv )
call venv\Scripts\python -m pip install -q -r requirements.txt
echo.
echo   LandLens is starting at  http://localhost:8000
echo   (press Ctrl+C to stop)
echo.
venv\Scripts\python -m uvicorn app.main:app --port 8000
pause
