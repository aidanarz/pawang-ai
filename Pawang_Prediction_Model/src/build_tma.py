"""Ubah data tinggi muka air (satudata.jakarta.go.id) menjadi ringkasan harian per pos.

Input : semua file .csv/.xlsx di data/raw/tma (kolom waktu, nama pos, tinggi air).
        Satuan mentah satudata.jakarta.go.id = milimeter (terbukti dari ambang Siaga, mis. Manggarai
        Siaga 3 mulai 7500 = 750 cm); dikonversi ke cm lewat config.TMA_UNIT_DIVISOR.
Output: data/interim/tma_daily.csv  (station_id, date, tma_max, tma_mean, n_readings)
        data/interim/tma_stations.csv (hanya jika file TMA memuat kolom lat/lon)
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from . import config
from .utils import find_column, haversine_km, iter_tables, norm_name, parse_dates, pick_column, to_number

MAX_ABS_CM = 5000        # nilai di luar rentang ini (setelah konversi ke cm) dianggap error sensor
SPIKE_FACTOR = 3.0       # pembacaan > SPIKE_FACTOR x persentil-99,5 pos itu dianggap lonjakan sensor
SAME_SITE_KM = 0.15      # nama pos berkoordinat <= jarak ini dianggap pos fisik yang sama (diganti nama)


def merge_station_names(allr: pd.DataFrame) -> pd.Series:
    """Petakan tiap baris ke station_id kanonik.

    Pos sering berganti nama antar tahun di koordinat yang sama (PS. Manggarai -> PA. Manggarai).
    Nama dengan koordinat berdekatan digabung; nama kanonik = nama dengan baris terbanyak.
    Nama tanpa koordinat dipetakan lewat config.TMA_STATION_FIX (salah ketik yang diketahui).
    """
    sid = allr["station"].map(norm_name).replace(config.TMA_STATION_FIX)
    xy = (allr.assign(sid=sid).dropna(subset=["lat", "lon"])
          .groupby("sid").agg(lat=("lat", "median"), lon=("lon", "median"), n=("sid", "size"))
          .sort_values("n", ascending=False))
    canon: dict[str, str] = {}
    centers: list[tuple[str, float, float]] = []   # (nama kanonik, lat, lon)
    for name, r in xy.iterrows():
        hit = next((c for c, la, lo in centers if haversine_km(r.lat, r.lon, la, lo) <= SAME_SITE_KM), None)
        if hit is None:
            centers.append((name, r.lat, r.lon))
            hit = name
        canon[name] = hit
    return sid.map(lambda n: canon.get(n, n))


def clean_levels(allr: pd.DataFrame) -> pd.DataFrame:
    """Konversi ke cm, buang 0 persis (pembacaan hilang), nilai tak masuk akal, dan lonjakan per pos."""
    lvl = allr["level"] / config.TMA_UNIT_DIVISOR
    lvl = lvl.where(lvl != 0)
    lvl = lvl.where(lvl.abs() <= MAX_ABS_CM)
    allr = allr.assign(level=lvl)
    p995 = allr.groupby("station_id")["level"].transform(lambda s: s.quantile(0.995))
    spike = (allr["level"] > SPIKE_FACTOR * p995.abs()) & (p995 > 0)
    return allr.assign(level=allr["level"].where(~spike)), int(spike.sum())


def run(paths=None, verbose=True) -> pd.DataFrame:
    from .config import get_paths
    paths = (paths or get_paths()).ensure()
    frames, stations = [], []
    for name, df in iter_tables(paths.raw_tma):
        c_t = pick_column(df, config.TMA_ALIASES["time"], "waktu", name)
        c_s = pick_column(df, config.TMA_ALIASES["station"], "nama pos", name)
        c_l = pick_column(df, config.TMA_ALIASES["level"], "tinggi air", name)
        c_lat, c_lon = find_column(df, config.TMA_ALIASES["lat"]), find_column(df, config.TMA_ALIASES["lon"])
        c_p = find_column(df, ["periode_data", "periode"])
        frames.append(pd.DataFrame({
            "station": df[c_s].astype("string").str.strip(),
            "date": parse_dates(df[c_t]),
            "level": to_number(df[c_l]),
            "lat": to_number(df[c_lat]) if c_lat else np.nan,
            "lon": to_number(df[c_lon]) if c_lon else np.nan,
            "periode": to_number(df[c_p]) if c_p else np.nan,
        }))
    allr = pd.concat(frames, ignore_index=True)
    n0 = len(allr)
    allr = allr.dropna(subset=["station", "date"])
    # jam sensor salah (mis. tahun 2005/2032): bulan tanggal harus dekat dengan periode_data (+-1 bulan)
    per = allr["periode"]
    off = (allr["date"].dt.year * 12 + allr["date"].dt.month) - ((per // 100) * 12 + per % 100)
    n_baddate = int((off.abs() > 1).sum())
    allr = allr[~(off.abs() > 1)]
    allr["station_id"] = merge_station_names(allr)
    n_names = allr["station"].map(norm_name).nunique()
    allr, n_spike = clean_levels(allr)
    allr = allr.dropna(subset=["level"])
    daily = (allr.groupby(["station_id", "date"])
             .agg(tma_max=("level", "max"), tma_mean=("level", "mean"), n_readings=("level", "size"))
             .reset_index())
    daily.to_csv(paths.interim / "tma_daily.csv", index=False)

    st = allr.dropna(subset=["lat", "lon"])
    has_coords = not st.empty
    if has_coords:
        st.groupby("station_id")[["lat", "lon"]].median().reset_index().to_csv(
            paths.interim / "tma_stations.csv", index=False)

    if verbose:
        print(f"TMA: {n0} baris mentah -> {len(allr)} valid ({n_spike} lonjakan dan {n_baddate} tanggal salah dibuang) -> {len(daily)} baris harian")
        print(f"     {n_names} nama pos -> {daily['station_id'].nunique()} pos fisik (digabung per koordinat)")
        summ = daily.groupby("station_id")["date"].agg(["min", "max", "count"])
        print(summ.to_string())
        if not paths.tma_stations_csv.exists() and not has_coords:
            print("\nCATATAN: koordinat pos belum ada. Buat data/raw/tma_stations.csv "
                  "(kolom: station, lat, lon) agar model 'full' bisa dilatih.")
    return daily


if __name__ == "__main__":
    run()
