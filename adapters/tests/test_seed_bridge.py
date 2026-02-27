"""Tests for the seed bridge adapter."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

import pytest

from adapters.local_fs import LocalFileSystem
from adapters.seed_bridge import (
    SeedBridge,
    build_iteration_record,
    build_project_state,
    build_vision,
    convert_quality_results,
    current_version,
    format_gap_report,
    parse_inbox_item,
    parse_roadmap_items,
)
from domain.models import (
    Gap,
    GapReport,
    IterationOutcome,
    Priority,
    RoadmapItem,
    VerificationStatus,
)

if TYPE_CHECKING:
    from pathlib import Path


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def tmp_project(tmp_path: Path) -> Path:
    """Create a minimal project structure in a temp directory."""
    roadmap = tmp_path / "roadmap"
    roadmap.mkdir()

    (roadmap / "v0.1.md").write_text(
        "# v0.1\n\n- [x] Create pyproject.toml\n- [x] Create domain/models.py\n"
    )
    (roadmap / "v0.2.md").write_text(
        "# v0.2\n\n"
        "- [x] Implement gap_analyzer/core.py\n"
        "- [ ] Seed delegates gap analysis\n"
        "- [ ] Seed delegates reporting\n"
    )

    inbox = tmp_path / "inbox"
    inbox.mkdir()
    (inbox / "20260227-test-item.md").write_text(
        "# Test Request\n\n"
        "## What\nDo something useful.\n\n"
        "## Why\nBecause it matters.\n\n"
        "## Priority\nhigh\n\n"
        "## Constraints\nKeep it simple.\n"
    )

    iterations = tmp_path / "iterations"
    iterations.mkdir()

    return tmp_path


@pytest.fixture()
def fs(tmp_project: Path) -> LocalFileSystem:
    """LocalFileSystem rooted at the temp project."""
    return LocalFileSystem(str(tmp_project))


# ---------------------------------------------------------------------------
# parse_roadmap_items
# ---------------------------------------------------------------------------


class TestParseRoadmapItems:
    """Tests for parse_roadmap_items."""

    def test_parses_checked_and_unchecked(self, fs: LocalFileSystem) -> None:
        """Should parse both checked and unchecked items."""
        items = parse_roadmap_items(fs)
        assert len(items) > 0
        completed = [i for i in items if i.completed]
        pending = [i for i in items if not i.completed]
        assert len(completed) >= 2
        assert len(pending) >= 2

    def test_versions_extracted_correctly(self, fs: LocalFileSystem) -> None:
        """Each item should have the correct version from filename."""
        items = parse_roadmap_items(fs)
        v01 = [i for i in items if i.version == "0.1"]
        v02 = [i for i in items if i.version == "0.2"]
        assert len(v01) == 2
        assert len(v02) == 3

    def test_empty_when_no_roadmap_dir(self, tmp_path: Path) -> None:
        """Should return empty list when roadmap/ doesn't exist."""
        fs_empty = LocalFileSystem(str(tmp_path))
        assert parse_roadmap_items(fs_empty) == []


# ---------------------------------------------------------------------------
# build_vision
# ---------------------------------------------------------------------------


class TestBuildVision:
    """Tests for build_vision."""

    def test_creates_vision_with_roadmap_items(self) -> None:
        """Should create a Vision with the given roadmap items."""
        items = [
            RoadmapItem(version="0.1", description="Task A", completed=True),
            RoadmapItem(version="0.2", description="Task B", completed=False),
        ]
        vision = build_vision(items)
        assert vision.roadmap_items == items
        assert "Anima" in vision.identity


# ---------------------------------------------------------------------------
# convert_quality_results
# ---------------------------------------------------------------------------


class TestConvertQualityResults:
    """Tests for convert_quality_results."""

    def test_converts_passing_results(self) -> None:
        """Should convert passing quality results."""
        state: dict[str, Any] = {
            "quality_results": {
                "ruff_lint": {"passed": True, "output": "ok"},
                "pyright": {"passed": True, "output": "0 errors"},
            }
        }
        results = convert_quality_results(state)
        assert len(results) == 2
        assert all(r.passed for r in results)

    def test_converts_failing_tests(self) -> None:
        """Should include test_results as a quality result."""
        state: dict[str, Any] = {
            "quality_results": {},
            "test_results": {"passed": False, "output": "1 failed"},
        }
        results = convert_quality_results(state)
        assert len(results) == 1
        assert results[0].tool == "pytest"
        assert not results[0].passed

    def test_handles_missing_quality_results(self) -> None:
        """Should return empty list when no quality data exists."""
        assert convert_quality_results({}) == []


