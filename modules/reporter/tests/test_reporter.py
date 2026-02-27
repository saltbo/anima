"""Tests for the reporter module, validating CONTRACT.md and SPEC.md."""

from __future__ import annotations

import json

from domain.models import (
    ExecutionResult,
    FileChange,
    FileInfo,
    Gap,
    IterationOutcome,
    IterationPlan,
    IterationRecord,
    PlannedAction,
    Priority,
    StageResult,
    VerificationReport,
    VerificationStatus,
)
from modules.reporter.core import Reporter

# ── Test fixtures ──────────────────────────────────────────────────────────


class FakeFileSystem:
    """In-memory FileSystemPort for testing the reporter."""

    def __init__(self) -> None:
        self._files: dict[str, str] = {}
        self.created_dirs: set[str] = set()

    def read_file(self, path: str) -> str:
        """Read file content from memory."""
        if path not in self._files:
            msg = f"File not found: {path}"
            raise FileNotFoundError(msg)
        return self._files[path]

    def write_file(self, path: str, content: str) -> None:
        """Write file content to memory."""
        self._files[path] = content

    def list_files(self, root: str, pattern: str = "**/*") -> list[FileInfo]:
        """List files under root matching the pattern suffix."""
        result: list[FileInfo] = []
        suffix = ""
        if pattern.startswith("*"):
            suffix = pattern.lstrip("*")
        for path in sorted(self._files):
            if path.startswith(root) and (not suffix or path.endswith(suffix)):
                result.append(
                    FileInfo(path=path, size_bytes=len(self._files[path]), last_modified="")
                )
        return result

    def file_exists(self, path: str) -> bool:
        """Check if a file exists in memory."""
        return path in self._files

    def delete_file(self, path: str) -> None:
        """Delete a file from memory."""
        self._files.pop(path, None)

    def make_directory(self, path: str) -> None:
        """Record that a directory was created."""
        self.created_dirs.add(path)


def _make_fs() -> FakeFileSystem:
    """Create a fresh in-memory FileSystemPort."""
    return FakeFileSystem()


def _sample_gap() -> Gap:
    """Create a sample Gap for testing."""
    return Gap(
        category="roadmap",
        description="Create pyproject.toml",
        priority=Priority.HIGH,
        roadmap_version="v0.1",
        evidence="Uncompleted roadmap item for v0.1",
    )


def _sample_plan(iteration_id: str = "iter-0001-20260227-120000") -> IterationPlan:
    """Create a sample IterationPlan for testing."""
    return IterationPlan(
        iteration_id=iteration_id,
        gap=_sample_gap(),
        actions=[
            PlannedAction(
                description="Create pyproject.toml",
                target_files=["pyproject.toml"],
                action_type="create",
            ),
        ],
        acceptance_criteria=["pyproject.toml exists", "ruff config present"],
        estimated_risk="low",
    )


def _sample_execution(iteration_id: str = "iter-0001-20260227-120000") -> ExecutionResult:
    """Create a sample ExecutionResult for testing."""
    return ExecutionResult(
        iteration_id=iteration_id,
        plan=_sample_plan(iteration_id),
        files_changed=[
            FileChange(path="pyproject.toml", change_type="created", diff_summary="+50 lines"),
        ],
        agent_output="Created pyproject.toml successfully",
        success=True,
        error_message="",
    )


def _sample_verification(iteration_id: str = "iter-0001-20260227-120000") -> VerificationReport:
    """Create a sample VerificationReport for testing."""
    return VerificationReport(
        iteration_id=iteration_id,
        stages=[
            StageResult(stage="ruff", status=VerificationStatus.PASSED, output="OK", details=[]),
            StageResult(
                stage="pyright", status=VerificationStatus.PASSED, output="OK", details=[]
            ),
            StageResult(stage="pytest", status=VerificationStatus.PASSED, output="OK", details=[]),
        ],
        all_passed=True,
        summary="All checks passed",
    )


def _sample_record(
    iteration_id: str = "iter-0001-20260227-120000",
    timestamp: str = "2026-02-27T12:00:00Z",
) -> IterationRecord:
    """Create a sample IterationRecord for testing."""
    return IterationRecord(
        iteration_id=iteration_id,
        timestamp=timestamp,
        gap_addressed=_sample_gap(),
        plan=_sample_plan(iteration_id),
        execution=_sample_execution(iteration_id),
        verification=_sample_verification(iteration_id),
        outcome=IterationOutcome.SUCCESS,
        duration_seconds=42.5,
        notes="",
    )


# ── Test 1: Save record → file created at correct path with valid JSON ────


def test_save_record_creates_json_file() -> None:
    """Save a record → file is created at correct path with valid JSON."""
    fs = _make_fs()
    reporter = Reporter(fs)
    record = _sample_record()

    path = reporter.save_record(record)

    assert path == "iterations/iter-0001-20260227-120000.json"
    assert fs.file_exists(path)

    # Content should be valid JSON.
    content = fs.read_file(path)
    data = json.loads(content)
    assert data["iteration_id"] == "iter-0001-20260227-120000"


# ── Test 2: Load recent records → sorted by timestamp descending ──────────


