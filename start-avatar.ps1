# DEPRECATED: This script has been merged into start.ps1.
# Old behavior preserved by forwarding to start.ps1 -Avatar -UseSiblingClone
# (team workflow with sibling UE5 clone + Downloads scan).
#
# New contributors should use: .\start.ps1 -Avatar
# See start.ps1 -? for all flags.

Write-Host "start-avatar.ps1 is deprecated — forwarding to: .\start.ps1 -Avatar -UseSiblingClone @args" -ForegroundColor Yellow
& "$PSScriptRoot\start.ps1" -Avatar -UseSiblingClone @args
exit $LASTEXITCODE