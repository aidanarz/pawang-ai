"""Generator data SINTETIS yang meniru format file asli, untuk menguji pipeline tanpa data nyata.

    python -m src.synthetic                  # tulis ke data_demo/
    PAWANG_DATA_DIR=data_demo PAWANG_MODELS_DIR=models_demo python -m src.build_static   # dst.

Isinya sengaja memuat jebakan yang biasa ada di data asli: nama berhuruf besar/berawalan "KEL.",
salah ketik nama, format tanggal campuran, nama kolom TMA berbeda antar file, tahun TMA yang
tidak lengkap, serta DEM yang terbagi dua tile. Data ini BUKAN data banjir sungguhan.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import rasterio
from rasterio.transform import from_origin
from scipy.ndimage import gaussian_filter
from scipy.special import expit

from .build_static import dem_stats
from .cells import assign_nearest_station, snap
from .features import rain_features, tma_features
from .utils import norm_name

KECAMATAN = ["Tebet", "Cilandak", "Kemayoran", "Grogol", "Penjaringan", "Cakung", "Pasar Rebo", "Menteng"]
PREFIX = ["Rawa", "Kebon", "Pulo", "Cipinang", "Tanah", "Kali", "Sungai", "Bukit", "Pasar", "Duri"]
SUFFIX = ["Baru", "Lama", "Indah", "Utara", "Selatan", "Timur", "Barat", "Jaya"]
STATIONS = {"Pintu Air Alpha": (-6.12, 106.78), "Pintu Air Beta": (-6.20, 106.90),
            "Pintu Air Gamma": (-6.30, 106.80), "Pintu Air Delta": (-6.17, 106.72),
            "Pintu Air Epsilon": (-6.35, 106.93)}
LAT_MIN, LAT_MAX, LON_MIN, LON_MAX = -6.50, -5.90, 106.60, 107.05


def _write_dem(paths, rng):
    res = 0.001
    lats = np.arange(LAT_MAX, LAT_MIN, -res)
    lons = np.arange(LON_MIN, LON_MAX, res)
    base = np.maximum(0.0, 160.0 * (-5.95 - lats))[:, None] + 0 * lons[None, :]
    noise = gaussian_filter(rng.normal(0, 1, base.shape), 12) * 60
    dem = np.clip(base + noise, 0, None).astype("int16")
    half = dem.shape[1] // 2
    paths.raw_dem.mkdir(parents=True, exist_ok=True)
    for name, sl, west in (("tile_west.tif", slice(0, half), LON_MIN),
                           ("tile_east.tif", slice(half, None), LON_MIN + half * res)):
        arr = dem[:, sl]
        with rasterio.open(paths.raw_dem / name, "w", driver="GTiff", height=arr.shape[0], width=arr.shape[1],
                           count=1, dtype="int16", crs="EPSG:4326", nodata=-32768,
                           transform=from_origin(west, LAT_MAX, res, res)) as dst:
            dst.write(arr, 1)


def generate(paths, n_cells=48, years=(2017, 2018, 2019, 2020, 2021), target_prevalence=0.012, seed=0):
    rng = np.random.default_rng(seed)
    paths.ensure()

    # ---- kelurahan
    names = [f"{p} {s}" for p in PREFIX for s in SUFFIX][:n_cells]
    cells = pd.DataFrame({
        "kelurahan": names,
        "kecamatan": [KECAMATAN[i % len(KECAMATAN)] for i in range(n_cells)],
        "kota": "Jakarta Sintetis",
        "lat": rng.uniform(-6.42, -6.02, n_cells).round(5),
        "lon": rng.uniform(106.70, 106.97, n_cells).round(5),
    })
    cells.to_csv(paths.centroids_csv, index=False)
    cells["cell_id"] = cells["kecamatan"].map(norm_name) + "|" + cells["kelurahan"].map(norm_name)
    cells["point_id"] = [f"{snap(a):.4f}_{snap(b):.4f}" for a, b in zip(cells["lat"], cells["lon"])]

    # ---- DEM + statistik elevasi (memakai kode yang sama dengan pipeline)
    _write_dem(paths, rng)
    static = dem_stats(cells, paths.raw_dem)

    # ---- hujan per titik (badai bersama + variasi lokal), mulai 30 hari sebelum tahun pertama
    dates = pd.date_range(f"{years[0] - 1}-12-01", f"{years[-1]}-12-31")
    wet_season = np.isin(dates.month, [11, 12, 1, 2, 3])
    storm = rng.gamma(0.8, 16, len(dates)) * (rng.random(len(dates)) < np.where(wet_season, 0.55, 0.20))
    paths.rain_dir.mkdir(parents=True, exist_ok=True)
    rain_rows = []
    for pid in cells["point_id"].unique():
        local = storm * rng.uniform(0.7, 1.3) * rng.lognormal(0, 0.25, len(dates))
        local += rng.gamma(0.5, 4, len(dates)) * (rng.random(len(dates)) < 0.05)
        df = pd.DataFrame({"date": dates, "precip_mm": local.round(1)})
        df.to_csv(paths.rain_dir / f"{pid}.csv", index=False)
        rain_rows.append(df.assign(point_id=pid))
    rainf = rain_features(pd.concat(rain_rows))

    # ---- TMA harian per pos (terkait hujan 3 hari + residu acak yang ikut memengaruhi banjir)
    st = pd.DataFrame([(k, *v) for k, v in STATIONS.items()], columns=["station", "lat", "lon"])
    st["station_id"] = st["station"].map(norm_name)
    st[["station", "lat", "lon"]].to_csv(paths.tma_stations_csv, index=False)
    near_pt = {sid: cells.loc[((cells.lat - la) ** 2 + (cells.lon - lo) ** 2).idxmin(), "point_id"]
               for sid, la, lo in zip(st["station_id"], st["lat"], st["lon"])}
    r3 = rainf.set_index(["point_id", "date"])["rain_3d"]
    tma_daily, tma_resid = [], []
    for sid in st["station_id"]:
        r = r3.loc[near_pt[sid]].reindex(dates).fillna(0).to_numpy()
        resid = rng.normal(0, 18, len(dates))
        tma_daily.append(pd.DataFrame({"station_id": sid, "date": dates, "tma_max": 90 + 1.2 * r + resid}))
        tma_resid.append(pd.DataFrame({"station_id": sid, "date": dates, "tma_resid": resid}))
    tma_daily, tma_resid = pd.concat(tma_daily), pd.concat(tma_resid)

    # ---- label banjir
    cells = assign_nearest_station(cells, st)
    grid = pd.MultiIndex.from_product([cells["cell_id"], dates], names=["cell_id", "date"]).to_frame(index=False)
    grid = (grid.merge(cells[["cell_id", "point_id", "station_id"]], on="cell_id")
                .merge(rainf[["point_id", "date", "rain_d0", "rain_3d", "rain_14d"]], on=["point_id", "date"])
                .merge(static[["cell_id", "elev_mean"]], on="cell_id")
                .merge(tma_resid, on=["station_id", "date"], how="left"))
    grid = grid.dropna(subset=["rain_14d", "elev_mean"])
    cell_eff = dict(zip(cells["cell_id"], rng.normal(0, 0.6, len(cells))))
    z = (0.030 * grid["rain_3d"] + 0.022 * grid["rain_d0"] + 0.004 * grid["rain_14d"]
         - 0.07 * grid["elev_mean"] + 0.015 * grid["tma_resid"] + grid["cell_id"].map(cell_eff))
    lo, hi = -40.0, 10.0
    for _ in range(60):   # cari intersep agar prevalensi mendekati target
        mid = (lo + hi) / 2
        if expit(z + mid).mean() < target_prevalence:
            lo = mid
        else:
            hi = mid
    grid["flood"] = rng.random(len(grid)) < expit(z + (lo + hi) / 2)
    grid = grid[grid["date"].dt.year.isin(years) & grid["flood"]]

    # ---- tulis data banjir mentah (format mirip data asli satudata)
    messy = {cells["cell_id"].iloc[1]: lambda s: s.upper(),
             cells["cell_id"].iloc[2]: lambda s: f"KEL. {s.upper()}"}
    typo_cell = cells["cell_id"].iloc[3]
    info = cells.set_index("cell_id")[["kelurahan", "kecamatan"]]
    paths.raw_flood.mkdir(parents=True, exist_ok=True)
    for y in years:
        rows = []
        for cid, d in grid.loc[grid["date"].dt.year == y, ["cell_id", "date"]].itertuples(index=False):
            kel, kec = info.loc[cid, "kelurahan"], info.loc[cid, "kecamatan"]
            if cid in messy:
                kel = messy[cid](kel)
            if cid == typo_cell:
                kel = kel[:-1] + kel[-1] * 2       # salah ketik (huruf terakhir dobel)
            for rw in range(1, int(rng.integers(1, 4)) + 1):
                rows.append({"kota_administrasi": "Jakarta Sintetis", "kecamatan": kec, "kelurahan": kel, "rw": rw,
                             "jumlah_terdampak_rw": 1, "jumlah_terdampak_rt": 2, "jumlah_terdampak_kk": 30,
                             "jumlah_terdampak_jiwa": 100, "ketinggian_air": int(rng.integers(20, 150)),
                             "tanggal_kejadian": d.strftime("%Y-%m-%d" if y < 2020 else "%d/%m/%Y")})
        pd.DataFrame(rows).to_csv(paths.raw_flood / f"banjir_{y}.csv", index=False)

    # ---- tulis TMA mentah: 2018-2021 saja (2017 sengaja kosong), 4 pembacaan/hari, kolom berbeda antar file
    td = tma_daily[tma_daily["date"].dt.year >= 2018]
    paths.raw_tma.mkdir(parents=True, exist_ok=True)
    for fname, ys, cols in (("tma_2018_2019.csv", (2018, 2019), ("tanggal", "nama_pos", "tinggi_air")),
                            ("tma_2020_2021.csv", (2020, 2021), ("waktu", "lokasi", "tma"))):
        part = td[td["date"].dt.year.isin(ys)]
        sname = dict(zip(st["station_id"], st["station"]))
        recs = []
        for hour in (0, 6, 12, 18):
            r = part.copy()
            r["t"] = r["date"] + pd.Timedelta(hours=hour)
            r["lvl"] = (r["tma_max"] - rng.uniform(0, 8, len(r))).round(0)
            recs.append(r)
        raw = pd.concat(recs)
        raw = raw.sample(frac=0.97, random_state=seed)   # ada pembacaan yang hilang
        pd.DataFrame({cols[0]: raw["t"].dt.strftime("%Y-%m-%d %H:%M:%S"),
                      cols[1]: raw["station_id"].map(sname), cols[2]: raw["lvl"]}
                     ).to_csv(paths.raw_tma / fname, index=False)
    return {"cells": len(cells), "flood_cell_days": int(len(grid)), "years": list(years)}


if __name__ == "__main__":
    from pathlib import Path
    from .config import get_paths
    p = get_paths(data_dir=Path("data_demo"), models_dir=Path("models_demo"))
    print(generate(p))
