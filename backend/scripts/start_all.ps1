<#
.SYNOPSIS
  Starts and supervises the Pawang AI always-on backend stack on Windows:
    1. Ollama + ensures the configured Qwen model (default qwen3.5:4b) is pulled
    2. FastAPI backend (uvicorn, 1 worker, live mode, TMA poller + Flood Watch enabled)
    3. Fixed HTTPS tunnel (Tailscale Funnel by default; ngrok static domain as backup)

.DESCRIPTION
  Designed to run either manually or automatically at Windows logon via Task Scheduler.
  By default it stays running as a lightweight watchdog (checking every 30 s) that keeps
  the laptop awake (ES_SYSTEM_REQUIRED) and restarts any component that crashes.
  All logs go to backend\logs\ (git-ignored). Never prints secrets from backend\.env.

.PARAMETER Port
  Local port for uvicorn (default: 8000).
.PARAMETER Model
  Ollama model name to verify/pull. If omitted, reads QWEN_MODEL from backend\.env or uses qwen3.5:4b.
.PARAMETER Tunnel
  Public HTTPS tunnel mode: "tailscale" (default), "ngrok" (backup), or "none" (local only).
.PARAMETER NgrokDomain
  Static ngrok domain (only used with -Tunnel ngrok; can also come from PAWANG_NGROK_DOMAIN).
.PARAMETER NoWatchLoop
  Start all services once, verify health, and exit without staying in the watchdog loop.
.PARAMETER NoKeepAwake
  Do not call SetThreadExecutionState to prevent idle sleep while the watchdog runs.
.PARAMETER CheckIntervalSec
  Watchdog health-check interval in seconds (default: 30).

.EXAMPLE
  .\backend\scripts\start_all.ps1
  .\backend\scripts\start_all.ps1 -NoWatchLoop
  .\backend\scripts\start_all.ps1 -Tunnel ngrok -NgrokDomain your-static-name.ngrok-free.app
#>
param(
    [int]$Port = 8000,
    [string]$Model = "",
    [ValidateSet("tailscale", "ngrok", "none")]
    [string]$Tunnel = "tailscale",
    [string]$NgrokDomain = "",
    [switch]$NoWatchLoop,
    [switch]$NoKeepAwake,
    [int]$CheckIntervalSec = 30,
    [int]$TailscaleWaitSec = 300
)

$ErrorActionPreference = "Stop"

$scriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Split-Path -Parent $scriptDir
$logsDir    = Join-Path $backendDir "logs"
$envPath    = Join-Path $backendDir ".env"
$pidFile    = Join-Path $logsDir "standby.pids.json"
$mainLog    = Join-Path $logsDir "start_all.log"
$uviOutLog  = Join-Path $logsDir "uvicorn.out.log"
$uviErrLog  = Join-Path $logsDir "uvicorn.err.log"
$ollOutLog  = Join-Path $logsDir "ollama.out.log"
$ollErrLog  = Join-Path $logsDir "ollama.err.log"
$ngkOutLog  = Join-Path $logsDir "ngrok.out.log"
$ngkErrLog  = Join-Path $logsDir "ngrok.err.log"

if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
}

function Rotate-LogIfLarge([string]$Path, [int64]$MaxBytes = 10485760) {
    if (Test-Path $Path) {
        $item = Get-Item $Path -ErrorAction SilentlyContinue
        if ($item -and $item.Length -gt $MaxBytes) {
            $backup = "$Path.1"
            Move-Item -Path $Path -Destination $backup -Force -ErrorAction SilentlyContinue
        }
    }
}

foreach ($lf in @($mainLog, $uviOutLog, $uviErrLog, $ollOutLog, $ollErrLog, $ngkOutLog, $ngkErrLog)) {
    Rotate-LogIfLarge $lf
}

function Write-Log([string]$Message, [string]$Level = "INFO") {
    $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $line = "[$ts] [$Level] $Message"
    try {
        Add-Content -Path $mainLog -Value $line -Encoding UTF8
    } catch { }
    Write-Host $line
}

