"""Latih model (default regresi logistik, opsional XGBoost): `rainfall_only` (hujan + elevasi) dan `full` (+ tinggi muka air).

Alur per model:
  1. split berdasarkan WAKTU (bukan acak): train < val < test
  2. latih model (config.MODEL_ALGO: logistic atau XGBoost dengan early stopping pada set validasi)
  3. kalibrasi probabilitas pada set validasi (agar angka p_flood bermakna)
  4. pilih ambang risiko (medium/high) dari kurva precision-recall pada set validasi
  5. evaluasi pada set test + bandingkan dengan baseline
  6. simpan model (JSON), kalibrator + ambang + metadata (JSON)

    python -m src.train
    python -m src.train --modes rainfall_only
"""
from __future__ import annotations

import argparse
import json
import shutil
from datetime import datetime

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (average_precision_score, brier_score_loss, precision_recall_curve,
                             roc_auc_score)
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from . import config
from .calibration import Calibrator
from .features import feature_list
from .linear_model import LinearModel


# ------------------------------------------------------------------ split & ambang
def split_masks(d: pd.DataFrame):
    years = sorted(d["date"].dt.year.unique())
    if len(years) >= 3:
        test_y, val_y = years[-1], years[-2]
        yr = d["date"].dt.year
        tr, va, te = yr < val_y, yr == val_y, yr == test_y
        scheme = f"tahun: train<{val_y}, val={val_y}, test={test_y}"
    else:
        days = np.sort(d["date"].unique())
        t1, t2 = days[int(len(days) * 0.70)], days[int(len(days) * 0.85)]
        tr, va, te = d["date"] < t1, (d["date"] >= t1) & (d["date"] < t2), d["date"] >= t2
        scheme = "kuantil tanggal 70/15/15 (data < 3 tahun)"
    for name, m in (("train", tr), ("val", va), ("test", te)):
        npos = int(d.loc[m, "flood"].sum())
        if npos < config.MIN_POSITIVES_PER_SPLIT:
            raise ValueError(f"Split '{name}' hanya punya {npos} kejadian banjir "
                             f"(minimal {config.MIN_POSITIVES_PER_SPLIT}). Skema: {scheme}. "
                             "Tambah tahun data banjir.")
    return tr, va, te, scheme


def choose_thresholds(p, y, recall_target):
    prec, rec, thr = precision_recall_curve(y, p)
    prec, rec = prec[:-1], rec[:-1]
    f1 = 2 * prec * rec / np.maximum(prec + rec, 1e-12)
    t_high = float(thr[np.argmax(f1)])
    ok = np.where(rec >= recall_target)[0]
    t_med = float(thr[ok[-1]]) if len(ok) else float(thr[0])
    if t_med >= t_high:
        t_med = t_high / 2
    return t_med, t_high


def at_threshold(y, p, t):
    pred = p >= t
    tp = int((pred & (y == 1)).sum()); fp = int((pred & (y == 0)).sum()); fn = int((~pred & (y == 1)).sum())
    prec = tp / max(tp + fp, 1); rec = tp / max(tp + fn, 1)
    return {"threshold": float(t), "tp": tp, "fp": fp, "fn": fn, "precision": prec, "recall": rec,
            "f1": 2 * prec * rec / max(prec + rec, 1e-12)}


def evaluate(y, p, t_med, t_high):
    y = np.asarray(y)
    return {
        "n": int(len(y)), "n_pos": int(y.sum()), "prevalence": float(y.mean()),
        "pr_auc": float(average_precision_score(y, p)),
        "roc_auc": float(roc_auc_score(y, p)) if 0 < y.sum() < len(y) else None,
        "brier": float(brier_score_loss(y, p)),
        "at_medium": at_threshold(y, p, t_med), "at_high": at_threshold(y, p, t_high),
    }


