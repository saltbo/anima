#!/usr/bin/env python3
"""
Anima CLI — Stable entry point for the Autonomous Iteration Engine.

This file is human-maintained and protected. It dispatches to module
implementations when available, falling back to seed functions.

Usage:
  anima start [--once] [--max N] [--dry-run] [--cooldown N]
  anima status
  anima reset
  anima cleanup-tags
"""

from __future__ import annotations

import argparse
import importlib
import sys
import time
from typing import Any


# ---------------------------------------------------------------------------
# Module dispatch
# ---------------------------------------------------------------------------


def _use_module(module_name: str, class_name: str) -> type | None:
    """Try to import a class from modules/<module_name>/core.py.

    Returns the class if found, None otherwise.
    """
    try:
        mod = importlib.import_module(f"modules.{module_name}.core")
        return getattr(mod, class_name, None)
    except (ImportError, AttributeError):
        return None


# ---------------------------------------------------------------------------
# Iteration runner (extracted from seed.py)
# ---------------------------------------------------------------------------


def run_iteration(state: dict[str, Any], dry_run: bool = False) -> dict[str, Any]:
    """Execute a single iteration cycle with module dispatch.

    Each of the 5 steps checks for a module implementation first,
    falling back to the seed function.
    """
    from kernel import seed  # local import — seed is a function library

    # Step 1: scan_project_state — no module yet, always seed
    # Step 2: analyze_gaps
    GapAnalyzer = _use_module("gap_analyzer", "GapAnalyzer")
    if GapAnalyzer:
        # Module available — agent wires this when ready
        pass

    # Step 3: plan_iteration
    Planner = _use_module("planner", "Planner")
    if Planner:
        pass

    # Step 4: execute_plan
    Executor = _use_module("executor", "Executor")
    if Executor:
        pass

    # Step 5: verify_iteration
    Verifier = _use_module("verifier", "Verifier")
    if Verifier:
        pass

    # Reporter (record_iteration)
    Reporter = _use_module("reporter", "Reporter")
    if Reporter:
        pass

    # Delegate to seed's run_iteration for now — module wiring happens
    # incrementally as part of the self-replacement roadmap
    return seed.run_iteration(state, dry_run=dry_run)


# ---------------------------------------------------------------------------
# CLI commands
# ---------------------------------------------------------------------------


def cmd_status() -> None:
    """Display current project state."""
    from kernel import seed

    state = seed.load_state()
    project_state = seed.scan_project_state()
    vision = seed.VISION_FILE.read_text()
    history = seed.load_history()
    gaps = seed.analyze_gaps(vision, project_state, history)

    print(f"\n{'='*60}")
    print(f"  ANIMA -- Status")
    print(f"{'='*60}")
    print(f"\n  Iterations: {state['iteration_count']}")
    print(f"  Status: {state['status']}")
    print(f"  Failures (consecutive): {state['consecutive_failures']}")
    print(f"  Last iteration: {state.get('last_iteration', '--')}")

    # Roadmap progress
    current_version = seed._get_current_version()
    roadmap_content = seed._read_roadmap_file(current_version)
    unchecked, checked = seed._parse_roadmap_items(roadmap_content)
    total = len(unchecked) + len(checked)
    print(f"\n  Roadmap target: v{current_version}")
    print(f"  Roadmap progress: {len(checked)}/{total} items checked")

    print(f"\n  Architecture:")
    print(f"    domain/:          {'ok' if project_state['domain_exists'] else 'missing'}")
    print(f"    adapters/:        {'ok' if project_state['adapters_exist'] else 'not yet'}")
    print(f"    kernel/:          {'ok' if project_state['kernel_exists'] else 'not yet'}")
    print(f"    pyproject.toml:   {'ok' if project_state['has_pyproject'] else 'missing'}")
    print(f"    pyrightconfig.json: {'ok' if project_state['has_pyrightconfig'] else 'missing'}")

    print(f"\n  Modules:")
    if project_state["modules"]:
        for name, info in project_state["modules"].items():
            flags = []
            for field, label in [("has_contract", "contract"), ("has_spec", "spec"),
                                 ("has_core", "core"), ("has_tests", "tests")]:
                flags.append(f"{'ok' if info.get(field) else 'no'}-{label}")
            print(f"    {name}: {' '.join(flags)}")
    else:
        print("    (none)")

    qr = project_state.get("quality_results", {})
    if qr:
        print(f"\n  Quality Pipeline:")
        for tool in ["ruff_lint", "ruff_format", "pyright"]:
            if qr.get(tool):
                print(f"    {tool}: {'ok' if qr[tool]['passed'] else 'failing'}")
            else:
                print(f"    {tool}: not installed")

    if project_state.get("test_results"):
        tr = project_state["test_results"]
        print(f"\n  Tests: {'passing' if tr['passed'] else 'failing'}")

    print(f"\n  Inbox: {len(project_state['inbox_items'])} items")
    for item in project_state["inbox_items"]:
        print(f"    - {item['filename']}")

    gap_count = 0 if gaps == "NO_GAPS" else len(gaps.splitlines())
    print(f"\n  Gaps: {gap_count if gap_count else 'none -- system at rest'}")

    if history:
        print(f"\n  Recent iterations:")
        for h in history[-5:]:
            ok = "ok" if h.get("success") else "fail"
            print(f"    [{ok}] {h['id']}: {h.get('summary', '--')[:60]}")

    print()


