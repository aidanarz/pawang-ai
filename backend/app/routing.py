"""Alternative route: the fastest road route is compared with alternatives and with detours that avoid flood risk.

Who does what (design: AGENT_DESIGN.md, section 2.3):
  - RULES (this file) decide what is risky (model tier High, citizen "banjir" report points), score every candidate
    route by how much of it lies there, and pick the least exposed one. The verdict and the text are built from numbers.
  - The ROUTING ENGINE (Valhalla, profile motor_scooter) computes the actual roads. The route is never invented.
  - An LLM may later phrase the explanation; it may only use street names that are in the route result below.

The public Valhalla server caps `exclude_polygons` at 10 km in total, too small for a kecamatan. `exclude_locations`
(points, at most 50) is not capped that way, so avoiding works by excluding sample points on the risky stretches of a
route and asking again. A self-hosted Valhalla has no such cap, but the same code works with it.
"""
from __future__ import annotations

import inspect
import json
import logging
import math
import re
import threading
import time
from collections import deque
from dataclasses import dataclass, field

import httpx
from pydantic import BaseModel, Field
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union

from .guardrails import CERTAINTY_PHRASES, MAX_TEXT_CHARS, _NUM, _norm_num, check_source_claims
from .prompts import ROUTE_EXPLAIN_SYSTEM
from .reports import LAT_RANGE, LON_RANGE

log = logging.getLogger("pawang.routing")

HIGH_TIERS = ("high",)
SOFT_TIERS = ("medium_high",)
W_SOFT = 0.3                     # one km in a medium_high area counts like 0.3 km in a high area
W_FLOOD_POINT = 5.0              # one citizen-reported flood point on the route counts like 5 km in a high area
FLOOD_POINT_RADIUS_M = 120.0
SAMPLE_EVERY_M = 400.0
ENDPOINT_FREE_M = 800.0          # no exclusion this close to the start or end, or the route could not begin or end
MAX_EXCLUDE = 50                 # Valhalla's limit for exclude_locations
MAX_EXTRA_CALLS = 2
# An alternative replaces the fastest route only when it cuts the exposure score by at least this much: a detour
# is not worth a few hundred metres less risk. (Chosen by hand from real Jakarta routes, not tuned on data.)
MIN_GAIN, GAIN_SHARE = 0.5, 0.2
MAX_KM = 80.0
MIN_METERS = 300.0
_R = 6371000.0


class LatLon(BaseModel):
    lat: float = Field(ge=LAT_RANGE[0], le=LAT_RANGE[1])
    lon: float = Field(ge=LON_RANGE[0], le=LON_RANGE[1])


class RouteRequest(BaseModel):
    origin: LatLon
    destination: LatLon
    time: str = "5h"
    date: str | None = None


class PerMinute:
    """Global requests-per-minute limit. shortcut: one limit for everyone (no accounts), per-user with auth."""

    def __init__(self, limit: int):
        self.limit, self._hits, self._lock = limit, deque(), threading.Lock()

    def allow(self) -> bool:
        now = time.monotonic()
        with self._lock:
            while self._hits and now - self._hits[0] > 60:
                self._hits.popleft()
            if len(self._hits) >= self.limit:
                return False
            self._hits.append(now)
            return True


class RoutingError(Exception):
    """The routing engine is unreachable or answered something unusable."""


class NoRoute(Exception):
    """The engine found no road route (for example because every road was excluded)."""


@dataclass
class Route:
    coords: list[tuple[float, float]]            # (lat, lon)
    km: float
    minutes: float
    streets: list[tuple[str, float]] = field(default_factory=list)   # (street name, km), longest first
    high_km: float = 0.0
    soft_km: float = 0.0
    flood_points: int = 0

    @property
    def score(self) -> float:
        return self.high_km + W_SOFT * self.soft_km + W_FLOOD_POINT * self.flood_points


