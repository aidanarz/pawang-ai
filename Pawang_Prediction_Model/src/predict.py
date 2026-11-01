"""Inference (logistic atau XGBoost, sesuai meta.json): kontrak yang dipakai backend/agent.

    from src.predict import FloodPredictor
    fp = FloodPredictor()                       # memuat models/*.meta.json + model
    result = fp.predict(features_df)            # DataFrame: cell_id, p_flood, risk_level, mode, model_version

INPUT  features_df: satu baris per UNIT PREDIKSI (config.UNIT, default kecamatan; lihat fp.unit) untuk SATU hari
       target. Jika fiturnya tersedia per kelurahan, pakai fp.predict_from_kelurahan(df) yang mengagregasi dulu.
       Dahulu: satu baris per kelurahan untuk SATU hari target. Wajib kolom `cell_id` dan fitur model
       (lihat models/<mode>.meta.json -> "features"). Fitur hujan dibuat dengan
       src.features.rain_features() dari deret hujan harian yang hari terakhirnya = hari target
       (hari target diisi prakiraan). Fitur statis: fp.with_static(df) menambahkannya dari cell_id.
OUTPUT cell_id (= nama unit), p_flood (0..1, terkalibrasi), risk_level (low/medium/high/unknown), mode, model_version.

mode="auto"          : pakai model `full` untuk baris yang fitur TMA-nya lengkap, selainnya `rainfall_only`
mode="full"/"rainfall_only": paksa satu model
strict=True          : baris yang fiturnya tidak lengkap -> ValueError (tidak pernah menebak angka)
strict=False         : baris itu dikembalikan dengan p_flood=NaN dan risk_level="unknown"
"""
from __future__ import annotations

import argparse
import json

import numpy as np
import pandas as pd
import xgboost as xgb

from .calibration import Calibrator
from .linear_model import LinearModel

MODE_ORDER = ("full", "rainfall_only")


