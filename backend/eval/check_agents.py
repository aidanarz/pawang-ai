"""Capability check for the three agents: pass/fail per scenario, exit code 1 if anything fails.

    py -m eval.check_agents            # uses the LLM from .env (Qwen if QWEN_ENABLED=true, else rules only)
    set QWEN_ENABLED=false & py -m eval.check_agents    # rules only, no LLM needed

What it proves (different from `eval.evaluate agents`, which measures Qwen quality, not correctness):
  Agent 1  plan always has the required tools, never a tool that is unavailable
  Agent 2  action is always inside the allowed set; rain never falls back; no retry after the 2nd attempt
  Agent 3  verdict (valid / stale / incomplete / missing / skipped) is right for each data condition
With a real LLM these hold even when Qwen answers badly, because guardrails fall back to the policy.
"""
from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

import pandas as pd

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.agents import REQUIRED_TOOLS, DataFetchOrchestrator, FailureHandler, FreshnessChecker  # noqa: E402
from app.config import Settings  # noqa: E402
from app.llm import QwenClient  # noqa: E402
from app.tools import ToolResult  # noqa: E402
from eval.evaluate import AGENT2_CASES, CAPS_NO_TMA, CAPS_WITH_TMA, _llm  # noqa: E402

NOW = dt.datetime.now(dt.timezone.utc)
TARGET = dt.date(2020, 2, 25)
results: list[tuple[str, str, bool, str]] = []


def check(agent: str, case: str, ok: bool, detail: str = "") -> None:
    results.append((agent, case, bool(ok), detail))
    print(f"  {'PASS' if ok else 'FAIL'}  {agent:<8} {case:<44} {detail}", flush=True)


def rain(days: int, source: str = "open-meteo-forecast", age_h: float = 0, points=("p1", "p2")) -> ToolResult:
    dates = pd.date_range(end=pd.Timestamp(TARGET), periods=days)
    data = pd.DataFrame([{"point_id": p, "date": d, "precip_mm": 1.0} for p in points for d in dates])
    return ToolResult("get_weather_forecast", ok=True, source=source, data=data,
                      data_as_of=NOW - dt.timedelta(hours=age_h) if source != "archive-replay" else None)


def tma(stations: list[str], day=TARGET, age_h: float = 0) -> ToolResult:
    data = pd.DataFrame({"station_id": stations, "date": pd.Timestamp(day), "tma_max": 100.0})
    return ToolResult("get_water_level", ok=True, source="bpbd-scrape", data=data,
                      data_as_of=NOW - dt.timedelta(hours=age_h))


def agent1(llm) -> None:
    a1 = DataFetchOrchestrator(llm)
    for name, caps in (("water level available", CAPS_WITH_TMA), ("water level unavailable", CAPS_NO_TMA)):
        d = a1.plan(["Menteng", "Gambir"], caps)
        tools, available = set(d.value["tools"]), {t for t, c in caps.items() if c["available"]} - {"resolve_area"}
        check("agent1", f"{name}: required tools present", REQUIRED_TOOLS <= tools, f"by {d.decided_by}")
        check("agent1", f"{name}: no unavailable tool", tools <= available, str(sorted(tools)))


def agent2(llm) -> None:
    a2 = FailureHandler(llm)
    for name, v, attempts in AGENT2_CASES:
        d = a2.decide(v, attempts)
        action, allowed = d.value["action"], FailureHandler.allowed(v, attempts)
        check("agent2", f"{name}: action allowed", action in allowed, f"{action} by {d.decided_by}")
        if v.source == "rain":
            check("agent2", f"{name}: rain never falls back", action != "fallback_rainfall_only")
        if attempts >= 2:
            check("agent2", f"{name}: no 3rd try", action != "retry")


def agent3(s: Settings) -> None:
    a3 = FreshnessChecker(s)
    pts, sts = ["p1", "p2"], ["s1", "s2"]
    limit = s.max_rain_age_h
    failed = ToolResult("get_weather_forecast", ok=False, source="error", error="boom")
    no_cfg = ToolResult("get_water_level", ok=False, source="none", error="not configured (PAWANG_TMA_LIVE=false)")
    cases = [
        ("rain: full 30 days, fresh", a3.check_rain(rain(30), pts, TARGET), "valid", None),
        ("rain: only 20 days", a3.check_rain(rain(20), pts, TARGET), "incomplete", None),
        ("rain: one point missing", a3.check_rain(rain(30, points=("p1",)), pts, TARGET), "incomplete", None),
        ("rain: forecast too old", a3.check_rain(rain(30, age_h=limit + 4), pts, TARGET), "stale", True),
        ("rain: not fetched", a3.check_rain(None, pts, TARGET), "missing", None),
        ("rain: tool failed", a3.check_rain(failed, pts, TARGET), "missing", True),
        ("rain: archive gap is not retryable", a3.check_rain(rain(20, "archive-replay"), pts, TARGET), "incomplete", False),
        ("water: all stations, fresh", a3.check_water_level(tma(sts), sts, TARGET), "valid", None),
        ("water: partial coverage still usable", a3.check_water_level(tma(["s1"]), sts, TARGET), "valid", None),
        ("water: no reading on target day", a3.check_water_level(tma(sts, TARGET - dt.timedelta(days=1)), sts, TARGET), "missing", None),
        ("water: reading too old", a3.check_water_level(tma(sts, age_h=s.max_tma_age_h + 3), sts, TARGET), "stale", True),
        ("water: not requested", a3.check_water_level(None, sts, TARGET), "skipped", None),
        ("water: source not configured", a3.check_water_level(no_cfg, sts, TARGET), "missing", False),
    ]
    for name, v, status, retryable in cases:
        check("agent3", name, v.status == status and (retryable is None or v.retryable == retryable),
              f"got {v.status}, retryable={v.retryable}")


def main() -> None:
    s = Settings()
    llm = _llm(s)
    qwen_up = isinstance(llm, QwenClient) and llm.ping()
    print(f"LLM: {llm.name} ({'reachable' if qwen_up else 'rules only: LLM off or not reachable'})\n")
    agent1(llm), agent2(llm), agent3(s)
    bad = [r for r in results if not r[2]]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
