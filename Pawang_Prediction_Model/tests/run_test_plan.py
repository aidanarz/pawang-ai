"""Run TEST_PLAN.md (sections 4.1-4.3 and the section 5 release gate) on the REAL data and write TEST_RESULTS.md.

    cd Pawang_Prediction_Model
    python tests/run_test_plan.py            # about 5-10 minutes (rebuild + cross-validation, logistic and XGBoost)

Safe by design: every step that writes (rebuild, training, CV) works in a temporary copy of data/. The tracked
files in data/ and models/ are only read. Each test prints PASS / FAIL / INFO and the measured value; a test that
raises is reported as ERROR, never silently skipped.

Status meaning: PASS = criterion met, FAIL = criterion not met (a finding), INFO = measured and reported (the plan has
no numeric criterion), ERROR = the test itself could not run.
"""
from __future__ import annotations

import datetime as dt
import json
import platform
import shutil
import subprocess
import sys
import tempfile
import time
import traceback
from dataclasses import dataclass, field
from pathlib import Path
from unittest import mock

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src import config  # noqa: E402
from src.config import Paths  # noqa: E402

REPORT = ROOT / "TEST_RESULTS.md"
EXPECTED_POSITIVES = {2016: 410, 2017: 292, 2018: 170, 2019: 258, 2020: 472}


@dataclass
class Result:
    id: str
    title: str
    criterion: str
    status: str = "ERROR"
    measured: str = ""
    note: str = ""
    pri: str = ""
    seconds: float = 0.0
    detail: list = field(default_factory=list)      # extra table rows (list of dict) shown under the test


RESULTS: list[Result] = []


def run_test(id_, title, criterion, pri, fn):
    t0 = time.time()
    r = Result(id_, title, criterion, pri=pri)
    try:
        out = fn()
        r.status, r.measured = out[0], out[1]
        r.note = out[2] if len(out) > 2 else ""
        r.detail = out[3] if len(out) > 3 else []
    except Exception as exc:                                   # noqa: BLE001
        r.status, r.measured = "ERROR", f"{type(exc).__name__}: {exc}"
        r.note = traceback.format_exc(limit=3).strip().splitlines()[-1]
    r.seconds = time.time() - t0
    RESULTS.append(r)
    print(f"[{r.status:5s}] {id_:3s} {title}  ->  {r.measured}", flush=True)
    return r


def pf(ok: bool) -> str:
    return "PASS" if ok else "FAIL"


# ----------------------------------------------------------------------------------------------------- setup
def make_workdir() -> tuple[Path, Paths]:
    """Copy only the small inputs a rebuild needs (flood xls, centroids, interim caches). No DEM, no 600 MB TMA."""
    tmp = Path(tempfile.mkdtemp(prefix="pawang_plan_"))
    data, models = tmp / "data", tmp / "models"
    (data / "raw").mkdir(parents=True)
    shutil.copytree(ROOT / "data" / "raw" / "flood", data / "raw" / "flood")
    shutil.copy(ROOT / "data" / "raw" / "kelurahan_centroids.csv", data / "raw" / "kelurahan_centroids.csv")
    shutil.copytree(ROOT / "data" / "interim", data / "interim")
    return tmp, Paths(data_dir=data, models_dir=models).ensure()


def git_info() -> str:
    try:
        sha = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
        dirty = bool(subprocess.run(["git", "status", "--porcelain", "--", "."], cwd=ROOT, capture_output=True, text=True).stdout.strip())
        return f"{sha}{' (+uncommitted changes)' if dirty else ''}"
    except Exception:                                          # noqa: BLE001
        return "unknown"


