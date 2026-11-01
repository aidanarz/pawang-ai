"""Agregasi dari kelurahan ke unit prediksi yang lebih besar (kecamatan atau kota).

Alasan: label banjir per kelurahan-hari sangat jarang (prevalensi < 1%) dan hujan beresolusi kasar dipakai
bersama banyak kelurahan, jadi pada unit lebih besar label lebih rapat dan hasilnya lebih berguna secara
operasional (presisi lebih tinggi pada recall yang sama). Kemampuan membedakan (ROC-AUC) tidak bertambah.

Aturan agregasi per (unit, hari) -- sama untuk training dan inference (`aggregate_features`):
  flood                  1 jika ada kelurahan di unit itu yang banjir (max)
  fitur hujan            rata-rata antar kelurahan
  elev_mean/std/rel_3km  rata-rata; elev_min  minimum (titik terendah di unit)
  fitur TMA              rata-rata nilai yang tersedia; NaN jika tidak ada kelurahan dengan TMA

Keluaran `run`: tabel unit (paths.unit_table), interim/cell_unit_map.csv (cell_id -> unit) dan
interim/static_features_unit.csv (fitur statis per unit).

    python -m src.aggregate kecamatan
"""
from __future__ import annotations

import sys

import pandas as pd

from .features import RAIN_FEATURES, STATIC_FEATURES, TMA_FEATURES

LEVELS = ("kecamatan", "kota")
_FIRST = ("month_sin", "month_cos")


def unit_of(cell_ids: pd.Series, level: str, kota_map: dict | None = None) -> pd.Series:
    """Nama unit untuk tiap cell_id ('kecamatan|kelurahan')."""
    if level == "kecamatan":
        return cell_ids.str.split("|").str[0]
    if level == "kota":
        if kota_map is None:
            raise ValueError("Level 'kota' butuh pemetaan cell_id -> kota (dari kelurahan_centroids.csv).")
        return cell_ids.map(kota_map)
    raise ValueError(f"level harus salah satu dari {LEVELS}")


def aggregate_features(d: pd.DataFrame, unit: pd.Series, keys=("date",)) -> pd.DataFrame:
    """Agregasi baris tingkat kelurahan ke unit. `d` boleh berisi subset kolom fitur; kolom `flood`
    (jika ada) diambil max. `keys`: kolom tambahan untuk pengelompokan (mis. 'date'), yang tidak ada diabaikan."""
    d = d.assign(unit=unit.to_numpy()).dropna(subset=["unit"])
    keys = [k for k in keys if k in d.columns]
    agg = {}
    for c in RAIN_FEATURES + STATIC_FEATURES + TMA_FEATURES + ["lat", "lon"]:
        if c in d.columns:
            agg[c] = "first" if c in _FIRST else ("min" if c == "elev_min" else "mean")
    if "flood" in d.columns:
        agg["flood"] = "max"
    out = d.groupby(["unit"] + keys, sort=False).agg(agg).reset_index().rename(columns={"unit": "cell_id"})
    if "date" in out.columns:
        out["year"] = out["date"].dt.year
    return out


def aggregate(df: pd.DataFrame, level: str, kota_map: dict | None = None) -> pd.DataFrame:
    return aggregate_features(df, unit_of(df["cell_id"], level, kota_map))


def kota_map_from_centroids(paths) -> dict:
    from .utils import norm_name
    raw = pd.read_csv(paths.centroids_csv)
    if "kota" not in raw.columns:
        raise ValueError("kelurahan_centroids.csv tidak punya kolom 'kota' (jalankan src.build_centroids).")
    cid = raw["kecamatan"].map(norm_name) + "|" + raw["kelurahan"].map(norm_name)   # sama dengan cells.py
    return dict(zip(cid, raw["kota"]))


def run(paths=None, level=None, verbose=True) -> pd.DataFrame:
    from . import config
    from .config import get_paths
    paths = (paths or get_paths()).ensure()
    level = level or config.UNIT
    if level == "kelurahan":
        raise ValueError("Unit 'kelurahan' tidak perlu agregasi.")
    df = pd.read_parquet(paths.train_table)
    kmap = kota_map_from_centroids(paths) if level == "kota" else None
    out = aggregate(df, level, kmap)

    cells = df["cell_id"].drop_duplicates()
    pd.DataFrame({"cell_id": cells.to_numpy(), "unit": unit_of(cells, level, kmap).to_numpy()}).to_csv(
        paths.interim / "cell_unit_map.csv", index=False)
    st = pd.read_csv(paths.interim / "static_features.csv")
    st = st.assign(cell_id_kel=st["cell_id"])
    st["cell_id"] = unit_of(st["cell_id_kel"], level, kmap)
    aggregate_features(st.drop(columns=["cell_id_kel"]), st["cell_id"], keys=()).to_csv(
        paths.interim / "static_features_unit.csv", index=False)

    path = paths.unit_table(level)
    out.to_parquet(path, index=False)
    if verbose:
        by = out.groupby("year").agg(rows=("flood", "size"), flood_rows=("flood", "sum"))
        by["prevalence_%"] = (100 * by["flood_rows"] / by["rows"]).round(2)
        print(f"{out['cell_id'].nunique()} unit {level}, {len(out)} baris -> {path}")
        print(by.to_string())
    return out


if __name__ == "__main__":
    run(level=sys.argv[1] if len(sys.argv) > 1 else None)
