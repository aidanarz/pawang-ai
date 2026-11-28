<#
.SYNOPSIS
  Read-only status check for the Pawang AI always-on backend stack on Windows.

.DESCRIPTION
  Checks:
    - Standby supervisor (start_all.ps1)
    - Windows Task Scheduler task (PawangAI-Standby)
    - Ollama server + required Qwen model
    - FastAPI backend health (http://127.0.0.1:8000/api/v1/health)
    - Tailscale Funnel (or ngrok) fixed HTTPS URL + live public health probe
    - Windows AC power sleep timeout
  Never prints secrets or modifies system state.

.PARAMETER Port
  Local backend port (default: 8000).
.PARAMETER TaskName
  Scheduled Task name to inspect (default: PawangAI-Standby).

.EXAMPLE
  .\backend\scripts\status.ps1
#>
param(
    [int]$Port = 8000,
    [string]$TaskName = "PawangAI-Standby"
)

$ErrorActionPreference = "Continue"

$scriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Split-Path -Parent $scriptDir
$logsDir    = Join-Path $backendDir "logs"
$pidFile    = Join-Path $logsDir "standby.pids.json"

function Write-Check([string]$Label, [string]$Status, [string]$Detail) {
    $pad = $Label.PadRight(22)
    Write-Host ("{0} [{1}] {2}" -f $pad, $Status, $Detail)
}

Write-Host "=== Pawang AI Standby Status ($(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')) ==="

# 1. Supervisor state
$state = $null
if (Test-Path $pidFile) {
    try { $state = Get-Content -Path $pidFile -Raw -Encoding UTF8 | ConvertFrom-Json } catch { }
}
$supAlive = $false
if ($state -and $state.supervisor_pid) {
    $p = Get-Process -Id $state.supervisor_pid -ErrorAction SilentlyContinue
    $supAlive = ($null -ne $p -and -not $p.HasExited)
}
if ($supAlive) {
    Write-Check "Supervisor" "UP  " "PID $($state.supervisor_pid) (tunnel=$($state.tunnel_mode), started=$($state.started_at))"
} else {
    Write-Check "Supervisor" "DOWN" "start_all.ps1 watchdog is not running"
}

# 2. Task Scheduler
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
    $info = Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction SilentlyContinue
    $lastRun = if ($info -and $info.LastRunTime.Year -gt 2000) { $info.LastRunTime.ToString("yyyy-MM-dd HH:mm:ss") } else { "never" }
    Write-Check "Scheduled Task" "OK  " "$TaskName state=$($task.State), last_run=$lastRun, last_result=$($info.LastTaskResult)"
} else {
    Write-Check "Scheduled Task" "NONE" "$TaskName is not installed (run backend\scripts\install_task.ps1)"
}

# 3. Ollama
$ollamaTags = $null
try {
    $ollamaTags = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 3 -ErrorAction Stop
} catch { }
if ($ollamaTags) {
    $names = @()
    if ($ollamaTags.models) { $names = @($ollamaTags.models | ForEach-Object { $_.name }) }
    $want = if ($state -and $state.model) { $state.model } else { "qwen3.5:4b" }
    $hasModel = ($names -contains $want) -or ($names -contains "$want`:latest")
    $tag = if ($hasModel) { "UP  " } else { "WARN" }
    Write-Check "Ollama (11434)" $tag "model '$want' present=$hasModel; installed=$($names -join ', ')"
} else {
    Write-Check "Ollama (11434)" "DOWN" "not responding on http://127.0.0.1:11434"
}

# 4. FastAPI backend
$health = $null
try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/v1/health" -TimeoutSec 5 -ErrorAction Stop
} catch { }
if ($health -and $health.status -eq "ok") {
    $tmaOk = if ($health.tma_live -and $health.tma_live.last_ok) { $health.tma_live.last_ok } else { "not fetched yet" }
    $tmaRows = if ($health.tma_live) { $health.tma_live.stored_rows } else { 0 }
    Write-Check "Backend (:$Port)" "UP  " "mode=$($health.data_mode), areas=$($health.areas), llm_reachable=$($health.llm.reachable), tma_rows=$tmaRows, tma_last_ok=$tmaOk"
} else {
    Write-Check "Backend (:$Port)" "DOWN" "http://127.0.0.1:$Port/api/v1/health did not respond"
}