function Read-NonSecretEnvValue([string]$Key, [string]$DefaultValue) {
    # Only used for non-secret settings (e.g., QWEN_MODEL, PAWANG_NGROK_DOMAIN). Never reads tokens.
    $fromEnv = [Environment]::GetEnvironmentVariable($Key)
    if (-not [string]::IsNullOrWhiteSpace($fromEnv)) {
        return $fromEnv.Trim()
    }
    if (Test-Path $envPath) {
        foreach ($rawLine in Get-Content -Path $envPath -Encoding UTF8) {
            $line = $rawLine.Trim()
            if (-not $line -or $line.StartsWith("#") -or ($line.IndexOf("=") -lt 1)) { continue }
            $parts = $line.Split("=", 2)
            if ($parts[0].Trim() -eq $Key) {
                $val = $parts[1].Trim().Trim('"').Trim("'")
                if (-not [string]::IsNullOrWhiteSpace($val)) { return $val }
            }
        }
    }
    return $DefaultValue
}

function Find-Executable([string]$Name, [string[]]$ExtraPaths) {
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source) { return $cmd.Source }
    foreach ($p in $ExtraPaths) {
        if ($p -and (Test-Path $p)) { return $p }
    }
    return $null
}

function Save-State([hashtable]$State) {
    try {
        $State["updated_at"] = (Get-Date).ToString("o")
        $State | ConvertTo-Json -Depth 4 | Set-Content -Path $pidFile -Encoding UTF8
    } catch {
        Write-Log "Could not write state file: $($_.Exception.Message)" "WARN"
    }
}

function Test-ProcessAlive([object]$ProcessId) {
    if ($null -eq $ProcessId) { return $false }
    try {
        $id = [int]$ProcessId
        if ($id -le 0) { return $false }
        $p = Get-Process -Id $id -ErrorAction SilentlyContinue
        return ($null -ne $p -and -not $p.HasExited)
    } catch {
        return $false
    }
}

# Prevent duplicate supervisors
if (Test-Path $pidFile) {
    try {
        $prev = Get-Content -Path $pidFile -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($prev.supervisor_pid -and ($prev.supervisor_pid -ne $PID) -and (Test-ProcessAlive $prev.supervisor_pid)) {
            $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $($prev.supervisor_pid)" -ErrorAction SilentlyContinue
            if ($proc -and $proc.CommandLine -and $proc.CommandLine -match "start_all\.ps1") {
                Write-Log "Another start_all.ps1 supervisor is already running (PID $($prev.supervisor_pid)). Exiting." "WARN"
                exit 0
            }
        }
    } catch { }
}

# Keep-awake helper (prevents idle sleep while this script runs, without changing permanent power plans)
$script:KeepAwakeEnabled = $false
function Enable-KeepAwake {
    if ($NoKeepAwake) { return }
    try {
        if (-not ("Pawang.PowerHelper" -as [type])) {
            Add-Type -Namespace Pawang -Name PowerHelper -MemberDefinition @"
[System.Runtime.InteropServices.DllImport("kernel32.dll", SetLastError = true)]
public static extern uint SetThreadExecutionState(uint esFlags);
"@
        }
        # ES_CONTINUOUS (0x80000000) | ES_SYSTEM_REQUIRED (0x00000001)
        # Use Int64 hex literals (L) so Windows PowerShell 5.1 does not parse 0x80000001 as signed Int32 (-2147483647).
        [uint32]$keepAwakeFlags = [uint32](0x80000000L -bor 0x00000001L)
        $prevState = [Pawang.PowerHelper]::SetThreadExecutionState($keepAwakeFlags)
        if ($prevState -eq 0) {
            Write-Log "SetThreadExecutionState returned 0 (could not confirm keep-awake)." "WARN"
        } else {
            $script:KeepAwakeEnabled = $true
            Write-Log "Keep-awake enabled (ES_SYSTEM_REQUIRED) while standby supervisor is active."
        }
    } catch {
        Write-Log "Could not enable keep-awake: $($_.Exception.Message)" "WARN"
    }
}

function Disable-KeepAwake {
    if ($script:KeepAwakeEnabled) {
        try {
            # ES_CONTINUOUS only -> clear ES_SYSTEM_REQUIRED
            [uint32]$clearFlags = [uint32]0x80000000L
            [void][Pawang.PowerHelper]::SetThreadExecutionState($clearFlags)
        } catch { }
    }
}

