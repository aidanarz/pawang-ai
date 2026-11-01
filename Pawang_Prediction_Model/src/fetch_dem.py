"""Unduh tile Copernicus DEM GLO-30 untuk Jakarta (bucket publik AWS, tanpa akun/API key).

Tile 1x1 derajat, dinamai menurut sudut barat daya: S07_00_E106_00 = lat -7..-6, lon 106..107.
Hasil: data/raw/dem/Copernicus_DSM_COG_10_<tile>_DEM.tif (EPSG:4326, meter di atas EGM2008).

Pakai:  python -m src.fetch_dem
"""
from __future__ import annotations

import requests

from .config import get_paths

BUCKET_URL = "https://copernicus-dem-30m.s3.eu-central-1.amazonaws.com"
# Jakarta: lat -6.4..-5.9, lon 106.6..107.0 -> dua tile ini sudah mencakup seluruhnya.
TILES = ["S07_00_E106_00", "S06_00_E106_00"]


def run(tiles=TILES) -> None:
    paths = get_paths().ensure()
    for t in tiles:
        name = f"Copernicus_DSM_COG_10_{t}_DEM"
        dest = paths.raw_dem / f"{name}.tif"
        if dest.exists() and dest.stat().st_size > 0:
            print(f"{dest.name}: sudah ada, dilewati")
            continue
        tmp = dest.with_suffix(".part")
        with requests.get(f"{BUCKET_URL}/{name}/{name}.tif", stream=True, timeout=(30, 120)) as r:
            r.raise_for_status()
            with open(tmp, "wb") as f:
                for chunk in r.iter_content(chunk_size=1 << 20):
                    f.write(chunk)
        tmp.replace(dest)
        print(f"{dest.name}: {dest.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    run()
