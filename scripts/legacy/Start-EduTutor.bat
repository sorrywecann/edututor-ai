@echo off
REM EduTutor.AI - Windows one-click launcher
REM Double-click in Explorer.

setlocal
cd /d "%~dp0"

echo.
echo ============================================
echo       EduTutor.AI - spustam system...
echo ============================================
echo.

where docker >nul 2>&1
if errorlevel 1 (
  echo [X] Docker nie je nainstalovany
  echo     Stiahni Docker Desktop: https://www.docker.com/products/docker-desktop
  pause
  exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
  echo [!] Docker Desktop nebezi - spustam ho...
  if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
    start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
  ) else (
    echo [X] Nenasiel som Docker Desktop.exe v %ProgramFiles%\Docker\Docker\
    echo     Spusti Docker Desktop rucne a skus znova.
    pause
    exit /b 1
  )
  echo     Cakam na Docker daemon...
  set "DOCKER_OK="
  for /L %%i in (1,1,30) do (
    timeout /t 2 /nobreak >nul
    docker info >nul 2>&1 && set "DOCKER_OK=1" && goto :docker_ok
  )
  echo [X] Docker sa nespustil do 60 sekund
  pause
  exit /b 1
)
:docker_ok
echo [OK] Docker bezi

if not exist .env (
  echo [!] .env neexistuje - kopirujem z .env.example
  copy .env.example .env >nul
  echo     Tip: otvor .env a vloz OpenAI/Anthropic kluc pre cloud LLM.
)
echo [OK] .env pripravene

echo.
echo Spustam kontajnery (prve spustenie moze trvat par minut)...
docker compose up -d
if errorlevel 1 (
  echo [X] docker compose up zlyhalo
  pause
  exit /b 1
)

echo Cakam na backend...
set "BACKEND_OK="
for /L %%i in (1,1,60) do (
  curl -sf http://localhost:8000/api/v1/health/live >nul 2>&1 && set "BACKEND_OK=1" && goto :backend_ok
  timeout /t 2 /nobreak >nul
)
:backend_ok

echo.
echo ============================================
echo         EduTutor.AI je PRIPRAVENE!
echo  Frontend: http://localhost:3000
echo  Backend:  http://localhost:8000/docs
echo  Stop:     Stop-EduTutor.bat
echo ============================================
echo.
start http://localhost:3000

pause
endlocal
