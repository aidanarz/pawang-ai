"""Evaluation for the backend and the agents (project document 2.6: recall, precision, F1, latency).

Two parts, run from the backend/ folder:

    py -m eval.evaluate system --year 2020      # whole system, every day of a year, against real flood labels
    py -m eval.evaluate agents --repeats 3      # agent drills: how Qwen decides vs the deterministic policy

`system` replays every day through the SAME pipeline the API uses (tools -> Agent 3 -> Agent 2 -> model),
joins the result with the recorded floods, and reports:
  - recall / precision / F1 at the `high` level and at `medium or higher`, PR-AUC
  - coverage (how often a kecamatan came back `unknown`) and how often confidence was LOW
  - a consistency check: backend p_flood vs the model's own prediction on the training table for the same
    rows. A gap means the backend builds features differently from training (train/serve skew).
  - latency per request (p50 / p95)

`agents` runs fixed scenarios through Agent 1, Agent 2 and the advice writer with the configured LLM
(Qwen through Ollama when QWEN_ENABLED=true) and reports, per agent: how often Qwen's answer passed the
guardrails and was used, how often it agreed with the policy, parse errors, and latency. The advice texts
go to a CSV with an empty `human_rating` column: the team rates them (1-5), which is the document's human
feedback loop and the data for improving the prompts.

Results are written to backend/eval/results/ (git-ignored).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import prompts  # noqa: E402
from app.agents import (AdviceFacts, AdviceWriter, DataFetchOrchestrator, FailureHandler,  # noqa: E402
                        Verdict)
from app.areas import get_catalog  # noqa: E402
from app.audit import AuditLog  # noqa: E402
from app.cache import TTLCache  # noqa: E402
from app.config import MODEL_PKG_DIR, Settings  # noqa: E402
from app.llm import NoLLM, QwenClient  # noqa: E402
from app.pipeline import Pipeline  # noqa: E402
from app.predictor import get_predictor  # noqa: E402
from app.tools import ToolRegistry  # noqa: E402

RESULTS_DIR = BACKEND_DIR / "eval" / "results"
LABELS = MODEL_PKG_DIR / "data" / "processed" / "train_table_kecamatan.parquet"


def _rel(p: Path) -> str:
    try:
        return str(p.relative_to(BACKEND_DIR))
    except ValueError:
        return str(p)


def _llm(s: Settings):
    return QwenClient(s) if s.llm_enabled else NoLLM()


def at_threshold(y: np.ndarray, flagged: np.ndarray) -> dict:
    tp = int((flagged & (y == 1)).sum())
    fp = int((flagged & (y == 0)).sum())
    fn = int((~flagged & (y == 1)).sum())
    prec = tp / max(tp + fp, 1)
    rec = tp / max(tp + fn, 1)
    return {"tp": tp, "fp": fp, "fn": fn, "precision": round(prec, 4), "recall": round(rec, 4),
            "f1": round(2 * prec * rec / max(prec + rec, 1e-12), 4)}


# ================================================================================ system
def run_system(year: int, limit_days: int | None) -> dict:
    from sklearn.metrics import average_precision_score

    # Agents use the deterministic policy here: this part measures the data path + model, and running Qwen
    # 366 times on a laptop would take hours without changing any number (agents never touch p_flood).
    s = Settings(data_mode="replay", llm_enabled=False)
    catalog = get_catalog(str(s.models_dir))
    pipe = Pipeline(s, ToolRegistry(s, catalog), NoLLM(), TTLCache(1), AuditLog(s.audit_dir, enabled=False))

    days = pd.date_range(f"{year}-01-01", f"{year}-12-31").date
    if limit_days:
        days = days[:limit_days]

    rows, latencies, unavailable = [], [], []
    for i, day in enumerate(days, 1):
        t0 = time.perf_counter()
        r = pipe.run(day)
        latencies.append((time.perf_counter() - t0) * 1000)
        if r.status != "ok":
            unavailable.append(day.isoformat())
        for a in r.areas:
            rows.append({"date": pd.Timestamp(day), "cell_id": a.area.cell_id, "risk_level": a.risk_level,
                         "p_flood": a.p_flood, "mode": a.model_mode, "confidence": a.confidence})
        if i % 30 == 0:
            print(f"  {i}/{len(days)} days", flush=True)

    pred = pd.DataFrame(rows)
    labels = pd.read_parquet(LABELS)
    df = pred.merge(labels, on=["cell_id", "date"], how="left")

    # consistency: same rows through the model directly, using the training table's own features
    fp = get_predictor(str(s.models_dir))
    ref = fp.predict(df.drop(columns=["p_flood", "risk_level", "mode", "confidence"]), mode="auto", strict=False)
    df["p_flood_model"] = ref["p_flood"].to_numpy()
    both = df[["p_flood", "p_flood_model"]].dropna()
    gap = (both["p_flood"] - both["p_flood_model"]).abs()

    known = df[df["risk_level"] != "unknown"].dropna(subset=["flood"])
    y = known["flood"].astype(int).to_numpy()
    p = known["p_flood"].to_numpy()

    lat = np.array(latencies)
    summary = {
        "part": "system", "year": year, "days": len(days), "unit_days": len(df),
        "data_unavailable_days": len(unavailable),
        "floods_recorded": int(df["flood"].fillna(0).sum()),
        "coverage": round(1 - (df["risk_level"] == "unknown").mean(), 4),
        "low_confidence_share": round((df["confidence"] == "LOW").mean(), 4),
        "mode_share": df["mode"].fillna("none").value_counts(normalize=True).round(4).to_dict(),
        "risk_share": df["risk_level"].value_counts(normalize=True).round(4).to_dict(),
        "pr_auc": round(float(average_precision_score(y, p)), 4) if y.sum() else None,
        "prevalence": round(float(y.mean()), 4) if len(y) else None,
        "at_high": at_threshold(y, known["risk_level"].eq("high").to_numpy()),
        "at_medium_or_higher": at_threshold(y, known["risk_level"].isin(["medium", "high"]).to_numpy()),
        "consistency": {"rows_compared": int(len(both)), "max_abs_gap": round(float(gap.max()), 6) if len(gap) else None,
                        "rows_gap_over_0.001": int((gap > 1e-3).sum())},
        "latency_ms": {"p50": round(float(np.percentile(lat, 50)), 1), "p95": round(float(np.percentile(lat, 95)), 1),
                       "max": round(float(lat.max()), 1)},
        "note": "Agents ran on the deterministic policy; Qwen does not affect any number here.",
    }
    out = RESULTS_DIR / f"system_{year}.csv"
    df[["date", "cell_id", "risk_level", "p_flood", "p_flood_model", "mode", "confidence", "flood"]].to_csv(out, index=False)
    summary["rows_csv"] = _rel(out)
    return summary


# ================================================================================ agents
CAPS_WITH_TMA = {"resolve_area": {"available": True}, "get_weather_forecast": {"available": True},
                 "get_water_level": {"available": True}, "get_static_features": {"available": True}}
CAPS_NO_TMA = {**CAPS_WITH_TMA, "get_water_level": {"available": False, "note": "no live source"}}

AGENT2_CASES = [
    ("rain timeout, first try", Verdict("rain", "missing", "ReadTimeout", retryable=True), 1),
    ("rain still missing after retry", Verdict("rain", "missing", "ReadTimeout", retryable=True), 2),
    ("rain history incomplete (archive)", Verdict("rain", "incomplete", "3 of 30 points short", retryable=False), 1),
    ("water level stale, first try", Verdict("water_level", "stale", "latest reading is 5.2 h old", retryable=True), 1),
    ("water level stale after retry", Verdict("water_level", "stale", "latest reading is 5.4 h old", retryable=True), 2),
    ("water level source not configured", Verdict("water_level", "missing", "not configured", retryable=False), 1),
]

ADVICE_CASES = [
    AdviceFacts("Kampung Melayu", dt.date(2020, 2, 25), "high", "HIGH", 11.4, 740.0, today=dt.date(2020, 2, 25)),
    AdviceFacts("Cengkareng", dt.date(2020, 2, 25), "high", "LOW", 11.9, None, today=dt.date(2020, 2, 25)),
    AdviceFacts("Menteng", dt.date(2020, 1, 15), "medium", "HIGH", 4.2, 610.0, today=dt.date(2020, 1, 15)),
    AdviceFacts("Cilandak", dt.date(2020, 1, 15), "medium", "LOW", 3.8, None, today=dt.date(2020, 1, 15)),
    AdviceFacts("Kebayoran Baru", dt.date(2020, 8, 10), "low", "HIGH", 0.0, 120.0, today=dt.date(2020, 8, 10)),
    AdviceFacts("Tanjung Priok", dt.date(2020, 8, 10), "low", "LOW", 0.3, None, today=dt.date(2020, 8, 10)),
    AdviceFacts("Jatinegara", dt.date(2020, 2, 25), "unknown", "LOW", None, None, today=dt.date(2020, 2, 25)),
    # forecast for tomorrow (the live case from 2026-11-08): must say "besok" and "hujan ringan"
    AdviceFacts("Menteng", dt.date(2026, 11, 9), "medium", "LOW", 2.5, None, today=dt.date(2026, 11, 8)),
    AdviceFacts("Cipayung", dt.date(2020, 1, 1), "high", "HIGH", 120.0, 850.0, today=dt.date(2019, 12, 31)),
]


def run_agents(repeats: int) -> dict:
    s = Settings()
    llm = _llm(s)
    connected = isinstance(llm, QwenClient) and llm.ping()
    warm_ms = None
    if connected:
        print("  loading the model into memory (first time can take a minute) ...", flush=True)
        warm_ms = llm.warm_up()
    a1, a2, aw = DataFetchOrchestrator(llm), FailureHandler(llm), AdviceWriter(llm)

    rows, advice_rows = [], []

    def record(agent, case, d, policy_value):
        c = d.llm
        rows.append({"agent": agent, "case": case, "decided_by": d.decided_by,
                     "qwen_replied": bool(c and c.raw and c.raw.strip()), "parse_error": bool(c and c.raw and c.parsed is None),
                     "guardrail_errors": "; ".join(c.guardrail_errors) if c else "",
                     "agrees_with_policy": d.value == policy_value if policy_value is not None else None,
                     "latency_ms": c.elapsed_ms if c else 0, "raw": (c.raw or "")[:300] if c else "",
                     "llm_error": (c.error or "") if c else ""})
        print(f"    {agent:<18} {case:<36} -> {d.decided_by}"
              + (f" ({c.elapsed_ms} ms)" if c and c.elapsed_ms else "")
              + (f"  [{c.error[:60]}]" if c and c.error else ""), flush=True)

    for rep in range(repeats):
        for name, caps in (("water level available", CAPS_WITH_TMA), ("no water level", CAPS_NO_TMA)):
            d = a1.plan(["Menteng", "Gambir"], caps)
            policy = DataFetchOrchestrator(NoLLM()).plan(["Menteng", "Gambir"], caps).value
            record("agent1_data_fetch", name, d, policy)
        for name, v, attempts in AGENT2_CASES:
            d = a2.decide(v, attempts)
            allowed = FailureHandler.allowed(v, attempts)
            action, _ = FailureHandler.policy(v, allowed)
            record("agent2_failure", name, d, {"source": v.source, "action": action})
        for f in ADVICE_CASES:
            d = aw.write(f)
            record("advice_writer", f"{f.risk_level}/{f.confidence}/{f.day_label()[:8]}", d, None)
            advice_rows.append({"repeat": rep + 1, "kecamatan": f.area_name, "risk_level": f.risk_level,
                                "confidence": f.confidence, "decided_by": d.decided_by,
                                "recommendation": d.value["recommendation"],
                                "commuter_advisory": d.value["commuter_advisory"],
                                "guardrail_errors": "; ".join(d.llm.guardrail_errors) if d.llm else "",
                                "human_rating": "", "human_note": ""})
        print(f"  repeat {rep + 1}/{repeats} done", flush=True)

    df = pd.DataFrame(rows)
    per_agent = {}
    for agent, g in df.groupby("agent"):
        lat = g.loc[g["qwen_replied"], "latency_ms"]
        agree = g["agrees_with_policy"].dropna()
        per_agent[agent] = {
            "runs": int(len(g)),
            "qwen_used_rate": round(float((g["decided_by"] == "qwen").mean()), 4),
            "qwen_reply_rate": round(float(g["qwen_replied"].mean()), 4),
            "parse_error_rate": round(float(g["parse_error"].mean()), 4),
            "guardrail_reject_rate": round(float((g["guardrail_errors"] != "").mean()), 4),
            "agrees_with_policy": round(float(agree.astype(bool).mean()), 4) if len(agree) else None,
            "latency_ms_p50": round(float(lat.median()), 1) if len(lat) else None,
            "latency_ms_p95": round(float(np.percentile(lat, 95)), 1) if len(lat) else None,
        }
        top = g.loc[g["guardrail_errors"] != "", "guardrail_errors"].value_counts().head(3)
        per_agent[agent]["top_guardrail_errors"] = top.to_dict()

    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M")
    df.to_csv(RESULTS_DIR / f"agents_{stamp}.csv", index=False)
    adv = RESULTS_DIR / f"advice_to_rate_{stamp}.csv"
    pd.DataFrame(advice_rows).to_csv(adv, index=False, encoding="utf-8-sig")   # utf-8-sig opens cleanly in Excel
    return {
        "part": "agents", "llm": llm.name, "llm_base_url": s.llm_base_url if s.llm_enabled else None,
        "llm_connected": connected, "warm_up_ms": warm_ms, "prompt_version": prompts.PROMPT_VERSION, "repeats": repeats,
        "per_agent": per_agent,
        "files": {"decisions_csv": _rel(RESULTS_DIR / f"agents_{stamp}.csv"),
                  "advice_to_rate_csv": _rel(adv)},
        "note": None if connected else "Qwen not reachable: every decision used the policy. Start Ollama and rerun.",
    }


# ================================================================================ report
def to_markdown(results: list[dict]) -> str:
    lines = [f"# Pawang AI evaluation — {dt.datetime.now():%Y-%m-%d %H:%M}", ""]
    for r in results:
        if r["part"] == "system":
            h, m = r["at_high"], r["at_medium_or_higher"]
            lines += [
                f"## System, replay of {r['year']} ({r['days']} days, {r['unit_days']} kecamatan-days)", "",
                "| Metric | Value |", "|---|---|",
                f"| Floods recorded | {r['floods_recorded']} |",
                f"| PR-AUC (random = prevalence {r['prevalence']}) | {r['pr_auc']} |",
                f"| `high`: recall / precision / F1 | {h['recall']} / {h['precision']} / {h['f1']} |",
                f"| `medium or higher`: recall / precision / F1 | {m['recall']} / {m['precision']} / {m['f1']} |",
                f"| Coverage (not `unknown`) | {r['coverage']} |",
                f"| LOW confidence share | {r['low_confidence_share']} |",
                f"| Days with data unavailable | {r['data_unavailable_days']} |",
                f"| Backend vs model max gap (skew check) | {r['consistency']['max_abs_gap']} |",
                f"| Latency p50 / p95 (ms, no Qwen) | {r['latency_ms']['p50']} / {r['latency_ms']['p95']} |", "",
            ]
        else:
            lines += [f"## Agents ({r['llm']}, connected: {r['llm_connected']}, prompts {r['prompt_version']}, "
                      f"{r['repeats']} repeats)", ""]
            if r.get("note"):
                lines += [f"> {r['note']}", ""]
            lines += ["| Agent | Qwen used | Guardrail rejects | Parse errors | Agrees with policy | Latency p50 / p95 (ms) |",
                      "|---|---|---|---|---|---|"]
            for a, v in r["per_agent"].items():
                lines.append(f"| {a} | {v['qwen_used_rate']} | {v['guardrail_reject_rate']} | {v['parse_error_rate']} | "
                             f"{v['agrees_with_policy']} | {v['latency_ms_p50']} / {v['latency_ms_p95']} |")
            lines += ["", f"Rate the advice texts in `{r['files']['advice_to_rate_csv']}` (column `human_rating`, 1-5).", ""]
    return "\n".join(lines)


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("part", choices=["system", "agents", "all"])
    ap.add_argument("--year", type=int, default=2020)
    ap.add_argument("--limit-days", type=int, default=None, help="only the first N days (quick check)")
    ap.add_argument("--repeats", type=int, default=3, help="agent drills: runs per scenario (consistency)")
    args = ap.parse_args(argv)

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    results = []
    if args.part in ("system", "all"):
        print(f"System evaluation, {args.year} ...")
        results.append(run_system(args.year, args.limit_days))
    if args.part in ("agents", "all"):
        print("Agent drills ...")
        results.append(run_agents(args.repeats))

    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M")
    (RESULTS_DIR / f"summary_{stamp}.json").write_text(json.dumps(results, indent=2, default=str), encoding="utf-8")
    md = to_markdown(results)
    (RESULTS_DIR / f"report_{stamp}.md").write_text(md, encoding="utf-8")
    print("\n" + md)
    print(f"Saved to {_rel(RESULTS_DIR)}{os.sep}")


if __name__ == "__main__":
    main()
