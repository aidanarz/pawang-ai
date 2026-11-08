"""Buat models/kecamatan_boundaries.geojson: batas poligon 44 kecamatan untuk peta di backend/frontend.

Sumber sama dengan build_centroids: OCHA COD-AB Indonesia (HDX, BPS, CC BY-IGO), layer `idn_admin4`.
Poligon kelurahan digabung (dissolve) per kecamatan, jadi batas kecamatan di peta persis sama dengan
definisi kecamatan yang dipakai model (kelurahan yang sama).

  python -m src.build_boundaries [path.gdb.zip]

Hasil (ringan, sekitar 100 KB):
  - kunci `cell_id` = norm_name(kecamatan), sama dengan cell_id model (mis. "grogol petamburan")
  - koordinat dibulatkan 5 desimal (~1 m) dan disederhanakan (toleransi ~20 m)
  - kecamatan yang terdiri dari beberapa bagian terpisah (mis. enklave) diwakili bagian terbesarnya
    supaya semua geometri tetap berupa Polygon (itulah bentuk yang dipakai frontend).
    Persentase luas yang dibuang dilaporkan di layar.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

from .config import ROOT, get_paths
from .utils import norm_name

DEFAULT_GDB = ROOT / "data" / "external" / "idn_admin_boundaries.gdb.zip"
JAKARTA_PCODE = "ID31"
SIMPLIFY_DEG = 0.0002       # ~22 m
DECIMALS = 5                # ~1 m


def _ring(coords) -> list[list[float]]:
    return [[round(x, DECIMALS), round(y, DECIMALS)] for x, y in coords]


def run(gdb=None, out=None, verbose=True) -> dict:
    import pyogrio.raw
    import shapely

    paths = get_paths().ensure()
    gdb = Path(gdb or DEFAULT_GDB)
    if not gdb.exists():
        raise FileNotFoundError(f"{gdb} tidak ada. Unduh idn_admin_boundaries.gdb.zip dari HDX (cod-ab-idn).")
    out = Path(out or paths.models_dir / "kecamatan_boundaries.geojson")

    meta, _, geom, fields = pyogrio.raw.read(gdb, layer="idn_admin4", where=f"adm1_pcode = '{JAKARTA_PCODE}'")
    cols = dict(zip(meta["fields"], fields))
    df = pd.DataFrame({"kecamatan": cols["adm3_name"], "kota": cols["adm2_name"], "geom": shapely.from_wkb(geom)})
    df = df[df["kota"].str.contains("Jakarta", case=False, na=False)]      # sama dengan build_centroids
    df["cell_id"] = df["kecamatan"].map(norm_name)

    # hanya kecamatan yang dikenal model
    units = pd.read_csv(paths.models_dir / "static_features.csv")["cell_id"]
    known = set(units)
    missing = sorted(known - set(df["cell_id"]))
    if missing:
        raise RuntimeError(f"Kecamatan model tanpa batas di sumber: {missing}")
    df = df[df["cell_id"].isin(known)]

    features, dropped = [], {}
    for cell_id, g in df.groupby("cell_id"):
        merged = shapely.union_all(list(g["geom"]))
        parts = list(merged.geoms) if merged.geom_type == "MultiPolygon" else [merged]
        biggest = max(parts, key=lambda p: p.area)
        if len(parts) > 1:
            dropped[cell_id] = 1 - biggest.area / sum(p.area for p in parts)
        simple = biggest.simplify(SIMPLIFY_DEG, preserve_topology=True)
        if simple.geom_type != "Polygon" or simple.is_empty:
            simple = biggest
        rings = [_ring(simple.exterior.coords)] + [_ring(r.coords) for r in simple.interiors]
        features.append({
            "type": "Feature",
            "properties": {"cell_id": cell_id, "name": g["kecamatan"].iloc[0]},
            "geometry": {"type": "Polygon", "coordinates": rings},
        })
    features.sort(key=lambda f: f["properties"]["cell_id"])
    doc = {"type": "FeatureCollection",
           "metadata": {"source": "OCHA COD-AB Indonesia (HDX, BPS), idn_admin4 dissolved per kecamatan",
                        "license": "CC BY-IGO", "simplify_deg": SIMPLIFY_DEG},
           "features": features}
    out.write_text(json.dumps(doc, separators=(",", ":")), encoding="utf-8")
    if verbose:
        print(f"{len(features)} kecamatan -> {out} ({out.stat().st_size / 1024:.0f} KB)")
        for k, v in sorted(dropped.items()):
            print(f"  {k}: bagian terpisah dibuang, {v:.2%} luas")
        if not dropped:
            print("  tidak ada kecamatan dengan bagian terpisah")
    return doc


if __name__ == "__main__":
    run(sys.argv[1] if len(sys.argv) > 1 else None)
