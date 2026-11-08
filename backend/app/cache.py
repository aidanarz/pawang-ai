"""Cache layer (document: Redis/Memory, TTL 10-15 min).

In-memory for now: one process, no extra service to install. The interface (get/set/clear) is what a Redis
version will implement, so swapping it later touches only this file.
"""
from __future__ import annotations

import threading
import time
from typing import Any, Hashable


class TTLCache:
    def __init__(self, ttl_s: int, max_items: int = 512):
        self.ttl_s, self.max_items = ttl_s, max_items
        self._data: dict[Hashable, tuple[float, Any]] = {}
        self._lock = threading.Lock()

    def get(self, key: Hashable) -> Any | None:
        with self._lock:
            item = self._data.get(key)
            if item is None:
                return None
            expires, value = item
            if time.monotonic() > expires:
                del self._data[key]
                return None
            return value

    def set(self, key: Hashable, value: Any) -> None:
        with self._lock:
            if len(self._data) >= self.max_items:
                self._data.pop(next(iter(self._data)))      # drop the oldest entry
            self._data[key] = (time.monotonic() + self.ttl_s, value)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()

    def __len__(self) -> int:
        return len(self._data)
