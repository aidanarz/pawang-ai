"""Alternative route: geometry, scoring, the avoid-and-ask-again loop, and the endpoint. The routing engine is a mock
(httpx.MockTransport): no network. Run from backend/:  python -m pytest tests/test_routing.py
"""
import json
from dataclasses import replace
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.routing import (Route, MAX_EXCLUDE, MAX_EXTRA_CALLS, ENDPOINT_FREE_M, Projector, RiskMap, ValhallaClient,
                         decode_polyline6, distance_m, plan_route)
from conftest import FLOOD_DAY

O, D = (-6.200, 106.800), (-6.200, 106.900)          # about 11 km apart, east-west
ZONE = [[106.840, -6.210], [106.860, -6.210], [106.860, -6.190], [106.840, -6.190], [106.840, -6.210]]   # [lng, lat]


def encode(coords) -> str:
    out, plat, plon = [], 0, 0
    for lat, lon in coords:
        for v, prev in ((round(lat * 1e6), plat), (round(lon * 1e6), plon)):
            d = v - prev
            d = ~(d << 1) if d < 0 else d << 1
            while d >= 0x20:
                out.append(chr((0x20 | (d & 0x1F)) + 63))
                d >>= 5
            out.append(chr(d + 63))
        plat, plon = round(lat * 1e6), round(lon * 1e6)
    return "".join(out)


STRAIGHT = [(-6.200, 106.800), (-6.200, 106.850), (-6.200, 106.900)]      # crosses ZONE
DETOUR = [(-6.200, 106.800), (-6.250, 106.850), (-6.200, 106.900)]        # goes around it


def trip(coords, name, km, minutes):
    return {"legs": [{"shape": encode(coords), "maneuvers": [{"street_names": [name], "length": km}]}],
            "summary": {"length": km, "time": minutes * 60}}


def engine(calls, crossing_only=False):
    """A fake Valhalla: the straight road by default, the detour once points are excluded."""
    def handler(req: httpx.Request) -> httpx.Response:
        body = json.loads(req.content)
        calls.append(body)
        if "exclude_locations" in body and not crossing_only:
            return httpx.Response(200, json={"trip": trip(DETOUR, "Jalan Pesisir", 14.0, 30)})
        return httpx.Response(200, json={"trip": trip(STRAIGHT, "Jalan Raya Timur", 11.0, 20)})
    return ValhallaClient("http://engine.test", http=httpx.Client(transport=httpx.MockTransport(handler)))


def risk(tier="high", flood=()):
    area = SimpleNamespace(area=SimpleNamespace(boundary=[ZONE], name="Zona Uji"), risk_level=tier)
    return RiskMap([area], list(flood), Projector(-6.2, 106.85))


def test_polyline_round_trip():
    flat = [v for pt in decode_polyline6(encode(STRAIGHT)) for v in pt]
    assert flat == pytest.approx([v for pt in STRAIGHT for v in pt], abs=1e-6)


def test_exposure_counts_km_inside_high_and_soft_areas():
    r = risk("high").expose(Route(STRAIGHT, 11.0, 20))
    assert 2.0 < r.high_km < 2.4 and r.soft_km == 0          # 0.02 degrees of longitude is about 2.2 km
    soft = risk("medium_high").expose(Route(STRAIGHT, 11.0, 20))
    assert soft.high_km == 0 and soft.soft_km > 2.0 and 0 < soft.score < r.score


def test_detour_is_chosen_when_the_fast_route_crosses_a_high_area():
    calls = []
    p = plan_route(engine(calls), risk("high"), O, D)
    assert p.verdict == "safe" and p.recommended is not p.fastest
    assert p.fastest.high_km > 2 and p.recommended.high_km == 0
    assert "Jalan Pesisir" in p.message and "menghindari" in p.message      # street name comes from the route result
    assert "exclude_locations" in calls[1] and len(calls[1]["exclude_locations"]) <= MAX_EXCLUDE
    assert calls[0]["costing"] == "motor_scooter"


def test_a_clear_fast_route_needs_one_engine_call():
    calls = []
    p = plan_route(engine(calls), risk("low"), O, D)
    assert p.verdict == "clear" and p.recommended is p.fastest and len(calls) == 1


def test_no_better_route_is_reported_as_unavoidable_and_the_loop_is_bounded():
    calls = []
    p = plan_route(engine(calls, crossing_only=True), risk("high"), O, D)
    assert p.verdict == "unavoidable" and p.recommended.high_km > 2 and "menunda" in p.message
    assert len(calls) <= 1 + MAX_EXTRA_CALLS


def test_citizen_flood_point_on_the_route_counts_and_is_avoided():
    calls = []
    p = plan_route(engine(calls), risk("low", flood=[(-6.2002, 106.8501)]), O, D)
    assert p.fastest.flood_points == 1 and p.verdict == "safe" and p.recommended.flood_points == 0
    assert calls[1]["exclude_locations"][0] == {"lat": -6.2002, "lon": 106.8501}


