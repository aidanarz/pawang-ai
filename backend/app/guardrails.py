"""Guardrails: every LLM output is checked here before an agent acts on it or a user reads it.

Each check returns a list of violations (empty list = passed). Agents use the LLM answer only when the
list is empty; otherwise they fall back to their deterministic policy and the violations go to the
audit log. These logs are what the log audit and the agent-training work start from.
"""
from __future__ import annotations

import re

# Phrases that claim certainty the model cannot give (Indonesian + English).
CERTAINTY_PHRASES = (
    "pasti banjir", "pasti tidak banjir", "tidak akan banjir", "dijamin", "100%", "tanpa risiko",
    "aman sepenuhnya", "will definitely", "guaranteed", "no risk", "certainly flood", "certainly not",
)
RISK_WORDS_ID = {"low": "rendah", "medium": "sedang", "high": "tinggi", "unknown": "tidak diketahui"}
# Accepted wordings per level. "unknown" is a phrase, and small models paraphrase it; the others are single
# words that must appear as written.
RISK_PHRASES_ID = {
    "low": ("rendah",), "medium": ("sedang",), "high": ("tinggi",),
    "unknown": ("tidak diketahui", "belum diketahui", "tidak dapat ditentukan", "belum dapat ditentukan"),
}
MAX_TEXT_CHARS = 420

# BMKG daily rainfall categories: (upper limit in mm/day, name). Light rain must not be described as heavy.
RAIN_CATEGORIES = ((0.5, "tidak hujan"), (20, "hujan ringan"), (50, "hujan sedang"), (100, "hujan lebat"),
                   (150, "hujan sangat lebat"), (float("inf"), "hujan ekstrem"))
HEAVY_RAIN_WORDS = ("lebat", "deras", "ekstrem", "signifikan", "intens")
_NUM = re.compile(r"\d+(?:[.,]\d+)?")


def check_plan(plan: dict, allowed_tools: set[str], required: set[str]) -> list[str]:
    errs = []
    steps = plan.get("tools")
    if not isinstance(steps, list) or not all(isinstance(t, str) for t in steps):
        return ["plan.tools must be a list of tool names"]
    unknown = [t for t in steps if t not in allowed_tools]
    if unknown:
        errs.append(f"plan uses tools that are not available: {unknown}")
    missing = required - set(steps)
    if missing:
        errs.append(f"plan omits required tools: {sorted(missing)}")
    return errs


def check_action(decision: dict, allowed_actions: set[str]) -> list[str]:
    action = decision.get("action")
    if action not in allowed_actions:
        return [f"action '{action}' not in allowed set {sorted(allowed_actions)}"]
    return []


def _norm_num(s: str) -> str:
    s = s.replace(",", ".")
    return s.rstrip("0").rstrip(".") if "." in s else s


def mentions_risk(text: str, risk_level: str) -> bool:
    low = text.lower()
    return any(p in low for p in RISK_PHRASES_ID.get(risk_level, ()))


def check_text(text: object, risk_level: str, allowed_numbers: set[str], require_risk_word: bool = True) -> list[str]:
    """User-facing advice: no invented numbers, risk word matches the model, no certainty claims.
    require_risk_word=False when the caller checks the risk word across several fields together."""
    if not isinstance(text, str) or not text.strip():
        return ["text is empty"]
    errs = []
    low = text.lower()
    if len(text) > MAX_TEXT_CHARS:
        errs.append(f"text longer than {MAX_TEXT_CHARS} characters")
    for phrase in CERTAINTY_PHRASES:
        if phrase in low:
            errs.append(f"certainty claim: '{phrase}'")
    if require_risk_word and risk_level in RISK_PHRASES_ID and not mentions_risk(text, risk_level):
        errs.append(f"risk word '{RISK_WORDS_ID[risk_level]}' (model says {risk_level}) missing")
    for other_level, word in RISK_WORDS_ID.items():
        if other_level != risk_level and re.search(rf"\brisiko\s+{word}\b", low):
            errs.append(f"text states 'risiko {word}' but the model says {risk_level}")
    allowed = {_norm_num(n) for n in allowed_numbers}
    invented = sorted({n for n in _NUM.findall(text) if _norm_num(n) not in allowed})
    if invented:
        errs.append(f"numbers not found in tool results: {invented}")
    return errs


def check_rain_words(text: str, category: str | None) -> list[str]:
    """No heavy-rain wording when BMKG's category is light or no rain."""
    if category not in ("tidak hujan", "hujan ringan"):
        return []
    low = text.lower()
    found = [w for w in HEAVY_RAIN_WORDS if w in low]
    return [f"describes rain as heavy {found} but BMKG category is '{category}'"] if found else []


def check_day_words(text: str, day_label: str) -> list[str]:
    """Do not say "hari ini" when the prediction is for another day (and vice versa for "besok")."""
    low = text.lower()
    errs = []
    if day_label != "hari ini" and "hari ini" in low:
        errs.append(f"says 'hari ini' but the prediction is for '{day_label}'")
    if day_label != "besok" and "besok" in low:
        errs.append(f"says 'besok' but the prediction is for '{day_label}'")
    return errs


# The advice must not credit a forecast to an agency that did not make it. Rainfall comes from Open-Meteo;
# BPBD may be named only as the place to check official information ("pantau info resmi BPBD").
FORBIDDEN_SOURCE_PATTERNS = (r"\bbmkg\b", r"\bopen-?meteo\b",
                             r"\bbpbd\s+(memprediksi|memperkirakan|menyatakan|melaporkan|mencatat)\b",
                             r"\bmenurut\s+(bpbd|pemerintah|dinas)\b")


def check_source_claims(text: str) -> list[str]:
    low = text.lower()
    return [f"attributes information to a source: '{m.group(0)}'"
            for pat in FORBIDDEN_SOURCE_PATTERNS for m in [re.search(pat, low)] if m]