def cmd_reset() -> None:
    """Reset failure count and resume."""
    from kernel import seed

    state = seed.load_state()
    state["consecutive_failures"] = 0
    state["status"] = "sleep"
    seed.save_state(state)
    print("State reset. Anima is ready to iterate.")


def cmd_cleanup_tags() -> None:
    """Delete all iter-* tags from git history."""
    from kernel import seed

    _, tags_output = seed.git("tag", "-l", "iter-*")
    if not tags_output.strip():
        print("No iter-* tags found.")
        return
    tags = tags_output.strip().split("\n")
    for tag in tags:
        seed.git("tag", "-d", tag.strip())
    print(f"Deleted {len(tags)} iter-* tags.")


def cmd_start(args: argparse.Namespace) -> None:
    """Run iteration loop."""
    from kernel import seed

    if not seed.VISION_FILE.exists():
        print("ERROR: VISION.md not found. Anima cannot iterate without a vision.")
        sys.exit(1)

    if not seed.ROADMAP_DIR.exists():
        print("WARNING: roadmap/ directory not found. Roadmap tracking disabled.")

    seed.ensure_git()
    for d in [seed.INBOX_DIR, seed.ITERATIONS_DIR, seed.MODULES_DIR]:
        d.mkdir(parents=True, exist_ok=True)

    state = seed.load_state()

    if state["status"] == "paused":
        print("  Anima is paused due to consecutive failures.")
        print("  anima status    # see what happened")
        print("  anima reset     # clear and resume")
        sys.exit(1)

    # Enter alive state — commit + push so remote reflects we're awake
    state["status"] = "alive"
    seed.save_state(state)
    seed.update_readme(state)
    seed.git("add", "-A")
    code, _ = seed.git("diff", "--cached", "--quiet")
    if code != 0:
        seed.git("commit", "-m", "chore(anima): I'm waking up")
        seed.git("push")

    count = 0
    if not args.once:
        print(f"  Anima entering continuous iteration (cooldown: {args.cooldown}s)")
        if args.max:
            print(f"   Will stop after {args.max} iterations")

    try:
        while True:
            state = run_iteration(state, dry_run=args.dry_run)
            count += 1

            # Update README after each successful iteration
            if state.get("status") != "paused":
                seed.update_readme(state)

            if args.once:
                break
            if args.max and count >= args.max:
                print(f"\nReached max iterations ({args.max}). Stopping.")
                break
            if state["status"] in ("paused", "sleep"):
                print(f"\nAnima entered '{state['status']}' state. Stopping.")
                break

            print(f"\n  Cooling down {args.cooldown}s...")
            time.sleep(args.cooldown)

    except KeyboardInterrupt:
        print("\n\nInterrupted.")

    # Enter sleep state (unless paused by failures)
    if state["status"] != "paused":
        state["status"] = "sleep"
    seed.save_state(state)
    seed.update_readme(state)

    # Commit and push final status change
    status_messages = {
        "sleep": "I'm going to sleep",
        "paused": "I'm stuck, need help",
    }
    msg = status_messages.get(state["status"], state["status"])
    seed.git("add", "-A")
    code, _ = seed.git("diff", "--cached", "--quiet")
    if code != 0:
        seed.git("commit", "-m", f"chore(anima): {msg}")
        seed.git("push")


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="anima",
        description="Anima — Autonomous Iteration Engine",
    )
    sub = parser.add_subparsers(dest="command")

    # anima start
    start_p = sub.add_parser("start", help="Run iteration loop")
    start_p.add_argument("--once", action="store_true", help="Run a single iteration then sleep")
    start_p.add_argument("--max", type=int, default=0, help="Max iterations (0=unlimited)")
    start_p.add_argument("--dry-run", action="store_true", help="Preview without executing")
    start_p.add_argument(
        "--cooldown",
        type=int,
        default=10,
        help="Seconds between iterations (default: 10)",
    )

    # anima status
    sub.add_parser("status", help="Show project state and gaps")

    # anima reset
    sub.add_parser("reset", help="Reset failure count and resume")

    # anima cleanup-tags
    sub.add_parser("cleanup-tags", help="Delete all iter-* tags from git history")

    args = parser.parse_args()

    if args.command == "start":
        cmd_start(args)
    elif args.command == "status":
        cmd_status()
    elif args.command == "reset":
        cmd_reset()
    elif args.command == "cleanup-tags":
        cmd_cleanup_tags()
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
