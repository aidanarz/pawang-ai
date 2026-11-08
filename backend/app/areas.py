"""Area catalogue: the 44 kecamatan the model predicts for, the kelurahan inside each, and which rainfall
grid point and water-level station feed each kelurahan.

Everything here is read from the model's own files in Pawang_Prediction_Model/models/, so the backend can
never disagree with the model about what an area is called or which inputs belong to it.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import pandas as pd


@dataclass(frozen=True)
class Kelurahan:
    cell_id: str          # "kecamatan|kelurahan" (model key)
    name: str
    lat: float
    lon: float
    point_id: str         # rainfall grid point, e.g. "-6.1000_106.7000"
    station_id: str | None
    station_km: float | None


@dataclass(frozen=True)
class Kecamatan:
    cell_id: str          # model key, e.g. "grogol petamburan"
    grid_id: str          # URL-safe id for the API, e.g. "grogol-petamburan"
    name: str             # display name, e.g. "Grogol Petamburan"
    lat: float
    lon: float
    kelurahan: tuple[Kelurahan, ...]
    # GeoJSON Polygon coordinates ([exterior, *holes], [lng, lat]) from models/kecamatan_boundaries.geojson;
    # None when that file is missing (the heatmap then draws an approximate square).
    boundary: list | None = field(default=None, compare=False, hash=False, repr=False)

    @property
    def point_ids(self) -> list[str]:
        return sorted({k.point_id for k in self.kelurahan})

    @property
    def station_ids(self) -> list[str]:
        return sorted({k.station_id for k in self.kelurahan if k.station_id})


def to_grid_id(cell_id: str) -> str:
    return cell_id.strip().lower().replace(" ", "-")


class AreaCatalog:
    def __init__(self, models_dir: Path):
        kel = pd.read_csv(models_dir / "static_features_kelurahan.csv")
        unit = pd.read_csv(models_dir / "cell_unit_map.csv")
        st_path = models_dir / "cell_station_map.csv"
        stations = pd.read_csv(st_path) if st_path.exists() else pd.DataFrame(columns=["cell_id", "station_id", "station_km"])
        kec = pd.read_csv(models_dir / "static_features.csv")
        boundaries = self._read_boundaries(models_dir / "kecamatan_boundaries.geojson")

        kel = kel.merge(unit, on="cell_id", how="left").merge(stations, on="cell_id", how="left")
        names = kel.groupby("unit")["kecamatan"].first().to_dict()
        self.kelurahan_static = kel  # used by get_static_features

        self._by_cell: dict[str, Kecamatan] = {}
        for _, row in kec.iterrows():
            rows = kel[kel["unit"] == row["cell_id"]]
            members = tuple(
                Kelurahan(
                    cell_id=r.cell_id, name=r.kelurahan, lat=float(r.lat), lon=float(r.lon), point_id=r.point_id,
                    station_id=None if pd.isna(r.station_id) else r.station_id,
                    station_km=None if pd.isna(r.station_km) else float(r.station_km),
                )
                for r in rows.itertuples()
            )
            self._by_cell[row["cell_id"]] = Kecamatan(
                cell_id=row["cell_id"], grid_id=to_grid_id(row["cell_id"]),
                name=str(names.get(row["cell_id"], row["cell_id"].title())),
                lat=float(row["lat"]), lon=float(row["lon"]), kelurahan=members,
                boundary=boundaries.get(row["cell_id"]),
            )
        self._by_grid = {k.grid_id: k for k in self._by_cell.values()}

    @staticmethod
    def _read_boundaries(path: Path) -> dict[str, list]:
        """cell_id -> Polygon coordinates, from the file written by src.build_boundaries."""
        if not path.exists():
            return {}
        doc = json.loads(path.read_text(encoding="utf-8"))
        return {f["properties"]["cell_id"]: f["geometry"]["coordinates"]
                for f in doc["features"] if f["geometry"]["type"] == "Polygon"}

    def all(self) -> list[Kecamatan]:
        return sorted(self._by_cell.values(), key=lambda k: k.cell_id)

    def by_grid_id(self, grid_id: str) -> Kecamatan | None:
        return self._by_grid.get(to_grid_id(grid_id))

    def nearest(self, lat: float, lon: float) -> Kecamatan:
        def dist(k: Kecamatan) -> float:
            dy = k.lat - lat
            dx = (k.lon - lon) * math.cos(math.radians(lat))
            return dx * dx + dy * dy
        return min(self._by_cell.values(), key=dist)


@lru_cache(maxsize=4)
def get_catalog(models_dir: str) -> AreaCatalog:
    return AreaCatalog(Path(models_dir))
