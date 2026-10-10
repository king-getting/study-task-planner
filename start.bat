@echo off
title Study Planner
cd /d "%~dp0app"
echo ============================================
echo   Study Planner is starting...
echo   Browser will open automatically.
echo   Keep THIS window OPEN while using.
echo   Close this window to stop the app.
echo ============================================
timeout /t 2 /nobreak >nul
start "" http://localhost:7100
node server\index.cjs
pause
