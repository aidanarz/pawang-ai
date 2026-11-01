"""Unduh curah hujan harian historis: Open-Meteo (default, tanpa API key) atau NASA IMERG / CHIRPS (PAWANG_RAIN_SOURCE=imerg|chirps).

Koordinat kelurahan dibulatkan ke grid 0.1 derajat (config.RAIN_GRID_DEG) sehingga hanya
beberapa puluh titik unik yang perlu diunduh untuk seluruh Jakarta. Hasil di-cache per titik
di data/interim/rain/<point_id>.csv, jadi menjalankan ulang tidak mengunduh ulang.

Pakai:
    python -m src.fetch_rainfall                 # rentang diambil otomatis dari data banjir
    python -m src.fetch_rainfall --start 2016-12-01 --end 2021-12-31
    python -m src.fetch_rainfall --force         # unduh ulang semua
"""
from __future__ import annotations

import argparse
import time

import numpy as np
import pandas as pd
import requests

from . import config
from .cells import load_centroids
from .flood import flood_date_range

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
MAX_MISSING_FRAC = 0.02   # cache dengan >2% hari kosong dianggap gagal dan diunduh ulang
LAG_DAYS = 6   # data arsip Open-Meteo tertinggal beberapa hari dari hari ini


def fetch_point(lat: float, lon: float, start: str, end: str, retries: int = 5) -> pd.DataFrame:
    params = dict(latitude=lat, longitude=lon, start_date=start, end_date=end,
                  daily="precipitation_sum", timezone=config.TIMEZONE)
    last = ""
    for attempt in range(retries):
        try:
            r = requests.get(ARCHIVE_URL, params=params, timeout=60)
        except requests.RequestException as e:      # putus koneksi, timeout, dsb.
            last = f"{type(e).__name__}: {str(e)[:150]}"
            time.sleep(5 * (attempt + 1))
            continue
        if r.status_code == 200:
            daily = r.json()["daily"]
            return pd.DataFrame({"date": pd.to_datetime(daily["time"]),
                                 "precip_mm": daily["precipitation_sum"]})
        last = f"HTTP {r.status_code}: {r.text[:200]}"
        if r.status_code in (429, 500, 502, 503, 504):
            time.sleep(65 if r.status_code == 429 else 5 * (attempt + 1))
            continue
        break
    raise RuntimeError(f"Open-Meteo gagal untuk ({lat}, {lon}): {last}")


