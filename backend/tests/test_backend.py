"""Backend tests. No network and no real Qwen: Open-Meteo is mocked with httpx.MockTransport and Qwen with
FakeLLM. Run from backend/:  python -m pytest
"""
import datetime as dt
import json

import httpx
import pandas as pd
from fastapi.testclient import TestClient

from app import guardrails as G
from app.agents import (AdviceFacts, AdviceWriter, DataFetchOrchestrator, FailureHandler, FreshnessChecker,
                        TEMPLATES, Verdict)
from app.areas import get_catalog
from app.main import create_app, target_date_for
from app.tools import ToolResult
from conftest import FLOOD_DAY, FakeLLM

WIB = dt.timezone(dt.timedelta(hours=7))


def client(settings, llm=None, http=None) -> TestClient:
    return TestClient(create_app(settings, llm=llm, http=http))


# ---- end to end, replay --------------------------------------------------------------------------
def test_heatmap_replay_flood_day_matches_model_report(replay_settings):
    j = client(replay_settings).get("/api/v1/heatmap", params={"date": FLOOD_DAY.isoformat()}).json()
    assert j["metadata"]["total_grids"] == 44
    # REPORT.md: on 25 Feb 2020 all 44 kecamatan are labelled high
    assert j["metadata"]["high_risk_count"] == 44
    p = j["features"][0]["properties"]
    assert p["risk_level"] in {"Low", "Medium", "High", "Unknown"}
    assert 0 <= p["flood_probability"] <= 1
    assert j["features"][0]["geometry"]["type"] == "Polygon"


def test_full_model_and_high_confidence_when_water_level_present(replay_settings):
    j = client(replay_settings).get("/api/v1/heatmap", params={"date": FLOOD_DAY.isoformat()}).json()
    modes = {f["properties"]["model_mode"] for f in j["features"]}
    assert "full" in modes
    for f in j["features"]:
        p = f["properties"]
        assert p["confidence"] == ("HIGH" if p["model_mode"] == "full" else "LOW")


def test_no_invented_fields(replay_settings):
    j = client(replay_settings).get("/api/v1/analysis",
                                    params={"grid_id": "menteng", "date": FLOOD_DAY.isoformat()}).json()
    for k in ("duration_est", "peak_time", "inundation_range", "evacuation_route", "siaga_level"):
        assert j[k] is None
    assert j["safe_shelters"] == [] and j["affected_roads"] == []
    assert len(j["hydrograph"]) == 7


def test_data_unavailable_when_no_rainfall(replay_settings):
    r = client(replay_settings).get("/api/v1/heatmap", params={"date": "2010-01-01"})
    assert r.status_code == 503 and r.json()["status"] == "data_unavailable"


def test_unknown_grid_id_404(replay_settings):
    assert client(replay_settings).get("/api/v1/analysis",
                                       params={"grid_id": "atlantis", "date": "2020-02-25"}).status_code == 404


def test_cache_hit_on_second_request(replay_settings):
    c = client(replay_settings)
    a = c.get("/api/v1/heatmap", params={"date": FLOOD_DAY.isoformat()}).json()["metadata"]
    b = c.get("/api/v1/heatmap", params={"date": FLOOD_DAY.isoformat()}).json()["metadata"]
    assert a["cached"] is False and b["cached"] is True and a["request_id"] == b["request_id"]


def test_audit_log_written(replay_settings):
    client(replay_settings).get("/api/v1/heatmap", params={"date": FLOOD_DAY.isoformat()})
    files = list(replay_settings.audit_dir.glob("audit-*.jsonl"))
    rec = json.loads(files[0].read_text(encoding="utf-8").splitlines()[-1])
    agents = {s.get("agent") for s in rec["trace"] if s["step"] == "agent"}
    assert {"agent1_data_fetch", "agent3_freshness"} <= agents