# ---- geometry helpers ------------------------------------------------------------------------------------------
def decode_polyline6(s: str) -> list[tuple[float, float]]:
    idx = lat = lon = 0
    out = []
    while idx < len(s):
        for axis in (0, 1):
            shift = res = 0
            while True:
                b = ord(s[idx]) - 63
                idx += 1
                res |= (b & 31) << shift
                shift += 5
                if b < 32:
                    break
            d = ~(res >> 1) if res & 1 else res >> 1
            if axis == 0:
                lat += d
            else:
                lon += d
        out.append((lat / 1e6, lon / 1e6))
    return out


class Projector:
    """Equirectangular projection around one point. Good to a few metres inside Jakarta."""

    def __init__(self, lat0: float, lon0: float):
        self.lat0, self.lon0, self.kx = lat0, lon0, math.cos(math.radians(lat0))

    def xy(self, lat: float, lon: float) -> tuple[float, float]:
        return (math.radians(lon - self.lon0) * _R * self.kx, math.radians(lat - self.lat0) * _R)

    def ll(self, x: float, y: float) -> tuple[float, float]:
        return (self.lat0 + math.degrees(y / _R), self.lon0 + math.degrees(x / (_R * self.kx)))


class RiskMap:
    """High and medium_high kecamatan as polygons, plus flood points, all in metres."""

    def __init__(self, areas: list, flood_points: list[tuple[float, float]], proj: Projector):
        self.proj = proj
        self.high, self.soft = [], []
        self.zones: list[tuple[Polygon, str, str]] = []              # (polygon, name, tier) for every area
        for a in areas:
            poly = self._polygon(a.area.boundary)
            if poly is None:
                continue
            self.zones.append((poly, a.area.name, a.risk_level))
            if a.risk_level in HIGH_TIERS:
                self.high.append(poly)
            elif a.risk_level in SOFT_TIERS:
                self.soft.append(poly)
        self.high_u = unary_union(self.high) if self.high else None
        self.soft_u = unary_union(self.soft) if self.soft else None
        self.flood = [Point(*proj.xy(la, lo)) for la, lo in flood_points]
        self.flood_ll = flood_points

    def _polygon(self, boundary) -> Polygon | None:
        if not boundary:
            return None
        rings = [[self.proj.xy(lat, lon) for lon, lat in ring] for ring in boundary]
        try:
            poly = Polygon(rings[0], rings[1:])
            return poly if poly.is_valid else poly.buffer(0)
        except ValueError:
            return None

    def area_at(self, lat: float, lon: float) -> tuple[str | None, str | None]:
        p = Point(*self.proj.xy(lat, lon))
        for poly, name, tier in self.zones:
            if poly.contains(p):
                return name, tier
        return None, None

    def line(self, coords: list[tuple[float, float]]) -> LineString:
        return LineString([self.proj.xy(la, lo) for la, lo in coords])

    def expose(self, route: Route) -> Route:
        line = self.line(route.coords)
        route.high_km = (line.intersection(self.high_u).length / 1000.0) if self.high_u is not None else 0.0
        route.soft_km = (line.intersection(self.soft_u).length / 1000.0) if self.soft_u is not None else 0.0
        route.flood_points = sum(line.distance(p) <= FLOOD_POINT_RADIUS_M for p in self.flood)
        return route

    def risky_samples(self, route: Route, origin: tuple[float, float], dest: tuple[float, float]) -> list[tuple[float, float]]:
        """Points (lat, lon) spaced along the stretches of the route inside high areas, away from the endpoints."""
        if self.high_u is None:
            return []
        line = self.line(route.coords)
        inside = line.intersection(self.high_u)
        parts = [g for g in getattr(inside, "geoms", [inside]) if g.length > 0 and g.geom_type == "LineString"]
        o, d = Point(*self.proj.xy(*origin)), Point(*self.proj.xy(*dest))
        out = []
        for g in parts:
            n = max(1, int(g.length // SAMPLE_EVERY_M))
            for i in range(n):
                p = g.interpolate((i + 0.5) * g.length / n)
                if p.distance(o) > ENDPOINT_FREE_M and p.distance(d) > ENDPOINT_FREE_M:
                    out.append(self.proj.ll(p.x, p.y))
        return out


# ---- Valhalla ---------------------------------------------------------------------------------------------------
class ValhallaClient:
    def __init__(self, base_url: str, costing: str = "motor_scooter", http: httpx.Client | None = None,
                 timeout_s: float = 30.0):
        self.url = base_url.rstrip("/") + "/route"
        self.costing, self.timeout = costing, timeout_s
        # A generic client name: the public server asks automated clients to identify themselves, and no project
        # or personal details belong in a request to an outside service.
        self.http = http or httpx.Client(headers={"User-Agent": "route-client/1.0"})

    def routes(self, origin: tuple[float, float], dest: tuple[float, float], alternates: int = 0,
               exclude: list[tuple[float, float]] | None = None) -> list[Route]:
        body: dict = {"locations": [{"lat": origin[0], "lon": origin[1]}, {"lat": dest[0], "lon": dest[1]}],
                      "costing": self.costing, "directions_options": {"language": "id-ID"}}
        if alternates:
            body["alternates"] = alternates
        if exclude:
            body["exclude_locations"] = [{"lat": la, "lon": lo} for la, lo in exclude[:MAX_EXCLUDE]]
        try:
            r = self.http.post(self.url, json=body, timeout=self.timeout)
        except httpx.HTTPError as exc:
            raise RoutingError(f"routing engine unreachable: {exc}") from exc
        if r.status_code == 400 and "no path" in r.text.lower():
            raise NoRoute
        if r.status_code != 200:
            if exclude and r.status_code == 400:
                raise NoRoute                       # a too-restrictive exclusion: treat as "no such route"
            raise RoutingError(f"routing engine answered HTTP {r.status_code}")
        try:
            data = r.json()
            trips = [data["trip"]] + [a["trip"] for a in data.get("alternates", [])]
            return [self._parse(t) for t in trips]
        except (KeyError, ValueError, TypeError, IndexError) as exc:
            raise RoutingError(f"unexpected routing answer: {exc}") from exc

    @staticmethod
    def _parse(trip: dict) -> Route:
        leg = trip["legs"][0]
        streets: dict[str, float] = {}
        for m in leg.get("maneuvers", []):
            for name in m.get("street_names", []) or []:
                if len(name) < 3 or name.isdigit():       # route numbers such as "2" are not street names
                    continue
                streets[name] = streets.get(name, 0.0) + float(m.get("length", 0.0))
        return Route(coords=decode_polyline6(leg["shape"]), km=float(trip["summary"]["length"]),
                     minutes=float(trip["summary"]["time"]) / 60.0,
                     streets=sorted(streets.items(), key=lambda kv: -kv[1]))


# ---- the planner ------------------------------------------------------------------------------------------------
@dataclass
class Plan:
    verdict: str                  # clear | safe | reduced | unavoidable
    fastest: Route
    recommended: Route
    message: str
    origin_area: str | None
    destination_area: str | None
    candidates: int
    flood_points_known: int


def _street_text(route: Route, n: int = 3) -> str:
    names = [s for s, _ in route.streets[:n] if s]
    return ", ".join(names)


def _hard(r: Route) -> bool:
    """Exposure the plan must try to avoid: a high-tier area or a reported flood point. medium_high only breaks ties."""
    return r.high_km > 0 or r.flood_points > 0


def plan_route(client: ValhallaClient, risk: RiskMap, origin: tuple[float, float], dest: tuple[float, float]) -> Plan:
    cands = [risk.expose(c) for c in client.routes(origin, dest, alternates=2)]   # RoutingError: the caller answers 503
    fastest = cands[0]
    best = fastest

    if _hard(fastest):
        best = min(cands, key=lambda c: (round(c.score, 3), c.minutes))
        # Still exposed: exclude points on the risky stretches (and the reported flood points) and ask again.
        exclude = list(risk.flood_ll)
        for _ in range(MAX_EXTRA_CALLS):
            if not _hard(best):
                break
            exclude = list(dict.fromkeys(exclude + risk.risky_samples(best, origin, dest)))[:MAX_EXCLUDE]
            if not exclude:
                break
            try:
                extra = risk.expose(client.routes(origin, dest, exclude=exclude)[0])
            except NoRoute:
                break
            cands.append(extra)
            if (round(extra.score, 3), extra.minutes) < (round(best.score, 3), best.minutes):
                best = extra
        if fastest.score - best.score < max(MIN_GAIN, GAIN_SHARE * fastest.score):
            best = fastest                      # no alternative that is worth the detour

    o_name, o_tier = risk.area_at(*origin)
    d_name, d_tier = risk.area_at(*dest)
    if not _hard(fastest):
        verdict = "clear"
    elif best is fastest:
        verdict = "unavoidable"
    else:
        verdict = "safe" if not _hard(best) else "reduced"

    extra_km, extra_min = best.km - fastest.km, best.minutes - fastest.minutes
    via = _street_text(best)
    via_txt = f" Lewat {via}." if via else ""
    if verdict == "clear":
        soft = f" Rute ini melewati {fastest.soft_km:.1f} km area berisiko cukup tinggi." if fastest.soft_km >= 1 else ""
        msg = "Rute tercepat tidak melewati area berisiko tinggi atau titik banjir yang dilaporkan." + soft + via_txt
    elif verdict == "safe":
        msg = (f"Rute alternatif menghindari {fastest.high_km:.1f} km di area berisiko tinggi dan "
               f"{fastest.flood_points} titik banjir yang dilaporkan. Tambahan {extra_km:+.1f} km, "
               f"{extra_min:+.0f} menit dibanding rute tercepat.{via_txt}")
    elif verdict == "reduced":
        msg = (f"Tidak ada rute yang sepenuhnya menghindari area berisiko. Rute ini mengurangi paparan di area "
               f"berisiko tinggi dari {fastest.high_km:.1f} km menjadi {best.high_km:.1f} km dan titik banjir dari "
               f"{fastest.flood_points} menjadi {best.flood_points} ({extra_km:+.1f} km, {extra_min:+.0f} menit).{via_txt}")
    else:
        ends = [n for n, t in ((o_name, o_tier), (d_name, d_tier)) if t in HIGH_TIERS]
        why = f" Titik awal atau tujuan berada di area berisiko tinggi ({', '.join(ends)})." if ends else ""
        msg = (f"Tidak ditemukan rute yang layak untuk menghindari area berisiko. Rute tercepat ditampilkan: "
               f"{fastest.high_km:.1f} km melewati area berisiko tinggi dan {fastest.flood_points} titik banjir "
               f"yang dilaporkan.{why} Pertimbangkan menunda perjalanan.")
    return Plan(verdict, fastest, best, msg, o_name, d_name, len(cands), len(risk.flood_ll))


def distance_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    p = Projector(a[0], a[1])
    x, y = p.xy(*b)
    return math.hypot(x, y)


# ---- LLM explanation (the rules above stay in charge: the LLM only words the result) --------------------------------
# "Tidak ada rute yang sepenuhnya menghindari area" is the honest sentence, so a negation earlier in the same
# sentence clears the phrase.
_OVERCLAIM = re.compile(r"bebas banjir|aman dilalui|aman dilewati|menghindari seluruh|sepenuhnya menghindari")
_NEGATION = re.compile(r"\b(?:tidak|belum|bukan)\b")
_REASSURE = re.compile(r"tanpa khawatir|tidak perlu khawatir|jangan khawatir")
_WEATHER = re.compile(r"hujan|cuaca")
# "Jalan Raya Timur" / "jalan Raya Timur" / "Jl. Pesisir": the word followed by a capital letter or digit. The plain
# noun ("jalan yang dilewati") is not a street name.
_JALAN = re.compile(r"\b(?i:jalan|jl\.?)\s+(?=[A-Z0-9])")


def _amount(x: float, small: float, big: float) -> str:
    return "tidak ada" if x <= 0 else "sedikit" if x < small else "sedang" if x < big else "cukup banyak"


def route_facts(plan: Plan) -> dict:
    """What the LLM is told. No numbers on purpose: the cards beside the text show them, and a model that is given
    "3.0" and "2.2" will copy them, sometimes for the wrong thing (measured with Qwen 7B on 2026-11-22)."""
    f, r = plan.fastest, plan.recommended
    exposed = lambda x: x.high_km > 0 or x.flood_points > 0           # noqa: E731
    if not exposed(r):
        left = "tidak ada"
    elif r is f:
        left = "sama dengan rute tercepat"
    else:
        left = "berkurang, tetapi masih ada"
    return {"vonis": plan.verdict, "asal": plan.origin_area, "tujuan": plan.destination_area,
            "rute_tercepat_melewati_area_berisiko": "ya" if exposed(f) else "tidak",
            "rute_disarankan": {"paparan_area_berisiko_tinggi_dan_titik_banjir": left,
                                "tambahan_jarak": _amount(r.km - f.km, 3, 8),
                                "tambahan_waktu": _amount(r.minutes - f.minutes, 10, 25),
                                "jalan": [n for n, _ in r.streets[:5] if n]},
            "rute_sama_dengan_tercepat": r is f,
            "titik_banjir_laporan_warga_dihitung": "ya" if plan.flood_points_known else "tidak"}


def check_route_text(text: object, facts: dict) -> list[str]:
    """No numbers (the cards beside the text show them; a number used for the wrong thing, such as the detour
    length as the remaining exposure, passes any "numbers must appear in the facts" check), no weather talk (the
    facts hold none), no invented streets, no certainty or reassurance, no overclaim for a verdict that did not
    avoid the risk. Found with the real Qwen 7B on 2026-11-22.
    shortcut: only streets written as "Jalan ..." / "Jl. ..." are checked; other names (a roundabout, a toll road)
    are not, and the prompt asks for exact names. Upgrade when the chatbot reuses this."""
    if not isinstance(text, str) or not text.strip():
        return ["explanation is empty"]
    errs, low = [], text.lower()
    if len(text) > MAX_TEXT_CHARS:
        errs.append(f"longer than {MAX_TEXT_CHARS} characters")
    errs += [f"certainty claim: '{p}'" for p in CERTAINTY_PHRASES if p in low]
    errs += check_source_claims(text)
    in_names = {_norm_num(n) for s in facts["rute_disarankan"]["jalan"] for n in _NUM.findall(s)}     # "Jalan 4"
    stray = sorted({n for n in _NUM.findall(text) if _norm_num(n) not in in_names})
    if stray:
        errs.append(f"numbers in the explanation (they belong on the cards): {stray}")
    if m := (_WEATHER.search(low) or _REASSURE.search(low)):
        errs.append(f"weather talk or reassurance not backed by the route result: '{m.group(0)}'")
    streets = [re.sub(r"^(jalan|jl\.?)\s+", "", s.lower()) for s in facts["rute_disarankan"]["jalan"]]
    for m in _JALAN.finditer(text):
        rest = low[m.end():]
        if not any(rest.startswith(s) for s in streets):
            errs.append(f"street not in the route result: '{text[m.start():m.end() + 24].strip()}'")
    if facts["vonis"] in ("reduced", "unavoidable"):
        for sentence in re.split(r"[.!?]+", low):
            if (m := _OVERCLAIM.search(sentence)) and not _NEGATION.search(sentence[:m.start()]):
                errs.append(f"claims the risk was avoided although the verdict is '{facts['vonis']}': '{m.group(0)}'")
                break
    return errs


def explain_route(llm, plan: Plan, timeout_s: float | None = None) -> tuple[str, str, list[str]]:
    """(text, decided_by, violations). The LLM's wording is used only when it passes the checks; otherwise, or when
    the LLM is off or fails, the rule-built message is used."""
    if not llm.available():
        return plan.message, "rules", []
    facts = route_facts(plan)
    kw = {"timeout": timeout_s} if timeout_s and "timeout" in inspect.signature(llm.complete_json).parameters else {}
    call = llm.complete_json("route_explainer", ROUTE_EXPLAIN_SYSTEM, json.dumps(facts, ensure_ascii=False), **kw)
    if call.error or not isinstance(call.parsed, dict):
        return plan.message, "rules", [call.error or "reply is not an object"]
    text = call.parsed.get("explanation")
    errs = check_route_text(text, facts)
    return (plan.message, "rules", errs) if errs else (text.strip(), "qwen", [])
