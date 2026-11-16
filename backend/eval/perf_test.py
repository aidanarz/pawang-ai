"""Speed and stress test of the backend. Prints markdown tables and saves eval/results/perf_<time>.json.

    py -m eval.perf_test                 # about 2-3 minutes
    py -m eval.perf_test --requests 100  # lighter

No internet and no real Qwen needed:
  A  component timings, in process (start-up, cold pipeline run for all 44 kecamatan)
  B  live mode with a mocked Open-Meteo that answers slowly or fails once (in process)
  C  a real server (uvicorn subprocess, replay data) hit over HTTP: latency cold vs cached, then
     concurrency stress at 1 / 10 / 50 / 100 clients, cached and uncached
  D  slow LLM: a fake Ollama answers after a delay; shows what a slow LLM does to the other endpoints

All numbers are from this machine at this moment; run it twice before trusting a small difference.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import statistics
import subprocess
import sys
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import httpx
import numpy as np
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402

RESULTS_DIR = BACKEND_DIR / "eval" / "results"
PORT, FAKE_LLM_PORT = 8012, 11999
BASE = f"http://127.0.0.1:{PORT}"
WIB = dt.timezone(dt.timedelta(hours=7))
out: dict = {}


def stats(ms: list[float]) -> dict:
    a = np.array(ms)
    return {"p50": round(float(np.percentile(a, 50)), 1), "p95": round(float(np.percentile(a, 95)), 1),
            "p99": round(float(np.percentile(a, 99)), 1), "max": round(float(a.max()), 1)}


def table(title: str, header: list[str], rows: list[list]) -> None:
    print(f"\n### {title}\n")
    print("| " + " | ".join(header) + " |\n|" + "---|" * len(header))
    for r in rows:
        print("| " + " | ".join(str(x) for x in r) + " |")
    sys.stdout.flush()


# ------------------------------------------------------------------------------------------ A, B (in process)
def part_a(tmp: Path) -> None:
    s = Settings(data_mode="replay", llm_enabled=False, audit_dir=tmp / "a", tma_store_path=tmp / "a.csv")
    t0 = time.perf_counter()
    app = create_app(s)
    start_ms = (time.perf_counter() - t0) * 1000
    pipe = app.state.pipeline
    days = [dt.date(2020, 2, 25) - dt.timedelta(days=i) for i in range(10)]
    cold = []
    for d in days:
        t0 = time.perf_counter()
        pipe.run(d)
        cold.append((time.perf_counter() - t0) * 1000)
    warm = []
    for d in days:
        t0 = time.perf_counter()
        pipe.run(d)
        warm.append((time.perf_counter() - t0) * 1000)
    out["A"] = {"create_app_ms": round(start_ms), "cold": stats(cold), "cached": stats(warm)}
    table("A. Component timings (in process, replay, all 44 kecamatan, 10 different days)",
          ["Step", "p50 ms", "p95 ms", "max ms"],
          [["create_app (catalogue + model + clients; model already loaded by import)", round(start_ms), "", ""],
           ["pipeline.run, cache miss", *[out["A"]["cold"][k] for k in ("p50", "p95", "max")]],
           ["pipeline.run, cache hit", *[out["A"]["cached"][k] for k in ("p50", "p95", "max")]]])


def mocked_open_meteo(delay_s: float, fail_first: int = 0) -> httpx.Client:
    n = {"calls": 0}
    today = dt.datetime.now(WIB).date()
    times = [(today + dt.timedelta(days=i)).isoformat() for i in range(-40, 3)]

    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.host == "bpbd.jakarta.go.id":
            return httpx.Response(503, text="down")
        n["calls"] += 1
        time.sleep(delay_s)
        if n["calls"] <= fail_first:
            return httpx.Response(500, json={"error": True})
        k = len(req.url.params["latitude"].split(","))
        body = [{"daily": {"time": times, "precipitation_sum": [5.0] * len(times)}} for _ in range(k)]
        return httpx.Response(200, json=body if k > 1 else body[0])
    return httpx.Client(transport=httpx.MockTransport(handler))


def part_b(tmp: Path) -> None:
    rows, res = [], []
    for label, delay, fail in (("Open-Meteo answers at once", 0.0, 0), ("Open-Meteo takes 0.5 s", 0.5, 0),
                               ("Open-Meteo takes 2 s", 2.0, 0), ("first call fails (retry), 0.5 s each", 0.5, 1)):
        s = Settings(data_mode="live", llm_enabled=False, audit_dir=tmp / "b", tma_store_path=tmp / "b.csv")
        c = TestClient(create_app(s, http=mocked_open_meteo(delay, fail)))
        ms = []
        for i in range(3):                       # the first call is a miss; calls 2 and 3 are cache hits
            t0 = time.perf_counter()
            r = c.get("/api/v1/heatmap", params={"time": "1h"})
            ms.append((time.perf_counter() - t0) * 1000)
            assert r.status_code == 200, r.text
        res.append({"case": label, "first_ms": round(ms[0]), "cached_ms": round(statistics.median(ms[1:]), 1)})
        rows.append([label, round(ms[0]), round(statistics.median(ms[1:]), 1)])
    out["B"] = res
    table("B. Live mode with a mocked Open-Meteo (in process, heatmap for all 44, no LLM)",
          ["Circumstance", "First request ms (miss)", "Next request ms (cache hit)"], rows)


# ------------------------------------------------------------------------------------------ C, D (real server)
class FakeOllama(BaseHTTPRequestHandler):
    delay = 3.0

    def do_GET(self):
        self._send(b"{}")

    def do_POST(self):
        self.rfile.read(int(self.headers.get("Content-Length", 0)))
        time.sleep(FakeOllama.delay)
        self._send(json.dumps({"message": {"content": json.dumps({"action": "retry"})}}).encode())

    def _send(self, body: bytes):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


def start_server(tmp: Path, llm: bool) -> subprocess.Popen:
    env = {**os.environ, "PAWANG_DATA_MODE": "replay", "PAWANG_AUDIT_DIR": str(tmp / "srv"),
           "PAWANG_TMA_STORE": str(tmp / "srv.csv"), "QWEN_ENABLED": "true" if llm else "false",
           "QWEN_BASE_URL": f"http://127.0.0.1:{FAKE_LLM_PORT}/v1", "QWEN_API_STYLE": "ollama"}
    p = subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app", "--port", str(PORT), "--log-level", "warning"],
                         cwd=BACKEND_DIR, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(60):
        try:
            if httpx.get(f"{BASE}/api/v1/health", timeout=2).status_code == 200:
                return p
        except httpx.HTTPError:
            time.sleep(1)
    p.kill()
    raise RuntimeError("server did not start")


def stop_server(p: subprocess.Popen) -> None:
    p.terminate()
    try:
        p.wait(10)
    except subprocess.TimeoutExpired:
        p.kill()


def load(urls: list[str], concurrency: int, timeout: float = 120.0) -> dict:
    """GET every url with `concurrency` clients at once. Error = any answer other than 200, or no answer."""
    limits = httpx.Limits(max_connections=concurrency + 5, max_keepalive_connections=concurrency + 5)
    errors, lat = 0, []
    with httpx.Client(limits=limits, timeout=timeout) as client:
        def one(u: str):
            t0 = time.perf_counter()
            try:
                ok = client.get(u).status_code == 200
            except httpx.HTTPError:
                ok = False
            return ok, (time.perf_counter() - t0) * 1000
        t0 = time.perf_counter()
        with ThreadPoolExecutor(concurrency) as ex:
            for ok, ms in ex.map(one, urls):
                lat.append(ms)
                errors += not ok
        wall = time.perf_counter() - t0
    return {"n": len(urls), "errors": errors, "rps": round(len(urls) / wall, 1), **stats(lat)}


class Days:
    """Hands out a new replay day every time, so a request never hits an older cache entry."""
    def __init__(self):
        r = httpx.get(f"{BASE}/api/v1/health").json()["replay_dates"]
        self.d, self.hi = dt.date.fromisoformat(r["min"]), dt.date.fromisoformat(r["max"])
        self.n = (self.hi - self.d).days

    def take(self, k: int) -> list[str]:
        assert k <= self.n, "not enough archive days for this many uncached requests"
        days = [(self.d + dt.timedelta(days=i)).isoformat() for i in range(k)]
        self.d += dt.timedelta(days=k)
        self.n -= k
        return days


def part_c(tmp: Path, n: int) -> None:
    srv = start_server(tmp, llm=False)
    try:
        days = Days()
        hot = "2020-02-25"
        httpx.get(f"{BASE}/api/v1/heatmap", params={"date": hot}, timeout=60)
        httpx.get(f"{BASE}/api/v1/analysis", params={"grid_id": "menteng", "date": hot}, timeout=60)
        k = 30
        rows = []
        for label, mk in (
            ("heatmap, cache miss (new day each time)", lambda d: f"{BASE}/api/v1/heatmap?date={d}"),
            ("heatmap, cache hit", lambda d: f"{BASE}/api/v1/heatmap?date={hot}"),
            ("analysis, cache miss (new day each time)", lambda d: f"{BASE}/api/v1/analysis?grid_id=menteng&date={d}"),
            ("analysis, cache hit", lambda d: f"{BASE}/api/v1/analysis?grid_id=menteng&date={hot}"),
            ("health", lambda d: f"{BASE}/api/v1/health"),
        ):
            r = load([mk(d) for d in days.take(k)], 1)
            rows.append([label, r["p50"], r["p95"], r["max"]])
        out["C_latency"] = rows
        table(f"C1. One client, {k} sequential requests per row (real server, replay, no LLM), ms",
              ["Endpoint", "p50", "p95", "max"], rows)

        stress, rows = {}, []
        for conc in (1, 10, 50, 100):
            r = load([f"{BASE}/api/v1/heatmap?date={hot}"] * n, conc)
            stress[f"hit_{conc}"] = r
            rows.append([f"heatmap cache hit, {conc} clients", n, r["errors"], r["rps"], r["p50"], r["p95"], r["p99"], r["max"]])
        for conc in (10, 50):
            r = load([f"{BASE}/api/v1/heatmap?date={d}" for d in days.take(min(n, 100))], conc)
            stress[f"miss_{conc}"] = r
            rows.append([f"heatmap cache MISS (new day each), {conc} clients", r["n"], r["errors"], r["rps"], r["p50"], r["p95"], r["p99"], r["max"]])
        r = load([f"{BASE}/api/v1/analysis?grid_id=menteng&date={hot}"] * n, 50)
        stress["analysis_hit_50"] = r
        rows.append(["analysis cache hit, 50 clients", n, r["errors"], r["rps"], r["p50"], r["p95"], r["p99"], r["max"]])
        # spike: the same uncached day from 50 clients at once (does the server do the work 50 times?)
        spike_day = days.take(1)[0]
        r = load([f"{BASE}/api/v1/heatmap?date={spike_day}"] * 50, 50)
        stress["spike_same_miss_50"] = r
        rows.append(["50 clients at once, SAME uncached day", 50, r["errors"], r["rps"], r["p50"], r["p95"], r["p99"], r["max"]])
        out["C_stress"] = stress
        table("C2. Stress: concurrent clients (real server, replay, no LLM)",
              ["Scenario", "Requests", "Errors", "Req/s", "p50 ms", "p95 ms", "p99 ms", "max ms"], rows)
    finally:
        stop_server(srv)


def part_d(tmp: Path, delay: float) -> None:
    FakeOllama.delay = delay
    fake = ThreadingHTTPServer(("127.0.0.1", FAKE_LLM_PORT), FakeOllama)
    threading.Thread(target=fake.serve_forever, daemon=True).start()
    srv = start_server(tmp, llm=True)
    try:
        hot = "2020-02-25"
        heat = f"{BASE}/api/v1/heatmap?date={hot}"
        ana = f"{BASE}/api/v1/analysis?grid_id=menteng&date={hot}"
        load([heat], 1)                                    # warm the pipeline cache (includes its LLM calls)
        load([ana], 1)
        rows = []
        base = load([heat] * 10, 1)
        one = load([ana], 1)
        rows.append(["heatmap cache hit, LLM idle", "-", base["p50"], base["max"], 0])
        rows.append([f"analysis cache hit, 1 client (LLM takes {delay:g} s)", "-", one["p50"], one["max"], one["errors"]])
        res = {}
        for users in (10, 40, 80):
            bg = ThreadPoolExecutor(1)
            fut = bg.submit(load, [ana] * users, users)    # `users` people reading analysis at the same time
            time.sleep(delay / 3)
            probe = load([heat] * 5, 1)                    # a map reload while they wait; needs no LLM
            r = fut.result()
            bg.shutdown()
            res[users] = {"analysis": r, "heatmap_probe": probe}
            rows.append([f"analysis x{users} at once", users, r["p50"], r["max"], r["errors"]])
            rows.append([f"  heatmap reload during that (needs no LLM)", users, probe["p50"], probe["max"], probe["errors"]])
        out["D"] = {"llm_delay_s": delay, "rows": rows, "detail": res}
        table(f"D. Slow LLM: fake Ollama answers after {delay:g} s (real server, FastAPI worker pool = 40 threads)",
              ["Scenario", "Clients", "p50 ms", "max ms", "Errors"], rows)
    finally:
        stop_server(srv)
        fake.shutdown()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--requests", type=int, default=200, help="requests per stress row (default 200)")
    ap.add_argument("--llm-delay", type=float, default=3.0, help="seconds the fake LLM takes (default 3)")
    a = ap.parse_args()
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    out["machine"] = {"cpus": os.cpu_count(), "python": sys.version.split()[0],
                      "started": dt.datetime.now().isoformat(timespec="seconds")}
    print(f"Performance test, {out['machine']}")
    with tempfile.TemporaryDirectory() as t:
        tmp = Path(t)
        part_a(tmp)
        part_b(tmp)
        part_c(tmp, a.requests)
        part_d(tmp, a.llm_delay)
    f = RESULTS_DIR / f"perf_{dt.datetime.now():%Y%m%d-%H%M}.json"
    f.write_text(json.dumps(out, indent=2, default=str), encoding="utf-8")
    print(f"\nsaved {f.relative_to(BACKEND_DIR)}")


if __name__ == "__main__":
    main()
