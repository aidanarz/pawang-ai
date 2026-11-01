"""Definisi fitur. Fungsi yang sama dipakai saat training dan inference agar tidak ada selisih.

Konvensi waktu: jendela berakhir di HARI TARGET (inklusif). Saat training, hari target berisi
curah hujan hasil reanalisis; saat inference, hari target diisi prakiraan (misal BMKG `tp`
dijumlahkan per hari) sedangkan hari-hari sebelumnya berisi data pengamatan/reanalisis.
Dengan cara ini horizon (hari ini, besok, lusa) ditentukan oleh hari target yang dipilih.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from . import config

RAIN_FEATURES = [
    "rain_d0", "rain_d1", "rain_3d", "rain_7d", "rain_14d", "rain_30d",
    "rain_max_7d", "wet_days_7d", "month_sin", "month_cos",
]
STATIC_FEATURES = ["elev_mean", "elev_min", "elev_std", "elev_rel_3km"]
LATLON_FEATURES = ["lat", "lon"]
TMA_FEATURES = ["tma_max", "tma_pct", "tma_delta1", "tma_max_3d"]


def feature_list(mode: str) -> list[str]:
    base = RAIN_FEATURES + STATIC_FEATURES + (LATLON_FEATURES if config.USE_LATLON else [])
    if mode == "rainfall_only":
        return base
    if mode == "full":
        return base + TMA_FEATURES
    raise ValueError(f"mode tidak dikenal: {mode}")


def _to_long(wide: pd.DataFrame, name: str, id_col: str) -> pd.DataFrame:
    t = wide.copy()
    t.index.name = "date"
    t.columns.name = id_col
    return t.reset_index().melt(id_vars="date", var_name=id_col, value_name=name)


def _wide(df: pd.DataFrame, id_col: str, value_col: str) -> pd.DataFrame:
    d = df[[id_col, "date", value_col]].copy()
    d["date"] = pd.to_datetime(d["date"]).dt.normalize()
    w = d.pivot_table(index="date", columns=id_col, values=value_col, aggfunc="mean").sort_index()
    return w.reindex(pd.date_range(w.index.min(), w.index.max(), freq="D"))


def _merge_all(feats: dict, id_col: str) -> pd.DataFrame:
    out = None
    for name, w in feats.items():
        long = _to_long(w, name, id_col)
        out = long if out is None else out.merge(long, on=["date", id_col], how="left")
    return out


def rain_features(daily: pd.DataFrame, id_col: str = "point_id") -> pd.DataFrame:
    """daily: kolom [id_col, date, precip_mm] (satu baris per titik per hari, mm/hari).

    Mengembalikan fitur hujan per (id_col, date). Baris awal yang jendelanya belum penuh bernilai NaN.
    """
    wide = _wide(daily, id_col, "precip_mm")
    wet = (wide >= config.WET_DAY_MM).astype(float).where(wide.notna())
    feats = {
        "rain_d0": wide,
        "rain_d1": wide.shift(1),
        "rain_3d": wide.rolling(3, min_periods=3).sum(),
        "rain_7d": wide.rolling(7, min_periods=7).sum(),
        "rain_14d": wide.rolling(14, min_periods=14).sum(),
        "rain_30d": wide.rolling(30, min_periods=30).sum(),
        "rain_max_7d": wide.rolling(7, min_periods=7).max(),
        "wet_days_7d": wet.rolling(7, min_periods=7).sum(),
    }
    out = _merge_all(feats, id_col)
    month = out["date"].dt.month
    out["month_sin"] = np.sin(2 * np.pi * month / 12)
    out["month_cos"] = np.cos(2 * np.pi * month / 12)
    return out


def tma_reference(tma_daily: pd.DataFrame, id_col: str = "station_id") -> pd.DataFrame:
    """Kuantil 0..100% dari tma_max tiap pos. Disimpan bersama model agar `tma_pct` bisa dihitung
    saat inference tanpa riwayat lengkap. Kolom: [id_col, q, value]."""
    rows = []
    for sid, g in tma_daily.dropna(subset=["tma_max"]).groupby(id_col):
        qs = np.arange(0, 101)
        rows.append(pd.DataFrame({id_col: sid, "q": qs, "value": np.percentile(g["tma_max"], qs)}))
    return pd.concat(rows, ignore_index=True)


def tma_to_pct(values, station_ids, reference: pd.DataFrame, id_col: str = "station_id") -> np.ndarray:
    """Ubah tinggi muka air (cm) menjadi posisi 0..1 terhadap distribusi referensi pos tersebut.
    Fungsi yang sama dipakai saat training dan inference."""
    values = np.asarray(values, dtype=float)
    ids = np.asarray(station_ids)
    out = np.full(len(values), np.nan)
    for sid, g in reference.groupby(id_col):
        m = ids == sid
        if m.any():
            g = g.sort_values("q")
            out[m] = np.interp(values[m], g["value"].to_numpy(), g["q"].to_numpy() / 100.0)
    out[np.isnan(values)] = np.nan
    return out


def tma_features(tma_daily: pd.DataFrame, id_col: str = "station_id",
                 reference: pd.DataFrame | None = None) -> pd.DataFrame:
    """tma_daily: kolom [id_col, date, tma_max] (maksimum harian tinggi muka air, cm).

    reference: hasil tma_reference(); jika None dihitung dari tma_daily itu sendiri.
    """
    if reference is None:
        reference = tma_reference(tma_daily, id_col)
    wide = _wide(tma_daily, id_col, "tma_max")
    feats = {
        "tma_max": wide,
        "tma_delta1": wide - wide.shift(1),
        "tma_max_3d": wide.rolling(3, min_periods=2).max(),
    }
    out = _merge_all(feats, id_col)
    out["tma_pct"] = tma_to_pct(out["tma_max"], out[id_col], reference, id_col)
    return out
