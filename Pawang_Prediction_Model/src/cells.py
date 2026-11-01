"""Tabel kelurahan (centroid) dan pemetaan ke titik hujan serta pos TMA terdekat."""
from __future__ import annotations

import numpy as np
import pandas as pd

from . import config
from .utils import haversine_km, norm_name, pick_column, read_table, to_number


def snap(v: float, step: float = config.RAIN_GRID_DEG) -> float:
    return round(round(v / step) * step, 4)


def load_centroids(paths) -> pd.DataFrame:
    """Baca data/raw/kelurahan_centroids.csv (kolom: kelurahan, kecamatan, lat, lon)."""
    if not paths.centroids_csv.exists():
        raise FileNotFoundError(
            f"{paths.centroids_csv} belum ada. Siapkan CSV dengan kolom: kelurahan, kecamatan, lat, lon "
            "(satu baris per kelurahan, titik tengah)."
        )
    df = read_table(paths.centroids_csv)
    f = paths.centroids_csv.name
    ck = {k: pick_column(df, config.CENTROID_ALIASES[k], k, f) for k in ("kelurahan", "kecamatan", "lat", "lon")}
    out = pd.DataFrame({
        "kelurahan": df[ck["kelurahan"]].astype(str).str.strip(),
        "kecamatan": df[ck["kecamatan"]].astype(str).str.strip(),
        "lat": to_number(df[ck["lat"]]),
        "lon": to_number(df[ck["lon"]]),
    }).dropna(subset=["lat", "lon"])
    if out.empty:
        raise ValueError("Tabel centroid kosong setelah membuang baris tanpa lat/lon.")
    if out["lat"].between(-8.5, -5.0).mean() < 0.9:
        raise ValueError("Nilai lat tampak di luar Jabodetabek atau tertukar dengan lon. "
                         "Lat Jakarta sekitar -6.2, lon sekitar 106.8.")
    out["cell_id"] = out["kecamatan"].map(norm_name) + "|" + out["kelurahan"].map(norm_name)
    out = out.drop_duplicates("cell_id").reset_index(drop=True)
    out["lat_snap"] = out["lat"].map(snap)
    out["lon_snap"] = out["lon"].map(snap)
    out["point_id"] = out["lat_snap"].map("{:.4f}".format) + "_" + out["lon_snap"].map("{:.4f}".format)
    return out


def load_stations(paths) -> pd.DataFrame | None:
    """Koordinat pos TMA. Prioritas: data/raw/tma_stations.csv, lalu hasil turunan dari file TMA."""
    for p in (paths.tma_stations_csv, paths.interim / "tma_stations.csv"):
        if p.exists():
            df = read_table(p)
            ck = {k: pick_column(df, config.STATION_FILE_ALIASES[k], k, p.name) for k in ("station", "lat", "lon")}
            out = pd.DataFrame({
                "station_id": df[ck["station"]].map(norm_name),
                "lat": to_number(df[ck["lat"]]),
                "lon": to_number(df[ck["lon"]]),
            }).dropna().drop_duplicates("station_id")
            return out.reset_index(drop=True)
    return None


def assign_nearest_station(cells: pd.DataFrame, stations: pd.DataFrame) -> pd.DataFrame:
    """Tambahkan station_id dan station_km (jarak ke pos terdekat) pada tabel kelurahan."""
    d = haversine_km(cells["lat"].to_numpy()[:, None], cells["lon"].to_numpy()[:, None],
                     stations["lat"].to_numpy()[None, :], stations["lon"].to_numpy()[None, :])
    idx = d.argmin(axis=1)
    out = cells.copy()
    out["station_id"] = stations["station_id"].to_numpy()[idx]
    out["station_km"] = d[np.arange(len(cells)), idx]
    return out