# Resolve settings and binaries
if ([string]::IsNullOrWhiteSpace($Model)) {
    $Model = Read-NonSecretEnvValue "QWEN_MODEL" "qwen3.5:4b"
}
if ([string]::IsNullOrWhiteSpace($NgrokDomain)) {
    $NgrokDomain = Read-NonSecretEnvValue "PAWANG_NGROK_DOMAIN" ""
}

$ollamaExe = Find-Executable "ollama" @(
    (Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"),
    (Join-Path $env:ProgramFiles "Ollama\ollama.exe")
)
$tailscaleExe = Find-Executable "tailscale" @(
    (Join-Path $env:ProgramFiles "Tailscale\tailscale.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Tailscale\tailscale.exe")
)
$ngrokExe = Find-Executable "ngrok" @(
    (Join-Path $env:LOCALAPPDATA "Microsoft\WindowsApps\ngrok.exe"),
    (Join-Path $env:ProgramFiles "ngrok\ngrok.exe")
)
$pythonExe = Join-Path $backendDir ".venv\Scripts\python.exe"
if (-not (Test-Path $pythonExe)) {
    $pythonExe = Find-Executable "python" @()
}

$state = @{
    supervisor_pid = $PID
    port           = $Port
    model          = $Model
    tunnel_mode    = $Tunnel
    public_url     = $null
    ollama_pid     = $null
    uvicorn_pid    = $null
    ngrok_pid      = $null
    started_at     = (Get-Date).ToString("o")
}

# ---------------------------------------------------------------------------
# 1. Ollama + model check
# ---------------------------------------------------------------------------
function Get-OllamaTags {
    try {
        return Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 8 -ErrorAction Stop
    } catch {
        return $null
    }
}

function Test-OllamaListening {
    try {
        $conn = Get-NetTCPConnection -LocalPort 11434 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        return ($null -ne $conn)
    } catch {
        return $false
    }
}

function Ensure-Ollama([switch]$StartupGrace) {
    $tags = Get-OllamaTags
    if ($null -eq $tags) {
        # Give Ollama's own logon tray app / existing process a grace period before starting a second instance.
        $existingOllama = Get-Process -Name "ollama*" -ErrorAction SilentlyContinue
        if ($StartupGrace -or (Test-OllamaListening) -or $existingOllama) {
            Write-Log "Waiting for existing/autostart Ollama on 127.0.0.1:11434 (grace period up to 24 s)..."
            for ($w = 0; $w -lt 12; $w++) {
                Start-Sleep -Seconds 2
                $tags = Get-OllamaTags
                if ($null -ne $tags) {
                    Write-Log "Detected Ollama listening on 127.0.0.1:11434; reusing existing instance."
                    break
                }
            }
        }
    }

    if ($null -eq $tags) {
        if (Test-OllamaListening) {
            Write-Log "Port 11434 is already listening (Ollama may be busy); skipping duplicate 'ollama serve' launch." "WARN"
            return $false
        }
        if (-not $ollamaExe) {
            Write-Log "ollama.exe not found! Install Ollama or check PATH. Backend will fall back to rule-based policies." "WARN"
            return $false
        }
        Write-Log "Starting Ollama server ($ollamaExe serve)..."
        $proc = Start-Process -FilePath $ollamaExe -ArgumentList "serve" -WindowStyle Hidden `
            -RedirectStandardOutput $ollOutLog -RedirectStandardError $ollErrLog -PassThru
        $state["ollama_pid"] = $proc.Id
        Save-State $state

        for ($i = 0; $i -lt 30; $i++) {
            Start-Sleep -Seconds 2
            $tags = Get-OllamaTags
            if ($null -ne $tags) { break }
        }
        if ($null -eq $tags) {
            Write-Log "Ollama did not respond on 127.0.0.1:11434 within 60 s." "WARN"
            return $false
        }
    }

    $hasModel = $false
    if ($tags -and $tags.models) {
        foreach ($m in $tags.models) {
            if ($m.name -eq $Model -or $m.name -eq "$Model`:latest") {
                $hasModel = $true
                break
            }
        }
    }
    if (-not $hasModel) {
        if (-not $ollamaExe) {
            Write-Log "Model '$Model' missing and ollama.exe not found." "WARN"
            return $false
        }
        Write-Log "Model '$Model' not found locally. Pulling via 'ollama pull $Model'..."
        & $ollamaExe pull $Model 2>&1 | ForEach-Object { Add-Content -Path $ollOutLog -Value $_ -Encoding UTF8 }
        if ($LASTEXITCODE -ne 0) {
            Write-Log "Failed to pull model '$Model' (exit code $LASTEXITCODE)." "WARN"
            return $false
        }
        Write-Log "Model '$Model' pulled successfully."
    } else {
        Write-Log "Ollama is ready and model '$Model' is present."
    }
    return $true
}

