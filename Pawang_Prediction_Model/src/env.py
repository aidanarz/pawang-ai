"""Muat variabel dari berkas .env di akar proyek ke os.environ (tanpa dependensi tambahan).

Format: BARIS `NAMA=nilai` (boleh diberi tanda kutip), `#` untuk komentar. Variabel yang sudah ada di
lingkungan TIDAK ditimpa. Nilai (mis. token) tidak pernah dicetak oleh modul ini.
"""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_env(path=None) -> list[str]:
    """Mengembalikan daftar NAMA variabel yang dimuat (bukan nilainya)."""
    p = Path(path or ROOT / ".env")
    loaded: list[str] = []
    if not p.exists():
        return loaded
    for line in p.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.lower().startswith("export "):
            line = line[7:]
        k, v = line.split("=", 1)
        k, v = k.strip(), v.strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
            v = v[1:-1]
        if k and k not in os.environ:
            os.environ[k] = v
            loaded.append(k)
    return loaded


def get_token(name: str = "EARTHDATA_TOKEN") -> str:
    load_env()
    tok = os.environ.get(name, "").strip()
    if tok.lower().startswith("bearer "):
        tok = tok[7:].strip()
    if not tok:
        raise RuntimeError(f"Variabel {name} tidak ada (isi di .env atau lingkungan).")
    return tok
