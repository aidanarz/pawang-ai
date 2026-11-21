"""Flood Watch Agent: proactive early warning (design: "Agent plan and changes", section 2.1).

One cycle:
  1. run the prediction pipeline for the target day (all 44 kecamatan)
  2. RULES compare it with memory: did a tier rise, a BPBD siaga rise, citizen flood reports pile up?
     Nothing changed -> stop here, the LLM is not called.
  3. The LLM investigates the changed areas with READ-ONLY tools (at most `max_steps` calls), then proposes warnings.
  4. RULES validate the proposal: schema, only areas the trigger flagged, level never above what the model (or the
     citizen reports) supports, numbers only from tool results, no certainty or source claims, cooldown.
  5. Approved warnings are published to the warning feed; the decision and its trace go to memory and the audit log.
  If the LLM is unavailable or its proposal is rejected, the default rule action runs instead.

The LLM never computes a probability, never writes to memory, and never calls a tool itself: it asks, the code runs
the tool. Citizen comments reach the LLM only as quoted data.
"""
from __future__ import annotations

import datetime as dt
import json
import logging
import threading
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from .guardrails import _NUM, _norm_num, check_source_claims, check_text, RISK_WORDS_ID
from .llm import LLM, LLMCall
from .pipeline import AreaResult, Pipeline
from .prompts import FLOOD_WATCH_PROMPT_VERSION, FLOOD_WATCH_SYSTEM
from .waterlevel import SIAGA_RANK, WIB

log = logging.getLogger("pawang.floodwatch")

LEVELS = ("none", "waspada", "siaga", "awas")
LEVEL_RANK = {lvl: i for i, lvl in enumerate(LEVELS)}
TIER_RANK = {"unknown": 0, "low": 1, "medium": 2, "medium_high": 3, "high": 4}
# Highest warning level each model tier supports (guardrail cap) ...
TIER_CAP = {"unknown": "none", "low": "none", "medium": "waspada", "medium_high": "siaga", "high": "awas"}
# ... and the level the default rule action uses: only areas that rise to HIGH get a warning (one step below the
# cap, so the LLM may raise it with evidence, and may also choose to warn a medium_high area). Chosen on the 2019
# validation replay (Jan-Mar): against "alert every high area-day" it sent 139 instead of 397 alerts and covered
# 41% instead of 29% of flooded area-days, at a lower precision (4.2% vs 7.3%) because warnings stay active longer.
TIER_DEFAULT = {"high": "siaga"}
TOOLS = ("get_area_status", "get_area_history", "get_reports", "get_city_overview")
MAX_WARNINGS_PER_CYCLE = 8
MAX_MESSAGE_CHARS = 300
FLOOD_CONDITIONS = ("banjir", "genangan_rendah")


@dataclass
class Change:
    grid_id: str
    area: str
    kinds: list[str]
    tier: str
    prev_tier: str | None


@dataclass
class Warning:
    id: str
    grid_id: str
    area: str
    level: str
    message: str
    target_date: str
    created_at: str
    decided_by: str            # qwen | rules
    tier: str = ""             # model tier when the warning was issued (it is lifted when the tier falls below it)