# ---------------------------------------------------------------------------
# 2. FastAPI backend (uvicorn, 1 worker, live mode)
# ---------------------------------------------------------------------------
function Get-BackendHealth {
    try {
        return Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/v1/health" -TimeoutSec 4 -ErrorAction Stop
    } catch {
        return $null
    }
}

function Ensure-Backend {
    $health = Get-BackendHealth
    if ($health -and $health.status -eq "ok") {
        if (-not $state["uvicorn_pid"]) {
            $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($conn) { $state["uvicorn_pid"] = $conn.OwningProcess }
        }
        Write-Log "Backend is healthy on 127.0.0.1:$Port (mode=$($health.data_mode), areas=$($health.areas), llm_reachable=$($health.llm.reachable))."
        return $true
    }

    if (-not $pythonExe -or -not (Test-Path $pythonExe)) {
        Write-Log "Python executable not found at $backendDir\.venv\Scripts\python.exe." "ERROR"
        return $false
    }

    # Live standby environment (do NOT set PAWANG_REPORTS_DEMO; keep its default)
    $env:PAWANG_DATA_MODE        = "live"
    $env:PAWANG_WATCH_INTERVAL_S = "1800"
    $env:PAWANG_TMA_POLL_S       = "1800"

    Write-Log "Starting FastAPI backend on 127.0.0.1:$Port (1 worker, PAWANG_DATA_MODE=live, WATCH=1800s, TMA_POLL=1800s)..."
    $proc = Start-Process -FilePath $pythonExe `
        -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "$Port", "--workers", "1" `
        -WorkingDirectory $backendDir `
        -WindowStyle Hidden `
        -RedirectStandardOutput $uviOutLog `
        -RedirectStandardError $uviErrLog `
        -PassThru

    $state["uvicorn_pid"] = $proc.Id
    Save-State $state

    for ($i = 0; $i -lt 45; $i++) {
        Start-Sleep -Seconds 2
        if ($proc.HasExited) {
            Write-Log "Uvicorn exited early with code $($proc.ExitCode). Check $uviErrLog." "ERROR"
            return $false
        }
        $health = Get-BackendHealth
        if ($health -and $health.status -eq "ok") {
            Write-Log "Backend ready on 127.0.0.1:$Port (mode=$($health.data_mode), areas=$($health.areas), llm_reachable=$($health.llm.reachable))."
            return $true
        }
    }

    Write-Log "Backend did not respond on http://127.0.0.1:$Port/api/v1/health within 90 s. Check $uviErrLog." "ERROR"
    return $false
}

# ---------------------------------------------------------------------------
# 3. Fixed HTTPS Tunnel (Tailscale Funnel primary, ngrok static domain backup)
# ---------------------------------------------------------------------------
function Get-TailscaleDnsName {
    if (-not $tailscaleExe) { return $null }
    try {
        $raw = & $tailscaleExe status --json 2>$null
        if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($raw)) { return $null }
        $obj = $raw | ConvertFrom-Json
        if ($obj.BackendState -ne "Running") { return $null }
        if ($obj.Self -and $obj.Self.DNSName) {
            return $obj.Self.DNSName.TrimEnd(".")
        }
    } catch { }
    return $null
}

function Test-PublicHealth([string]$BaseUrl) {
    if ([string]::IsNullOrWhiteSpace($BaseUrl)) { return $false }
    try {
        $h = Invoke-RestMethod -Uri "$($BaseUrl.TrimEnd('/'))/api/v1/health" -TimeoutSec 6 -ErrorAction Stop
        return ($h -and $h.status -eq "ok")
    } catch {
        return $false
    }
}

$script:LastTailscaleWarnAt = [DateTime]::MinValue

