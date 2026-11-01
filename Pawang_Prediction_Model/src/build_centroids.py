"""Buat data/raw/kelurahan_centroids.csv dari batas administrasi level 4 (kelurahan/desa).

Sumber: OCHA COD-AB Indonesia (HDX, BPS, CC BY-IGO), layer `idn_admin4` dalam geodatabase:
  https://data.humdata.org/dataset/cod-ab-idn  (idn_admin_boundaries.gdb.zip, ~219 MB)
Taruh zip di data/external/ lalu jalankan:  python -m src.build_centroids [path.gdb.zip]

Titik = centroid poligon; bila jatuh di luar poligon (bentuk cekung) dipakai representative_point.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

from .config import ROOT, get_paths

DEFAULT_GDB = ROOT / "data" / "external" / "idn_admin_boundaries.gdb.zip"
JAKARTA_PCODE = "ID31"   # kode BPS provinsi DKI Jakarta


def run(gdb=None, verbose=True) -> pd.DataFrame:
    import pyogrio
    import pyogrio.raw
    import shapely

    paths = get_paths().ensure()
    gdb = Path(gdb or DEFAULT_GDB)
    if not gdb.exists():
        raise FileNotFoundError(f"{gdb} tidak ada. Unduh idn_admin_boundaries.gdb.zip dari HDX (cod-ab-idn).")
    meta, _, geom, fields = pyogrio.raw.read(gdb, layer="idn_admin4", where=f"adm1_pcode = '{JAKARTA_PCODE}'")
    cols = dict(zip(meta["fields"], fields))
    polys = shapely.from_wkb(geom)
    cen = shapely.centroid(polys)
    outside = ~shapely.contains(polys, cen)
    cen = np.where(outside, shapely.point_on_surface(polys), cen)

    df = pd.DataFrame({
        "kelurahan": cols["adm4_name"],
        "kecamatan": cols["adm3_name"],
        "kota": cols["adm2_name"],
        "lat": [p.y for p in cen],
        "lon": [p.x for p in cen],
        "adm4_pcode": cols["adm4_pcode"],
    })
    df = df[df["kota"].str.contains("Jakarta", case=False, na=False)]   # buang Kepulauan Seribu bila tak diinginkan
    df = df.sort_values(["kota", "kecamatan", "kelurahan"]).reset_index(drop=True)
    df.to_csv(paths.centroids_csv, index=False)
    if verbose:
        print(f"{len(df)} kelurahan -> {paths.centroids_csv}  ({int(outside.sum())} centroid dipindah ke dalam poligon)")
        print(df.groupby("kota").size().to_string())
        print(df[["lat", "lon"]].describe().round(4).to_string())
    return df


if __name__ == "__main__":
    run(sys.argv[1] if len(sys.argv) > 1 else None)
