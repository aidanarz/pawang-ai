"""Unduh data tinggi muka air (TMA) per tahun dari API satudata.jakarta.go.id.

Respons API berupa satu JSON besar (puluhan MB, tanpa paging) sehingga diunduh streaming
ke data/raw/tma_json/tma_<tahun>.json, dicek keutuhannya, lalu dikonversi ke
data/raw/tma/tma_<tahun>.csv dengan format yang dipahami build_tma.py.

Pakai:  python -m src.fetch_tma [tahun ...]     (default: semua tahun di YEAR_SLUGS)
"""
from __future__ import annotations

import json
import re
import sys
import time

import pandas as pd
import requests

from .config import get_paths

API = ("https://ws.jakarta.go.id/gateway/DataPortalSatuDataJakarta/1.0/satudata"
       "?kategori=dataset&tipe=detail&url={slug}")
YEAR_SLUGS = {
    2016: "data-tinggi-muka-air-di-dki-jakarta-tahun-2016",
    2017: "data-tinggi-muka-air-di-dki-jakarta-tahun-2017",
    2018: "data-tinggi-muka-air-di-dki-jakarta-tahun-2018",
    2019: "data-tinggi-muka-air-dki-jakarta-tahun-2019",
    2020: "data-tinggi-muka-air-di-provinsi-dki-jakarta-tahun-2020",
}
RETRIES = 4


def download(year: int, dest, retries: int = RETRIES) -> None:
    url = API.format(slug=YEAR_SLUGS[year])
    for attempt in range(1, retries + 1):
        try:
            with requests.get(url, stream=True, timeout=(30, 120)) as r:
                r.raise_for_status()
                with open(dest, "wb") as f:
                    for chunk in r.iter_content(chunk_size=1 << 20):
                        f.write(chunk)
            json.load(open(dest, encoding="utf-8-sig"))   # gagal jika terpotong
            return
        except (requests.RequestException, json.JSONDecodeError) as e:
            print(f"[{year}] percobaan {attempt}/{retries} gagal: {type(e).__name__}: {e}", flush=True)
            time.sleep(5 * attempt)
    raise RuntimeError(f"Tahun {year}: gagal mengunduh JSON utuh setelah {retries} percobaan")


def _coord(v, lo: float, hi: float) -> float:
    """'-6.197.901' / '-6.397.111.000' -> -6.197901 / -6.397111 (titik dipakai sebagai pemisah ribuan)."""
    if v is None:
        return float("nan")
    s = str(v).strip()
    sign = -1.0 if s.startswith("-") else 1.0
    digits = re.sub(r"\D", "", s)
    if not digits:
        return float("nan")
    # digit pertama bagian bulat; sisanya desimal. Lat/lon Jakarta: 1 digit (lat) atau 3 digit (lon) bulat.
    for n_int in (1, 2, 3):
        val = sign * float(digits[:n_int] + "." + digits[n_int:] if digits[n_int:] else digits[:n_int])
        if lo <= val <= hi:
            return val
    return float("nan")


def to_frame(json_path) -> pd.DataFrame:
    rows = json.load(open(json_path, encoding="utf-8-sig"))["data"]
    df = pd.DataFrame(rows)
    out = pd.DataFrame({
        "nama_pintu_air": df["nama_pintu_air"].str.strip(),
        "tanggal": df["tanggal"].str.strip(),
        "tinggi_air": pd.to_numeric(df["tinggi_air"], errors="coerce"),
        "latitude": df["latitude"].map(lambda v: _coord(v, -7.0, -5.5)),
        "longitude": df["longitude"].map(lambda v: _coord(v, 106.0, 107.5)),
        "periode_data": df["periode_data"],
    })
    return out


def run(years=None) -> None:
    paths = get_paths().ensure()
    json_dir = paths.data_dir / "raw" / "tma_json"
    json_dir.mkdir(parents=True, exist_ok=True)
    for y in (years or sorted(YEAR_SLUGS)):
        jp = json_dir / f"tma_{y}.json"
        if not jp.exists():
            print(f"[{y}] mengunduh ...", flush=True)
            tmp = jp.with_suffix(".part")
            download(y, tmp)
            tmp.replace(jp)
        df = to_frame(jp)
        df.to_csv(paths.raw_tma / f"tma_{y}.csv", index=False)
        print(f"[{y}] {len(df)} baris, periode {df['periode_data'].min()}..{df['periode_data'].max()}", flush=True)


if __name__ == "__main__":
    run([int(a) for a in sys.argv[1:]] or None)