def test_load_recent_records_sorted_by_timestamp() -> None:
    """Load recent records → returns records sorted by timestamp descending."""
    fs = _make_fs()
    reporter = Reporter(fs)

    r1 = _sample_record("iter-0001", "2026-02-27T10:00:00Z")
    r2 = _sample_record("iter-0002", "2026-02-27T12:00:00Z")
    r3 = _sample_record("iter-0003", "2026-02-27T11:00:00Z")

    reporter.save_record(r1)
    reporter.save_record(r2)
    reporter.save_record(r3)

    records = reporter.load_recent_records(3)

    assert len(records) == 3
    assert records[0].iteration_id == "iter-0002"  # newest
    assert records[1].iteration_id == "iter-0003"
    assert records[2].iteration_id == "iter-0001"  # oldest


# ── Test 3: Save duplicate → raises ValueError ───────────────────────────


def test_save_duplicate_raises_value_error() -> None:
    """Save duplicate → raises ValueError."""
    fs = _make_fs()
    reporter = Reporter(fs)
    record = _sample_record()

    reporter.save_record(record)

    try:
        reporter.save_record(record)
        raised = False
    except ValueError as exc:
        raised = True
        assert "already exists" in str(exc)

    assert raised, "Expected ValueError for duplicate record"


# ── Test 4: Load from empty directory → returns empty list ────────────────


def test_load_from_empty_directory_returns_empty() -> None:
    """Load from empty directory → returns empty list."""
    fs = _make_fs()
    reporter = Reporter(fs)

    records = reporter.load_recent_records(5)
    assert records == []


# ── Test 5: Round-trip: save then load → fields match ─────────────────────


def test_round_trip_save_then_load() -> None:
    """Round-trip: save then load → record fields match original."""
    fs = _make_fs()
    reporter = Reporter(fs)
    original = _sample_record()

    reporter.save_record(original)
    loaded = reporter.load_recent_records(1)

    assert len(loaded) == 1
    rec = loaded[0]

    assert rec.iteration_id == original.iteration_id
    assert rec.timestamp == original.timestamp
    assert rec.gap_addressed.category == original.gap_addressed.category
    assert rec.gap_addressed.description == original.gap_addressed.description
    assert rec.gap_addressed.priority == original.gap_addressed.priority
    assert rec.plan.iteration_id == original.plan.iteration_id
    assert len(rec.plan.actions) == len(original.plan.actions)
    assert rec.execution.success == original.execution.success
    assert rec.verification.all_passed == original.verification.all_passed
    assert rec.outcome == original.outcome
    assert rec.duration_seconds == original.duration_seconds
    assert rec.notes == original.notes


# ── Test 6: Enum serialization → stored as strings ───────────────────────


def test_enum_serialized_as_strings() -> None:
    """Priority, IterationOutcome stored as strings in JSON."""
    fs = _make_fs()
    reporter = Reporter(fs)
    record = _sample_record()

    path = reporter.save_record(record)
    content = fs.read_file(path)
    data = json.loads(content)

    # Priority should be string "high", not the enum repr.
    assert data["gap_addressed"]["priority"] == "high"
    # IterationOutcome should be string "success".
    assert data["outcome"] == "success"
    # VerificationStatus should be string "passed".
    assert data["verification"]["stages"][0]["status"] == "passed"


# ── Test 7: Enum deserialization → reconstructed to correct enum values ───


def test_enum_deserialized_to_enum_values() -> None:
    """Strings reconstructed to correct enum values on load."""
    fs = _make_fs()
    reporter = Reporter(fs)
    record = _sample_record()

    reporter.save_record(record)
    loaded = reporter.load_recent_records(1)

    rec = loaded[0]
    assert rec.gap_addressed.priority is Priority.HIGH
    assert rec.outcome is IterationOutcome.SUCCESS
    assert rec.verification.stages[0].status is VerificationStatus.PASSED


# ── Test 8: count parameter respected ────────────────────────────────────


def test_count_parameter_respected() -> None:
    """Load 2 from 5 → returns exactly 2."""
    fs = _make_fs()
    reporter = Reporter(fs)

    for i in range(5):
        record = _sample_record(
            f"iter-{i:04d}",
            f"2026-02-27T1{i}:00:00Z",
        )
        reporter.save_record(record)

    records = reporter.load_recent_records(2)
    assert len(records) == 2


# ── Additional: count=0 returns empty list ───────────────────────────────


def test_count_zero_returns_empty() -> None:
    """count=0 returns empty list."""
    fs = _make_fs()
    reporter = Reporter(fs)

    reporter.save_record(_sample_record())
    records = reporter.load_recent_records(0)
    assert records == []


# ── Additional: corrupted JSON is skipped ────────────────────────────────


def test_corrupted_json_is_skipped() -> None:
    """Corrupted JSON files are silently skipped."""
    fs = _make_fs()
    reporter = Reporter(fs)

    # Save a valid record.
    reporter.save_record(_sample_record())

    # Inject a corrupted file.
    fs.write_file("iterations/corrupted.json", "{invalid json content")

    records = reporter.load_recent_records(10)
    assert len(records) == 1
    assert records[0].iteration_id == "iter-0001-20260227-120000"


# ── Additional: iterations/ directory created on save ────────────────────


def test_save_creates_iterations_directory() -> None:
    """save_record creates the iterations/ directory."""
    fs = _make_fs()
    reporter = Reporter(fs)

    reporter.save_record(_sample_record())

    assert "iterations" in fs.created_dirs
