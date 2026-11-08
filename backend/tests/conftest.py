import datetime as dt
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import Settings  # noqa: E402
from app.llm import LLMCall  # noqa: E402

FLOOD_DAY = dt.date(2020, 2, 25)   # 40 of 44 kecamatan flooded; the model's known extreme day


class FakeLLM:
    """Scripted stand-in for Qwen: returns a fixed JSON (or raw string) per agent name."""
    name = "fake-qwen"

    def __init__(self, replies: dict[str, object]):
        self.replies = replies
        self.calls: list[LLMCall] = []

    def available(self) -> bool:
        return True

    def complete_json(self, agent: str, system: str, user: str) -> LLMCall:
        c = LLMCall(agent=agent, system=system, user=user, model=self.name)
        reply = self.replies.get(agent)
        if reply is None:
            c.error = "no scripted reply"
        else:
            c.raw = reply if isinstance(reply, str) else json.dumps(reply)
            try:
                c.parsed = json.loads(c.raw)
            except ValueError as exc:
                c.error = str(exc)
        self.calls.append(c)
        return c


@pytest.fixture
def replay_settings(tmp_path) -> Settings:
    return Settings(data_mode="replay", llm_enabled=False, audit_dir=tmp_path / "logs")


@pytest.fixture
def live_settings(tmp_path) -> Settings:
    return Settings(data_mode="live", llm_enabled=False, audit_dir=tmp_path / "logs")
