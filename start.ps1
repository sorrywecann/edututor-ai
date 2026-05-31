<#
.SYNOPSIS
    EduTutor.AI dev-mode launcher.
.DESCRIPTION
    Default: starts backend + frontend (web-only chat).
    -Avatar: also starts Wilbur + UE5 (MetaHuman avatar streaming).
.PARAMETER Avatar
    Launch full avatar stack. Downloads ~1.77 GB Wilbur + UE5 on first run
    to %LOCALAPPDATA%\edututor\avatar\ unless -SkipDownload or -UseSiblingClone.
.PARAMETER UseSiblingClone
    Use ..\edotutor-ue5-latest sibling clone for Wilbur + Downloads\Edutor*\ for
    UE5 (team workflow, no download needed).
.PARAMETER SkipDownload
    Skip avatar asset download (use existing cache only).
.EXAMPLE
    .\start.ps1                          # web-only
    .\start.ps1 -Avatar                  # full stack with auto-download
    .\start.ps1 -Avatar -UseSiblingClone # team workflow
#>

param(
    [switch]$Avatar,
    [switch]$SkipDownload,
    [switch]$UseSiblingClone,
    [switch]$NoOllama,
    [switch]$NoBrowser
)

# EduTutor.AI - portable dev launcher (Windows)
#
# Default mode starts the two services needed for the web experience:
#
#   1. Backend  - tutor-service FastAPI on :8000 (uv python + run_dev.py)
#   2. Frontend - Next.js dev server on :3000 (pnpm dev)
#
# With -Avatar, also starts:
#
#   3. Wilbur   - Pixel Streaming signalling on :8888 + HTTP on :80
#   4. UE5      - SlovakEdu.exe MetaHuman avatar (offscreen render)
#
# This launcher is portable: it uses $PSScriptRoot to locate the repo,
# so it works for anyone who clones edututor-ai anywhere on disk.

#requires -Version 5.1
$ErrorActionPreference = "Stop"

# --- Paths (portable: derived from this script's location) --------------
$Root         = $PSScriptRoot
$TutorService = Join-Path $Root "tutor-service"
$Core         = Join-Path $Root "core"

if (-not (Test-Path $TutorService)) {
    Write-Host "[X] tutor-service not found at: $TutorService" -ForegroundColor Red
    Write-Host "    Run this script from the edututor-ai repo root."
    exit 1
}
if (-not (Test-Path $Core)) {
    Write-Host "[X] core (frontend) not found at: $Core" -ForegroundColor Red
    Write-Host "    Run this script from the edututor-ai repo root."
    exit 1
}

# --- Helpers ------------------------------------------------------------
function Test-Port($port) {
    $null -ne (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
}

function Wait-Port($port, $label, $timeoutSec = 60) {
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (Test-Port $port) {
            Write-Host "[OK] $label listening on :$port" -ForegroundColor Green
            return $true
        }
        Start-Sleep -Seconds 1
    }
    Write-Host "[WARN] $label did not bind :$port within ${timeoutSec}s" -ForegroundColor Yellow
    return $false
}

