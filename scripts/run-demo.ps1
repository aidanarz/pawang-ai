<#
.SYNOPSIS
  Starts the Pawang AI backend (FastAPI) and frontend (Next.js) together.

.DESCRIPTION
  Default = replay demo: archive data from the repo, no internet and no Qwen needed.
  Open http://localhost:3000 when both are up. Press Ctrl+C to stop both.

.PARAMETER Live
  Use live mode (Open-Meteo forecast) instead of archive replay.
.PARAMETER Qwen
  Turn on the Qwen agents (needs Ollama running with the model in backend/.env).
.PARAMETER DemoDate
  Archive day shown first in replay mode (YYYY-MM-DD). Default 2020-02-25 (a known flood day).
.PARAMETER BackendPort / FrontendPort
  Ports to use. The script refuses to start if one is already taken.

.EXAMPLE
  .\scripts\run-demo.ps1
  .\scripts\run-demo.ps1 -Live -Qwen
#>
param(
    [switch]$Live,
    [switch]$Qwen,
    [string]$DemoDate = "2020-02-25",
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 3000
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

function Test-PortInUse([int]$Port) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $client.Connect("127.0.0.1", $Port)
        return $true
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}

foreach ($p in @($BackendPort, $FrontendPort)) {
    if (Test-PortInUse $p) {
        Write-Error "Port $p is already in use. Stop the program using it (netstat -ano | findstr :$p, then taskkill /PID <pid> /F) or pick another port."
    }
}
if (-not (Test-Path (Join-Path $root "frontend\node_modules"))) {
    Write-Error "frontend\node_modules is missing. Run: cd frontend; npm install"
}
$python = Join-Path $root "backend\.venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    $python = "python"
}

# Settings are inherited by the child processes.
$env:PAWANG_DATA_MODE = if ($Live) { "live" } else { "replay" }
$env:QWEN_ENABLED = if ($Qwen) { "true" } else { "false" }
$env:PAWANG_BACKEND_URL = "http://127.0.0.1:$BackendPort"
# Live mode: poll the BPBD water-level page every 30 min so the history the model needs (yesterday) builds up.
if ($Live) { $env:PAWANG_TMA_POLL_S = "1800" }
if ($Live) { Remove-Item Env:PAWANG_DEMO_DATE -ErrorAction SilentlyContinue } else { $env:PAWANG_DEMO_DATE = $DemoDate }

Write-Host "Starting backend  : mode=$($env:PAWANG_DATA_MODE) qwen=$($env:QWEN_ENABLED) port=$BackendPort"
$backend = Start-Process -PassThru -NoNewWindow -WorkingDirectory (Join-Path $root "backend") `
    -FilePath $python -ArgumentList "-m", "uvicorn", "app.main:app", "--port", "$BackendPort"

Write-Host "Starting frontend : port=$FrontendPort"
$frontend = Start-Process -PassThru -NoNewWindow -WorkingDirectory (Join-Path $root "frontend") `
    -FilePath "npm.cmd" -ArgumentList "run", "dev", "--", "-p", "$FrontendPort"

# Wait for the backend health check (the model loads on start).
$ready = $false
for ($i = 0; $i -lt 60 -and -not $backend.HasExited; $i++) {
    try {
        $h = Invoke-RestMethod -TimeoutSec 2 "http://127.0.0.1:$BackendPort/api/v1/health"
        Write-Host "Backend ready     : model unit=$($h.model_unit), areas=$($h.areas), Qwen reachable=$($h.llm.reachable)"
        $ready = $true
        break
    } catch {
        Start-Sleep -Seconds 1
    }
}
if (-not $ready) {
    Write-Warning "Backend did not answer on port $BackendPort. Check the messages above."
} else {
    Write-Host "Open http://localhost:$FrontendPort   (Ctrl+C to stop)"
}

try {
    while (-not $backend.HasExited -and -not $frontend.HasExited) { Start-Sleep -Seconds 1 }
    Write-Warning "A server exited. Stopping the other one."
} finally {
    foreach ($proc in @($backend, $frontend)) {
        if ($proc -and -not $proc.HasExited) { & taskkill /PID $proc.Id /T /F | Out-Null }
    }
}
