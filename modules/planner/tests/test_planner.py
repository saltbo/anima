"""Tests for the planner module, validating CONTRACT.md and SPEC.md."""

from __future__ import annotations

from typing import TYPE_CHECKING

from domain.models import (
    ExecutionResult,
    FileInfo,
    Gap,
    GapReport,
    IterationOutcome,
    IterationPlan,
    IterationRecord,
    PlannedAction,
    Priority,
    ProjectState,
    StageResult,
    VerificationReport,
    VerificationStatus,
)
from modules.planner.core import Planner

if TYPE_CHECKING:
    from domain.ports import FileSystemPort


# ── Test fixtures ──────────────────────────────────────────────────────────


class FakeFileSystem:
    """Minimal FileSystemPort stub for testing."""

    def read_file(self, path: str) -> str:
        """Return empty string for any file."""
        return ""

    def write_file(self, path: str, content: str) -> None:
        """No-op."""

    def list_files(self, root: str, pattern: str = "**/*") -> list[FileInfo]:
        """Return empty list."""
        return []

    def file_exists(self, path: str) -> bool:
        """Always return False."""
        return False

    def delete_file(self, path: str) -> None:
        """No-op."""

    def make_directory(self, path: str) -> None:
        """No-op."""


def _make_fs() -> FileSystemPort:
    """Create a fake FileSystemPort for constructor injection."""
    return FakeFileSystem()


def _empty_state() -> ProjectState:
    """Create a ProjectState with no files and all quality passing."""
    return ProjectState(
        files=[],
        quality_results=[],
        recent_iterations=[],
        current_branch="main",
        commit_hash="abc123",
    )


def _make_gap(
    category: str = "roadmap",
    description: str = "Implement something",
    priority: Priority = Priority.HIGH,
    roadmap_version: str = "0.1",
    evidence: str = "Uncompleted roadmap item",
) -> Gap:
    """Create a Gap with defaults for testing."""
    return Gap(
        category=category,
        description=description,
        priority=priority,
        roadmap_version=roadmap_version,
        evidence=evidence,
    )


def _make_gap_report(
    gaps: list[Gap] | None = None,
    most_critical: Gap | None = None,
) -> GapReport:
    """Create a GapReport for testing."""
    if gaps is None:
        gaps = []
    return GapReport(gaps=gaps, most_critical=most_critical, timestamp="2026-02-27T12:00:00Z")


def _make_failure_record(
    gap: Gap,
    outcome: IterationOutcome = IterationOutcome.FAILURE,
) -> IterationRecord:
    """Create a failed IterationRecord for testing repeated failure handling."""
    plan = IterationPlan(
        iteration_id="iter-0001-20260227-120000",
        gap=gap,
        actions=[PlannedAction(description="test", target_files=[], action_type="modify")],
        acceptance_criteria=["test"],
        estimated_risk="low",
    )
    execution = ExecutionResult(
        iteration_id="iter-0001-20260227-120000",
        plan=plan,
        files_changed=[],
        agent_output="",
        success=False,
        error_message="failed",
    )
    verification = VerificationReport(
        iteration_id="iter-0001-20260227-120000",
        stages=[
            StageResult(stage="test", status=VerificationStatus.FAILED, output="", details=[])
        ],
        all_passed=False,
        summary="failed",
    )
    return IterationRecord(
        iteration_id="iter-0001-20260227-120000",
        timestamp="2026-02-27T12:00:00Z",
        gap_addressed=gap,
        plan=plan,
        execution=execution,
        verification=verification,
        outcome=outcome,
        duration_seconds=10.0,
        notes="",
    )


# ── Test 1: No gaps → returns None ────────────────────────────────────────


def test_plan_no_gaps_returns_none() -> None:
    """Plan with no gaps returns None."""
    planner = Planner(_make_fs())
    result = planner.plan(_make_gap_report(), [], _empty_state())
    assert result is None


# ── Test 2: One roadmap gap → valid IterationPlan ─────────────────────────


def test_plan_one_roadmap_gap_produces_plan() -> None:
    """Plan with one roadmap gap produces a valid IterationPlan."""
    gap = _make_gap(description="Create pyproject.toml")
    report = _make_gap_report(gaps=[gap], most_critical=gap)

    planner = Planner(_make_fs())
    plan = planner.plan(report, [], _empty_state())

    assert plan is not None
    assert plan.gap is gap
    assert len(plan.actions) >= 1
    assert plan.actions[0].action_type == "create"
    assert len(plan.acceptance_criteria) >= 3
    assert plan.estimated_risk in ("low", "medium", "high")


# ── Test 3: Quality gap → targets from evidence ──────────────────────────


def test_plan_quality_gap_fix_description() -> None:
    """Plan with quality gap produces an action to fix the failures."""
    gap = _make_gap(
        category="quality",
        description="Quality check failed: ruff",
        priority=Priority.URGENT,
        evidence="E501: line too long in domain/models.py",
    )
    report = _make_gap_report(gaps=[gap], most_critical=gap)

    planner = Planner(_make_fs())
    plan = planner.plan(report, [], _empty_state())

    assert plan is not None
    assert "ruff" in plan.actions[0].description.lower()


# ── Test 4: Protected file filtering ─────────────────────────────────────


