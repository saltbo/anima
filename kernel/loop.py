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

import time
from datetime import datetime
from typing import Any

from kernel.config import MAX_CONSECUTIVE_FAILURES, VISION_FILE
from kernel.git_ops import commit_iteration, create_snapshot, rollback_to
from kernel.roadmap import tag_milestone_if_advanced
from kernel.state import load_history, save_state


def run_iteration(state: dict[str, Any], dry_run: bool = False) -> dict[str, Any]:
    """Execute a single iteration cycle.

    Pipeline steps are called through wiring.py so the agent can
    replace them with module implementations.  Infrastructure
    (git ops, state management) comes from kernel modules directly.
    """
    import wiring

    iteration_num = state["iteration_count"] + 1
    iteration_id = f"{iteration_num:04d}-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    iteration_start = time.time()

    print(f"\n{'═' * 60}")
    print(f"  🌱 ANIMA — Iteration #{iteration_num}")
    print(f"     {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'═' * 60}")

    # Step 1: Scan current state (via wiring)
    print("\n[1/5] Scanning project state...")
    project_state = wiring.scan_project_state()
    print(f"  Files: {len(project_state['files'])}")
    print(f"  Modules: {list(project_state['modules'].keys()) or '(none)'}")
    print(f"  Domain: {'✓' if project_state['domain_exists'] else '✗'}")
    print(f"  Tests: {'✓' if project_state['has_tests'] else '—'}")
    print(f"  Inbox: {len(project_state['inbox_items'])} items")

    # Step 2: Analyze gaps (via wiring)
    print("\n[2/5] Analyzing gaps...")
    vision = VISION_FILE.read_text()
    history = load_history()
    gaps = wiring.analyze_gaps(vision, project_state, history)

    if gaps == "NO_GAPS":
        print("  No gaps found. Anima is at rest. 🌿")
        state["status"] = "sleep"
        save_state(state)
        return state

    gap_lines = gaps.strip().split("\n")
    print(f"  Found {len(gap_lines)} gap entries")

    # Step 3: Plan + Snapshot (via wiring + kernel)
    print("\n[3/5] Planning iteration...")
    prompt = wiring.plan_iteration(vision, project_state, gaps, history, state["iteration_count"])
    snapshot_ref = create_snapshot(iteration_id)

    # Step 4: Execute (via wiring)
    print("\n[4/5] Executing plan...")
    exec_result = wiring.execute_plan(prompt, dry_run=dry_run)

    if dry_run:
        print("\n[dry-run] Skipping verification and commit")
        return state

    if not exec_result["success"]:
        print(f"  Agent execution failed: {exec_result.get('errors', 'unknown error')[:200]}")

    # Step 5: Verify (via wiring)
    print("\n[5/5] Verifying results...")
    verification = wiring.verify_iteration(project_state, wiring.scan_project_state())

    # Report + commit/rollback (report via wiring, git ops via kernel)
    elapsed = time.time() - iteration_start
    report = wiring.record_iteration(iteration_id, gaps, exec_result, verification, elapsed)

    # Accumulate totals in state
    state["total_cost_usd"] = state.get("total_cost_usd", 0) + report.get("cost_usd", 0)
    state["total_tokens"] = state.get("total_tokens", 0) + report.get("total_tokens", 0)
    state["total_elapsed_seconds"] = state.get("total_elapsed_seconds", 0) + elapsed

    if verification["passed"]:
        commit_iteration(iteration_id, report["summary"])
        state["consecutive_failures"] = 0
        state["completed_items"].extend(verification.get("improvements", []))
        tag_milestone_if_advanced(state)
    else:
        print(f"\n[rollback] Rolling back to {snapshot_ref[:12]}")
        rollback_to(snapshot_ref)
        state["consecutive_failures"] += 1

        if state["consecutive_failures"] >= MAX_CONSECUTIVE_FAILURES:
            print(f"\n⚠️  {MAX_CONSECUTIVE_FAILURES} consecutive failures. Pausing.")
            print("  Review iteration logs, then:")
            print("    anima status      # see what went wrong")
            print("    anima reset       # clear failures and resume")
            state["status"] = "paused"

    state["iteration_count"] = iteration_num
    state["last_iteration"] = report["id"]
    save_state(state)
    return state