# 5. Tailscale Funnel / public URL
$tsCmd = Get-Command tailscale -ErrorAction SilentlyContinue
$tsExe = if ($tsCmd) { $tsCmd.Source } elseif (Test-Path "$env:ProgramFiles\Tailscale\tailscale.exe") { "$env:ProgramFiles\Tailscale\tailscale.exe" } else { $null }
$publicUrl = $null
if ($tsExe) {
    try {
        $raw = & $tsExe status --json 2>$null
        if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($raw)) {
            $tsObj = $raw | ConvertFrom-Json
            $dns = if ($tsObj.Self -and $tsObj.Self.DNSName) { $tsObj.Self.DNSName.TrimEnd(".") } else { $null }
            $fStatus = (& $tsExe funnel status 2>&1) -join " "
            $funnelOn = ($fStatus -match "Funnel on") -and ($fStatus -match "127\.0\.0\.1:$Port" -or $fStatus -match "localhost:$Port")
            if ($tsObj.BackendState -eq "Running" -and $dns) {
                $publicUrl = "https://$dns"
                $fTag = if ($funnelOn) { "UP  " } else { "WARN" }
                Write-Check "Tailscale Funnel" $fTag "state=$($tsObj.BackendState), funnel_on=$funnelOn, url=$publicUrl"
            } else {
                Write-Check "Tailscale Funnel" "WARN" "state=$($tsObj.BackendState) (sign in to Tailscale)"
            }
        } else {
            Write-Check "Tailscale Funnel" "DOWN" "tailscale daemon not running or not logged in"
        }
    } catch {
        Write-Check "Tailscale Funnel" "WARN" "could not query tailscale status"
    }
} else {
    Write-Check "Tailscale Funnel" "NONE" "tailscale.exe not installed yet"
}

if (-not $publicUrl -and $state -and $state.public_url) {
    $publicUrl = $state.public_url
}

if ($publicUrl) {
    try {
        $pubHealth = Invoke-RestMethod -Uri "$($publicUrl.TrimEnd('/'))/api/v1/health" -TimeoutSec 6 -ErrorAction Stop
        if ($pubHealth -and $pubHealth.status -eq "ok") {
            Write-Check "Public HTTPS Probe" "UP  " "$publicUrl/api/v1/health -> 200 OK (mode=$($pubHealth.data_mode))"
        } else {
            Write-Check "Public HTTPS Probe" "WARN" "$publicUrl responded without status=ok"
        }
    } catch {
        Write-Check "Public HTTPS Probe" "DOWN" "$publicUrl/api/v1/health unreachable ($($_.Exception.Message))"
    }
} else {
    Write-Check "Public HTTPS Probe" "NONE" "no public tunnel URL configured yet"
}

# 6. Windows AC sleep timeout
try {
    $qOut = (& powercfg /q SCHEME_CURRENT SUB_SLEEP STANDBYIDLE 2>&1) -join "`n"
    if ($qOut -match "Current AC Power Setting Index:\s*0x([0-9a-fA-F]+)") {
        $secs = [Convert]::ToInt32($Matches[1], 16)
        if ($secs -eq 0) {
            Write-Check "AC Sleep Timeout" "OK  " "Never sleep on AC power (0 s)"
        } else {
            $mins = [Math]::Round($secs / 60.0, 1)
            Write-Check "AC Sleep Timeout" "WARN" "Sleeps after $mins min on AC power (run: powercfg /change standby-timeout-ac 0)"
        }
    }
} catch { }

Write-Host ""
Write-Host "Logs: $logsDir"
