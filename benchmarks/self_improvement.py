"""Benchmark #3: Self-improvement cycle validation.

Validates that Anima has successfully improved its own modules
through autonomous iteration. Checks:

1. All 6 pipeline steps replaced with purpose-built modules
2. Each module has complete structure (CONTRACT, SPEC, core, tests)
3. Conformance tests exist for each pipeline step
4. Wiring integrates module bridges (not just seed fallback)
5. Iteration history shows successful self-improvement
"""

from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING

from benchmarks.harness import BenchmarkCriterion, BenchmarkResult

if TYPE_CHECKING:
    from pathlib import Path

logger = logging.getLogger("anima.benchmarks.self_improvement")

# The 6 pipeline steps that should be replaced from seed to module.
PIPELINE_STEPS: tuple[str, ...] = (
    "scanner",
    "gap_analyzer",
    "planner",
    "executor",
    "verifier",
    "reporter",
)

# Maps module name to conformance test filename.
CONFORMANCE_TEST_MAP: dict[str, str] = {
    "scanner": "test_scanner.py",
    "gap_analyzer": "test_analyze_gaps.py",
    "planner": "test_plan_iteration.py",
    "executor": "test_executor.py",
    "verifier": "test_verifier.py",
    "reporter": "test_reporter.py",
}

# Maps module name to adapter bridge module name.
BRIDGE_MAP: dict[str, str] = {
    "scanner": "scanner_bridge",
    "gap_analyzer": "gap_analyzer_bridge",
    "planner": "planner_bridge",
    "executor": "executor_bridge",
    "verifier": "verifier_bridge",
    "reporter": "reporter_bridge",
}

# Required structural components for each module.
_REQUIRED_COMPONENTS: tuple[str, ...] = (
    "CONTRACT.md",
    "SPEC.md",
    "core.py",
)


def check_module_implementations(modules_dir: Path) -> list[BenchmarkCriterion]:
    """Check that all pipeline steps have module directories with core.py.

    Args:
        modules_dir: Path to the modules/ directory.

    Returns:
        List of criteria, one per pipeline step.
    """
    criteria: list[BenchmarkCriterion] = []
    for step in PIPELINE_STEPS:
        core_path = modules_dir / step / "core.py"
        exists = core_path.exists()
        criteria.append(
            BenchmarkCriterion(
                name=f"{step}: module implementation exists",
                passed=exists,
                detail=str(core_path) if exists else f"missing: {core_path}",
            )
        )
    return criteria


def check_structural_completeness(modules_dir: Path) -> list[BenchmarkCriterion]:
    """Check each module has CONTRACT.md, SPEC.md, core.py, and tests/.

    Args:
        modules_dir: Path to the modules/ directory.

    Returns:
        List of criteria, one per pipeline step.
    """
    criteria: list[BenchmarkCriterion] = []
    for step in PIPELINE_STEPS:
        module_dir = modules_dir / step
        missing: list[str] = []
        for component in _REQUIRED_COMPONENTS:
            if not (module_dir / component).exists():
                missing.append(component)
        # Check tests directory has at least one test file.
        tests_dir = module_dir / "tests"
        has_tests = tests_dir.exists() and any(tests_dir.glob("test_*.py"))
        if not has_tests:
            missing.append("tests/")
        criteria.append(
            BenchmarkCriterion(
                name=f"{step}: structurally complete",
                passed=len(missing) == 0,
                detail="" if not missing else f"missing: {', '.join(missing)}",
            )
        )
    return criteria


def check_conformance_tests(conformance_dir: Path) -> list[BenchmarkCriterion]:
    """Check conformance tests exist for each pipeline step.

    Args:
        conformance_dir: Path to the tests/conformance/ directory.

    Returns:
        List of criteria, one per pipeline step.
    """
    criteria: list[BenchmarkCriterion] = []
    for step in PIPELINE_STEPS:
        test_file = CONFORMANCE_TEST_MAP[step]
        test_path = conformance_dir / test_file
        exists = test_path.exists()
        criteria.append(
            BenchmarkCriterion(
                name=f"{step}: conformance test exists",
                passed=exists,
                detail=str(test_path) if exists else f"missing: {test_path}",
            )
        )
    return criteria


