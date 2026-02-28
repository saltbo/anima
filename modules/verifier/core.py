"""Verifier module — Verify iteration changes are safe and correct.

Pure function comparing pre/post ProjectState snapshots.
See CONTRACT.md for the interface and SPEC.md for implementation details.
"""

from __future__ import annotations

import logging

from domain.models import ProjectState, VerificationReport

logger = logging.getLogger("anima.verifier")


def verify(
    pre_state: ProjectState,
    post_state: ProjectState,
) -> VerificationReport:
    """Verify that an iteration's changes are safe and correct.

    Compares pre-execution and post-execution project state snapshots to detect
    protected file violations, quality gate failures, and improvements.

    Args:
        pre_state: Project state snapshot taken before execution.
        post_state: Project state snapshot taken after execution.

    Returns:
        A VerificationReport with pass/fail, issues, and improvements.
    """
    issues: list[str] = []
    improvements: list[str] = []

    _check_protected_files(pre_state, post_state, issues)
    _check_quality_gates(post_state, issues)
    _check_test_gate(post_state, issues)
    _detect_improvements(pre_state, post_state, improvements)

    passed = len(issues) == 0
    if passed:
        logger.info("Verification passed")
    else:
        logger.warning("Verification failed with %d issue(s)", len(issues))

    return VerificationReport(
        passed=passed,
        issues=tuple(issues),
        improvements=tuple(improvements),
    )


def _check_protected_files(
    pre_state: ProjectState,
    post_state: ProjectState,
    issues: list[str],
) -> None:
    """Detect modifications, deletions, or additions to protected files.

    Args:
        pre_state: State before execution with protected file hashes.
        post_state: State after execution with protected file hashes.
        issues: Mutable list to append CRITICAL issues to.
    """
    pre_hashes: dict[str, str | None] = dict(pre_state.protected_hashes)
    post_hashes: dict[str, str | None] = dict(post_state.protected_hashes)

    # Detect modifications and deletions
    for path, pre_hash in pre_hashes.items():
        post_hash = post_hashes.get(path)
        if pre_hash is not None and post_hash is None:
            issues.append(f"CRITICAL: {path} was deleted by the agent")
            logger.error("Protected file deleted: %s", path)
        elif pre_hash is not None and pre_hash != post_hash:
            issues.append(f"CRITICAL: {path} was modified by the agent")
            logger.error("Protected file modified: %s", path)

    # Detect unexpected appearances
    for path, post_hash in post_hashes.items():
        pre_hash = pre_hashes.get(path)
        if pre_hash is None and post_hash is not None:
            issues.append(f"CRITICAL: {path} appeared unexpectedly")
            logger.error("Protected file appeared: %s", path)


def _check_quality_gates(
    post_state: ProjectState,
    issues: list[str],
) -> None:
    """Check ruff lint, ruff format, and pyright results.

    Args:
        post_state: State after execution with quality results.
        issues: Mutable list to append QUALITY issues to.
    """
    qr = post_state.quality_results
    if qr is None:
        return

    if qr.ruff_lint and not qr.ruff_lint.passed:
        issues.append(f"QUALITY: ruff lint failures\n{qr.ruff_lint.output[:300]}")
    if qr.ruff_format and not qr.ruff_format.passed:
        issues.append(f"QUALITY: ruff format failures\n{qr.ruff_format.output[:300]}")
    if qr.pyright and not qr.pyright.passed:
        issues.append(f"QUALITY: pyright type errors\n{qr.pyright.output[:300]}")


def _check_test_gate(
    post_state: ProjectState,
    issues: list[str],
) -> None:
    """Check test results for failures.

    Args:
        post_state: State after execution with test results.
        issues: Mutable list to append QUALITY issues to.
    """
    tr = post_state.test_results
    if tr and not tr.passed:
        issues.append(f"QUALITY: tests failing\n{tr.output[:300]}")


def _detect_improvements(
    pre_state: ProjectState,
    post_state: ProjectState,
    improvements: list[str],
) -> None:
    """Detect new files added during the iteration.

    Args:
        pre_state: State before execution.
        post_state: State after execution.
        improvements: Mutable list to append improvement descriptions to.
    """
    new_files = set(post_state.files) - set(pre_state.files)
    if new_files:
        improvements.append(f"New files: {len(new_files)}")
