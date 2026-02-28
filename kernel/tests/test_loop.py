"""Tests for kernel/loop.py — iteration loop control flow."""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock

import pytest

from kernel import loop


def _make_state(**overrides: Any) -> dict[str, Any]:
    """Create a minimal valid state dict."""
    base: dict[str, Any] = {
        "iteration_count": 0,
        "consecutive_failures": 0,
        "last_iteration": None,
        "completed_items": [],
        "module_versions": {},
        "status": "alive",
        "total_cost_usd": 0,
        "total_tokens": 0,
        "total_elapsed_seconds": 0,
        "current_milestone": "v0.0.0",
    }
    base.update(overrides)
    return base


@pytest.fixture()
def mock_wiring(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    """Provide a mock wiring module with all pipeline steps."""
    import wiring

    mock_scan = MagicMock(
        return_value={
            "files": ["a.py"],
            "modules": {},
            "domain_exists": True,
            "has_tests": True,
            "inbox_items": [],
            "_protected_hashes": {},
        }
    )
    mock_analyze = MagicMock(return_value="NO_GAPS")
    mock_plan = MagicMock(return_value="prompt text")
    mock_execute = MagicMock(
        return_value={
            "success": True,
            "output": "done",
            "cost_usd": 0.01,
            "total_tokens": 500,
        }
    )
    mock_verify = MagicMock(
        return_value={
            "passed": True,
            "improvements": ["New files: 1"],
            "issues": [],
        }
    )
    mock_record = MagicMock(
        return_value={
            "id": "0001-test",
            "summary": "ok",
            "success": True,
            "cost_usd": 0.01,
            "total_tokens": 500,
        }
    )

    monkeypatch.setattr(wiring, "scan_project_state", mock_scan)
    monkeypatch.setattr(wiring, "analyze_gaps", mock_analyze)
    monkeypatch.setattr(wiring, "plan_iteration", mock_plan)
    monkeypatch.setattr(wiring, "execute_plan", mock_execute)
    monkeypatch.setattr(wiring, "verify_iteration", mock_verify)
    monkeypatch.setattr(wiring, "record_iteration", mock_record)

    mock = MagicMock()
    mock.scan_project_state = mock_scan
    mock.analyze_gaps = mock_analyze
    mock.plan_iteration = mock_plan
    mock.execute_plan = mock_execute
    mock.verify_iteration = mock_verify
    mock.record_iteration = mock_record
    return mock


@pytest.fixture(autouse=True)
def _mock_kernel_ops(monkeypatch: pytest.MonkeyPatch) -> None:
    """Mock all kernel infrastructure called by the loop."""
    monkeypatch.setattr(loop, "_invalidate_modules", lambda: None)
    monkeypatch.setattr(loop, "create_snapshot", MagicMock(return_value="abc123"))
    monkeypatch.setattr(loop, "commit_iteration", MagicMock())
    monkeypatch.setattr(loop, "rollback_to", MagicMock())
    monkeypatch.setattr(loop, "tag_milestone_if_advanced", MagicMock())
    monkeypatch.setattr(loop, "save_state", MagicMock())
    monkeypatch.setattr(loop, "load_history", MagicMock(return_value=[]))
    # Provide a VISION_FILE that exists
    monkeypatch.setattr(loop, "VISION_FILE", MagicMock(read_text=MagicMock(return_value="vision")))


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_no_gaps_early_return(mock_wiring: MagicMock) -> None:
    """When analyze_gaps returns NO_GAPS, loop sets sleep and returns early."""
    state = _make_state()
    result = loop.run_iteration(state)
    assert result["status"] == "sleep"
    # execute_plan should never be called
    mock_wiring.execute_plan.assert_not_called()


def test_success_commits_and_resets_failures(mock_wiring: MagicMock) -> None:
    """Successful iteration → commit + consecutive_failures reset to 0."""
    mock_wiring.analyze_gaps.return_value = "some gap"
    state = _make_state(consecutive_failures=2)
    result = loop.run_iteration(state)
    assert result["consecutive_failures"] == 0
    loop.commit_iteration.assert_called_once()  # type: ignore[attr-defined]


def test_failure_rollback_and_increment(mock_wiring: MagicMock) -> None:
    """Failed verification → rollback + increment consecutive_failures."""
    mock_wiring.analyze_gaps.return_value = "some gap"
    mock_wiring.verify_iteration.return_value = {
        "passed": False,
        "improvements": [],
        "issues": ["CRITICAL: kernel/x.py modified"],
    }
    mock_wiring.record_iteration.return_value = {
        "id": "0001",
        "summary": "fail",
        "success": False,
        "cost_usd": 0,
        "total_tokens": 0,
    }
    state = _make_state(consecutive_failures=0)
    result = loop.run_iteration(state)
    assert result["consecutive_failures"] == 1
    loop.rollback_to.assert_called_once_with("abc123")  # type: ignore[attr-defined]


def test_max_failures_pauses(mock_wiring: MagicMock) -> None:
    """Reaching MAX_CONSECUTIVE_FAILURES → status becomes 'paused'."""
    mock_wiring.analyze_gaps.return_value = "some gap"
    mock_wiring.verify_iteration.return_value = {
        "passed": False,
        "improvements": [],
        "issues": ["error"],
    }
    mock_wiring.record_iteration.return_value = {
        "id": "0001",
        "summary": "fail",
        "success": False,
        "cost_usd": 0,
        "total_tokens": 0,
    }
    # Start at MAX - 1 so one more failure triggers pause
    from kernel.config import MAX_CONSECUTIVE_FAILURES

    state = _make_state(consecutive_failures=MAX_CONSECUTIVE_FAILURES - 1)
    result = loop.run_iteration(state)
    assert result["status"] == "paused"


def test_dry_run_skips_verify_commit(mock_wiring: MagicMock) -> None:
    """dry_run=True → skip verification and commit."""
    mock_wiring.analyze_gaps.return_value = "some gap"
    state = _make_state()
    loop.run_iteration(state, dry_run=True)
    mock_wiring.verify_iteration.assert_not_called()
    loop.commit_iteration.assert_not_called()  # type: ignore[attr-defined]


def test_exception_during_verify_rollback(mock_wiring: MagicMock) -> None:
    """Exception in verify → rollback + increment failures."""
    mock_wiring.analyze_gaps.return_value = "some gap"
    mock_wiring.verify_iteration.side_effect = RuntimeError("boom")
    state = _make_state(consecutive_failures=0)
    result = loop.run_iteration(state)
    assert result["consecutive_failures"] == 1
    loop.rollback_to.assert_called_once_with("abc123")  # type: ignore[attr-defined]