# ---- memory ----------------------------------------------------------------------------------------------------
class WatchMemory:
    """Last state per area, warning history and recent decisions. A JSON file (None = in memory only, for tests and
    replays). Only the agent's code writes here; the LLM reads it through get_area_history."""

    def __init__(self, path: Path | None = None, keep_decisions: int = 200):
        self.path, self.keep = path, keep_decisions
        self._lock = threading.Lock()
        self.data: dict = {"areas": {}, "warnings": [], "decisions": [], "active": {}}
        if path and path.exists():
            try:
                self.data = {**self.data, **json.loads(path.read_text(encoding="utf-8"))}
            except (OSError, ValueError) as exc:
                log.warning("flood watch memory unreadable, starting empty: %s", exc)

    def area(self, grid_id: str) -> dict | None:
        return self.data["areas"].get(grid_id)

    def warnings_for(self, grid_id: str) -> list[dict]:
        return [w for w in self.data["warnings"] if w["grid_id"] == grid_id]

    def recent_warning(self, grid_id: str, now: dt.datetime, within_h: float) -> dict | None:
        cutoff = (now - dt.timedelta(hours=within_h)).isoformat()
        recent = [w for w in self.warnings_for(grid_id) if w["created_at"] >= cutoff]
        return max(recent, key=lambda w: LEVEL_RANK[w["level"]]) if recent else None

    def update(self, areas: list[AreaResult], now: dt.datetime, window_h: float = 48.0) -> None:
        """Store the latest tier and siaga, plus the tiers seen within `window_h` (the trigger compares a new tier
        with the PEAK of this window, so a tier that drops for a day and comes back does not warn again)."""
        cutoff = (now - dt.timedelta(hours=window_h)).isoformat()
        with self._lock:
            for a in areas:
                old = self.data["areas"].get(a.area.grid_id, {})
                recent = [x for x in old.get("recent", []) if x[0] >= cutoff] + [[now.isoformat(), a.risk_level]]
                self.data["areas"][a.area.grid_id] = {"tier": a.risk_level, "siaga": a.siaga_level,
                                                      "updated": now.isoformat(), "recent": recent}

    def peak_tier(self, grid_id: str, now: dt.datetime, window_h: float = 48.0) -> str | None:
        cutoff = (now - dt.timedelta(hours=window_h)).isoformat()
        tiers = [t for ts, t in (self.area(grid_id) or {}).get("recent", []) if ts >= cutoff]
        return max(tiers, key=lambda t: TIER_RANK.get(t, 0)) if tiers else None

    def add_warning(self, w: Warning) -> None:
        with self._lock:
            self.data["warnings"] = (self.data["warnings"] + [w.__dict__])[-500:]
            self.data["active"][w.grid_id] = {"level": w.level, "warning_id": w.id, "since": w.created_at,
                                              "message": w.message, "area": w.area, "tier": w.tier}

    def active(self) -> dict[str, dict]:
        return self.data.setdefault("active", {})

    def clear(self, grid_id: str) -> dict | None:
        with self._lock:
            return self.active().pop(grid_id, None)

    def add_decision(self, d: dict) -> None:
        with self._lock:
            self.data["decisions"] = (self.data["decisions"] + [d])[-self.keep:]
        self._save()

    def _save(self) -> None:
        if not self.path:
            return
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps(self.data, ensure_ascii=False, default=str), encoding="utf-8")
            tmp.replace(self.path)
        except OSError as exc:       # a full disk must not stop the warnings
            log.warning("flood watch memory write failed: %s", exc)


# ---- rule trigger --------------------------------------------------------------------------------------------
def detect_changes(areas: list[AreaResult], memory: WatchMemory, reports: dict[str, list[dict]],
                   now: dt.datetime, min_reports: int = 2, window_h: float = 48.0) -> list[Change]:
    """Rules only. An area counts as changed when its tier rose into medium_high/high above the peak of the last
    `window_h` hours (or it is first seen there), its BPBD siaga level rose, or at least `min_reports` active
    citizen reports say genangan/banjir."""
    out = []
    for a in areas:
        prev = memory.area(a.area.grid_id)
        kinds = []
        prev_tier = prev["tier"] if prev else None
        peak = memory.peak_tier(a.area.grid_id, now, window_h)
        if a.risk_level in ("medium_high", "high") and (peak is None or
                                                       TIER_RANK[a.risk_level] > TIER_RANK.get(peak, 0)):
            kinds.append("tier_up" if prev_tier else "first_seen_high")
        if a.siaga_level and SIAGA_RANK.get(a.siaga_level, 0) > SIAGA_RANK.get((prev or {}).get("siaga"), 0):
            kinds.append("siaga_up")
        flood_reports = [r for r in reports.get(a.area.grid_id, []) if r.get("condition") in FLOOD_CONDITIONS]
        if len(flood_reports) >= min_reports:
            kinds.append("citizen_reports")
        if kinds:
            out.append(Change(a.area.grid_id, a.area.name, kinds, a.risk_level, prev_tier))
    return out


def report_cap(reports: list[dict]) -> str:
    """Citizen reports alone may justify a warning, but never above siaga."""
    banjir = sum(r.get("condition") == "banjir" for r in reports)
    genangan = sum(r.get("condition") == "genangan_rendah" for r in reports)
    if banjir >= 2:
        return "siaga"
    return "waspada" if banjir + genangan >= 2 else "none"


def level_cap(tier: str, reports: list[dict]) -> str:
    return max(TIER_CAP.get(tier, "none"), report_cap(reports), key=LEVEL_RANK.get)


