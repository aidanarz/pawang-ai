"""Audit log: one JSON line per request with every tool call, agent decision, Qwen exchange and guardrail
result. Used for the log audits, for debugging, and as the dataset for evaluating and training the agents.

Files rotate daily: logs/audit-YYYY-MM-DD.jsonl. The logs/ folder is git-ignored (it can grow large).
"""
from __future__ import annotations

import datetime as dt
import json
import threading
from pathlib import Path


class AuditLog:
    def __init__(self, directory: Path, enabled: bool = True):
        self.dir = Path(directory)
        self.enabled = enabled
        self._lock = threading.Lock()

    def write(self, request_id: str, record: dict) -> None:
        if not self.enabled:
            return
        now = dt.datetime.now(dt.timezone.utc)
        line = json.dumps({"request_id": request_id, "logged_at": now.isoformat(), **record},
                          ensure_ascii=False, default=str)
        self.dir.mkdir(parents=True, exist_ok=True)
        with self._lock, open(self.dir / f"audit-{now:%Y-%m-%d}.jsonl", "a", encoding="utf-8") as f:
            f.write(line + "\n")
