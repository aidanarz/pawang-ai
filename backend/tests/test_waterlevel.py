"""Live water level (BPBD scraper), station mapping, history store, pipeline integration, and kecamatan boundaries.
No network: the BPBD page is a saved snapshot (tests/fixtures/bpbd_waterlevel.html) served by httpx.MockTransport.
"""
import dataclasses
import datetime as dt
from pathlib import Path

import httpx
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from shapely.geometry import shape

from app import heatmap as H
from app import waterlevel as W
from app.areas import get_catalog
from app.main import create_app
from test_backend import _open_meteo   # Open-Meteo mock (rain) shared with the other live tests

FIXTURE = Path(__file__).parent / "fixtures" / "bpbd_waterlevel.html"
SNAPSHOT_NOW = dt.datetime(2026, 11, 8, 21, 50, tzinfo=W.WIB)      # when the fixture was saved


@pytest.fixture(scope="module")
def page() -> str:
    return FIXTURE.read_text(encoding="utf-8")


# ---- parser --------------------------------------------------------------------------------------
def test_parse_real_snapshot(page):
    df = W.parse_waterlevel_html(page, SNAPSHOT_NOW)
    assert df["post"].nunique() == 12
    assert df["ts"].min().hour == 0 and df["ts"].max().hour == 21           # 22 hourly columns, 00:00-21:00
    assert set(df["ts"].dt.date) == {SNAPSHOT_NOW.date()}
    last = df.sort_values("ts").groupby("post").tail(1).set_index("post")
    assert last.loc["Manggarai BKB", "level_cm"] == 540
    assert last.loc["Waduk Pluit", "level_cm"] == -180                       # negative levels are real (below datum)
    assert df[(df["post"] == "Waduk Pluit") & (df["ts"].dt.hour == 0)]["level_cm"].iloc[0] == -185
    assert last.loc["Manggarai BKB", "weather"] == "T"


def test_parse_maps_ten_posts_to_model_stations(page):
    df = W.parse_waterlevel_html(page, SNAPSHOT_NOW)
    mapped = df.dropna(subset=["station_id"])["post"].unique()
    assert len(mapped) == 10
    unmapped = set(df["post"]) - set(mapped)
    assert unmapped == {"Pos Depok", "Pasar Ikan - Laut"}
    # every mapped id must be a station the model really knows (its training reference), or the features would be NaN
    from app.config import get_settings
    known = set(pd.read_csv(get_settings().models_dir / "tma_reference.csv")["station_id"])
    assert set(W.BPBD_TO_MODEL.values()) <= known
    assert df.loc[df["post"] == "Manggarai BKB", "station_id"].iloc[0] == "pa manggarai"


def test_parse_reads_siaga_class(page):
    df = W.parse_waterlevel_html(page, SNAPSHOT_NOW)
    sea = set(df.loc[df["post"] == "Pasar Ikan - Laut", "siaga"])
    assert {"Normal", "Siaga 3", "Siaga 2"} <= sea
    assert set(df.loc[df["post"] == "Manggarai BKB", "siaga"]) == {"Normal"}


def test_parse_drops_hours_later_than_now(page):
    """Around midnight the page may show yesterday's table: a column later than the current hour is never trusted."""
    df = W.parse_waterlevel_html(page, dt.datetime(2026, 11, 8, 5, 10, tzinfo=W.WIB))
    assert df["ts"].max().hour == 5


@pytest.mark.parametrize("bad", ["<html><body>maintenance</body></html>",
                                 "<table><tr><td>Pintu Air</td><td>00:00</td><td>01:00</td><td>02:00</td></tr></table>"])
def test_parse_raises_when_layout_changed(bad):
    with pytest.raises(W.WaterLevelError):
        W.parse_waterlevel_html(bad, SNAPSHOT_NOW)


# ---- store + fetcher ------------------------------------------------------------------------------
def _fetcher(tmp_path, page, status=200, min_interval_s=300.0):
    hits = {"n": 0}

    def handler(req: httpx.Request) -> httpx.Response:
        hits["n"] += 1
        assert "PawangAI" in req.headers["user-agent"]       # says who is asking
        return httpx.Response(status, text=page if status == 200 else "error")

    wl = W.BpbdWaterLevel("https://example.test/waterlevel", W.TmaStore(tmp_path / "tma.csv"),
                          http=httpx.Client(transport=httpx.MockTransport(handler)), min_interval_s=min_interval_s)
    return wl, hits


