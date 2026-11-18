"""Live crowd reports (Waze style): a person says what the road or area looks like right now.

Reports are shown on the map as-is, colour coded by the condition. They are NOT fed into the model: they are
unverified and anyone can send one, so they never change a probability or a risk tier.
Kept in memory and appended to a JSON-lines file so they survive a restart. Reports older than `ttl_h` are dropped.
"""
from __future__ import annotations

import datetime as dt
import json
import logging
import threading
import time
import uuid
from collections import deque
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

log = logging.getLogger("pawang.reports")

Condition = Literal["aman", "basah", "genangan_rendah", "banjir"]
# shortcut: one global limit (there are no user accounts to limit per person); add per-user limits with auth
MAX_PER_MINUTE = 30
LAT_RANGE, LON_RANGE = (-6.45, -5.95), (106.55, 107.15)   # Greater Jakarta; anything else is a mistake or abuse


class ReportIn(BaseModel):
    lat: float = Field(ge=LAT_RANGE[0], le=LAT_RANGE[1])
    lon: float = Field(ge=LON_RANGE[0], le=LON_RANGE[1])
    condition: Condition
    comment: str = Field(default="", max_length=280)


class RateLimited(Exception):
    pass


# Example reports for demos: (lat, lon, condition, comment, minutes ago). Flagged demo=True, never written to the
# file, never expire, and their age is recomputed on every read so they always look recent.
DEMO_REPORTS = (
    (-6.2257, 106.8654, "banjir", "Air sungai meluap ke jalan, motor tidak bisa lewat", 12),
    (-6.1167, 106.7900, "banjir", "Genangan setinggi lutut dekat pompa air", 25),
    (-6.1580, 106.9050, "genangan_rendah", "Genangan di depan ruko, mobil masih bisa lewat pelan", 40),
    (-6.1500, 106.7360, "genangan_rendah", "Air menggenang di perempatan, arus lambat", 55),
    (-6.1950, 106.8310, "basah", "Hujan deras sejak tadi, jalan licin", 18),
    (-6.1800, 106.9400, "basah", "Gerimis, jalan basah tapi lancar", 70),
    (-6.2440, 106.7990, "aman", "Kering dan lancar", 90),
    (-6.2150, 106.8700, "banjir", "Banjir kiriman, jalan ditutup sebagian", 8),
)


def demo_reports(catalog) -> list[dict]:
    out = []
    for i, (lat, lon, cond, comment, minutes) in enumerate(DEMO_REPORTS):
        area = catalog.nearest(lat, lon)
        out.append({"id": f"demo-{i}", "lat": lat, "lon": lon, "condition": cond, "comment": comment,
                    "area_name": area.name, "grid_id": area.grid_id, "demo": True, "minutes_ago": minutes})
    return out


class ReportStore:
    def __init__(self, path: Path | None, ttl_h: float = 6.0, demo: list[dict] | None = None):
        self.path, self.ttl = path, dt.timedelta(hours=ttl_h)
        self._demo = demo or []
        self._lock = threading.Lock()
        self._recent: deque[float] = deque()
        self._items: list[dict] = []
        if path and path.exists():
            for line in path.read_text(encoding="utf-8").splitlines():
                try:
                    self._items.append(json.loads(line))
                except ValueError:
                    log.warning("skipping a bad line in %s", path)
            self._items = self._fresh()

    def _fresh(self) -> list[dict]:
        cutoff = (dt.datetime.now(dt.timezone.utc) - self.ttl).isoformat()
        return [r for r in self._items if r["created_at"] >= cutoff]

    def add(self, rep: ReportIn, area_name: str, grid_id: str) -> dict:
        now = time.monotonic()
        with self._lock:
            while self._recent and now - self._recent[0] > 60:
                self._recent.popleft()
            if len(self._recent) >= MAX_PER_MINUTE:
                raise RateLimited
            self._recent.append(now)
            item = {"id": uuid.uuid4().hex[:12], "lat": rep.lat, "lon": rep.lon, "condition": rep.condition,
                    "comment": rep.comment.strip(), "area_name": area_name, "grid_id": grid_id,
                    "created_at": dt.datetime.now(dt.timezone.utc).isoformat()}
            self._items = self._fresh() + [item]
            if self.path:
                try:
                    self.path.parent.mkdir(parents=True, exist_ok=True)
                    with self.path.open("a", encoding="utf-8") as f:
                        f.write(json.dumps(item, ensure_ascii=False) + "\n")
                except OSError as exc:      # a full disk must not lose the report from the map
                    log.warning("report write failed: %s", exc)
            return item

    def active(self) -> list[dict]:
        now = dt.datetime.now(dt.timezone.utc)
        demo = [{**{k: v for k, v in d.items() if k != "minutes_ago"},
                 "created_at": (now - dt.timedelta(minutes=d["minutes_ago"])).isoformat()} for d in self._demo]
        with self._lock:
            return demo + self._fresh()
