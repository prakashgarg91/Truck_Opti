"""Ensure the reorganized repository hierarchy stays on sys.path."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WEB_DIR = ROOT / "apps" / "web"
DESKTOP_DIR = ROOT / "apps" / "desktop"
TRUCKOPTIMUM_DIR = DESKTOP_DIR / "TruckOptimum"

_CANDIDATE_PATHS = [
    WEB_DIR,
    WEB_DIR / "app",
    DESKTOP_DIR,
    TRUCKOPTIMUM_DIR,
]

for path in _CANDIDATE_PATHS:
    if path.exists():
        path_str = str(path)
        if path_str not in sys.path:
            sys.path.insert(0, path_str)