def test_store_deduplicates_and_persists(tmp_path, page):
    df = W.parse_waterlevel_html(page, dt.datetime.now(W.WIB).replace(hour=21))
    store = W.TmaStore(tmp_path / "tma.csv")
    first = store.append(df)
    assert first == len(df)
    assert store.append(df) == 0                                     # same readings again: no growth
    assert len(W.TmaStore(tmp_path / "tma.csv").load()) == len(df)   # survives a restart


def test_refresh_is_polite_and_respects_min_interval(tmp_path, page):
    wl, hits = _fetcher(tmp_path, page)
    assert wl.refresh(now=SNAPSHOT_NOW) is True
    assert wl.refresh(now=SNAPSHOT_NOW + dt.timedelta(seconds=60)) is False      # cached
    assert wl.refresh(now=SNAPSHOT_NOW + dt.timedelta(seconds=400)) is True      # interval passed
    assert wl.refresh(now=SNAPSHOT_NOW + dt.timedelta(seconds=401), force=True) is True
    assert hits["n"] == 3
    assert wl.status()["posts_parsed"] == 12 and wl.status()["last_error"] is None


def test_refresh_failure_keeps_stored_history(tmp_path, page):
    wl, _ = _fetcher(tmp_path, page)
    wl.refresh(now=dt.datetime.now(W.WIB).replace(hour=21))
    bad, _ = _fetcher(tmp_path, page, status=503)
    bad.store = wl.store
    with pytest.raises(W.WaterLevelError):
        bad.refresh(now=dt.datetime.now(W.WIB))
    assert "503" in bad.status()["last_error"]
    assert len(bad.store.load()) > 0                                  # earlier readings are still there


def test_daily_max_window_and_latest_siaga(tmp_path, page):
    today = dt.datetime.now(W.WIB).replace(hour=21, minute=50, second=0, microsecond=0)
    yesterday = today - dt.timedelta(days=1)
    store = W.TmaStore(tmp_path / "tma.csv")
    store.append(W.parse_waterlevel_html(page, yesterday))
    store.append(W.parse_waterlevel_html(page, today))
    wl = W.BpbdWaterLevel("x", store)
    d, as_of, extra = wl.daily(["pa manggarai", "p a karet", "not a station"], today.date())
    assert set(d["station_id"]) == {"pa manggarai", "p a karet"}
    assert sorted(d["date"].dt.date.unique()) == [yesterday.date(), today.date()]
    assert d.loc[(d["station_id"] == "pa manggarai") & (d["date"] == pd.Timestamp(today.date())), "tma_max"].iloc[0] == 540
    assert as_of.tzinfo is not None and extra["siaga"]["pa manggarai"] == "Normal"
    # a target day with no readings yields nothing (never invented)
    assert wl.daily(["pa manggarai"], today.date() + dt.timedelta(days=3))[0].empty


# ---- end to end through the API (live mode) --------------------------------------------------------
def _http(page, bpbd_status=200, **kw):
    rain, state = _open_meteo(**kw)
    bpbd = {"n": 0}

    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.host == "bpbd.jakarta.go.id":
            bpbd["n"] += 1
            return httpx.Response(bpbd_status, text=page if bpbd_status == 200 else "down")
        return rain._transport.handle_request(req)
    return httpx.Client(transport=httpx.MockTransport(handler)), state, bpbd


def _seed_yesterday(settings, page):
    """The page only shows today; the model also needs yesterday, which the collector would have stored."""
    yesterday = dt.datetime.now(W.WIB).replace(hour=21, minute=50) - dt.timedelta(days=1)
    W.TmaStore(settings.tma_store_path).append(W.parse_waterlevel_html(page, yesterday))


