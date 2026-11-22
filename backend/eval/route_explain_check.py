"""How often does the real Qwen word a route explanation that passes the guardrail?

    python -m eval.route_explain_check [--repeats 5]        (needs Ollama with the model from PAWANG/QWEN settings)

Builds one route plan per verdict (clear, safe, reduced, unavoidable) from a stub routing engine, asks Qwen to explain
each `--repeats` times, and counts how many answers pass `check_route_text`. A failure is not a bug: the rule text is
shown to the user instead. The pass rate tells whether the LLM adds anything over the rule text.
"""
from __future__ import annotations

import argparse
import sys
from collections import Counter
from types import SimpleNamespace

from app.config import Settings
from app.llm import QwenClient
from app.routing import ValhallaClient, Projector, RiskMap, Route, check_route_text, explain_route, plan_route, route_facts

O, D = (-6.200, 106.800), (-6.200, 106.900)
ZONE = [[106.840, -6.210], [106.860, -6.210], [106.860, -6.190], [106.840, -6.190], [106.840, -6.210]]
STRAIGHT = [(-6.200, 106.800), (-6.200, 106.850), (-6.200, 106.900)]
DETOUR = [(-6.200, 106.800), (-6.250, 106.850), (-6.200, 106.900)]
EDGE = [(-6.200, 106.800), (-6.192, 106.845), (-6.185, 106.860), (-6.200, 106.900)]    # still clips the zone


class StubEngine(ValhallaClient):
    """Returns canned routes: the straight road, or the detour once points are excluded (if `detour`)."""

    def __init__(self, detour: bool, partial: bool = False):
        self.detour, self.partial = detour, partial

    def routes(self, origin, dest, alternates=0, exclude=None):
        if exclude and self.detour:
            return [Route(EDGE if self.partial else DETOUR, 13.0 if self.partial else 14.0, 26.0 if self.partial else 30.0,
                          [("Jalan Pesisir", 13.0)])]
        return [Route(STRAIGHT, 11.0, 20.0, [("Jalan Raya Timur", 11.0)])]


def plans() -> dict:
    def risk(tier, flood=()):
        area = SimpleNamespace(area=SimpleNamespace(boundary=[ZONE], name="Zona Uji"), risk_level=tier)
        return RiskMap([area], list(flood), Projector(-6.2, 106.85))
    return {
        "clear": plan_route(StubEngine(False), risk("low"), O, D),
        "safe": plan_route(StubEngine(True), risk("high"), O, D),
        "reduced": plan_route(StubEngine(True, partial=True), risk("high"), O, D),
        "unavoidable": plan_route(StubEngine(False), risk("high"), O, D),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repeats", type=int, default=5)
    args = ap.parse_args()
    llm = QwenClient(Settings())
    if not llm.ping():
        print("Qwen is not reachable (is Ollama running?). Nothing was measured.")
        return 2
    total = Counter()
    for verdict, plan in plans().items():
        errors: Counter = Counter()
        passed = 0
        for _ in range(args.repeats):
            text, by, errs = explain_route(llm, plan)
            passed += by == "qwen"
            errors.update(e.split(":")[0] for e in errs)
        total["asked"] += args.repeats
        total["passed"] += passed
        print(f"{verdict:12s} (plan verdict {plan.verdict}): {passed}/{args.repeats} passed the guardrail"
              + (f"  violations: {dict(errors)}" if errors else ""))
    print(f"overall {total['passed']}/{total['asked']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
