@echo off
title Tanzim Backend Debugpy (Port 5678)
echo =======================================================
echo  Starting Tanzim FastAPI with Debugpy on port 5678...
echo  Attach your VS Code or IDE debugger to port 5678.
echo =======================================================
cd /d "%~dp0\.."
backend\.venv\Scripts\python.exe -m debugpy --listen 127.0.0.1:5678 -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 --app-dir backend
pause
