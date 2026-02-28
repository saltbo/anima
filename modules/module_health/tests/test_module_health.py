"""Tests for module_health scoring."""

from __future__ import annotations

from typing import Any

from domain.models import HealthStatus, ModuleInfo
from modules.module_health.core import score_health

_TS = "2026-02-28T00:00:00+00:00"


def _mi(
    name: str = "scanner",
    *,
    has_contract: bool = True,
    has_spec: bool = True,
    has_core: bool = True,
    has_tests: bool = True,
) -> ModuleInfo:
    """Shorthand module info factory."""
    return ModuleInfo(
        name=name,
        has_contract=has_contract,
        has_spec=has_spec,
        has_core=has_core,
        has_tests=has_tests,
        files=(),
    )


class TestStructuralScoring:
    """Tests for the structural completeness component."""

    def test_fully_complete_module(self) -> None:
        """All four components present → structural = 1.0."""
        report = score_health((_mi(),), {}, _TS)
        mod = report.modules[0]
        assert mod.score == 1.0
        assert mod.status == HealthStatus.HEALTHY
        assert mod.missing_components == ()

    def test_no_components(self) -> None:
        """No components → structural = 0.0, overall < 0.4 → CRITICAL."""
        m = _mi(has_contract=False, has_spec=False, has_core=False, has_tests=False)
        report = score_health((m,), {}, _TS)
        mod = report.modules[0]
        # structural=0.0, reliability=1.0 (no stats) → 0.6*0 + 0.4*1 = 0.4
        assert mod.score == 0.4
        assert mod.status == HealthStatus.DEGRADED
        assert set(mod.missing_components) == {"CONTRACT.md", "SPEC.md", "core.py", "tests"}

    def test_partial_components(self) -> None:
        """Two of four components → structural = 0.5."""
        m = _mi(has_contract=True, has_spec=True, has_core=False, has_tests=False)
        report = score_health((m,), {}, _TS)
        mod = report.modules[0]
        # structural=0.5, reliability=1.0 → 0.6*0.5 + 0.4*1.0 = 0.7
        assert mod.score == 0.7
        assert mod.status == HealthStatus.HEALTHY
        assert "core.py" in mod.missing_components
        assert "tests" in mod.missing_components


class TestReliabilityScoring:
    """Tests for the runtime reliability component."""

    def test_no_stats_defaults_reliable(self) -> None:
        """Modules without runtime stats get reliability = 1.0."""
        report = score_health((_mi(),), {}, _TS)
        assert report.modules[0].fallback_rate == 0.0

    def test_all_fallbacks(self) -> None:
        """Module with 100% fallback rate → reliability = 0.0."""
        stats: dict[str, Any] = {
            "module_stats": {
                "scan_project_state": {"calls": 0, "fallbacks": 10},
            },
        }
        report = score_health((_mi(),), stats, _TS)
        mod = report.modules[0]
        # structural=1.0, reliability=0.0 → 0.6*1.0 + 0.4*0.0 = 0.6
        assert mod.score == 0.6
        assert mod.fallback_rate == 1.0
        assert mod.status == HealthStatus.DEGRADED

    def test_mixed_calls_and_fallbacks(self) -> None:
        """50% fallback rate → reliability = 0.5."""
        stats: dict[str, Any] = {
            "module_stats": {
                "scan_project_state": {"calls": 5, "fallbacks": 5},
            },
        }
        report = score_health((_mi(),), stats, _TS)
        mod = report.modules[0]
        # structural=1.0, reliability=0.5 → 0.6*1.0 + 0.4*0.5 = 0.8
        assert mod.score == 0.8
        assert mod.fallback_rate == 0.5

    def test_non_pipeline_module_no_fallback_tracking(self) -> None:
        """Non-pipeline modules (e.g. gate) have no step mapping → reliability 1.0."""
        m = _mi(name="gate")
        report = score_health((m,), {}, _TS)
        assert report.modules[0].fallback_rate == 0.0
        assert report.modules[0].score == 1.0


class TestOverallReport:
    """Tests for aggregated report behavior."""

    def test_empty_modules_list(self) -> None:
        """No modules → overall = 1.0 (default)."""
        report = score_health((), {}, _TS)
        assert report.overall_score == 1.0
        assert report.modules == ()
        assert report.generated_at == _TS

    def test_overall_is_average(self) -> None:
        """Overall score is the average of individual module scores."""
        m1 = _mi(name="scanner")  # fully complete
        m2 = _mi(
            name="gap_analyzer",
            has_contract=False,
            has_spec=False,
            has_core=False,
            has_tests=False,
        )
        report = score_health((m1, m2), {}, _TS)
        expected = (1.0 + 0.4) / 2  # 0.7
        assert report.overall_score == expected

    def test_multiple_modules_different_health(self) -> None:
        """Each module gets its own independent score."""
        m_healthy = _mi(name="scanner")
        m_degraded = _mi(name="executor", has_core=False, has_tests=False)
        stats: dict[str, Any] = {
            "module_stats": {
                "execute_plan": {"calls": 0, "fallbacks": 20},
            },
        }
        report = score_health((m_healthy, m_degraded), stats, _TS)

        by_name = {m.module_name: m for m in report.modules}
        assert by_name["scanner"].status == HealthStatus.HEALTHY
        # executor: structural=0.5, reliability=0.0 → 0.6*0.5 + 0.4*0 = 0.3
        assert by_name["executor"].status == HealthStatus.CRITICAL
        assert by_name["executor"].score == 0.3

    def test_timestamp_propagated(self) -> None:
        """Generated timestamp is set on the report."""
        ts = "2026-12-25T12:00:00+00:00"
        report = score_health((_mi(),), {}, ts)
        assert report.generated_at == ts


class TestIssueReporting:
    """Tests for the issues field on ModuleHealthScore."""

    def test_high_fallback_rate_reported(self) -> None:
        """Fallback rate > 50% produces a high fallback rate issue."""
        stats: dict[str, Any] = {
            "module_stats": {
                "scan_project_state": {"calls": 1, "fallbacks": 9},
            },
        }
        report = score_health((_mi(),), stats, _TS)
        issues = report.modules[0].issues
        assert any("high fallback rate" in i for i in issues)

    def test_low_fallback_rate_reported(self) -> None:
        """Any fallback rate > 0 produces a fallback rate issue."""
        stats: dict[str, Any] = {
            "module_stats": {
                "scan_project_state": {"calls": 9, "fallbacks": 1},
            },
        }
        report = score_health((_mi(),), stats, _TS)
        issues = report.modules[0].issues
        assert any("fallback rate" in i for i in issues)

    def test_missing_components_in_issues(self) -> None:
        """Missing components produce a 'missing: ...' issue."""
        m = _mi(has_tests=False)
        report = score_health((m,), {}, _TS)
        issues = report.modules[0].issues
        assert any("missing: tests" in i for i in issues)

    def test_healthy_module_no_issues(self) -> None:
        """Fully healthy module has no issues."""
        report = score_health((_mi(),), {}, _TS)
        assert report.modules[0].issues == ()