class FloodPredictor:
    def __init__(self, models_dir=None):
        from .config import get_paths
        self.models_dir = get_paths(models_dir=models_dir).models_dir
        self.models: dict[str, dict] = {}
        for mode in MODE_ORDER:
            meta_p = self.models_dir / f"{mode}.meta.json"
            if not meta_p.exists():
                continue
            meta = json.loads(meta_p.read_text())
            algo = meta.get("algo", "xgboost")
            model_p = self.models_dir / (f"{mode}.linear.json" if algo == "logistic" else f"{mode}.xgb.json")
            if not model_p.exists():
                continue
            entry = {"meta": meta, "calibrator": Calibrator.from_dict(meta["calibration"]), "algo": algo}
            if algo == "logistic":
                entry["linear"] = LinearModel.load(model_p)
            else:
                booster = xgb.Booster()
                booster.load_model(model_p)
                entry["booster"] = booster
            self.models[mode] = entry
        if not self.models:
            raise FileNotFoundError(f"Tidak ada model di {self.models_dir}. Jalankan: python -m src.train")
        self.unit = next(iter(self.models.values()))["meta"].get("unit", "kelurahan")
        sf = self.models_dir / "static_features.csv"          # pada unit prediksi (cell_id = unit)
        self.static = pd.read_csv(sf) if sf.exists() else None
        sk, cu = self.models_dir / "static_features_kelurahan.csv", self.models_dir / "cell_unit_map.csv"
        self.static_kelurahan = pd.read_csv(sk) if sk.exists() else None
        self.cell_unit = pd.read_csv(cu) if cu.exists() else None
        # pos TMA terdekat tiap kelurahan + distribusi referensi untuk fitur tma_pct
        cs, tr = self.models_dir / "cell_station_map.csv", self.models_dir / "tma_reference.csv"
        self.cell_station = pd.read_csv(cs) if cs.exists() else None
        self.tma_reference = pd.read_csv(tr) if tr.exists() else None

    def tma_percentile(self, station_ids, tma_max) -> np.ndarray:
        """Hitung fitur `tma_pct` dari tinggi muka air (cm) dan station_id, sama seperti saat training."""
        from .features import tma_to_pct
        if self.tma_reference is None:
            raise FileNotFoundError("models/tma_reference.csv tidak ada (model 'full' belum dilatih?).")
        return tma_to_pct(tma_max, station_ids, self.tma_reference)

    @property
    def modes(self):
        return [m for m in MODE_ORDER if m in self.models]

    def required_features(self, mode: str) -> list[str]:
        return list(self.models[mode]["meta"]["features"])

    def with_static(self, df: pd.DataFrame) -> pd.DataFrame:
        """Tambahkan fitur statis (elevasi, lat, lon) berdasarkan cell_id."""
        if self.static is None:
            raise FileNotFoundError("models/static_features.csv tidak ada.")
        cols = [c for c in self.static.columns if c not in ("kecamatan", "kelurahan", "point_id")]
        have = [c for c in cols if c != "cell_id" and c in df.columns]
        return df.drop(columns=have).merge(self.static[cols], on="cell_id", how="left")

    def with_static_kelurahan(self, df: pd.DataFrame) -> pd.DataFrame:
        """Seperti with_static, tetapi untuk baris tingkat kelurahan (cell_id = 'kecamatan|kelurahan')."""
        src = self.static_kelurahan if self.static_kelurahan is not None else (
            self.static if self.unit == "kelurahan" else None)
        if src is None:
            raise FileNotFoundError("models/static_features_kelurahan.csv tidak ada.")
        cols = [c for c in src.columns if c not in ("kecamatan", "kelurahan", "point_id")]
        have = [c for c in cols if c != "cell_id" and c in df.columns]
        return df.drop(columns=have).merge(src[cols], on="cell_id", how="left")

    def to_units(self, kelurahan_df: pd.DataFrame) -> pd.DataFrame:
        """Agregasi fitur tingkat kelurahan ke unit prediksi dengan aturan yang sama seperti training.

        Input: satu baris per kelurahan (dan per hari bila ada kolom `date`) dengan fitur hujan, TMA, dan
        statis (tambahkan statis lewat with_static_kelurahan). Output: satu baris per unit, cell_id = unit."""
        from .aggregate import aggregate_features
        if self.unit == "kelurahan":
            return kelurahan_df
        if self.cell_unit is None:
            raise FileNotFoundError("models/cell_unit_map.csv tidak ada (latih ulang dengan build_dataset + train).")
        unit = kelurahan_df["cell_id"].map(dict(zip(self.cell_unit["cell_id"], self.cell_unit["unit"])))
        if unit.isna().any():
            ids = kelurahan_df.loc[unit.isna(), "cell_id"].drop_duplicates().head(5).tolist()
            raise ValueError(f"cell_id tidak dikenal (bukan kelurahan terlatih), contoh: {ids}")
        return aggregate_features(kelurahan_df, unit, keys=("date",))

    def predict_from_kelurahan(self, kelurahan_df: pd.DataFrame, mode: str = "auto", strict: bool = True) -> pd.DataFrame:
        """Prediksi pada unit prediksi (kecamatan) dari fitur tingkat kelurahan."""
        return self.predict(self.to_units(kelurahan_df), mode=mode, strict=strict)

    def _risk(self, p: np.ndarray, th: dict) -> np.ndarray:
        return np.where(p >= th["high"], "high", np.where(p >= th["medium"], "medium", "low"))

    def predict(self, features_df: pd.DataFrame, mode: str = "auto", strict: bool = True) -> pd.DataFrame:
        if "cell_id" not in features_df.columns:
            raise ValueError("Kolom 'cell_id' wajib ada.")
        df = features_df.reset_index(drop=True)
        n = len(df)
        out = pd.DataFrame({"cell_id": df["cell_id"], "p_flood": np.nan, "risk_level": "unknown",
                            "mode": pd.Series([None] * n, dtype="object"),
                            "model_version": pd.Series([None] * n, dtype="object")})

        if mode == "auto":
            order = self.modes
        elif mode in self.models:
            order = [mode]
        else:
            raise ValueError(f"Model '{mode}' tidak tersedia. Yang ada: {self.modes}")

        remaining = np.ones(n, dtype=bool)
        for m in order:
            feats = self.required_features(m)
            absent = [f for f in feats if f not in df.columns]
            if absent:
                if mode == "auto":
                    continue
                raise ValueError(f"Kolom fitur untuk mode '{m}' tidak ada: {absent}")
            ok = remaining & df[feats].notna().all(axis=1).to_numpy()
            if not ok.any():
                continue
            info = self.models[m]
            if info["algo"] == "logistic":
                raw = info["linear"].predict_proba(df.loc[ok, feats])[:, 1]
            else:
                raw = info["booster"].predict(xgb.DMatrix(df.loc[ok, feats].astype("float32")))
            p = np.clip(info["calibrator"].transform(raw), 0.0, 1.0)
            out.loc[ok, "p_flood"] = p
            out.loc[ok, "risk_level"] = self._risk(p, info["meta"]["thresholds"])
            out.loc[ok, "mode"] = m
            out.loc[ok, "model_version"] = info["meta"]["model_version"]
            remaining &= ~ok

        if remaining.any() and strict:
            ids = df.loc[remaining, "cell_id"].head(5).tolist()
            raise ValueError(f"{int(remaining.sum())} dari {n} baris tidak punya fitur lengkap "
                             f"(contoh cell_id: {ids}). Gunakan strict=False untuk mengembalikan 'unknown'.")
        return out


def predict_flood_grid(features_df: pd.DataFrame, mode: str = "auto", strict: bool = True,
                       models_dir=None) -> pd.DataFrame:
    """Fungsi satu baris untuk dipanggil oleh tool agent (memuat model setiap panggilan)."""
    return FloodPredictor(models_dir).predict(features_df, mode=mode, strict=strict)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Prediksi dari CSV fitur.")
    ap.add_argument("--input", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--mode", default="auto", choices=["auto", "full", "rainfall_only"])
    ap.add_argument("--lenient", action="store_true", help="baris tidak lengkap -> unknown, bukan error")
    a = ap.parse_args()
    res = FloodPredictor().predict(pd.read_csv(a.input), mode=a.mode, strict=not a.lenient)
    res.to_csv(a.output, index=False)
    print(res["risk_level"].value_counts().to_string())
