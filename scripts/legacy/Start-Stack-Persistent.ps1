#requires -Version 5.1
<#
.SYNOPSIS
  Launches the EduTutor backend + frontend as TRULY detached processes that survive
  this shell, this terminal, and any Claude-Code-style harness reaping its child jobs.

.WHY THIS EXISTS
  PowerShell's Start-Process keeps the spawned process in the calling shell's Windows
  Job Object. When the shell dies (or a harness terminates its background task), the
  job's children all get killed too. That's why the backend kept dying inside the
  Claude session even when "detached".

  Win32_Process::Create (WMI) bypasses the job object — the new process is created
  by the WMI service (svchost), not by the calling shell. PIDs are recorded so we
  can stop them later.

  The processes survive until you reboot or run Stop-Stack-Persistent.ps1.

.USAGE
  pwsh -ExecutionPolicy Bypass -File .\Start-Stack-Persistent.ps1
#>

$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSCommandPath
$tutor = Join-Path $repo 'tutor-service'
$core  = Join-Path $repo 'core'
$pidFile = Join-Path $repo '.stack-pids.json'

if (-not (Test-Path $tutor)) { throw "tutor-service not found at $tutor" }
if (-not (Test-Path $core))  { throw "core not found at $core" }

# Resolve uv + pnpm full paths — Win32_Process::Create needs them, no PATH search.
$uv   = (Get-Command uv -ErrorAction Stop).Source
$pnpm = (Get-Command pnpm -ErrorAction Stop).Source

$beLog = Join-Path $tutor 'backend-stack.log'
$feLog = Join-Path $core  'frontend-stack.log'

function Start-Detached {
  param([string]$Cmd, [string]$Cwd, [string]$LogPath)
  # cmd.exe /c "cd /d <cwd> && (<cmd>) >log 2>&1" lets us redirect AND set cwd.
  $wrapped = "cmd.exe /c `"cd /d `"$Cwd`" && ($Cmd) >`"$LogPath`" 2>&1`""
  $r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $wrapped }
  if ($r.ReturnValue -ne 0) { throw "Win32_Process Create failed: ReturnValue=$($r.ReturnValue)" }
  return [int]$r.ProcessId
}

Write-Host "Starting backend (uv run python run_dev.py) ..."
$bePid = Start-Detached -Cmd "`"$uv`" run python run_dev.py" -Cwd $tutor -LogPath $beLog
Write-Host "  cmd.exe PID = $bePid"

# IPv6 -> IPv4 forwarder. Without this, UE5's WebSocket plugin can't reach the
# backend: Windows resolves `localhost` to ::1 first, UE5 connects to [::1]:8000,
# backend binds only 0.0.0.0 (IPv4), UE5 has no fallback -> "connect failed".
# Forwarder listens on [::1]:8000, pipes to 127.0.0.1:8000. Backend untouched.
$fwLog = Join-Path $tutor 'ipv6-forwarder-stack.log'
Write-Host "Starting IPv6 forwarder ([::1]:8000 -> 127.0.0.1:8000) ..."
$fwPid = Start-Detached -Cmd "`"$uv`" run python ipv6_forwarder.py" -Cwd $tutor -LogPath $fwLog
Write-Host "  cmd.exe PID = $fwPid"

Write-Host "Starting frontend (pnpm dev) ..."
$fePid = Start-Detached -Cmd "`"$pnpm`" dev" -Cwd $core -LogPath $feLog
Write-Host "  cmd.exe PID = $fePid"

# Wait for backend HTTP to come up (loads embedding + Whisper + OmniVoice — ~60s first run).
Write-Host -NoNewline "Waiting for backend on :8000 "
$ok = $false
for ($i = 0; $i -lt 90; $i++) {
  try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8000/' -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
    if ($r.StatusCode -eq 200) { $ok = $true; break }
  } catch {}
  Start-Sleep -Seconds 2
  Write-Host -NoNewline "."
}
Write-Host ""
if (-not $ok) { Write-Warning "Backend did not respond after 180s. Check $beLog." }
else          { Write-Host "Backend ready." -ForegroundColor Green }

# Wait for frontend.
Write-Host -NoNewline "Waiting for frontend on :3000 "
$ok = $false
for ($i = 0; $i -lt 30; $i++) {
  try {
    $r = Invoke-WebRequest -Uri 'http://localhost:3000/' -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
    if ($r.StatusCode -eq 200) { $ok = $true; break }
  } catch {}
  Start-Sleep -Seconds 2
  Write-Host -NoNewline "."
}
Write-Host ""
if (-not $ok) { Write-Warning "Frontend did not respond after 60s. Check $feLog." }
else          { Write-Host "Frontend ready." -ForegroundColor Green }

# Save PIDs of the cmd.exe wrappers so the stop script can kill the whole tree.
@{ backendCmdPid = $bePid; frontendCmdPid = $fePid; forwarderCmdPid = $fwPid; startedAt = (Get-Date).ToString('o') } |
  ConvertTo-Json | Set-Content -Path $pidFile -Encoding utf8
Write-Host "PIDs recorded -> $pidFile"

Write-Host ""
Write-Host "Backend log  : $beLog"
Write-Host "Frontend log : $feLog"
Write-Host "Stop with    : .\Stop-Stack-Persistent.ps1"
Write-Host "Webapp       : http://localhost:3000"
Write-Host "API docs     : http://127.0.0.1:8000/docs"
