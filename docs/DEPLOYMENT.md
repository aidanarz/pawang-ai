# Pawang AI — Always-On Backend Deployment Guide (Windows Laptop)

This guide turns your Windows laptop into a self-starting, always-on backend server for the Vercel frontend (`https://pawang-ai-eight.vercel.app`) using a **fixed HTTPS URL** that does not change on restart.

> For moving off the laptop to a dedicated cloud server later (Option B), see [CLOUD_VM_PLAN.md](./CLOUD_VM_PLAN.md).

---

## 1. How It Works

```text
Browser
  -> Vercel Frontend (https://pawang-ai-eight.vercel.app)
     -> /api/v1/* proxy (uses Vercel env var PAWANG_BACKEND_URL)
        -> Fixed HTTPS URL (Tailscale Funnel: https://<machine>.<tailnet>.ts.net)
           -> Windows Laptop: FastAPI (127.0.0.1:8000, 1 worker, PAWANG_DATA_MODE=live)
              ├── Ollama (127.0.0.1:11434, model qwen3.5:4b)
              ├── Open-Meteo API (live rainfall)
              ├── BPBD DKI Jakarta (live water level, polled every 30 min)
              ├── Flood Watch Agent (background cycle every 30 min)
              └── Public FOSSGIS Valhalla (alternative route engine)
```

### Why these choices?
- **Tailscale Funnel** gives you a free, permanent HTTPS hostname (`https://<machine>.<tailnet>.ts.net`) with automatic TLS and **no custom domain purchase required** (unlike a Cloudflare Named Tunnel, which requires a domain on Cloudflare DNS). Unlike a `cloudflared` quick tunnel, the URL stays identical across every reboot.
- **Windows Task Scheduler** (instead of NSSM) is built into Windows, requires **no extra binary download** and **no Administrator privileges**, and runs inside your normal Windows user session where Ollama's pulled models and Tailscale's user client already live.
- **Single uvicorn worker (`--workers 1`)** is mandatory because the in-memory cache, BPBD CSV lock, Flood Watch scheduler, and memory file are per-process.
- **Standby supervisor (`start_all.ps1`)** starts Ollama, FastAPI, and the tunnel in order with health checks, keeps Windows awake while running (`ES_SYSTEM_REQUIRED`), and monitors all three every 30 seconds to restart any crashed component automatically.

---

## 2. One-Time Setup

Run every PowerShell command below from the repository root:

```powershell
cd "C:\Users\Reyhan Batara\github\pawang-ai"
```

### Step A — Create a Tailscale Account and Enable Funnel