def run(paths=None, start=None, end=None, force=False, pause=1.0, verbose=True):
    from .config import get_paths
    paths = (paths or get_paths()).ensure()
    cells = load_centroids(paths)
    points = cells[["point_id", "lat_snap", "lon_snap"]].drop_duplicates("point_id")

    if start is None or end is None:
        d0, d1 = flood_date_range(paths)
        start = start or str((pd.Timestamp(year=d0.year, month=1, day=1) - pd.Timedelta(days=30)).date())
        end = end or str(pd.Timestamp(year=d1.year, month=12, day=31).date())
    cap = (pd.Timestamp.today().normalize() - pd.Timedelta(days=LAG_DAYS)).date()
    if pd.Timestamp(end).date() > cap:
        end = str(cap)
    if verbose:
        print(f"Rentang hujan: {start} s/d {end} | titik unik: {len(points)} (dari {len(cells)} kelurahan)")

    if config.RAIN_SOURCE in ("chirps", "imerg"):
        if config.RAIN_SOURCE == "chirps":
            from .fetch_chirps import fetch_points
        else:
            from .fetch_imerg import fetch_points
        todo = points.rename(columns={"lat_snap": "lat", "lon_snap": "lon"})
        if not force:
            have = [f.stem for f in paths.rain_dir.glob("*.csv")]
            ok = set()
            for pid in have:
                old = pd.read_csv(paths.rain_dir / f"{pid}.csv", parse_dates=["date"])
                if old["date"].min() <= pd.Timestamp(start) + pd.Timedelta(days=1) and                    old["date"].max() >= pd.Timestamp(end) - pd.Timedelta(days=1) and                    old["precip_mm"].isna().mean() <= MAX_MISSING_FRAC:       # cache bolong-bolong tidak dipercaya
                    ok.add(pid)
            todo = todo[~todo["point_id"].isin(ok)]
        if todo.empty:
            print("cache dipakai untuk semua titik")
            return
        if verbose:
            print(f"{config.RAIN_SOURCE.upper()}: membaca {len(pd.date_range(start, end))} hari untuk {len(todo)} titik ...")
        kw = {"cache": paths.interim / "imerg_raw_days.csv"} if config.RAIN_SOURCE == "imerg" else {}
        got = fetch_points(todo, start, end, verbose=verbose, **kw)
        frac = float(np.mean([df["precip_mm"].isna().mean() for df in got.values()]))
        if frac > MAX_MISSING_FRAC:
            raise RuntimeError(f"{config.RAIN_SOURCE.upper()}: {frac:.0%} hari gagal dibaca (server membatasi akses/berkas belum terbit). "
                               "Tidak ada yang disimpan. Coba lagi nanti dengan workers lebih sedikit.")
        for pid, df in got.items():
            df.to_csv(paths.rain_dir / f"{pid}.csv", index=False)
            if verbose:
                print(f"{pid}: {len(df)} hari, kosong={int(df['precip_mm'].isna().sum())}")
        return

    for i, row in enumerate(points.itertuples(index=False), 1):
        f = paths.rain_dir / f"{row.point_id}.csv"
        if f.exists() and not force:
            old = pd.read_csv(f, parse_dates=["date"])
            if old["date"].min() <= pd.Timestamp(start) + pd.Timedelta(days=1) and \
               old["date"].max() >= pd.Timestamp(end) - pd.Timedelta(days=1):
                if verbose:
                    print(f"[{i}/{len(points)}] {row.point_id}: cache dipakai")
                continue
        df = fetch_point(row.lat_snap, row.lon_snap, start, end)
        df.to_csv(f, index=False)
        if verbose:
            print(f"[{i}/{len(points)}] {row.point_id}: {len(df)} hari, "
                  f"kosong={int(df['precip_mm'].isna().sum())}")
        time.sleep(pause)


def load_rain(paths) -> pd.DataFrame:
    """Gabungkan seluruh cache hujan: kolom point_id, date, precip_mm."""
    files = sorted(paths.rain_dir.glob("*.csv"))
    if not files:
        raise FileNotFoundError(f"Belum ada data hujan di {paths.rain_dir}. Jalankan: python -m src.fetch_rainfall")
    frames = []
    for f in files:
        d = pd.read_csv(f, parse_dates=["date"])
        d["point_id"] = f.stem
        frames.append(d)
    out = pd.concat(frames, ignore_index=True)
    if config.RAIN_SOURCE != "openmeteo":
        out = _fill_gaps_from_openmeteo(out, paths)
    return out


def _fill_gaps_from_openmeteo(rain: pd.DataFrame, paths) -> pd.DataFrame:
    """Hari kosong pada sumber alternatif (berkas satelit hilang) diisi dari cache Open-Meteo titik yang sama.
    Tanpa ini satu hari kosong membuat seluruh jendela hujan 30 hari sesudahnya kosong dan barisnya terbuang."""
    n_gap = int(rain["precip_mm"].isna().sum())
    om_dir = paths.interim / "rain"
    if not n_gap or not om_dir.exists():
        return rain
    parts = []
    for pid in rain.loc[rain["precip_mm"].isna(), "point_id"].unique():
        f = om_dir / f"{pid}.csv"
        if f.exists():
            parts.append(pd.read_csv(f, parse_dates=["date"]).assign(point_id=pid)
                         .rename(columns={"precip_mm": "_om"}))
    if not parts:
        return rain
    m = rain.merge(pd.concat(parts), on=["point_id", "date"], how="left")
    fill = m["precip_mm"].isna() & m["_om"].notna()
    m.loc[fill, "precip_mm"] = m.loc[fill, "_om"]
    print(f"Catatan: {int(fill.sum())} dari {n_gap} hari kosong ({config.RAIN_SOURCE}) diisi dari Open-Meteo.")
    return m.drop(columns="_om")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--start")
    ap.add_argument("--end")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    run(start=a.start, end=a.end, force=a.force)