# ----------------------------------------------------------------------------------------------------- 4.1 data
def d_tests(paths: Paths, rebuilt: pd.DataFrame, kel: pd.DataFrame):
    committed = pd.read_parquet(ROOT / "data" / "processed" / "train_table_kecamatan.parquet")

    def d1():
        got = rebuilt.groupby(rebuilt["date"].dt.year)["flood"].sum().astype(int).to_dict()
        ok = got == EXPECTED_POSITIVES
        kel_pos = int(kel["flood"].sum())
        return (pf(ok), " / ".join(str(got.get(y)) for y in EXPECTED_POSITIVES) + "  (2016-2020)",
                f"kecamatan-days with a flood after a full rebuild from raw files; kelurahan-level positives: {kel_pos}")
    run_test("D1", "Positives per year after rebuild", "410 / 292 / 170 / 258 / 472 (2016-2020)", "P1", d1)

    def d2():
        dups_k = int(rebuilt.duplicated(["cell_id", "date"]).sum())
        dups_l = int(kel.duplicated(["cell_id", "date"]).sum())
        n_days = rebuilt["date"].nunique()
        span = (rebuilt["date"].max() - rebuilt["date"].min()).days + 1
        per_cell = rebuilt.groupby("cell_id")["date"].nunique()
        gaps = int((span - per_cell).abs().sum())
        ok = dups_k == 0 and dups_l == 0 and n_days == 1827 and span == 1827 and gaps == 0
        return (pf(ok), f"duplicates {dups_k} (kecamatan) / {dups_l} (kelurahan); {n_days} days, span {span}; gaps {gaps}",
                f"{rebuilt['cell_id'].nunique()} kecamatan x {n_days} days = {len(rebuilt):,} rows")
    run_test("D2", "No duplicate (cell_id, date); 1,827 contiguous days", "0 duplicates, 0 gaps", "P1", d2)

    def d2b():
        a = rebuilt.sort_values(["cell_id", "date"]).reset_index(drop=True)
        b = committed.sort_values(["cell_id", "date"]).reset_index(drop=True)
        same_shape = a.shape == b.shape and list(a.columns) == list(b.columns)
        num = a.select_dtypes("number").columns
        diff = float(np.nanmax(np.abs(a[num].to_numpy(float) - b[num].to_numpy(float)))) if same_shape else float("nan")
        ok = same_shape and diff < 1e-9
        return (pf(ok), f"shape {a.shape} vs committed {b.shape}; max abs difference {diff:.2e}",
                "release gate step 2: the committed training table is exactly reproducible from the raw files")
    run_test("D2b", "Rebuild reproduces the committed training table", "identical (max diff < 1e-9)", "P1", d2b)

    def d3():
        """A rainfall cache with more than 2% of days missing must be rejected (re-downloaded), not trusted."""
        from src import fetch_rainfall as fr
        results = []
        for source in ("openmeteo", "chirps"):
            tmp = Path(tempfile.mkdtemp(prefix="gappy_"))
            try:
                p = Paths(data_dir=tmp / "data", models_dir=tmp / "m").ensure()
                cells = pd.read_csv(ROOT / "data" / "raw" / "kelurahan_centroids.csv").head(3)
                pid = "-6.2000_106.8000"
                days = pd.date_range("2015-11-01", "2020-12-31")      # covers the requested range (starts 30 days before the first flood)
                good = pd.DataFrame({"date": days, "precip_mm": 5.0})
                bad = good.copy()
                bad.loc[bad.sample(frac=0.05, random_state=0).index, "precip_mm"] = np.nan     # 5% missing
                called = {"n": 0}

                def fake_point(*a, **k):
                    called["n"] += 1
                    return good

                def fake_points(points, start, end, **k):
                    called["n"] += 1
                    return {r.point_id: good for r in points.itertuples()}

                centroids = pd.DataFrame({"cell_id": ["a|b"], "point_id": [pid], "lat_snap": [-6.2], "lon_snap": [106.8]})
                for label, frame in (("gappy 5%", bad), ("complete", good)):
                    called["n"] = 0
                    (p.interim / "rain").mkdir(parents=True, exist_ok=True)
                    p.rain_dir.mkdir(parents=True, exist_ok=True)
                    frame.to_csv(p.rain_dir / f"{pid}.csv", index=False)
                    with mock.patch.object(config, "RAIN_SOURCE", source), \
                         mock.patch.object(fr, "load_centroids", lambda _p: centroids), \
                         mock.patch.object(fr, "fetch_point", fake_point), \
                         mock.patch.object(fr, "flood_date_range", lambda _p: (pd.Timestamp("2016-06-01"), pd.Timestamp("2020-06-01"))), \
                         mock.patch.dict(sys.modules, {"src.fetch_chirps": mock.MagicMock(fetch_points=fake_points),
                                                       "src.fetch_imerg": mock.MagicMock(fetch_points=fake_points)}):
                        try:
                            fr.run(paths=p, verbose=False)
                        except Exception:                      # noqa: BLE001
                            pass
                    results.append((source, label, called["n"] > 0))     # True = cache rejected (re-download attempted)
            finally:
                shutil.rmtree(tmp, ignore_errors=True)
        rows = [{"source": s, "cache": l, "re-download triggered": "yes" if r else "no"} for s, l, r in results]
        rejected = {s: r for s, l, r in results if l == "gappy 5%"}
        kept = {s: (not r) for s, l, r in results if l == "complete"}
        ok = all(rejected.values()) and all(kept.values())
        msg = ", ".join(f"{s}: gappy cache {'rejected' if rejected[s] else 'TRUSTED'}" for s in rejected)
        return (pf(ok), msg, "a complete cache must still be reused (no needless download)", rows)
    run_test("D3", "Gappy rainfall cache is rejected", "rejected when > 2% of days are missing", "P1", d3)

    def d4():
        from src.flood import read_flood_raw
        raw = read_flood_raw(paths)
        raw = raw.assign(file_year=raw["source_file"].str.extract(r"(20\d\d)")[0].astype(float))
        rows = []
        for y in range(2016, 2021):
            g = raw[raw["file_year"] == y]
            rows.append({"year": y, "rows": len(g), "parsed": int(g["date"].notna().sum()),
                         "rate": f"{g['date'].notna().mean():.1%}" if len(g) else "n/a"})
        rates = [r["parsed"] / r["rows"] for r in rows if r["rows"]]
        ok = len(rates) == 5 and min(rates) >= 0.95
        return (pf(ok), "min " + f"{min(rates):.1%}" + " / " + ", ".join(f"{r['year']}: {r['rate']}" for r in rows),
                "rate = rows with a valid day, counted after multi-day rows are expanded to one row per day. The 2017 gap is blank date cells in the source file itself (67 of its 264 original rows, 25%), so it cannot be repaired in code. 2023 and 2024 files have no daily dates and are skipped by design (outside 2016-2020)", rows)
    run_test("D4", "Flood date parse rate", ">= 95% per year, 2016-2020", "P2", d4)