def test_live_full_model_runs_where_bpbd_station_exists(live_settings, page):
    _seed_yesterday(live_settings, page)
    http, _, bpbd = _http(page)
    today = dt.datetime.now(W.WIB).date().isoformat()
    r = TestClient(create_app(live_settings, http=http)).get("/api/v1/heatmap", params={"date": today})
    assert r.status_code == 200
    props = {f["properties"]["grid_id"]: f["properties"] for f in r.json()["features"]}
    modes = {p["model_mode"] for p in props.values()}
    assert "full" in modes and "rainfall_only" in modes                   # partial coverage: only mapped stations
    full = [p for p in props.values() if p["model_mode"] == "full"]
    assert all(p["confidence"] == "HIGH" and p["water_level_cm"] is not None for p in full)
    assert all(p["siaga_level"] == "Normal" for p in full)                # today's snapshot has no flood alert
    assert bpbd["n"] == 1                                                  # one request serves all areas


def test_live_without_history_falls_back_instead_of_guessing(live_settings, page):
    """Fresh install: only today is known, so tma_delta1 cannot be computed and no area may claim the full model."""
    http, _, _ = _http(page)
    today = dt.datetime.now(W.WIB).date().isoformat()
    r = TestClient(create_app(live_settings, http=http)).get("/api/v1/heatmap", params={"date": today})
    assert r.status_code == 200
    props = [f["properties"] for f in r.json()["features"]]
    assert {p["model_mode"] for p in props} == {"rainfall_only"}
    assert {p["confidence"] for p in props} == {"LOW"}


def test_live_bpbd_down_still_serves_rainfall_only(live_settings, page):
    http, _, bpbd = _http(page, bpbd_status=503)
    today = dt.datetime.now(W.WIB).date().isoformat()
    r = TestClient(create_app(live_settings, http=http)).get("/api/v1/heatmap", params={"date": today})
    assert r.status_code == 200
    assert {f["properties"]["model_mode"] for f in r.json()["features"]} == {"rainfall_only"}
    assert bpbd["n"] >= 1


def test_live_water_level_can_be_switched_off(live_settings, page):
    s = dataclasses.replace(live_settings, tma_live_enabled=False)
    http, _, bpbd = _http(page)
    c = TestClient(create_app(s, http=http))
    assert c.get("/api/v1/health").json()["tools"]["get_water_level"]["available"] is False
    c.get("/api/v1/heatmap", params={"time": "24h"})
    assert bpbd["n"] == 0


def test_health_reports_live_collector_state(live_settings, page):
    http, _, _ = _http(page)
    c = TestClient(create_app(live_settings, http=http))
    h0 = c.get("/api/v1/health").json()
    assert h0["tools"]["get_water_level"] == {"available": True, "source": "bpbd-scrape", "note": None}
    c.get("/api/v1/heatmap", params={"date": dt.datetime.now(W.WIB).date().isoformat()})
    t = c.get("/api/v1/health").json()["tma_live"]
    assert t["posts_parsed"] == 12 and t["last_error"] is None and t["stored_rows"] > 0


# ---- kecamatan boundaries ---------------------------------------------------------------------------
def test_heatmap_uses_real_kecamatan_boundaries(replay_settings):
    c = TestClient(create_app(replay_settings))
    body = c.get("/api/v1/heatmap", params={"date": "2020-02-25"}).json()
    assert body["metadata"]["geometry"] == "admin"
    cat = get_catalog(str(replay_settings.models_dir))
    total = 0.0
    for f in body["features"]:
        g = shape(f["geometry"])
        assert g.is_valid and g.geom_type == "Polygon"
        total += g.area
        a = cat.by_grid_id(f["properties"]["grid_id"])
        assert g.buffer(0.01).contains(__import__("shapely.geometry", fromlist=["Point"]).Point(a.lon, a.lat))
    assert 0.045 < total < 0.06           # about 640 km2 of DKI Jakarta (in square degrees)


def test_boundary_falls_back_to_square_when_missing(replay_settings):
    cat = get_catalog(str(replay_settings.models_dir))
    k = dataclasses.replace(cat.all()[0], boundary=None)
    ring = H._geometry(type("A", (), {"area": k})())["coordinates"][0]
    assert len(ring) == 5 and ring[0] == ring[-1]
