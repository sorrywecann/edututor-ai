# EduTutor.AI - native dev-mode stopper (Windows)
# Stops backend, frontend, Wilbur, and UE5 SlovakEdu.exe.

$ErrorActionPreference = "SilentlyContinue"

Write-Host "Stopping EduTutor.AI dev stack..."

# UE5
Get-Process SlovakEdu -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "  - SlovakEdu PID $($_.Id)"
    Stop-Process -Id $_.Id -Force
}

# Frontend, backend, Wilbur - identified by listening port
$portMap = @{
    3000 = "Frontend (Next.js)"
    8000 = "Backend (tutor-service)"
    8888 = "Wilbur signalling"
    80   = "Wilbur HTTP"
}

foreach ($port in $portMap.Keys) {
    $conn = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    if ($conn) {
        $pids = $conn.OwningProcess | Sort-Object -Unique
        foreach ($targetPid in $pids) {
            $proc = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Host "  - $($portMap[$port]) PID $targetPid ($($proc.ProcessName))"
                Stop-Process -Id $targetPid -Force
            }
        }
    }
}

# Also nuke orphaned node windows used by `npm run dev` / Wilbur (cmd.exe parents)
Get-Process cmd -ErrorAction SilentlyContinue | ForEach-Object {
    $cmdLine = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)" -ErrorAction SilentlyContinue).CommandLine
    if ($cmdLine -match "next dev|wilbur|SignallingWebServer") {
        Write-Host "  - orphan cmd PID $($_.Id)"
        Stop-Process -Id $_.Id -Force
    }
}

Write-Host "[OK] EduTutor.AI dev stack stopped."
