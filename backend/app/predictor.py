"""Bridge between tool outputs and the trained model (FloodPredictor).

The model team's rule is that features are built by the SAME functions in training and inference
(Pawang_Prediction_Model/src/features.py). This module only arranges tool data into the shape those
functions expect, then calls FloodPredictor. It never computes a probability itself.
"""
from __future__ import annotations

import datetime as dt
from functools import lru_cache

import pandas as pd

from . import config  # noqa: F401  (puts Pawang_Prediction_Model on sys.path)
from src.features import rain_features, tma_features  # type: ignore  # noqa: E402
from src.predict import FloodPredictor  # type: ignore  # noqa: E402

from .areas import Kecamatan


@lru_cache(maxsize=2)
def get_predictor(models_dir: str) -> FloodPredictor:
    return FloodPredictor(models_dir)


def build_kelurahan_features(fp: FloodPredictor, areas: list[Kecamatan], target_date: dt.date,
                             rain: pd.DataFrame, tma: pd.DataFrame | None) -> pd.DataFrame:
    """One row per kelurahan for the target day, with rain, (optional) water-level and static features."""
    target = pd.Timestamp(target_date)
    kel = pd.DataFrame([
        {"cell_id": k.cell_id, "point_id": k.point_id, "station_id": k.station_id}
        for a in areas for k in a.kelurahan
    ])

    rf = rain_features(rain, id_col="point_id")
    rf = rf[rf["date"] == target].drop(columns=["date"])
    df = kel.merge(rf, on="point_id", how="left")

    if tma is not None and len(tma) and fp.tma_reference is not None:
        tf = tma_features(tma, id_col="station_id", reference=fp.tma_reference)
        tf = tf[tf["date"] == target].drop(columns=["date"])
        df = df.merge(tf, on="station_id", how="left")

    df["date"] = target
    df = fp.with_static_kelurahan(df)
    return df.drop(columns=["point_id", "station_id"])


def predict(fp: FloodPredictor, kel_features: pd.DataFrame, mode: str) -> pd.DataFrame:
    """mode: 'auto' (full where water level is complete, else rainfall_only) or 'rainfall_only'.
    strict=False: a unit with incomplete features comes back as risk_level='unknown', never a guess."""
    return fp.predict_from_kelurahan(kel_features, mode=mode, strict=False)


def unit_inputs(kel_features: pd.DataFrame, fp: FloodPredictor) -> pd.DataFrame:
    """Kecamatan-level inputs (same aggregation as the model) — shown to users as rainfall/water level."""
    return fp.to_units(kel_features)