def test_protected_files_are_filtered() -> None:
    """Actions targeting seed.py, VISION.md, or kernel/ are removed."""
    from modules.planner.core import filter_protected_actions

    actions = [
        PlannedAction(description="Modify seed", target_files=["seed.py"], action_type="modify"),
        PlannedAction(
            description="Modify vision", target_files=["VISION.md"], action_type="modify"
        ),
        PlannedAction(
            description="Modify kernel", target_files=["kernel/loop.py"], action_type="modify"
        ),
        PlannedAction(
            description="Modify module",
            target_files=["modules/planner/core.py"],
            action_type="modify",
        ),
    ]

    filtered = filter_protected_actions(actions)

    # Only the module action should survive.
    assert len(filtered) == 1
    assert filtered[0].description == "Modify module"


# ── Test 5: Repeated failure handling — skips to next gap ─────────────────


def test_repeated_failures_skip_to_next_gap() -> None:
    """After 3 consecutive failures, planner skips to the next gap."""
    exhausted_gap = _make_gap(description="Failing task")
    fresh_gap = _make_gap(description="Fresh task", priority=Priority.MEDIUM)

    report = _make_gap_report(
        gaps=[exhausted_gap, fresh_gap],
        most_critical=exhausted_gap,
    )

    # Create 3 consecutive failure records for the exhausted gap.
    records = [_make_failure_record(exhausted_gap) for _ in range(3)]

    planner = Planner(_make_fs())
    plan = planner.plan(report, records, _empty_state())

    assert plan is not None
    # Should have switched to the fresh gap.
    assert plan.gap is fresh_gap


# ── Test 6: Risk assessment ──────────────────────────────────────────────


def test_risk_low_for_new_files() -> None:
    """Risk is 'low' when actions only create new files."""
    from modules.planner.core import assess_risk

    actions = [
        PlannedAction(
            description="Create test",
            target_files=["modules/planner/tests/test_planner.py"],
            action_type="create",
        ),
    ]
    assert assess_risk(actions, gap_failed_before=False) == "low"


def test_risk_high_for_domain_changes() -> None:
    """Risk is 'high' when actions modify domain/ files."""
    from modules.planner.core import assess_risk

    actions = [
        PlannedAction(
            description="Modify models",
            target_files=["domain/models.py"],
            action_type="modify",
        ),
    ]
    assert assess_risk(actions, gap_failed_before=False) == "high"


def test_risk_high_when_gap_failed_before() -> None:
    """Risk is 'high' when the gap has failed before."""
    from modules.planner.core import assess_risk

    actions = [
        PlannedAction(description="Simple", target_files=[], action_type="create"),
    ]
    assert assess_risk(actions, gap_failed_before=True) == "high"


def test_risk_medium_for_source_modifications() -> None:
    """Risk is 'medium' when actions modify existing non-domain source files."""
    from modules.planner.core import assess_risk

    actions = [
        PlannedAction(
            description="Modify adapter",
            target_files=["adapters/local_fs.py"],
            action_type="modify",
        ),
    ]
    assert assess_risk(actions, gap_failed_before=False) == "medium"


# ── Test 7: Iteration ID format ──────────────────────────────────────────


def test_iteration_id_format() -> None:
    """Iteration ID follows iter-NNNN-YYYYMMDD-HHMMSS format."""
    gap = _make_gap()
    report = _make_gap_report(gaps=[gap], most_critical=gap)

    planner = Planner(_make_fs())
    plan = planner.plan(report, [], _empty_state())

    assert plan is not None
    assert plan.iteration_id.startswith("iter-0001-")
    parts = plan.iteration_id.split("-")
    assert len(parts) == 4
    assert len(parts[1]) == 4  # NNNN
    assert len(parts[2]) == 8  # YYYYMMDD
    assert len(parts[3]) == 6  # HHMMSS


def test_iteration_id_increments_with_history() -> None:
    """Iteration ID sequence increments based on recent_records count."""
    gap = _make_gap()
    report = _make_gap_report(gaps=[gap], most_critical=gap)
    records = [_make_failure_record(_make_gap(description=f"task-{i}")) for i in range(5)]

    planner = Planner(_make_fs())
    plan = planner.plan(report, records, _empty_state())

    assert plan is not None
    assert plan.iteration_id.startswith("iter-0006-")


# ── Test 8: Acceptance criteria always include ruff and pyright ───────────


def test_acceptance_criteria_include_quality_checks() -> None:
    """Acceptance criteria always include ruff check and pyright strict."""
    gap = _make_gap()
    report = _make_gap_report(gaps=[gap], most_critical=gap)

    planner = Planner(_make_fs())
    plan = planner.plan(report, [], _empty_state())

    assert plan is not None
    criteria_text = " ".join(plan.acceptance_criteria)
    assert "ruff" in criteria_text.lower()
    assert "pyright" in criteria_text.lower()


# ── Test 9: All gaps exhausted → high-risk plan with warning ─────────────


def test_all_gaps_exhausted_returns_high_risk_plan() -> None:
    """When all gaps have failed 3+ times, returns a high-risk plan with warning."""
    gap = _make_gap(description="Only gap")
    report = _make_gap_report(gaps=[gap], most_critical=gap)

    records = [_make_failure_record(gap) for _ in range(3)]

    planner = Planner(_make_fs())
    plan = planner.plan(report, records, _empty_state())

    assert plan is not None
    assert plan.estimated_risk == "high"
    assert "WARNING" in plan.actions[0].description


# ── Test 10: Inbox gap action type defaults to create ────────────────────


def test_inbox_gap_creates_action() -> None:
    """Inbox gap produces an action with type 'create'."""
    gap = _make_gap(category="inbox", description="Add new feature")
    report = _make_gap_report(gaps=[gap], most_critical=gap)

    planner = Planner(_make_fs())
    plan = planner.plan(report, [], _empty_state())

    assert plan is not None
    assert plan.actions[0].action_type == "create"
