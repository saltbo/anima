"""
wiring.py — Agent-modifiable step registry with graceful degradation.

Maps each pipeline step to its module implementation. If a module
import or execution fails, transparently falls back to the corresponding
seed function and logs the fallback event.

Health data is persisted to .anima/health.json for monitoring.

Quota-aware execution: when the executor reports quota exhaustion or
rate limiting, the wiring layer sleeps and retries automatically,
providing transparent auto-sleep/resume behaviour without kernel changes.

Protected files (kernel/, VISION.md) cannot be modified by the agent.
This file CAN and SHOULD be modified by the agent as part of the
self-replacement protocol.
"""

from __future__ import annotations

import json
import logging
import time
from collections.abc import Callable
from typing import Any

from kernel import seed
from kernel.config import ROOT

logger = logging.getLogger("anima.wiring")

_HEALTH_FILE = ROOT / ".anima" / "health.json"

# ---------------------------------------------------------------------------
# Quota-aware execution settings
# ---------------------------------------------------------------------------

# Default sleep durations when the executor reports quota issues (seconds).
QUOTA_SLEEP_RATE_LIMITED = 60.0
QUOTA_SLEEP_EXHAUSTED = 300.0
# Maximum sleep duration to prevent indefinite blocking.
QUOTA_SLEEP_MAX = 600.0


# ---------------------------------------------------------------------------
# Health tracking (best-effort persistence)
# ---------------------------------------------------------------------------


def _record_fallback(step: str, error: str, error_type: str) -> None:
    """Record a fallback event to the health file.

    Best-effort: silently ignores any I/O failures so that health
    tracking never breaks the pipeline.

    Args:
        step: Pipeline step name (e.g. 'scan_project_state').
        error: Error message from the failed module.
        error_type: Either 'import' or 'runtime'.
    """
    try:
        _HEALTH_FILE.parent.mkdir(parents=True, exist_ok=True)
        health: dict[str, Any] = {}
        if _HEALTH_FILE.exists():
            health = json.loads(_HEALTH_FILE.read_text())
        events: list[dict[str, Any]] = health.get("fallback_events", [])
        events.append(
            {
                "step": step,
                "error": error,
                "error_type": error_type,
                "timestamp": time.time(),
            }
        )
        health["fallback_events"] = events[-100:]
        stats: dict[str, Any] = health.get("module_stats", {})
        step_stats: dict[str, int] = stats.get(step, {"calls": 0, "fallbacks": 0})
        step_stats["fallbacks"] = step_stats.get("fallbacks", 0) + 1
        stats[step] = step_stats
        health["module_stats"] = stats
        _HEALTH_FILE.write_text(json.dumps(health, indent=2))
    except Exception:
        pass


def get_health_stats() -> dict[str, Any]:
    """Return current health monitoring data.

    Returns:
        Dict with 'fallback_events' and 'module_stats' keys,
        or empty dict if no health data exists.
    """
    try:
        if _HEALTH_FILE.exists():
            data: dict[str, Any] = json.loads(_HEALTH_FILE.read_text())
            return data
    except Exception:
        pass
    return {}


# ---------------------------------------------------------------------------
# Module imports — fallback to None if module can't be loaded
# ---------------------------------------------------------------------------

_ScanFn = Callable[[], dict[str, Any]]
_AnalyzeFn = Callable[[str, dict[str, Any], list[dict[str, Any]]], str]
_PlanFn = Callable[[dict[str, Any], str, list[dict[str, Any]], int], str]
_ExecuteFn = Callable[..., dict[str, Any]]
_VerifyFn = Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]]
_RecordFn = Callable[..., dict[str, Any]]

_scan_fn: _ScanFn | None = None
try:
    from adapters.scanner_bridge import scan_project_state as _scan_fn
except Exception as _exc:
    logger.warning("[fallback] scanner import failed (%s), will use seed", _exc)
    _record_fallback("scan_project_state", str(_exc), "import")