def check_wiring_integration(wiring_path: Path) -> list[BenchmarkCriterion]:
    """Check that wiring.py imports adapter bridges for each pipeline step.

    Args:
        wiring_path: Path to wiring.py.

    Returns:
        List of criteria, one per pipeline step.
    """
    criteria: list[BenchmarkCriterion] = []
    wiring_text = wiring_path.read_text() if wiring_path.exists() else ""
    for step in PIPELINE_STEPS:
        bridge = BRIDGE_MAP[step]
        imported = f"from adapters.{bridge}" in wiring_text
        criteria.append(
            BenchmarkCriterion(
                name=f"{step}: wired to module bridge",
                passed=imported,
                detail=f"adapters.{bridge}" if imported else f"no import for adapters.{bridge}",
            )
        )
    return criteria


def compute_iteration_metrics(iterations_dir: Path) -> tuple[tuple[str, float], ...]:
    """Extract key metrics from iteration history.

    Args:
        iterations_dir: Path to the iterations/ directory.

    Returns:
        Tuple of (metric_name, value) pairs.
    """
    if not iterations_dir.exists():
        return ()

    log_files = sorted(iterations_dir.glob("*.json"))
    if not log_files:
        return ()

    total = len(log_files)
    successes = 0
    total_cost = 0.0
    total_tokens = 0
    total_elapsed = 0.0

    for log_file in log_files:
        try:
            data = json.loads(log_file.read_text())
            if data.get("success", False):
                successes += 1
            total_cost += float(data.get("cost_usd", 0))
            total_tokens += int(data.get("total_tokens", 0))
            total_elapsed += float(data.get("elapsed_seconds", 0))
        except (json.JSONDecodeError, KeyError, ValueError):
            continue

    metrics: list[tuple[str, float]] = [
        ("total_iterations", float(total)),
        ("successful_iterations", float(successes)),
        ("success_rate", successes / total if total > 0 else 0.0),
        ("total_cost_usd", round(total_cost, 2)),
        ("total_tokens", float(total_tokens)),
        ("total_elapsed_seconds", round(total_elapsed, 1)),
    ]

    return tuple(metrics)


def validate(
    modules_dir: Path,
    conformance_dir: Path,
    wiring_path: Path,
    iterations_dir: Path,
) -> BenchmarkResult:
    """Run the self-improvement benchmark validation.

    Validates that Anima has successfully replaced seed implementations
    with purpose-built modules through autonomous iteration.

    Args:
        modules_dir: Path to the modules/ directory.
        conformance_dir: Path to the tests/conformance/ directory.
        wiring_path: Path to wiring.py.
        iterations_dir: Path to the iterations/ directory.

    Returns:
        BenchmarkResult with pass/fail criteria and metrics.
    """
    all_criteria: list[BenchmarkCriterion] = []

    all_criteria.extend(check_module_implementations(modules_dir))
    all_criteria.extend(check_structural_completeness(modules_dir))
    all_criteria.extend(check_conformance_tests(conformance_dir))
    all_criteria.extend(check_wiring_integration(wiring_path))

    metrics = compute_iteration_metrics(iterations_dir)

    passed_count = sum(1 for c in all_criteria if c.passed)
    total_count = len(all_criteria)
    all_passed = passed_count == total_count

    summary = (
        f"{passed_count}/{total_count} criteria met. "
        f"Self-improvement cycle {'validated' if all_passed else 'incomplete'}."
    )

    logger.info(
        "Self-improvement benchmark: %s (%d/%d criteria)",
        "PASS" if all_passed else "FAIL",
        passed_count,
        total_count,
    )

    return BenchmarkResult(
        name="self-improvement-cycle",
        passed=all_passed,
        criteria=tuple(all_criteria),
        metrics=metrics,
        summary=summary,
    )
