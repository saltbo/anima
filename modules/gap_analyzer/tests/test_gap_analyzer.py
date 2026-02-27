"""Tests for the gap_analyzer module, validating CONTRACT.md and SPEC.md."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from domain.models import (
    FileInfo,
    InboxItem,
    Priority,
    ProjectState,
    QualityResult,
    RoadmapItem,
    Vision,
)
from modules.gap_analyzer.core import GapAnalyzer

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


def _empty_vision() -> Vision:
    """Create a Vision with no roadmap items."""
    return Vision(
        identity="Test project",
        principles=["principle1"],
        roadmap_items=[],
        quality_standards=["standard1"],
    )


def _empty_state() -> ProjectState:
    """Create a ProjectState with no files and all quality passing."""
    return ProjectState(
        files=[],
        quality_results=[],
        recent_iterations=[],
        current_branch="main",
        commit_hash="abc123",
    )


# ── Test 1: No gaps → empty GapReport ─────────────────────────────────────


def test_analyze_no_gaps_returns_empty_report() -> None:
    """Analyze with no gaps → empty GapReport."""
    analyzer = GapAnalyzer(_make_fs())
    report = analyzer.analyze(_empty_vision(), _empty_state(), [])

    assert report.gaps == []
    assert report.most_critical is None


# ── Test 2: One uncompleted roadmap item → one roadmap gap ─────────────────


def test_analyze_one_uncompleted_roadmap_item() -> None:
    """Analyze with one uncompleted roadmap item → one roadmap gap."""
    vision = Vision(
        identity="Test",
        principles=[],
        roadmap_items=[
            RoadmapItem(version="0.1", description="Create pyproject.toml", completed=False),
        ],
        quality_standards=[],
    )
    analyzer = GapAnalyzer(_make_fs())
    report = analyzer.analyze(vision, _empty_state(), [])

    assert len(report.gaps) == 1
    gap = report.gaps[0]
    assert gap.category == "roadmap"
    assert gap.description == "Create pyproject.toml"
    assert gap.priority == Priority.URGENT  # v0.1 → URGENT
    assert gap.roadmap_version == "0.1"
    assert "0.1" in gap.evidence
    assert report.most_critical is gap


# ── Test 3: Failing quality check → URGENT quality gap first ──────────────


def test_quality_failure_is_urgent_and_first() -> None:
    """A failing quality check produces an URGENT gap sorted first."""
    vision = Vision(
        identity="Test",
        principles=[],
        roadmap_items=[
            RoadmapItem(version="0.2", description="Implement something", completed=False),
        ],
        quality_standards=[],
    )
    state = ProjectState(
        files=[],
        quality_results=[
            QualityResult(tool="ruff", passed=False, output="E501: line too long", error_count=1),
        ],
        recent_iterations=[],
        current_branch="main",
        commit_hash="abc123",
    )
    analyzer = GapAnalyzer(_make_fs())
    report = analyzer.analyze(vision, state, [])

    # Quality gap should be first.
    assert len(report.gaps) >= 2
    assert report.most_critical is not None
    assert report.most_critical.category == "quality"
    assert report.most_critical.priority == Priority.URGENT
    assert "ruff" in report.most_critical.description


# ── Test 4: Inbox items → inbox gaps with correct priority ─────────────────


def test_inbox_items_become_gaps() -> None:
    """Inbox items become gaps with correct priority mapping."""
    inbox = [
        InboxItem(
            filename="20260227-test.md",
            title="Add feature X",
            what="Implement feature X in module Y",
            why="Users need it",
            priority=Priority.HIGH,
            constraints="",
        ),
    ]
    analyzer = GapAnalyzer(_make_fs())
    report = analyzer.analyze(_empty_vision(), _empty_state(), inbox)

    assert len(report.gaps) == 1
    gap = report.gaps[0]
    assert gap.category == "inbox"
    assert "Add feature X" in gap.description
    assert "Implement feature X" in gap.description
    assert gap.priority == Priority.HIGH
    assert gap.roadmap_version == "inbox"
    assert gap.evidence == "Users need it"


# ── Test 5: Priority sorting: quality > inbox > roadmap ────────────────────


def test_priority_sorting_quality_inbox_roadmap() -> None:
    """Within the same priority level, quality > inbox > roadmap."""
    vision = Vision(
        identity="Test",
        principles=[],
        roadmap_items=[
            RoadmapItem(version="0.1", description="Roadmap task", completed=False),
        ],
        quality_standards=[],
    )
    state = ProjectState(
        files=[],
        quality_results=[
            QualityResult(tool="pyright", passed=False, output="error", error_count=1),
        ],
        recent_iterations=[],
        current_branch="main",
        commit_hash="abc123",
    )
    inbox = [
        InboxItem(
            filename="test.md",
            title="Inbox task",
            what="Do something urgent",
            why="Important",
            priority=Priority.URGENT,
            constraints="",
        ),
    ]
    analyzer = GapAnalyzer(_make_fs())
    report = analyzer.analyze(vision, state, inbox)

    # All three should be URGENT. Sort order within URGENT: quality, inbox, roadmap.
    categories = [g.category for g in report.gaps]
    assert categories.index("quality") < categories.index("inbox")
    assert categories.index("inbox") < categories.index("roadmap")


# ── Test 6: LOW inbox items are promoted to MEDIUM ─────────────────────────


def test_low_inbox_items_promoted_to_medium() -> None:
    """LOW inbox items are promoted to at least MEDIUM."""
    inbox = [
        InboxItem(
            filename="test.md",
            title="Minor fix",
            what="Fix a small thing",
            why="Nice to have",
            priority=Priority.LOW,
            constraints="",
        ),
    ]
    analyzer = GapAnalyzer(_make_fs())
    report = analyzer.analyze(_empty_vision(), _empty_state(), inbox)

    assert len(report.gaps) == 1
    assert report.gaps[0].priority == Priority.MEDIUM


# ── Test 7: Duplicate detection — inbox overrides matching roadmap gap ─────


def test_duplicate_detection_inbox_overrides_roadmap() -> None:
    """When an inbox item matches a roadmap item, the roadmap gap is removed."""
    vision = Vision(
        identity="Test",
        principles=[],
        roadmap_items=[
            RoadmapItem(version="0.1", description="Create pyproject.toml", completed=False),
            RoadmapItem(version="0.1", description="Implement models", completed=False),
        ],
        quality_standards=[],
    )
    inbox = [
        InboxItem(
            filename="test.md",
            title="Create pyproject.toml",
            what="Create pyproject.toml with proper config",
            why="Foundation needed",
            priority=Priority.HIGH,
            constraints="",
        ),
    ]
    analyzer = GapAnalyzer(_make_fs())
    report = analyzer.analyze(vision, _empty_state(), inbox)

    # "Create pyproject.toml" roadmap gap should be removed (duplicated by inbox).
    roadmap_descriptions = [g.description for g in report.gaps if g.category == "roadmap"]

    # The roadmap gap for "Create pyproject.toml" should be gone.
    assert "Create pyproject.toml" not in roadmap_descriptions
    # The "Implement models" roadmap gap should remain.
    assert "Implement models" in roadmap_descriptions
    # The inbox gap should be present.
    inbox_gaps = [g for g in report.gaps if g.category == "inbox"]
    assert len(inbox_gaps) == 1
    assert "pyproject.toml" in inbox_gaps[0].description


# ── Test 8: Timestamp is valid ISO 8601 format ────────────────────────────


def test_timestamp_is_valid_iso8601() -> None:
    """GapReport.timestamp is a valid ISO 8601 UTC timestamp."""
    analyzer = GapAnalyzer(_make_fs())
    report = analyzer.analyze(_empty_vision(), _empty_state(), [])

    # Should parse without error.
    ts = report.timestamp
    assert ts.endswith("Z")
    # Parse to verify format: YYYY-MM-DDTHH:MM:SSZ
    parsed = datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ")
    # Should be roughly "now" (within a minute).
    now = datetime.now(UTC)
    delta = abs((now - parsed.replace(tzinfo=UTC)).total_seconds())
    assert delta < 60


# ── Additional: completed roadmap items are ignored ────────────────────────


def test_completed_roadmap_items_ignored() -> None:
    """Completed roadmap items do not produce gaps."""
    vision = Vision(
        identity="Test",
        principles=[],
        roadmap_items=[
            RoadmapItem(version="0.1", description="Done task", completed=True),
            RoadmapItem(version="0.1", description="Todo task", completed=False),
        ],
        quality_standards=[],
    )
    analyzer = GapAnalyzer(_make_fs())
    report = analyzer.analyze(vision, _empty_state(), [])

    assert len(report.gaps) == 1
    assert report.gaps[0].description == "Todo task"


# ── Additional: version priority mapping ───────────────────────────────────


def test_version_priority_mapping() -> None:
    """Roadmap version → priority: v0.1=URGENT, v0.2=HIGH, v0.3=MEDIUM, v0.5+=LOW."""
    vision = Vision(
        identity="Test",
        principles=[],
        roadmap_items=[
            RoadmapItem(version="0.1", description="v01 task", completed=False),
            RoadmapItem(version="0.2", description="v02 task", completed=False),
            RoadmapItem(version="0.3", description="v03 task", completed=False),
            RoadmapItem(version="0.5", description="v05 task", completed=False),
            RoadmapItem(version="1.0", description="v10 task", completed=False),
        ],
        quality_standards=[],
    )
    analyzer = GapAnalyzer(_make_fs())
    report = analyzer.analyze(vision, _empty_state(), [])

    gap_map = {g.description: g.priority for g in report.gaps}
    assert gap_map["v01 task"] == Priority.URGENT
    assert gap_map["v02 task"] == Priority.HIGH
    assert gap_map["v03 task"] == Priority.MEDIUM
    assert gap_map["v05 task"] == Priority.LOW
    assert gap_map["v10 task"] == Priority.LOW
