"""Tests for the self-improvement benchmark."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from benchmarks.self_improvement import (
    BRIDGE_MAP,
    CONFORMANCE_TEST_MAP,
    PIPELINE_STEPS,
    check_conformance_tests,
    check_module_implementations,
    check_structural_completeness,
    check_wiring_integration,
    compute_iteration_metrics,
    validate,
)


def _setup_module(base: Path, name: str, *, complete: bool = True) -> None:
    """Create a module directory with optional completeness."""
    module_dir = base / name
    module_dir.mkdir(parents=True, exist_ok=True)
    if complete:
        (module_dir / "CONTRACT.md").write_text("# Contract")
        (module_dir / "SPEC.md").write_text("# Spec")
        (module_dir / "core.py").write_text("# core")
        tests_dir = module_dir / "tests"
        tests_dir.mkdir(exist_ok=True)
        (tests_dir / "__init__.py").touch()
        (tests_dir / f"test_{name}.py").write_text("def test_placeholder() -> None: pass")


def _setup_conformance(conf_dir: Path, test_file: str) -> None:
    """Create a conformance test file."""
    conf_dir.mkdir(parents=True, exist_ok=True)
    (conf_dir / test_file).write_text("def test_placeholder() -> None: pass")


def _setup_wiring(path: Path, bridges: list[str]) -> None:
    """Create a wiring.py with specified bridge imports."""
    lines = ["# wiring.py"]
    for bridge in bridges:
        lines.append(f"from adapters.{bridge} import something")
    path.write_text("\n".join(lines))


def _setup_iterations(iter_dir: Path, logs: list[dict[str, Any]]) -> None:
    """Create iteration log files."""
    iter_dir.mkdir(exist_ok=True)
    for i, log_data in enumerate(logs):
        (iter_dir / f"{i:04d}.json").write_text(json.dumps(log_data))


class TestCheckModuleImplementations:
    """Tests for check_module_implementations."""

    def test_all_present(self, tmp_path: Path) -> None:
        """All pipeline steps have core.py."""
        modules_dir = tmp_path / "modules"
        for step in PIPELINE_STEPS:
            _setup_module(modules_dir, step)
        criteria = check_module_implementations(modules_dir)
        assert all(c.passed for c in criteria)
        assert len(criteria) == len(PIPELINE_STEPS)

    def test_all_missing(self, tmp_path: Path) -> None:
        """No modules exist."""
        modules_dir = tmp_path / "modules"
        modules_dir.mkdir()
        criteria = check_module_implementations(modules_dir)
        assert all(not c.passed for c in criteria)

    def test_partial(self, tmp_path: Path) -> None:
        """Only some modules exist."""
        modules_dir = tmp_path / "modules"
        _setup_module(modules_dir, "scanner")
        _setup_module(modules_dir, "executor")
        criteria = check_module_implementations(modules_dir)
        passed = [c for c in criteria if c.passed]
        assert len(passed) == 2


class TestCheckStructuralCompleteness:
    """Tests for check_structural_completeness."""

    def test_all_complete(self, tmp_path: Path) -> None:
        """All modules are structurally complete."""
        modules_dir = tmp_path / "modules"
        for step in PIPELINE_STEPS:
            _setup_module(modules_dir, step, complete=True)
        criteria = check_structural_completeness(modules_dir)
        assert all(c.passed for c in criteria)

    def test_missing_spec(self, tmp_path: Path) -> None:
        """A module missing SPEC.md is incomplete."""
        modules_dir = tmp_path / "modules"
        _setup_module(modules_dir, "scanner", complete=True)
        (modules_dir / "scanner" / "SPEC.md").unlink()
        # Set up remaining modules as complete.
        for step in PIPELINE_STEPS:
            if step != "scanner":
                _setup_module(modules_dir, step, complete=True)
        criteria = check_structural_completeness(modules_dir)
        scanner = next(c for c in criteria if "scanner" in c.name)
        assert not scanner.passed
        assert "SPEC.md" in scanner.detail

    def test_missing_tests(self, tmp_path: Path) -> None:
        """A module without test files is incomplete."""
        modules_dir = tmp_path / "modules"
        _setup_module(modules_dir, "planner", complete=True)
        # Remove the test file (but keep the directory).
        for f in (modules_dir / "planner" / "tests").glob("test_*.py"):
            f.unlink()
        for step in PIPELINE_STEPS:
            if step != "planner":
                _setup_module(modules_dir, step, complete=True)
        criteria = check_structural_completeness(modules_dir)
        planner = next(c for c in criteria if "planner" in c.name)
        assert not planner.passed
        assert "tests/" in planner.detail


class TestCheckConformanceTests:
    """Tests for check_conformance_tests."""

    def test_all_present(self, tmp_path: Path) -> None:
        """All conformance tests exist."""
        conf_dir = tmp_path / "conformance"
        for test_file in CONFORMANCE_TEST_MAP.values():
            _setup_conformance(conf_dir, test_file)
        criteria = check_conformance_tests(conf_dir)
        assert all(c.passed for c in criteria)

    def test_all_missing(self, tmp_path: Path) -> None:
        """No conformance tests exist."""
        conf_dir = tmp_path / "conformance"
        conf_dir.mkdir(parents=True)
        criteria = check_conformance_tests(conf_dir)
        assert all(not c.passed for c in criteria)


class TestCheckWiringIntegration:
    """Tests for check_wiring_integration."""

    def test_all_wired(self, tmp_path: Path) -> None:
        """All bridges are imported in wiring.py."""
        wiring_path = tmp_path / "wiring.py"
        _setup_wiring(wiring_path, list(BRIDGE_MAP.values()))
        criteria = check_wiring_integration(wiring_path)
        assert all(c.passed for c in criteria)

    def test_one_bridge(self, tmp_path: Path) -> None:
        """Only one bridge is imported."""
        wiring_path = tmp_path / "wiring.py"
        _setup_wiring(wiring_path, ["scanner_bridge"])
        criteria = check_wiring_integration(wiring_path)
        wired = [c for c in criteria if c.passed]
        assert len(wired) == 1

    def test_missing_file(self, tmp_path: Path) -> None:
        """wiring.py doesn't exist."""
        wiring_path = tmp_path / "wiring.py"
        criteria = check_wiring_integration(wiring_path)
        assert all(not c.passed for c in criteria)


