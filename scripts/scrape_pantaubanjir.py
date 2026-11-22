"""CLI Scraper script for Pos Pengamatan Pantau Banjir DKI Jakarta (DSDA).
URL: https://pantaubanjir.jakarta.go.id/
"""
from __future__ import annotations
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.scraper_pantaubanjir import main

if __name__ == "__main__":
    main()
