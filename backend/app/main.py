"""FastAPI backend for Pawang AI.

    python -m uvicorn app.main:app --reload --port 8000      (run from the backend/ folder)

Routes keep the paths the frontend already calls (/api/v1/heatmap, /api/v1/analysis), so the frontend team
only has to point its fetch at this server instead of the mock route handlers.
"""
from __future__ import annotations

import datetime as dt
import re
from contextlib import asynccontextmanager

import httpx
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse

from . import heatmap as H
from .agents import AdviceFacts, AdviceWriter
from .areas import get_catalog
from .audit import AuditLog
from .cache import TTLCache
from .config import Settings, get_settings
from .llm import LLM, NoLLM, QwenClient
from .pipeline import Pipeline
from .predictor import get_predictor
from .tools import ToolRegistry

WIB = dt.timezone(dt.timedelta(hours=7))
HORIZONS = {"1h": 1, "3h": 3, "5h": 5, "12h": 12, "24h": 24}


def target_date_for(horizon: str, now: dt.datetime | None = None) -> dt.date:
    """The model predicts per DAY. A horizon of N hours maps to the calendar day (WIB) that N hours from
    now falls on: at 20:00, '5h' is tomorrow; at 09:00 it is today."""
    if horizon not in HORIZONS:
        raise HTTPException(422, f"time must be one of {list(HORIZONS)}")
    now = now or dt.datetime.now(WIB)
    return (now.astimezone(WIB) + dt.timedelta(hours=HORIZONS[horizon])).date()


def replay_date_range(s: Settings) -> dict | None:
    """First and last target day that replay mode can serve (archive start + rain_history_days - 1 .. archive end)."""
    folder = s.interim_dir / "rain"
    first = next(iter(sorted(folder.glob("*.csv"))), None) if folder.exists() else None
    if first is None:
        return None
    dates = pd.read_csv(first, usecols=["date"], parse_dates=["date"])["date"]
    if dates.empty:
        return None
    lo = dates.min().date() + dt.timedelta(days=s.rain_history_days - 1)
    return {"min": lo.isoformat(), "max": dates.max().date().isoformat()}


def create_app(settings: Settings | None = None, llm: LLM | None = None,
               http: httpx.Client | None = None, audit_enabled: bool = True) -> FastAPI:
    s = settings or get_settings()
    catalog = get_catalog(str(s.models_dir))
    llm = llm or (QwenClient(s) if s.llm_enabled else NoLLM())
    tools = ToolRegistry(s, catalog, http=http)
    pipeline = Pipeline(s, tools, llm, TTLCache(s.cache_ttl_s), AuditLog(s.audit_dir, audit_enabled))
    advice_writer = AdviceWriter(llm)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        if s.data_mode == "live" and s.tma_live_enabled and s.tma_poll_s > 0:
            tools.tma_live.start_polling(s.tma_poll_s)
        try:
            yield
        finally:
            if s.data_mode == "live" and s.tma_live_enabled and s.tma_poll_s > 0:
                tools.tma_live.stop_polling()

    app = FastAPI(title="Pawang AI backend", version="0.1.0", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
                       allow_methods=["GET"], allow_headers=["*"])
    app.state.pipeline = pipeline

    # Optional background poller: builds the water-level history (the model needs yesterday's level) even when nobody
    # calls the API. Off by default (PAWANG_TMA_POLL_S=0); the demo script turns it on for live mode.
    def resolve_date(time: str, date: str | None) -> dt.date:
        if date:
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
                raise HTTPException(422, "date must be YYYY-MM-DD")
            return dt.date.fromisoformat(date)
        if s.data_mode == "replay":
            raise HTTPException(422, "replay mode needs ?date=YYYY-MM-DD (archive data, e.g. 2020-02-25)")
        return target_date_for(time)

    def unavailable(res) -> JSONResponse:
        return JSONResponse(status_code=503, content={
            "status": res.status, "message": res.message, "target_date": res.target_date.isoformat(),
            "request_id": res.request_id})

    @app.get("/", include_in_schema=False)
    def root():
        return RedirectResponse("/docs")

    @app.get("/api/v1/health")
    def health() -> dict:
        fp = get_predictor(str(s.models_dir))
        llm_up = llm.ping() if isinstance(llm, QwenClient) else False
        return {"status": "ok", "data_mode": s.data_mode, "model_unit": fp.unit,
                "model_versions": {m: fp.models[m]["meta"]["model_version"] for m in fp.modes},
                "areas": len(catalog.all()), "tools": tools.capabilities(),
                "llm": {"enabled": s.llm_enabled, "model": s.llm_model, "base_url": s.llm_base_url,
                        "reachable": llm_up},
                "tma_live": tools.tma_live.status() if s.data_mode == "live" and s.tma_live_enabled else None,
                "cache_ttl_s": s.cache_ttl_s,
                "replay_dates": replay_date_range(s) if s.data_mode == "replay" else None}

    @app.get("/api/v1/heatmap")
    def heatmap(time: str = "5h", lat: float = -6.2088, lon: float = 106.8456,
                date: str | None = Query(None, description="Override target day (YYYY-MM-DD)")):
        target = resolve_date(time, date)
        res = pipeline.run(target)
        if res.status != "ok":
            return unavailable(res)
        return H.heatmap_response(res, time, (lat, lon))

    @app.get("/api/v1/analysis")
    def analysis(grid_id: str | None = None, lat: float | None = None, lon: float | None = None,
                 time: str = "5h", date: str | None = None):
        if not grid_id and (lat is None or lon is None):
            raise HTTPException(422, "give grid_id, or lat and lon")
        target = resolve_date(time, date)
        if grid_id and catalog.by_grid_id(grid_id) is None:
            raise HTTPException(404, f"unknown grid_id '{grid_id}'")
        res = pipeline.run(target, grid_id=grid_id, lat=None if grid_id else lat, lon=None if grid_id else lon)
        if res.status != "ok" or not res.areas:
            return unavailable(res)
        a = res.areas[0]
        advice = advice_writer.write(AdviceFacts(a.area.name, target, a.risk_level, a.confidence,
                                                 a.rainfall_mm, a.water_level_cm))
        pipeline.audit.write(res.request_id, {"step": "advice", **advice.audit()})
        return H.analysis_response(res, a, {**advice.value, "decided_by": advice.decided_by})

    return app


app = create_app()
