"""Client for the self-hosted Qwen reasoning engine.

Two ways to talk to the model, picked by QWEN_API_STYLE:
  - "ollama" (default): Ollama's native /api/chat. Lets us turn thinking OFF (`think: false`) and force
    JSON output (`format: "json"`). Qwen 3.x models think by default; through the OpenAI-compatible route
    the thinking can use up the time limit and leave the answer empty, which is what the first real test
    on 2026-11-08 showed (empty content, then a timeout).
  - "openai": any OpenAI-compatible server (vLLM, LM Studio) at /v1/chat/completions.

Design rule from the project document: the LLM is an orchestrator, never a calculator. It only returns
small JSON decisions or short text, and every answer is checked by guardrails before use. If Qwen is down,
slow, or answers badly, each agent falls back to a deterministic policy and the audit log records it.
"""
from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass, field
from typing import Protocol

import httpx

from .config import Settings


class LLMError(RuntimeError):
    pass


@dataclass
class LLMCall:
    """One exchange, kept for the audit log (this is also future fine-tuning data)."""
    agent: str
    system: str
    user: str
    raw: str | None = None
    parsed: dict | None = None
    error: str | None = None
    elapsed_ms: int = 0
    model: str = ""
    used: bool = False           # did the agent act on it (passed guardrails)?
    guardrail_errors: list[str] = field(default_factory=list)


class LLM(Protocol):
    name: str
    def complete_json(self, agent: str, system: str, user: str) -> LLMCall: ...
    def available(self) -> bool: ...


_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)


def extract_json(text: str) -> dict:
    """Parse a JSON object from model text, tolerating ```json fences or words around the object."""
    t = _FENCE.sub("", text.strip())
    try:
        obj = json.loads(t)
    except ValueError:
        start, end = t.find("{"), t.rfind("}")
        if start < 0 or end <= start:
            raise LLMError("no JSON object in the reply")
        obj = json.loads(t[start:end + 1])
    if not isinstance(obj, dict):
        raise LLMError("reply is JSON but not an object")
    return obj


class QwenClient:
    def __init__(self, s: Settings, http: httpx.Client | None = None):
        self.s = s
        self.name = s.llm_model
        self.http = http or httpx.Client(timeout=s.llm_timeout_s)
        self._down_until = 0.0   # circuit breaker: only for a server that is not running at all
        base = s.llm_base_url.rstrip("/")
        self.style = s.llm_api_style
        self.host = base[:-3] if base.endswith("/v1") else base     # Ollama native routes live at the root

    def available(self) -> bool:
        return self.s.llm_enabled and time.time() >= self._down_until

    def ping(self) -> bool:
        url = f"{self.host}/api/tags" if self.style == "ollama" else f"{self.host}/v1/models"
        try:
            r = self.http.get(url, headers={"Authorization": f"Bearer {self.s.llm_api_key}"}, timeout=3.0)
            return r.status_code == 200
        except httpx.HTTPError:
            return False

    def warm_up(self) -> int:
        """Load the model into memory before timing anything. Returns milliseconds taken (-1 on failure)."""
        t0 = time.perf_counter()
        call = self.complete_json("warm_up", 'Reply with JSON only: {"ok": true}', "ping", timeout=180.0)
        return -1 if call.error else int((time.perf_counter() - t0) * 1000)

    def _request(self, system: str, user: str, timeout: float | None) -> str:
        messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
        headers = {"Authorization": f"Bearer {self.s.llm_api_key}"}
        if self.style == "ollama":
            r = self.http.post(f"{self.host}/api/chat", headers=headers, timeout=timeout, json={
                "model": self.s.llm_model, "messages": messages, "stream": False,
                "think": False,                 # no thinking trace: short, fast, reproducible answers
                "format": "json",
                "keep_alive": "30m",            # keep the model in memory between requests
                "options": {"temperature": 0, "num_predict": 400},
            })
            r.raise_for_status()
            return r.json().get("message", {}).get("content", "") or ""
        r = self.http.post(f"{self.host}/v1/chat/completions", headers=headers, timeout=timeout, json={
            "model": self.s.llm_model, "messages": messages, "temperature": 0, "max_tokens": 400,
            "response_format": {"type": "json_object"},
        })
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"] or ""

    def complete_json(self, agent: str, system: str, user: str, timeout: float | None = None) -> LLMCall:
        call = LLMCall(agent=agent, system=system, user=user, model=self.name)
        if not self.available():
            call.error = "llm disabled or temporarily marked down"
            return call
        t0 = time.perf_counter()
        try:
            call.raw = self._request(system, user, timeout)
            if not call.raw.strip():
                raise LLMError("empty reply")
            call.parsed = extract_json(call.raw)
        except (httpx.HTTPError, KeyError, IndexError, ValueError, LLMError) as exc:
            call.error = f"{type(exc).__name__}: {exc}"
            if isinstance(exc, httpx.ConnectError):
                # nothing is listening (Ollama not started): stop waiting on it for a minute.
                # A slow answer (ReadTimeout) is NOT a reason to skip the next request.
                self._down_until = time.time() + 60
        call.elapsed_ms = int((time.perf_counter() - t0) * 1000)
        return call


class NoLLM:
    """Used when QWEN_ENABLED=false and in tests: every agent runs its deterministic policy."""
    name = "none"

    def available(self) -> bool:
        return False

    def complete_json(self, agent: str, system: str, user: str) -> LLMCall:
        return LLMCall(agent=agent, system=system, user=user, error="llm disabled", model=self.name)