_analyze_fn: _AnalyzeFn | None = None
try:
    from adapters.gap_analyzer_bridge import analyze_gaps as _analyze_fn
except Exception as _exc:
    logger.warning("[fallback] gap_analyzer import failed (%s), will use seed", _exc)
    _record_fallback("analyze_gaps", str(_exc), "import")

_plan_fn: _PlanFn | None = None
try:
    from adapters.planner_bridge import plan_iteration as _plan_fn
except Exception as _exc:
    logger.warning("[fallback] planner import failed (%s), will use seed", _exc)
    _record_fallback("plan_iteration", str(_exc), "import")

_execute_fn: _ExecuteFn | None = None
try:
    from adapters.executor_bridge import execute_plan as _execute_fn
except Exception as _exc:
    logger.warning("[fallback] executor import failed (%s), will use seed", _exc)
    _record_fallback("execute_plan", str(_exc), "import")

_verify_fn: _VerifyFn | None = None
try:
    from adapters.verifier_bridge import verify_iteration as _verify_fn
except Exception as _exc:
    logger.warning("[fallback] verifier import failed (%s), will use seed", _exc)
    _record_fallback("verify_iteration", str(_exc), "import")

_record_fn: _RecordFn | None = None
try:
    from adapters.reporter_bridge import record_iteration as _record_fn
except Exception as _exc:
    logger.warning("[fallback] reporter import failed (%s), will use seed", _exc)
    _record_fallback("record_iteration", str(_exc), "import")


# ---------------------------------------------------------------------------
# Replaceable pipeline steps with graceful degradation
# ---------------------------------------------------------------------------


def scan_project_state() -> dict[str, Any]:
    """Scan project state — module with seed fallback."""
    if _scan_fn is not None:
        try:
            return _scan_fn()
        except Exception as exc:
            logger.warning(
                "[fallback] scanner execution failed (%s: %s), using seed",
                type(exc).__name__,
                exc,
            )
            _record_fallback("scan_project_state", str(exc), "runtime")
    return seed.scan_project_state()


def analyze_gaps(
    vision: str,
    project_state: dict[str, Any],
    history: list[dict[str, Any]],
) -> str:
    """Analyze gaps — module with seed fallback."""
    if _analyze_fn is not None:
        try:
            return _analyze_fn(vision, project_state, history)
        except Exception as exc:
            logger.warning(
                "[fallback] gap_analyzer execution failed (%s: %s), using seed",
                type(exc).__name__,
                exc,
            )
            _record_fallback("analyze_gaps", str(exc), "runtime")
    return seed.analyze_gaps(vision, project_state, history)


def plan_iteration(
    project_state: dict[str, Any],
    gaps: str,
    history: list[dict[str, Any]],
    iteration_count: int,
) -> str:
    """Plan iteration — module with seed fallback."""
    if _plan_fn is not None:
        try:
            return _plan_fn(project_state, gaps, history, iteration_count)
        except Exception as exc:
            logger.warning(
                "[fallback] planner execution failed (%s: %s), using seed",
                type(exc).__name__,
                exc,
            )
            _record_fallback("plan_iteration", str(exc), "runtime")
    return seed.plan_iteration(project_state, gaps, history, iteration_count)


def _get_quota_sleep_seconds(result: dict[str, Any]) -> float | None:
    """Return seconds to sleep if the result indicates a quota issue, else None.

    Inspects the ``quota_state`` dict inside an execution result. Returns
    the appropriate sleep duration for rate-limiting or quota exhaustion,
    capped at ``QUOTA_SLEEP_MAX``. Returns ``None`` when quota is OK or
    when there is no quota signal.
    """
    quota_state = result.get("quota_state")
    if quota_state is None:
        return None

    status = quota_state.get("status")
    if status is None:
        # Handle QuotaStatus enum values as well as plain strings.
        return None

    # Normalise: accept both enum objects and their string values.
    status_str = status.value if hasattr(status, "value") else str(status)

    if status_str == "quota_exhausted":
        retry = quota_state.get("retry_after_seconds")
        sleep_secs = float(retry) if retry is not None else QUOTA_SLEEP_EXHAUSTED
        return min(sleep_secs, QUOTA_SLEEP_MAX)

    if status_str == "rate_limited":
        retry = quota_state.get("retry_after_seconds")
        sleep_secs = float(retry) if retry is not None else QUOTA_SLEEP_RATE_LIMITED
        return min(sleep_secs, QUOTA_SLEEP_MAX)

    return None