function Ensure-TailscaleFunnel([switch]$Quiet) {
    if (-not $tailscaleExe) {
        if (-not $Quiet) {
            Write-Log "tailscale.exe not found. Install Tailscale (see docs\DEPLOYMENT.md) or run with -Tunnel ngrok." "ERROR"
        }
        return $false
    }

    $dns = $null
    if ($Quiet) {
        # Watchdog mode: single fast check so the 30 s loop never stalls; keeps retrying indefinitely.
        $dns = Get-TailscaleDnsName
        if (-not $dns) {
            if (((Get-Date) - $script:LastTailscaleWarnAt).TotalMinutes -ge 5) {
                Write-Log "Tailscale not in Running state yet; watchdog will keep checking every $CheckIntervalSec s." "WARN"
                $script:LastTailscaleWarnAt = Get-Date
            }
            return $false
        }
    } else {
        # Initial startup: wait up to $TailscaleWaitSec (default 300 s = 5 min) for Tailscale to connect after boot.
        $stepSec = 5
        $maxTries = [Math]::Max(1, [int][Math]::Ceiling($TailscaleWaitSec / $stepSec))
        for ($i = 0; $i -lt $maxTries; $i++) {
            $dns = Get-TailscaleDnsName
            if ($dns) { break }
            if ($i -eq 0) {
                Write-Log "Waiting for Tailscale daemon to reach Running state (up to $TailscaleWaitSec s)..."
            } elseif (($i * $stepSec) % 30 -eq 0) {
                Write-Log "Still waiting for Tailscale daemon ($($i * $stepSec)s / $TailscaleWaitSec s)..."
            }
            Start-Sleep -Seconds $stepSec
        }
        if (-not $dns) {
            Write-Log "Tailscale did not reach Running state within $TailscaleWaitSec s. Watchdog will keep retrying every $CheckIntervalSec s (enable 'Run unattended' in Tailscale so it connects at boot)." "WARN"
            $script:LastTailscaleWarnAt = Get-Date
            return $false
        }
    }

    $publicUrl = "https://$dns"
    $prevUrl = $state["public_url"]
    $state["public_url"] = $publicUrl

    # Check if funnel already maps to our port; re-run 'tailscale funnel --bg $Port' if missing.
    $statusText = (& $tailscaleExe funnel status 2>&1) -join "`n"
    $alreadyMapped = ($statusText -match "127\.0\.0\.1:$Port" -or $statusText -match "localhost:$Port") -and ($statusText -match "Funnel on")
    if (-not $alreadyMapped) {
        Write-Log "Enabling Tailscale Funnel -> http://127.0.0.1:$Port at $publicUrl ..."
        $out = (& $tailscaleExe funnel --bg $Port 2>&1) -join "`n"
        if ($LASTEXITCODE -ne 0) {
            Write-Log "tailscale funnel --bg $Port failed: $out" "ERROR"
            return $false
        }
        Write-Log "Tailscale Funnel enabled at $publicUrl -> http://127.0.0.1:$Port"
    } elseif ($prevUrl -ne $publicUrl) {
        Write-Log "Tailscale Funnel already active at $publicUrl -> http://127.0.0.1:$Port"
    }

    Save-State $state

    if (-not $Quiet) {
        $pubOk = $false
        for ($i = 0; $i -lt 10; $i++) {
            if (Test-PublicHealth $publicUrl) {
                $pubOk = $true
                break
            }
            Start-Sleep -Seconds 3
        }
        if ($pubOk) {
            Write-Log "Tailscale Funnel verified: $publicUrl/api/v1/health -> 200 OK"
        } else {
            Write-Log "Tailscale Funnel configured at $publicUrl, but public health probe did not return 200 yet (check Funnel toggle in Tailscale Admin Console)." "WARN"
        }
    }
    return $true
}

