# EduTutor.AI — UE5 MetaHuman avatar launcher (Windows)
#
# For the ALL-IN-ONE branch (Edutor_UnrealEngine), where EdutorUE/ sits next to
# core/ and tutor-service/. Brings up the avatar half of the stack:
#   1. Pixel Streaming signalling server (:80 player + :8888 streamer)
#   2. UE5 SlovakEdu game, streaming + connected to the backend avatar WS
#   3. Ensures core/.env.local points the frontend at the stream
#
# Run the web stack first (Start-EduTutor-Web.ps1), then this. See
# docs/FULL_STACK_SETUP.md for the full explanation.
#
# Usage:  .\Start-EduTutor-Avatar.ps1

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$UE   = Join-Path $Root "EdutorUE"
$Proj = Join-Path $UE "SlovakEdu.uproject"
$Core = Join-Path $Root "core"

function Test-Port($port) {
    $null -ne (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
}

if (-not (Test-Path $Proj)) {
    Write-Host "[X] EdutorUE\SlovakEdu.uproject not found at $Proj"
    Write-Host "    This launcher is for the all-in-one 'Edutor_UnrealEngine' branch."
    Write-Host "    On 'main', get the UE project with:"
    Write-Host "      git worktree add --track -b Edutor_UnrealEngine ..\edotutor-ue origin/Edutor_UnrealEngine"
    exit 1
}

# Locate UnrealEditor 5.7 (fall back to any installed UE_5.x).
$ue57 = "C:\Program Files\Epic Games\UE_5.7\Engine\Binaries\Win64\UnrealEditor.exe"
$UnrealEditor = $null
if (Test-Path $ue57) { $UnrealEditor = $ue57 }
else {
    foreach ($base in 'C:\Program Files\Epic Games','D:\Program Files\Epic Games') {
        if (Test-Path $base) {
            Get-ChildItem $base -Directory -EA SilentlyContinue | Where-Object {$_.Name -match '^UE_5\.'} |
                Sort-Object Name -Descending | ForEach-Object {
                    $cand = Join-Path $_.FullName 'Engine\Binaries\Win64\UnrealEditor.exe'
                    if (-not $UnrealEditor -and (Test-Path $cand)) { $UnrealEditor = $cand }
                }
        }
    }
}
if (-not $UnrealEditor) { Write-Host "[X] UnrealEditor.exe not found. Install Unreal Engine 5.7 via the Epic Games Launcher."; exit 1 }
Write-Host "[OK] Unreal Editor: $UnrealEditor"

# 1. Signalling server (skip if something already serves :8888 — e.g. UE editor's embedded one)
if (Test-Port 8888) {
    Write-Host "[OK] Signalling already up on :8888 (using existing)"
} else {
    Write-Host "Starting Pixel Streaming signalling (first run builds it, a few minutes)..."
    Start-Process cmd -ArgumentList "/c","`"$UE\RunPixelStreamingServer.bat`" < NUL" -WorkingDirectory $UE
    $deadline = (Get-Date).AddSeconds(420)
    while ((Get-Date) -lt $deadline -and -not (Test-Port 8888)) { Start-Sleep -Seconds 3 }
    if (Test-Port 8888) { Write-Host "[OK] Signalling on :8888 (+ player on :80)" }
    else { Write-Host "[WARN] Signalling didn't bind :8888 — check its window before launching UE" }
}

# 2. Frontend env so the iframe shows the stream
$envLocal = Join-Path $Core ".env.local"
$need = "NEXT_PUBLIC_UE5_STREAM_URL=http://127.0.0.1:80"
if (-not (Test-Path $envLocal) -or -not (Select-String -Path $envLocal -Pattern 'NEXT_PUBLIC_UE5_STREAM_URL' -Quiet)) {
    Add-Content -Path $envLocal -Value "`n$need"
    Write-Host "[NOTE] Added $need to core\.env.local — RESTART 'npm run dev' to pick it up."
} else {
    Write-Host "[OK] core\.env.local already points at the stream"
}

# 3. Launch the UE game as a streamer
Write-Host "Launching SlovakEdu (-game, Pixel Streaming -> ws://127.0.0.1:8888)..."
Start-Process $UnrealEditor -ArgumentList `
    "`"$Proj`"", "-game", "-PixelStreamingURL=ws://127.0.0.1:8888", `
    "-windowed", "-ResX=1280", "-ResY=720", "-AudioMixer", `
    "-ExecCmds=DisableAllScreenMessages"

Write-Host "`n================================================"
Write-Host "  Avatar launching. First cold launch compiles shaders (can be long)."
Write-Host "  When ready, the MetaHuman shows at http://localhost:3000"
Write-Host "  Verify:  curl http://localhost:8000/api/v1/avatar/status  -> clients:1"
Write-Host "  If the avatar is black, hard-refresh the page (Ctrl+Shift+R)."
Write-Host "================================================"