class TestComputeIterationMetrics:
    """Tests for compute_iteration_metrics."""

    def test_with_logs(self, tmp_path: Path) -> None:
        """Computes metrics from iteration logs."""
        _setup_iterations(
            tmp_path / "iterations",
            [
                {
                    "success": True,
                    "cost_usd": 1.0,
                    "total_tokens": 1000,
                    "elapsed_seconds": 100.0,
                },
                {
                    "success": False,
                    "cost_usd": 0.5,
                    "total_tokens": 500,
                    "elapsed_seconds": 50.0,
                },
                {
                    "success": True,
                    "cost_usd": 0.8,
                    "total_tokens": 800,
                    "elapsed_seconds": 80.0,
                },
            ],
        )
        metrics = compute_iteration_metrics(tmp_path / "iterations")
        m = dict(metrics)
        assert m["total_iterations"] == 3.0
        assert m["successful_iterations"] == 2.0
        assert abs(m["success_rate"] - 2 / 3) < 0.01
        assert m["total_cost_usd"] == 2.3
        assert m["total_tokens"] == 2300.0

    def test_empty_dir(self, tmp_path: Path) -> None:
        """Empty iterations directory returns no metrics."""
        (tmp_path / "iterations").mkdir()
        metrics = compute_iteration_metrics(tmp_path / "iterations")
        assert metrics == ()

    def test_missing_dir(self, tmp_path: Path) -> None:
        """Non-existent directory returns no metrics."""
        metrics = compute_iteration_metrics(tmp_path / "nonexistent")
        assert metrics == ()

    def test_malformed_json(self, tmp_path: Path) -> None:
        """Malformed JSON files are skipped gracefully."""
        iter_dir = tmp_path / "iterations"
        iter_dir.mkdir()
        (iter_dir / "0000.json").write_text("not json")
        (iter_dir / "0001.json").write_text(
            json.dumps(
                {
                    "success": True,
                    "cost_usd": 1.0,
                    "total_tokens": 100,
                    "elapsed_seconds": 10.0,
                }
            )
        )
        metrics = compute_iteration_metrics(iter_dir)
        m = dict(metrics)
        # Two files found, but only one parses.
        assert m["total_iterations"] == 2.0
        assert m["successful_iterations"] == 1.0