function Test-Command($name) {
    $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

function Find-NewestUE5Build {
    # Scan ~/Downloads for newest Edutor*\Windows\SlovakEdu.exe (team workflow).
    $downloads = Join-Path "C:\Users\$env:USERNAME" "Downloads"
    if (-not (Test-Path $downloads)) { return $null }
    $candidates = Get-ChildItem -Path $downloads -Directory -Filter "Edutor*" -ErrorAction SilentlyContinue |
        ForEach-Object {
            $exe = Join-Path $_.FullName "Windows\SlovakEdu.exe"
            if (Test-Path $exe) {
                [PSCustomObject]@{ Path = $exe; LastWriteTime = (Get-Item $exe).LastWriteTime }
            }
        }
    if (-not $candidates) { return $null }
    return ($candidates | Sort-Object LastWriteTime -Descending | Select-Object -First 1).Path
}

# --- Banner -------------------------------------------------------------
$modeLabel = if ($Avatar) { "backend + frontend + avatar" } else { "backend + frontend" }
Write-Host "================================================"
Write-Host " EduTutor.AI - dev mode ($modeLabel)"
Write-Host "================================================"
Write-Host ""
Write-Host "Repo root: $Root"
Write-Host ""

# --- 1. Backend ---------------------------------------------------------
if (Test-Port 8000) {
    Write-Host "[OK] Backend already running on :8000" -ForegroundColor Green
} else {
    # Prefer uv; fall back to system python.
    $backendCmd = $null
    $pyCmd = $null
    if (Test-Command "uv") {
        $backendCmd = "uv run python run_dev.py"
        $pyCmd = "uv"
    } elseif (Test-Command "python") {
        Write-Host "[WARN] uv not found - falling back to system python." -ForegroundColor Yellow
        Write-Host "       For reproducible deps install uv: winget install astral-sh.uv"
        $backendCmd = "python run_dev.py"
        $pyCmd = "python"
    } else {
        Write-Host "[X] Neither 'uv' nor 'python' is on PATH." -ForegroundColor Red
        Write-Host "    Install uv:     winget install astral-sh.uv"
        Write-Host "    Or install Python 3.11+: winget install Python.Python.3.11"
        exit 1
    }

    # Python 3.11+ version check (matches start.sh preflight)
    try {
        if ($pyCmd -eq "uv") {
            $pyVer = & uv run python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
        } else {
            $pyVer = & python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
        }
        $pyVer = $pyVer.Trim()
        $major, $minor = $pyVer.Split('.')
        if ([int]$major -lt 3 -or ([int]$major -eq 3 -and [int]$minor -lt 11)) {
            Write-Host "[ERROR] Python 3.11+ required (found $pyVer)." -ForegroundColor Red
            Write-Host "        Install: winget install Python.Python.3.11" -ForegroundColor Yellow
            exit 1
        }
        Write-Host "[OK] Python $pyVer detected" -ForegroundColor Green
    } catch {
        Write-Host "[ERROR] Failed to determine Python version: $_" -ForegroundColor Red
        exit 1
    }

    Write-Host "Starting backend (tutor-service): $backendCmd"
    Start-Process powershell -ArgumentList "-NoExit","-Command","cd `"$TutorService`"; $backendCmd" -WindowStyle Normal
    if (-not (Wait-Port 8000 "Backend" 60)) {
        Write-Host ""
        Write-Host "[X] Backend failed to start within 60s." -ForegroundColor Red
        Write-Host "    Check the new PowerShell window for errors."
        Write-Host "    Common causes:"
        Write-Host "      - First-run model downloads (Whisper/embedding) take >60s on cold cache"
        Write-Host "      - Missing tutor-service/.env (copy from .env.example)"
        Write-Host "      - Port 8000 blocked by another process"
        exit 1
    }
}

# --- 2. Frontend --------------------------------------------------------
if (Test-Port 3000) {
    Write-Host "[OK] Frontend already running on :3000" -ForegroundColor Green
} else {
    if (-not (Test-Command "pnpm")) {
        Write-Host "[X] pnpm not found on PATH." -ForegroundColor Red
        Write-Host "    Install:  npm install -g pnpm"
        Write-Host "    Or:       winget install pnpm.pnpm"
        exit 1
    }

    Write-Host "Starting frontend (Next.js dev): pnpm dev"
    Start-Process powershell -ArgumentList "-NoExit","-Command","cd `"$Core`"; pnpm dev" -WindowStyle Normal
    if (-not (Wait-Port 3000 "Frontend" 60)) {
        Write-Host ""
        Write-Host "[X] Frontend failed to start within 60s." -ForegroundColor Red
        Write-Host "    Check the new PowerShell window for errors."
        Write-Host "    Common causes:"
        Write-Host "      - First run needs 'pnpm install' in core/"
        Write-Host "      - Frontend typically works without core/.env.local (uses defaults). Check core/.next for build errors and pnpm install completed."
        exit 1
    }
}

# --- 3. Avatar (Wilbur + UE5) -------------------------------------------
$wilburStarted = $false
$ue5Started    = $false
$wilburDir     = $null
$ue5Exe        = $null

if ($Avatar) {
    Write-Host ""
    Write-Host "--- Avatar mode: resolving Wilbur + UE5 ---" -ForegroundColor Cyan

    # a) Resolve Wilbur source
    if ($UseSiblingClone) {
        $wilburDir = Join-Path $PSScriptRoot "..\edotutor-ue5-latest\EdutorUE\PixelStreaming\SignallingWebServer"
    } else {
        $wilburDir = Join-Path $env:LOCALAPPDATA "edututor\avatar\wilbur"
    }
    $wilburBundle = Join-Path $wilburDir "wilbur.bundle.cjs"

    if (-not (Test-Path $wilburBundle)) {
        if (-not $UseSiblingClone -and -not $SkipDownload) {
            $fetchScript = Join-Path $PSScriptRoot "scripts\fetch-avatar-assets.ps1"
            if (Test-Path $fetchScript) {
                Write-Host "[..] Fetching avatar assets via $fetchScript" -ForegroundColor Yellow
                & $fetchScript -WilburOnly:$false
            } else {
                Write-Host "[X] Avatar fetch script not found: $fetchScript" -ForegroundColor Red
                Write-Host "    Cannot auto-download Wilbur. Provide -UseSiblingClone or install assets manually."
                exit 1
            }
        }
    }

    if (-not (Test-Path $wilburBundle)) {
        Write-Host "[X] Wilbur not found at: $wilburBundle" -ForegroundColor Red
        if ($UseSiblingClone) {
            Write-Host "    Expected sibling clone at: $wilburDir"
            Write-Host "    Run: git clone <repo> ../edotutor-ue5-latest"
        } elseif ($SkipDownload) {
            Write-Host "    -SkipDownload set, but cache is empty. Remove -SkipDownload to fetch."
        } else {
            Write-Host "    Auto-download did not produce wilbur.bundle.cjs."
            Write-Host "    Check scripts\fetch-avatar-assets.ps1 output."
        }
        exit 1
    }
    Write-Host "[OK] Wilbur source: $wilburDir" -ForegroundColor Green

    # b) Resolve UE5 source
    if ($UseSiblingClone) {
        $ue5Exe = Find-NewestUE5Build
        if (-not $ue5Exe) {
            Write-Host "[X] No SlovakEdu.exe found under C:\Users\$env:USERNAME\Downloads\Edutor*\Windows\" -ForegroundColor Red
            Write-Host "    Download the latest UE5 build from the team share into Downloads\."
            exit 1
        }
    } else {
        $ue5Exe = Join-Path $env:LOCALAPPDATA "edututor\avatar\ue5\SlovakEdu.exe"
    }

    if (-not (Test-Path $ue5Exe)) {
        Write-Host "[X] UE5 build not found at: $ue5Exe" -ForegroundColor Red
        if ($UseSiblingClone) {
            Write-Host "    Place a cooked Windows build under Downloads\Edutor*\Windows\SlovakEdu.exe"
        } elseif ($SkipDownload) {
            Write-Host "    -SkipDownload set, but cache is empty. Remove -SkipDownload to fetch."
        } else {
            Write-Host "    Auto-download did not produce SlovakEdu.exe."
            Write-Host "    Check scripts\fetch-avatar-assets.ps1 output."
        }
        exit 1
    }
    Write-Host "[OK] UE5 build:     $ue5Exe" -ForegroundColor Green

    # c) Start Wilbur
    if (Test-Port 8888) {
        Write-Host "[OK] Wilbur already running on :8888" -ForegroundColor Green
    } else {
        Write-Host "Starting Wilbur signalling: node wilbur.bundle.cjs"
        $wilburHttpRoot = Join-Path $wilburDir "www"
        Start-Process powershell -ArgumentList "-NoExit","-Command","cd `"$wilburDir`"; node ./wilbur.bundle.cjs --serve --console_messages verbose --http_root='$wilburHttpRoot'" -WindowStyle Normal
        if (-not (Wait-Port 8888 "Wilbur signalling" 30)) {
            Write-Host "[X] Wilbur did not bind :8888 within 30s." -ForegroundColor Red
            Write-Host "    Check the new PowerShell window for errors."
            exit 1
        }
        Wait-Port 80 "Wilbur HTTP" 15 | Out-Null
        $wilburStarted = $true
    }

    # d) Start UE5
    $ue5Proc = Get-Process SlovakEdu -ErrorAction SilentlyContinue
    if ($ue5Proc) {
        Write-Host "[OK] UE5 (SlovakEdu) already running (PID $($ue5Proc.Id))" -ForegroundColor Green
    } else {
        Write-Host "Starting UE5: $ue5Exe"
        $ue5Args = @(
            '-PixelStreamingURL=ws://127.0.0.1:8888',
            '-RenderOffscreen',
            '-ForceRes',
            '-ResX=1920',
            '-ResY=1080',
            '-AudioMixer',
            '-ExecCmds=r.BloomQuality 0, r.DepthOfFieldQuality 0, r.MotionBlurQuality 0, DisableAllScreenMessages, PixelStreaming.Encoder.MaxQP 18, PixelStreaming.WebRTC.MaxBitrate 100000000, PixelStreaming.WebRTC.Fps 60'
        )
        Start-Process $ue5Exe -ArgumentList $ue5Args
        Start-Sleep -Seconds 3
        $ue5Started = $true
    }
}

# --- Done ---------------------------------------------------------------
Write-Host ""
Write-Host "================================================"
Write-Host "  EduTutor.AI is READY" -ForegroundColor Green
Write-Host ""
Write-Host "  Frontend:  http://localhost:3000"
Write-Host "  Backend:   http://localhost:8000/docs"
if ($Avatar) {
    Write-Host "  Wilbur:    http://localhost:80  (signalling ws://127.0.0.1:8888)"
    Write-Host "  UE5:       SlovakEdu.exe (offscreen render, streaming to Wilbur)"
} else {
    Write-Host ""
    Write-Host "  Avatar mode: rerun with -Avatar to launch Wilbur + UE5"
}
Write-Host "================================================"

# Open the app in the default browser (best-effort; harmless if it fails).
if (-not $NoBrowser) {
    try { Start-Process "http://localhost:3000" } catch { }
}
