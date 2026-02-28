"""Unit tests for modules/verifier/core.py.

Tests the pure verify() function with constructed ProjectState inputs.
Validates behaviour described in SPEC.md.
"""

from __future__ import annotations

from domain.models import (
    ProjectState,
    QualityCheckResult,
    QualityReport,
    TestResult,
)
from modules.verifier.core import verify


def _make_state(
    files: tuple[str, ...] = (),
    protected_hashes: tuple[tuple[str, str | None], ...] = (),
    quality_results: QualityReport | None = None,
    test_results: TestResult | None = None,
) -> ProjectState:
    """Build a minimal ProjectState for testing."""
    return ProjectState(
        files=files,
        modules=(),
        domain_exists=False,
        adapters_exist=False,
        kernel_exists=False,
        has_tests=False,
        has_pyproject=False,
        has_pyrightconfig=False,
        inbox_items=(),
        quality_results=quality_results,
        test_results=test_results,
        protected_hashes=protected_hashes,
    )


# --- Protected file integrity tests ---


def test_no_changes_passes() -> None:
    """Identical pre and post states should pass with no issues."""
    hashes = (("VISION.md", "abc123"), ("kernel/loop.py", "def456"))
    pre = _make_state(protected_hashes=hashes)
    post = _make_state(protected_hashes=hashes)
    report = verify(pre, post)
    assert report.passed is True
    assert report.issues == ()


def test_modified_protected_file() -> None:
    """Modification of a protected file should produce a CRITICAL issue."""
    pre = _make_state(protected_hashes=(("VISION.md", "abc123"),))
    post = _make_state(protected_hashes=(("VISION.md", "xyz789"),))
    report = verify(pre, post)
    assert report.passed is False
    assert len(report.issues) == 1
    assert "CRITICAL" in report.issues[0]
    assert "VISION.md" in report.issues[0]
    assert "modified" in report.issues[0]


def test_deleted_protected_file() -> None:
    """Deletion of a protected file should produce a CRITICAL issue."""
    pre = _make_state(protected_hashes=(("kernel/loop.py", "abc123"),))
    post = _make_state(protected_hashes=())
    report = verify(pre, post)
    assert report.passed is False
    assert len(report.issues) == 1
    assert "CRITICAL" in report.issues[0]
    assert "deleted" in report.issues[0]


def test_unexpected_protected_file() -> None:
    """A new file appearing in protected paths should produce a CRITICAL issue."""
    pre = _make_state(protected_hashes=())
    post = _make_state(protected_hashes=(("kernel/evil.py", "abc123"),))
    report = verify(pre, post)
    assert report.passed is False
    assert len(report.issues) == 1
    assert "CRITICAL" in report.issues[0]
    assert "appeared unexpectedly" in report.issues[0]


def test_multiple_protected_file_issues() -> None:
    """Multiple protected file violations are all reported."""
    pre = _make_state(
        protected_hashes=(
            ("VISION.md", "aaa"),
            ("kernel/loop.py", "bbb"),
        ),
    )
    post = _make_state(
        protected_hashes=(
            ("VISION.md", "changed"),
            ("kernel/new.py", "ccc"),
        ),
    )
    report = verify(pre, post)
    assert report.passed is False
    # VISION.md modified, kernel/loop.py deleted, kernel/new.py appeared
    assert len(report.issues) == 3


# --- Quality gate tests ---


def test_ruff_lint_failure() -> None:
    """Ruff lint failure should produce a QUALITY issue."""
    qr = QualityReport(
        ruff_lint=QualityCheckResult(passed=False, output="E501: line too long"),
    )
    post = _make_state(quality_results=qr)
    report = verify(_make_state(), post)
    assert report.passed is False
    assert any("QUALITY: ruff lint" in i for i in report.issues)


def test_ruff_format_failure() -> None:
    """Ruff format failure should produce a QUALITY issue."""
    qr = QualityReport(
        ruff_format=QualityCheckResult(passed=False, output="would reformat"),
    )
    post = _make_state(quality_results=qr)
    report = verify(_make_state(), post)
    assert report.passed is False
    assert any("QUALITY: ruff format" in i for i in report.issues)


def test_pyright_failure() -> None:
    """Pyright failure should produce a QUALITY issue."""
    qr = QualityReport(
        pyright=QualityCheckResult(passed=False, output="type error"),
    )
    post = _make_state(quality_results=qr)
    report = verify(_make_state(), post)
    assert report.passed is False
    assert any("QUALITY: pyright" in i for i in report.issues)


def test_all_quality_passing() -> None:
    """All quality checks passing should not produce issues."""
    qr = QualityReport(
        ruff_lint=QualityCheckResult(passed=True, output=""),
        ruff_format=QualityCheckResult(passed=True, output=""),
        pyright=QualityCheckResult(passed=True, output=""),
    )
    post = _make_state(quality_results=qr)
    report = verify(_make_state(), post)
    assert report.passed is True


def test_no_quality_results() -> None:
    """Missing quality results should not cause issues."""
    report = verify(_make_state(), _make_state())
    assert report.passed is True


# --- Test gate tests ---


def test_tests_failing() -> None:
    """Failing tests should produce a QUALITY issue."""
    tr = TestResult(exit_code=1, passed=False, output="FAILED test_x", errors="")
    post = _make_state(test_results=tr)
    report = verify(_make_state(), post)
    assert report.passed is False
    assert any("QUALITY: tests failing" in i for i in report.issues)


def test_tests_passing() -> None:
    """Passing tests should not produce issues."""
    tr = TestResult(exit_code=0, passed=True, output="3 passed", errors="")
    post = _make_state(test_results=tr)
    report = verify(_make_state(), post)
    assert report.passed is True


# --- Improvement detection ---


def test_new_files_detected() -> None:
    """New files in post state should be reported as improvements."""
    pre = _make_state(files=("a.py", "b.py"))
    post = _make_state(files=("a.py", "b.py", "c.py", "d.py"))
    report = verify(pre, post)
    assert report.passed is True
    assert len(report.improvements) == 1
    assert "New files: 2" in report.improvements[0]


def test_no_new_files() -> None:
    """No new files means no improvements."""
    pre = _make_state(files=("a.py",))
    post = _make_state(files=("a.py",))
    report = verify(pre, post)
    assert report.improvements == ()


# --- Combined scenario ---


def test_combined_pass_with_improvements() -> None:
    """Passing verification with new files and clean quality."""
    hashes = (("VISION.md", "abc"),)
    qr = QualityReport(
        ruff_lint=QualityCheckResult(passed=True, output=""),
        pyright=QualityCheckResult(passed=True, output=""),
    )
    tr = TestResult(exit_code=0, passed=True, output="5 passed", errors="")
    pre = _make_state(files=("a.py",), protected_hashes=hashes, quality_results=qr)
    post = _make_state(
        files=("a.py", "b.py"),
        protected_hashes=hashes,
        quality_results=qr,
        test_results=tr,
    )
    report = verify(pre, post)
    assert report.passed is True
    assert "New files: 1" in report.improvements[0]


def test_combined_failure() -> None:
    """Protected file violation plus quality failure produces multiple issues."""
    pre = _make_state(protected_hashes=(("VISION.md", "abc"),))
    qr = QualityReport(
        ruff_lint=QualityCheckResult(passed=False, output="errors"),
    )
    post = _make_state(
        protected_hashes=(("VISION.md", "changed"),),
        quality_results=qr,
    )
    report = verify(pre, post)
    assert report.passed is False
    assert len(report.issues) == 2
    assert any("CRITICAL" in i for i in report.issues)
    assert any("QUALITY" in i for i in report.issues)
