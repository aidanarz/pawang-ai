"""Fungsi bantu: baca tabel, cocokkan nama kolom, normalisasi nama wilayah, parse tanggal."""
from __future__ import annotations

import difflib
import re
import warnings
from pathlib import Path

import numpy as np
import pandas as pd


# ------------------------------------------------------------------ baca file
def normalize_col(c) -> str:
    return re.sub(r"[^0-9a-z]+", "_", str(c).strip().lower()).strip("_")


def read_table(path) -> pd.DataFrame:
    path = Path(path)
    if path.suffix.lower() in (".xlsx", ".xls"):
        with open(path, "rb") as fh:
            head = fh.read(512).lstrip().lower()
        if head.startswith((b"<html", b"<!doctype", b"<table")):   # ekspor satudata: HTML berekstensi .xls
            from io import StringIO
            text = path.read_bytes().decode("utf-8-sig", errors="replace")
            df = pd.concat(pd.read_html(StringIO(text)), ignore_index=True)
        else:
            df = pd.read_excel(path)
    else:
        err = None
        for enc in ("utf-8-sig", "latin-1"):
            try:
                df = pd.read_csv(path, sep=None, engine="python", encoding=enc)
                break
            except UnicodeDecodeError as e:
                err = e
        else:
            raise err
    df.columns = [normalize_col(c) for c in df.columns]
    return df


def iter_tables(directory):
    """Hasilkan (nama_file, DataFrame) untuk semua .csv/.xlsx di folder."""
    files = sorted(p for p in Path(directory).glob("*")
                   if p.suffix.lower() in {".csv", ".xlsx", ".xls"})
    if not files:
        raise FileNotFoundError(f"Tidak ada file .csv/.xlsx di {directory}")
    for p in files:
        yield p.name, read_table(p)


def find_column(df: pd.DataFrame, aliases) -> str | None:
    for a in aliases:
        if a in df.columns:
            return a
    return None


def pick_column(df: pd.DataFrame, aliases, label: str, file: str = "") -> str:
    col = find_column(df, aliases)
    if col is None:
        where = f" di {file}" if file else ""
        raise KeyError(
            f"Kolom '{label}' tidak ditemukan{where}. Kolom yang ada: {list(df.columns)}. "
            f"Tambahkan nama kolom yang benar ke alias di src/config.py."
        )
    return col


def to_number(s: pd.Series) -> pd.Series:
    """Ubah teks ('1,5', '120 cm') menjadi angka; gagal -> NaN."""
    if pd.api.types.is_numeric_dtype(s):
        return pd.to_numeric(s, errors="coerce")
    t = s.astype("string").str.replace(",", ".", regex=False)
    t = t.str.extract(r"(-?\d+(?:\.\d+)?)", expand=False)
    return pd.to_numeric(t, errors="coerce")


# ------------------------------------------------------------------ tanggal
_ID_MONTHS = {
    "januari": "january", "pebruari": "february", "februari": "february", "maret": "march",
    "mei": "may", "juni": "june", "juli": "july", "agustus": "august", "agu": "aug",
    "nopember": "november", "oktober": "october", "okt": "oct", "desember": "december", "des": "dec",
}


def parse_dates(s: pd.Series) -> pd.Series:
    """Parse tanggal campuran (ISO, dd/mm/yyyy, 'dd Januari yyyy', serial Excel). Gagal -> NaT."""
    if pd.api.types.is_datetime64_any_dtype(s):
        out = s
        if getattr(out.dt, "tz", None) is not None:
            out = out.dt.tz_localize(None)
        return out.dt.normalize()
    if pd.api.types.is_numeric_dtype(s):
        return pd.to_datetime(s, unit="D", origin="1899-12-30", errors="coerce").dt.normalize()

    txt = s.astype("string").str.strip()
    iso = txt.str.match(r"^\d{4}-\d{2}-\d{2}", na=False)
    d_iso = pd.to_datetime(txt.where(iso).str.slice(0, 10), format="%Y-%m-%d", errors="coerce")
    other = txt.where(~iso)
    for k, v in _ID_MONTHS.items():
        other = other.str.replace(rf"\b{k}\b", v, case=False, regex=True)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        d_other = pd.to_datetime(other, errors="coerce", dayfirst=True, format="mixed")
    return d_iso.fillna(d_other).dt.normalize()


