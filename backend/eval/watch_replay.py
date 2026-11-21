"""Replay the Flood Watch Agent over past days and score its warnings against recorded floods.

    py -m eval.watch_replay --start 2020-01-01 --end 2020-03-31            # rules only (no LLM)
    py -m eval.watch_replay --start 2020-01-01 --end 2020-03-31 --qwen     # with Qwen (needs Ollama)

Three policies are compared on the same days (2020 is the model's held-out test year):
  - naive:   warn every area-day the model labels high (what a plain threshold alert would do)
  - rules:   Flood Watch with the LLM off (trigger + default action + cooldown)
  - qwen:    Flood Watch with Qwen investigating and proposing (only with --qwen)

Scores (an area-day is one kecamatan on one day):
  - notifications:     alerts a user would receive (fewer = less alert fatigue)
  - warned_area_days:  area-days under a warning (naive: every high day; Flood Watch: while a warning is active)
  - precision:         share of warned area-days that had a recorded flood
  - coverage:          share of flooded area-days that were under a warning
Recorded floods are incomplete (unreported floods count as 0), so precision is a lower bound.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path

import pandas as pd

from app.areas import get_catalog
from app.audit import AuditLog
from app.cache import TTLCache
from app.config import Settings
from app.floodwatch import FloodWatch, WatchMemory
from app.llm import NoLLM, QwenClient
from app.pipeline import Pipeline
from app.tools import ToolRegistry
from app.waterlevel import WIB
from eval.evaluate import LABELS

RESULTS = Path(__file__).resolve().parent / "results"


def days(start: dt.date, end: dt.date):
    d = start
    while d <= end:
        yield d
        d += dt.timedelta(days=1)


def run_watch(s: Settings, llm, start: dt.date, end: dt.date) -> tuple[int, set, list[dict]]:
    """Returns (notifications sent, area-days with an active warning, per-day decisions)."""
    catalog = get_catalog(str(s.models_dir))
    pipeline = Pipeline(s, ToolRegistry(s, catalog), llm, TTLCache(10**6), AuditLog(s.audit_dir, False))
    watch = FloodWatch(pipeline, llm, WatchMemory(None), cooldown_h=s.watch_cooldown_h)
    sent, active, decisions = 0, set(), []
    for d in days(start, end):
        dec = watch.cycle(d, now=dt.datetime.combine(d, dt.time(6, 0), tzinfo=WIB))
        sent += len(dec["published"])
        active |= {(g, d) for g in dec.get("active", {})}
        decisions.append({"date": d.isoformat(), "triggered": dec["triggered"], "decided_by": dec["decided_by"],
                          "changed": len(dec["changes"]), "published": len(dec["published"]),
                          "active": len(dec.get("active", {})), "cleared": len(dec.get("cleared", [])),
                          "suppressed": len(dec["suppressed"]), "guardrail_errors": dec["guardrail_errors"],
                          "llm_tool_calls": sum(st["step"] == "tool" for st in dec["steps"])})
        print(f"  {d}  triggered={dec['triggered']!s:5}  by={dec['decided_by']:5}  sent={len(dec['published']):2}"
              f"  active={len(dec.get('active', {}))}")
    return sent, active, decisions


def naive(s: Settings, start: dt.date, end: dt.date) -> tuple[int, set]:
    """A plain threshold alert: a notification for every area-day the model labels high."""
    catalog = get_catalog(str(s.models_dir))
    pipeline = Pipeline(s, ToolRegistry(s, catalog), NoLLM(), TTLCache(10**6), AuditLog(s.audit_dir, False))
    active = set()
    for d in days(start, end):
        active |= {(a.area.grid_id, d) for a in pipeline.run(d).areas if a.risk_level == "high"}
    return len(active), active


def score(sent: int, active: set, floods: set) -> dict:
    """Area-day scores: precision = flooded share of the area-days under a warning; coverage = share of flooded
    area-days that were under a warning. `notifications` is how many alerts a user would have received."""
    hit = len(active & floods)
    return {"notifications": sent, "warned_area_days": len(active),
            "precision": round(hit / len(active), 4) if active else None,
            "coverage": round(hit / len(floods), 4) if floods else None}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", default="2020-01-01")
    ap.add_argument("--end", default="2020-03-31")
    ap.add_argument("--qwen", action="store_true", help="also run the agent with Qwen (needs Ollama)")
    args = ap.parse_args()
    start, end = dt.date.fromisoformat(args.start), dt.date.fromisoformat(args.end)
    s = Settings(data_mode="replay", llm_enabled=args.qwen, reports_demo=False)
    catalog = get_catalog(str(s.models_dir))
    grid_of = {k.cell_id: k.grid_id for k in catalog.all()}

    lab = pd.read_parquet(LABELS, columns=["cell_id", "date", "flood"])
    lab = lab[(lab["date"].dt.date >= start) & (lab["date"].dt.date <= end) & (lab["flood"] == 1)]
    flood_days = [(grid_of[c], d.date()) for c, d in zip(lab["cell_id"], lab["date"]) if c in grid_of]
    floods = set(flood_days)
    print(f"{start}..{end}: {len(floods)} flooded area-days recorded")

    report: dict = {"start": start.isoformat(), "end": end.isoformat(), "flooded_area_days": len(floods)}
    print("naive (alert every high area-day) ...")
    report["naive"] = score(*naive(s, start, end), floods)
    print("rules (Flood Watch, LLM off) ...")
    sent, active, dec = run_watch(s, NoLLM(), start, end)
    report["rules"] = score(sent, active, floods)
    if args.qwen:
        print("qwen (Flood Watch, LLM on) ...")
        llm = QwenClient(s)
        llm.warm_up()
        sent, active, dec = run_watch(s, llm, start, end)
        report["qwen"] = score(sent, active, floods)
        report["qwen"]["days_decided_by_qwen"] = sum(x["decided_by"] == "qwen" for x in dec)
        report["qwen"]["days_rejected_by_guardrail"] = sum(bool(x["guardrail_errors"]) for x in dec)
    RESULTS.mkdir(exist_ok=True)
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M")
    out = RESULTS / f"watch_replay_{stamp}.json"
    out.write_text(json.dumps({**report, "decisions": dec}, indent=2, default=str), encoding="utf-8")
    print(json.dumps(report, indent=2))
    print(f"saved {out}")


if __name__ == "__main__":
    main()