class TestValidate:
    """Tests for the top-level validate function."""

    def test_full_pass(self, tmp_path: Path) -> None:
        """All criteria met produces a passing result."""
        modules_dir = tmp_path / "modules"
        for step in PIPELINE_STEPS:
            _setup_module(modules_dir, step)

        conf_dir = tmp_path / "conformance"
        for test_file in CONFORMANCE_TEST_MAP.values():
            _setup_conformance(conf_dir, test_file)

        wiring_path = tmp_path / "wiring.py"
        _setup_wiring(wiring_path, list(BRIDGE_MAP.values()))

        _setup_iterations(
            tmp_path / "iterations",
            [{"success": True, "cost_usd": 1.0, "total_tokens": 1000, "elapsed_seconds": 60.0}],
        )

        result = validate(
            modules_dir=modules_dir,
            conformance_dir=conf_dir,
            wiring_path=wiring_path,
            iterations_dir=tmp_path / "iterations",
        )

        assert result.passed
        assert result.name == "self-improvement-cycle"
        assert "validated" in result.summary
        assert len(result.metrics) > 0

    def test_partial_fail(self, tmp_path: Path) -> None:
        """Missing modules produce a failing result."""
        modules_dir = tmp_path / "modules"
        _setup_module(modules_dir, "scanner")
        _setup_module(modules_dir, "executor")

        conf_dir = tmp_path / "conformance"
        conf_dir.mkdir(parents=True)
        wiring_path = tmp_path / "wiring.py"
        wiring_path.write_text("# empty")
        (tmp_path / "iterations").mkdir()

        result = validate(
            modules_dir=modules_dir,
            conformance_dir=conf_dir,
            wiring_path=wiring_path,
            iterations_dir=tmp_path / "iterations",
        )

        assert not result.passed
        assert "incomplete" in result.summary

    def test_criteria_count(self, tmp_path: Path) -> None:
        """Validate produces 4 criteria per pipeline step (24 total)."""
        modules_dir = tmp_path / "modules"
        modules_dir.mkdir()
        conf_dir = tmp_path / "conformance"
        conf_dir.mkdir(parents=True)
        wiring_path = tmp_path / "wiring.py"
        wiring_path.write_text("# empty")
        (tmp_path / "iterations").mkdir()

        result = validate(
            modules_dir=modules_dir,
            conformance_dir=conf_dir,
            wiring_path=wiring_path,
            iterations_dir=tmp_path / "iterations",
        )

        # 6 steps * 4 checks (exists, structural, conformance, wiring) = 24.
        assert len(result.criteria) == 24


@pytest.mark.integration()
class TestRealProject:
    """Integration test that validates the actual Anima project.

    Only runs when the real project structure is available.
    """

    def test_anima_self_improvement(self) -> None:
        """Anima's own codebase passes the self-improvement benchmark."""
        project_root = Path(__file__).resolve().parents[2]
        modules_dir = project_root / "modules"
        conformance_dir = project_root / "tests" / "conformance"
        wiring_path = project_root / "wiring.py"
        iterations_dir = project_root / "iterations"

        if not modules_dir.exists():
            pytest.skip("Not running from anima project root")

        result = validate(
            modules_dir=modules_dir,
            conformance_dir=conformance_dir,
            wiring_path=wiring_path,
            iterations_dir=iterations_dir,
        )

        # Report all failed criteria for debugging.
        failed = [c for c in result.criteria if not c.passed]
        fail_msg = "\n".join(f"  - {c.name}: {c.detail}" for c in failed)

        assert result.passed, f"Self-improvement benchmark failed:\n{fail_msg}"
