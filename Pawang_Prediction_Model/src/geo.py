"""Bantuan lingkungan geospasial."""
from __future__ import annotations

import importlib.util
import os
from pathlib import Path


def fix_proj_env() -> None:
    """Instalasi PROJ lain di sistem (mis. PostgreSQL/PostGIS) bisa menimpa proj.db milik rasterio
    sehingga CRS terbaca None. Paksa pakai proj_data bawaan paket rasterio. Panggil SEBELUM import rasterio."""
    spec = importlib.util.find_spec("rasterio")
    if spec and spec.origin:
        proj = Path(spec.origin).parent / "proj_data"
        if proj.is_dir():
            os.environ["PROJ_DATA"] = os.environ["PROJ_LIB"] = str(proj)