function Ensure-NgrokTunnel([switch]$Quiet) {
    if (-not $ngrokExe) {
        Write-Log "ngrok.exe not found. Install ngrok or use -Tunnel tailscale." "ERROR"
        return $false
    }
    if ([string]::IsNullOrWhiteSpace($NgrokDomain)) {
        Write-Log "Ngrok static domain not set. Pass -NgrokDomain <domain> or set PAWANG_NGROK_DOMAIN." "ERROR"
        return $false
    }
    $publicUrl = "https://$($NgrokDomain -replace '^https?://', '')"
    $state["public_url"] = $publicUrl

    if (-not (Test-ProcessAlive $state["ngrok_pid"])) {
        Write-Log "Starting ngrok tunnel on static domain $publicUrl -> 127.0.0.1:$Port ..."
        $proc = Start-Process -FilePath $ngrokExe `
            -ArgumentList "http", "--domain=$($NgrokDomain -replace '^https?://', '')", "$Port" `
            -WindowStyle Hidden `
            -RedirectStandardOutput $ngkOutLog `
            -RedirectStandardError $ngkErrLog `
            -PassThru
        $state["ngrok_pid"] = $proc.Id
        Save-State $state
        Start-Sleep -Seconds 4
    }

    if (-not $Quiet) {
        $pubOk = $false
        for ($i = 0; $i -lt 10; $i++) {
            if (Test-PublicHealth $publicUrl) {
                $pubOk = $true
                break
            }
            Start-Sleep -Seconds 3
        }
        if ($pubOk) {
            Write-Log "ngrok tunnel verified: $publicUrl/api/v1/health -> 200 OK"
        } else {
            Write-Log "ngrok started for $publicUrl, but public health probe did not return 200 yet. Check $ngkErrLog." "WARN"
        }
    }
    return $true
}

function Ensure-Tunnel([switch]$Quiet) {
    if ($Tunnel -eq "none") {
        if (-not $Quiet) { Write-Log "Tunnel mode is 'none' (local backend only)." }
        return $true
    }
    if ($Tunnel -eq "tailscale") {
        return (Ensure-TailscaleFunnel -Quiet:$Quiet)
    }
    if ($Tunnel -eq "ngrok") {
        return (Ensure-NgrokTunnel -Quiet:$Quiet)
    }
    return $false
}

# ---------------------------------------------------------------------------
# Main startup sequence
# ---------------------------------------------------------------------------
Write-Log "=== Pawang AI standby startup (PID=$PID, Port=$Port, Model=$Model, Tunnel=$Tunnel) ==="
Save-State $state

try {
    Enable-KeepAwake

    [void](Ensure-Ollama -StartupGrace)
    $beOk = Ensure-Backend
    if (-not $beOk) {
        Write-Log "Backend failed to start. Check $uviErrLog." "ERROR"
        if ($NoWatchLoop) { exit 1 }
    }
    [void](Ensure-Tunnel)

    Save-State $state
    if ($NoWatchLoop) {
        Write-Log "Startup complete (-NoWatchLoop set). Exiting supervisor."
        exit 0
    }

    Write-Log "Entering watchdog loop (checking every $CheckIntervalSec s). Run stop_all.ps1 to stop."
    $consecutiveBackendFails = 0
    $consecutiveOllamaFails = 0
    while ($true) {
        Start-Sleep -Seconds $CheckIntervalSec

        if ($null -eq (Get-OllamaTags)) {
            $consecutiveOllamaFails++
            if (Test-OllamaListening) {
                if ($consecutiveOllamaFails -ge 3) {
                    Write-Log "Ollama HTTP check timed out $consecutiveOllamaFails times, but port 11434 is still listening (likely busy); not launching a duplicate." "WARN"
                }
            } elseif ($consecutiveOllamaFails -ge 3) {
                Write-Log "Ollama check failed $consecutiveOllamaFails times and port 11434 is closed; attempting restart..." "WARN"
                if (Ensure-Ollama) {
                    $consecutiveOllamaFails = 0
                }
            }
        } else {
            $consecutiveOllamaFails = 0
        }

        if ($null -eq (Get-BackendHealth)) {
            $consecutiveBackendFails++
            Write-Log "Backend health check failed (attempt #$consecutiveBackendFails); attempting restart..." "WARN"
            if (Ensure-Backend) {
                $consecutiveBackendFails = 0
            } else {
                $backoff = [Math]::Min(120, $consecutiveBackendFails * 15)
                Write-Log "Backing off $backoff s before next retry." "WARN"
                Start-Sleep -Seconds $backoff
            }
        } else {
            $consecutiveBackendFails = 0
        }

        if ($Tunnel -ne "none") {
            [void](Ensure-Tunnel -Quiet)
        }
    }
} finally {
    Disable-KeepAwake
    Write-Log "Standby supervisor exiting (PID=$PID)."
}
