"""
kernel/loop.py — Fixed iteration loop.

This is the immutable backbone of Anima's iteration cycle. It calls:
- Replaceable pipeline steps through wiring.py (agent-modifiable)
- Infrastructure from kernel modules (config, git_ops, state, roadmap)

The 6 replaceable steps (via wiring):
  scan_project_state, analyze_gaps, plan_iteration,
  execute_plan, verify_iteration, record_iteration

Non-replaceable kernel concerns (from kernel modules):
  create_snapshot, commit_iteration, rollback_to,
  tag_milestone_if_advanced, save_state, load_history
"""

from __future__ import annotations

import logging
import sys
import time
from datetime import UTC, datetime
from typing import Any

from kernel.config import MAX_CONSECUTIVE_FAILURES, VISION_FILE
from kernel.console import console
from kernel.git_ops import commit_iteration, create_snapshot, rollback_to
from kernel.roadmap import tag_milestone_if_advanced
from kernel.state import load_history, save_state

logger = logging.getLogger("anima")


def _invalidate_modules() -> None:
    """Clear non-kernel modules from sys.modules so code changes take effect."""
    for key in list(sys.modules.keys()):
        if key == "wiring" or key.startswith(("adapters", "modules", "domain")):
            del sys.modules[key]


def run_iteration(state: dict[str, Any], dry_run: bool = False) -> dict[str, Any]:
    """Execute a single iteration cycle.

    Pipeline steps are called through wiring.py so the agent can
    replace them with module implementations.  Infrastructure
    (git ops, state management) comes from kernel modules directly.
    """
    # Reload non-kernel modules so code changes from previous iterations
    # take effect. If the last iteration committed broken code, rollback
    # and count it as a failure.
    _invalidate_modules()
    try:
        import wiring
    except Exception as exc:
        logger.error("Failed to load updated modules: %s", exc)
        console.warning("Reverting last iteration's code changes (HEAD~1)")
        rollback_to("HEAD~1")
        _invalidate_modules()
        try:
            import wiring  # noqa: F811
        except Exception as exc2:
            logger.error("Cannot recover after rollback: %s", exc2)
            state["consecutive_failures"] += 1
            state["status"] = "paused"
            save_state(state)
            return state
        state["consecutive_failures"] += 1
        if state["consecutive_failures"] >= MAX_CONSECUTIVE_FAILURES:
            state["status"] = "paused"
        save_state(state)
        return state

    iteration_num = state["iteration_count"] + 1
    iteration_id = f"{iteration_num:04d}-{datetime.now(UTC).strftime('%Y%m%d-%H%M%S')}"
    iteration_start = time.time()

    console.iteration_header(iteration_num, datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S"))
    logger.debug("Starting iteration %d", iteration_num)

    # Step 1: Scan current state (via wiring)
    console.step(1, 6, "Scanning project state...")
    project_state = wiring.scan_project_state()
    logger.debug("  Files: %d", len(project_state["files"]))
    logger.debug("  Modules: %s", list(project_state["modules"].keys()) or "(none)")
    logger.debug("  Domain: %s", "✓" if project_state["domain_exists"] else "✗")
    logger.debug("  Tests: %s", "✓" if project_state["has_tests"] else "—")
    logger.debug("  Inbox: %d items", len(project_state["inbox_items"]))

    # Step 2: Analyze gaps (via wiring)
    console.step(2, 6, "Analyzing gaps...")
    vision = VISION_FILE.read_text()
    history = load_history()
    gaps = wiring.analyze_gaps(vision, project_state, history)

    if gaps == "NO_GAPS":
        console.success("No gaps found. Anima is at rest. \U0001f33f")
        state["status"] = "sleep"
        save_state(state)
        return state

    gap_lines = gaps.strip().split("\n")
    console.step_detail(f"Found {len(gap_lines)} gap entries")

    # Step 3: Plan (via wiring) + Snapshot (kernel)
    console.step(3, 6, "Planning iteration...")
    prompt = wiring.plan_iteration(project_state, gaps, history, state["iteration_count"])
    snapshot_ref = create_snapshot(iteration_id) if not dry_run else ""

    # Step 4: Execute (via wiring)
    console.step(4, 6, "Executing plan...")
    exec_result = wiring.execute_plan(prompt, dry_run=dry_run)

    if dry_run:
        console.info("[dry-run] Skipping verification and commit")
        return state

    if not exec_result["success"]:
        console.error(
            f"Agent execution failed: {exec_result.get('errors', 'unknown error')[:200]}"
        )
        logger.error(
            "Agent execution failed: %s", exec_result.get("errors", "unknown error")[:200]
        )

    # Step 5: Verify (via wiring)
    console.step(5, 6, "Verifying results...")
    try:
        verification = wiring.verify_iteration(project_state, wiring.scan_project_state())
    except Exception as exc:
        console.error(f"Verification failed: {exc}")
        console.warning(f"Rolling back to {snapshot_ref[:12]}")
        logger.error("Verification failed: %s", exc)
        rollback_to(snapshot_ref)
        state["consecutive_failures"] += 1
        if state["consecutive_failures"] >= MAX_CONSECUTIVE_FAILURES:
            state["status"] = "paused"
        state["iteration_count"] = iteration_num
        save_state(state)
        return state

    # Step 6: Record + commit/rollback (report via wiring, git ops via kernel)
    elapsed = time.time() - iteration_start
    try:
        report = wiring.record_iteration(iteration_id, gaps, exec_result, verification, elapsed)
    except Exception as exc:
        console.error(f"Recording failed: {exc} (iteration work preserved)")
        logger.error("Recording failed: %s (iteration work preserved)", exc)
        report = {
            "id": iteration_id,
            "summary": f"recording failed: {exc}",
            "cost_usd": exec_result.get("cost_usd", 0),
            "total_tokens": exec_result.get("total_tokens", 0),
        }

    # Accumulate totals in state
    state["total_cost_usd"] += report.get("cost_usd", 0)
    state["total_tokens"] += report.get("total_tokens", 0)
    state["total_elapsed_seconds"] += elapsed

    if verification["passed"]:
        commit_iteration(iteration_id, report["summary"])
        state["consecutive_failures"] = 0
        # Keep completed_items bounded to last 200 entries
        state["completed_items"].extend(verification.get("improvements", []))
        state["completed_items"] = state["completed_items"][-200:]
        tag_milestone_if_advanced(state)
    else:
        console.warning(f"Rolling back to {snapshot_ref[:12]}")
        logger.warning("Rolling back to %s", snapshot_ref[:12])
        rollback_to(snapshot_ref)
        state["consecutive_failures"] += 1

        if state["consecutive_failures"] >= MAX_CONSECUTIVE_FAILURES:
            console.warning(f"{MAX_CONSECUTIVE_FAILURES} consecutive failures. Pausing.")
            console.info("  Review iteration logs, then:")
            console.info("    anima status      # see what went wrong")
            console.info("    anima reset       # clear failures and resume")
            logger.warning("%d consecutive failures. Pausing.", MAX_CONSECUTIVE_FAILURES)
            state["status"] = "paused"

    state["iteration_count"] = iteration_num
    state["last_iteration"] = report["id"]
    save_state(state)
    return state
