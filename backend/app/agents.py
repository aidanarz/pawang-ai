"""The three agents from the project document, plus the advice writer.

    Agent 1  Data Fetch Orchestrator  decides which tools to call
    Agent 3  Freshness Checker        validates timestamps and completeness of each source
    Agent 2  Failure Handler          retry, fallback to rainfall-only, or report data unavailable

Each agent follows the same pattern:
  1. compute what is ALLOWED deterministically (from tool capabilities and data checks),
  2. ask Qwen to choose within that set,
  3. accept Qwen's answer only if it passes the guardrails, else use the deterministic policy.
So the LLM adds judgement and explanations, but can never push the system outside safe behaviour, and the
platform still works when the GPU server is down.

Agent 3 has no LLM step for its verdicts: deciding whether a timestamp is too old is arithmetic, and the
document's rule is that agents never calculate numbers.
"""
from __future__ import annotations

import datetime as dt
import json
from dataclasses import dataclass, field

import pandas as pd

from . import guardrails as G
from . import prompts
from .config import Settings
from .llm import LLM, LLMCall
from .tools import ToolResult

UTC = dt.timezone.utc
REQUIRED_TOOLS = {"get_weather_forecast", "get_static_features"}


@dataclass
class Decision:
    agent: str
    value: dict
    decided_by: str                     # "qwen" or "policy"
    reason: str = ""
    llm: LLMCall | None = None

    def audit(self) -> dict:
        d = {"agent": self.agent, "value": self.value, "decided_by": self.decided_by, "reason": self.reason}
        if self.llm:
            d["llm"] = {"model": self.llm.model, "raw": self.llm.raw, "error": self.llm.error,
                        "elapsed_ms": self.llm.elapsed_ms, "guardrail_errors": self.llm.guardrail_errors,
                        "used": self.llm.used, "prompt_version": prompts.PROMPT_VERSION}
        return d


def _ask(llm: LLM, agent: str, system: str, payload: dict) -> LLMCall:
    return llm.complete_json(agent, system, json.dumps(payload, ensure_ascii=False, default=str))


# ------------------------------------------------------------------------------------------------
class DataFetchOrchestrator:
    """Agent 1."""
    name = "agent1_data_fetch"

    def __init__(self, llm: LLM):
        self.llm = llm

    def plan(self, area_names: list[str], capabilities: dict[str, dict]) -> Decision:
        available = {t for t, c in capabilities.items() if c.get("available") and t != "resolve_area"}
        policy = sorted(REQUIRED_TOOLS | ({"get_water_level"} & available))
        policy_reason = ("water level available: use the full model where possible"
                         if "get_water_level" in policy else
                         "no usable water-level source: rainfall-only model")
        # resolve_area has already run before planning, so it is not offered to Qwen as a choice.
        offered = {t: c for t, c in capabilities.items() if t != "resolve_area"}
        call = _ask(self.llm, self.name, prompts.AGENT1_DATA_FETCH,
                    {"areas": area_names[:10], "n_areas": len(area_names), "tools": offered})
        if call.parsed is not None:
            call.guardrail_errors = G.check_plan(call.parsed, available, REQUIRED_TOOLS)
            if not call.guardrail_errors:
                call.used = True
                return Decision(self.name, {"tools": sorted(set(call.parsed["tools"]))}, "qwen",
                                str(call.parsed.get("reason", ""))[:200], call)
        return Decision(self.name, {"tools": policy}, "policy", policy_reason, call)


# ------------------------------------------------------------------------------------------------
@dataclass
class Verdict:
    source: str                 # "rain" | "water_level"
    status: str                 # valid | stale | incomplete | missing | skipped
    detail: str = ""
    retryable: bool = False

    @property
    def ok(self) -> bool:
        return self.status == "valid"


