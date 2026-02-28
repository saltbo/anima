"""Module health scoring — structural completeness + runtime reliability.

v0.8: Initial implementation per SPEC.md.
"""

from __future__ import annotations

import logging
from typing import Any

from domain.models import HealthReport, HealthStatus, ModuleHealthScore, ModuleInfo

logger = logging.getLogger("anima.module_health")

# Weights for final score composition.
_STRUCTURAL_WEIGHT = 0.6
_RELIABILITY_WEIGHT = 0.4

# Status thresholds.
_HEALTHY_THRESHOLD = 0.7
_DEGRADED_THRESHOLD = 0.4

# Maps module directory names to pipeline step names used in health.json.
_MODULE_TO_STEP: dict[str, str] = {
    "scanner": "scan_project_state",
    "gap_analyzer": "analyze_gaps",
    "planner": "plan_iteration",
    "executor": "execute_plan",
    "verifier": "verify_iteration",
    "reporter": "record_iteration",
}

# Structural component labels for missing-component reporting.
_COMPONENTS: tuple[tuple[str, str], ...] = (
    ("has_contract", "CONTRACT.md"),
    ("has_spec", "SPEC.md"),
    ("has_core", "core.py"),
    ("has_tests", "tests"),
)


def _classify_status(score: float) -> HealthStatus:
    """Classify a numeric score into a health status."""
    if score >= _HEALTHY_THRESHOLD:
        return HealthStatus.HEALTHY
    if score >= _DEGRADED_THRESHOLD:
        return HealthStatus.DEGRADED
    return HealthStatus.CRITICAL


def _compute_structural_score(module: ModuleInfo) -> tuple[float, tuple[str, ...]]:
    """Compute structural completeness score and list missing components.

    Each of the four components (contract, spec, core, tests) is worth 0.25.

    Args:
        module: Module metadata from scanner.

    Returns:
        Tuple of (score, missing_components).
    """
    score = 0.0
    missing: list[str] = []
    for attr, label in _COMPONENTS:
        if getattr(module, attr):
            score += 0.25
        else:
            missing.append(label)
    return score, tuple(missing)


def _compute_reliability(
    module_name: str,
    module_stats: dict[str, Any],
) -> tuple[float, tuple[str, ...]]:
    """Compute runtime reliability from fallback statistics.

    Args:
        module_name: Module directory name (e.g. "scanner").
        module_stats: The ``module_stats`` dict from health.json.

    Returns:
        Tuple of (reliability_score, issues).
    """
    step_name = _MODULE_TO_STEP.get(module_name)
    if step_name is None:
        # Non-pipeline module — no fallback tracking.
        return 1.0, ()

    stats = module_stats.get(step_name)
    if stats is None:
        # No runtime data yet — assume reliable.
        return 1.0, ()

    calls = int(stats.get("calls", 0))
    fallbacks = int(stats.get("fallbacks", 0))
    total = calls + fallbacks

    if total == 0:
        return 1.0, ()

    fallback_rate = fallbacks / total
    reliability = 1.0 - fallback_rate

    issues: list[str] = []
    if fallback_rate > 0.5:
        issues.append(f"high fallback rate: {fallback_rate:.0%} ({fallbacks}/{total})")
    elif fallback_rate > 0:
        issues.append(f"fallback rate: {fallback_rate:.0%} ({fallbacks}/{total})")

    return reliability, tuple(issues)


def score_health(
    modules: tuple[ModuleInfo, ...],
    health_stats: dict[str, Any],
    timestamp: str,
) -> HealthReport:
    """Score the health of each module and produce an aggregated report.

    Combines structural completeness (60%) with runtime reliability (40%)
    into a single score per module. Classifies each module as HEALTHY,
    DEGRADED, or CRITICAL.

    Args:
        modules: Module metadata from the scanner.
        health_stats: Runtime stats from wiring's health.json.
        timestamp: ISO-8601 timestamp for the report.

    Returns:
        A HealthReport with per-module scores and an overall average.
    """
    module_stats: dict[str, Any] = health_stats.get("module_stats", {})
    scores: list[ModuleHealthScore] = []

    for module in modules:
        structural, missing = _compute_structural_score(module)
        reliability, rel_issues = _compute_reliability(module.name, module_stats)

        final_score = _STRUCTURAL_WEIGHT * structural + _RELIABILITY_WEIGHT * reliability
        status = _classify_status(final_score)

        # Compute fallback_rate for the dataclass field.
        step_name = _MODULE_TO_STEP.get(module.name)
        fallback_rate = 0.0
        if step_name and step_name in module_stats:
            s = module_stats[step_name]
            total = int(s.get("calls", 0)) + int(s.get("fallbacks", 0))
            if total > 0:
                fallback_rate = int(s.get("fallbacks", 0)) / total

        # Collect all issues.
        all_issues: list[str] = list(rel_issues)
        if missing:
            all_issues.append(f"missing: {', '.join(missing)}")

        scores.append(
            ModuleHealthScore(
                module_name=module.name,
                score=round(final_score, 3),
                status=status,
                missing_components=missing,
                fallback_rate=round(fallback_rate, 3),
                issues=tuple(all_issues),
            )
        )

    overall = sum(s.score for s in scores) / len(scores) if scores else 1.0

    report = HealthReport(
        modules=tuple(scores),
        overall_score=round(overall, 3),
        generated_at=timestamp,
    )

    logger.debug(
        "Health report: overall=%.3f, modules=%d",
        report.overall_score,
        len(report.modules),
    )

    return report
