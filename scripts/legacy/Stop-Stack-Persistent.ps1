#requires -Version 5.1
<#
.SYNOPSIS
  Stops the persistent EduTutor stack started by Start-Stack-Persistent.ps1.

.HOW
  Reads .stack-pids.json, finds the cmd.exe wrappers AND their child processes
  (uv -> python, pnpm -> node), and terminates the whole tree. Also kills any
  stray processes bound to :8000 / :3000 as a safety net.
#>

$ErrorActionPreference = 'Continue'

$repo = Split-Path -Parent $PSCommandPath
$pidFile = Join-Path $repo '.stack-pids.json'

function Stop-Tree {
  param([int]$RootPid)
  if (-not $RootPid) { return }
  $children = Get-CimInstance Win32_Process -Filter "ParentProcessId=$RootPid" -ErrorAction SilentlyContinue
  foreach ($c in $children) { Stop-Tree -RootPid ([int]$c.ProcessId) }
  Stop-Process -Id $RootPid -Force -ErrorAction SilentlyContinue
}

if (Test-Path $pidFile) {
  $info = Get-Content $pidFile | ConvertFrom-Json
  Write-Host "Stopping backend tree (root cmd PID = $($info.backendCmdPid)) ..."
  Stop-Tree -RootPid ([int]$info.backendCmdPid)
  if ($info.forwarderCmdPid) {
    Write-Host "Stopping IPv6 forwarder tree (root cmd PID = $($info.forwarderCmdPid)) ..."
    Stop-Tree -RootPid ([int]$info.forwarderCmdPid)
  }
  Write-Host "Stopping frontend tree (root cmd PID = $($info.frontendCmdPid)) ..."
  Stop-Tree -RootPid ([int]$info.frontendCmdPid)
  Remove-Item $pidFile -Force
} else {
  Write-Warning "No .stack-pids.json found — falling back to port-based kill."
}

# Safety net: kill anything still holding :8000 or :3000.
foreach ($port in 8000, 3000, 30000) {
  $owners = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($pp in $owners) {
    Write-Host "Killing PID $pp (still listening on :$port)"
    Stop-Process -Id $pp -Force -ErrorAction SilentlyContinue
  }
}

Start-Sleep -Seconds 1
Write-Host "Stack stopped." -ForegroundColor Green
