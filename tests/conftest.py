"""Shared pytest fixtures for Anima tests.

Provides factory fixtures for all domain models and mock Port implementations.
These fixtures eliminate boilerplate when writing module tests, conformance
tests, and integration tests.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock

import pytest

from domain.models import (
    ExecutionResult,
    GapReport,
    InboxItem,
    IterationPlan,
    IterationRecord,
    ModuleInfo,
    ProjectState,
    QualityCheckResult,
    QualityReport,
    TestResult,
    VerificationReport,
    Vision,
)

# ---------------------------------------------------------------------------
# Supporting-type factories
# ---------------------------------------------------------------------------


@pytest.fixture()
def make_quality_check() -> _QualityCheckFactory:
    """Factory for QualityCheckResult with sensible defaults."""

    def _factory(*, passed: bool = True, output: str = "") -> QualityCheckResult:
        return QualityCheckResult(passed=passed, output=output)

    return _factory


_QualityCheckFactory = Any  # callable[..., QualityCheckResult]


@pytest.fixture()
def make_test_result() -> _TestResultFactory:
    """Factory for TestResult with sensible defaults."""

    def _factory(
        *,
        exit_code: int = 0,
        passed: bool = True,
        output: str = "all tests passed",
        errors: str = "",
    ) -> TestResult:
        return TestResult(
            exit_code=exit_code,
            passed=passed,
            output=output,
            errors=errors,
        )

    return _factory


_TestResultFactory = Any


@pytest.fixture()
def make_quality_report() -> _QualityReportFactory:
    """Factory for QualityReport — all checks passing by default."""

    def _factory(
        *,
        ruff_lint: QualityCheckResult | None = None,
        ruff_format: QualityCheckResult | None = None,
        pyright: QualityCheckResult | None = None,
        all_passing: bool = True,
    ) -> QualityReport:
        if all_passing:
            default = QualityCheckResult(passed=True, output="")
            return QualityReport(
                ruff_lint=ruff_lint or default,
                ruff_format=ruff_format or default,
                pyright=pyright or default,
            )
        return QualityReport(
            ruff_lint=ruff_lint,
            ruff_format=ruff_format,
            pyright=pyright,
        )

    return _factory


_QualityReportFactory = Any


@pytest.fixture()
def make_module_info() -> _ModuleInfoFactory:
    """Factory for ModuleInfo with sensible defaults."""

    def _factory(
        name: str = "scanner",
        *,
        has_contract: bool = True,
        has_spec: bool = True,
        has_core: bool = False,
        has_tests: bool = False,
        files: tuple[str, ...] = (),
    ) -> ModuleInfo:
        return ModuleInfo(
            name=name,
            has_contract=has_contract,
            has_spec=has_spec,
            has_core=has_core,
            has_tests=has_tests,
            files=files,
        )

    return _factory


_ModuleInfoFactory = Any


# ---------------------------------------------------------------------------
# Core pipeline-type factories
# ---------------------------------------------------------------------------


@pytest.fixture()
def make_vision() -> _VisionFactory:
    """Factory for Vision with sensible defaults."""

    def _factory(
        *,
        raw_text: str = "Anima is an Autonomous Iteration Engine.",
        current_version: str = "v0.1",
        roadmap_text: str = "- [x] Foundation\n- [ ] Next item",
    ) -> Vision:
        return Vision(
            raw_text=raw_text,
            current_version=current_version,
            roadmap_text=roadmap_text,
        )

    return _factory


_VisionFactory = Any


@pytest.fixture()
def make_project_state() -> _ProjectStateFactory:
    """Factory for ProjectState with sensible defaults.

    Produces a realistic state representing a project in the v0.1 stage.
    """

    def _factory(**overrides: Any) -> ProjectState:
        defaults: dict[str, Any] = {
            "files": ("domain/models.py", "domain/ports.py", "wiring.py"),
            "modules": (),
            "domain_exists": True,
            "adapters_exist": True,
            "kernel_exists": True,
            "has_tests": True,
            "has_pyproject": True,
            "has_pyrightconfig": True,
            "inbox_items": (),
            "quality_results": None,
            "test_results": None,
            "protected_hashes": (),
        }
        defaults.update(overrides)
        return ProjectState(**defaults)

    return _factory


_ProjectStateFactory = Any


@pytest.fixture()
def make_gap_report() -> _GapReportFactory:
    """Factory for GapReport with sensible defaults."""

    def _factory(
        *,
        gaps: tuple[str, ...] = ("Set up pytest with conftest.py",),
        has_gaps: bool = True,
        raw_text: str = "UNCOMPLETED: Set up pytest with conftest.py",
    ) -> GapReport:
        return GapReport(gaps=gaps, has_gaps=has_gaps, raw_text=raw_text)

    return _factory


_GapReportFactory = Any


@pytest.fixture()
def no_gaps() -> GapReport:
    """A GapReport representing a project with no gaps."""
    return GapReport(gaps=(), has_gaps=False, raw_text="NO_GAPS")


@pytest.fixture()
def make_iteration_plan() -> _IterationPlanFactory:
    """Factory for IterationPlan with sensible defaults."""

    def _factory(
        *,
        prompt: str = "Implement the next task.",
        iteration_number: int = 1,
        target_version: str = "v0.1",
        gaps_summary: str = "One gap remaining.",
    ) -> IterationPlan:
        return IterationPlan(
            prompt=prompt,
            iteration_number=iteration_number,
            target_version=target_version,
            gaps_summary=gaps_summary,
        )

    return _factory


_IterationPlanFactory = Any


@pytest.fixture()
def make_execution_result() -> _ExecutionResultFactory:
    """Factory for ExecutionResult with sensible defaults (successful)."""

    def _factory(
        *,
        success: bool = True,
        output: str = "Changes applied.",
        errors: str = "",
        exit_code: int = 0,
        elapsed_seconds: float = 5.0,
        cost_usd: float = 0.01,
        total_tokens: int = 500,
        dry_run: bool = False,
    ) -> ExecutionResult:
        return ExecutionResult(
            success=success,
            output=output,
            errors=errors,
            exit_code=exit_code,
            elapsed_seconds=elapsed_seconds,
            cost_usd=cost_usd,
            total_tokens=total_tokens,
            dry_run=dry_run,
        )

    return _factory


_ExecutionResultFactory = Any


@pytest.fixture()
def make_verification_report() -> _VerificationReportFactory:
    """Factory for VerificationReport with sensible defaults (passing)."""

    def _factory(
        *,
        passed: bool = True,
        issues: tuple[str, ...] = (),
        improvements: tuple[str, ...] = ("New files: 1",),
    ) -> VerificationReport:
        return VerificationReport(
            passed=passed,
            issues=issues,
            improvements=improvements,
        )

    return _factory


_VerificationReportFactory = Any


@pytest.fixture()
def make_iteration_record() -> _IterationRecordFactory:
    """Factory for IterationRecord with sensible defaults."""

    def _factory(
        *,
        iteration_id: str = "0001-20260101-000000",
        timestamp: str = "2026-01-01T00:00:00",
        success: bool = True,
        summary: str = "Completed task.",
        gaps_addressed: str = "Set up pytest",
        improvements: tuple[str, ...] = ("New files: 1",),
        issues: tuple[str, ...] = (),
        agent_output_excerpt: str = "done",
        elapsed_seconds: float = 5.0,
        cost_usd: float = 0.01,
        total_tokens: int = 500,
    ) -> IterationRecord:
        return IterationRecord(
            iteration_id=iteration_id,
            timestamp=timestamp,
            success=success,
            summary=summary,
            gaps_addressed=gaps_addressed,
            improvements=improvements,
            issues=issues,
            agent_output_excerpt=agent_output_excerpt,
            elapsed_seconds=elapsed_seconds,
            cost_usd=cost_usd,
            total_tokens=total_tokens,
        )

    return _factory


_IterationRecordFactory = Any


# ---------------------------------------------------------------------------
# Mock Port implementations
# ---------------------------------------------------------------------------


@pytest.fixture()
def mock_agent() -> MagicMock:
    """Mock AgentPort — returns a successful ExecutionResult by default."""
    agent = MagicMock()
    agent.execute.return_value = ExecutionResult(
        success=True,
        output="Changes applied.",
        errors="",
        exit_code=0,
        elapsed_seconds=5.0,
    )
    return agent


@pytest.fixture()
def mock_vcs() -> MagicMock:
    """Mock VersionControlPort with default return values."""
    vcs = MagicMock()
    vcs.snapshot.return_value = "abc123"
    vcs.commit.return_value = None
    vcs.rollback.return_value = None
    return vcs


@pytest.fixture()
def mock_test_runner() -> MagicMock:
    """Mock TestRunnerPort — all tests pass by default."""
    runner = MagicMock()
    runner.run_tests.return_value = TestResult(
        exit_code=0,
        passed=True,
        output="all tests passed",
        errors="",
    )
    return runner


@pytest.fixture()
def mock_linter() -> MagicMock:
    """Mock LinterPort — all checks pass by default."""
    linter = MagicMock()
    passing = QualityCheckResult(passed=True, output="")
    linter.check.return_value = QualityReport(
        ruff_lint=passing,
        ruff_format=passing,
        pyright=passing,
    )
    return linter


@pytest.fixture()
def mock_fs(tmp_path: Any) -> MagicMock:
    """Mock FileSystemPort backed by tmp_path for realistic file operations."""
    fs = MagicMock()
    fs.read_file.side_effect = lambda p: (tmp_path / p).read_text()
    fs.write_file.side_effect = lambda p, c: (tmp_path / p).write_text(c)
    fs.list_files.return_value = []
    fs.file_exists.return_value = False
    fs.dir_exists.return_value = False
    return fs


# ---------------------------------------------------------------------------
# Convenience fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def sample_inbox_item() -> InboxItem:
    """A realistic inbox item for testing."""
    return InboxItem(
        filename="20260101-120000-add-feature.md",
        content="# Add Feature\n\n## What\nAdd a new feature.\n\n## Why\nBecause.\n\n## Priority\nmedium\n",
    )
