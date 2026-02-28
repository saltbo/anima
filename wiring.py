"""
wiring.py — Agent-modifiable step registry with graceful degradation.

Maps each pipeline step to its module implementation. If a module
import or execution fails, transparently falls back to the corresponding
seed function and logs the fallback event.

Health data is persisted to .anima/health.json for monitoring.

Quota-aware execution: when the executor reports quota exhaustion or
rate limiting, the wiring layer sleeps and retries automatically,
providing transparent auto-sleep/resume behaviour without kernel changes.

Gate mechanism: high-risk plans are detected before execution and
pause for human approval via ``anima approve``.  The gate operates
entirely within wiring.py — no kernel changes required.

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
_ANIMA_DIR = ROOT / ".anima"

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

# Gate module — risk classification and gate state management.
# Falls back to no-gating if the module can't be loaded.
# Stubs are defined first so pyright always sees the names as bound.
_gate_module_available = False


def _classify_risk_stub(_prompt: str) -> Any:
    """Stub — never called when _gate_module_available is False."""
    return None  # pragma: no cover


def _is_gate_pending_stub(_d: Any) -> bool:
    """Stub — always returns False."""
    return False  # pragma: no cover


def _read_gate_stub(_d: Any) -> dict[str, Any]:
    """Stub — returns empty dict."""
    return {}  # pragma: no cover


def _write_gate_stub(_d: Any, _s: str, _i: tuple[str, ...]) -> None:
    """Stub — no-op."""


def _clear_gate_stub(_d: Any) -> None:
    """Stub — no-op."""


def _consume_bypass_stub(_d: Any) -> bool:
    """Stub — always returns False."""
    return False  # pragma: no cover


_classify_risk = _classify_risk_stub
_is_gate_pending = _is_gate_pending_stub
_read_gate = _read_gate_stub
_write_gate = _write_gate_stub
_clear_gate = _clear_gate_stub
_consume_bypass = _consume_bypass_stub

try:
    from modules.gate.core import classify_risk as _classify_risk
    from modules.gate.core import clear_gate as _clear_gate
    from modules.gate.core import consume_bypass as _consume_bypass
    from modules.gate.core import is_gate_pending as _is_gate_pending
    from modules.gate.core import read_gate as _read_gate
    from modules.gate.core import write_gate as _write_gate

    _gate_module_available = True
except Exception as _exc:
    logger.warning("[fallback] gate module import failed (%s), gating disabled", _exc)
    _record_fallback("gate", str(_exc), "import")

# Stores the latest execution result so verification can account for
# agent execution failure even when file-level checks pass.
_last_execution_result: dict[str, Any] | None = None


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
    """Analyze gaps — module with seed fallback.

    If a gate is pending (high-risk plan awaiting human approval),
    returns ``"NO_GAPS"`` to put the loop to sleep until approved.
    """
    # Gate check: if a gate is pending, sleep until approved.
    if _gate_module_available and _is_gate_pending(_ANIMA_DIR):
        gate_data = _read_gate(_ANIMA_DIR)
        from kernel.console import console

        console.warning("HIGH-RISK CHANGE awaiting human approval.")
        console.info(f"  Risk: {gate_data.get('risk_indicators', '')}")
        console.info("  Run: anima approve <iteration-id>")
        logger.info("[gate] Pending gate detected — returning NO_GAPS to sleep")
        return "NO_GAPS"

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
    the appropriate sleep duration for rate-limiting or quota exhaustion.
    Rate-limited sleeps are capped at ``QUOTA_SLEEP_MAX``.
    Quota-exhausted sleeps use precise ``retry_after_seconds`` when present,
    otherwise fall back to ``QUOTA_SLEEP_EXHAUSTED``. Returns ``None`` when
    quota is OK or when there is no quota signal.
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
        if retry is not None:
            # For exhausted quota, honour exact reset timing if known.
            return max(0.0, float(retry))
        return QUOTA_SLEEP_EXHAUSTED

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
    """Execute plan — module with seed fallback, gate check, and quota-aware retry.

    Before execution, classifies the plan's risk level. If high-risk
    and not bypassed, writes a gate file and returns a synthetic gated
    result (no agent execution). The next iteration's ``analyze_gaps``
    will detect the pending gate and put the system to sleep.

    After the first execution attempt, if the result contains a quota
    signal (rate-limited or quota-exhausted), the wiring layer sleeps
    for the appropriate duration and retries once.
    """
    global _last_execution_result

    # Gate mechanism: classify risk and potentially gate before execution.
    if _gate_module_available and not dry_run:
        # Check if a previous gate was approved (one-time bypass).
        if _consume_bypass(_ANIMA_DIR):
            logger.info("[gate] Bypass consumed — proceeding without risk check")
        else:
            decision = _classify_risk(prompt)
            if decision.gated:
                from kernel.console import console

                # Extract a short summary from the prompt (first 200 chars).
                summary = prompt[:200].replace("\n", " ").strip()
                _write_gate(_ANIMA_DIR, summary, decision.indicators)

                console.warning("HIGH-RISK CHANGE DETECTED — pausing for human approval.")
                console.info(f"  Risk indicators: {', '.join(decision.indicators)}")
                console.info("  Run: anima approve <iteration-id>")

                gated_result: dict[str, Any] = {
                    "success": True,
                    "output": "GATED: awaiting human approval",
                    "errors": "",
                    "exit_code": 0,
                    "elapsed_seconds": 0.0,
                    "cost_usd": 0.0,
                    "total_tokens": 0,
                    "dry_run": True,
                }
                _last_execution_result = gated_result
                return gated_result

    result = _execute_with_fallback(prompt, dry_run)

    sleep_secs = _get_quota_sleep_seconds(result)
    if sleep_secs is None:
        _last_execution_result = result
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
    _last_execution_result = retry_result
    return retry_result


def verify_iteration(
    pre_state: dict[str, Any],
    post_state: dict[str, Any],
) -> dict[str, Any]:
    """Verify iteration — module with seed fallback."""
    global _last_execution_result

    if _verify_fn is not None:
        try:
            verification = _verify_fn(pre_state, post_state)
        except Exception as exc:
            logger.warning(
                "[fallback] verifier execution failed (%s: %s), using seed",
                type(exc).__name__,
                exc,
            )
            _record_fallback("verify_iteration", str(exc), "runtime")
            verification = seed.verify_iteration(pre_state, post_state)
    else:
        verification = seed.verify_iteration(pre_state, post_state)

    exec_result = _last_execution_result
    if exec_result is not None and not exec_result.get("success", True):
        issue = "EXECUTION: agent execution failed" + (
            f" (exit {exec_result.get('exit_code')})" if "exit_code" in exec_result else ""
        )
        errors = str(exec_result.get("errors", "")).strip()
        if errors:
            issue = f"{issue}\n{errors[:300]}"
        if issue not in verification.get("issues", []):
            verification["issues"] = [*verification.get("issues", []), issue]
        verification["passed"] = False

    return verification


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


def approve_iteration(iteration_id: str) -> None:
    """Approve a gated iteration, allowing execution to proceed.

    Clears the gate-pending file and writes a one-time bypass marker
    so the next iteration skips risk classification and executes normally.

    Args:
        iteration_id: The iteration ID to approve (for logging).
    """
    from kernel.console import console

    if not _gate_module_available:
        console.info("Gate module not available. Nothing to approve.")
        return

    if not _is_gate_pending(_ANIMA_DIR):
        console.info("No pending gate. Nothing to approve.")
        return

    gate_data = _read_gate(_ANIMA_DIR)
    _clear_gate(_ANIMA_DIR)

    console.success(f"Gate approved for iteration {iteration_id}.")
    console.info("  Anima will proceed on the next iteration.")
    logger.info(
        "[gate] Iteration %s approved. Gate data: %s",
        iteration_id,
        gate_data.get("risk_indicators", []),
    )