# ---- live mode with mocked Open-Meteo -------------------------------------------------------------
def _open_meteo(days_back=40, days_fwd=3, fail_first=0):
    state = {"n": 0}
    today = dt.datetime.now(WIB).date()
    times = [(today + dt.timedelta(days=i)).isoformat() for i in range(-days_back, days_fwd)]

    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.host == "bpbd.jakarta.go.id":      # live water level (BPBD): not Open-Meteo, not counted here
            return httpx.Response(503, text="down")
        state["n"] += 1
        if state["n"] <= fail_first:
            return httpx.Response(500, json={"error": True})
        n = len(req.url.params["latitude"].split(","))
        body = [{"daily": {"time": times, "precipitation_sum": [5.0] * len(times)}} for _ in range(n)]
        return httpx.Response(200, json=body if n > 1 else body[0])
    return httpx.Client(transport=httpx.MockTransport(handler)), state


def test_live_mode_runs_rainfall_only_with_low_confidence(live_settings):
    http, _ = _open_meteo()
    r = client(live_settings, http=http).get("/api/v1/heatmap", params={"time": "24h"})
    assert r.status_code == 200
    props = [f["properties"] for f in r.json()["features"]]
    assert len(props) == 44
    assert {p["model_mode"] for p in props} == {"rainfall_only"}
    assert {p["confidence"] for p in props} == {"LOW"}


def test_agent2_retries_failed_forecast_then_succeeds(live_settings):
    http, state = _open_meteo(fail_first=1)
    r = client(live_settings, http=http).get("/api/v1/heatmap", params={"time": "24h"})
    assert r.status_code == 200 and state["n"] == 2


def test_agent2_reports_unavailable_after_retry(live_settings):
    http, state = _open_meteo(fail_first=5)
    r = client(live_settings, http=http).get("/api/v1/heatmap", params={"time": "24h"})
    assert r.status_code == 503 and state["n"] == 2


# ---- Agent 1 with Qwen ----------------------------------------------------------------------------
CAPS = {"resolve_area": {"available": True}, "get_weather_forecast": {"available": True},
        "get_water_level": {"available": False}, "get_static_features": {"available": True}}


def test_agent1_uses_valid_qwen_plan():
    llm = FakeLLM({"agent1_data_fetch": {"tools": ["get_weather_forecast", "get_static_features"],
                                         "reason": "no water level"}})
    d = DataFetchOrchestrator(llm).plan(["Menteng"], CAPS)
    assert d.decided_by == "qwen" and "get_water_level" not in d.value["tools"]


def test_agent1_rejects_unavailable_tool_from_qwen():
    llm = FakeLLM({"agent1_data_fetch": {"tools": ["get_weather_forecast", "get_static_features",
                                                   "get_water_level"]}})
    d = DataFetchOrchestrator(llm).plan(["Menteng"], CAPS)
    assert d.decided_by == "policy" and d.llm.guardrail_errors


def test_agent1_rejects_plan_missing_required_tool():
    d = DataFetchOrchestrator(FakeLLM({"agent1_data_fetch": {"tools": ["get_static_features"]}})).plan(["x"], CAPS)
    assert d.decided_by == "policy" and set(d.value["tools"]) == {"get_weather_forecast", "get_static_features"}


def test_agent1_survives_non_json_reply():
    d = DataFetchOrchestrator(FakeLLM({"agent1_data_fetch": "sure! here is the plan"})).plan(["x"], CAPS)
    assert d.decided_by == "policy"


# ---- Agent 2 / Agent 3 ----------------------------------------------------------------------------
def test_agent2_cannot_skip_to_fallback_for_rain():
    v = Verdict("rain", "missing", "timeout", retryable=True)
    d = FailureHandler(FakeLLM({"agent2_failure": {"action": "fallback_rainfall_only"}})).decide(v, attempts=1)
    assert d.decided_by == "policy" and d.value["action"] == "retry"


