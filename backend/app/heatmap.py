"""Heatmap Generator (deterministic): pipeline results -> the JSON shapes in frontend/src/data/types.ts.

Fields the system has no data for yet (flood duration, peak time, inundation depth, affected roads,
evacuation routes, shelters, Siaga thresholds) are returned as null or empty lists, never filled with
made-up values. The frontend should show them as "not available".

Geometry: the repo has no kecamatan boundary polygons yet, so each kecamatan is drawn as a small square
around its centroid and the response says so (metadata.geometry = "approximate").
"""
from __future__ import annotations

import datetime as dt

import pandas as pd

from .pipeline import AreaResult, PipelineResult

RISK_TO_FRONTEND = {"low": "Low", "medium": "Medium", "high": "High", "unknown": "Unknown"}
BADGE = {"HIGH": "Data lengkap", "LOW": "Data terbatas"}
HALF_CELL_DEG = 0.012   # ~1.3 km half-width


def _square(lat: float, lon: float) -> list[list[list[float]]]:
    h = HALF_CELL_DEG
    ring = [[lon - h, lat - h], [lon + h, lat - h], [lon + h, lat + h], [lon - h, lat + h], [lon - h, lat - h]]
    return [[[round(x, 6), round(y, 6)] for x, y in ring]]


def grid_properties(a: AreaResult) -> dict:
    return {
        "grid_id": a.area.grid_id,
        "area_name": a.area.name,
        "district": a.area.name,
        "city": "DKI Jakarta",
        "risk_level": RISK_TO_FRONTEND[a.risk_level],
        "flood_probability": None if a.p_flood is None else round(a.p_flood, 4),
        "rainfall_mm": None if a.rainfall_mm is None else round(a.rainfall_mm, 1),
        "water_level_cm": None if a.water_level_cm is None else round(a.water_level_cm),
        "siaga_level": None,
        "duration_est": None,
        "peak_time": None,
        "inundation_range": None,
        "confidence": a.confidence,
        "confidence_score": None,
        "confidence_badge": BADGE[a.confidence],
        "model_mode": a.model_mode,
        "model_version": a.model_version,
        "recommendation": None,
        "evacuation_route": None,
        "affected_roads": [],
    }


def heatmap_response(r: PipelineResult, horizon: str, center: tuple[float, float]) -> dict:
    features = [{"type": "Feature", "properties": grid_properties(a),
                 "geometry": {"type": "Polygon", "coordinates": _square(a.area.lat, a.area.lon)}}
                for a in r.areas]
    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "forecast_horizon": horizon,
            "target_date": r.target_date.isoformat(),
            "center": list(center),
            "total_grids": len(features),
            "high_risk_count": sum(a.risk_level == "high" for a in r.areas),
            "status": r.status,
            "message": r.message or None,
            "geometry": "approximate",
            "request_id": r.request_id,
            "cached": r.cached,
        },
    }


def hydrograph(r: PipelineResult, a: AreaResult, days: int = 7) -> list[dict]:
    """Daily rainfall (mean over the kecamatan's grid points) and max water level for the last `days` days."""
    if r.rain is None:
        return []
    start = pd.Timestamp(r.target_date - dt.timedelta(days=days - 1))
    rain = r.rain[r.rain["point_id"].isin(a.area.point_ids) & (r.rain["date"] >= start)]
    rain = rain.groupby("date")["precip_mm"].mean()
    tma = None
    if r.water_level is not None and len(r.water_level):
        w = r.water_level[r.water_level["station_id"].isin(a.area.station_ids)]
        tma = w.groupby("date")["tma_max"].max()
    out = []
    for d, mm in rain.items():
        wl = tma.get(d) if tma is not None else None
        out.append({"time": d.date().isoformat(), "rainfall": round(float(mm), 1),
                    "waterLevel": None if wl is None or pd.isna(wl) else round(float(wl)),
                    "threshold": None})
    return out


def analysis_response(r: PipelineResult, a: AreaResult, advice: dict) -> dict:
    p = grid_properties(a)
    stations = []
    if r.water_level is not None and len(r.water_level):
        w = r.water_level[r.water_level["station_id"].isin(a.area.station_ids)].sort_values("date")
        for sid, g in w.groupby("station_id"):
            last = g.iloc[-1]
            stations.append({"id": sid, "name": sid.title(), "currentLevelCm": round(float(last["tma_max"])),
                             "updatedAt": last["date"].date().isoformat(), "status": None,
                             "siaga3Cm": None, "siaga2Cm": None, "siaga1Cm": None})
    return {
        **{k: p[k] for k in ("grid_id", "area_name", "district", "city", "risk_level", "flood_probability",
                             "duration_est", "confidence", "confidence_badge", "confidence_score",
                             "rainfall_mm", "water_level_cm", "siaga_level", "peak_time", "inundation_range",
                             "evacuation_route", "affected_roads", "model_mode", "model_version")},
        "target_date": r.target_date.isoformat(),
        "recommendation": advice["recommendation"],
        "commuter_advisory": advice["commuter_advisory"],
        "advice_by": advice.get("decided_by"),
        "hydrograph": hydrograph(r, a),
        "nearby_stations": stations,
        "safe_shelters": [],
        "last_updated": dt.datetime.now(dt.timezone.utc).isoformat(),
        "request_id": r.request_id,
    }