# ---- the agent -----------------------------------------------------------------------------------------------
class FloodWatch:
    def __init__(self, pipeline: Pipeline, llm: LLM, memory: WatchMemory,
                 reports: Callable[[], list[dict]] | None = None, cooldown_h: float = 6.0, max_steps: int = 4,
                 lift_below: str = "medium_high"):
        self.pipeline, self.llm, self.memory = pipeline, llm, memory
        self.reports = reports or (lambda: [])
        self.cooldown_h, self.max_steps = cooldown_h, max_steps
        # "medium_high": an active warning is lifted once the tier falls below medium_high;
        # "issued": once it falls below the tier the warning was issued for.
        self.lift_below = lift_below

    # -- one cycle --
    def cycle(self, target_date: dt.date, now: dt.datetime | None = None) -> dict:
        now = now or dt.datetime.now(WIB)
        cid = uuid.uuid4().hex[:12]
        decision: dict = {"cycle_id": cid, "target_date": target_date.isoformat(), "at": now.isoformat(),
                          "prompt_version": FLOOD_WATCH_PROMPT_VERSION, "triggered": False, "changes": [],
                          "steps": [], "proposal": None, "guardrail_errors": [], "suppressed": [],
                          "published": [], "decided_by": "rules"}
        res = self.pipeline.run(target_date)
        if res.status != "ok":
            decision["steps"].append({"step": "pipeline", "status": res.status, "message": res.message})
            decision["note"] = "prediction unavailable: no warning decided, previous state kept"
            self.memory.add_decision(decision)
            return decision

        by_grid = {a.area.grid_id: a for a in res.areas}
        reports_by_area: dict[str, list[dict]] = {}
        for r in self.reports():
            reports_by_area.setdefault(r.get("grid_id"), []).append(r)

        # A warning stays active while the risk stays at the tier it was issued for; it is lifted (rules) once the
        # tier falls below that and no citizen flood reports support it. Active warnings are not re-sent every day.
        decision["cleared"] = []
        for g in list(self.memory.active()):
            a = by_grid.get(g)
            floor = (self.memory.active()[g].get("tier") or "medium_high") if self.lift_below == "issued" \
                else "medium_high"
            if (a and TIER_RANK.get(a.risk_level, 0) < TIER_RANK.get(floor, 0)
                    and report_cap(reports_by_area.get(g, [])) == "none"):
                self.memory.clear(g)
                decision["cleared"].append(g)

        changes = detect_changes(res.areas, self.memory, reports_by_area, now)
        decision["changes"] = [c.__dict__ for c in changes]
        if not changes:
            self.memory.update(res.areas, now)
            decision["active"] = {g: v["level"] for g, v in self.memory.active().items()}
            self.memory.add_decision(decision)
            return decision          # nothing changed: the LLM is not called
        decision["triggered"] = True

        ctx = _Context(target_date, now, by_grid, reports_by_area, self.memory, changes)
        proposal, _ = self._ask_llm(ctx, decision)
        accepted: list[dict] = []
        if proposal is not None:
            accepted, errs = validate_proposal(proposal, ctx)
            decision["proposal"] = proposal
            decision["guardrail_errors"] = errs
            if errs:
                accepted = []
            else:
                decision["decided_by"] = "qwen"
        if decision["decided_by"] == "rules":
            accepted = default_action(ctx)

        for w in accepted:
            act = self.memory.active().get(w["grid_id"])
            if act and LEVEL_RANK[act["level"]] >= LEVEL_RANK[w["level"]]:
                decision["suppressed"].append({**w, "reason": f"a '{act['level']}' warning is already active"})
                continue
            prev = self.memory.recent_warning(w["grid_id"], now, self.cooldown_h)
            if prev and LEVEL_RANK[prev["level"]] >= LEVEL_RANK[w["level"]]:
                decision["suppressed"].append({**w, "reason": f"same or higher warning sent at {prev['created_at']}"})
                continue
            warning = Warning(id=uuid.uuid4().hex[:10], grid_id=w["grid_id"], area=by_grid[w["grid_id"]].area.name,
                              level=w["level"], message=w["message"], target_date=target_date.isoformat(),
                              created_at=now.isoformat(), decided_by=decision["decided_by"],
                              tier=by_grid[w["grid_id"]].risk_level)
            self.memory.add_warning(warning)
            decision["published"].append(warning.__dict__)

        self.memory.update(res.areas, now)
        decision["active"] = {g: v["level"] for g, v in self.memory.active().items()}
        self.memory.add_decision(decision)
        self.pipeline.audit.write(cid, {"step": "flood_watch", **decision})
        return decision

    # -- LLM loop: ask for tools, run them, until a proposal (or the step limit) --
    def _ask_llm(self, ctx: "_Context", decision: dict) -> tuple[dict | None, list[LLMCall]]:
        calls: list[LLMCall] = []
        if not self.llm.available():
            decision["steps"].append({"step": "llm", "error": "llm unavailable, default rule action"})
            return None, calls
        observations: list[dict] = []
        for step in range(self.max_steps + 1):
            user = json.dumps({"tanggal": ctx.target_date.isoformat(),
                               "perubahan": [{"grid_id": c.grid_id, "kecamatan": c.area, "jenis": c.kinds,
                                              "tingkat_risiko": RISK_WORDS_ID.get(c.tier, c.tier),
                                              "tingkat_sebelumnya": RISK_WORDS_ID.get(c.prev_tier, c.prev_tier)}
                                             for c in ctx.changes],
                               "peringatan_aktif": {g: v["level"] for g, v in ctx.memory.active().items()
                                                    if g in ctx.changed},
                               "hasil_tool": observations,
                               "sisa_panggilan_tool": self.max_steps - step}, ensure_ascii=False)
            call = self.llm.complete_json("flood_watch", FLOOD_WATCH_SYSTEM, user)
            calls.append(call)
            reply = call.parsed
            if call.error or not isinstance(reply, dict):
                decision["steps"].append({"step": "llm", "error": call.error or "reply is not an object",
                                          "elapsed_ms": call.elapsed_ms})
                return None, calls
            action = reply.get("action")
            if action == "propose":
                decision["steps"].append({"step": "llm", "action": "propose", "elapsed_ms": call.elapsed_ms})
                return reply, calls
            if action == "call_tool" and step < self.max_steps:
                tool, grid = reply.get("tool"), reply.get("grid_id")
                result = ctx.run_tool(tool, grid)
                observations.append({"tool": tool, "grid_id": grid, "hasil": result})
                decision["steps"].append({"step": "tool", "tool": tool, "grid_id": grid, "result": result,
                                          "elapsed_ms": call.elapsed_ms})
                continue
            decision["steps"].append({"step": "llm", "error": f"unexpected action '{action}' at step {step}"})
            return None, calls
        return None, calls


