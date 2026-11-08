"""Backend settings. Everything is read from environment variables (or backend/.env) so the same code
runs on a laptop, a demo machine and the GPU server without edits.

Why env vars and not a settings file in git: the Qwen endpoint and any API keys differ per machine and
must never be committed (.env is in .gitignore).
"""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = BACKEND_DIR.parent
MODEL_PKG_DIR = REPO_DIR / "Pawang_Prediction_Model"


def _load_dotenv(path: Path) -> None:
    """Minimal .env loader (no extra dependency). Never overrides variables already set."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv(BACKEND_DIR / ".env")

# The prediction module lives in Pawang_Prediction_Model/src and is imported as `src`.
if str(MODEL_PKG_DIR) not in sys.path:
    sys.path.insert(0, str(MODEL_PKG_DIR))


def _bool(name: str, default: bool) -> bool:
    return os.environ.get(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


@dataclass(frozen=True)
class Settings:
    # live   = Open-Meteo forecast for rainfall (needs internet), water level from the live collector
    # replay = historical data shipped in the repo (Pawang_Prediction_Model/data/interim); for demos/tests
    data_mode: str = field(default_factory=lambda: os.environ.get("PAWANG_DATA_MODE", "live"))
    models_dir: Path = field(default_factory=lambda: Path(
        os.environ.get("PAWANG_MODELS_DIR", str(MODEL_PKG_DIR / "models"))))
    interim_dir: Path = field(default_factory=lambda: Path(
        os.environ.get("PAWANG_INTERIM_DIR", str(MODEL_PKG_DIR / "data" / "interim"))))
    timezone: str = "Asia/Jakarta"

    # Cache (doc: Redis/Memory, TTL 10-15 min)
    cache_ttl_s: int = field(default_factory=lambda: int(os.environ.get("PAWANG_CACHE_TTL_S", "600")))

    # Freshness rules used by Agent 3
    rain_history_days: int = 30            # rain_30d needs 30 days ending on the target day
    max_rain_age_h: float = field(default_factory=lambda: float(os.environ.get("PAWANG_MAX_RAIN_AGE_H", "6")))
    max_tma_age_h: float = field(default_factory=lambda: float(os.environ.get("PAWANG_MAX_TMA_AGE_H", "3")))

    # Self-hosted Qwen through any OpenAI-compatible server (Ollama, vLLM, LM Studio)
    llm_enabled: bool = field(default_factory=lambda: _bool("QWEN_ENABLED", True))
    llm_base_url: str = field(default_factory=lambda: os.environ.get("QWEN_BASE_URL", "http://localhost:11434/v1"))
    llm_model: str = field(default_factory=lambda: os.environ.get("QWEN_MODEL", "qwen3.5:4b"))
    llm_api_key: str = field(default_factory=lambda: os.environ.get("QWEN_API_KEY", "not-needed"))
    llm_timeout_s: float = field(default_factory=lambda: float(os.environ.get("QWEN_TIMEOUT_S", "60")))
    # "ollama" = Ollama native /api/chat (thinking off, JSON forced); "openai" = /v1/chat/completions (vLLM etc.)
    llm_api_style: str = field(default_factory=lambda: os.environ.get("QWEN_API_STYLE", "ollama"))

    # Live water level scraped from the BPBD DKI Jakarta page (app/waterlevel.py). Used only in live mode.
    tma_live_enabled: bool = field(default_factory=lambda: _bool("PAWANG_TMA_LIVE", True))
    tma_url: str = field(default_factory=lambda: os.environ.get("PAWANG_TMA_URL", "https://bpbd.jakarta.go.id/waterlevel"))
    tma_store_path: Path = field(default_factory=lambda: Path(
        os.environ.get("PAWANG_TMA_STORE", str(BACKEND_DIR / "data" / "tma_live.csv"))))
    tma_min_interval_s: float = field(default_factory=lambda: float(os.environ.get("PAWANG_TMA_MIN_INTERVAL_S", "300")))
    # > 0: a background thread fetches every N seconds so history builds up even when nobody calls the API
    # (the model needs yesterday's level). 0 = fetch only when a request needs it.
    tma_poll_s: float = field(default_factory=lambda: float(os.environ.get("PAWANG_TMA_POLL_S", "0")))

    # Audit log (one JSON line per request): the raw material for log audits and agent training
    audit_dir: Path = field(default_factory=lambda: Path(
        os.environ.get("PAWANG_AUDIT_DIR", str(BACKEND_DIR / "logs"))))


def get_settings() -> Settings:
    return Settings()