1. **Install Tailscale on Windows:**
   ```powershell
   winget install --id Tailscale.Tailscale -e
   ```
   *(If `winget` asks to accept source agreements, type `Y` and press Enter. Alternatively, download the Windows installer from https://tailscale.com/download/windows.)*

2. **Open a fresh PowerShell window** (so `tailscale` is on `PATH`) and sign in:
   ```powershell
   tailscale up
   ```
   - A browser window opens to Tailscale.
   - Click **Sign in with Google** (or GitHub / Microsoft — free Personal plan).
   - Click **Connect** to add your laptop to your new tailnet.

3. **Enable MagicDNS and HTTPS Certificates** in the Tailscale Admin Console:
   - Open https://login.tailscale.com/admin/dns
   - Verify **MagicDNS** is **Enabled** (it is on by default for new accounts).
   - Scroll to **HTTPS Certificates** and click **Enable HTTPS**.

4. **Enable Funnel** in the Tailscale Admin Console:
   - Open https://login.tailscale.com/admin/acls/file (Access Controls).
   - Confirm your tailnet policy allows Funnel (newer tailnets enable it automatically; if not, Tailscale will give you a one-click link in the next step).

5. **Expose local port 8000 with Funnel and get your fixed URL:**
   ```powershell
   tailscale funnel --bg 8000
   ```
   - If Tailscale prints a link saying *"Funnel is not enabled on your tailnet. To enable, visit: https://login.tailscale.com/f/funnel?node=..."*, open that link in your browser, click **Enable Funnel**, and re-run `tailscale funnel --bg 8000`.
   - Check your permanent HTTPS URL:
     ```powershell
     tailscale funnel status
     ```
     You will see a line like:
     ```text
     https://your-laptop-name.tail12345.ts.net (Funnel on)
     |-- / proxy http://127.0.0.1:8000
     ```
   - **Copy that `https://...ts.net` URL** (no trailing slash). That is your permanent `PAWANG_BACKEND_URL`.

6. **Verify the public URL reaches your local backend:**
   ```powershell
   curl.exe "https://YOUR-LAPTOP.YOUR-TAILNET.ts.net/api/v1/health"
   ```
   You should get JSON with `"status":"ok"` and `"data_mode":"live"`.

---

### Step B — Backup Option: ngrok Free Static Domain (Only if Funnel Doesn't Work)

If your campus/home network blocks Tailscale Funnel, use ngrok's free static domain instead:

1. Create a free account at https://dashboard.ngrok.com/signup.
2. In the ngrok dashboard:
   - Go to **Domains** -> click **New Domain** to claim 1 free permanent domain (e.g. `something-random.ngrok-free.app`).
   - Go to **Your Authtoken** and copy your token.
3. Install and authenticate ngrok on Windows:
   ```powershell
   winget install --id Ngrok.Ngrok -e
   ngrok config add-authtoken YOUR_NGROK_AUTHTOKEN
   ```
4. Pass `-Tunnel ngrok -NgrokDomain YOUR-DOMAIN.ngrok-free.app` when running `start_all.ps1` or `install_task.ps1`.
   *(Note: ngrok's free tier shows a browser warning interstitial for HTML pages, but server-to-server `fetch` calls from Vercel's Next.js proxy work; if needed, ngrok supports bypassing it via request headers.)*

---

### Step C — Prevent the Laptop from Sleeping on AC Power

While `start_all.ps1` runs, it automatically requests Windows not to sleep (`ES_SYSTEM_REQUIRED`). You should **also** disable AC idle sleep in Windows Power Settings so the laptop never sleeps when plugged in:

```powershell
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
```

- **Verify it took effect:**
  ```powershell
  .\backend\scripts\status.ps1
  ```
  Look for: `AC Sleep Timeout       [OK  ] Never sleep on AC power (0 s)`.
- **Keep the lid open** (or in Windows Control Panel -> *Power Options* -> *Choose what closing the lid does*, set *Plugged in* -> **Do nothing**).
- Keep the laptop **plugged into AC power** and connected to reliable Wi-Fi/Ethernet during the presentation.

---

### Step D — Enable Auto-Start at Windows Logon (Task Scheduler)

Register the `PawangAI-Standby` scheduled task (runs `backend\scripts\start_all.ps1` automatically 15 seconds after you sign in to Windows, with crash recovery):

```powershell
.\backend\scripts\install_task.ps1
```

*(If using ngrok backup instead of Tailscale:)*
```powershell
.\backend\scripts\install_task.ps1 -Tunnel ngrok -NgrokDomain YOUR-DOMAIN.ngrok-free.app
```

To remove auto-start later:
```powershell
.\backend\scripts\uninstall_task.ps1
```

---

### Step E — Update `PAWANG_BACKEND_URL` on Vercel and Redeploy

1. Open https://vercel.com and log in to your team's Vercel project for **Pawang AI** (`pawang-ai-eight.vercel.app`).
2. Go to **Settings** -> **Environment Variables**.
3. Find `PAWANG_BACKEND_URL` (or add it if missing):
   - **Key:** `PAWANG_BACKEND_URL`
   - **Value:** `https://YOUR-LAPTOP.YOUR-TAILNET.ts.net` *(exact URL from `tailscale funnel status`, with NO trailing slash)*
   - **Environments:** Production (and Preview if desired)
   - Click **Save**.
4. Make sure `PAWANG_DEMO_DATE` is **not set** in Production (otherwise replay defaults may interfere).
5. **Redeploy** so the new environment variable takes effect:
   - Go to the **Deployments** tab.
   - Click the `...` menu on the latest Production deployment -> click **Redeploy** -> confirm **Redeploy**.
   - Wait ~1 minute until the deployment status is **Ready**.
6. Verify the live site:
   - Open `https://pawang-ai-eight.vercel.app/api/v1/status` in your browser -> confirm `"source":"backend"`, `"data_mode":"live"`.
   - Open `https://pawang-ai-eight.vercel.app/map` -> confirm the map loads real Jakarta kecamatan predictions (green connected dot in the top pill).

---

## 3. Daily Operations (Start / Stop / Check / Logs)

Run from the repository root (`C:\Users\Reyhan Batara\github\pawang-ai`):

| Task | Command |
| :--- | :--- |
| **Check full status** | `.\backend\scripts\status.ps1` |
| **Start manually** (supervised) | `.\backend\scripts\start_all.ps1` |
| **Start once and exit** (no watchdog) | `.\backend\scripts\start_all.ps1 -NoWatchLoop` |
| **Stop everything** (leaves Ollama running) | `.\backend\scripts\stop_all.ps1` |
| **Stop everything including Ollama** | `.\backend\scripts\stop_all.ps1 -IncludeOllama` |
| **Start via Task Scheduler** | `Start-ScheduledTask -TaskName "PawangAI-Standby"` |
| **Install auto-start task** | `.\backend\scripts\install_task.ps1` |
| **Remove auto-start task** | `.\backend\scripts\uninstall_task.ps1` |

### Environment Variables Set Automatically by `start_all.ps1`
- `PAWANG_DATA_MODE=live`
- `PAWANG_WATCH_INTERVAL_S=1800` (Flood Watch runs every 30 minutes)
- `PAWANG_TMA_POLL_S=1800` (BPBD water level history polled every 30 minutes)
- Secrets (like `PAWANG_ADMIN_TOKEN`) and Ollama settings (`QWEN_ENABLED`, `QWEN_MODEL`) continue to be loaded directly from `backend/.env` by FastAPI and are never printed to logs.

### Logs (all inside git-ignored `backend/logs/`)
- `backend/logs/start_all.log` — startup sequence, tunnel verification, and crash-restart events
- `backend/logs/uvicorn.out.log` / `uvicorn.err.log` — FastAPI server access logs and Python tracebacks
- `backend/logs/ollama.out.log` / `ollama.err.log` — Ollama server and model pull output
- `backend/logs/audit-YYYY-MM-DD.jsonl` — agent decision audit trail
- `backend/logs/standby.pids.json` — PIDs tracked by `start_all.ps1` / `stop_all.ps1`

---

## 4. Reboot Acceptance Test

Verify the full hands-free recovery before the presentation:

1. Plug your laptop into AC power and make sure Steps A, C, D, and E above are complete.
2. **Restart Windows** completely (`Start -> Power -> Restart`).
3. **Sign in to Windows** and **do not open any terminal or type any command**.
4. Wait **~2 to 3 minutes** (15 s Task Scheduler delay + Ollama check + uvicorn model load + Tailscale reconnect).
5. From another device (your phone on mobile data, or a teammate's laptop), open:
   - `https://pawang-ai-eight.vercel.app/api/v1/status` -> confirm `"source":"backend"` and `"data_mode":"live"`.
   - `https://pawang-ai-eight.vercel.app/map` -> confirm live kecamatan data renders and clicking a kecamatan returns real analysis & advice.
6. Optionally open PowerShell on your laptop and run `.\backend\scripts\status.ps1` — all checks should read `[UP  ]` / `[OK  ]`.

---

## 5. Troubleshooting: What to Do If the Site Says "Backend Offline" / Shows Demo Data

Run `.\backend\scripts\status.ps1` first and follow the first failing line from top to bottom:

1. **Laptop slept or lost Wi-Fi:**
   - Wake the laptop, check Wi-Fi/internet, and re-check `AC Sleep Timeout` in `status.ps1`.
2. **`Backend (:8000) [DOWN]`:**
   - Read the last 30 lines of the error log:
     ```powershell
     Get-Content .\backend\logs\uvicorn.err.log -Tail 30
     ```
   - Restart cleanly:
     ```powershell
     .\backend\scripts\stop_all.ps1
     Start-ScheduledTask -TaskName "PawangAI-Standby"
     ```
3. **`Ollama (11434) [DOWN]` or `llm_reachable=False`:**
   - Open the **Ollama** app from the Windows Start Menu (or run `ollama serve`), and confirm the model exists:
     ```powershell
     ollama list
     ```
   - Note: Even if Ollama is temporarily down, the FastAPI backend stays online and falls back to rule-based Indonesian templates automatically.
4. **`Tailscale Funnel [DOWN/WARN]` or `Public HTTPS Probe [DOWN]`:**
   - Check the Tailscale tray icon (bottom-right of taskbar) is connected.
   - Re-enable Funnel manually:
     ```powershell
     tailscale funnel --bg 8000
     tailscale funnel status
     ```
   - Test locally vs publicly:
     ```powershell
     curl.exe "http://127.0.0.1:8000/api/v1/health"
     curl.exe "https://YOUR-LAPTOP.YOUR-TAILNET.ts.net/api/v1/health"
     ```
   - If local works (`200 OK`) and public fails, your current Wi-Fi may block Tailscale's DERP/relay ports; switch to a phone hotspot or the **ngrok** backup (Step B).
5. **Public HTTPS Probe is `[UP  ]`, but Vercel still shows demo data:**
   - Double-check `PAWANG_BACKEND_URL` in Vercel **Settings -> Environment Variables** matches the exact `https://...ts.net` URL (no trailing slash, no spaces), and trigger a **Redeploy**.
6. **External data source failing (`503 data_unavailable`):**
   - Test Open-Meteo and BPBD directly (see `HOW TO RUN.md` section 4):
     ```powershell
     Resolve-DnsName api.open-meteo.com
     Resolve-DnsName bpbd.jakarta.go.id
     ```
   - If Windows DNS fails (`11001`), run `ipconfig /flushdns`.