# ------------------------------------------------------------------ latih satu model
def train_one(d: pd.DataFrame, mode: str, masks=None):
    """masks: (tr, va, te, scheme) kustom (dipakai cross-validation); None -> split_masks(d)."""
    feats = feature_list(mode)
    tr, va, te, scheme = masks if masks is not None else split_masks(d)
    Xtr, ytr = d.loc[tr, feats], d.loc[tr, "flood"].to_numpy()
    Xva, yva = d.loc[va, feats], d.loc[va, "flood"].to_numpy()
    Xte, yte = d.loc[te, feats], d.loc[te, "flood"].to_numpy()

    algo = config.MODEL_ALGO
    if algo == "logistic":
        spw = None
        model = LinearModel.fit(Xtr, ytr, C=config.LOGISTIC_C)
    elif algo == "xgboost":
        spw = float(np.clip(np.sqrt((ytr == 0).sum() / max(ytr.sum(), 1)), 1, 30))
        model = xgb.XGBClassifier(scale_pos_weight=spw, random_state=config.SEED, **config.XGB_PARAMS)
        model.fit(Xtr, ytr, eval_set=[(Xva, yva)], verbose=False)
    else:
        raise ValueError(f"MODEL_ALGO tidak dikenal: {algo}")

    min_iso = config.MIN_POS_FOR_ISOTONIC if config.CALIBRATION == "auto" else float("inf")
    cal = Calibrator.fit(model.predict_proba(Xva)[:, 1], yva, min_iso)
    p_va = cal.transform(model.predict_proba(Xva)[:, 1])
    p_te = cal.transform(model.predict_proba(Xte)[:, 1])
    t_med, t_high = choose_thresholds(p_va, yva, config.RECALL_TARGET_MEDIUM)

    # baseline: (a) ranking hujan 3 hari saja, (b) regresi logistik pada fitur yang sama
    base_rain = float(average_precision_score(yte, d.loc[te, "rain_3d"].fillna(0)))
    lr = make_pipeline(SimpleImputer(strategy="median"), StandardScaler(),
                       LogisticRegression(class_weight="balanced", max_iter=500))
    lr.fit(Xtr, ytr)
    base_lr = float(average_precision_score(yte, lr.predict_proba(Xte)[:, 1]))

    if algo == "logistic":
        importance = model.importance()
    else:
        gain = model.get_booster().get_score(importance_type="gain")
        importance = dict(sorted(((k, float(v)) for k, v in gain.items()), key=lambda kv: -kv[1]))

    meta = {
        "mode": mode,
        "algo": algo,
        "unit": config.UNIT,
        "rain_source": config.RAIN_SOURCE,
        "model_version": f"{mode}-{algo}-{datetime.now():%Y%m%d%H%M}",
        "trained_at": datetime.now().isoformat(timespec="seconds"),
        "features": feats,
        "split_scheme": scheme,
        "n_train": int(tr.sum()), "n_val": int(va.sum()), "n_test": int(te.sum()),
        "best_iteration": int(model.best_iteration) if algo == "xgboost" else 0,
        "scale_pos_weight": spw,
        "calibration": cal.to_dict(),
        "thresholds": {"medium": t_med, "high": t_high},
        "metrics_val": evaluate(yva, p_va, t_med, t_high),
        "metrics_test": evaluate(yte, p_te, t_med, t_high),
        "baseline_test_pr_auc": {"rain_3d_ranking": base_rain, "logistic_regression": base_lr},
        "feature_importance_gain": importance,
        "params": ({"C": config.LOGISTIC_C} if algo == "logistic" else dict(config.XGB_PARAMS)),
    }
    return model, cal, meta, (te, yte)


def _print_summary(meta):
    m = meta["metrics_test"]
    print(f"\n--- {meta['mode']} | {meta['split_scheme']}")
    print(f"    train/val/test = {meta['n_train']}/{meta['n_val']}/{meta['n_test']} | "
          f"kejadian di test = {m['n_pos']} (prevalensi {m['prevalence']:.3%}) | iterasi terbaik = {meta['best_iteration']}")
    b = meta["baseline_test_pr_auc"]
    print(f"    PR-AUC test: model ({meta['algo']}) {m['pr_auc']:.3f} | baseline logistic C=1 {b['logistic_regression']:.3f} | "
          f"hujan 3 hari {b['rain_3d_ranking']:.3f} | acak ~{m['prevalence']:.3f}")
    print(f"    ROC-AUC {m['roc_auc']:.3f} | Brier {m['brier']:.5f}")
    for lvl in ("medium", "high"):
        a = m[f"at_{lvl}"]
        print(f"    ambang {lvl:<6} {a['threshold']:.4f}: recall {a['recall']:.2f} | "
              f"precision {a['precision']:.2f} | tp/fp/fn = {a['tp']}/{a['fp']}/{a['fn']}")
    top = list(meta["feature_importance_gain"].items())[:5]
    print("    fitur teratas:", ", ".join(f"{k}" for k, _ in top))


