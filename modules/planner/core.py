"""Planner module — translates a GapReport into a concrete IterationPlan.

Picks the most critical gap, checks failure history to avoid repeating mistakes,
generates file-level actions with acceptance criteria, and assesses risk.

This module depends only on domain/ types and has zero external imports beyond stdlib.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from domain.models import (
    Gap,
    GapReport,
    IterationOutcome,
    IterationPlan,
    IterationRecord,
    PlannedAction,
    ProjectState,
)

if TYPE_CHECKING:
    from domain.ports import FileSystemPort

# Files that Anima must never modify.
_PROTECTED_PATHS: set[str] = {"seed.py", "VISION.md"}
_PROTECTED_PREFIXES: tuple[str, ...] = ("kernel/",)

# Maximum consecutive failures before skipping a gap.
_MAX_CONSECUTIVE_FAILURES = 3


def _is_protected(path: str) -> bool:
    """Return True if the path is protected from modification."""
    if path in _PROTECTED_PATHS:
        return True
    return any(path.startswith(prefix) for prefix in _PROTECTED_PREFIXES)


def _count_consecutive_failures(
    gap: Gap,
    recent_records: list[IterationRecord],
) -> int:
    """Count how many consecutive recent iterations failed on the same gap."""
    count = 0
    for record in recent_records[:5]:
        if (
            record.gap_addressed.category == gap.category
            and record.gap_addressed.description == gap.description
            and record.outcome in (IterationOutcome.FAILURE, IterationOutcome.ROLLBACK)
        ):
            count += 1
        else:
            break
    return count


def assess_risk(actions: list[PlannedAction], gap_failed_before: bool) -> str:
    """Assess risk level based on action targets and failure history."""
    if gap_failed_before:
        return "high"

    for action in actions:
        for path in action.target_files:
            if path.startswith("domain/"):
                return "high"

    for action in actions:
        if action.action_type == "modify":
            for path in action.target_files:
                if not path.startswith("modules/") or "/tests/" not in path:
                    return "medium"

    return "low"


def _generate_iteration_id(recent_records: list[IterationRecord]) -> str:
    """Generate an iteration ID: iter-NNNN-YYYYMMDD-HHMMSS."""
    sequence = len(recent_records) + 1
    now = datetime.now(UTC)
    timestamp = now.strftime("%Y%m%d-%H%M%S")
    return f"iter-{sequence:04d}-{timestamp}"


def _actions_for_quality_gap(gap: Gap) -> list[PlannedAction]:
    """Generate actions for a quality-category gap."""
    return [
        PlannedAction(
            description=f"Fix {gap.description.split(': ', 1)[-1]} failures",
            target_files=[],
            action_type="modify",
        ),
    ]


def _actions_for_inbox_gap(gap: Gap) -> list[PlannedAction]:
    """Generate actions for an inbox-category gap."""
    return [
        PlannedAction(
            description=gap.description,
            target_files=[],
            action_type="create",
        ),
    ]


def _actions_for_roadmap_gap(gap: Gap) -> list[PlannedAction]:
    """Generate actions for a roadmap-category gap."""
    desc_lower = gap.description.lower()

    if (
        desc_lower.startswith("create ")
        or desc_lower.startswith("implement ")
        or desc_lower.startswith("test")
        or "test" in desc_lower
    ):
        action_type = "create"
    else:
        action_type = "modify"

    return [
        PlannedAction(
            description=gap.description,
            target_files=[],
            action_type=action_type,
        ),
    ]


def _generate_actions(gap: Gap) -> list[PlannedAction]:
    """Generate planned actions based on the gap category."""
    if gap.category == "quality":
        return _actions_for_quality_gap(gap)
    if gap.category == "inbox":
        return _actions_for_inbox_gap(gap)
    return _actions_for_roadmap_gap(gap)


def filter_protected_actions(
    actions: list[PlannedAction],
) -> list[PlannedAction]:
    """Remove actions that target protected files."""
    filtered: list[PlannedAction] = []
    for action in actions:
        safe_files = [f for f in action.target_files if not _is_protected(f)]
        # Keep the action if it had no target files or still has some after filtering.
        if not action.target_files or safe_files:
            filtered.append(
                PlannedAction(
                    description=action.description,
                    target_files=safe_files,
                    action_type=action.action_type,
                )
            )
    return filtered


def _acceptance_criteria(gap: Gap) -> list[str]:
    """Generate acceptance criteria for the plan."""
    criteria = [
        "All new/modified files pass ruff check",
        "All new/modified files pass pyright strict",
    ]
    # Add gap-specific criterion.
    criteria.append(f"Gap resolved: {gap.description}")
    return criteria


class Planner:
    """Translates a GapReport into a concrete IterationPlan.

    Constructor-injected FileSystemPort allows reading module contracts and specs
    for planning context.
    """

    def __init__(self, fs: FileSystemPort) -> None:
        self._fs = fs

    def plan(
        self,
        gap_report: GapReport,
        recent_records: list[IterationRecord],
        state: ProjectState,
    ) -> IterationPlan | None:
        """Create an iteration plan for the most critical gap.

        Returns None if there are no gaps or all actions target protected files.
        """
        if gap_report.most_critical is None:
            return None

        selected_gap = gap_report.most_critical
        gap_failed_before = False

        # Check failure history and potentially skip exhausted gaps.
        if recent_records:
            failures = _count_consecutive_failures(selected_gap, recent_records)
            if failures >= _MAX_CONSECUTIVE_FAILURES:
                gap_failed_before = True
                # Try to find an alternative gap.
                alternative = self._find_alternative_gap(gap_report, recent_records)
                if alternative is not None:
                    selected_gap = alternative
                    gap_failed_before = False
                # If no alternative, proceed with original gap at high risk.

        actions = _generate_actions(selected_gap)
        actions = filter_protected_actions(actions)

        if not actions:
            return None

        # Add warning note for exhausted gaps.
        if gap_failed_before and actions:
            warning = PlannedAction(
                description=(
                    f"WARNING: Gap has failed {_MAX_CONSECUTIVE_FAILURES}+ "
                    f"times consecutively. {actions[0].description}"
                ),
                target_files=actions[0].target_files,
                action_type=actions[0].action_type,
            )
            actions = [warning, *actions[1:]]

        risk = assess_risk(actions, gap_failed_before)
        criteria = _acceptance_criteria(selected_gap)
        iteration_id = _generate_iteration_id(recent_records)

        return IterationPlan(
            iteration_id=iteration_id,
            gap=selected_gap,
            actions=actions,
            acceptance_criteria=criteria,
            estimated_risk=risk,
        )

    def _find_alternative_gap(
        self,
        gap_report: GapReport,
        recent_records: list[IterationRecord],
    ) -> Gap | None:
        """Find the first gap that hasn't failed 3+ times consecutively."""
        for gap in gap_report.gaps:
            if gap == gap_report.most_critical:
                continue
            failures = _count_consecutive_failures(gap, recent_records)
            if failures < _MAX_CONSECUTIVE_FAILURES:
                return gap
        return None
