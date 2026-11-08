"""Live water level (TMA) from the BPBD DKI Jakarta public page https://bpbd.jakarta.go.id/waterlevel.

The page is plain server-rendered HTML: one table with one row per monitoring post ("pintu air") and one column per
hour of TODAY (WIB), newest hour first. Each cell reads "540 cm (T)" (level in cm, weather code) and carries a CSS class
`siaga1`..`siaga4` (siaga4 = the default, i.e. normal). Robots.txt allows crawling; this module is polite on purpose:
one request returns every post, results are kept for `min_interval_s`, and the request says who is asking.

What the model needs (src/features.py `tma_features`): per station and per day the maximum level in cm, plus
yesterday's value for `tma_delta1` and `tma_max_3d`. The page only shows today, so every fetch is appended to a small
CSV history (`TmaStore`). Until two days of history exist the delta features are incomplete and the pipeline falls back to
the rainfall-only model for those areas. It never guesses.

Known limits (also in backend/README.md):
  * Today's `tma_max` is the maximum SO FAR today; the model was trained on complete days.
  * Only posts that exist in the model's own station list are used (BPBD_TO_MODEL). "Pos Depok" has no model station and
    "Pasar Ikan - Laut" is a sea gauge, not the pump station the model learned, so both are ignored.
  * The page has no history, so a fresh install needs about 2 days of running before `full` mode can work.
"""
from __future__ import annotations

import datetime as dt
import logging
import os
import re
import threading
from dataclasses import dataclass
from pathlib import Path

import httpx
import pandas as pd
from lxml import html as lxml_html

log = logging.getLogger("pawang.waterlevel")

WIB = dt.timezone(dt.timedelta(hours=7))
UTC = dt.timezone.utc
USER_AGENT = "PawangAI/0.1 (flood early warning research; caches results, 1 request per 5 min)"

# BPBD post name (normalised, see norm()) -> station_id used by the model (models/cell_station_map.csv).
# Checked against the model's own station coordinates (Katulampa: -6.633, 106.837 in both) and against the training
# data: today's BPBD value of every mapped post lies inside that station's training range, close to its median, so
# the unit (cm) and datum agree.
BPBD_TO_MODEL = {
    "bendung katulampa": "ps katulampa hulu",
    "manggarai bkb": "pa manggarai",
    "pa karet": "p a karet",
    "pos krukut hulu": "ps krukut hulu",
    "pos pesanggrahan": "ps pesanggrahan",
    "pos angke hulu": "ps angke hulu",
    "waduk pluit": "p a pluit",
    "pos cipinang hulu": "ps cipinang hulu",
    "pos sunter hulu": "ps sunter hulu",
    "pulo gadung": "pa pulo gadung",
}

# CSS class of a cell -> label the frontend knows (SiagaLevel). siaga4 is the default colour = normal.
SIAGA_LABEL = {"siaga1": "Siaga 1", "siaga2": "Siaga 2", "siaga3": "Siaga 3", "siaga4": "Normal"}
SIAGA_RANK = {"Normal": 0, "Siaga 3": 1, "Siaga 2": 2, "Siaga 1": 3}

_READING = re.compile(r"(-?\d+(?:[.,]\d+)?)\s*cm(?:\s*\(([A-Za-z]+)\))?", re.I)
_HOUR = re.compile(r"^(\d{1,2}):(\d{2})$")
COLUMNS = ["post", "station_id", "ts", "level_cm", "siaga", "weather"]
MIN_PLAUSIBLE_CM, MAX_PLAUSIBLE_CM = -1000.0, 3000.0


class WaterLevelError(RuntimeError):
    """The page could not be fetched or no longer looks like the table this parser knows."""


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", str(s).lower())).strip()


def _text(el) -> str:
    return re.sub(r"\s+", " ", el.text_content().replace("\xa0", " ")).strip()