class FreshnessChecker:
    """Agent 3."""
    name = "agent3_freshness"

    def __init__(self, s: Settings):
        self.s = s

    def _age_h(self, res: ToolResult) -> float | None:
        if res.data_as_of is None:
            return None
        return (dt.datetime.now(UTC) - res.data_as_of).total_seconds() / 3600

    def check_rain(self, res: ToolResult | None, point_ids: list[str], target: dt.date) -> Verdict:
        if res is None:
            return Verdict("rain", "missing", "rainfall was not fetched")
        if not res.ok:
            return Verdict("rain", "missing", res.error or "rainfall tool failed", retryable=True)
        d: pd.DataFrame = res.data
        need = self.s.rain_history_days
        start = pd.Timestamp(target - dt.timedelta(days=need - 1))
        win = d[(d["date"] >= start) & (d["date"] <= pd.Timestamp(target))].dropna(subset=["precip_mm"])
        counts = win.groupby("point_id")["date"].nunique()
        short = [p for p in point_ids if counts.get(p, 0) < need]
        if short:
            return Verdict("rain", "incomplete",
                           f"{len(short)} of {len(point_ids)} rainfall points lack {need} full days up to {target}",
                           retryable=res.source != "archive-replay")
        age = self._age_h(res)
        if age is not None and age > self.s.max_rain_age_h:
            return Verdict("rain", "stale", f"forecast is {age:.1f} h old (limit {self.s.max_rain_age_h} h)",
                           retryable=True)
        return Verdict("rain", "valid", f"{len(point_ids)} points, {need} days to {target}, source {res.source}")

    def check_water_level(self, res: ToolResult | None, station_ids: list[str], target: dt.date) -> Verdict:
        if res is None:
            return Verdict("water_level", "skipped", "not requested by the plan")
        if not res.ok:
            retry = "not configured" not in (res.error or "")
            return Verdict("water_level", "missing", res.error or "water-level tool failed", retryable=retry)
        d: pd.DataFrame = res.data
        on_day = set(d.loc[d["date"] == pd.Timestamp(target), "station_id"]) if len(d) else set()
        if not on_day:
            return Verdict("water_level", "missing", f"no station reported on {target}")
        age = self._age_h(res)
        if age is not None and age > self.s.max_tma_age_h:
            return Verdict("water_level", "stale", f"latest reading is {age:.1f} h old", retryable=True)
        if len(on_day) < len(station_ids):
            # partial coverage is usable: areas whose station reported get the full model, others rainfall-only
            return Verdict("water_level", "valid",
                           f"{len(on_day)} of {len(station_ids)} stations reported on {target} (partial)")
        return Verdict("water_level", "valid", f"all {len(station_ids)} stations reported on {target}")


# ------------------------------------------------------------------------------------------------
class FailureHandler:
    """Agent 2."""
    name = "agent2_failure"

    def __init__(self, llm: LLM):
        self.llm = llm

    @staticmethod
    def allowed(v: Verdict, attempts: int) -> set[str]:
        acts = set()
        if v.retryable and attempts < 2:
            acts.add("retry")
        acts.add("report_unavailable" if v.source == "rain" else "fallback_rainfall_only")
        return acts

    @staticmethod
    def policy(v: Verdict, allowed: set[str]) -> tuple[str, str]:
        if "retry" in allowed:
            return "retry", f"{v.source} {v.status}: retry once"
        if v.source == "rain":
            return "report_unavailable", "rainfall unusable after retry: the model cannot run"
        return "fallback_rainfall_only", "water level unusable: continue with the rainfall-only model"

    def decide(self, v: Verdict, attempts: int) -> Decision:
        allowed = self.allowed(v, attempts)
        action, reason = self.policy(v, allowed)
        call = _ask(self.llm, self.name, prompts.AGENT2_FAILURE,
                    {"source": v.source, "status": v.status, "detail": v.detail, "attempts": attempts,
                     "allowed_actions": sorted(allowed)})
        if call.parsed is not None:
            call.guardrail_errors = G.check_action(call.parsed, allowed)
            if not call.guardrail_errors:
                call.used = True
                return Decision(self.name, {"source": v.source, "action": call.parsed["action"]}, "qwen",
                                str(call.parsed.get("reason", ""))[:200], call)
        return Decision(self.name, {"source": v.source, "action": action}, "policy", reason, call)