def test_no_exclusion_close_to_the_start_or_the_end():
    inside_start = (-6.200, 106.845)            # start in the high zone, 500 m from the zone edge
    samples = risk("high").risky_samples(
        Route(STRAIGHT, 11.0, 20), inside_start, D)
    assert samples and all(distance_m(inside_start, s) > ENDPOINT_FREE_M for s in samples)


def test_exclusion_that_leaves_no_road_keeps_the_best_route_found():
    def handler(req):
        if "exclude_locations" in json.loads(req.content):
            return httpx.Response(400, json={"error": "No path could be found for input"})
        return httpx.Response(200, json={"trip": trip(STRAIGHT, "Jalan Raya Timur", 11.0, 20)})
    c = ValhallaClient("http://engine.test", http=httpx.Client(transport=httpx.MockTransport(handler)))
    p = plan_route(c, risk("high"), O, D)
    assert p.verdict == "unavoidable" and p.recommended is p.fastest


# ---- endpoint ---------------------------------------------------------------------------------------------------
REQ = {"origin": {"lat": -6.2, "lon": 106.80}, "destination": {"lat": -6.2, "lon": 106.9}, "time": "5h",
       "date": FLOOD_DAY.isoformat()}


def app_client(settings, calls=None, status=200):
    def handler(req):
        if calls is not None:
            calls.append(json.loads(req.content))
        if status != 200:
            return httpx.Response(status, text="No path could be found for input" if status == 400 else "boom")
        return httpx.Response(200, json={"trip": trip(STRAIGHT, "Jalan Raya Timur", 11.0, 20)})
    http = httpx.Client(transport=httpx.MockTransport(handler))
    return TestClient(create_app(settings, http=http))


def test_route_endpoint_returns_both_routes_and_a_verdict(replay_settings):
    j = app_client(replay_settings).post("/api/v1/route", json=REQ).json()
    assert j["verdict"] in {"clear", "safe", "reduced", "unavoidable"} and j["profile"] == "motor_scooter"
    assert j["fastest"]["coordinates"][0] == [-6.2, 106.8] and j["recommended"]["km"] > 0
    assert j["target_date"] == FLOOD_DAY.isoformat() and j["flood_points_known"] == 0


def test_route_endpoint_rejects_bad_input(replay_settings):
    c = app_client(replay_settings)
    assert c.post("/api/v1/route", json={**REQ, "origin": {"lat": 10.0, "lon": 106.8}}).status_code == 422
    near = {**REQ, "destination": {"lat": -6.2001, "lon": 106.8001}}
    assert c.post("/api/v1/route", json=near).status_code == 422
    assert c.post("/api/v1/route", json={**REQ, "date": "2020-02-31"}).status_code == 422


def test_route_endpoint_answers_503_when_the_engine_is_down_and_422_when_there_is_no_road(replay_settings):
    assert app_client(replay_settings, status=500).post("/api/v1/route", json=REQ).status_code == 503
    assert app_client(replay_settings, status=400).post("/api/v1/route", json=REQ).status_code == 422


def test_route_endpoint_caches_and_rate_limits(replay_settings):
    calls = []
    c = app_client(replace(replay_settings, route_per_minute=1), calls)
    assert c.post("/api/v1/route", json=REQ).status_code == 200
    n = len(calls)
    assert c.post("/api/v1/route", json=REQ).status_code == 200 and len(calls) == n       # cache hit: no engine call
    other = {**REQ, "destination": {"lat": -6.21, "lon": 106.91}}
    assert c.post("/api/v1/route", json=other).status_code == 429                          # a new request is limited


def test_exposure_in_a_medium_high_area_alone_does_not_trigger_a_detour():
    calls = []
    p = plan_route(engine(calls), risk("medium_high"), O, D)
    assert p.verdict == "clear" and p.recommended is p.fastest and len(calls) == 1
    assert "cukup tinggi" in p.message


def test_a_detour_that_barely_helps_is_not_taken():
    def handler(req):
        body = json.loads(req.content)
        coords = [(-6.2, 106.8), (-6.2, 106.841), (-6.2, 106.9)] if "exclude_locations" in body else STRAIGHT
        return httpx.Response(200, json={"trip": trip(coords, "Jalan Raya Timur", 11.0, 20)})
    c = ValhallaClient("http://engine.test", http=httpx.Client(transport=httpx.MockTransport(handler)))
    p = plan_route(c, risk("high"), O, D)
    assert p.recommended is p.fastest and p.verdict == "unavoidable"


def test_route_numbers_are_not_street_names():
    t = trip(STRAIGHT, "2", 11.0, 20)
    t["legs"][0]["maneuvers"].append({"street_names": ["Jalan Raya Bogor"], "length": 3.0})
    assert [n for n, _ in ValhallaClient._parse(t).streets] == ["Jalan Raya Bogor"]
