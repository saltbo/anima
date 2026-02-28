"""Conformance test: verify wiring.record_iteration matches seed interface.

Validates that the reporter module, wired through adapters/reporter_bridge.py,
produces output compatible with kernel/loop.py expectations.

Usage:
    pytest tests/conformance/test_reporter.py
"""

from __future__ import annotations

from typing import Any
from unittest.mock import patch

import wiring
from kernel import seed


def _make_verification(
    passed: bool = True,
    improvements: list[str] | None = None,
    issues: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "passed": passed,
        "improvements": improvements or [],
        "issues": issues or [],
    }


def _make_execution(
    output: str = "agent output",
    cost_usd: float = 0.1,
    total_tokens: int = 500,
) -> dict[str, Any]:
    return {
        "output": output,
        "cost_usd": cost_usd,
        "total_tokens": total_tokens,
    }


def test_wiring_resolves_to_callable() -> None:
    """wiring.record_iteration is a callable."""
    assert callable(wiring.record_iteration)


def test_wiring_is_not_seed() -> None:
    """wiring.record_iteration should now point to the module, not seed."""
    assert wiring.record_iteration is not seed.record_iteration


def _call_both(
    iteration_id: str = "0001-conformance",
    gaps: str = "some gaps",
    execution_result: dict[str, Any] | None = None,
    verification: dict[str, Any] | None = None,
    elapsed: float = 10.0,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Call both wired and seed record_iteration with a tmp dir."""
    if execution_result is None:
        execution_result = _make_execution()
    if verification is None:
        verification = _make_verification(improvements=["New files: 1"])

    import tempfile
    from pathlib import Path

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_iterations = Path(tmpdir) / "iterations"

        # Wired version (uses reporter_bridge → reporter module)
        with patch("kernel.config.ITERATIONS_DIR", tmp_iterations):
            wired = wiring.record_iteration(
                iteration_id, gaps, execution_result, verification, elapsed
            )

        # Seed version
        seed_iterations = Path(tmpdir) / "seed_iterations"
        with patch("kernel.config.ITERATIONS_DIR", seed_iterations):
            seed_result = seed.record_iteration(
                iteration_id, gaps, execution_result, verification, elapsed
            )

    return wired, seed_result


def _validate_report_structure(report: dict[str, Any]) -> None:
    """Assert the dict has all keys that kernel/loop.py expects."""
    # Keys accessed by kernel/loop.py
    assert "id" in report
    assert isinstance(report["id"], str)
    assert "summary" in report
    assert isinstance(report["summary"], str)
    assert "cost_usd" in report
    assert "total_tokens" in report

    # Keys in the full report
    assert "timestamp" in report
    assert "success" in report
    assert isinstance(report["success"], bool)
    assert "gaps_addressed" in report
    assert "improvements" in report
    assert isinstance(report["improvements"], list)
    assert "issues" in report
    assert isinstance(report["issues"], list)
    assert "agent_output_excerpt" in report
    assert "elapsed_seconds" in report


def test_wiring_returns_compatible_structure() -> None:
    """The wired record_iteration returns a dict with all expected keys."""
    wired, _ = _call_both()
    _validate_report_structure(wired)


def test_wiring_matches_seed_keys() -> None:
    """Both return dicts with the same set of keys."""
    wired, seed_result = _call_both()
    assert set(wired.keys()) == set(seed_result.keys())


def test_wiring_matches_seed_static_values() -> None:
    """Values that don't depend on timing match exactly."""
    wired, seed_result = _call_both()

    assert wired["id"] == seed_result["id"]
    assert wired["success"] == seed_result["success"]
    assert wired["summary"] == seed_result["summary"]
    assert wired["gaps_addressed"] == seed_result["gaps_addressed"]
    assert wired["improvements"] == seed_result["improvements"]
    assert wired["issues"] == seed_result["issues"]
    assert wired["agent_output_excerpt"] == seed_result["agent_output_excerpt"]
    assert wired["elapsed_seconds"] == seed_result["elapsed_seconds"]
    assert wired["cost_usd"] == seed_result["cost_usd"]
    assert wired["total_tokens"] == seed_result["total_tokens"]


def test_wiring_summary_with_failures() -> None:
    """Summary generation matches seed for failure case."""
    verification = _make_verification(passed=False, issues=["Something broke"])
    wired, seed_result = _call_both(verification=verification)

    assert wired["summary"] == seed_result["summary"]
    assert wired["success"] is False


def test_wiring_summary_no_changes() -> None:
    """Summary generation matches seed when nothing happened."""
    verification = _make_verification()
    wired, seed_result = _call_both(verification=verification)

    assert wired["summary"] == seed_result["summary"]
    assert wired["summary"] == "No significant changes"
