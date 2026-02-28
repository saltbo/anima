"""
kernel/state.py — Persistent state and iteration history.

Manages the .anima/state.json file and loads iteration logs
from the iterations/ directory.
"""

from __future__ import annotations

import json
from typing import Any

from kernel.config import ITERATIONS_DIR, STATE_FILE


def load_state() -> dict[str, Any]:
    """Load persistent state from disk."""
    if STATE_FILE.exists():
        result: dict[str, Any] = json.loads(STATE_FILE.read_text())
        return result
    return {
        "iteration_count": 0,
        "consecutive_failures": 0,
        "last_iteration": None,
        "completed_items": [],
        "module_versions": {},
        "status": "sleep",  # alive | sleep | paused
        "total_cost_usd": 0,
        "total_tokens": 0,
        "total_elapsed_seconds": 0,
        "current_milestone": "v0.0.0",
    }


def save_state(state: dict[str, Any]) -> None:
    """Persist state to disk atomically (write to temp, then rename)."""
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2, ensure_ascii=False))
    tmp.rename(STATE_FILE)


def load_history() -> list[dict[str, Any]]:
    """Load all past iteration reports."""
    history: list[dict[str, Any]] = []
    if ITERATIONS_DIR.exists():
        for log_file in sorted(ITERATIONS_DIR.glob("*.json")):
            try:
                entry: dict[str, Any] = json.loads(log_file.read_text())
                history.append(entry)
            except (OSError, json.JSONDecodeError):
                continue
    return history
