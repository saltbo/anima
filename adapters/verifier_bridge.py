"""Bridge adapter: modules.verifier.core → seed-compatible dict interface.

Converts the dict-based call from kernel/loop.py into typed ProjectState
objects, invokes the verifier module, and converts the VerificationReport
back to the dict format that kernel/loop.py expects.
"""

from __future__ import annotations

from typing import Any

from domain.models import (
    ProjectState,
    QualityCheckResult,
    QualityReport,
    TestResult,
)
from modules.verifier.core import verify


def verify_iteration(
    pre_state: dict[str, Any],
    post_state: dict[str, Any],
) -> dict[str, Any]:
    """Verify iteration results using the verifier module.

    Matches the seed.verify_iteration signature so kernel/loop.py
    can call it without changes.

    Args:
        pre_state: Pre-execution project state as a dict.
        post_state: Post-execution project state as a dict.

    Returns:
        A dict with keys: passed, issues, improvements, post_state.
    """
    pre = _dict_to_project_state(pre_state)
    post = _dict_to_project_state(post_state)
    report = verify(pre, post)
    return {
        "passed": report.passed,
        "issues": list(report.issues),
        "improvements": list(report.improvements),
        "post_state": post_state,
    }


def _dict_to_project_state(data: dict[str, Any]) -> ProjectState:
    """Convert a seed-style dict into a ProjectState dataclass.

    Only the fields used by the verifier are faithfully converted;
    unused fields receive safe defaults.

    Args:
        data: Dict from scanner_bridge or seed.scan_project_state.

    Returns:
        A ProjectState populated from the dict.
    """
    # Protected hashes: dict[str, str | None] → tuple[tuple[str, str | None], ...]
    raw_hashes: dict[str, str | None] = data.get("_protected_hashes", {})
    protected_hashes = tuple(raw_hashes.items())

    # Quality results: dict → QualityReport | None
    qr_dict: dict[str, Any] = data.get("quality_results", {})
    quality_results = _parse_quality_report(qr_dict)

    # Test results: dict → TestResult | None
    tr_dict: dict[str, Any] | None = data.get("test_results")
    test_results: TestResult | None = None
    if tr_dict:
        test_results = TestResult(
            exit_code=tr_dict["exit_code"],
            passed=tr_dict["passed"],
            output=tr_dict["output"],
            errors=tr_dict["errors"],
        )

    return ProjectState(
        files=tuple(data.get("files", [])),
        modules=(),  # not used by verifier
        domain_exists=data.get("domain_exists", False),
        adapters_exist=data.get("adapters_exist", False),
        kernel_exists=data.get("kernel_exists", False),
        has_tests=data.get("has_tests", False),
        has_pyproject=data.get("has_pyproject", False),
        has_pyrightconfig=data.get("has_pyrightconfig", False),
        inbox_items=(),  # not used by verifier
        quality_results=quality_results,
        test_results=test_results,
        protected_hashes=protected_hashes,
    )


def _parse_quality_report(qr_dict: dict[str, Any]) -> QualityReport | None:
    """Parse a quality results dict into a QualityReport.

    Args:
        qr_dict: Dict with ruff_lint, ruff_format, pyright sub-dicts.

    Returns:
        A QualityReport or None if all checks are absent.
    """
    if not qr_dict:
        return None

    ruff_lint = _parse_check_result(qr_dict.get("ruff_lint"))
    ruff_format = _parse_check_result(qr_dict.get("ruff_format"))
    pyright = _parse_check_result(qr_dict.get("pyright"))

    if ruff_lint is None and ruff_format is None and pyright is None:
        return None

    return QualityReport(
        ruff_lint=ruff_lint,
        ruff_format=ruff_format,
        pyright=pyright,
    )


def _parse_check_result(
    check: dict[str, Any] | None,
) -> QualityCheckResult | None:
    """Parse a single quality check dict into a QualityCheckResult.

    Args:
        check: Dict with passed and output keys, or None.

    Returns:
        A QualityCheckResult or None.
    """
    if check is None:
        return None
    return QualityCheckResult(
        passed=check["passed"],
        output=check["output"],
    )
