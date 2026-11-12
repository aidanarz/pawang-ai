"""Tool Registry (deterministic). The four tools named in the project document:

    resolve_area, get_weather_forecast, get_water_level, get_static_features

Agents choose WHICH tools to call; tools are plain Python that fetch or look up data and never guess.
Every call returns a ToolResult that records where the data came from and how old it is, so Agent 3
(Freshness Checker) can judge it and the audit log can show exactly what the model was fed.
"""
from __future__ import annotations

import datetime as dt
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

import httpx
import pandas as pd

from .areas import AreaCatalog
from .config import Settings
from .waterlevel import BpbdWaterLevel, TmaStore, WaterLevelError

UTC = dt.timezone.utc
OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"


@dataclass
class ToolResult:
    tool: str
    ok: bool
    source: str
    data: Any = None
    fetched_at: dt.datetime = field(default_factory=lambda: dt.datetime.now(UTC))
    data_as_of: dt.datetime | None = None   # timestamp of the newest observation/issue (live sources)
    covers_until: dt.date | None = None     # last calendar day present in the data
    error: str | None = None
    attempts: int = 1
    elapsed_ms: int = 0
    extra: dict = field(default_factory=dict)   # tool-specific side data (e.g. latest siaga per station)

    def summary(self) -> dict:
        """Compact, JSON-safe view for the audit log and for prompts (no raw tables)."""
        rows = len(self.data) if isinstance(self.data, (pd.DataFrame, list)) else None
        return {
            "tool": self.tool, "ok": self.ok, "source": self.source, "rows": rows,
            "fetched_at": self.fetched_at.isoformat(),
            "data_as_of": self.data_as_of.isoformat() if self.data_as_of else None,
            "covers_until": self.covers_until.isoformat() if self.covers_until else None,
            "error": self.error, "attempts": self.attempts, "elapsed_ms": self.elapsed_ms,
        }


def _timed(fn: Callable[..., ToolResult]) -> Callable[..., ToolResult]:
    def wrapper(*args, **kwargs) -> ToolResult:
        t0 = time.perf_counter()
        try:
            res = fn(*args, **kwargs)
        except Exception as exc:  # a tool must never crash the request; it reports failure instead
            res = ToolResult(tool=fn.__name__, ok=False, source="error", error=f"{type(exc).__name__}: {exc}")
        res.elapsed_ms = int((time.perf_counter() - t0) * 1000)
        return res
    wrapper.__name__ = fn.__name__
    return wrapper


def _window(target: dt.date, days: int) -> tuple[dt.date, dt.date]:
    return target - dt.timedelta(days=days - 1), target


def _parse_point(point_id: str) -> tuple[float, float]:
    lat, lon = point_id.split("_")
    return float(lat), float(lon)