# ---------------------------------------------------------------------------
# build_project_state
# ---------------------------------------------------------------------------


class TestBuildProjectState:
    """Tests for build_project_state."""

    def test_builds_with_quality_results(self) -> None:
        """Should populate quality_results from the state dict."""
        state_dict: dict[str, Any] = {
            "quality_results": {
                "ruff_lint": {"passed": True, "output": ""},
            }
        }
        ps = build_project_state(state_dict)
        assert len(ps.quality_results) == 1
        assert ps.quality_results[0].tool == "ruff_lint"


# ---------------------------------------------------------------------------
# parse_inbox_item
# ---------------------------------------------------------------------------


class TestParseInboxItem:
    """Tests for parse_inbox_item."""

    def test_parses_standard_inbox_format(self) -> None:
        """Should parse title, what, why, priority, constraints."""
        item_dict: dict[str, Any] = {
            "filename": "20260227-test.md",
            "content": (
                "# My Request\n\n"
                "## What\nDo the thing.\n\n"
                "## Why\nBecause reasons.\n\n"
                "## Priority\nhigh\n\n"
                "## Constraints\nKeep it small.\n"
            ),
        }
        item = parse_inbox_item(item_dict)
        assert item.title == "My Request"
        assert item.what == "Do the thing."
        assert item.why == "Because reasons."
        assert item.priority == Priority.HIGH
        assert item.constraints == "Keep it small."

    def test_defaults_to_medium_priority(self) -> None:
        """Should default to MEDIUM when priority is unrecognized."""
        item_dict: dict[str, Any] = {
            "filename": "test.md",
            "content": "# Test\n\n## Priority\nwhatever\n",
        }
        item = parse_inbox_item(item_dict)
        assert item.priority == Priority.MEDIUM

    def test_handles_empty_content(self) -> None:
        """Should not crash on empty content."""
        item = parse_inbox_item({"filename": "empty.md", "content": ""})
        assert item.filename == "empty.md"


# ---------------------------------------------------------------------------
# current_version
# ---------------------------------------------------------------------------


class TestCurrentVersion:
    """Tests for current_version."""

    def test_returns_first_incomplete_version(self, fs: LocalFileSystem) -> None:
        """Should return v0.2 since v0.1 is all checked."""
        assert current_version(fs) == "0.2"

    def test_returns_0_1_when_no_roadmap(self, tmp_path: Path) -> None:
        """Should default to 0.1 when no roadmap exists."""
        fs_empty = LocalFileSystem(str(tmp_path))
        assert current_version(fs_empty) == "0.1"


# ---------------------------------------------------------------------------
# format_gap_report
# ---------------------------------------------------------------------------


class TestFormatGapReport:
    """Tests for format_gap_report."""

    def test_no_gaps_returns_marker(self) -> None:
        """Should return NO_GAPS when there are no gaps."""
        report = GapReport(gaps=[], most_critical=None, timestamp="")
        assert format_gap_report(report, "0.2") == "NO_GAPS"

    def test_roadmap_gaps_formatted(self) -> None:
        """Should format roadmap gaps as checklist."""
        gap = Gap(
            category="roadmap",
            description="Implement feature X",
            priority=Priority.HIGH,
            roadmap_version="0.2",
            evidence="Uncompleted",
        )
        report = GapReport(gaps=[gap], most_critical=gap, timestamp="")
        text = format_gap_report(report, "0.2")
        assert "UNCOMPLETED ROADMAP ITEMS for v0.2 (1):" in text
        assert "Implement feature X" in text

    def test_quality_gaps_formatted(self) -> None:
        """Should format quality failures with tool-specific headers."""
        gap = Gap(
            category="quality",
            description="Quality check failed: pyright",
            priority=Priority.URGENT,
            roadmap_version="0.2",
            evidence="3 errors found",
        )
        report = GapReport(gaps=[gap], most_critical=gap, timestamp="")
        text = format_gap_report(report, "0.2")
        assert "PYRIGHT TYPE ERRORS:" in text

    def test_inbox_gaps_formatted(self) -> None:
        """Should format inbox gaps as human requests."""
        gap = Gap(
            category="inbox",
            description="Add logging: We need better observability",
            priority=Priority.HIGH,
            roadmap_version="inbox",
            evidence="System is hard to debug",
        )
        report = GapReport(gaps=[gap], most_critical=gap, timestamp="")
        text = format_gap_report(report, "0.2")
        assert "HUMAN REQUEST:" in text
        assert "Add logging" in text


