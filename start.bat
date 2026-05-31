@echo off
REM Double-clickable wrapper for start.ps1
setlocal
cd /d "%~dp0"

REM --- Locate PowerShell --------------------------------------------------
set "PS_EXE="
where powershell.exe >nul 2>&1
if %ERRORLEVEL%==0 (
    set "PS_EXE=powershell.exe"
) else (
    where pwsh.exe >nul 2>&1
    if %ERRORLEVEL%==0 (
        set "PS_EXE=pwsh.exe"
    )
)

if "%PS_EXE%"=="" (
    echo ERROR: PowerShell is not available on this system.
    echo Install Windows PowerShell 5.1 (built into Windows 10/11) or PowerShell 7+:
    echo   https://aka.ms/powershell
    echo.
    pause
    exit /b 1
)

REM --- Verify the launcher script exists ---------------------------------
if not exist "%~dp0start.ps1" (
    echo ERROR: start.ps1 not found next to start.bat.
    echo Expected at: %~dp0start.ps1
    echo.
    pause
    exit /b 1
)

REM --- Verify Python 3.11+ before launching ------------------------------
where python >nul 2>&1 || (
  echo [ERROR] Python not found on PATH.
  echo Install: winget install Python.Python.3.11
  echo Then close+reopen terminal so PATH updates.
  pause
  exit /b 1
)
for /f "tokens=2" %%V in ('python --version 2^>^&1') do set PYVER=%%V
for /f "tokens=1,2 delims=." %%a in ("%PYVER%") do (set PYMAJOR=%%a& set PYMINOR=%%b)
if %PYMAJOR% LSS 3 (goto :badpython)
if %PYMAJOR% EQU 3 if %PYMINOR% LSS 11 (goto :badpython)
goto :pythonok

:badpython
echo [ERROR] Python 3.11+ required, found %PYVER%
echo Install: winget install Python.Python.3.11
pause
exit /b 1

:pythonok

REM --- Invoke the launcher with safe flags -------------------------------
"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
set "RC=%ERRORLEVEL%"

if not "%RC%"=="0" (
    echo.
    echo start.ps1 exited with code %RC%.
    pause
)

endlocal & exit /b %RC%