def parse_waterlevel_html(page: str, now: dt.datetime | None = None) -> pd.DataFrame:
    """Parse the BPBD page into one row per (post, hour). `now` is the fetch time (WIB), used to date the columns.

    Columns are hours of today. A column whose hour is later than the current hour cannot be today's reading (the page
    would be showing yesterday's table around midnight), so it is dropped rather than guessed.
    """
    now = (now or dt.datetime.now(WIB)).astimezone(WIB)
    doc = lxml_html.fromstring(page)

    header = None
    for tr in doc.xpath("//table//tr"):
        cells = [_text(td) for td in tr.xpath("./td|./th")]
        if cells and cells[0].lower() == "pintu air" and sum(bool(_HOUR.match(c)) for c in cells) >= 3:
            header = tr
            break
    if header is None:
        raise WaterLevelError("water-level table not found (page layout changed?)")

    hours: list[int | None] = []
    for c in [_text(td) for td in header.xpath("./td|./th")][1:]:
        m = _HOUR.match(c)
        hours.append(int(m.group(1)) if m else None)

    rows = []
    all_rows = header.xpath("ancestor::table[1]//tr")
    for tr in all_rows[all_rows.index(header) + 1:]:
        tds = tr.xpath("./td")
        if len(tds) < 2:
            continue
        post = _text(tds[0])
        if not post:
            continue
        for hour, td in zip(hours, tds[1:]):
            if hour is None or hour > now.hour:
                continue
            m = _READING.search(_text(td))
            if not m:
                continue
            level = float(m.group(1).replace(",", "."))
            if not (MIN_PLAUSIBLE_CM < level < MAX_PLAUSIBLE_CM):
                continue
            css = (td.get("class") or "").split()
            siaga = next((SIAGA_LABEL[c] for c in css if c in SIAGA_LABEL), None)
            ts = now.replace(hour=hour, minute=0, second=0, microsecond=0)
            rows.append({"post": post, "station_id": BPBD_TO_MODEL.get(norm(post)), "ts": ts,
                         "level_cm": level, "siaga": siaga, "weather": (m.group(2) or "").upper() or None})
    if not rows:
        raise WaterLevelError("water-level table has no readable values (page layout changed?)")
    return pd.DataFrame(rows, columns=COLUMNS)


class TmaStore:
    """Append-only hourly history in one CSV, deduplicated on (post, ts). Keeps `keep_days` days."""

    def __init__(self, path: Path, keep_days: int = 10):
        self.path, self.keep_days = Path(path), keep_days
        self._lock = threading.Lock()

    def load(self) -> pd.DataFrame:
        with self._lock:
            return self._read()

    def _read(self) -> pd.DataFrame:
        if not self.path.exists():
            return pd.DataFrame(columns=COLUMNS)
        d = pd.read_csv(self.path)
        if d.empty:
            return pd.DataFrame(columns=COLUMNS)
        d["ts"] = pd.to_datetime(d["ts"], utc=True).dt.tz_convert(WIB)
        return d[COLUMNS]

    def append(self, new: pd.DataFrame) -> int:
        """Merge `new` into the history. Returns how many rows the history grew by."""
        with self._lock:
            old = self._read()
            frames = [f for f in (old, new[COLUMNS]) if not f.empty]
            merged = pd.concat(frames, ignore_index=True) if frames else new[COLUMNS]
            merged["ts"] = pd.to_datetime(merged["ts"], utc=True).dt.tz_convert(WIB)
            merged = merged.drop_duplicates(["post", "ts"], keep="last").sort_values(["post", "ts"])
            cutoff = pd.Timestamp(dt.datetime.now(WIB) - dt.timedelta(days=self.keep_days))
            merged = merged[merged["ts"] >= cutoff]
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(".tmp")
            merged.to_csv(tmp, index=False)
            os.replace(tmp, self.path)          # atomic: a reader never sees a half-written file
            return len(merged) - len(old)


