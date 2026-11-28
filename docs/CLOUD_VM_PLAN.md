# Pawang AI — Option B: Always-On Cloud VM Migration Plan

> **Status:** Planning document only (not executed). Use Option A ([DEPLOYMENT.md](./DEPLOYMENT.md)) for the presentation, then follow this plan when the team is ready to move the backend off a personal laptop onto a 24/7 cloud server.

---

## 1. Why Move to a Cloud VM?

Running the backend on a laptop works for demos, but has real operational limits:
- Laptop battery, Wi-Fi drops, OS updates, or closing the lid can take the API offline.
- BPBD water-level history (`backend/data/tma_live.csv`) needs continuous 24/7 polling (`PAWANG_TMA_POLL_S=1800`) to keep `full` model mode active every day without gaps.
- The Flood Watch Agent (`PAWANG_WATCH_INTERVAL_S=1800`) and persistent audit logs (`backend/logs/`) are designed for a single always-on process.
- Vercel serverless functions cannot host this backend because they are stateless, time-limited, and cannot run Ollama or background polling threads.

---

## 2. Recommended VM Options

| Provider & Plan | Specs | Cost | Pros / Cons |
| :--- | :--- | :--- | :--- |
| **Oracle Cloud Always Free (Ampere A1 ARM)** *(Recommended)* | Up to 4 ARM OCPUs, 24 GB RAM, 200 GB block volume, 10 TB egress/mo | **$0 / month** (Always Free tier) | Enough RAM to run FastAPI + Ollama (`qwen3.5:4b`) + self-hosted Valhalla together. Requires credit card for identity verification; free-tier capacity in Singapore (`ap-singapore-1`) can sometimes be scarce (upgrading to Pay-As-You-Go while staying within Always Free limits unlocks capacity immediately with $0 bill). |
| **Hetzner Cloud (CX32 / CAX21)** | 4 vCPU, 8 GB RAM, 80 GB SSD | ~€5–€7 / month | Very reliable, fast provisioning, predictable pricing. Singapore region available. Enough for FastAPI + Ollama `qwen3.5:4b` (tight if also self-hosting Valhalla). |
| **DigitalOcean / Vultr / GCP e2** | 2–4 vCPU, 4–8 GB RAM | ~$24–$48 / month | Familiar UX; GCP Student/Free Trial credits ($300 for 90 days) work well if the team has university credits. |

**Best region for Jakarta latency:** Singapore (`ap-singapore-1` / `sin`) or Jakarta (`ap-southeast-2` / `asia-southeast2`).

---

## 3. LLM Options & Trade-Offs

Because `backend/app/llm.py` already supports both Ollama (`QWEN_API_STYLE=ollama`) and any OpenAI-compatible endpoint (`QWEN_API_STYLE=openai`), switching LLM hosting requires **zero code changes** — only editing `backend/.env`.

| Option | How to Configure (`backend/.env`) | Speed per Call | Monthly Cost | Trade-Offs |
| :--- | :--- | :---: | :---: | :--- |
| **1. Self-hosted Ollama on CPU VM** (`qwen3.5:4b`) | `QWEN_ENABLED=true`, `QWEN_API_STYLE=ollama`, `QWEN_BASE_URL=http://127.0.0.1:11434/v1`, `QWEN_MODEL=qwen3.5:4b` | ~6–18 s on 4 ARM OCPUs | **$0** (on Oracle Free) | Full privacy, zero API bills, same stack as local dev. Slower on CPU (especially if multiple users hit `/analysis` or `/route` concurrently). Needs ~4–6 GB RAM. |
| **2. Hosted OpenAI-compatible Qwen API** (Alibaba DashScope, OpenRouter, Together, Fireworks) | `QWEN_ENABLED=true`, `QWEN_API_STYLE=openai`, `QWEN_BASE_URL=<provider>/v1`, `QWEN_API_KEY=<key>`, `QWEN_MODEL=qwen-plus` or `qwen2.5-7b-instruct` | **~1–3 s** | ~$1–$5/mo at low traffic | Fastest UX, lets you run a tiny 2 GB RAM VM ($0–$4/mo), much better tool-calling accuracy (7B–32B models). Sends non-sensitive district/weather text to a third-party API; watch out for `think` tokens on Qwen 3.x when using `openai` style. |
| **3. Rules-only / LLM off** | `QWEN_ENABLED=false` | **< 100 ms** | **$0** | 100% deterministic Indonesian templates, zero guardrail rejections, runs on a 1 GB RAM VM. Loses natural-language nuance in advice, route explanations, and Flood Watch reasoning. |

