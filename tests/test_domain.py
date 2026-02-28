"""Tests for domain/ layer integrity and model correctness."""

from __future__ import annotations

import ast
import dataclasses
import sys
from pathlib import Path

import pytest

from domain.models import (
    ExecutionResult,
    GapReport,
    InboxItem,
    IterationPlan,
    IterationRecord,
    IterationStatus,
    ModuleInfo,
    Priority,
    ProjectState,
    QualityCheckResult,
    QualityReport,
    QuotaState,
    QuotaStatus,
    TestResult,
    VerificationReport,
    Vision,
)

DOMAIN_DIR = Path(__file__).parent.parent / "domain"

STDLIB_MODULES = sys.stdlib_module_names

ALL_MODELS = [
    QualityCheckResult,
    TestResult,
    QualityReport,
    InboxItem,
    ModuleInfo,
    QuotaState,
    Vision,
    ProjectState,
    GapReport,
    IterationPlan,
    ExecutionResult,
    VerificationReport,
    IterationRecord,
]


# ---------------------------------------------------------------------------
# Zero external imports
# ---------------------------------------------------------------------------


def test_domain_has_zero_external_imports() -> None:
    """domain/ must only import from stdlib or itself."""
    for py_file in sorted(DOMAIN_DIR.glob("*.py")):
        tree = ast.parse(py_file.read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    top = alias.name.split(".")[0]
                    assert top in STDLIB_MODULES or top == "domain", (
                        f"{py_file.name}: external import '{alias.name}'"
                    )
            elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
                top = node.module.split(".")[0]
                assert top in STDLIB_MODULES or top == "domain", (
                    f"{py_file.name}: external import 'from {node.module}'"
                )


# ---------------------------------------------------------------------------
# All models are frozen dataclasses
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("model", ALL_MODELS, ids=lambda m: m.__name__)
def test_model_is_frozen_dataclass(model: type) -> None:
    """Every domain model must be a frozen dataclass."""
    assert dataclasses.is_dataclass(model), f"{model.__name__} is not a dataclass"
    params = model.__dataclass_params__  # type: ignore[attr-defined]
    assert params.frozen, f"{model.__name__} is not frozen"


# ---------------------------------------------------------------------------
# Model construction smoke tests
# ---------------------------------------------------------------------------


def test_quality_check_result() -> None:
    """QualityCheckResult can be constructed and is immutable."""
    r = QualityCheckResult(passed=True, output="All good")
    assert r.passed is True
    assert r.output == "All good"
    with pytest.raises(dataclasses.FrozenInstanceError):
        r.passed = False  # type: ignore[misc]


def test_project_state_construction() -> None:
    """ProjectState can be constructed with required fields."""
    state = ProjectState(
        files=("a.py", "b.py"),
        modules=(),
        domain_exists=True,
        adapters_exist=False,
        kernel_exists=True,
        has_tests=True,
        has_pyproject=True,
        has_pyrightconfig=True,
        inbox_items=(),
    )
    assert state.domain_exists is True
    assert len(state.files) == 2
    assert state.quality_results is None
    assert state.protected_hashes == ()


def test_execution_result_defaults() -> None:
    """ExecutionResult has sensible defaults for optional fields."""
    r = ExecutionResult(
        success=True,
        output="done",
        errors="",
        exit_code=0,
        elapsed_seconds=1.5,
    )
    assert r.cost_usd == 0.0
    assert r.total_tokens == 0
    assert r.dry_run is False
    assert r.quota_state is None


def test_execution_result_with_quota_state() -> None:
    """ExecutionResult can carry a QuotaState."""
    qs = QuotaState(status=QuotaStatus.RATE_LIMITED, retry_after_seconds=60.0, message="429")
    r = ExecutionResult(
        success=False,
        output="",
        errors="rate limit",
        exit_code=1,
        elapsed_seconds=2.0,
        quota_state=qs,
    )
    assert r.quota_state is not None
    assert r.quota_state.status == QuotaStatus.RATE_LIMITED
    assert r.quota_state.retry_after_seconds == 60.0


def test_quota_state_defaults() -> None:
    """QuotaState has sensible defaults."""
    qs = QuotaState(status=QuotaStatus.OK)
    assert qs.retry_after_seconds is None
    assert qs.message == ""


def test_iteration_record_construction() -> None:
    """IterationRecord captures full iteration data."""
    rec = IterationRecord(
        iteration_id="iter-001",
        timestamp="2026-02-27T12:00:00+00:00",
        success=True,
        summary="Created domain layer",
        gaps_addressed="MISSING: domain/",
        improvements=("New files: 3",),
        issues=(),
        agent_output_excerpt="...",
        elapsed_seconds=42.0,
    )
    assert rec.success is True
    assert rec.iteration_id == "iter-001"


# ---------------------------------------------------------------------------
# Enum tests
# ---------------------------------------------------------------------------


def test_iteration_status_values() -> None:
    """IterationStatus has expected values."""
    assert IterationStatus.PASSED.value == "passed"
    assert IterationStatus.FAILED.value == "failed"


def test_priority_values() -> None:
    """Priority has expected values."""
    assert Priority.HIGH.value == "high"
    assert Priority.MEDIUM.value == "medium"
    assert Priority.LOW.value == "low"


def test_quota_status_values() -> None:
    """QuotaStatus has expected values."""
    assert QuotaStatus.OK.value == "ok"
    assert QuotaStatus.RATE_LIMITED.value == "rate_limited"
    assert QuotaStatus.QUOTA_EXHAUSTED.value == "quota_exhausted"


# ---------------------------------------------------------------------------
# Ports are importable Protocols
# ---------------------------------------------------------------------------


def test_ports_are_importable() -> None:
    """All ports can be imported from domain.ports."""
    from domain.ports import (
        AgentPort,
        FileSystemPort,
        LinterPort,
        TestRunnerPort,
        VersionControlPort,
    )

    # Verify they are Protocol subclasses (runtime_checkable not required)
    assert hasattr(AgentPort, "execute")
    assert hasattr(VersionControlPort, "snapshot")
    assert hasattr(VersionControlPort, "commit")
    assert hasattr(VersionControlPort, "rollback")
    assert hasattr(TestRunnerPort, "run_tests")
    assert hasattr(LinterPort, "check")
    assert hasattr(FileSystemPort, "read_file")
    assert hasattr(FileSystemPort, "write_file")
    assert hasattr(FileSystemPort, "list_files")
    assert hasattr(FileSystemPort, "file_exists")
    assert hasattr(FileSystemPort, "dir_exists")
