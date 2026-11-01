"""Tes end-to-end dengan data sintetis: membuktikan seluruh alur berjalan dan kontrak inference benar."""
import json

import numpy as np
import pandas as pd
import pytest

from src import audit_data, build_dataset, build_static, build_tma, synthetic, train
from src.config import get_paths
from src.features import feature_list, rain_features, tma_features
from src.predict import FloodPredictor
from src.utils import match_cells, norm_name, parse_dates


@pytest.fixture(scope="module")
def env(tmp_path_factory):
    """Pipeline pada unit KELURAHAN (kontrak inference per kelurahan). Unit kecamatan: fixture env_kec."""
    from src import config
    old = config.UNIT
    config.UNIT = "kelurahan"
    try:
        root = tmp_path_factory.mktemp("pawang")
        paths = get_paths(data_dir=root / "data", models_dir=root / "models")
        synthetic.generate(paths)
        build_static.run(paths, verbose=False)
        build_tma.run(paths, verbose=False)
        df = build_dataset.run(paths, verbose=False)
        train.run(paths, verbose=False)
        yield paths, df
    finally:
        config.UNIT = old


@pytest.fixture(scope="module")
def env_kec(env, tmp_path_factory):
    """Unit KECAMATAN (default produksi) dari data sintetis yang sama."""
    from src import config
    paths, kel = env
    old = config.UNIT
    config.UNIT = "kecamatan"
    try:
        p2 = get_paths(data_dir=paths.data_dir, models_dir=tmp_path_factory.mktemp("models_kec"))
        build_dataset.run(p2, verbose=False)
        train.run(p2, verbose=False)
        yield p2, kel
    finally:
        config.UNIT = old


# ------------------------------------------------------------------ unit
def test_parse_dates_mixed_formats():
    s = pd.Series(["2017-01-21", "21/01/2017", "21 Januari 2017", "2017-01-21 06:00:00", "bukan tanggal", None])
    d = parse_dates(s)
    assert (d.iloc[:4] == pd.Timestamp("2017-01-21")).all()
    assert d.iloc[4:].isna().all()


def test_norm_name_strips_prefixes():
    assert norm_name("KEL. Rawa  Baru") == "rawa baru"
    assert norm_name("Kecamatan Kelapa Gading") == "kelapa gading"


def test_rain_features_windows_are_correct():
    days = pd.date_range("2020-01-01", periods=40)
    daily = pd.DataFrame({"point_id": "p", "date": days, "precip_mm": np.arange(40, dtype=float)})
    f = rain_features(daily).set_index("date")
    row = f.loc["2020-02-05"]                  # hari ke-36 (nilai 35)
    assert row["rain_d0"] == 35 and row["rain_d1"] == 34
    assert row["rain_3d"] == 35 + 34 + 33
    assert row["rain_7d"] == sum(range(29, 36))
    assert row["rain_max_7d"] == 35
    assert np.isnan(f.loc["2020-01-10", "rain_30d"])    # jendela belum penuh


def test_tma_features_percentile_and_delta():
    days = pd.date_range("2020-01-01", periods=5)
    t = pd.DataFrame({"station_id": "s", "date": days, "tma_max": [10, 20, 30, 40, 50.0]})
    f = tma_features(t).set_index("date")
    assert f.loc["2020-01-05", "tma_pct"] == 1.0
    assert f.loc["2020-01-03", "tma_delta1"] == 10


# ------------------------------------------------------------------ pipeline
def test_name_matching_handles_messy_names(env):
    paths, _ = env
    from src.cells import load_centroids
    from src.flood import read_flood_raw
    cells = load_centroids(paths)
    raw = read_flood_raw(paths)
    _, rep = match_cells(raw["kecamatan"], raw["kelurahan"], cells)
    methods = set(rep["method"])
    assert "unmatched" not in methods
    assert "fuzzy" in methods            # salah ketik berhasil dipulihkan


def test_dataset_shape_and_labels(env):
    _, df = env
    assert df["flood"].isin([0, 1]).all()
    assert 0.003 < df["flood"].mean() < 0.05
    assert df["rain_30d"].notna().all()
    assert df["elev_mean"].notna().all()
    tma_cov = df.groupby("year")["tma_max"].apply(lambda s: s.notna().mean())
    assert tma_cov.loc[2017] == 0 and tma_cov.loc[2021] > 0.8       # TMA 2017 memang tidak ada


