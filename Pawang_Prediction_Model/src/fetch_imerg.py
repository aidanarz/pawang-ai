"""Hujan harian NASA GPM IMERG Final Run V07 (GPM_3IMERGDF, 0,1 derajat ~ 10 km, mm/hari).

Sumber : GES DISC lewat OPeNDAP (Hyrax) dengan token Earthdata (variabel EARTHDATA_TOKEN di .env).
         Prasyarat akun: setujui aplikasi "NASA GESDISC DATA ARCHIVE" di profil Earthdata.
Subset : hanya jendela kecil di sekitar Jakarta (~25 KB per hari), bukan berkas global 28 MB.
Titik  : tiap point_id (kelurahan dibulatkan ke grid 0,1) diisi dengan interpolasi bilinear dari piksel valid.
Catatan: hari IMERG = hari UTC; Open-Meteo = hari lokal WIB (selisih 7 jam diabaikan).
Sopan  : konkurensi rendah dan berhenti seketika pada 401/403/429 (jangan memaksa server).

Pakai:  PAWANG_RAIN_SOURCE=imerg python -m src.fetch_rainfall
"""
from __future__ import annotations

import threading
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import pandas as pd
import requests

from .env import get_token

BASE = "https://gpm1.gesdisc.eosdis.nasa.gov/opendap/GPM_L3/GPM_3IMERGDF.07"
FILE = "3B-DAY.MS.MRG.3IMERG.{ymd}-S000000-E235959.V07B.nc4"
STEP = 0.1
PAD = 0.25
FILL_BELOW = -9000.0
WORKERS = 4
STOP_CODES = (401, 403, 429)


_NC_LOCK = threading.Lock()


class AccessDenied(RuntimeError):
    pass


def _indices(points: pd.DataFrame):
    lo0 = int(np.floor((points["lon"].min() - PAD + 179.95) / STEP))
    lo1 = int(np.ceil((points["lon"].max() + PAD + 179.95) / STEP))
    la0 = int(np.floor((points["lat"].min() - PAD + 89.95) / STEP))
    la1 = int(np.ceil((points["lat"].max() + PAD + 89.95) / STEP))
    return lo0, lo1, la0, la1


def _bilinear(arr, lons, lats, lat, lon):
    """arr[lon_idx, lat_idx]; piksel tanpa data dikeluarkan lalu bobot dinormalkan ulang."""
    fx = (lon - lons[0]) / STEP
    fy = (lat - lats[0]) / STEP
    i0, j0 = int(np.floor(fx)), int(np.floor(fy))
    num = den = 0.0
    for di in (0, 1):
        for dj in (0, 1):
            i, j = i0 + di, j0 + dj
            if 0 <= i < arr.shape[0] and 0 <= j < arr.shape[1] and np.isfinite(arr[i, j]) and arr[i, j] > FILL_BELOW:
                w = (1 - abs(fx - i)) * (1 - abs(fy - j))
                num += w * arr[i, j]; den += w
    return num / den if den > 1e-9 else np.nan


def read_day(day: pd.Timestamp, points: pd.DataFrame, token: str, retries: int = 4) -> np.ndarray:
    import netCDF4
    lo0, lo1, la0, la1 = _indices(points)
    name = FILE.format(ymd=day.strftime("%Y%m%d"))
    url = f"{BASE}/{day:%Y}/{day:%m}/{name}.dap.nc4"
    ce = f"/precipitation[0][{lo0}:{lo1}][{la0}:{la1}];/lon[{lo0}:{lo1}];/lat[{la0}:{la1}]"
    last = ""
    for attempt in range(retries):
        try:
            r = requests.get(url, params={"dap4.ce": ce}, headers={"Authorization": f"Bearer {token}"}, timeout=90)
        except requests.RequestException as e:
            last = f"{type(e).__name__}"
            time.sleep(3 * (attempt + 1))
            continue
        if r.status_code in STOP_CODES:
            raise AccessDenied(f"HTTP {r.status_code} dari GES DISC ({day.date()}). Periksa token/EULA atau tunggu "
                               "bila dibatasi. Berhenti agar tidak membebani server.")
        if r.status_code == 200:
            with _NC_LOCK:                 # netCDF-C tidak thread-safe; parsing cepat, jaringan tetap paralel
                ds = netCDF4.Dataset(f"mem_{day:%Y%m%d}.nc", memory=r.content)
                try:
                    arr = np.ma.filled(ds["precipitation"][0].astype("float64"), np.nan)
                    lons, lats = np.asarray(ds["lon"][:], dtype=float), np.asarray(ds["lat"][:], dtype=float)
                finally:
                    ds.close()
            return np.array([_bilinear(arr, lons, lats, la, lo) for la, lo in zip(points["lat"], points["lon"])])
        last = f"HTTP {r.status_code}"
        if r.status_code == 404:           # belum terbit / tidak ada
            break
        time.sleep(3 * (attempt + 1))
    return np.full(len(points), np.nan)


def fetch_points(points: pd.DataFrame, start: str, end: str, workers: int = WORKERS, verbose: bool = True,
                 cache=None) -> dict:
    """points: kolom point_id, lat, lon. Mengembalikan {point_id: DataFrame(date, precip_mm)}.

    cache: path CSV (date + satu kolom per point_id) berisi hari yang sudah selesai. Dimuat saat mulai dan
    ditambah tiap 100 hari, sehingga proses yang terputus bisa dilanjutkan tanpa mengulang dari awal."""
    token = get_token()
    days = pd.date_range(start, end)
    pts = points.reset_index(drop=True)
    ids = list(pts["point_id"])
    done: dict = {}
    if cache is not None and Path(cache).exists():
        old = pd.read_csv(cache, parse_dates=["date"]).set_index("date")
        if set(ids) <= set(old.columns):
            done = {d: old.loc[d, ids].to_numpy(dtype=float) for d in old.index if d in set(days)
                    and not old.loc[d, ids].isna().all()}
            if verbose and done:
                print(f"  cache hari dipakai: {len(done)} hari", flush=True)
    todo = [d for d in days if d not in done]
    t0 = time.time()

    def flush():
        if cache is not None and done:
            pd.DataFrame.from_dict(done, orient="index", columns=ids).rename_axis("date").sort_index().to_csv(cache)

    with ThreadPoolExecutor(max_workers=workers) as ex:
        for i, (d, vals) in enumerate(zip(todo, ex.map(lambda d: read_day(d, pts, token), todo)), 1):
            done[d] = vals
            if i % 100 == 0:
                flush()
                if verbose:
                    print(f"  {i}/{len(todo)} hari ({time.time() - t0:.0f} dtk)", flush=True)
    flush()
    mat = np.vstack([done[d] for d in days])
    mat = np.where(mat < 0, 0.0, mat)                        # NaN tetap NaN
    return {pid: pd.DataFrame({"date": days, "precip_mm": mat[:, j]}) for j, pid in enumerate(ids)}