@dataclass
class _Context:
    target_date: dt.date
    now: dt.datetime
    by_grid: dict[str, AreaResult]
    reports: dict[str, list[dict]]
    memory: WatchMemory
    changes: list[Change]
    numbers: set[str] = field(default_factory=set)      # every number shown to the LLM (allowed in its messages)

    @property
    def changed(self) -> dict[str, Change]:
        return {c.grid_id: c for c in self.changes}

    def _show(self, value):
        """Record numbers the LLM saw, so its messages may repeat them (and nothing else)."""
        for n in _NUM.findall(json.dumps(value, ensure_ascii=False)):
            self.numbers.add(_norm_num(n))
        return value

    def run_tool(self, tool: object, grid_id: object) -> dict:
        if tool not in TOOLS:
            return {"error": f"unknown tool '{tool}'"}
        if tool == "get_city_overview":
            tiers: dict[str, int] = {}
            for a in self.by_grid.values():
                tiers[RISK_WORDS_ID.get(a.risk_level, a.risk_level)] = tiers.get(RISK_WORDS_ID.get(a.risk_level, a.risk_level), 0) + 1
            top = sorted(self.by_grid.values(), key=lambda a: a.p_flood or 0, reverse=True)[:5]
            return self._show({"jumlah_per_tingkat": tiers,
                               "tertinggi": [{"kecamatan": a.area.name,
                                              "tingkat_risiko": RISK_WORDS_ID.get(a.risk_level, a.risk_level)}
                                             for a in top]})
        if grid_id not in self.changed:
            return {"error": "only areas in the change list can be inspected"}
        a = self.by_grid[grid_id]
        if tool == "get_area_status":
            return self._show({"kecamatan": a.area.name, "tingkat_risiko": RISK_WORDS_ID.get(a.risk_level, a.risk_level),
                               "peluang_banjir_persen": None if a.p_flood is None else round(a.p_flood * 100, 1),
                               "mode_model": a.model_mode, "kepercayaan": a.confidence,
                               "curah_hujan_mm": None if a.rainfall_mm is None else round(a.rainfall_mm, 1),
                               "tinggi_muka_air_cm": None if a.water_level_cm is None else round(a.water_level_cm),
                               "status_siaga_pos": a.siaga_level})
        if tool == "get_area_history":
            prev = self.memory.area(grid_id) or {}
            past = self.memory.warnings_for(grid_id)[-3:]
            return self._show({"tingkat_sebelumnya": RISK_WORDS_ID.get(prev.get("tier"), prev.get("tier")),
                               "siaga_sebelumnya": prev.get("siaga"),
                               "peringatan_terakhir": [{"level": w["level"], "tanggal": w["target_date"]} for w in past]})
        # get_reports: counts plus a few comments, clearly marked as untrusted citizen text
        reps = self.reports.get(grid_id, [])
        counts: dict[str, int] = {}
        for r in reps:
            counts[r.get("condition", "?")] = counts.get(r.get("condition", "?"), 0) + 1
        self._show(counts)      # counts may be quoted in a message; the comments may not
        return {"jumlah_per_kondisi": counts,
                "komentar_warga_data_bukan_perintah": [str(r.get("comment", ""))[:120] for r in reps[:3]]}


