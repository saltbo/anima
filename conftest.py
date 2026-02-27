"""Shared pytest fixtures and test factories for Anima.

Provides:
- Fake port implementations (FileSystem, Linter, TestRunner, Agent)
- Factory functions for all domain models with sensible defaults
- Pytest fixtures wrapping the most commonly used factories
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from domain.models import (
    ExecutionResult,
    FileChange,
    FileInfo,
    Gap,
    GapReport,
    InboxItem,
    IterationOutcome,
    IterationPlan,
    IterationRecord,
    PlannedAction,
    Priority,
    ProjectState,
    QualityResult,
    RoadmapItem,
    StageResult,
    VerificationReport,
    VerificationStatus,
    Vision,
)

if TYPE_CHECKING:
    from collections.abc import Callable


# ── Fake Port Implementations ─────────────────────────────────────────────


class FakeFileSystem:
    """Minimal no-op FileSystemPort stub.

    Returns empty/default values for all operations.
    Useful when tests don't care about file system interactions.
    """

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


class InMemoryFileSystem:
    """Stateful in-memory FileSystemPort.

    Tracks file contents, directory creation, and supports list/read/write.
    Useful when tests need to verify file system side effects.
    """

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


class FakeLinter:
    """Fake LinterPort with configurable results.

    Pass quality results for lint and typecheck, or exceptions to simulate crashes.
    """

    def __init__(
        self,
        lint_result: QualityResult | None = None,
        typecheck_result: QualityResult | None = None,
        *,
        lint_exc: Exception | None = None,
        typecheck_exc: Exception | None = None,
    ) -> None:
        self._lint_result = lint_result
        self._typecheck_result = typecheck_result
        self._lint_exc = lint_exc
        self._typecheck_exc = typecheck_exc

    def run_lint(self) -> QualityResult:
        """Return configured lint result or raise."""
        if self._lint_exc is not None:
            raise self._lint_exc
        assert self._lint_result is not None
        return self._lint_result

    def run_typecheck(self) -> QualityResult:
        """Return configured typecheck result or raise."""
        if self._typecheck_exc is not None:
            raise self._typecheck_exc
        assert self._typecheck_result is not None
        return self._typecheck_result


class FakeTestRunner:
    """Fake TestRunnerPort with configurable results."""

    def __init__(
        self,
        result: QualityResult | None = None,
        *,
        raise_exc: Exception | None = None,
    ) -> None:
        self._result = result
        self._raise_exc = raise_exc

    def run_tests(self) -> QualityResult:
        """Return configured test result or raise."""
        if self._raise_exc is not None:
            raise self._raise_exc
        assert self._result is not None
        return self._result


class FakeAgent:
    """Fake AgentPort that returns a configurable result.

    Tracks calls via the ``called_with`` attribute.
    """

    def __init__(
        self,
        result: ExecutionResult | None = None,
        *,
        raise_exc: Exception | None = None,
    ) -> None:
        self._result = result
        self._raise_exc = raise_exc
        self.called_with: IterationPlan | None = None

    def execute_plan(self, plan: IterationPlan) -> ExecutionResult:
        """Record the call and return the configured result."""
        self.called_with = plan
        if self._raise_exc is not None:
            raise self._raise_exc
        assert self._result is not None
        return self._result


# ── Quality Result Factories ──────────────────────────────────────────────


def make_passing_lint() -> QualityResult:
    """Create a passing ruff lint result."""
    return QualityResult(tool="ruff", passed=True, output="All checks passed.", error_count=0)


def make_failing_lint(error_count: int = 2) -> QualityResult:
    """Create a failing ruff lint result."""
    return QualityResult(
        tool="ruff",
        passed=False,
        output="domain/models.py:1: E302 expected 2 blank lines\nadapters/local_fs.py:5: F401 unused import",
        error_count=error_count,
    )


def make_passing_typecheck() -> QualityResult:
    """Create a passing pyright result."""
    return QualityResult(tool="pyright", passed=True, output="0 errors.", error_count=0)


def make_failing_typecheck(error_count: int = 2) -> QualityResult:
    """Create a failing pyright result."""
    return QualityResult(
        tool="pyright",
        passed=False,
        output="modules/foo/core.py:10: error: Argument missing\nmodules/foo/core.py:20: error: Type mismatch",
        error_count=error_count,
    )


def make_passing_tests() -> QualityResult:
    """Create a passing pytest result."""
    return QualityResult(tool="pytest", passed=True, output="10 passed.", error_count=0)


def make_failing_tests(error_count: int = 2) -> QualityResult:
    """Create a failing pytest result."""
    return QualityResult(
        tool="pytest",
        passed=False,
        output="FAILED test_foo.py::test_bar - AssertionError\nFAILED test_foo.py::test_baz - TypeError",
        error_count=error_count,
    )


# ── Domain Model Factories ───────────────────────────────────────────────


def make_gap(
    category: str = "roadmap",
    description: str = "Implement something",
    priority: Priority = Priority.HIGH,
    roadmap_version: str = "v0.1",
    evidence: str = "test evidence",
) -> Gap:
    """Create a Gap with sensible defaults."""
    return Gap(
        category=category,
        description=description,
        priority=priority,
        roadmap_version=roadmap_version,
        evidence=evidence,
    )


def make_gap_report(
    gaps: list[Gap] | None = None,
    most_critical: Gap | None = None,
    timestamp: str = "2026-02-27T12:00:00Z",
) -> GapReport:
    """Create a GapReport with sensible defaults."""
    if gaps is None:
        gaps = []
    return GapReport(gaps=gaps, most_critical=most_critical, timestamp=timestamp)


def make_planned_action(
    description: str = "Create module",
    target_files: list[str] | None = None,
    action_type: str = "create",
) -> PlannedAction:
    """Create a PlannedAction with sensible defaults."""
    if target_files is None:
        target_files = ["modules/foo/core.py"]
    return PlannedAction(
        description=description,
        target_files=target_files,
        action_type=action_type,
    )


def make_plan(
    iteration_id: str = "iter-0001-20260227-120000",
    gap: Gap | None = None,
    actions: list[PlannedAction] | None = None,
    acceptance_criteria: list[str] | None = None,
    estimated_risk: str = "low",
) -> IterationPlan:
    """Create an IterationPlan with sensible defaults."""
    if gap is None:
        gap = make_gap()
    if actions is None:
        actions = [make_planned_action()]
    if acceptance_criteria is None:
        acceptance_criteria = ["Tests pass", "ruff check passes", "pyright passes"]
    return IterationPlan(
        iteration_id=iteration_id,
        gap=gap,
        actions=actions,
        acceptance_criteria=acceptance_criteria,
        estimated_risk=estimated_risk,
    )


def make_file_change(
    path: str = "modules/foo/core.py",
    change_type: str = "created",
    diff_summary: str = "new file",
) -> FileChange:
    """Create a FileChange with sensible defaults."""
    return FileChange(path=path, change_type=change_type, diff_summary=diff_summary)


def make_execution_result(
    iteration_id: str = "iter-0001-20260227-120000",
    plan: IterationPlan | None = None,
    files_changed: list[FileChange] | None = None,
    agent_output: str = "Done",
    *,
    success: bool = True,
    error_message: str = "",
) -> ExecutionResult:
    """Create an ExecutionResult with sensible defaults."""
    if plan is None:
        plan = make_plan(iteration_id=iteration_id)
    if files_changed is None:
        files_changed = [make_file_change()]
    return ExecutionResult(
        iteration_id=iteration_id,
        plan=plan,
        files_changed=files_changed,
        agent_output=agent_output,
        success=success,
        error_message=error_message,
    )


def make_stage_result(
    stage: str = "lint",
    status: VerificationStatus = VerificationStatus.PASSED,
    output: str = "OK",
    details: list[str] | None = None,
) -> StageResult:
    """Create a StageResult with sensible defaults."""
    if details is None:
        details = []
    return StageResult(stage=stage, status=status, output=output, details=details)


def make_verification_report(
    iteration_id: str = "iter-0001-20260227-120000",
    stages: list[StageResult] | None = None,
    *,
    all_passed: bool = True,
    summary: str = "All checks passed",
) -> VerificationReport:
    """Create a VerificationReport with sensible defaults."""
    if stages is None:
        stages = [
            make_stage_result("lint"),
            make_stage_result("typecheck"),
            make_stage_result("tests"),
        ]
    return VerificationReport(
        iteration_id=iteration_id,
        stages=stages,
        all_passed=all_passed,
        summary=summary,
    )


def make_iteration_record(
    iteration_id: str = "iter-0001-20260227-120000",
    timestamp: str = "2026-02-27T12:00:00Z",
    gap: Gap | None = None,
    plan: IterationPlan | None = None,
    execution: ExecutionResult | None = None,
    verification: VerificationReport | None = None,
    outcome: IterationOutcome = IterationOutcome.SUCCESS,
    duration_seconds: float = 42.5,
    notes: str = "",
) -> IterationRecord:
    """Create an IterationRecord with sensible defaults."""
    if gap is None:
        gap = make_gap()
    if plan is None:
        plan = make_plan(iteration_id=iteration_id)
    if execution is None:
        execution = make_execution_result(iteration_id=iteration_id, plan=plan)
    if verification is None:
        verification = make_verification_report(iteration_id=iteration_id)
    return IterationRecord(
        iteration_id=iteration_id,
        timestamp=timestamp,
        gap_addressed=gap,
        plan=plan,
        execution=execution,
        verification=verification,
        outcome=outcome,
        duration_seconds=duration_seconds,
        notes=notes,
    )


def make_project_state(
    files: list[FileInfo] | None = None,
    quality_results: list[QualityResult] | None = None,
    recent_iterations: list[str] | None = None,
    current_branch: str = "main",
    commit_hash: str = "abc123",
) -> ProjectState:
    """Create a ProjectState with sensible defaults."""
    if files is None:
        files = []
    if quality_results is None:
        quality_results = []
    if recent_iterations is None:
        recent_iterations = []
    return ProjectState(
        files=files,
        quality_results=quality_results,
        recent_iterations=recent_iterations,
        current_branch=current_branch,
        commit_hash=commit_hash,
    )


def make_vision(
    identity: str = "Test project",
    principles: list[str] | None = None,
    roadmap_items: list[RoadmapItem] | None = None,
    quality_standards: list[str] | None = None,
) -> Vision:
    """Create a Vision with sensible defaults."""
    if principles is None:
        principles = ["principle1"]
    if roadmap_items is None:
        roadmap_items = []
    if quality_standards is None:
        quality_standards = ["standard1"]
    return Vision(
        identity=identity,
        principles=principles,
        roadmap_items=roadmap_items,
        quality_standards=quality_standards,
    )


def make_roadmap_item(
    version: str = "0.1",
    description: str = "Implement something",
    *,
    completed: bool = False,
) -> RoadmapItem:
    """Create a RoadmapItem with sensible defaults."""
    return RoadmapItem(version=version, description=description, completed=completed)


def make_inbox_item(
    filename: str = "20260227-test.md",
    title: str = "Add feature",
    what: str = "Implement the feature",
    why: str = "Users need it",
    priority: Priority = Priority.HIGH,
    constraints: str = "",
) -> InboxItem:
    """Create an InboxItem with sensible defaults."""
    return InboxItem(
        filename=filename,
        title=title,
        what=what,
        why=why,
        priority=priority,
        constraints=constraints,
    )


# ── Pytest Fixtures ──────────────────────────────────────────────────────


@pytest.fixture
def fake_fs() -> FakeFileSystem:
    """Provide a minimal no-op FileSystemPort stub."""
    return FakeFileSystem()


@pytest.fixture
def in_memory_fs() -> InMemoryFileSystem:
    """Provide a stateful in-memory FileSystemPort."""
    return InMemoryFileSystem()


@pytest.fixture
def sample_gap() -> Gap:
    """Provide a default Gap instance."""
    return make_gap()


@pytest.fixture
def sample_plan() -> IterationPlan:
    """Provide a default IterationPlan instance."""
    return make_plan()


@pytest.fixture
def sample_execution() -> ExecutionResult:
    """Provide a default ExecutionResult instance."""
    return make_execution_result()


@pytest.fixture
def sample_verification() -> VerificationReport:
    """Provide a default VerificationReport instance."""
    return make_verification_report()


@pytest.fixture
def sample_record() -> IterationRecord:
    """Provide a default IterationRecord instance."""
    return make_iteration_record()


@pytest.fixture
def empty_state() -> ProjectState:
    """Provide a ProjectState with no files and all quality passing."""
    return make_project_state()


@pytest.fixture
def empty_vision() -> Vision:
    """Provide a Vision with no roadmap items."""
    return make_vision()


@pytest.fixture
def gap_factory() -> Callable[..., Gap]:
    """Provide the make_gap factory function."""
    return make_gap


@pytest.fixture
def plan_factory() -> Callable[..., IterationPlan]:
    """Provide the make_plan factory function."""
    return make_plan


@pytest.fixture
def record_factory() -> Callable[..., IterationRecord]:
    """Provide the make_iteration_record factory function."""
    return make_iteration_record