**Recommendation:** Start on **Oracle Cloud Always Free (4 OCPU, 24 GB RAM)** with **Option 1 (self-hosted Ollama `qwen3.5:4b`)** for zero cost, and switch to **Option 2 (hosted Qwen API)** if user traffic grows and CPU latency becomes noticeable.

---

## 4. Routing Engine Upgrade (Self-Hosted Valhalla)

Currently `PAWANG_ROUTE_URL=https://valhalla1.openstreetmap.de` uses the public FOSSGIS demo server (rate-limited, no SLA, 10 km `exclude_polygons` cap).

On a 24 GB RAM cloud VM (e.g., Oracle Ampere A1), self-host Valhalla for Java/Jakarta using Docker:
1. Download the Java OSM extract (`java-latest.osm.pbf`, ~300 MB) from Geofabrik (`https://download.geofabrik.de/asia/indonesia/java.html`).
2. Run `ghcr.io/gis-ops/docker-valhalla/valhalla:latest` bound to `127.0.0.1:8002` (~2–4 GB RAM during tile build, ~1–2 GB RAM at runtime).
3. Set `PAWANG_ROUTE_URL=http://127.0.0.1:8002` in `backend/.env` — **no backend code changes needed** (`backend/app/routing.py` already works with self-hosted Valhalla).

---

## 5. Production Linux Architecture (Target Stack)

```text
Vercel (https://pawang-ai-eight.vercel.app)
  -> HTTPS (Caddy reverse proxy w/ auto Let's Encrypt OR Tailscale Funnel)
     -> systemd: pawang-backend.service
        (uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1)
        ├── systemd: ollama.service (127.0.0.1:11434)
        ├── Docker: valhalla (127.0.0.1:8002, optional)
        └── Persistent disk:
            ├── backend/data/tma_live.csv
            ├── backend/data/reports.jsonl
            ├── backend/data/floodwatch_memory_live.json
            └── backend/logs/audit-YYYY-MM-DD.jsonl
```

### Key Production Settings on the VM
- **One worker (`--workers 1`)**: required for in-memory cache, `WatchScheduler`, and file locks.
- **Persistent `.env`**: `PAWANG_DATA_MODE=live`, `PAWANG_WATCH_INTERVAL_S=1800`, `PAWANG_TMA_POLL_S=1800`, `PAWANG_ADMIN_TOKEN=<40-char random>`, and consider `PAWANG_REPORTS_DEMO=false` once real users are onboarded.
- **HTTPS**:
  - If you buy a cheap domain (~$1–$10/yr): point `api.pawang-ai.example` to the VM's public IP and run **Caddy** (`reverse_proxy 127.0.0.1:8000`) for automatic Let's Encrypt HTTPS.
  - If you still don't want a domain: run **Tailscale Funnel** on the Linux VM (`tailscale funnel --bg 8000`) — identical setup to Windows.
- **Security**:
  - Firewall (`ufw`): allow only SSH (`22`) and HTTPS (`443`) — never expose port `8000` (FastAPI), `11434` (Ollama), or `8002` (Valhalla) directly to the internet.
  - Keep `PAWANG_ADMIN_TOKEN` set so `/api/v1/admin/agent-log` and `/api/v1/watch/*` require authentication.
- **Monitoring & Backups**:
  - Add a free external uptime check (UptimeRobot / Better Stack) pinging `https://<your-api>/api/v1/health` every 5 minutes and alerting on email/Discord/Telegram.
  - Back up `backend/data/` and `backend/logs/` daily via cron (already auto-pruned to 10 days for TMA and 30 days for audit logs).

---

## 6. High-Level Migration Checklist (When Ready)

1. Provision Ubuntu 24.04 VM (Oracle Always Free Ampere A1 in Singapore, 4 OCPU / 24 GB RAM / 100 GB disk).
2. Install Python 3.12+, `git`, `caddy` (or `tailscale`), and `ollama`; pull `qwen3.5:4b`.
3. Clone the repo, create `backend/.venv`, install `backend/requirements.txt`, copy `.env.example` -> `.env`, set a fresh `PAWANG_ADMIN_TOKEN`.
4. Copy existing `backend/data/tma_live.csv` from your laptop so the full model has yesterday's water-level history immediately.
5. Create `/etc/systemd/system/pawang-backend.service` with `Restart=always`, `RestartSec=5`, `--workers 1`, and enable it (`systemctl enable --now pawang-backend`).
6. Configure HTTPS (Caddy or Tailscale Funnel) and verify `https://<new-host>/api/v1/health` returns `200 OK`.
7. Update `PAWANG_BACKEND_URL` in Vercel and redeploy.
8. Verify the live site works, then disable the laptop Task Scheduler job (`.\backend\scripts\uninstall_task.ps1 -StopRunning`).
