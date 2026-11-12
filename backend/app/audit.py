"""Audit log: one JSON line per request with every tool call, agent decision, Qwen exchange and guardrail
result. Used for the log audits, for debugging, and as the dataset for evaluating and training the agents.

Files rotate daily: logs/audit-YYYY-MM-DD.jsonl. The logs/ folder is git-ignored (it can grow large).
"""
from __future__ import annotations

import datetime as dt
import json
import logging
import threading
from pathlib import Path

log = logging.getLogger("pawang.audit")


class AuditLog:
    def __init__(self, directory: Path, enabled: bool = True, keep_days: int = 30):
        self.dir = Path(directory)
        self.enabled = enabled
        self._lock = threading.Lock()
        if enabled:
            self._prune(keep_days)

    def _prune(self, keep_days: int) -> None:
        """Delete audit files older than keep_days (by file name date), so the folder cannot fill the disk."""
        cutoff = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=keep_days)).strftime("%Y-%m-%d")
        for f in self.dir.glob("audit-*.jsonl") if self.dir.exists() else []:
            if f.stem[len("audit-"):] < cutoff:
                try:
                    f.unlink()
                except OSError as exc:
                    log.warning("could not delete old audit file %s: %s", f, exc)

    def write(self, request_id: str, record: dict) -> None:
        if not self.enabled:
            return
        now = dt.datetime.now(dt.timezone.utc)
        line = json.dumps({"request_id": request_id, "logged_at": now.isoformat(), **record},
                          ensure_ascii=False, default=str)
        try:
            self.dir.mkdir(parents=True, exist_ok=True)
            with self._lock, open(self.dir / f"audit-{now:%Y-%m-%d}.jsonl", "a", encoding="utf-8") as f:
                f.write(line + "\n")
        except OSError as exc:      # logging must never fail a request (full disk, permissions)
            log.warning("audit write failed: %s", exc)
