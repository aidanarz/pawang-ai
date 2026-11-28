<#
.SYNOPSIS
  Registers a per-user Windows Task Scheduler task to auto-start the Pawang AI
  standby backend at Windows logon and auto-restart it if it crashes.

.DESCRIPTION
  Uses built-in Windows Task Scheduler (no NSSM or Administrator privileges required).
  Runs backend\scripts\start_all.ps1 under the current Windows user account 15 seconds
  after logon, with unlimited run time and automatic restart on failure.

.PARAMETER TaskName
  Scheduled Task name (default: PawangAI-Standby).
.PARAMETER Tunnel
  Tunnel mode passed to start_all.ps1: "tailscale" (default), "ngrok", or "none".
.PARAMETER NgrokDomain
  Static ngrok domain (only needed when -Tunnel ngrok).
.PARAMETER Port
  Backend port (default: 8000).
.PARAMETER StartNow
  Also start the scheduled task immediately after registering it.

.EXAMPLE
  .\backend\scripts\install_task.ps1
  .\backend\scripts\install_task.ps1 -StartNow
  .\backend\scripts\install_task.ps1 -Tunnel ngrok -NgrokDomain your-name.ngrok-free.app
#>
param(
    [string]$TaskName = "PawangAI-Standby",
    [ValidateSet("tailscale", "ngrok", "none")]
    [string]$Tunnel = "tailscale",
    [string]$NgrokDomain = "",
    [int]$Port = 8000,
    [switch]$StartNow
)

$ErrorActionPreference = "Stop"

$scriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$startScript = Join-Path $scriptDir "start_all.ps1"
if (-not (Test-Path $startScript)) {
    throw "start_all.ps1 not found at $startScript"
}

$argParts = @(
    "-NoProfile",
    "-WindowStyle", "Hidden",
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$startScript`"",
    "-Port", "$Port",
    "-Tunnel", "$Tunnel"
)
if ($Tunnel -eq "ngrok" -and -not [string]::IsNullOrWhiteSpace($NgrokDomain)) {
    $argParts += @("-NgrokDomain", "`"$NgrokDomain`"")
}
$argLine = $argParts -join " "

$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument $argLine `
    -WorkingDirectory (Split-Path -Parent $scriptDir)

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$trigger.Delay = "PT15S"

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1)

$principal = New-ScheduledTaskPrincipal `
    -UserId $env:USERNAME `
    -LogonType Interactive `
    -RunLevel Limited

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description "Pawang AI standby backend (Ollama + FastAPI live + fixed HTTPS tunnel) with crash recovery." `
    -Force | Out-Null

Write-Host "Installed Task Scheduler job '$TaskName' for user '$env:USERNAME'."
Write-Host "  Trigger : At logon (15 s delay)"
Write-Host "  Action  : powershell.exe $argLine"
Write-Host "  Restart : Up to 999 retries (1 min interval), unlimited run time"
Write-Host ""
Write-Host "Check status anytime:  .\backend\scripts\status.ps1"
Write-Host "Remove task anytime :  .\backend\scripts\uninstall_task.ps1"

if ($StartNow) {
    Write-Host "Starting task '$TaskName' now..."
    Start-ScheduledTask -TaskName $TaskName
}