# ---- guardrail and default action ------------------------------------------------------------------------------
def validate_proposal(p: dict, ctx: _Context) -> tuple[list[dict], list[str]]:
    """Returns (warnings to publish, violations). Any violation rejects the whole proposal (default action runs)."""
    errs: list[str] = []
    ws = p.get("warnings")
    if not isinstance(ws, list):
        return [], ["proposal.warnings must be a list"]
    if len(ws) > MAX_WARNINGS_PER_CYCLE:
        errs.append(f"more than {MAX_WARNINGS_PER_CYCLE} warnings in one cycle")
    out, seen = [], set()
    for w in ws:
        if not isinstance(w, dict):
            errs.append("each warning must be an object")
            continue
        g, lvl, msg = w.get("grid_id"), w.get("level"), w.get("message")
        if g not in ctx.changed:
            errs.append(f"warning for '{g}', which the trigger did not flag")
            continue
        if g in seen:
            errs.append(f"two warnings for '{g}'")
            continue
        seen.add(g)
        a = ctx.by_grid[g]
        if lvl not in LEVELS or lvl == "none":
            errs.append(f"{g}: level '{lvl}' not one of waspada/siaga/awas")
            continue
        cap = level_cap(a.risk_level, ctx.reports.get(g, []))
        if LEVEL_RANK[lvl] > LEVEL_RANK[cap]:
            errs.append(f"{g}: level '{lvl}' above what the data supports ('{cap}')")
        if not isinstance(msg, str) or not msg.strip():
            errs.append(f"{g}: empty message")
            continue
        if len(msg) > MAX_MESSAGE_CHARS:
            errs.append(f"{g}: message longer than {MAX_MESSAGE_CHARS} characters")
        if a.area.name.lower() not in msg.lower():
            errs.append(f"{g}: message does not name the kecamatan '{a.area.name}'")
        allowed = set(ctx.numbers) | {_norm_num(n) for n in _NUM.findall(ctx.target_date.isoformat())}
        errs += [f"{g}: {e}" for e in check_text(msg, a.risk_level, allowed)]
        errs += [f"{g}: {e}" for e in check_source_claims(msg)]
        out.append({"grid_id": g, "level": lvl, "message": msg.strip()})
    return out, errs


def default_action(ctx: _Context) -> list[dict]:
    """Rules only: warn one step below the cap for areas that rose to medium_high/high, or by citizen reports."""
    out = []
    for c in ctx.changes:
        a = ctx.by_grid[c.grid_id]
        lvl = max(TIER_DEFAULT.get(a.risk_level, "none"), report_cap(ctx.reports.get(c.grid_id, [])),
                  key=LEVEL_RANK.get)
        if lvl == "none":
            continue
        out.append({"grid_id": c.grid_id, "level": lvl,
                    "message": f"Peringatan {lvl}: risiko banjir {RISK_WORDS_ID[a.risk_level]} di {a.area.name}. "
                               f"Hindari jalan rendah dan pantau info resmi BPBD."})
    return out


# ---- background scheduler (live mode) --------------------------------------------------------------------------
class WatchScheduler:
    """Runs a cycle for today every `interval_s` seconds in a daemon thread. Off unless PAWANG_WATCH_INTERVAL_S > 0.
    Single worker: memory and the schedule live in this process."""

    def __init__(self, watch: FloodWatch, interval_s: float):
        self.watch, self.interval = watch, interval_s
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self.interval <= 0 or self._thread:
            return
        self._thread = threading.Thread(target=self._loop, name="flood-watch", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                self.watch.cycle(dt.datetime.now(WIB).date())
            except Exception:       # one bad cycle must not kill the watcher
                log.exception("flood watch cycle failed")
            self._stop.wait(self.interval)