def test_agent2_accepts_allowed_qwen_action():
    v = Verdict("water_level", "stale", "old", retryable=True)
    d = FailureHandler(FakeLLM({"agent2_failure": {"action": "fallback_rainfall_only"}})).decide(v, attempts=1)
    assert d.decided_by == "qwen" and d.value["action"] == "fallback_rainfall_only"


def test_agent3_flags_stale_forecast(live_settings):
    now = dt.datetime.now(dt.timezone.utc)
    target = now.astimezone(WIB).date()
    dates = pd.date_range(end=pd.Timestamp(target), periods=30)
    data = pd.DataFrame({"point_id": "p", "date": dates, "precip_mm": 1.0})
    res = ToolResult("get_weather_forecast", ok=True, source="open-meteo-forecast", data=data,
                     data_as_of=now - dt.timedelta(hours=10))
    assert FreshnessChecker(live_settings).check_rain(res, ["p"], target).status == "stale"


def test_agent3_flags_incomplete_history(live_settings):
    target = dt.date(2020, 2, 25)
    data = pd.DataFrame({"point_id": "p", "date": pd.date_range(end=pd.Timestamp(target), periods=20),
                         "precip_mm": 1.0})
    res = ToolResult("get_weather_forecast", ok=True, source="archive-replay", data=data)
    assert FreshnessChecker(live_settings).check_rain(res, ["p"], target).status == "incomplete"


# ---- advice writer + guardrails ----------------------------------------------------------------
FACTS = AdviceFacts("Menteng", FLOOD_DAY, "high", "HIGH", 10.9, 961.0, today=FLOOD_DAY)


def test_templates_pass_guardrails():
    for level in TEMPLATES:
        f = AdviceFacts("Menteng", FLOOD_DAY, level, "LOW", None, None)
        for text in AdviceWriter.template(f).values():
            assert G.check_text(text, level, f.numbers()) == [], (level, text)


def test_advice_rejects_invented_number():
    bad = {"recommendation": "Risiko tinggi, genangan 50 cm dalam 2 jam.",
           "commuter_advisory": "Risiko tinggi, hindari jalan rendah."}
    d = AdviceWriter(FakeLLM({"advice_writer": bad})).write(FACTS)
    assert d.decided_by == "policy" and any("numbers not found" in e for e in d.llm.guardrail_errors)


def test_advice_rejects_wrong_risk_and_certainty():
    bad = {"recommendation": "Risiko rendah, pasti tidak banjir.", "commuter_advisory": "Aman."}
    d = AdviceWriter(FakeLLM({"advice_writer": bad})).write(FACTS)
    assert d.decided_by == "policy"


def test_advice_accepts_grounded_text():
    good = {"recommendation": "Risiko banjir tinggi di Menteng. Hujan hari ini 10.9 mm, pantau info BPBD.",
            "commuter_advisory": "Risiko tinggi: hindari genangan dan jalan rendah."}
    d = AdviceWriter(FakeLLM({"advice_writer": good})).write(FACTS)
    assert d.decided_by == "qwen", d.llm.guardrail_errors


# ---- small pieces -----------------------------------------------------------------------------
def test_horizon_maps_to_calendar_day():
    morning = dt.datetime(2026, 11, 2, 9, 0, tzinfo=WIB)
    evening = dt.datetime(2026, 11, 2, 20, 0, tzinfo=WIB)
    assert target_date_for("5h", morning) == dt.date(2026, 11, 2)
    assert target_date_for("5h", evening) == dt.date(2026, 11, 3)
    assert target_date_for("24h", morning) == dt.date(2026, 11, 3)


def test_catalog_has_44_kecamatan_and_every_kelurahan_mapped(replay_settings):
    cat = get_catalog(str(replay_settings.models_dir))
    assert len(cat.all()) == 44
    assert sum(len(k.kelurahan) for k in cat.all()) == 264


