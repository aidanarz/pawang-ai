"""Tes untuk format data asli satudata.jakarta.go.id (TMA dalam mm, nama pos berganti, tanggal banjir tanpa tahun)."""
import numpy as np
import pandas as pd
import pytest

from src import build_tma
from src.config import get_paths
from src.fetch_tma import _coord
from src.flood import expand_flood_dates
from src.utils import read_table


@pytest.mark.parametrize("text,periode,expected", [
    ("TGL. 15, 16", 201801, ["2018-01-15", "2018-01-16"]),
    ("TGL 27,", 201903, ["2019-03-27"]),
    ("TGL. 01, 18 JANUARI", 202001, ["2020-01-01", "2020-01-18"]),
    ("TGL. 01 JANUARI", 201912, ["2020-01-01"]),          # lintas tahun
    ("10,11 OKTOBER", 201910, ["2019-10-10", "2019-10-11"]),
    ("05 s/d 07", 201802, ["2018-02-05", "2018-02-06", "2018-02-07"]),
    ("06/12/2020", 202012, ["2020-12-06"]),
    ("TGL. 31", 201902, []),                                # 31 Februari tidak ada
])
def test_expand_flood_dates(text, periode, expected):
    assert [str(d.date()) for d in expand_flood_dates(text, periode)] == expected


def test_coord_fix():
    assert _coord("-6.197.901", -7, -5.5) == pytest.approx(-6.197901)
    assert _coord("106.810.075", 106, 107.5) == pytest.approx(106.810075)
    assert _coord("-6.397.111.000", -7, -5.5) == pytest.approx(-6.397111)
    assert np.isnan(_coord(None, -7, -5.5))


def test_read_html_xls(tmp_path):
    p = tmp_path / "x.xls"
    p.write_text("<html><body><table><thead><tr><th>Kelurahan</th><th>Tanggal Kejadian</th></tr></thead>"
                 "<tbody><tr><td>A</td><td>TGL. 01</td></tr></tbody></table></body></html>", encoding="utf-8")
    df = read_table(p)
    assert list(df.columns) == ["kelurahan", "tanggal_kejadian"] and len(df) == 1


def test_build_tma_units_rename_and_outliers(tmp_path):
    paths = get_paths(tmp_path, tmp_path / "m").ensure()
    rng = np.random.default_rng(0)
    rows = []
    # satu pos fisik, dua nama (ganti nama di koordinat sama), satuan mm
    for name, month in (("PS. Manggarai", "202001"), ("PA. Manggarai", "202002")):
        for day in range(1, 11):
            for h in range(0, 24, 6):
                rows.append((name, f"{day:02d}/{month[4:]}/2020 {h:02d}:00",
                             float(rng.integers(6000, 7000)), -6.2078, 106.8485, int(month)))
    rows.append(("PA. Manggarai", "05/02/2020 06:00", 536650.0, -6.2078, 106.8485, 202002))   # lonjakan
    rows.append(("PA. Manggarai", "06/02/2020 06:00", 0.0, -6.2078, 106.8485, 202002))        # 0 = hilang
    rows.append(("PA. Manggarai", "06/02/2005 06:00", 6500.0, -6.2078, 106.8485, 202002))     # jam salah
    pd.DataFrame(rows, columns=["nama_pintu_air", "tanggal", "tinggi_air", "latitude", "longitude",
                                "periode_data"]).to_csv(paths.raw_tma / "t.csv", index=False)
    daily = build_tma.run(paths, verbose=False)
    assert daily["station_id"].nunique() == 1
    assert daily["tma_max"].between(600, 700).all()          # mm -> cm
    assert daily["date"].min() >= pd.Timestamp("2020-01-01")
    assert (paths.interim / "tma_stations.csv").exists()