def test_models_learn_signal_beyond_chance(env):
    """Hanya memeriksa model lebih baik dari tebakan acak. Tidak membuktikan XGBoost mengalahkan
    baseline logistic (pada data sintetis label dibuat dari rumus logistik, jadi logistic bisa menang)."""
    paths, _ = env
    for mode in ("rainfall_only", "full"):
        meta = json.loads((paths.models_dir / f"{mode}.meta.json").read_text())
        m = meta["metrics_test"]
        assert m["pr_auc"] > 3 * m["prevalence"], f"{mode}: PR-AUC hampir sama dengan acak"
        assert meta["thresholds"]["medium"] < meta["thresholds"]["high"]
        assert meta["features"] == feature_list(mode)
    full = json.loads((paths.models_dir / "full.meta.json").read_text())
    assert "rainfall_only_pr_auc_on_same_rows" in full


def test_split_is_chronological(env):
    _, df = env
    tr, va, te, _ = train.split_masks(df)
    assert df.loc[tr, "date"].max() < df.loc[va, "date"].min() <= df.loc[va, "date"].max() < df.loc[te, "date"].min()


# ------------------------------------------------------------------ kontrak inference
def _day_features(paths, df, date, drop_tma_for=()):
    fp = FloodPredictor(paths.models_dir)
    day = df[df["date"] == pd.Timestamp(date)].copy()
    day.loc[day["cell_id"].isin(drop_tma_for), ["tma_max", "tma_pct", "tma_delta1", "tma_max_3d"]] = np.nan
    return fp, day


def test_predict_contract(env):
    paths, df = env
    fp, day = _day_features(paths, df, "2021-01-15")
    out = fp.predict(day)
    assert len(out) == len(day) and (out["cell_id"].to_numpy() == day["cell_id"].to_numpy()).all()
    assert out["p_flood"].between(0, 1).all()
    assert set(out["risk_level"]) <= {"low", "medium", "high"}
    assert set(out["mode"]) == {"full"}
    again = fp.predict(day)
    assert np.allclose(out["p_flood"], again["p_flood"])                # deterministik


def test_predict_falls_back_per_row_when_tma_missing(env):
    paths, df = env
    first = df["cell_id"].iloc[0]
    fp, day = _day_features(paths, df, "2021-01-15", drop_tma_for=[first])
    out = fp.predict(day).set_index("cell_id")
    assert out.loc[first, "mode"] == "rainfall_only"
    assert (out.drop(index=first)["mode"] == "full").all()


def test_predict_rejects_incomplete_input(env):
    paths, df = env
    fp, day = _day_features(paths, df, "2021-01-15")
    with pytest.raises(ValueError, match="Kolom fitur"):
        fp.predict(day.drop(columns=["rain_3d"]), mode="rainfall_only")
    bad = day.copy()
    bad.iloc[0, bad.columns.get_loc("rain_7d")] = np.nan
    with pytest.raises(ValueError, match="tidak punya fitur lengkap"):
        fp.predict(bad)
    lenient = fp.predict(bad, strict=False)
    assert lenient.loc[0, "risk_level"] == "unknown" and np.isnan(lenient.loc[0, "p_flood"])
    assert len(lenient) == len(bad)


def _raw_scores(info, X):
    if info["algo"] == "logistic":
        return info["linear"].predict_proba(X)[:, 1]
    import xgboost as xgb
    return info["booster"].predict(xgb.DMatrix(X.astype("float32")))


def test_predict_matches_training_pipeline(env):
    paths, df = env
    fp, day = _day_features(paths, df, "2021-01-15")
    info = fp.models["rainfall_only"]
    out = fp.predict(day, mode="rainfall_only")
    p_cal = info["calibrator"].transform(_raw_scores(info, day[info["meta"]["features"]]))
    assert np.allclose(out["p_flood"], p_cal)


@pytest.mark.parametrize("algo", ["logistic", "xgboost"])
def test_both_algos_train_save_and_predict(env, tmp_path, monkeypatch, algo):
    from src import config
    paths, df = env
    monkeypatch.setattr(config, "MODEL_ALGO", algo)
    p2 = get_paths(data_dir=paths.data_dir, models_dir=tmp_path / "m")
    train.run(p2, verbose=False)
    files = {f.name for f in p2.models_dir.iterdir()}
    assert (f"full.linear.json" in files) == (algo == "logistic")
    assert (f"full.xgb.json" in files) == (algo == "xgboost")
    fp, day = _day_features(p2, df, "2021-01-15")
    out = fp.predict(day)
    assert out["p_flood"].between(0, 1).all() and fp.models["full"]["algo"] == algo
    assert algo in out["model_version"].iloc[0]


