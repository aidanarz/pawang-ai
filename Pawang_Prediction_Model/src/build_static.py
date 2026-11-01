"""Hitung fitur elevasi per kelurahan dari GeoTIFF DEM (SRTM dari USGS EarthExplorer).

Taruh semua tile .tif di data/raw/dem/ (boleh beberapa tile; akan digabung otomatis).
Fitur:
  elev_mean     rata-rata elevasi dalam radius 500 m
  elev_min      elevasi minimum dalam radius 500 m
  elev_std      simpangan baku elevasi dalam radius 500 m (kekasaran lahan)
  elev_rel_3km  elev_mean dikurangi rata-rata radius 3 km (negatif = cekungan relatif sekitar)
"""
from __future__ import annotations

import warnings
from pathlib import Path

from .geo import fix_proj_env

fix_proj_env()   # harus sebelum import rasterio (lihat geo.py)

import numpy as np
import pandas as pd
import rasterio
from rasterio.merge import merge

from .cells import load_centroids

R_SMALL_M = 500
R_BIG_M = 3000


def _window(arr, row, col, n):
    r0, r1 = max(row - n, 0), min(row + n + 1, arr.shape[0])
    c0, c1 = max(col - n, 0), min(col + n + 1, arr.shape[1])
    return arr[r0:r1, c0:c1]


def dem_stats(points: pd.DataFrame, dem_dir) -> pd.DataFrame:
    """points: kolom cell_id, lat, lon. Mengembalikan fitur elevasi per cell_id."""
    files = sorted(p for p in Path(dem_dir).glob("*") if p.suffix.lower() in (".tif", ".tiff"))
    if not files:
        raise FileNotFoundError(f"Tidak ada file .tif di {dem_dir}. Unduh SRTM dari earthexplorer.usgs.gov.")
    srcs = [rasterio.open(f) for f in files]
    try:
        for s, f in zip(srcs, files):
            if s.crs is None or s.crs.to_epsg() != 4326:
                raise ValueError(f"{f.name}: CRS {s.crs} bukan EPSG:4326. Gunakan SRTM GeoTIFF (lat/lon).")
        pad = 0.05
        bounds = (points["lon"].min() - pad, points["lat"].min() - pad,
                  points["lon"].max() + pad, points["lat"].max() + pad)
        arr, tr = merge(srcs, bounds=bounds)
        nodata = srcs[0].nodata
    finally:
        for s in srcs:
            s.close()

    elev = arr[0].astype("float32")
    if nodata is not None:
        elev[elev == nodata] = np.nan
    elev[elev < -500] = np.nan   # void SRTM

    lat0 = float(points["lat"].mean())
    m_per_px = min(abs(tr.a) * 111_320 * np.cos(np.radians(lat0)), abs(tr.e) * 111_320)
    n_small = max(1, int(round(R_SMALL_M / m_per_px)))
    n_big = max(n_small + 1, int(round(R_BIG_M / m_per_px)))

    rows = []
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        for cid, lat, lon in zip(points["cell_id"], points["lat"], points["lon"]):
            col = int((lon - tr.c) / tr.a)
            row = int((lat - tr.f) / tr.e)
            if not (0 <= row < elev.shape[0] and 0 <= col < elev.shape[1]):
                rows.append((cid, np.nan, np.nan, np.nan, np.nan))
                continue
            w_s = _window(elev, row, col, n_small)
            w_b = _window(elev, row, col, n_big)
            mean_s = np.nanmean(w_s)
            rows.append((cid, mean_s, np.nanmin(w_s), np.nanstd(w_s), mean_s - np.nanmean(w_b)))
    return pd.DataFrame(rows, columns=["cell_id", "elev_mean", "elev_min", "elev_std", "elev_rel_3km"])


def run(paths=None, verbose=True) -> pd.DataFrame:
    from .config import get_paths
    paths = (paths or get_paths()).ensure()
    cells = load_centroids(paths)
    stats = dem_stats(cells, paths.raw_dem)
    out = cells[["cell_id", "kecamatan", "kelurahan", "lat", "lon", "point_id"]].merge(stats, on="cell_id")
    out.to_csv(paths.interim / "static_features.csv", index=False)
    n_nan = int(out["elev_mean"].isna().sum())
    if verbose:
        print(f"static_features.csv: {len(out)} kelurahan, elevasi kosong: {n_nan}")
        print(out[["elev_mean", "elev_min", "elev_std", "elev_rel_3km"]].describe().round(2).to_string())
    if n_nan:
        print(f"PERINGATAN: {n_nan} kelurahan di luar cakupan DEM. Unduh tile SRTM tambahan.")
    return out


if __name__ == "__main__":
    run()
