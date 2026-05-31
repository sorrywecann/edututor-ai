# EduTutor.AI — portable web-stack launcher (Windows, native, no Docker)
#
# Starts the two services that make the web app work:
#   1. Backend   — tutor-service FastAPI on :8000  (Python 3.11 via uv)
#   2. Frontend  — Next.js dev server on :3000      (npm)
#
# The MetaHuman avatar (UE5) is OPTIONAL and separate — in dev the frontend
# falls back to a browser avatar. To add the real UE5 avatar later, see
# docs/WINDOWS_NATIVE_SETUP.md  →  "Adding the UE5 MetaHuman avatar".
#
# Unlike Start-EduTutor-Dev.ps1 (which is hardcoded to one machine + UE5),
# this script is path-agnostic: it runs from wherever the repo lives.
#
# Usage:   .\Start-EduTutor-Web.ps1        Stop:   .\Stop-EduTutor-Web.ps1

$ErrorActionPreference = "Stop"
$Root  = $PSScriptRoot
$Ts    = Join-Path $Root "tutor-service"
$Core  = Join-Path $Root "core"
$Venv  = Join-Path $Ts ".venv"
$VenvPy = Join-Path $Venv "Scripts\python.exe"

# Pick up tools installed this session (uv, ollama) without a shell restart.
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' +
            [Environment]::GetEnvironmentVariable('Path','User')

function Test-Port($port) {
    $null -ne (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
}
function Wait-Port($port, $label, $timeoutSec = 120) {
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (Test-Port $port) { Write-Host "[OK] $label on :$port"; return $true }
        Start-Sleep -Seconds 1
    }
    Write-Host "[WARN] $label did not bind :$port within ${timeoutSec}s (check its window)"
    return $false
}
function Find-Exe([string[]]$candidates, [string]$name) {
    foreach ($p in $candidates) { if ($p -and (Test-Path $p)) { return $p } }
    $c = Get-Command $name -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
    return $null
}

Write-Host "================================================"
Write-Host "  EduTutor.AI - web stack (backend + frontend)"
Write-Host "================================================`n"

# --- 0. Ollama (local LLM) ---------------------------------------------
$ollama = Find-Exe @("$env:LOCALAPPDATA\Programs\Ollama\ollama.exe",
                     "$env:ProgramFiles\Ollama\ollama.exe") "ollama"
if ($ollama) {
    if (-not (Test-Port 11434)) {
        Write-Host "Starting Ollama service..."
        Start-Process $ollama -ArgumentList "serve" -WindowStyle Hidden
        Wait-Port 11434 "Ollama" 20 | Out-Null
    } else { Write-Host "[OK] Ollama already running on :11434" }
    $models = & $ollama list 2>$null
    if ($models -notmatch "qwen2.5:7b|gemma3|llama") {
        Write-Host "[NOTE] No common model found. Pull one, e.g.:  ollama pull qwen2.5:7b"
    }
} else {
    Write-Host "[NOTE] Ollama not installed. Install from https://ollama.com/download"
    Write-Host "       or set a cloud key (OPENAI_API_KEY/ANTHROPIC_API_KEY/GROQ_API_KEY) in tutor-service\.env"
}

# --- 1. Backend env (uv preferred, fetches Python 3.11) -----------------
if (-not (Test-Path $VenvPy)) {
    Write-Host "`nBackend venv missing - building it (first run, a few minutes)..."
    $uv = Find-Exe @("$env:USERPROFILE\.local\bin\uv.exe") "uv"
    if ($uv) {
        & $uv venv --python 3.11 $Venv
        & $uv pip install --python $VenvPy -r (Join-Path $Ts "requirements.txt")
    } else {
        Write-Host "[NOTE] uv not found; falling back to system Python (must be 3.11+)."
        & py -3.11 -m venv $Venv 2>$null
        if (-not (Test-Path $VenvPy)) { & python -m venv $Venv }
        & $VenvPy -m pip install --upgrade pip
        & $VenvPy -m pip install -r (Join-Path $Ts "requirements.txt")
    }
}
if (-not (Test-Path (Join-Path $Ts ".env"))) {
    Copy-Item (Join-Path $Root ".env.example") (Join-Path $Ts ".env")
    Write-Host "[NOTE] Created tutor-service\.env from .env.example (configure LLM if needed)."
}

# --- 2. Backend ---------------------------------------------------------
if (Test-Port 8000) {
    Write-Host "[OK] Backend already running on :8000"
} else {
    Write-Host "Starting backend (tutor-service)..."
    Start-Process powershell -ArgumentList "-NoExit","-Command",
        "Set-Location `"$Ts`"; & `"$VenvPy`" run_dev.py" -WindowStyle Normal
    Wait-Port 8000 "Backend" 180 | Out-Null
}

# --- 3. Frontend --------------------------------------------------------
if (-not (Test-Path (Join-Path $Core "node_modules"))) {
    Write-Host "Installing frontend deps (first run)..."
    Start-Process -Wait npm -ArgumentList "install","--prefix","`"$Core`"","--legacy-peer-deps" -NoNewWindow
}
if (Test-Port 3000) {
    Write-Host "[OK] Frontend already running on :3000"
} else {
    Write-Host "Starting frontend (Next.js dev)..."
    Start-Process powershell -ArgumentList "-NoExit","-Command",
        "Set-Location `"$Core`"; npm run dev" -WindowStyle Normal
    Wait-Port 3000 "Frontend" 120 | Out-Null
}

Write-Host "`n================================================"
Write-Host "  EduTutor.AI web stack is READY"
Write-Host ""
Write-Host "  Frontend:  http://localhost:3000"
Write-Host "  Backend:   http://localhost:8000/docs"
Write-Host "  Health:    http://localhost:8000/api/v1/health"
Write-Host ""
Write-Host "  Stop:      .\Stop-EduTutor-Web.ps1"
Write-Host "================================================"
Start-Process "http://localhost:3000"
