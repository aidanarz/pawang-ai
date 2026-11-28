<#
.SYNOPSIS
  Stops the Pawang AI standby supervisor, FastAPI backend (uvicorn), and tunnel.

.DESCRIPTION
  Reads recorded PIDs from backend\logs\standby.pids.json and stops them cleanly:
    1. Standby supervisor (start_all.ps1) first so it does not respawn anything
    2. FastAPI backend (uvicorn on the configured port)
    3. ngrok (if started) or turns off Tailscale Funnel on port 443 (unless -KeepFunnel)
  Ollama is left running by default unless -IncludeOllama is passed.

.PARAMETER Port
  Backend port to check/stop (default: 8000).
.PARAMETER KeepFunnel
  Leave Tailscale Funnel enabled when stopping the backend.
.PARAMETER IncludeOllama
  Also stop the local Ollama server process.

.EXAMPLE
  .\backend\scripts\stop_all.ps1
  .\backend\scripts\stop_all.ps1 -KeepFunnel
  .\backend\scripts\stop_all.ps1 -IncludeOllama
#>
param(
    [int]$Port = 8000,
    [switch]$KeepFunnel,
    [switch]$IncludeOllama
)

$ErrorActionPreference = "Continue"

$scriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Split-Path -Parent $scriptDir
$logsDir    = Join-Path $backendDir "logs"
$pidFile    = Join-Path $logsDir "standby.pids.json"

function Stop-PidSafe([object]$TargetPid, [string]$Label) {
    if ($null -eq $TargetPid) { return }
    try {
        $id = [int]$TargetPid
        if ($id -le 0 -or $id -eq $PID) { return }
        $p = Get-Process -Id $id -ErrorAction SilentlyContinue
        if ($p -and -not $p.HasExited) {
            Write-Host "Stopping $Label (PID $id)..."
            Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
        }
    } catch { }
}

$state = $null
if (Test-Path $pidFile) {
    try {
        $state = Get-Content -Path $pidFile -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch {
        Write-Warning "Could not parse $pidFile; falling back to port/process lookup."
    }
}

# 1. Stop supervisor first (from state file + any stray start_all.ps1 process)
if ($state -and $state.supervisor_pid) {
    Stop-PidSafe $state.supervisor_pid "standby supervisor"
}
$straySupervisors = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine -match "start_all\.ps1" }
foreach ($s in $straySupervisors) {
    Stop-PidSafe $s.ProcessId "standby supervisor"
}

# 2. Stop uvicorn backend (recorded PID + anything python/uvicorn listening on $Port)
if ($state -and $state.uvicorn_pid) {
    Stop-PidSafe $state.uvicorn_pid "uvicorn backend"
}
$listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
foreach ($l in $listeners) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $($l.OwningProcess)" -ErrorAction SilentlyContinue
    if ($proc -and ($proc.CommandLine -match "uvicorn" -or $proc.Name -match "python")) {
        Stop-PidSafe $l.OwningProcess "uvicorn on port $Port"
    }
}

# 3. Stop ngrok if started
if ($state -and $state.ngrok_pid) {
    Stop-PidSafe $state.ngrok_pid "ngrok tunnel"
}

# 4. Turn off Tailscale Funnel (unless -KeepFunnel)
if (-not $KeepFunnel) {
    $tsCmd = Get-Command tailscale -ErrorAction SilentlyContinue
    $tsExe = if ($tsCmd) { $tsCmd.Source } elseif (Test-Path "$env:ProgramFiles\Tailscale\tailscale.exe") { "$env:ProgramFiles\Tailscale\tailscale.exe" } else { $null }
    if ($tsExe) {
        $statusText = (& $tsExe funnel status 2>&1) -join "`n"
        if ($statusText -match "127\.0\.0\.1:$Port" -or $statusText -match "localhost:$Port") {
            Write-Host "Disabling Tailscale Funnel on HTTPS port 443..."
            & $tsExe funnel --https=443 off 2>&1 | Out-Null
        }
    }
}

# 5. Optional: stop Ollama
if ($IncludeOllama) {
    if ($state -and $state.ollama_pid) {
        Stop-PidSafe $state.ollama_pid "Ollama server"
    }
    Get-Process -Name "ollama*" -ErrorAction SilentlyContinue | ForEach-Object {
        Stop-PidSafe $_.Id "Ollama ($($_.Name))"
    }
}

if (Test-Path $pidFile) {
    Remove-Item -Path $pidFile -Force -ErrorAction SilentlyContinue
}

Write-Host "Pawang AI standby backend stopped."