class ToolRegistry:
    """Holds the tools plus their data providers. `http` is injectable so tests never touch the network."""

    def __init__(self, settings: Settings, catalog: AreaCatalog, http: httpx.Client | None = None):
        self.s = settings
        self.catalog = catalog
        self.http = http or httpx.Client(timeout=20.0)
        self._tma_history: pd.DataFrame | None = None
        self.tma_live = BpbdWaterLevel(settings.tma_url, TmaStore(settings.tma_store_path), http=self.http,
                                       min_interval_s=settings.tma_min_interval_s)

    # ---- capabilities: what Agent 1 is allowed to plan with -------------------------------------
    def capabilities(self) -> dict[str, dict]:
        live = self.s.data_mode == "live"
        return {
            "resolve_area": {"available": True},
            "get_weather_forecast": {"available": True, "source": "open-meteo-forecast" if live else "archive-replay"},
            "get_water_level": {
                "available": (not live) or self.s.tma_live_enabled,
                "source": "archive-replay" if not live else ("bpbd-scrape" if self.s.tma_live_enabled else None),
                "note": None if (not live or self.s.tma_live_enabled) else "no live water-level source configured",
            },
            "get_static_features": {"available": True, "source": "model-files"},
        }

    # ---- 1. resolve_area ---------------------------------------------------------------------------
    @_timed
    def resolve_area(self, grid_id: str | None = None, lat: float | None = None,
                     lon: float | None = None) -> ToolResult:
        if grid_id:
            k = self.catalog.by_grid_id(grid_id)
            if k is None:
                return ToolResult("resolve_area", ok=False, source="catalog", error=f"unknown grid_id '{grid_id}'")
            areas = [k]
        elif lat is not None and lon is not None:
            areas = [self.catalog.nearest(lat, lon)]
        else:
            areas = self.catalog.all()
        return ToolResult("resolve_area", ok=True, source="catalog", data=areas)

    # ---- 2. get_weather_forecast -------------------------------------------------------------------
    @_timed
    def get_weather_forecast(self, point_ids: list[str], target_date: dt.date) -> ToolResult:
        """Daily rainfall (mm) per grid point for the `rain_history_days` days ending on target_date."""
        if self.s.data_mode == "replay":
            return self._rain_replay(point_ids, target_date)
        return self._rain_open_meteo(point_ids, target_date)

    def _rain_replay(self, point_ids: list[str], target_date: dt.date) -> ToolResult:
        start, end = _window(target_date, self.s.rain_history_days)
        frames = []
        for pid in point_ids:
            p = Path(self.s.interim_dir) / "rain" / f"{pid}.csv"
            if not p.exists():
                continue
            d = pd.read_csv(p, parse_dates=["date"])
            d = d[(d["date"].dt.date >= start) & (d["date"].dt.date <= end)]
            frames.append(d.assign(point_id=pid))
        if not frames:
            return ToolResult("get_weather_forecast", ok=False, source="archive-replay",
                              error="no archived rainfall for these points")
        data = pd.concat(frames, ignore_index=True)[["point_id", "date", "precip_mm"]]
        return ToolResult("get_weather_forecast", ok=True, source="archive-replay", data=data,
                          covers_until=data["date"].max().date() if len(data) else None)

    def _rain_open_meteo(self, point_ids: list[str], target_date: dt.date) -> ToolResult:
        today = dt.datetime.now(UTC).astimezone(dt.timezone(dt.timedelta(hours=7))).date()
        past_days = (today - (target_date - dt.timedelta(days=self.s.rain_history_days - 1))).days
        forecast_days = max(1, (target_date - today).days + 1)
        coords = [_parse_point(p) for p in point_ids]
        params = {
            "latitude": ",".join(f"{la:.4f}" for la, _ in coords),
            "longitude": ",".join(f"{lo:.4f}" for _, lo in coords),
            "daily": "precipitation_sum", "timezone": self.s.timezone,
            "past_days": max(0, min(past_days, 92)), "forecast_days": min(forecast_days, 16),
        }
        r = self.http.get(OPEN_METEO_FORECAST_URL, params=params)
        r.raise_for_status()
        payload = r.json()
        payload = payload if isinstance(payload, list) else [payload]   # one object per location
        frames = []
        for pid, loc in zip(point_ids, payload):
            daily = loc.get("daily", {})
            frames.append(pd.DataFrame({"point_id": pid, "date": pd.to_datetime(daily.get("time", [])),
                                        "precip_mm": daily.get("precipitation_sum", [])}))
        data = pd.concat(frames, ignore_index=True)
        start, end = _window(target_date, self.s.rain_history_days)
        data = data[(data["date"].dt.date >= start) & (data["date"].dt.date <= end)]
        now = dt.datetime.now(UTC)
        return ToolResult("get_weather_forecast", ok=True, source="open-meteo-forecast", data=data,
                          fetched_at=now, data_as_of=now,
                          covers_until=data["date"].max().date() if len(data) else None)

    # ---- 3. get_water_level ------------------------------------------------------------------------
    @_timed
    def get_water_level(self, station_ids: list[str], target_date: dt.date) -> ToolResult:
        """Daily maximum water level (cm) per station for the 3 days ending on target_date."""
        if self.s.data_mode != "replay":
            return self._water_level_live(station_ids, target_date)
        if self._tma_history is None:
            p = Path(self.s.interim_dir) / "tma_daily.csv"
            self._tma_history = pd.read_csv(p, parse_dates=["date"]) if p.exists() else pd.DataFrame()
        h = self._tma_history
        if h.empty:
            return ToolResult("get_water_level", ok=False, source="archive-replay", error="no archived water level")
        start, end = _window(target_date, 3)
        d = h[h["station_id"].isin(station_ids) & (h["date"].dt.date >= start) & (h["date"].dt.date <= end)]
        d = d[["station_id", "date", "tma_max"]].reset_index(drop=True)
        return ToolResult("get_water_level", ok=True, source="archive-replay", data=d,
                          covers_until=d["date"].max().date() if len(d) else None)

    def _water_level_live(self, station_ids: list[str], target_date: dt.date) -> ToolResult:
        """BPBD page -> history -> daily maximum per model station. A failed fetch is not fatal if the history still
        holds recent readings: Agent 3 judges their age (data_as_of) and decides whether they are fresh enough."""
        if not self.s.tma_live_enabled:
            return ToolResult("get_water_level", ok=False, source="none",
                              error="no live water-level source configured (PAWANG_TMA_LIVE=false)")
        refresh_error = None
        try:
            self.tma_live.refresh()
        except WaterLevelError as exc:
            refresh_error = str(exc)
        data, as_of, extra = self.tma_live.daily(station_ids, target_date)
        if data.empty:
            return ToolResult("get_water_level", ok=False, source="bpbd-scrape",
                              error=refresh_error or "no stored BPBD readings for these stations on the target days")
        if refresh_error:
            extra = {**extra, "refresh_error": refresh_error}
        return ToolResult("get_water_level", ok=True, source="bpbd-scrape", data=data, data_as_of=as_of,
                          covers_until=data["date"].max().date(), extra=extra)

    # ---- 4. get_static_features --------------------------------------------------------------------
    @_timed
    def get_static_features(self, kelurahan_ids: list[str]) -> ToolResult:
        st = self.catalog.kelurahan_static
        d = st[st["cell_id"].isin(kelurahan_ids)].reset_index(drop=True)
        return ToolResult("get_static_features", ok=True, source="model-files", data=d)