def run(paths=None, modes=("rainfall_only", "full"), verbose=True, table=None):
    from .config import get_paths
    paths = (paths or get_paths()).ensure()
    df = pd.read_parquet(table or paths.unit_table())
    paths.models_dir.mkdir(parents=True, exist_ok=True)

    results, rain_pred = {}, None
    for mode in modes:
        d = df
        if mode == "full":
            d = df[df["tma_max"].notna()].reset_index(drop=True)
            if len(d) < 1000 or d["flood"].sum() < 3 * config.MIN_POSITIVES_PER_SPLIT:
                print("\n[full] dilewati: data TMA terlalu sedikit/tidak ada. Pastikan tma_stations.csv ada.")
                continue
        try:
            model, cal, meta, (te, yte) = train_one(d, mode)
        except ValueError as e:
            print(f"\n[{mode}] dilewati: {e}")
            continue

        if mode == "full" and "rainfall_only" in results:
            # bandingkan adil: model hujan-saja pada baris test yang sama
            rmodel, rcal = results["rainfall_only"]
            feats_r = feature_list("rainfall_only")
            p_r = rcal.transform(rmodel.predict_proba(d.loc[te, feats_r])[:, 1])
            meta["rainfall_only_pr_auc_on_same_rows"] = float(average_precision_score(yte, p_r))

        fname, stale = ((f"{mode}.linear.json", f"{mode}.xgb.json") if meta["algo"] == "logistic"
                        else (f"{mode}.xgb.json", f"{mode}.linear.json"))
        model.save_model(paths.models_dir / fname)
        (paths.models_dir / stale).unlink(missing_ok=True)      # buang model algoritma lain yang usang
        (paths.models_dir / f"{mode}.meta.json").write_text(json.dumps(meta, indent=2))
        results[mode] = (model, cal)
        if verbose:
            _print_summary(meta)
            if "rainfall_only_pr_auc_on_same_rows" in meta:
                print(f"    model rainfall_only pada baris test yang sama: PR-AUC "
                      f"{meta['rainfall_only_pr_auc_on_same_rows']:.3f}")

    if not results:
        raise RuntimeError("Tidak ada model yang berhasil dilatih. Periksa pesan di atas.")
    for fname in ("tma_reference.csv", "cell_station_map.csv"):
        if (paths.interim / fname).exists():
            shutil.copy(paths.interim / fname, paths.models_dir / fname)
    # fitur statis: static_features.csv = pada unit prediksi (cell_id = unit); versi kelurahan disimpan terpisah
    if (paths.interim / "static_features.csv").exists():
        shutil.copy(paths.interim / "static_features.csv", paths.models_dir / "static_features_kelurahan.csv")
    if config.UNIT == "kelurahan":
        if (paths.interim / "static_features.csv").exists():
            shutil.copy(paths.interim / "static_features.csv", paths.models_dir / "static_features.csv")
    elif table is None:
        for src_name, dst in (("static_features_unit.csv", "static_features.csv"), ("cell_unit_map.csv", "cell_unit_map.csv")):
            if (paths.interim / src_name).exists():
                shutil.copy(paths.interim / src_name, paths.models_dir / dst)
    if verbose:
        print(f"\nModel tersimpan di {paths.models_dir}: {sorted(results)}")
    return results


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--modes", nargs="+", default=["rainfall_only", "full"], choices=["rainfall_only", "full"])
    run(modes=tuple(ap.parse_args().modes))