@dataclass
class FetchState:
    last_fetch: dt.datetime | None = None
    last_ok: dt.datetime | None = None
    last_error: str | None = None
    posts_parsed: int = 0


class BpbdWaterLevel:
    def __init__(self, url: str, store: TmaStore, http: httpx.Client | None = None, min_interval_s: float = 300.0):
        self.url, self.store, self.min_interval_s = url, store, min_interval_s
        self.http = http or httpx.Client(timeout=20.0)
        self.state = FetchState()
        self._lock = threading.Lock()
        self._stop = threading.Event()

    # ---- fetching --------------------------------------------------------------------------------------
    def refresh(self, force: bool = False, now: dt.datetime | None = None) -> bool:
        """Fetch the page and append it to the history. Returns True if a request was made. Raises WaterLevelError
        when the request failed; readings already stored stay usable (the freshness checker judges their age)."""
        now = (now or dt.datetime.now(WIB)).astimezone(WIB)
        with self._lock:
            if not force and self.state.last_fetch is not None:
                if (now - self.state.last_fetch).total_seconds() < self.min_interval_s:
                    return False
            self.state.last_fetch = now
            try:
                resp = self.http.get(self.url, headers={"User-Agent": USER_AGENT, "Accept": "text/html"},
                                     follow_redirects=True)
                resp.raise_for_status()
                df = parse_waterlevel_html(resp.text, now)
            except (httpx.HTTPError, WaterLevelError) as exc:
                self.state.last_error = f"{type(exc).__name__}: {exc}"
                raise WaterLevelError(self.state.last_error) from exc
            self.store.append(df)
            self.state.last_ok, self.state.last_error = now, None
            self.state.posts_parsed = df["post"].nunique()
            return True

    def start_polling(self, interval_s: float) -> None:
        """Fetch every `interval_s` seconds in a daemon thread, so history builds up even when nobody uses the API."""
        def loop() -> None:
            while not self._stop.is_set():
                try:
                    self.refresh(force=True)
                except WaterLevelError as exc:
                    log.warning("BPBD water-level poll failed: %s", exc)
                self._stop.wait(interval_s)
        threading.Thread(target=loop, name="bpbd-tma-poll", daemon=True).start()

    def stop_polling(self) -> None:
        self._stop.set()

    # ---- reading ---------------------------------------------------------------------------------------
    def daily(self, station_ids: list[str], target: dt.date, days: int = 3) -> tuple[pd.DataFrame, dt.datetime | None, dict]:
        """(station_id, date, tma_max) for the `days` days ending on `target`, the newest reading time (UTC), and
        extras: the latest siaga label per station."""
        h = self.store.load()
        h = h[h["station_id"].isin(station_ids)] if len(h) else h
        empty = pd.DataFrame(columns=["station_id", "date", "tma_max"])
        if h.empty:
            return empty, None, {}
        h = h.assign(date=h["ts"].dt.tz_localize(None).dt.normalize())
        start = pd.Timestamp(target - dt.timedelta(days=days - 1))
        h = h[(h["date"] >= start) & (h["date"] <= pd.Timestamp(target))]
        if h.empty:
            return empty, None, {}
        out = h.groupby(["station_id", "date"], as_index=False)["level_cm"].max().rename(columns={"level_cm": "tma_max"})
        newest = h["ts"].max().to_pydatetime().astimezone(UTC)
        latest = h.sort_values("ts").groupby("station_id").tail(1)
        siaga = {r.station_id: r.siaga for r in latest.itertuples() if isinstance(r.siaga, str)}
        return out, newest, {"siaga": siaga}

    def status(self) -> dict:
        s = self.state
        return {"url": self.url, "last_fetch": s.last_fetch.isoformat() if s.last_fetch else None,
                "last_ok": s.last_ok.isoformat() if s.last_ok else None, "last_error": s.last_error,
                "posts_parsed": s.posts_parsed, "stored_rows": len(self.store.load())}