# ------------------------------------------------------------------ nama wilayah
_PREFIX = re.compile(r"\b(kelurahan|kel|kecamatan|kec)\b\.?")


def norm_name(s) -> str:
    if s is None or (isinstance(s, float) and np.isnan(s)) or s is pd.NA:
        return ""
    t = _PREFIX.sub(" ", str(s).lower().strip())
    t = re.sub(r"[^a-z0-9 ]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def match_cells(kec: pd.Series, kel: pd.Series, centroids: pd.DataFrame):
    """Cocokkan nama (kecamatan, kelurahan) dari data banjir ke cell_id di tabel centroid.

    Urutan: cocok persis -> cocok nama kelurahan saja (jika unik) -> fuzzy di kecamatan yang sama.
    Mengembalikan (Series cell_id sejajar indeks input, DataFrame laporan per nama unik).
    """
    c = centroids.assign(_kec=centroids["kecamatan"].map(norm_name),
                         _kel=centroids["kelurahan"].map(norm_name))
    exact = {(a, b): cid for a, b, cid in zip(c["_kec"], c["_kel"], c["cell_id"])}
    nospace = lambda t: t.replace(" ", "")                       # noqa: E731
    compact = {(nospace(a), nospace(b)): cid for (a, b), cid in exact.items()}
    by_kel = c.groupby("_kel")["cell_id"].agg(list).to_dict()
    kels_in_kec = c.groupby("_kec")["_kel"].agg(list).to_dict()
    kec_names = list(kels_in_kec)

    keys = pd.DataFrame({"_kec": kec.map(norm_name), "_kel": kel.map(norm_name)})
    uniq = keys.drop_duplicates().copy()
    cell, method = [], []
    for a, b in zip(uniq["_kec"], uniq["_kel"]):
        if (a, b) in exact:
            cell.append(exact[(a, b)]); method.append("exact")
            continue
        if (nospace(a), nospace(b)) in compact:                     # 'bale kambang' vs 'balekambang'
            cell.append(compact[(nospace(a), nospace(b))]); method.append("compact")
            continue
        if len(by_kel.get(b, [])) == 1:
            cell.append(by_kel[b][0]); method.append("name_only")
            continue
        kec_ok = a if a in kels_in_kec else next(iter(difflib.get_close_matches(a, kec_names, n=1, cutoff=0.8)), None)
        cands = kels_in_kec.get(kec_ok, []) if kec_ok else []
        m = difflib.get_close_matches(b, cands, n=1, cutoff=0.85)
        if not m:                                                    # 'tengah' -> 'kampung tengah' (token unik)
            tok = [k for k in cands if b and b in k.split()]
            m = tok if len(tok) == 1 else []
        if not m:
            cc = {nospace(k): k for k in cands}
            m = [cc[x] for x in difflib.get_close_matches(nospace(b), list(cc), n=1, cutoff=0.88)]
        if m:
            cell.append(exact[(kec_ok, m[0])]); method.append("fuzzy")
        else:
            cell.append(None); method.append("unmatched")
    uniq["cell_id"] = cell
    uniq["method"] = method

    merged = keys.merge(uniq, on=["_kec", "_kel"], how="left")
    cell_series = pd.Series(merged["cell_id"].to_numpy(), index=kec.index)

    counts = keys.value_counts().rename("n_rows").reset_index()
    report = uniq.merge(counts, on=["_kec", "_kel"], how="left")
    report = report.rename(columns={"_kec": "kecamatan_norm", "_kel": "kelurahan_norm"})
    return cell_series, report


# ------------------------------------------------------------------ geometri
def haversine_km(lat1, lon1, lat2, lon2):
    """Jarak great-circle (km); mendukung broadcasting numpy."""
    lat1, lon1, lat2, lon2 = map(np.radians, (lat1, lon1, lat2, lon2))
    a = (np.sin((lat2 - lat1) / 2) ** 2
         + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2)
    return 2 * 6371.0088 * np.arcsin(np.sqrt(a))
