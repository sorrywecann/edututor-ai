@echo off
REM EduTutor.AI - Windows stop launcher
cd /d "%~dp0"

echo.
echo Zastavujem EduTutor.AI kontajnery...
docker compose down
echo [OK] Zastavene.
echo.
pause