def test_linear_model_json_roundtrip(tmp_path):
    from src.linear_model import LinearModel
    rng = np.random.default_rng(1)
    X = pd.DataFrame(rng.normal(size=(500, 3)), columns=["a", "b", "c"])
    y = (X["a"] + 0.5 * rng.normal(size=500) > 1).astype(int)
    X.iloc[0, 0] = np.nan
    m = LinearModel.fit(X, y, C=1.0)
    m.save_model(tmp_path / "m.json")
    m2 = LinearModel.load(tmp_path / "m.json")
    assert np.allclose(m.predict_proba(X), m2.predict_proba(X))
    assert list(m.importance())[0] == "a"


def test_sigmoid_calibration_keeps_ranking():
    from src.calibration import Calibrator
    rng = np.random.default_rng(2)
    p = rng.uniform(0.001, 0.2, 5000)
    y = (rng.uniform(size=5000) < p).astype(int)
    cal = Calibrator.fit(p, y, float("inf"))
    q = cal.transform(p)
    assert cal.kind == "sigmoid" and len(np.unique(q)) == len(np.unique(p))
    assert np.array_equal(np.argsort(p, kind="stable"), np.argsort(q, kind="stable"))


def test_heavy_rain_raises_risk_in_lowland(env):
    paths, df = env
    fp = FloodPredictor(paths.models_dir)
    cell = df.loc[df["elev_mean"].idxmin(), "cell_id"]
    row = df[df["cell_id"] == cell].iloc[[0]].copy()
    dry, wet = row.copy(), row.copy()
    for c, v in (("rain_d0", 0), ("rain_d1", 0), ("rain_3d", 0), ("rain_7d", 5), ("rain_14d", 20)):
        dry[c] = v
    for c, v in (("rain_d0", 120), ("rain_d1", 60), ("rain_3d", 220), ("rain_7d", 260), ("rain_14d", 300)):
        wet[c] = v
    p_dry = fp.predict(dry, mode="rainfall_only")["p_flood"].iloc[0]
    p_wet = fp.predict(wet, mode="rainfall_only")["p_flood"].iloc[0]
    assert p_wet > p_dry


def test_training_inference_feature_parity(env):
    """Fitur hujan yang dibangun ulang dari deret harian mentah (jalur inference) harus sama
    dengan fitur di tabel training. Ini risiko integrasi terbesar."""
    paths, df = env
    from src.cells import load_centroids
    from src.fetch_rainfall import load_rain
    cell = df["cell_id"].iloc[5]
    target = pd.Timestamp("2021-01-15")
    point = load_centroids(paths).set_index("cell_id").loc[cell, "point_id"]
    rain = load_rain(paths)
    window = rain[(rain["point_id"] == point) & (rain["date"] <= target)]    # hari target = hari terakhir
    rebuilt = rain_features(window).set_index("date").loc[target]
    stored = df[(df["cell_id"] == cell) & (df["date"] == target)].iloc[0]
    from src.features import RAIN_FEATURES
    assert np.allclose(rebuilt[RAIN_FEATURES].astype(float).to_numpy(),
                       stored[RAIN_FEATURES].astype(float).to_numpy())


def test_tma_percentile_helper_matches_training_table(env):
    paths, df = env
    fp = FloodPredictor(paths.models_dir)
    sub = df[df["tma_max"].notna()].sample(200, random_state=1)
    pct = fp.tma_percentile(sub["station_id"], sub["tma_max"])
    assert np.allclose(pct, sub["tma_pct"].to_numpy(), atol=1e-9)
    assert fp.cell_station is not None and set(fp.cell_station["cell_id"]) >= set(df["cell_id"])


