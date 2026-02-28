"""Bridge adapter: modules.planner.core -> seed-compatible interface.

The planner module's plan() returns an IterationPlan dataclass.
This bridge extracts the prompt string for compatibility with
kernel/loop.py which expects plan_iteration() to return str.
"""

from __future__ import annotations

from typing import Any

from modules.planner.core import plan


def plan_iteration(
    project_state: dict[str, Any],
    gaps: str,
    history: list[dict[str, Any]],
    iteration_count: int,
) -> str:
    """Plan an iteration using the planner module.

    Matches the seed.plan_iteration signature so kernel/loop.py
    can call it without changes.
    """
    iteration_plan = plan(project_state, gaps, history, iteration_count)
    return iteration_plan.prompt