# ------------------------------------------------------------------------------------------------
@dataclass
class AdviceFacts:
    area_name: str
    target_date: dt.date
    risk_level: str             # low | medium | high | unknown
    confidence: str             # HIGH | LOW
    rainfall_mm: float | None
    water_level_cm: float | None
    today: dt.date | None = None   # "today" in WIB; None = compute from the clock

    def day_label(self) -> str:
        """Which day the prediction is for, in words, so the writer never says "hari ini" for tomorrow."""
        today = self.today or dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).date()
        delta = (self.target_date - today).days
        return {0: "hari ini", 1: "besok", -1: "kemarin"}.get(delta, f"pada {self.target_date.isoformat()}")

    def rain_category(self) -> str | None:
        """BMKG daily rainfall categories (mm/day). Decided by code, not by the LLM."""
        mm = self.rainfall_mm
        if mm is None:
            return None
        for limit, name in G.RAIN_CATEGORIES:
            if mm < limit:
                return name
        return G.RAIN_CATEGORIES[-1][1]

    def numbers(self) -> set[str]:
        d = self.target_date
        # the date may be written as 10/8/2020 or 2020-08-10, so both padded and unpadded day/month count
        nums = {str(d.day), str(d.month), str(d.year), f"{d.day:02d}", f"{d.month:02d}"}
        if self.rainfall_mm is not None:
            nums.add(f"{self.rainfall_mm:.1f}")
        return nums

    def prompt_payload(self) -> dict:
        # The water-level number is NOT given to the writer: it is the river gauge at the nearest water gate,
        # not the depth of water on the street, and the first Qwen test turned "740 cm" into "air mencapai
        # 740 cm". The frontend shows the gauge value with its proper label; the text only says if it was used.
        return {"kecamatan": self.area_name, "tanggal": self.target_date.isoformat(),
                "untuk_hari": self.day_label(),
                "tingkat_risiko": G.RISK_WORDS_ID[self.risk_level],
                "kepercayaan": "tinggi" if self.confidence == "HIGH" else "rendah (data terbatas)",
                "curah_hujan_mm_hari_itu": None if self.rainfall_mm is None else f"{self.rainfall_mm:.1f}",
                # category on BMKG's daily scale, but the FORECAST is Open-Meteo's: the key avoids naming an agency so
                # the writer does not attribute the forecast to BMKG (it did on 2026-11-08: "BMKG memprediksi ...")
                "kategori_hujan": self.rain_category(),
                "data_tinggi_muka_air": "dipakai" if self.water_level_cm is not None else "tidak tersedia"}


TEMPLATES = {
    "high": ("Risiko banjir tinggi di {a}. Siapkan rencana alternatif dan pantau info resmi BPBD.",
             "Risiko tinggi: hindari jalan rendah dan genangan, tunda perjalanan dengan motor bila hujan deras."),
    "medium": ("Risiko banjir sedang di {a}. Tetap waspada dan pantau perkembangan cuaca.",
               "Risiko sedang: bawa jas hujan dan siapkan rute alternatif yang tidak melewati genangan."),
    "low": ("Risiko banjir rendah di {a}. Tetap pantau cuaca sebelum berangkat.",
            "Risiko rendah: perjalanan diperkirakan normal, tetap berhati-hati saat hujan."),
    "unknown": ("Risiko di {a} tidak diketahui karena data belum tersedia. Pantau info resmi BPBD.",
                "Risiko tidak diketahui: data terbatas, periksa kondisi jalan sebelum berangkat."),
}


class AdviceWriter:
    """Formats the model result into Indonesian advice (the document's 'formatting the output' role)."""
    name = "advice_writer"

    def __init__(self, llm: LLM):
        self.llm = llm

    @staticmethod
    def template(f: AdviceFacts) -> dict:
        rec, adv = TEMPLATES[f.risk_level]
        rec = rec.format(a=f.area_name)
        if f.confidence == "LOW" and f.risk_level != "unknown":
            rec += " Data terbatas, jadi perlakukan ini sebagai perkiraan kasar."
        return {"recommendation": rec, "commuter_advisory": adv}

    def write(self, f: AdviceFacts) -> Decision:
        call = _ask(self.llm, self.name, prompts.ADVICE_WRITER, f.prompt_payload())
        if call.parsed is not None:
            errs = []
            texts = [call.parsed.get(k) for k in ("recommendation", "commuter_advisory")]
            for key, text in zip(("recommendation", "commuter_advisory"), texts):
                errs += [f"{key}: {e}" for e in
                         G.check_text(text, f.risk_level, f.numbers(), require_risk_word=False)]
                if isinstance(text, str):
                    errs += [f"{key}: {e}" for e in G.check_rain_words(text, f.rain_category())]
                    errs += [f"{key}: {e}" for e in G.check_source_claims(text)]
                    errs += [f"{key}: {e}" for e in G.check_day_words(text, f.day_label())]
            # the risk level must be stated at least once across the two fields (not necessarily in both)
            if all(isinstance(t, str) for t in texts) and not G.mentions_risk(" ".join(texts), f.risk_level):
                errs.append(f"risk word '{G.RISK_WORDS_ID[f.risk_level]}' (model says {f.risk_level}) missing")
            call.guardrail_errors = errs
            if not errs:
                call.used = True
                return Decision(self.name, {k: call.parsed[k] for k in ("recommendation", "commuter_advisory")},
                                "qwen", "", call)
        return Decision(self.name, self.template(f), "policy", "template", call)
