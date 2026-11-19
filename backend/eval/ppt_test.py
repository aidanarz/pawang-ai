"""Run the presentation-focused Pawang AI test suite.

The report intentionally excludes data-quality checks. It combines existing model,
backend, agent, system, and performance checks into ASCII and JSON artifacts:

    python -m eval.ppt_test
    python -m eval.ppt_test --stress-requests 50 --agent-repeats 1
    python -m eval.ppt_test --skip-qwen --skip-performance
"""
from __future__ import annotations

import argparse
import contextlib
import datetime as dt
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import httpx

BACKEND_DIR = Path(__file__).resolve().parents[1]
ROOT_DIR = BACKEND_DIR.parent
MODEL_DIR = ROOT_DIR / "Pawang_Prediction_Model"
RESULTS_DIR = BACKEND_DIR / "eval" / "results"

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def run_command(name: str, args: list[str], cwd: Path, env: dict[str, str] | None = None,
                timeout: int = 300) -> dict:
    started = time.perf_counter()
    process = subprocess.run(
        args,
        cwd=cwd,
        env=env,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    return {
        "name": name,
        "returncode": process.returncode,
        "duration_s": round(time.perf_counter() - started, 2),
        "stdout": process.stdout[-4000:],
        "stderr": process.stderr[-2000:],
    }


def parse_counts(output: str) -> dict[str, int]:
    def count(label: str) -> int:
        match = re.search(rf"(\d+)\s+{label}", output)
        return int(match.group(1)) if match else 0

    return {
        "passed": count("passed"),
        "failed": count("failed"),
        "errors": count("errors?"),
    }


def run_unit_suites() -> dict:
    model = run_command(
        "prediction model pytest",
        [sys.executable, "-m", "pytest", "-q"],
        MODEL_DIR,
        timeout=300,
    )
    backend = run_command(
        "backend pytest",
        [sys.executable, "-m", "pytest", "-q"],
        BACKEND_DIR,
        timeout=300,
    )
    return {
        "model": {**model, "counts": parse_counts(model["stdout"])},
        "backend": {**backend, "counts": parse_counts(backend["stdout"])},
    }


def run_model_quality() -> dict:
    """Run the existing model report and retain only model/inference checks."""
    command = run_command(
        "model evaluation",
        [sys.executable, "tests/run_test_plan.py"],
        MODEL_DIR,
        timeout=300,
    )
    report_path = MODEL_DIR / "TEST_RESULTS.md"
    report = report_path.read_text(encoding="utf-8") if report_path.exists() else ""
    checks = {}
    for match in re.finditer(r"\|\s*(M[1-7]|I[1-5]|F[1-3]|G3b?)\s*\|.*?\|\s*(PASS|FAIL|INFO)\s*\|",
                             report):
        checks[match.group(1)] = match.group(2)
    selected = {key: value for key, value in checks.items() if key.startswith(("M", "I", "F", "G"))}
    return {
        "command": command,
        "checks": selected,
        "excluded": ["D1", "D2", "D2b", "D3", "D4"],
    }


def run_api_smoke() -> dict:
    from fastapi.testclient import TestClient

    from app.config import Settings
    from app.main import create_app

    with tempfile.TemporaryDirectory() as directory:
        temporary = Path(directory)
        settings = Settings(
            data_mode="replay",
            llm_enabled=False,
            audit_dir=temporary / "audit",
            tma_store_path=temporary / "tma.csv",
        )
        client = TestClient(create_app(settings), raise_server_exceptions=False)
        cases = [
            ("health", lambda: client.get("/api/v1/health"), {200}),
            ("heatmap", lambda: client.get("/api/v1/heatmap?time=5h"), {200}),
            ("analysis", lambda: client.get("/api/v1/analysis?grid_id=menteng&time=5h"), {200}),
            ("invalid horizon", lambda: client.get("/api/v1/heatmap?time=invalid"), {422}),
            ("missing analysis area", lambda: client.get("/api/v1/analysis"), {422}),
            ("unknown area", lambda: client.get("/api/v1/analysis?grid_id=not-a-area"), {404}),
            ("missing archive day", lambda: client.get("/api/v1/heatmap?date=2031-01-01"), {503}),
            ("impossible date", lambda: client.get("/api/v1/heatmap?date=2020-02-31"), {422}),
        ]
        results = []
        for name, request, expected in cases:
            response = request()
            results.append({
                "name": name,
                "status": response.status_code,
                "expected": sorted(expected),
                "passed": response.status_code in expected,
            })
    return {
        "total": len(results),
        "passed": sum(item["passed"] for item in results),
        "failed": sum(not item["passed"] for item in results),
        "cases": results,
    }


def run_guardrails() -> dict:
    environment = os.environ.copy()
    environment["QWEN_ENABLED"] = "false"
    command = run_command(
        "guardrail policy checks",
        [sys.executable, "-m", "eval.check_agents"],
        BACKEND_DIR,
        env=environment,
        timeout=120,
    )
    match = re.search(r"(\d+)/(\d+)\s+passed", command["stdout"])
    passed, total = (int(match.group(1)), int(match.group(2))) if match else (0, 0)
    return {**command, "passed": passed, "total": total, "pass_rate": passed / total if total else 0}


def run_system(year: int) -> dict:
    from app.audit import AuditLog
    from app.cache import TTLCache
    from app.config import Settings
    from app.llm import NoLLM
    from app.pipeline import Pipeline
    from app.tools import ToolRegistry
    from app.areas import get_catalog
    from eval.evaluate import run_system as evaluate_system

    # Calling the existing evaluator keeps the PPT numbers identical to TEST_REPORT.md.
    return evaluate_system(year, None)


def run_agent_comparison(repeats: int, include_qwen: bool) -> dict:
    from eval.evaluate import run_agents

    results = {}
    for label, enabled in (("without_qwen", False), ("with_qwen", True)):
        if label == "with_qwen" and not include_qwen:
            continue
        previous = os.environ.get("QWEN_ENABLED")
        os.environ["QWEN_ENABLED"] = "true" if enabled else "false"
        try:
            captured = io.StringIO()
            with contextlib.redirect_stdout(captured):
                result = run_agents(repeats)
            results[label] = result
        except Exception as error:  # report an unavailable provider, do not hide it
            results[label] = {"error": f"{type(error).__name__}: {error}"}
        finally:
            if previous is None:
                os.environ.pop("QWEN_ENABLED", None)
            else:
                os.environ["QWEN_ENABLED"] = previous
    return results


def run_performance(requests: int, llm_delay: float) -> dict:
    from eval import perf_test

    perf_test.out.clear()
    captured = io.StringIO()
    with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stdout(captured):
        temporary = Path(directory)
        perf_test.part_a(temporary)
        perf_test.part_b(temporary)
        perf_test.part_c(temporary, requests)
        perf_test.part_d(temporary, llm_delay)
    return dict(perf_test.out)


def bar(value: float, maximum: float = 1.0, width: int = 30) -> str:
    if maximum <= 0:
        return ""
    return "#" * min(width, round(max(0.0, value / maximum) * width))


def render_ascii(report: dict) -> str:
    lines = [
        "PAWANG AI PRESENTATION TEST REPORT",
        "=" * 36,
        f"Generated: {report['generated_at']}",
        "Scope: model quality, API, guardrail, end-to-end, performance, stress",
        "Excluded: data quality",
        "",
        "[1] TEST SUITE",
    ]
    for label, value in report["unit_suites"].items():
        counts = value["counts"]
        total = counts["passed"] + counts["failed"] + counts["errors"]
        rate = counts["passed"] / total if total else 0
        lines.append(f"{label:18} {counts['passed']:>3}/{total:<3} pass | {rate:>6.1%} {bar(rate)}")

    api = report["api"]
    lines += [
        "",
        "[2] API CONTRACT",
        f"pass rate          {api['passed']}/{api['total']} | {api['passed'] / api['total']:.1%} "
        f"{bar(api['passed'] / api['total'])}",
    ]
    for case in api["cases"]:
        status = "PASS" if case["passed"] else "FAIL"
        lines.append(f"{status:4} {case['name']}: got {case['status']}, expected {case['expected']}")

    guardrails = report["guardrails"]
    lines += [
        "",
        "[3] GUARDRAIL",
        f"policy checks       {guardrails['passed']}/{guardrails['total']} | "
        f"{guardrails['pass_rate']:.1%} {bar(guardrails['pass_rate'])}",
    ]

    system = report["system"]
    lines += [
        "",
        "[4] END-TO-END MODEL",
        f"coverage            {system['coverage']:.1%} {bar(system['coverage'])}",
        f"train/serve gap     {system['consistency']['max_abs_gap']}",
        f"PR-AUC              {system['pr_auc']}",
        f"high recall         {system['at_high']['recall']:.1%}",
        f"high precision      {system['at_high']['precision']:.1%}",
        f"latency p50/p95     {system['latency_ms']['p50']} / {system['latency_ms']['p95']} ms",
    ]

    lines += ["", "[5] QWEN COMPARISON"]
    for label, result in report["agents"].items():
        if "error" in result:
            lines.append(f"{label:18} ERROR: {result['error']}")
            continue
        connected = "connected" if result.get("llm_connected") else "not reachable / policy fallback"
        lines.append(f"{label:18} {connected}")
        for agent, metrics in result.get("per_agent", {}).items():
            lines.append(
                f"  {agent:16} p50/p95={metrics['latency_ms_p50']}/{metrics['latency_ms_p95']} ms | "
                f"guardrail reject={metrics['guardrail_reject_rate']:.1%} | "
                f"policy agree={metrics['agrees_with_policy']}"
            )

    stress = report["performance"].get("C_stress", {})
    lines += ["", "[6] STRESS / PERFORMANCE"]
    for key, value in stress.items():
        lines.append(
            f"{key:24} errors={value['errors']} | rps={value['rps']} | "
            f"p95={value['p95']} ms | p99={value['p99']} ms"
        )
    slow = report["performance"].get("D", {})
    if slow:
        lines.append(f"slow LLM delay        {slow['llm_delay_s']} s (fake provider)")
    lines += [
        "",
        "Legend: p50/p95/p99 = latency percentiles; lower latency is better.",
        "Note: Qwen results are only comparable when the real provider is reachable.",
    ]
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--year", type=int, default=2020)
    parser.add_argument("--agent-repeats", type=int, default=1)
    parser.add_argument("--stress-requests", type=int, default=50)
    parser.add_argument("--llm-delay", type=float, default=3.0)
    parser.add_argument("--skip-qwen", action="store_true")
    parser.add_argument("--skip-performance", action="store_true")
    args = parser.parse_args(argv)

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    report = {
        "generated_at": dt.datetime.now().isoformat(timespec="seconds"),
        "unit_suites": run_unit_suites(),
        "model_quality": run_model_quality(),
        "api": run_api_smoke(),
        "guardrails": run_guardrails(),
        "system": run_system(args.year),
        "agents": run_agent_comparison(args.agent_repeats, not args.skip_qwen),
    }
    report["performance"] = (
        {} if args.skip_performance else run_performance(args.stress_requests, args.llm_delay)
    )

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    json_path = RESULTS_DIR / f"ppt_test_{stamp}.json"
    text_path = RESULTS_DIR / f"ppt_test_{stamp}.txt"
    json_path.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    text_path.write_text(render_ascii(report), encoding="utf-8")
    print(render_ascii(report))
    print(f"JSON: {json_path.relative_to(BACKEND_DIR)}")
    print(f"ASCII: {text_path.relative_to(BACKEND_DIR)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
