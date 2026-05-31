# EduTutor.AI — Live State Monitor
#
# Rolls every 2s. Press Ctrl+C to stop.
#
# Shows:
#  - All EduTutor-related processes (PIDs, memory, start time)
#  - Listening on critical ports 3000 / 8000 / 8888 / 80 / 11434 / 30000
#  - Last 4 lines of launcher.log + backend.log + ue5.log
#  - HTTP health probe of /api/v1/health and /api/v1/avatar/status

$logDir = "$env:APPDATA\edututor-desktop\logs"
$ports  = @(3000, 8000, 8888, 80, 11434, 30000)
$ports2name = @{
  3000  = 'frontend'
  8000  = 'backend'
  8888  = 'wilbur-sig'
  80    = 'wilbur-web'
  11434 = 'ollama'
  30000 = 'ue5-stream'
}

function GetLastLines($path, $n) {
  if (Test-Path $path) {
    try { Get-Content $path -Tail $n -EA SilentlyContinue }
    catch { "(locked or unreadable)" }
  } else { "(no log yet)" }
}

function HttpProbe($url) {
  try {
    $resp = Invoke-WebRequest -Uri $url -TimeoutSec 3 -UseBasicParsing -EA Stop
    return "[$($resp.StatusCode)] $($resp.Content.Substring(0, [Math]::Min(120, $resp.Content.Length)))"
  } catch {
    return "FAIL ($($_.Exception.Message))"
  }
}

Write-Host "EduTutor.AI live monitor — Ctrl+C to stop" -ForegroundColor Cyan
Write-Host "Log dir: $logDir" -ForegroundColor DarkGray
Write-Host ""

while ($true) {
  Clear-Host
  Write-Host "EduTutor.AI live monitor  ·  $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor Cyan
  Write-Host ("=" * 100) -ForegroundColor DarkGray

  # 1) Processes
  Write-Host "`n▸ EduTutor processes" -ForegroundColor Yellow
  $procs = Get-Process -EA SilentlyContinue | Where-Object {
    $_.Name -match 'EduTutor|SlovakEdu|wilbur|ipv6_forwarder' -or
    ($_.Name -eq 'python' -and $_.Path -match 'EduTutor') -or
    ($_.Name -eq 'ollama')
  } | Sort-Object Name
  if ($procs) {
    $procs | ForEach-Object {
      $mem = [Math]::Round($_.WorkingSet64 / 1MB, 1)
      $cpu = if ($_.CPU) { [Math]::Round($_.CPU, 1) } else { 0 }
      "  {0,-22} PID={1,-6} MEM={2,5} MB  CPU={3,5}s" -f $_.Name, $_.Id, $mem, $cpu
    }
  } else {
    Write-Host "  (none running)" -ForegroundColor DarkGray
  }

  # 2) Ports
  Write-Host "`n▸ Listening ports" -ForegroundColor Yellow
  foreach ($p in $ports) {
    $c = Get-NetTCPConnection -LocalPort $p -State Listen -EA SilentlyContinue
    $label = $ports2name[$p]
    if ($c) {
      $pid = $c[0].OwningProcess
      $proc = Get-Process -Id $pid -EA SilentlyContinue
      $name = if ($proc) { $proc.Name } else { '?' }
      Write-Host ("  :{0,-5} {1,-12} PID={2,-6} → {3}" -f $p, $label, $pid, $name) -ForegroundColor Green
    } else {
      Write-Host ("  :{0,-5} {1,-12} idle" -f $p, $label) -ForegroundColor DarkGray
    }
  }

  # 3) HTTP probes
  Write-Host "`n▸ HTTP probes" -ForegroundColor Yellow
  Write-Host ("  /api/v1/health      → " + (HttpProbe "http://127.0.0.1:8000/api/v1/health"))
  Write-Host ("  /api/v1/avatar/status→ " + (HttpProbe "http://127.0.0.1:8000/api/v1/avatar/status"))
  Write-Host ("  frontend (3000)     → " + (HttpProbe "http://127.0.0.1:3000"))

  # 4) Log tails (4 lines each)
  Write-Host "`n▸ launcher.log (last 4)" -ForegroundColor Yellow
  GetLastLines "$logDir\launcher.log" 4 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }

  Write-Host "`n▸ backend.log (last 4)" -ForegroundColor Yellow
  GetLastLines "$logDir\backend.log" 4 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }

  Write-Host "`n▸ ue5.log (last 4)" -ForegroundColor Yellow
  GetLastLines "$logDir\ue5.log" 4 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }

  Start-Sleep -Seconds 2
}