def test_open_meteo_response_parsing(monkeypatch):
    """Respons Open-Meteo ditiru dari format dokumentasi; ini menguji parsing dan retry, bukan jaringan."""
    from src import fetch_rainfall as fr

    class R:
        def __init__(self, code, payload=None):
            self.status_code, self._p, self.text = code, payload, "x"
        def json(self):
            return self._p

    calls = []
    def fake_get(url, params=None, timeout=None):
        calls.append(params)
        if len(calls) == 1:
            return R(503)
        return R(200, {"daily": {"time": ["2020-01-01", "2020-01-02"], "precipitation_sum": [1.5, None]}})
    monkeypatch.setattr(fr.requests, "get", fake_get)
    monkeypatch.setattr(fr.time, "sleep", lambda s: None)
    df = fr.fetch_point(-6.2, 106.8, "2020-01-01", "2020-01-02")
    assert len(calls) == 2 and calls[0]["timezone"] == "Asia/Jakarta"
    assert list(df["precip_mm"].fillna(-1)) == [1.5, -1] and df["date"].dtype.kind == "M"


def test_audit_runs_without_error(env, capsys):
    paths, _ = env
    audit_data.run(paths)
    out = capsys.readouterr().out
    assert "cocok ke centroid" in out
    assert "BELUM SIAP" not in out


# ------------------------------------------------------------------ unit kecamatan (tampilan utama)
def test_default_unit_is_kecamatan(monkeypatch):
    import importlib
    from src import config
    monkeypatch.delenv("PAWANG_UNIT", raising=False)
    try:
        assert importlib.reload(config).UNIT == "kecamatan"
    finally:
        importlib.reload(config)


def test_kecamatan_models_and_files(env_kec):
    paths, kel = env_kec
    meta = json.loads((paths.models_dir / "full.meta.json").read_text())
    assert meta["unit"] == "kecamatan" and "kecamatan" not in meta["features"]
    units = kel["cell_id"].str.split("|").str[0].nunique()
    static = pd.read_csv(paths.models_dir / "static_features.csv")
    assert len(static) == units and not static["cell_id"].str.contains("|", regex=False).any()
    assert (paths.models_dir / "cell_unit_map.csv").exists()
    tab = pd.read_parquet(paths.unit_table("kecamatan"))
    assert tab["cell_id"].nunique() == units and tab["flood"].mean() > kel["flood"].mean()   # label lebih rapat


def test_aggregate_rules():
    from src.aggregate import aggregate_features
    d = pd.DataFrame({"cell_id": ["a|x", "a|y", "b|z"], "date": pd.Timestamp("2021-01-01"),
                      "rain_3d": [10.0, 20.0, 5.0], "elev_min": [3.0, -1.0, 8.0], "elev_mean": [5.0, 1.0, 9.0],
                      "tma_pct": [0.5, np.nan, np.nan], "flood": [0, 1, 0]})
    out = aggregate_features(d, d["cell_id"].str.split("|").str[0]).set_index("cell_id")
    assert out.loc["a", "rain_3d"] == 15 and out.loc["a", "elev_min"] == -1 and out.loc["a", "elev_mean"] == 3
    assert out.loc["a", "flood"] == 1 and out.loc["b", "flood"] == 0
    assert out.loc["a", "tma_pct"] == 0.5 and np.isnan(out.loc["b", "tma_pct"])      # rata-rata nilai tersedia


def test_predict_from_kelurahan_matches_unit_table(env_kec):
    paths, kel = env_kec
    fp = FloodPredictor(paths.models_dir)
    assert fp.unit == "kecamatan"
    day = pd.Timestamp("2021-01-15")
    k = kel[kel["date"] == day].drop(columns=["flood"])
    a = fp.predict_from_kelurahan(k).set_index("cell_id").sort_index()
    uni = pd.read_parquet(paths.unit_table("kecamatan"))
    b = fp.predict(uni[uni["date"] == day]).set_index("cell_id").sort_index()
    assert len(a) == k["cell_id"].str.split("|").str[0].nunique()
    assert np.allclose(a["p_flood"], b["p_flood"]) and set(a["risk_level"]) <= {"low", "medium", "high"}


def test_to_units_rejects_unknown_cells(env_kec):
    paths, kel = env_kec
    fp = FloodPredictor(paths.models_dir)
    bad = kel[kel["date"] == pd.Timestamp("2021-01-15")].head(3).copy()
    bad.loc[bad.index[0], "cell_id"] = "tidak|dikenal"
    with pytest.raises(ValueError, match="tidak dikenal"):
        fp.to_units(bad)
