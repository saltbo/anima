"""
modules/planner/core.py — Build iteration plans from gap analysis.

v0.2: Returns structured IterationPlan with prompt, iteration_number,
target_version, and gaps_summary.
"""

from __future__ import annotations

import logging
from typing import Any

from domain.models import IterationPlan
from kernel.roadmap import get_current_version

logger = logging.getLogger("anima.planner")


def plan(
    project_state: dict[str, Any],
    gaps: str,
    history: list[dict[str, Any]],
    iteration_count: int,
) -> IterationPlan:
    """Transform gap analysis into a concrete iteration plan.

    Builds a prompt with dynamic per-iteration data. Static context
    (SOUL.md, VISION.md) is read by the agent itself.
    """
    current_version = get_current_version()
    iteration_number = iteration_count + 1

    # Recent history (last 3)
    recent_history = ""
    if history:
        last_3 = history[-3:]
        entries: list[str] = []
        for h in last_3:
            status = "\u2713" if h.get("success") else "\u2717"
            entries.append(f"  [{status}] {h.get('summary', 'no summary')}")
        recent_history = "\nRECENT ITERATIONS:\n" + "\n".join(entries)

    # Brief state summary (no full file list)
    modules = list(project_state.get("modules", {}).keys())
    state_summary = (
        f"  Modules: {modules or '(none)'}\n"
        f"  Domain: {'exists' if project_state.get('domain_exists') else 'MISSING'}\n"
        f"  Tests: {'\u2713' if project_state.get('has_tests') else '\u2014'}\n"
        f"  Inbox: {len(project_state.get('inbox_items', []))} items"
    )

    # Build gaps summary (first 200 chars)
    gaps_summary = gaps[:200].strip()
    if len(gaps) > 200:
        gaps_summary += "..."

    prompt = (
        "You are Anima. Read these files to understand yourself and your mission:\n"
        "- SOUL.md \u2014 your identity and behavioral principles\n"
        "- VISION.md \u2014 the project vision and architecture\n"
        f"- roadmap/v{current_version}.md \u2014 current version target\n"
        "\n"
        f"Iteration #{iteration_number}. Current roadmap target: v{current_version}.\n"
        "\n"
        "GAPS TO ADDRESS:\n"
        f"{gaps}\n"
        f"{recent_history}\n"
        "\n"
        "STATE SUMMARY:\n"
        f"{state_summary}\n"
        "\n"
        "Execute the single most important next step to advance Anima.\n"
        "After making changes, verify: ruff check . && pyright && python -m pytest\n"
    )

    logger.info("  Plan: iteration #%d, target v%s", iteration_number, current_version)
    logger.debug("  Gaps summary: %s", gaps_summary[:100])

    return IterationPlan(
        prompt=prompt,
        iteration_number=iteration_number,
        target_version=current_version,
        gaps_summary=gaps_summary,
    )
