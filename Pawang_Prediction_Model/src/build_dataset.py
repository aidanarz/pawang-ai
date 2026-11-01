"""Rakit tabel training: satu baris per (kelurahan, hari) dengan label banjir 0/1, lalu agregasi ke
unit prediksi config.UNIT (default kecamatan) untuk dipakai train.py.

Label 1 = kelurahan itu tercatat banjir pada hari itu. Label 0 = semua hari lain pada tahun-tahun
yang datanya tersedia. PERHATIAN: "tidak tercatat" belum tentu "tidak banjir" (pencatatan bisa
tidak lengkap), jadi probabilitas hasil model cenderung konservatif/rendah.
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

from . import config
from .cells import assign_nearest_station, load_centroids, load_stations
from .features import TMA_FEATURES, rain_features, tma_features, tma_reference
from .fetch_rainfall import load_rain
from .flood import load_flood


def run(paths=None, verbose=True) -> pd.DataFrame:
    from .config import get_paths
    paths = (paths or get_paths()).ensure()

    cells = load_centroids(paths)
    events, rep = load_flood(paths, cells)
    if rep["match_rate"] < 0.5:
        raise ValueError(f"Hanya {rep['match_rate']:.0%} baris banjir cocok dengan tabel centroid. "
                         "Jalankan python -m src.audit_data untuk melihat nama yang tidak cocok.")
    years = sorted(events["date"].dt.year.unique())

    static_path = paths.interim / "static_features.csv"
    if not static_path.exists():
        raise FileNotFoundError("Jalankan dulu: python -m src.build_static")
    static = pd.read_csv(static_path).drop(columns=["kecamatan", "kelurahan", "lat", "lon", "point_id"])

    rain = load_rain(paths)
    rainf = rain_features(rain)
    missing_pts = set(cells["point_id"]) - set(rain["point_id"])
    if missing_pts:
        print(f"PERINGATAN: {len(missing_pts)} titik hujan belum diunduh -> baris terkait dibuang.")

    # kerangka: semua kelurahan x semua hari pada tahun yang punya data banjir
    d_end = min(pd.Timestamp(year=years[-1], month=12, day=31), rain["date"].max())
    dates = pd.date_range(pd.Timestamp(year=years[0], month=1, day=1), d_end)
    dates = dates[dates.year.isin(years)]
    base = pd.MultiIndex.from_product([cells["cell_id"], dates], names=["cell_id", "date"]).to_frame(index=False)

    stations = load_stations(paths)
    cell_cols = ["cell_id", "point_id", "lat", "lon"]
    if stations is not None and (paths.interim / "tma_daily.csv").exists():
        tma = pd.read_csv(paths.interim / "tma_daily.csv", parse_dates=["date"])
        stations = stations[stations["station_id"].isin(tma["station_id"])]
        if stations.empty:
            print("PERINGATAN: nama pos di tma_stations.csv tidak cocok dengan data TMA -> model 'full' dilewati.")
            stations = None
    if stations is not None and (paths.interim / "tma_daily.csv").exists():
        cells = assign_nearest_station(cells, stations)
        cell_cols += ["station_id", "station_km"]
        cells[["cell_id", "station_id", "station_km"]].to_csv(paths.interim / "cell_station_map.csv", index=False)
        tma_ref = tma_reference(tma)
        tma_ref.to_csv(paths.interim / "tma_reference.csv", index=False)
    base = base.merge(cells[cell_cols], on="cell_id", how="left")

    base = base.merge(rainf, on=["point_id", "date"], how="left")
    base = base.merge(static, on="cell_id", how="left")
    if "station_id" in base.columns:
        base = base.merge(tma_features(tma, reference=tma_ref), on=["station_id", "date"], how="left")
    else:
        print("PERINGATAN: data TMA/koordinat pos tidak lengkap -> fitur TMA kosong (hanya model rainfall_only).")
        for c in TMA_FEATURES:
            base[c] = np.nan

    ev = events[["cell_id", "date", "n_records", "max_height"]]
    base = base.merge(ev, on=["cell_id", "date"], how="left")
    base["flood"] = base["n_records"].notna().astype("int8")

    n_before = len(base)
    base = base.dropna(subset=["rain_30d"]).reset_index(drop=True)   # jendela hujan belum penuh / titik tanpa data
    base["year"] = base["date"].dt.year

    out = paths.train_table
    base.to_parquet(out, index=False)

    by_year = base.groupby("year").agg(rows=("flood", "size"), flood_rows=("flood", "sum"))
    by_year["prevalence_%"] = (100 * by_year["flood_rows"] / by_year["rows"]).round(3)
    by_year["tma_coverage_%"] = (100 * base.groupby("year")["tma_max"].apply(lambda s: s.notna().mean())).round(1)
    summary = {
        "rows": int(len(base)), "dropped_incomplete_window": int(n_before - len(base)),
        "flood_rows": int(base["flood"].sum()), "cells": int(base["cell_id"].nunique()),
        "years": [int(y) for y in years], "match_rate": round(rep["match_rate"], 4),
        "events_matched": int(rep["events"]), "rows_bad_date": rep["rows_bad_date"],
    }
    (paths.processed / "dataset_report.json").write_text(json.dumps(summary, indent=2))
    if verbose:
        print(json.dumps(summary, indent=2))
        print(by_year.to_string())
        print(f"Tersimpan: {out}")
    if config.UNIT != "kelurahan":
        from . import aggregate
        if verbose:
            print(f"\nAgregasi ke unit prediksi '{config.UNIT}':")
        aggregate.run(paths, config.UNIT, verbose=verbose)
    return base


if __name__ == "__main__":
    run()