# ----------------------------------------------------------------------------------------------------- 4.2 model
def m_tests(paths: Paths, rebuilt: pd.DataFrame):
    from sklearn.metrics import average_precision_score, brier_score_loss
    from src import cv, train
    from src.cv import fold_masks
    from src.train import split_masks, train_one

    cvres = cv.run(paths=paths, verbose=False)
    ok = cvres.dropna(subset=["pr_auc_model"]).copy()
    ok["lift"] = ok["pr_auc_model"] / ok["prevalence"]

    def fold_rows(g, cols):
        return [{c: (round(float(r[c]), 3) if isinstance(r[c], (float, np.floating)) else r[c]) for c in cols}
                for _, r in g.iterrows()]

    def m1():
        worst = ok.loc[ok["lift"].idxmin()]
        passed = bool((ok["lift"] >= 2).all())
        return (pf(passed), f"{len(ok)} folds; lift over random min {ok['lift'].min():.2f}x / mean {ok['lift'].mean():.2f}x",
                f"weakest fold: {worst['mode']} {int(worst['test_year'])} (PR-AUC {worst['pr_auc_model']:.3f} vs prevalence {worst['prevalence']:.3f})",
                fold_rows(ok, ["mode", "test_year", "n_pos", "prevalence", "pr_auc_model", "lift"]))
    run_test("M1", "Beats random", "PR-AUC >= 2x prevalence on every CV fold", "P1", m1)

    def m2():
        r20 = ok[(ok["mode"] == "rainfall_only") & (ok["test_year"] == 2020)].iloc[0]
        wins = ok.assign(win=ok["pr_auc_model"] > ok["pr_auc_rain3d"])
        passed = bool(r20["pr_auc_model"] > r20["pr_auc_rain3d"])
        n_win = int(wins["win"].sum())
        loses = wins[~wins["win"]]
        note = (f"beats the 3-day-rain ranking in {n_win}/{len(wins)} folds"
                + ("; loses in " + ", ".join(f"{r['mode']} {int(r['test_year'])}" for _, r in loses.iterrows()) if len(loses) else ""))
        return (pf(passed), f"2020 rainfall_only: model {r20['pr_auc_model']:.3f} vs rain-3d {r20['pr_auc_rain3d']:.3f}; {n_win}/{len(wins)} folds won",
                note, fold_rows(ok, ["mode", "test_year", "pr_auc_model", "pr_auc_rain3d", "pr_auc_logistic"]))
    run_test("M2", "Beats rainfall baseline", "PR-AUC above 3-day rainfall ranking (2020: 0.132 vs 0.108)", "P1", m2)

    def m3():
        out, passed = [], True
        for mode, g in ok.groupby("mode"):
            mean, lo = g["roc_auc"].mean(), g["roc_auc"].min()
            passed &= bool(mean >= 0.70 and lo >= 0.55)
            out.append(f"{mode}: mean {mean:.3f}, min {lo:.3f} (n={len(g)})")
        skipped = cvres[cvres["note"].notna()]
        note = "folds skipped for too few positives: " + ", ".join(f"{r['mode']} {int(r['test_year'])}" for _, r in skipped.iterrows()) if len(skipped) else ""
        return (pf(passed), "; ".join(out), note, fold_rows(ok, ["mode", "test_year", "roc_auc"]))
    run_test("M3", "Stable across years", "mean CV ROC-AUC >= 0.70, no fold below 0.55", "P1", m3)

    # ---- M4 leakage: shuffled labels must destroy the skill
    def m4():
        rng = np.random.default_rng(0)
        rows, lifts = [], []
        for seed in range(3):
            d2 = rebuilt.copy()
            d2["flood"] = d2.groupby(d2["date"].dt.year)["flood"].transform(lambda s: rng.permutation(s.to_numpy()))
            _, _, meta, _ = train_one(d2, "rainfall_only", split_masks(d2))
            t = meta["metrics_test"]
            lifts.append(t["pr_auc"] / t["prevalence"])
            rows.append({"seed": seed, "test_prevalence": round(t["prevalence"], 4), "PR-AUC (shuffled)": round(t["pr_auc"], 4),
                         "ratio to prevalence": round(t["pr_auc"] / t["prevalence"], 2)})
        _, _, real, _ = train_one(rebuilt, "rainfall_only", split_masks(rebuilt))
        real_lift = real["metrics_test"]["pr_auc"] / real["metrics_test"]["prevalence"]
        passed = max(lifts) <= 1.5 and real_lift > 2 * max(lifts)
        return (pf(passed), f"shuffled labels: PR-AUC = {np.mean(lifts):.2f}x prevalence (max {max(lifts):.2f}x); real labels: {real_lift:.2f}x",
                "proposed pass rule: shuffled <= 1.5x prevalence and the real model at least 2x better than that", rows)
    run_test("M4", "Leakage check", "shuffle labels per year -> PR-AUC falls to about prevalence", "P1", m4)

    # ---- M5 calibration
    def m5():
        rows, passed, msgs = [], True, []
        for mode in ("rainfall_only", "full"):
            d = rebuilt if mode == "rainfall_only" else rebuilt[rebuilt["tma_max"].notna()].reset_index(drop=True)
            tr, va, te, scheme = split_masks(d)
            model, cal, meta, (te_mask, yte) = train_one(d, mode, (tr, va, te, scheme))
            feats = meta["features"]
            p = np.clip(cal.transform(model.predict_proba(d.loc[te_mask, feats])[:, 1]), 0, 1)
            p0 = float(d.loc[tr, "flood"].mean())
            b_model, b_base = brier_score_loss(yte, p), float(np.mean((p0 - yte) ** 2))
            passed &= bool(b_model <= b_base)
            msgs.append(f"{mode}: Brier {b_model:.5f} vs prevalence-only {b_base:.5f}")
            q = pd.qcut(pd.Series(p), 10, duplicates="drop")
            tab = pd.DataFrame({"p": p, "y": yte}).groupby(q, observed=True).agg(n=("y", "size"), mean_pred=("p", "mean"), observed=("y", "mean"))
            for i, (_, r) in enumerate(tab.iterrows(), 1):
                rows.append({"mode": mode, "decile": i, "n": int(r["n"]), "mean predicted": f"{r['mean_pred']:.2%}", "observed rate": f"{r['observed']:.2%}"})
        return (pf(passed), "; ".join(msgs), "reliability table by decile of predicted probability (test year 2020) below", rows)
    run_test("M5", "Calibration", "Brier <= prevalence-only Brier; reliability table by decile", "P1", m5)

    # ---- M6 threshold stability
    def m6():
        rows = []
        for mode in ("rainfall_only", "full"):
            d = rebuilt if mode == "rainfall_only" else rebuilt[rebuilt["tma_max"].notna()].reset_index(drop=True)
            yr = d["date"].dt.year
            for val in sorted(set(yr.unique()) - {2020}):
                tr, va, te = ~yr.isin([2020, val]), yr == val, yr == 2020
                if any(d.loc[m, "flood"].sum() < config.MIN_POSITIVES_PER_SPLIT for m in (tr, va, te)):
                    continue
                _, _, meta, _ = train_one(d, mode, (tr, va, te, f"test=2020, val={val}"))
                th, hi = meta["thresholds"], meta["metrics_test"]["at_high"]
                rows.append({"mode": mode, "validation year": val, "medium": round(th["medium"], 4), "high": round(th["high"], 4),
                             "test recall@high": round(hi["recall"], 3), "test precision@high": round(hi["precision"], 3)})
        df = pd.DataFrame(rows)
        parts = []
        for mode, g in df.groupby("mode"):
            parts.append(f"{mode}: high {g['high'].min():.3f}-{g['high'].max():.3f}, medium {g['medium'].min():.4f}-{g['medium'].max():.4f} over {len(g)} validation years")
        return ("INFO", "; ".join(parts), "no numeric criterion in the plan: the shift is reported (test year fixed at 2020)", rows)
    run_test("M6", "Threshold stability", "report shift when the validation year changes", "P2", m6)

    # ---- M7 algorithm comparison
    def m7():
        with mock.patch.object(config, "MODEL_ALGO", "xgboost"):
            xr = cv.run(paths=paths, verbose=False, out_name="cv_xgboost.csv")
        xr = xr.dropna(subset=["pr_auc_model"])
        rows, passed = [], True
        for mode in ("rainfall_only", "full"):
            lo, xg = ok[ok["mode"] == mode], xr[xr["mode"] == mode]
            diff = float(xg["pr_auc_model"].mean() - lo["pr_auc_model"].mean())
            passed &= bool(diff <= 0.03)
            rows.append({"mode": mode, "logistic mean PR-AUC": round(float(lo["pr_auc_model"].mean()), 4),
                         "XGBoost mean PR-AUC": round(float(xg["pr_auc_model"].mean()), 4), "XGBoost minus logistic": round(diff, 4)})
        return (pf(passed), "; ".join(f"{r['mode']}: logistic {r['logistic mean PR-AUC']:.3f} vs XGBoost {r['XGBoost mean PR-AUC']:.3f} ({r['XGBoost minus logistic']:+.3f})" for r in rows),
                "pass = logistic is not worse than XGBoost by more than 0.03 mean CV PR-AUC", rows)
    run_test("M7", "Algorithm comparison", "logistic not worse than XGBoost by more than 0.03 mean CV PR-AUC", "P2", m7)

    return cvres


