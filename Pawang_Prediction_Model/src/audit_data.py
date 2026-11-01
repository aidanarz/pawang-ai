"""Periksa semua input mentah sebelum membangun dataset. Jalankan ini PERTAMA.

    python -m src.audit_data

Setiap bagian dijalankan terpisah, jadi satu input yang belum siap tidak menyembunyikan hasil lainnya.
"""
from __future__ import annotations

import pandas as pd

from . import config
from .utils import find_column, iter_tables


def _section(title):
    print(f"\n{'=' * 8} {title} {'=' * 8}")


def audit_centroids(paths):
    from .cells import load_centroids
    c = load_centroids(paths)
    print(f"{len(c)} kelurahan | lat {c.lat.min():.3f}..{c.lat.max():.3f} | lon {c.lon.min():.3f}..{c.lon.max():.3f}")
    print(f"titik hujan unik (grid {config.RAIN_GRID_DEG} derajat): {c.point_id.nunique()}")
    return c


def audit_flood(paths, cells):
    from .flood import load_flood, read_flood_raw
    raw_all = read_flood_raw(paths)    # parser tanggal sama dengan training (periode_data + hari)
    for name, df in iter_tables(paths.raw_flood):
        sub = raw_all[raw_all["source_file"] == name]
        if sub.empty:
            print(f"{name}: {len(df)} baris | KOLOM TANGGAL TIDAK DITEMUKAN (dilewati)")
        else:
            d = sub["date"]
            rng = f"{d.min().date()}..{d.max().date()}" if d.notna().any() else "-"
            print(f"{name}: {len(df)} baris -> {len(sub)} baris-tanggal | tanggal {rng} | "
                  f"{d.isna().mean():.1%} tanpa hari valid")
        print(f"   kolom: {list(df.columns)}")
    raw = read_flood_raw(paths).dropna(subset=["date"])
    print("baris per tahun:", raw["date"].dt.year.value_counts().sort_index().to_dict())
    if cells is None:
        print("(pencocokan nama dilewati: tabel centroid belum ada)")
        return
    events, rep = load_flood(paths, cells)
    print(f"cocok ke centroid: {rep['match_rate']:.1%} baris | kejadian unik (kelurahan-hari): {rep['events']}")
    mr = rep["match_report"]
    print("metode:", mr.groupby("method")["n_rows"].sum().to_dict())
    un = mr[mr["method"] == "unmatched"].sort_values("n_rows", ascending=False)
    if len(un):
        un.to_csv(paths.interim / "unmatched_kelurahan.csv", index=False)
        print(f"{len(un)} nama tidak cocok (disimpan di interim/unmatched_kelurahan.csv), 15 teratas:")
        print(un[["kecamatan_norm", "kelurahan_norm", "n_rows"]].head(15).to_string(index=False))


def audit_tma(paths):
    for name, df in iter_tables(paths.raw_tma):
        picks = {k: find_column(df, config.TMA_ALIASES[k]) for k in ("time", "station", "level")}
        print(f"{name}: {len(df)} baris | terdeteksi: {picks}")
        if None in picks.values():
            print(f"   kolom yang ada: {list(df.columns)}  -> perbarui TMA_ALIASES di config.py")
    print("koordinat pos:",
          "ada (data/raw/tma_stations.csv)" if paths.tma_stations_csv.exists()
          else "ada (diturunkan dari file TMA: interim/tma_stations.csv)"
          if (paths.interim / "tma_stations.csv").exists()
          else "BELUM ADA -> buat data/raw/tma_stations.csv (station, lat, lon) untuk model 'full'")


def audit_dem(paths):
    import rasterio
    files = sorted(p for p in paths.raw_dem.glob("*") if p.suffix.lower() in (".tif", ".tiff"))
    if not files:
        raise FileNotFoundError(f"Tidak ada .tif di {paths.raw_dem}")
    for f in files:
        with rasterio.open(f) as s:
            print(f"{f.name}: {s.width}x{s.height} | CRS {s.crs} | bounds {tuple(round(b, 3) for b in s.bounds)}")


def audit_rain(paths):
    files = list(paths.rain_dir.glob("*.csv"))
    print(f"{len(files)} titik hujan ter-cache di {paths.rain_dir}" if files
          else "belum ada cache hujan -> python -m src.fetch_rainfall")


def run(paths=None):
    from .config import get_paths
    paths = (paths or get_paths()).ensure()
    cells = None
    for title, fn in (("Centroid kelurahan", lambda: audit_centroids(paths)),):
        _section(title)
        try:
            cells = fn()
        except Exception as e:
            print(f"[BELUM SIAP] {e}")
    for title, fn in (("Data banjir", lambda: audit_flood(paths, cells)),
                      ("Tinggi muka air", lambda: audit_tma(paths)),
                      ("DEM", lambda: audit_dem(paths)),
                      ("Curah hujan", lambda: audit_rain(paths))):
        _section(title)
        try:
            fn()
        except Exception as e:
            print(f"[BELUM SIAP] {type(e).__name__}: {e}")


if __name__ == "__main__":
    run()
