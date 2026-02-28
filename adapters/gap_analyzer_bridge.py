"""Bridge adapter: modules.gap_analyzer.core → seed-compatible interface.

The gap_analyzer module's analyze() function already accepts and returns
seed-compatible types (str, dict, list). This bridge simply re-exports
analyze() under the name analyze_gaps() expected by kernel/loop.py.
"""

from __future__ import annotations

from typing import Any

from modules.gap_analyzer.core import analyze


def analyze_gaps(
    vision: str,
    project_state: dict[str, Any],
    history: list[dict[str, Any]],
) -> str:
    """Analyze gaps using the gap_analyzer module.

    Matches the seed.analyze_gaps signature so kernel/loop.py
    can call it without changes.
    """
    return analyze(vision, project_state, history)