# ----------------------------------------------------------------------------------------------------- 4.3 inference
def i_tests(rebuilt: pd.DataFrame):
    from src.predict import FloodPredictor
    fp = FloodPredictor(ROOT / "models")
    day = rebuilt[rebuilt["date"] == pd.Timestamp("2020-02-25")].reset_index(drop=True)
    test_year = rebuilt[rebuilt["date"].dt.year == 2020].reset_index(drop=True)

    def i1():
        out = fp.predict(test_year, mode="auto", strict=False)
        p = out["p_flood"]
        in_bounds = bool(((p >= 0) & (p <= 1)).where(p.notna(), True).all())
        levels = set(out["risk_level"].unique())
        ok = in_bounds and levels <= {"low", "medium", "high", "unknown"}
        return (pf(ok), f"{len(out):,} rows; p in [{p.min():.4f}, {p.max():.4f}]; NaN {int(p.isna().sum())}; levels {sorted(levels)}",
                f"modes used: {out['mode'].value_counts().to_dict()}")
    run_test("I1", "Output bounds", "p_flood in [0,1] or NaN; risk_level in low/medium/high/unknown", "P1", i1)

    def i2():
        rows, ok = [], True
        for mode in fp.modes:
            th = fp.models[mode]["meta"]["thresholds"]
            eps = 1e-9
            got = fp._risk(np.array([th["medium"] - eps, th["medium"], th["high"] - eps, th["high"]]), th)
            want = ["low", "medium", "medium", "high"]
            ok &= list(got) == want
            rows.append({"mode": mode, "p = medium - eps": got[0], "p = medium": got[1], "p = high - eps": got[2], "p = high": got[3]})
        return (pf(ok), "p equal to a threshold maps to the higher class in both models", "", rows)
    run_test("I2", "Threshold boundary", "p equal to a threshold maps to the higher class", "P1", i2)

    def i3():
        a = fp.predict(day, mode="auto", strict=False)
        b = fp.predict(day, mode="auto", strict=False)
        shuffled = day.sample(frac=1.0, random_state=1).reset_index(drop=True)
        c = fp.predict(shuffled, mode="auto", strict=False)
        same_repeat = a.equals(b)
        m = a.merge(c, on="cell_id", suffixes=("_a", "_c"))
        same_order = bool(np.allclose(m["p_flood_a"], m["p_flood_c"], equal_nan=True)) and (m["risk_level_a"] == m["risk_level_c"]).all()
        return (pf(same_repeat and same_order), f"repeat identical: {same_repeat}; row order irrelevant: {same_order} ({len(a)} kecamatan, 2020-02-25)")
    run_test("I3", "Determinism", "same input -> same output; row order does not matter", "P1", i3)

    def i4():
        feats = fp.required_features("rainfall_only")
        df = day.copy()
        bad = df.index[:3]
        df.loc[bad, feats[0]] = np.nan                         # break the first rainfall feature of 3 rows
        lenient = fp.predict(df, mode="rainfall_only", strict=False)
        ref = fp.predict(day, mode="rainfall_only", strict=False)
        unknown_ok = bool((lenient.loc[bad, "risk_level"] == "unknown").all() and lenient.loc[bad, "p_flood"].isna().all())
        others = df.index.difference(bad)
        others_ok = bool(np.allclose(lenient.loc[others, "p_flood"], ref.loc[others, "p_flood"]))
        try:
            fp.predict(df, mode="rainfall_only", strict=True)
            strict_raises = False
        except ValueError:
            strict_raises = True
        return (pf(unknown_ok and others_ok and strict_raises),
                f"broken rows -> NaN/unknown: {unknown_ok}; other rows unchanged: {others_ok}; strict=True raises ValueError: {strict_raises}")
    run_test("I4", "strict=False behaviour", "incomplete rows -> NaN and unknown; other rows unaffected", "P1", i4)

    def i5():
        follows = all(fp.models[m]["algo"] == fp.models[m]["meta"]["algo"] and (("linear" in fp.models[m]) == (fp.models[m]["algo"] == "logistic"))
                      for m in fp.modes)
        tmp = Path(tempfile.mkdtemp(prefix="models_"))
        try:
            empty = tmp / "empty"
            empty.mkdir()
            try:
                FloodPredictor(empty)
                empty_err = False
            except FileNotFoundError:
                empty_err = True
            # meta says xgboost but only the logistic JSON exists -> the loader must not silently load the wrong file
            wrong = tmp / "wrong"
            shutil.copytree(ROOT / "models", wrong)
            for m in ("full", "rainfall_only"):
                meta = json.loads((wrong / f"{m}.meta.json").read_text())
                meta["algo"] = "xgboost"
                (wrong / f"{m}.meta.json").write_text(json.dumps(meta))
            try:
                FloodPredictor(wrong)
                mismatch_err = False
            except FileNotFoundError:
                mismatch_err = True
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
        return (pf(follows and empty_err and mismatch_err),
                f"loader follows algo: {follows}; empty folder -> FileNotFoundError: {empty_err}; algo/file mismatch -> FileNotFoundError: {mismatch_err}")
    run_test("I5", "Model files vs meta.json", "loader follows algo; no models -> FileNotFoundError", "P1", i5)

    def f1():
        feats = fp.required_features("rainfall_only")
        scalable = [f for f in feats if f.startswith("rain_") and not f.startswith("rain_wet")]
        train_max = float(rebuilt[scalable].max().max())
        base = day.sort_values("rain_d0").iloc[[len(day) // 2]].reset_index(drop=True)
        rows, ps = [], []
        for k in (1, 2, 5, 10, 50, 200):
            row = base.copy()
            row[scalable] = row[scalable] * k
            p = float(fp.predict(row, mode="rainfall_only")["p_flood"].iloc[0])
            ps.append(p)
            rows.append({"rain x": k, "rain_d0 (mm)": round(float(row["rain_d0"].iloc[0]), 1), "rain_30d (mm)": round(float(row["rain_30d"].iloc[0]), 1), "p_flood": f"{p:.4%}"})
        bounded = all(0 <= p <= 1 for p in ps)
        monotone = all(b >= a - 1e-12 for a, b in zip(ps, ps[1:]))
        exceeds = max(r["rain_30d (mm)"] for r in rows) > train_max
        return (pf(bounded and monotone and exceeds),
                f"bounded {bounded}; non-decreasing {monotone}; reached {rows[-1]['rain_30d (mm)']:.0f} mm in 30 days (training max {train_max:.0f} mm)", "", rows)
    run_test("F1", "Rainfall above training maximum", "probability stays in [0,1], non-decreasing", "P2", f1)

    def f2():
        from src.features import tma_to_pct
        ref = fp.tma_reference
        st = ref["station_id"].unique()[:6]
        rows, ok = [], True
        for shift in (-300, 0, +300, +1000):
            vals = np.array([ref[ref["station_id"] == s]["value"].median() + shift for s in st])
            pct = tma_to_pct(vals, st, ref)
            ok &= bool(np.all((pct >= 0) & (pct <= 1)))
            rows.append({"datum shift (cm)": shift, "tma_pct min": round(float(np.min(pct)), 3), "tma_pct max": round(float(np.max(pct)), 3)})
        # behavioural check: rename a station at the same coordinates AND shift its datum by +500 cm, then build
        import contextlib
        import io
        import warnings
        from src import build_tma
        tmp = Path(tempfile.mkdtemp(prefix="tma_"))
        try:
            def build(shift_cm: float) -> str:
                pp = Paths(data_dir=tmp / f"d{int(shift_cm)}", models_dir=tmp / "m").ensure()
                rng = np.random.default_rng(0)
                recs = []
                for name, month, base in (("PS. Manggarai", "202001", 650), ("PA. Manggarai", "202002", 650 + shift_cm)):
                    for day in range(1, 21):
                        recs.append((name, f"{day:02d}/{month[4:]}/2020 06:00", (base + float(rng.integers(-20, 20))) * 10,
                                     -6.2078, 106.8485, int(month)))
                pd.DataFrame(recs, columns=["nama_pintu_air", "tanggal", "tinggi_air", "latitude", "longitude", "periode_data"]
                             ).to_csv(pp.raw_tma / "t.csv", index=False)
                buf = io.StringIO()
                with contextlib.redirect_stdout(buf), warnings.catch_warnings(record=True) as w:
                    warnings.simplefilter("always")
                    daily = build_tma.run(pp, verbose=True)
                build.daily = daily
                return buf.getvalue() + " ".join(str(x.message) for x in w)
            out_shift, out_plain = build(500), build(0)
            daily = build.daily
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
        words = ("datum", "geser", "loncat", "jump", "shift", "perubahan level", "berubah drastis")
        has_warning = any(w in out_shift.lower() for w in words) and out_shift != out_plain
        status = "PASS" if (ok and has_warning) else "FAIL"
        return (status, f"tma_pct bounded in [0,1] under datum shifts: {ok}; build_tma warns when a renamed station steps +500 cm: {has_warning}",
                "GAP: build_tma only DROPS single-reading spikes (SPIKE_FACTOR); a renamed station whose level steps by 500 cm is merged silently, with no warning in its output"
                if not has_warning else "", rows)
    run_test("F2", "TMA station rename (datum shift)", "tma_pct stays in [0,1], warning on large jump", "P2", f2)

    def f3():
        from src import fetch_imerg
        sys_mod = {}
        try:
            import netCDF4  # noqa: F401
        except Exception:                                      # noqa: BLE001
            sys_mod["netCDF4"] = mock.MagicMock()
        tmp = Path(tempfile.mkdtemp(prefix="imerg_"))
        rows, ok = [], True
        try:
            cache = tmp / "imerg_raw_days.csv"
            pts = pd.DataFrame({"point_id": ["-6.2000_106.8000"], "lat": [-6.2], "lon": [106.8]})
            for code in (401, 403, 429):
                cache.write_text("date,-6.2000_106.8000\n2020-01-01,3.0\n")
                before = cache.read_text()
                resp = mock.MagicMock(status_code=code, content=b"")
                stopped = False
                with mock.patch.object(fetch_imerg.requests, "get", return_value=resp) as g, \
                     mock.patch.object(fetch_imerg, "get_token", lambda: "t", create=True), \
                     mock.patch.dict(sys.modules, sys_mod), mock.patch.object(fetch_imerg.time, "sleep", lambda *_: None):
                    try:
                        fetch_imerg.fetch_points(pts, "2020-01-01", "2020-01-04", workers=2, verbose=False, cache=cache)
                    except fetch_imerg.AccessDenied:
                        stopped = True
                    calls = g.call_count
                kept = cache.read_text() == before
                ok &= stopped and kept
                rows.append({"HTTP code": code, "stopped with AccessDenied": stopped, "requests made": calls, "cache untouched": kept})
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
        return (pf(ok), "IMERG stops at once on 401/403/429 and keeps its cache: " + str(ok),
                "CHIRPS has no per-code stop (GDAL hides the HTTP code); its failures become NaN days and fetch_rainfall refuses to save when > 2% fail (see D3)", rows)
    run_test("F3", "IMERG/CHIRPS HTTP 401/403/429", "download stops cleanly, cache kept", "P2", f3)


# ----------------------------------------------------------------------------------------------------- release gate
def gate_tests(paths: Paths, cvres: pd.DataFrame):
    def g1():
        p = subprocess.run([sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider"], cwd=ROOT, capture_output=True, text=True)
        tail = [l for l in p.stdout.strip().splitlines() if l.strip()][-1]
        return pf(p.returncode == 0), tail
    run_test("G1", "Release gate 1: python -m pytest", "all pass", "P1", g1)

    def g3():
        old = pd.read_csv(ROOT / "data" / "processed" / "cv_by_year.csv")
        new = cvres.copy()
        cols = ["pr_auc_model", "roc_auc"]
        mo = old.dropna(subset=["pr_auc_model"]).groupby("mode")[cols].mean()
        mn = new.dropna(subset=["pr_auc_model"]).groupby("mode")[cols].mean()
        rows, ok = [], True
        for mode in mo.index:
            dpr, dro = float(mn.loc[mode, "pr_auc_model"] - mo.loc[mode, "pr_auc_model"]), float(mn.loc[mode, "roc_auc"] - mo.loc[mode, "roc_auc"])
            ok &= bool(dpr >= -0.02 and dro >= -0.02)
            rows.append({"mode": mode, "mean PR-AUC committed": round(float(mo.loc[mode, "pr_auc_model"]), 4), "mean PR-AUC rebuilt": round(float(mn.loc[mode, "pr_auc_model"]), 4),
                         "delta PR-AUC": round(dpr, 4), "mean ROC-AUC committed": round(float(mo.loc[mode, "roc_auc"]), 4),
                         "mean ROC-AUC rebuilt": round(float(mn.loc[mode, "roc_auc"]), 4), "delta ROC-AUC": round(dro, 4)})
        return (pf(ok), "; ".join(f"{r['mode']}: dPR-AUC {r['delta PR-AUC']:+.4f}, dROC-AUC {r['delta ROC-AUC']:+.4f}" for r in rows),
                "a rebuild must not lower mean CV PR-AUC or ROC-AUC by more than 0.02", rows)
    run_test("G3", "Release gate 3: rebuild vs committed cv_by_year.csv", "mean CV PR-AUC and ROC-AUC drop <= 0.02", "P1", g3)

    def g3b():
        """Train fresh in the temp folder and compare with the committed models (same code + same data = same numbers)."""
        from src import train
        train.run(paths=paths, verbose=False)
        rows, ok = [], True
        for mode in ("rainfall_only", "full"):
            new = json.loads((paths.models_dir / f"{mode}.meta.json").read_text())
            old = json.loads((ROOT / "models" / f"{mode}.meta.json").read_text())
            d_pr = new["metrics_test"]["pr_auc"] - old["metrics_test"]["pr_auc"]
            d_th = abs(new["thresholds"]["high"] - old["thresholds"]["high"])
            ok &= abs(d_pr) < 1e-6 and d_th < 1e-6
            rows.append({"mode": mode, "test PR-AUC committed": round(old["metrics_test"]["pr_auc"], 5), "retrained": round(new["metrics_test"]["pr_auc"], 5),
                         "high threshold committed": round(old["thresholds"]["high"], 5), "retrained ": round(new["thresholds"]["high"], 5)})
        return (pf(ok), "retraining on the rebuilt table reproduces the committed metrics and thresholds: " + str(ok), "", rows)
    run_test("G3b", "Release gate: retrain reproduces committed models", "same test PR-AUC and thresholds", "P1", g3b)


# ----------------------------------------------------------------------------------------------------- report
STATUS_ICON = {"PASS": "PASS", "FAIL": "**FAIL**", "INFO": "INFO", "ERROR": "**ERROR**"}


def md_table(rows: list[dict]) -> str:
    if not rows:
        return ""
    cols = list(rows[0].keys())
    lines = ["| " + " | ".join(cols) + " |", "| " + " | ".join("---" for _ in cols) + " |"]
    for r in rows:
        lines.append("| " + " | ".join(str(r.get(c, "")) for c in cols) + " |")
    return "\n".join(lines)


def write_report(total_s: float):
    counts = pd.Series([r.status for r in RESULTS]).value_counts().to_dict()
    gen = dt.datetime.now().strftime("%Y-%m-%d %H:%M")
    lines = [
        "# Test Results: Pawang AI Flood Prediction Model", "",
        f"Run of [TEST_PLAN.md](TEST_PLAN.md) on the real data. Generated by `python tests/run_test_plan.py` on {gen} "
        f"(took {total_s / 60:.1f} min).", "",
        "| | |", "|---|---|",
        f"| Code version | `{git_info()}` |",
        f"| Python / OS | {platform.python_version()} / {platform.system()} {platform.release()} |",
        f"| Data | 5 years (2016-2020), 44 kecamatan, 1,827 days; models `rainfall_only` and `full` (logistic, C = {config.LOGISTIC_C}, sigmoid calibration) |",
        f"| Outcome | {counts.get('PASS', 0)} PASS, {counts.get('FAIL', 0)} FAIL, {counts.get('INFO', 0)} INFO, {counts.get('ERROR', 0)} ERROR |", "",
        "All writing happened in a temporary copy of `data/`; the tracked data and models were only read.", "",
        "## 1. Summary", "",
        "| ID | Test | Criterion | Measured | Result | Pri |", "|---|---|---|---|---|---|",
    ]
    for r in RESULTS:
        lines.append(f"| {r.id} | {r.title} | {r.criterion} | {r.measured.replace('|', '/')} | {STATUS_ICON[r.status]} | {r.pri} |")
    lines += ["", "## 2. Details", ""]
    for r in RESULTS:
        lines += [f"### {r.id} {r.title}: {STATUS_ICON[r.status]}", "", f"- Criterion: {r.criterion}", f"- Measured: {r.measured}"]
        if r.note:
            lines.append(f"- Note: {r.note}")
        if r.detail:
            lines += ["", md_table(r.detail)]
        lines.append("")
    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print(f"\n{counts}\nreport -> {REPORT}")


def main():
    t0 = time.time()
    tmp, paths = make_workdir()
    print(f"working copy: {tmp}\n")
    try:
        from src import build_dataset
        print("rebuilding the dataset from raw files (takes a minute) ...", flush=True)
        with mock.patch.object(sys, "stdout", sys.stdout):
            build_dataset.run(paths, verbose=False)
        rebuilt = pd.read_parquet(paths.unit_table("kecamatan"))
        kel = pd.read_parquet(paths.train_table, columns=["cell_id", "date", "flood"])
        d_tests(paths, rebuilt, kel)
        cvres = m_tests(paths, rebuilt)
        i_tests(rebuilt)
        gate_tests(paths, cvres)
    finally:
        write_report(time.time() - t0)
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