# ---- evaluation script ---------------------------------------------------------------------------
def test_system_eval_has_no_train_serve_skew(tmp_path, monkeypatch):
    from eval import evaluate as E
    monkeypatch.setattr(E, "RESULTS_DIR", tmp_path)
    r = E.run_system(2020, limit_days=3)
    assert r["unit_days"] == 3 * 44
    assert r["consistency"]["rows_gap_over_0.001"] == 0


# ---- Qwen client (Ollama native API) -----------------------------------------------------------
def _qwen(handler, **kw):
    from app.config import Settings
    from app.llm import QwenClient
    s = Settings(llm_enabled=True, llm_base_url="http://localhost:11434/v1", llm_api_style="ollama", **kw)
    return QwenClient(s, http=httpx.Client(transport=httpx.MockTransport(handler)))


def test_qwen_ollama_turns_thinking_off_and_parses_fenced_json():
    seen = {}

    def handler(req):
        seen["url"] = str(req.url)
        seen["body"] = json.loads(req.content)
        return httpx.Response(200, json={"message": {"role": "assistant",
                                                     "content": '```json\n{"action": "retry"}\n```'}})
    c = _qwen(handler).complete_json("agent2_failure", "sys", "user")
    assert seen["url"] == "http://localhost:11434/api/chat"
    assert seen["body"]["think"] is False and seen["body"]["format"] == "json" and seen["body"]["stream"] is False
    assert c.parsed == {"action": "retry"} and c.error is None


def test_qwen_empty_reply_is_an_error_not_a_crash():
    c = _qwen(lambda req: httpx.Response(200, json={"message": {"content": ""}})).complete_json("a", "s", "u")
    assert c.parsed is None and "empty reply" in c.error


def test_slow_answer_does_not_disable_qwen_for_next_request():
    def handler(req):
        raise httpx.ReadTimeout("timed out", request=req)
    q = _qwen(handler)
    q.complete_json("a", "s", "u")
    assert q.available()          # a timeout must not trip the circuit breaker


def test_ollama_not_running_trips_breaker():
    def handler(req):
        raise httpx.ConnectError("refused", request=req)
    q = _qwen(handler)
    q.complete_json("a", "s", "u")
    assert not q.available()


# ---- prompt version 2026-11-08.1 fixes (from the first real Qwen run) ----------------------------
def test_agent1_is_not_offered_resolve_area():
    llm = FakeLLM({"agent1_data_fetch": {"tools": ["get_weather_forecast", "get_static_features"]}})
    DataFetchOrchestrator(llm).plan(["Menteng"], CAPS)
    assert "resolve_area" not in json.loads(llm.calls[0].user)["tools"]


def test_advice_risk_word_in_one_field_is_enough():
    reply = {"recommendation": "Hindari perjalanan di Menteng karena risiko banjir tinggi.",
             "commuter_advisory": "Tunda perjalanan dengan motor dan hindari jalan rendah."}
    d = AdviceWriter(FakeLLM({"advice_writer": reply})).write(FACTS)
    assert d.decided_by == "qwen", d.llm.guardrail_errors


def test_advice_unknown_paraphrase_accepted_but_missing_still_rejected():
    f = AdviceFacts("Jatinegara", FLOOD_DAY, "unknown", "LOW", None, None)
    ok = {"recommendation": "Risiko banjir di Jatinegara belum dapat ditentukan karena data terbatas.",
          "commuter_advisory": "Periksa kondisi jalan sebelum berangkat."}
    bad = {"recommendation": "Jatinegara: data terbatas.", "commuter_advisory": "Hati-hati di jalan."}
    assert AdviceWriter(FakeLLM({"advice_writer": ok})).write(f).decided_by == "qwen"
    assert AdviceWriter(FakeLLM({"advice_writer": bad})).write(f).decided_by == "policy"


def test_advice_writer_never_sees_water_level_number():
    llm = FakeLLM({"advice_writer": {"recommendation": "x", "commuter_advisory": "y"}})
    AdviceWriter(llm).write(FACTS)
    assert "961" not in llm.calls[0].user


