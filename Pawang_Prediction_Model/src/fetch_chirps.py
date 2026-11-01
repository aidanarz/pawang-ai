"""Hujan harian CHIRPS v2.0 (satelit inframerah + stasiun hujan, 0,05 derajat ~ 5 km), tanpa login.

Sumber: https://data.chc.ucsb.edu/products/CHIRPS-2.0/global_daily/cogs/p05/<tahun>/chirps-v2.0.<Y.m.d>.cog
Berkas global berformat COG, jadi hanya jendela kecil di sekitar Jakarta yang dibaca lewat HTTP range.

Tiap titik hujan (point_id = koordinat kelurahan dibulatkan ke grid 0,05) dihitung dengan interpolasi
bilinear dari 4 piksel terdekat; piksel tanpa data (laut, nilai -9999) dikeluarkan dan bobot dinormalkan ulang.
Catatan: hari CHIRPS = hari UTC (00-24 UTC), Open-Meteo = hari lokal WIB. Selisih 7 jam ini diabaikan.

Pakai (sumber hujan dipilih lewat variabel lingkungan):
    PAWANG_RAIN_SOURCE=chirps python -m src.fetch_rainfall
"""
from __future__ import annotations

import os
import time
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import pandas as pd

from .geo import fix_proj_env

fix_proj_env()
os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
os.environ.setdefault("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".cog,.tif")
os.environ.setdefault("GDAL_HTTP_MAX_RETRY", "3")
os.environ.setdefault("GDAL_HTTP_RETRY_DELAY", "2")

import rasterio  # noqa: E402
from rasterio.windows import Window  # noqa: E402

URL = ("/vsicurl/https://data.chc.ucsb.edu/products/CHIRPS-2.0/global_daily/cogs/p05/"
       "{y}/chirps-v2.0.{y}.{m:02d}.{d:02d}.cog")
NODATA_BELOW = -9000.0
PAD_DEG = 0.15


def _interp(arr, x0, y0, res, lat, lon):
    """Bilinear dari piksel valid. arr: jendela (baris ke selatan), (x0, y0) = sudut barat laut jendela."""
    fc = (lon - x0) / res - 0.5            # indeks kolom pecahan terhadap pusat piksel
    fr = (y0 - lat) / res - 0.5
    c0, r0 = int(np.floor(fc)), int(np.floor(fr))
    num = den = 0.0
    best = None
    for dr in (0, 1):
        for dc in (0, 1):
            r, c = r0 + dr, c0 + dc
            if 0 <= r < arr.shape[0] and 0 <= c < arr.shape[1] and arr[r, c] > NODATA_BELOW:
                w = (1 - abs(fr - r)) * (1 - abs(fc - c))
                num += w * arr[r, c]; den += w
    if den > 1e-9:
        return num / den
    # semua 4 piksel masked (pesisir): ambil piksel valid terdekat dalam jendela 5x5
    for rr in range(max(r0 - 2, 0), min(r0 + 4, arr.shape[0])):
        for cc in range(max(c0 - 2, 0), min(c0 + 4, arr.shape[1])):
            if arr[rr, cc] > NODATA_BELOW:
                d = (rr - fr) ** 2 + (cc - fc) ** 2
                if best is None or d < best[0]:
                    best = (d, arr[rr, cc])
    return best[1] if best else np.nan


def read_day(day: pd.Timestamp, points: pd.DataFrame, retries: int = 4) -> np.ndarray:
    """Nilai mm untuk setiap titik pada satu hari (NaN jika berkas belum terbit/gagal)."""
    url = URL.format(y=day.year, m=day.month, d=day.day)
    last = None
    for attempt in range(retries):
        try:
            with rasterio.open(url) as s:
                res = s.res[0]
                west, north = s.transform.c, s.transform.f
                c_lo = int((points["lon"].min() - PAD_DEG - west) / res)
                c_hi = int(np.ceil((points["lon"].max() + PAD_DEG - west) / res))
                r_lo = int((north - (points["lat"].max() + PAD_DEG)) / res)
                r_hi = int(np.ceil((north - (points["lat"].min() - PAD_DEG)) / res))
                arr = s.read(1, window=Window(c_lo, r_lo, c_hi - c_lo, r_hi - r_lo)).astype("float64")
                x0, y0 = west + c_lo * res, north - r_lo * res
            return np.array([_interp(arr, x0, y0, res, la, lo)
                             for la, lo in zip(points["lat"], points["lon"])])
        except Exception as e:             # 404 (belum terbit), putus koneksi, dsb.
            last = e
            if "does not exist" in str(e) or "not recognized" in str(e) or "No such file" in str(e):
                break
            time.sleep(2 * (attempt + 1))
    return np.full(len(points), np.nan)


def fetch_points(points: pd.DataFrame, start: str, end: str, workers: int = 8, verbose: bool = True) -> dict:
    """points: kolom point_id, lat, lon. Mengembalikan {point_id: DataFrame(date, precip_mm)}."""
    days = pd.date_range(start, end)
    pts = points.reset_index(drop=True)
    results = {}
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=workers) as ex:
        for i, (day, vals) in enumerate(zip(days, ex.map(lambda d: read_day(d, pts), days)), 1):
            results[day] = vals
            if verbose and i % 200 == 0:
                print(f"  {i}/{len(days)} hari ({time.time() - t0:.0f} dtk)", flush=True)
    raw = np.vstack([results[d] for d in days])             # hari x titik; NaN = berkas belum terbit/gagal
    mat = np.where(raw < 0, 0.0, raw)                        # CHIRPS tidak negatif; NaN tetap NaN
    return {pid: pd.DataFrame({"date": days, "precip_mm": mat[:, j]}) for j, pid in enumerate(pts["point_id"])}
