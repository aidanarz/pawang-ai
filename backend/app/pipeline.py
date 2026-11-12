"""The main flow from the project document (section 3.1 d), in code:

  request -> cache? -> Agent 1 plans tools -> tools fetch -> Agent 3 checks freshness
          -> Agent 2 retries / falls back / reports unavailable -> model predicts -> cache -> response

Confidence follows the document: HIGH when the area was predicted on complete, valid data with the full
model; LOW when it ran degraded (rainfall-only, partial or fallback data).
"""
from __future__ import annotations

import datetime as dt
import uuid
from dataclasses import dataclass, field

import pandas as pd

from . import predictor as P
from .agents import (DataFetchOrchestrator, FailureHandler, FreshnessChecker, Verdict)
from .areas import Kecamatan
from .audit import AuditLog
from .cache import TTLCache
from .config import Settings
from .llm import LLM
from .waterlevel import SIAGA_RANK, WIB
from .tools import ToolRegistry, ToolResult


@dataclass
class AreaResult:
    area: Kecamatan
    p_flood: float | None
    risk_level: str            # low | medium | high | unknown
    model_mode: str | None     # full | rainfall_only | None
    model_version: str | None
    confidence: str            # HIGH | LOW
    rainfall_mm: float | None  # target-day rainfall (unit mean), the same value the model saw
    water_level_cm: float | None
    siaga_level: str | None = None   # worst live siaga label among the area's stations (live BPBD only)


@dataclass
class PipelineResult:
    request_id: str
    target_date: dt.date
    status: str                # ok | data_unavailable
    areas: list[AreaResult] = field(default_factory=list)
    rain: pd.DataFrame | None = None
    water_level: pd.DataFrame | None = None
    verdicts: dict[str, Verdict] = field(default_factory=dict)
    message: str = ""
    cached: bool = False
    trace: list[dict] = field(default_factory=list)


def _f(x) -> float | None:
    return None if x is None or pd.isna(x) else float(x)