# ---- prompt version 2026-11-08.2: day label and BMKG rain category (from the first live run) ------
TOMORROW = AdviceFacts("Menteng", dt.date(2026, 11, 9), "medium", "LOW", 2.5, None, today=dt.date(2026, 11, 8))


def test_day_label_and_rain_category():
    assert TOMORROW.day_label() == "besok"
    assert TOMORROW.rain_category() == "hujan ringan"
    assert AdviceFacts("x", dt.date(2020, 1, 1), "high", "HIGH", 120.0, None,
                       today=dt.date(2020, 1, 1)).rain_category() == "hujan sangat lebat"
    payload = TOMORROW.prompt_payload()
    assert payload["untuk_hari"] == "besok" and payload["kategori_hujan"] == "hujan ringan"
    assert "bmkg" not in json.dumps(payload).lower()


def test_advice_rejects_today_wording_and_heavy_words_for_tomorrows_light_rain():
    live_reply = {"recommendation": "Risiko banjir sedang di Menteng, namun data terbatas sehingga perkiraan ini belum pasti.",
                  "commuter_advisory": "Hujan hari ini 2.5 mm cukup signifikan untuk area padat seperti Menteng."}
    d = AdviceWriter(FakeLLM({"advice_writer": live_reply})).write(TOMORROW)
    errs = " ".join(d.llm.guardrail_errors)
    assert d.decided_by == "policy" and "hari ini" in errs and "heavy" in errs


def test_advice_accepts_correct_tomorrow_wording():
    good = {"recommendation": "Risiko banjir sedang di Menteng untuk besok, namun data terbatas.",
            "commuter_advisory": "Besok diperkirakan hujan ringan sekitar 2.5 mm. Siapkan rute alternatif."}
    d = AdviceWriter(FakeLLM({"advice_writer": good})).write(TOMORROW)
    assert d.decided_by == "qwen", d.llm.guardrail_errors


# ---- prompt version 2026-11-08.3: no false source attribution (from the second live run) -----------
def test_advice_rejects_false_source_attribution():
    live_reply = {"recommendation": "Risiko banjir sedang di Menteng untuk besok, namun data terbatas sehingga perkiraan ini belum pasti.",
                  "commuter_advisory": "BMKG memprediksi hujan ringan sekitar 2.5 mm besok; siapkan rute alternatif."}
    d = AdviceWriter(FakeLLM({"advice_writer": live_reply})).write(TOMORROW)
    assert d.decided_by == "policy" and any("source" in e for e in d.llm.guardrail_errors)


def test_bpbd_allowed_as_place_to_check():
    reply = {"recommendation": "Risiko banjir sedang di Menteng untuk besok. Pantau info resmi BPBD.",
             "commuter_advisory": "Besok diperkirakan hujan ringan sekitar 2.5 mm, siapkan rute alternatif."}
    assert AdviceWriter(FakeLLM({"advice_writer": reply})).write(TOMORROW).decided_by == "qwen"


def test_iso_date_in_text_is_not_an_invented_number():
    f = AdviceFacts("Kebayoran Baru", dt.date(2020, 8, 10), "low", "HIGH", 0.0, 120.0, today=dt.date(2020, 8, 9))
    reply = {"recommendation": "Risiko banjir rendah di Kebayoran Baru. Perjalanan normal, tetap pantau cuaca.",
             "commuter_advisory": "Diperkirakan tidak hujan pada 2020-08-10. Lanjutkan perjalanan seperti biasa."}
    d = AdviceWriter(FakeLLM({"advice_writer": reply})).write(f)
    assert d.decided_by == "qwen", d.llm.guardrail_errors


def test_health_reports_replay_date_range(replay_settings):
    h = client(replay_settings).get("/api/v1/health").json()
    r = h["replay_dates"]
    assert r["min"] <= "2020-02-25" <= r["max"]


def test_health_has_no_replay_range_in_live_mode(live_settings):
    assert client(live_settings).get("/api/v1/health").json()["replay_dates"] is None
