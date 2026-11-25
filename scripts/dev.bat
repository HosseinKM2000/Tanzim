@echo off
title Tanzim Full Stack Development Server
echo =======================================================
echo  Tanzim Full Stack Development
echo  Frontend: http://localhost:5173
echo  Backend:  http://127.0.0.1:8000/docs
echo =======================================================
cd /d "%~dp0\.."
node scripts/dev-runner.mjs
pause