# ---------------------------------------------------------------------------
# build_iteration_record
# ---------------------------------------------------------------------------


class TestBuildIterationRecord:
    """Tests for build_iteration_record."""

    def test_success_record(self) -> None:
        """Should build a SUCCESS record for passing verification."""
        record = build_iteration_record(
            iteration_id="0001",
            gaps="Some gap",
            execution_result={"success": True, "output": "done", "errors": ""},
            verification={"passed": True, "improvements": ["Tests pass"], "issues": []},
            elapsed=10.5,
        )
        assert record.iteration_id == "0001"
        assert record.outcome == IterationOutcome.SUCCESS
        assert record.duration_seconds == 10.5
        assert record.verification.all_passed is True

    def test_failure_record(self) -> None:
        """Should build a FAILURE record for failing verification."""
        record = build_iteration_record(
            iteration_id="0002",
            gaps="Another gap",
            execution_result={"success": False, "output": "", "errors": "crash"},
            verification={
                "passed": False,
                "improvements": [],
                "issues": ["Lint failed"],
            },
            elapsed=5.0,
        )
        assert record.outcome == IterationOutcome.FAILURE
        assert record.verification.all_passed is False
        assert any(s.status == VerificationStatus.FAILED for s in record.verification.stages)


# ---------------------------------------------------------------------------
# SeedBridge integration
# ---------------------------------------------------------------------------


class TestSeedBridgeAnalyzeGaps:
    """Integration tests for SeedBridge.analyze_gaps."""

    def test_returns_gap_text(self, tmp_project: Path) -> None:
        """Should produce gap text from roadmap and inbox items."""
        bridge = SeedBridge(str(tmp_project))
        state: dict[str, Any] = {
            "quality_results": {},
            "inbox_items": [
                {
                    "filename": "20260227-test-item.md",
                    "content": (
                        "# Test Request\n\n"
                        "## What\nDo something useful.\n\n"
                        "## Why\nBecause it matters.\n\n"
                        "## Priority\nhigh\n"
                    ),
                }
            ],
        }
        result = bridge.analyze_gaps("vision text", state, [])
        assert result != "NO_GAPS"
        assert "Seed delegates" in result

    def test_no_gaps_when_all_done(self, tmp_path: Path) -> None:
        """Should return NO_GAPS when all roadmap items are complete."""
        roadmap = tmp_path / "roadmap"
        roadmap.mkdir()
        (roadmap / "v0.1.md").write_text("# v0.1\n\n- [x] All done\n")
        (tmp_path / "iterations").mkdir()

        bridge = SeedBridge(str(tmp_path))
        result = bridge.analyze_gaps("vision", {"quality_results": {}}, [])
        assert result == "NO_GAPS"


class TestSeedBridgeRecordIteration:
    """Integration tests for SeedBridge.record_iteration."""

    def test_persists_record(self, tmp_project: Path) -> None:
        """Should write a JSON file to iterations/."""
        bridge = SeedBridge(str(tmp_project))
        report = bridge.record_iteration(
            iteration_id="test-0001",
            gaps="Some gaps",
            execution_result={"success": True, "output": "done", "errors": ""},
            verification={
                "passed": True,
                "improvements": ["All passing"],
                "issues": [],
            },
            elapsed=8.0,
        )
        assert report["success"] is True
        assert report["id"] == "test-0001"

        # Verify file was written.
        record_file = tmp_project / "iterations" / "test-0001.json"
        assert record_file.exists()
        data = json.loads(record_file.read_text())
        assert data["iteration_id"] == "test-0001"

    def test_duplicate_raises(self, tmp_project: Path) -> None:
        """Should raise ValueError if the same iteration_id is saved twice."""
        bridge = SeedBridge(str(tmp_project))
        exec_result: dict[str, Any] = {"success": True, "output": "", "errors": ""}
        verification: dict[str, Any] = {
            "passed": True,
            "improvements": [],
            "issues": [],
        }
        bridge.record_iteration("dup-001", "gaps", exec_result, verification, 1.0)
        with pytest.raises(ValueError, match="already exists"):
            bridge.record_iteration("dup-001", "gaps", exec_result, verification, 1.0)
