"""Tests for wiring.py graceful degradation, health monitoring, and quota-aware retry.

Verifies that pipeline steps fall back to seed implementations when
module imports or executions fail, that fallback events are recorded,
and that quota exhaustion triggers automatic sleep/retry.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any
from unittest.mock import patch

if TYPE_CHECKING:
    import pytest


class TestGracefulDegradation:
    """Pipeline steps fall back to seed when modules fail."""

    def test_scan_falls_back_on_runtime_error(self) -> None:
        """When the scanner module raises, seed.scan_project_state is used."""
        import wiring

        original = wiring._scan_fn

        def broken() -> dict[str, Any]:
            raise RuntimeError("module crashed")

        wiring._scan_fn = broken
        try:
            with patch.object(wiring.seed, "scan_project_state") as mock_seed:
                mock_seed.return_value = {"files": [], "modules": {}}
                result = wiring.scan_project_state()
                mock_seed.assert_called_once()
                assert result == {"files": [], "modules": {}}
        finally:
            wiring._scan_fn = original

    def test_scan_uses_seed_when_module_is_none(self) -> None:
        """When the scanner module failed to import, seed is used."""
        import wiring

        original = wiring._scan_fn
        wiring._scan_fn = None
        try:
            with patch.object(wiring.seed, "scan_project_state") as mock_seed:
                mock_seed.return_value = {"files": ["a.py"], "modules": {}}
                result = wiring.scan_project_state()
                mock_seed.assert_called_once()
                assert result["files"] == ["a.py"]
        finally:
            wiring._scan_fn = original

    def test_scan_uses_module_when_healthy(self) -> None:
        """When the module works, its result is returned (not seed)."""
        import wiring

        original = wiring._scan_fn
        expected: dict[str, Any] = {"files": ["from_module.py"], "source": "module"}

        def healthy() -> dict[str, Any]:
            return expected

        wiring._scan_fn = healthy
        try:
            with patch.object(wiring.seed, "scan_project_state") as mock_seed:
                result = wiring.scan_project_state()
                mock_seed.assert_not_called()
                assert result == expected
        finally:
            wiring._scan_fn = original

    def test_analyze_gaps_falls_back_on_runtime_error(self) -> None:
        """When the gap analyzer module raises, seed.analyze_gaps is used."""
        import wiring

        original = wiring._analyze_fn

        def broken(vision: str, state: dict[str, Any], history: list[dict[str, Any]]) -> str:
            raise ValueError("analysis failed")

        wiring._analyze_fn = broken
        try:
            with patch.object(wiring.seed, "analyze_gaps") as mock_seed:
                mock_seed.return_value = "NO_GAPS"
                result = wiring.analyze_gaps("vision", {}, [])
                mock_seed.assert_called_once_with("vision", {}, [])
                assert result == "NO_GAPS"
        finally:
            wiring._analyze_fn = original

    def test_plan_iteration_falls_back_on_runtime_error(self) -> None:
        """When the planner module raises, seed.plan_iteration is used."""
        import wiring

        original = wiring._plan_fn

        def broken(
            state: dict[str, Any], gaps: str, history: list[dict[str, Any]], count: int
        ) -> str:
            raise TypeError("plan error")

        wiring._plan_fn = broken
        try:
            with patch.object(wiring.seed, "plan_iteration") as mock_seed:
                mock_seed.return_value = "seed prompt"
                result = wiring.plan_iteration({}, "gaps", [], 1)
                mock_seed.assert_called_once_with({}, "gaps", [], 1)
                assert result == "seed prompt"
        finally:
            wiring._plan_fn = original

    def test_execute_plan_falls_back_on_runtime_error(self) -> None:
        """When the executor module raises, seed.execute_plan is used."""
        import wiring

        original = wiring._execute_fn

        def broken(prompt: str, dry_run: bool = False) -> dict[str, Any]:
            raise OSError("exec failed")

        wiring._execute_fn = broken
        try:
            with patch.object(wiring.seed, "execute_plan") as mock_seed:
                mock_seed.return_value = {"success": False}
                result = wiring.execute_plan("prompt", dry_run=True)
                mock_seed.assert_called_once_with("prompt", dry_run=True)
                assert result == {"success": False}
        finally:
            wiring._execute_fn = original

    def test_verify_iteration_falls_back_on_runtime_error(self) -> None:
        """When the verifier module raises, seed.verify_iteration is used."""
        import wiring

        original = wiring._verify_fn

        def broken(pre: dict[str, Any], post: dict[str, Any]) -> dict[str, Any]:
            raise KeyError("verify error")

        wiring._verify_fn = broken
        try:
            with patch.object(wiring.seed, "verify_iteration") as mock_seed:
                mock_seed.return_value = {"passed": True, "issues": [], "improvements": []}
                result = wiring.verify_iteration({}, {})
                mock_seed.assert_called_once_with({}, {})
                assert result["passed"] is True
        finally:
            wiring._verify_fn = original

    def test_record_iteration_falls_back_on_runtime_error(self) -> None:
        """When the reporter module raises, seed.record_iteration is used."""
        import wiring

        original = wiring._record_fn

        def broken(*_args: Any, **_kwargs: Any) -> dict[str, Any]:
            raise OSError("record failed")

        wiring._record_fn = broken
        try:
            with patch.object(wiring.seed, "record_iteration") as mock_seed:
                mock_seed.return_value = {"id": "test", "summary": "seed"}
                result = wiring.record_iteration("id", "gaps", {}, {}, 1.0)
                mock_seed.assert_called_once_with("id", "gaps", {}, {}, 1.0)
                assert result["summary"] == "seed"
        finally:
            wiring._record_fn = original


class TestHealthMonitoring:
    """Fallback events are recorded to the health file."""

    def test_record_fallback_writes_event(self, tmp_path: Any) -> None:
        """A fallback event is persisted to the health file."""
        import wiring

        health_file = tmp_path / "health.json"
        with patch.object(wiring, "_HEALTH_FILE", health_file):
            wiring._record_fallback("scan_project_state", "test error", "runtime")

        assert health_file.exists()
        data = json.loads(health_file.read_text())
        assert len(data["fallback_events"]) == 1
        assert data["fallback_events"][0]["step"] == "scan_project_state"
        assert data["fallback_events"][0]["error_type"] == "runtime"
        assert data["module_stats"]["scan_project_state"]["fallbacks"] == 1

    def test_record_fallback_appends_to_existing(self, tmp_path: Any) -> None:
        """Multiple fallback events accumulate."""
        import wiring

        health_file = tmp_path / "health.json"
        with patch.object(wiring, "_HEALTH_FILE", health_file):
            wiring._record_fallback("scan_project_state", "err1", "import")
            wiring._record_fallback("scan_project_state", "err2", "runtime")
            wiring._record_fallback("analyze_gaps", "err3", "runtime")

        data = json.loads(health_file.read_text())
        assert len(data["fallback_events"]) == 3
        assert data["module_stats"]["scan_project_state"]["fallbacks"] == 2
        assert data["module_stats"]["analyze_gaps"]["fallbacks"] == 1

    def test_record_fallback_bounds_events_to_100(self, tmp_path: Any) -> None:
        """Events list is bounded to 100 entries."""
        import wiring

        health_file = tmp_path / "health.json"
        with patch.object(wiring, "_HEALTH_FILE", health_file):
            for i in range(110):
                wiring._record_fallback("step", f"error {i}", "runtime")

        data = json.loads(health_file.read_text())
        assert len(data["fallback_events"]) == 100

    def test_get_health_stats_returns_data(self, tmp_path: Any) -> None:
        """get_health_stats reads persisted health data."""
        import wiring

        health_file = tmp_path / "health.json"
        with patch.object(wiring, "_HEALTH_FILE", health_file):
            wiring._record_fallback("verify_iteration", "err", "runtime")
            stats = wiring.get_health_stats()

        assert "fallback_events" in stats
        assert "module_stats" in stats
        assert stats["module_stats"]["verify_iteration"]["fallbacks"] == 1

    def test_get_health_stats_returns_empty_when_no_file(self, tmp_path: Any) -> None:
        """get_health_stats returns empty dict when no health file exists."""
        import wiring

        health_file = tmp_path / "nonexistent" / "health.json"
        with patch.object(wiring, "_HEALTH_FILE", health_file):
            stats = wiring.get_health_stats()

        assert stats == {}

    def test_record_fallback_survives_io_error(self) -> None:
        """_record_fallback never raises, even if I/O fails."""
        import wiring

        with patch.object(wiring, "_HEALTH_FILE") as mock_file:
            mock_file.parent.mkdir.side_effect = PermissionError("denied")
            # Should not raise
            wiring._record_fallback("step", "error", "runtime")


class TestFallbackLogging:
    """Fallback events are logged via the anima.wiring logger."""

    def test_runtime_fallback_logs_warning(self, caplog: pytest.LogCaptureFixture) -> None:
        """A runtime fallback produces a warning log message."""
        import wiring

        original = wiring._scan_fn

        def broken() -> dict[str, Any]:
            raise RuntimeError("kaboom")

        wiring._scan_fn = broken
        try:
            with patch.object(wiring.seed, "scan_project_state") as mock_seed:
                mock_seed.return_value = {"files": []}
                with caplog.at_level("WARNING", logger="anima.wiring"):
                    wiring.scan_project_state()
                assert any("[fallback]" in record.message for record in caplog.records)
        finally:
            wiring._scan_fn = original


class TestGetQuotaSleepSeconds:
    """_get_quota_sleep_seconds extracts sleep duration from execution results."""

    def test_returns_none_for_no_quota_state(self) -> None:
        """No quota_state in result means no sleep needed."""
        import wiring

        assert wiring._get_quota_sleep_seconds({"success": True}) is None

    def test_returns_none_for_ok_status(self) -> None:
        """OK status means no sleep needed."""
        import wiring

        result: dict[str, Any] = {
            "quota_state": {"status": "ok"},
        }
        assert wiring._get_quota_sleep_seconds(result) is None

    def test_rate_limited_returns_retry_after(self) -> None:
        """Rate-limited with retry_after_seconds uses that value."""
        import wiring

        result: dict[str, Any] = {
            "quota_state": {"status": "rate_limited", "retry_after_seconds": 45.0},
        }
        assert wiring._get_quota_sleep_seconds(result) == 45.0

    def test_rate_limited_uses_default_when_no_retry_after(self) -> None:
        """Rate-limited without retry_after uses QUOTA_SLEEP_RATE_LIMITED."""
        import wiring

        result: dict[str, Any] = {
            "quota_state": {"status": "rate_limited"},
        }
        assert wiring._get_quota_sleep_seconds(result) == wiring.QUOTA_SLEEP_RATE_LIMITED

    def test_quota_exhausted_returns_retry_after(self) -> None:
        """Quota-exhausted with retry_after_seconds uses that value."""
        import wiring

        result: dict[str, Any] = {
            "quota_state": {"status": "quota_exhausted", "retry_after_seconds": 120.0},
        }
        assert wiring._get_quota_sleep_seconds(result) == 120.0

    def test_quota_exhausted_uses_default_when_no_retry_after(self) -> None:
        """Quota-exhausted without retry_after uses QUOTA_SLEEP_EXHAUSTED."""
        import wiring

        result: dict[str, Any] = {
            "quota_state": {"status": "quota_exhausted"},
        }
        assert wiring._get_quota_sleep_seconds(result) == wiring.QUOTA_SLEEP_EXHAUSTED

    def test_sleep_capped_at_max(self) -> None:
        """Sleep duration is capped at QUOTA_SLEEP_MAX."""
        import wiring

        result: dict[str, Any] = {
            "quota_state": {"status": "quota_exhausted", "retry_after_seconds": 9999.0},
        }
        assert wiring._get_quota_sleep_seconds(result) == wiring.QUOTA_SLEEP_MAX

    def test_handles_enum_status_values(self) -> None:
        """Works with QuotaStatus enum objects, not just strings."""
        import wiring
        from domain.models import QuotaStatus

        result: dict[str, Any] = {
            "quota_state": {"status": QuotaStatus.RATE_LIMITED, "retry_after_seconds": 30.0},
        }
        assert wiring._get_quota_sleep_seconds(result) == 30.0

    def test_returns_none_for_none_status(self) -> None:
        """quota_state with no status key returns None."""
        import wiring

        result: dict[str, Any] = {"quota_state": {}}
        assert wiring._get_quota_sleep_seconds(result) is None


class TestQuotaAwareExecution:
    """execute_plan sleeps and retries on quota exhaustion."""

    def test_no_retry_on_normal_execution(self) -> None:
        """Normal execution returns immediately without sleep."""
        import wiring

        original = wiring._execute_fn
        ok_result: dict[str, Any] = {"success": True, "output": "done"}

        def ok_exec(prompt: str, dry_run: bool = False) -> dict[str, Any]:
            return ok_result

        wiring._execute_fn = ok_exec
        try:
            with patch("wiring.time.sleep") as mock_sleep:
                result = wiring.execute_plan("test prompt")
                mock_sleep.assert_not_called()
                assert result == ok_result
        finally:
            wiring._execute_fn = original

    def test_sleeps_and_retries_on_rate_limit(self) -> None:
        """Rate-limited first attempt triggers sleep then retry."""
        import wiring

        original = wiring._execute_fn
        call_count = 0
        rate_limited: dict[str, Any] = {
            "success": False,
            "quota_state": {"status": "rate_limited", "retry_after_seconds": 10.0},
        }
        ok_result: dict[str, Any] = {"success": True, "output": "retry worked"}

        def quota_then_ok(prompt: str, dry_run: bool = False) -> dict[str, Any]:
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return rate_limited
            return ok_result

        wiring._execute_fn = quota_then_ok
        try:
            with patch("wiring.time.sleep") as mock_sleep:
                result = wiring.execute_plan("test prompt")
                mock_sleep.assert_called_once_with(10.0)
                assert result == ok_result
                assert call_count == 2
        finally:
            wiring._execute_fn = original

    def test_sleeps_and_retries_on_quota_exhausted(self) -> None:
        """Quota-exhausted first attempt triggers longer sleep then retry."""
        import wiring

        original = wiring._execute_fn
        call_count = 0
        exhausted: dict[str, Any] = {
            "success": False,
            "quota_state": {"status": "quota_exhausted"},
        }
        ok_result: dict[str, Any] = {"success": True, "output": "recovered"}

        def exhaust_then_ok(prompt: str, dry_run: bool = False) -> dict[str, Any]:
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return exhausted
            return ok_result

        wiring._execute_fn = exhaust_then_ok
        try:
            with patch("wiring.time.sleep") as mock_sleep:
                result = wiring.execute_plan("test prompt")
                mock_sleep.assert_called_once_with(wiring.QUOTA_SLEEP_EXHAUSTED)
                assert result == ok_result
        finally:
            wiring._execute_fn = original

    def test_returns_failed_result_when_retry_also_quota_limited(self) -> None:
        """When retry also hits quota, the failed result is returned."""
        import wiring

        original = wiring._execute_fn
        exhausted: dict[str, Any] = {
            "success": False,
            "quota_state": {"status": "quota_exhausted"},
        }

        def always_exhausted(prompt: str, dry_run: bool = False) -> dict[str, Any]:
            return exhausted

        wiring._execute_fn = always_exhausted
        try:
            with patch("wiring.time.sleep"):
                result = wiring.execute_plan("test prompt")
                assert result["success"] is False
                assert result["quota_state"]["status"] == "quota_exhausted"
        finally:
            wiring._execute_fn = original

    def test_only_retries_once(self) -> None:
        """Exactly one retry attempt is made, not multiple."""
        import wiring

        original = wiring._execute_fn
        call_count = 0
        exhausted: dict[str, Any] = {
            "success": False,
            "quota_state": {"status": "rate_limited", "retry_after_seconds": 5.0},
        }

        def count_calls(prompt: str, dry_run: bool = False) -> dict[str, Any]:
            nonlocal call_count
            call_count += 1
            return exhausted

        wiring._execute_fn = count_calls
        try:
            with patch("wiring.time.sleep"):
                wiring.execute_plan("test prompt")
                # Initial call + 1 retry = 2 total
                assert call_count == 2
        finally:
            wiring._execute_fn = original

    def test_quota_retry_logs_warning(self, caplog: pytest.LogCaptureFixture) -> None:
        """Quota sleep/retry is logged at WARNING level."""
        import wiring

        original = wiring._execute_fn
        rate_limited: dict[str, Any] = {
            "success": False,
            "quota_state": {"status": "rate_limited", "retry_after_seconds": 1.0},
        }
        ok_result: dict[str, Any] = {"success": True}

        call_count = 0

        def quota_then_ok(prompt: str, dry_run: bool = False) -> dict[str, Any]:
            nonlocal call_count
            call_count += 1
            return rate_limited if call_count == 1 else ok_result

        wiring._execute_fn = quota_then_ok
        try:
            with patch("wiring.time.sleep"):
                with caplog.at_level("WARNING", logger="anima.wiring"):
                    wiring.execute_plan("test prompt")
                assert any("[quota]" in record.message for record in caplog.records)
        finally:
            wiring._execute_fn = original
