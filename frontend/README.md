# Pawang AI: Frontend

Next.js dashboard (Leaflet map + analysis sidebar). It shows flood predictions from the FastAPI backend in
[`../backend`](../backend), which calls the trained model in [`../Pawang_Prediction_Model`](../Pawang_Prediction_Model).

## Run the whole demo (backend + frontend)

From the repository root, in PowerShell:

```powershell
cd frontend; npm install; cd ..        # first time only
.\scripts\run-demo.ps1                 # archive replay of 2020-02-25: no internet, no Qwen
.\scripts\run-demo.ps1 -Live -Qwen     # live Open-Meteo forecast + Qwen agents (needs Ollama)
```

Open <http://localhost:3000>. Ctrl+C stops both servers. The script refuses to start if port 8000 or 3000 is taken.

Manual start (two terminals):

```powershell
# backend/
$env:PAWANG_DATA_MODE="replay"; $env:QWEN_ENABLED="false"; python -m uvicorn app.main:app --port 8000
# frontend/
$env:PAWANG_DEMO_DATE="2020-02-25"; npm run dev
```

## How the UI gets its data

The browser calls the Next.js routes `/api/v1/heatmap`, `/api/v1/analysis` and `/api/v1/status`; they forward to the
backend (`src/lib/backend.ts`). The banner under the status pill always says what you are looking at:

| Banner | Meaning |
| --- | --- |
| "Prediksi model" / "Data arsip (replay)" + date | Real output of the flood model. In replay mode a date picker selects the archive day; the 1h-24h buttons have no effect there. |
| "Data belum tersedia" (red) | Backend is up but has no data for that day. The map is cleared; nothing is made up. |
| "Backend tidak terhubung" (amber) | Backend is down. Built-in demo data is shown instead, which is NOT a model prediction. |

Map colour = the model's flood probability per kecamatan, scaled between the lowest and highest area on screen (the legend
shows both values). Water-gate, shelter and radar-ring layers only exist as demo data, so they are switched off whenever real
data is shown. Fields the backend has no source for (siaga level, peak time, inundation range, evacuation route) show
"Belum tersedia".

## Settings (server-side environment variables)

| Variable | Default | Meaning |
| --- | --- | --- |
| `PAWANG_BACKEND_URL` | `http://127.0.0.1:8000` | Where the FastAPI backend runs (use `127.0.0.1`, not `localhost`: Node resolves `localhost` to IPv6) |
| `PAWANG_DEMO_DATE` | none | First archive day shown in replay mode (YYYY-MM-DD) |

## Checks

```bash
npm run typecheck && npm run lint && npm test
```
