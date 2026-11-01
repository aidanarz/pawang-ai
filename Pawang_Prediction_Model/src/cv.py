"""Cross-validation per tahun (leave-one-year-out) untuk menilai kestabilan model.

Tiap fold: satu tahun jadi TEST; satu tahun lain jadi VALIDASI (early stopping + kalibrasi + ambang),
sisanya TRAIN. Tahun validasi = tahun sebelum test bila ada, selain itu tahun sesudahnya.
Catatan: fold ini memakai data masa depan untuk melatih prediksi masa lalu, jadi hanya untuk
mengukur stabilitas antar tahun, bukan perkiraan performa produksi.

Algoritma mengikuti config.MODEL_ALGO ("logistic" / "xgboost"). Kolom pr_auc_logistic = baseline
logistic C=1 yang sama di semua fold.

    python -m src.cv
    python -m src.cv --modes rainfall_only
"""
from __future__ import annotations

import argparse

import numpy as np
import pandas as pd

from . import config
from .train import train_one


def fold_masks(d: pd.DataFrame, test_year: int):
    yr = d["date"].dt.year
    years = sorted(yr.unique())
    others = [y for y in years if y != test_year]
    val_year = max([y for y in others if y < test_year], default=others[0] if others else None)
    if val_year is None:
        raise ValueError("Butuh minimal 3 tahun data untuk cross-validation per tahun.")
    tr, va, te = ~yr.isin([test_year, val_year]), yr == val_year, yr == test_year
    return tr, va, te, f"CV: test={test_year}, val={val_year}"


def run(paths=None, modes=("rainfall_only", "full"), verbose=True, table=None, out_name="cv_by_year.csv") -> pd.DataFrame:
    from .config import get_paths
    paths = (paths or get_paths()).ensure()
    df = pd.read_parquet(table or paths.unit_table())
    rows = []
    for mode in modes:
        d = df if mode == "rainfall_only" else df[df["tma_max"].notna()].reset_index(drop=True)
        for y in sorted(d["date"].dt.year.unique()):
            try:
                tr, va, te, scheme = fold_masks(d, y)
                for name, m in (("train", tr), ("val", va), ("test", te)):
                    if d.loc[m, "flood"].sum() < config.MIN_POSITIVES_PER_SPLIT:
                        raise ValueError(f"split {name} kurang kejadian")
                _, _, meta, _ = train_one(d, mode, (tr, va, te, scheme))
            except ValueError as e:
                rows.append({"mode": mode, "test_year": y, "note": f"dilewati: {e}"})
                continue
            t, b = meta["metrics_test"], meta["baseline_test_pr_auc"]
            rows.append({"mode": mode, "test_year": y, "n_pos": t["n_pos"], "prevalence": t["prevalence"],
                         "pr_auc_model": t["pr_auc"], "pr_auc_logistic": b["logistic_regression"],
                         "pr_auc_rain3d": b["rain_3d_ranking"], "roc_auc": t["roc_auc"],
                         "recall_high": t["at_high"]["recall"], "precision_high": t["at_high"]["precision"],
                         "best_iter": meta["best_iteration"]})
    res = pd.DataFrame(rows)
    if verbose:
        pd.set_option("display.width", 200)
        print(res.round(3).to_string(index=False))
        ok = res.dropna(subset=["pr_auc_model"]) if "pr_auc_model" in res else res.iloc[0:0]
        for mode, g in ok.groupby("mode"):
            lift = g["pr_auc_model"] / g["prevalence"]
            print(f"\n[{mode}] rata-rata fold: PR-AUC model {g.pr_auc_model.mean():.3f} | logistic "
                  f"{g.pr_auc_logistic.mean():.3f} | hujan3d {g.pr_auc_rain3d.mean():.3f} | "
                  f"ROC-AUC {g.roc_auc.mean():.3f} | lift model vs acak {lift.mean():.1f}x | "
                  f"model menang {int((g.pr_auc_model > g.pr_auc_logistic).sum())}/{len(g)} fold vs logistic")
    out = paths.processed / out_name
    res.to_csv(out, index=False)
    if verbose:
        print(f"\nTersimpan: {out}")
    return res


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--modes", nargs="+", default=["rainfall_only", "full"], choices=["rainfall_only", "full"])
    run(modes=tuple(ap.parse_args().modes))
