"""Baca data kejadian banjir (satudata.jakarta.go.id) dan petakan ke cell_id."""
from __future__ import annotations

import re

import numpy as np
import pandas as pd

from . import config
from .utils import find_column, iter_tables, match_cells, parse_dates, pick_column, to_number

_MONTHS = {"januari": 1, "pebruari": 2, "februari": 2, "maret": 3, "april": 4, "mei": 5, "juni": 6,
           "juli": 7, "agustus": 8, "september": 9, "oktober": 10, "nopember": 11, "november": 11,
           "desember": 12}
_MONTH_RE = re.compile(r"\b(" + "|".join(_MONTHS) + r")\b")


def expand_flood_dates(text, periode) -> list[pd.Timestamp]:
    """Ubah teks tanggal kejadian jadi daftar tanggal.

    Format yang ditemui: 'TGL. 15, 16', 'TGL 05', 'TGL. 01 JANUARI', '10,11 OKTOBER',
    '05 s/d 07', '06/12/2020', '2020-01-01'. Bulan/tahun yang tidak tertulis diambil dari
    `periode` (YYYYMM). Teks tanpa hari -> daftar kosong.
    """
    t = str(text).strip().lower()
    if t in ("", "nan", "<na>", "none"):
        return []
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", t)
    if m:
        y, mo, d = map(int, m.groups())
        return _safe_dates([(y, mo, d)])
    m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", t)
    if m:
        d, mo, y = map(int, m.groups())
        return _safe_dates([(y, mo, d)])

    per = re.sub(r"\D", "", str(periode))
    py, pm = (int(per[:4]), int(per[4:6])) if len(per) >= 6 else (None, None)
    mm = _MONTH_RE.search(t)
    month = _MONTHS[mm.group(1)] if mm else pm
    ym = re.search(r"\b(20\d{2})\b", t)
    year = int(ym.group(1)) if ym else py
    if month is None or year is None:
        return []
    if mm and not ym and pm is not None:          # 'TGL. 01 JANUARI' pada periode Desember -> tahun berikut
        if month < pm - 6:
            year += 1
        elif month > pm + 6:
            year -= 1
    body = _MONTH_RE.sub(" ", re.sub(r"\b20\d{2}\b", " ", t))
    days: list[int] = []
    for a, b in re.findall(r"(\d{1,2})\s*(?:-|s/d|s\.d|sd)\s*(\d{1,2})", body):
        days += list(range(int(a), int(b) + 1)) if 0 < int(a) <= int(b) <= 31 else []
    body = re.sub(r"(\d{1,2})\s*(?:-|s/d|s\.d|sd)\s*(\d{1,2})", " ", body)
    days += [int(x) for x in re.findall(r"\d{1,2}", body)]
    return _safe_dates([(year, month, d) for d in sorted(set(days))])


def _safe_dates(ymds) -> list[pd.Timestamp]:
    out = []
    for y, mo, d in ymds:
        try:
            out.append(pd.Timestamp(year=y, month=mo, day=d))
        except ValueError:
            pass
    return out


def _max_height(s: pd.Series) -> pd.Series:
    """Ambil angka terbesar dari '10 S/D 40 CM' -> 40 (satuan cm)."""
    nums = s.astype("string").str.replace(",", ".", regex=False).str.findall(r"\d+(?:\.\d+)?")
    return nums.map(lambda v: max(map(float, v)) if len(v) else np.nan)


def read_flood_raw(paths) -> pd.DataFrame:
    """Gabungkan semua file di data/raw/flood. Kolom: date, kecamatan, kelurahan, height, source_file.

    Tanggal yang gagal di-parse dibiarkan NaT (dilaporkan oleh pemanggil).
    """
    frames = []
    for name, df in iter_tables(paths.raw_flood):
        c_date = find_column(df, config.FLOOD_ALIASES["date"])
        if c_date is None:
            print(f"PERINGATAN: {name} tidak punya kolom tanggal kejadian (rekap bulanan); dilewati "
                  "karena label dilatih per hari.")
            continue
        c_kel = pick_column(df, config.FLOOD_ALIASES["kelurahan"], "kelurahan", name)
        c_kec = find_column(df, config.FLOOD_ALIASES["kecamatan"])
        c_h = find_column(df, config.FLOOD_ALIASES["height"])
        c_per = find_column(df, ["periode_data", "periode"])
        out = pd.DataFrame({
            "date": None,
            "kecamatan": df[c_kec].astype("string") if c_kec else "",
            "kelurahan": df[c_kel].astype("string"),
            "height": _max_height(df[c_h]) if c_h else np.nan,
            "source_file": name,
        })
        if c_per:
            out["date"] = [expand_flood_dates(t, p) for t, p in zip(df[c_date], df[c_per])]
            out["_n"] = out["date"].map(len)
            out = out.explode("date")      # satu baris per tanggal; baris tanpa hari -> NaT (terlapor)
            out["date"] = pd.to_datetime(out["date"], errors="coerce")
            out = out.drop(columns="_n")
        else:
            out["date"] = parse_dates(df[c_date])
        frames.append(out)
    if not frames:
        raise ValueError(f"Tidak ada file banjir dengan kolom tanggal di {paths.raw_flood}")
    return pd.concat(frames, ignore_index=True)


def flood_date_range(paths) -> tuple[pd.Timestamp, pd.Timestamp]:
    raw = read_flood_raw(paths).dropna(subset=["date"])
    if raw.empty:
        raise ValueError("Tidak ada tanggal valid di data banjir. Jalankan python -m src.audit_data.")
    return raw["date"].min(), raw["date"].max()


def load_flood(paths, cells: pd.DataFrame):
    """Kembalikan (events, report).

    events: satu baris per (cell_id, date) yang tercatat banjir (n_records = jumlah baris/RW).
    report: dict ringkasan kualitas data + DataFrame pencocokan nama.
    """
    raw = read_flood_raw(paths)
    n_total = len(raw)
    n_bad_date = int(raw["date"].isna().sum())
    raw = raw.dropna(subset=["date", "kelurahan"])

    cell_id, match_report = match_cells(raw["kecamatan"].fillna(""), raw["kelurahan"], cells)
    raw = raw.assign(cell_id=cell_id).dropna(subset=["cell_id"])
    n_matched = len(raw)

    events = (raw.groupby(["cell_id", "date"])
              .agg(n_records=("date", "size"), max_height=("height", "max"))
              .reset_index())
    report = {
        "rows_total": n_total,
        "rows_bad_date": n_bad_date,
        "rows_matched": n_matched,
        "match_rate": n_matched / max(n_total - n_bad_date, 1),
        "events": len(events),
        "match_report": match_report,
    }
    return events, report