def _execute_with_fallback(prompt: str, dry_run: bool) -> dict[str, Any]:
    """Run the executor module or fall back to seed on failure."""
    if _execute_fn is not None:
        try:
            return _execute_fn(prompt, dry_run=dry_run)
        except Exception as exc:
            logger.warning(
                "[fallback] executor execution failed (%s: %s), using seed",
                type(exc).__name__,
                exc,
            )
            _record_fallback("execute_plan", str(exc), "runtime")
    return seed.execute_plan(prompt, dry_run=dry_run)


def execute_plan(prompt: str, dry_run: bool = False) -> dict[str, Any]:
    """Execute plan — module with seed fallback and quota-aware retry.

    After the first execution attempt, if the result contains a quota
    signal (rate-limited or quota-exhausted), the wiring layer sleeps
    for the appropriate duration and retries once.  This provides
    transparent auto-sleep on quota exhaustion and auto-resume when the
    quota recovers, without requiring kernel changes.
    """
    result = _execute_with_fallback(prompt, dry_run)

    sleep_secs = _get_quota_sleep_seconds(result)
    if sleep_secs is None:
        return result

    # First attempt hit a quota wall — sleep and retry once.
    logger.warning(
        "[quota] Quota issue detected (status=%s). Sleeping %.0fs before retry...",
        result.get("quota_state", {}).get("status", "unknown"),
        sleep_secs,
    )
    time.sleep(sleep_secs)

    logger.info("[quota] Retrying execution after quota sleep...")
    retry_result = _execute_with_fallback(prompt, dry_run)

    retry_sleep = _get_quota_sleep_seconds(retry_result)
    if retry_sleep is not None:
        logger.warning(
            "[quota] Retry also hit quota wall (status=%s). Returning failed result to kernel.",
            retry_result.get("quota_state", {}).get("status", "unknown"),
        )
    return retry_result


def verify_iteration(
    pre_state: dict[str, Any],
    post_state: dict[str, Any],
) -> dict[str, Any]:
    """Verify iteration — module with seed fallback."""
    if _verify_fn is not None:
        try:
            return _verify_fn(pre_state, post_state)
        except Exception as exc:
            logger.warning(
                "[fallback] verifier execution failed (%s: %s), using seed",
                type(exc).__name__,
                exc,
            )
            _record_fallback("verify_iteration", str(exc), "runtime")
    return seed.verify_iteration(pre_state, post_state)


def record_iteration(
    iteration_id: str,
    gaps: str,
    execution_result: dict[str, Any],
    verification: dict[str, Any],
    elapsed: float,
) -> dict[str, Any]:
    """Record iteration — module with seed fallback."""
    if _record_fn is not None:
        try:
            return _record_fn(iteration_id, gaps, execution_result, verification, elapsed)
        except Exception as exc:
            logger.warning(
                "[fallback] reporter execution failed (%s: %s), using seed",
                type(exc).__name__,
                exc,
            )
            _record_fallback("record_iteration", str(exc), "runtime")
    return seed.record_iteration(iteration_id, gaps, execution_result, verification, elapsed)


# ---------------------------------------------------------------------------
# Replaceable CLI command implementations
# ---------------------------------------------------------------------------

init_project = seed.init_project
approve_iteration = seed.approve_iteration
