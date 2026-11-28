<#
.SYNOPSIS
  Removes the Pawang AI Windows Task Scheduler auto-start job.

.PARAMETER TaskName
  Scheduled Task name to remove (default: PawangAI-Standby).
.PARAMETER StopRunning
  Also stop the currently running backend and supervisor via stop_all.ps1.

.EXAMPLE
  .\backend\scripts\uninstall_task.ps1
  .\backend\scripts\uninstall_task.ps1 -StopRunning
#>
param(
    [string]$TaskName = "PawangAI-Standby",
    [switch]$StopRunning
)

$ErrorActionPreference = "Continue"

$scriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$stopScript = Join-Path $scriptDir "stop_all.ps1"

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed Task Scheduler job '$TaskName'."
} else {
    Write-Host "Task Scheduler job '$TaskName' is not installed."
}

if ($StopRunning -and (Test-Path $stopScript)) {
    & $stopScript
}