class Pipeline:
    def __init__(self, s: Settings, tools: ToolRegistry, llm: LLM, cache: TTLCache, audit: AuditLog):
        self.s, self.tools, self.llm, self.cache, self.audit = s, tools, llm, cache, audit
        self.agent1 = DataFetchOrchestrator(llm)
        self.agent3 = FreshnessChecker(s)
        self.agent2 = FailureHandler(llm)

    def run(self, target_date: dt.date, grid_id: str | None = None,
            lat: float | None = None, lon: float | None = None) -> PipelineResult:
        key = ("v1", self.s.data_mode, target_date.isoformat(), grid_id or "", lat, lon)
        hit = self.cache.get(key)
        if hit is not None:
            hit.cached = True
            return hit

        rid = uuid.uuid4().hex[:12]
        trace: list[dict] = []
        res = PipelineResult(request_id=rid, target_date=target_date, status="ok", trace=trace)

        area_res = self.tools.resolve_area(grid_id=grid_id, lat=lat, lon=lon)
        trace.append({"step": "tool", **area_res.summary()})
        if not area_res.ok:
            res.status, res.message = "data_unavailable", area_res.error or "unknown area"
            self.audit.write(rid, {"target_date": target_date, "grid_id": grid_id, "trace": trace,
                                   "status": res.status})
            return res
        areas: list[Kecamatan] = area_res.data
        point_ids = sorted({k.point_id for a in areas for k in a.kelurahan})
        station_ids = sorted({k.station_id for a in areas for k in a.kelurahan if k.station_id})

        # Agent 1: which tools?
        plan = self.agent1.plan([a.name for a in areas], self.tools.capabilities())
        trace.append({"step": "agent", **plan.audit()})

        calls = {
            "get_static_features": lambda: self.tools.get_static_features(
                kelurahan_ids=[k.cell_id for a in areas for k in a.kelurahan]),
            "get_weather_forecast": lambda: self.tools.get_weather_forecast(point_ids=point_ids, target_date=target_date),
            "get_water_level": lambda: self.tools.get_water_level(station_ids=station_ids, target_date=target_date),
        }
        results: dict[str, ToolResult] = {}
        tools_to_call = list(plan.value["tools"])
        # Live gauges stop at "now": a future target day can never have a reading, so skip the fetch (and the
        # retry/LLM round it would trigger) and run rainfall-only. Confidence is LOW because the water level is absent.
        if self.s.data_mode == "live" and target_date > dt.datetime.now(WIB).date() and "get_water_level" in tools_to_call:
            tools_to_call.remove("get_water_level")
            trace.append({"step": "skip", "tool": "get_water_level", "reason": "target day is in the future"})
        for name in tools_to_call:
            results[name] = calls[name]()
            trace.append({"step": "tool", **results[name].summary()})

        # Agent 3 checks, Agent 2 handles failures: rainfall first (it is required), then water level.
        rain_v = self.agent3.check_rain(results.get("get_weather_forecast"), point_ids, target_date)
        trace.append({"step": "agent", "agent": self.agent3.name, "value": rain_v.__dict__, "decided_by": "rules"})
        attempts = 1
        while not rain_v.ok:
            d = self.agent2.decide(rain_v, attempts)
            trace.append({"step": "agent", **d.audit()})
            if d.value["action"] == "retry":
                attempts += 1
                results["get_weather_forecast"] = r = calls["get_weather_forecast"]()
                r.attempts = attempts
                trace.append({"step": "tool", **r.summary()})
                rain_v = self.agent3.check_rain(r, point_ids, target_date)
                trace.append({"step": "agent", "agent": self.agent3.name, "value": rain_v.__dict__,
                              "decided_by": "rules"})
                continue
            res.status = "data_unavailable"
            res.message = f"Rainfall data unavailable: {rain_v.detail}"
            break
        res.verdicts["rain"] = rain_v

        tma_v = self.agent3.check_water_level(results.get("get_water_level"), station_ids, target_date)
        trace.append({"step": "agent", "agent": self.agent3.name, "value": tma_v.__dict__, "decided_by": "rules"})
        attempts = 1
        while res.status == "ok" and tma_v.status in ("missing", "stale", "incomplete"):
            d = self.agent2.decide(tma_v, attempts)
            trace.append({"step": "agent", **d.audit()})
            if d.value["action"] == "retry":
                attempts += 1
                results["get_water_level"] = r = calls["get_water_level"]()
                r.attempts = attempts
                trace.append({"step": "tool", **r.summary()})
                tma_v = self.agent3.check_water_level(r, station_ids, target_date)
                trace.append({"step": "agent", "agent": self.agent3.name, "value": tma_v.__dict__,
                              "decided_by": "rules"})
                continue
            break   # fallback_rainfall_only
        res.verdicts["water_level"] = tma_v

        if res.status == "ok":
            self._predict(res, areas, results, rain_v, tma_v, target_date)

        trace.append({"step": "result", "status": res.status,
                      "risk_counts": pd.Series([a.risk_level for a in res.areas]).value_counts().to_dict()
                      if res.areas else {}})
        self.audit.write(rid, {"target_date": target_date, "grid_id": grid_id, "lat": lat, "lon": lon,
                               "data_mode": self.s.data_mode, "llm": self.llm.name, "trace": trace,
                               "status": res.status})
        self.cache.set(key, res)
        return res

    def _predict(self, res: PipelineResult, areas: list[Kecamatan], results: dict[str, ToolResult],
                 rain_v: Verdict, tma_v: Verdict, target_date: dt.date) -> None:
        fp = P.get_predictor(str(self.s.models_dir))
        rain = results["get_weather_forecast"].data
        tma = results["get_water_level"].data if tma_v.ok and "get_water_level" in results else None
        kf = P.build_kelurahan_features(fp, areas, target_date, rain, tma)
        out = P.predict(fp, kf, mode="auto" if tma is not None else "rainfall_only")
        units = P.unit_inputs(kf, fp).set_index("cell_id")
        siaga = results["get_water_level"].extra.get("siaga", {}) if tma is not None else {}
        res.rain, res.water_level = rain, tma
        for a in areas:
            row = out[out["cell_id"] == a.cell_id]
            u = units.loc[a.cell_id] if a.cell_id in units.index else None
            if row.empty:
                continue
            r = row.iloc[0]
            mode = r["mode"] if isinstance(r["mode"], str) else None
            res.areas.append(AreaResult(
                area=a, p_flood=_f(r["p_flood"]), risk_level=r["risk_level"], model_mode=mode,
                model_version=r["model_version"] if isinstance(r["model_version"], str) else None,
                confidence="HIGH" if (mode == "full" and rain_v.ok and tma_v.ok) else "LOW",
                rainfall_mm=_f(u["rain_d0"]) if u is not None else None,
                water_level_cm=_f(u["tma_max"]) if u is not None and "tma_max" in u.index else None,
                siaga_level=max((siaga[s] for s in a.station_ids if s in siaga), key=SIAGA_RANK.get, default=None),
            ))
