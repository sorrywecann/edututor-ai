@echo off
REM Double-clickable wrapper for Stop-EduTutor-Dev.ps1
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0Stop-EduTutor-Dev.ps1"
pause
