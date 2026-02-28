#!/usr/bin/env python3
"""
Anima CLI — Stable entry point for the Autonomous Iteration Engine.

This file is human-maintained and protected. Pipeline step dispatch
is handled by wiring.py (agent-modifiable) via kernel/loop.py.

Usage:
  anima start [--once] [--max N] [--dry-run] [--cooldown N]
  anima status
  anima reset
  anima log [--last N]
  anima instruct <message>
"""

from __future__ import annotations

import argparse
import fcntl
import logging
import os
import sys
import time
from datetime import UTC, datetime

logger = logging.getLogger("anima")

# ---------------------------------------------------------------------------
# CLI commands
# ---------------------------------------------------------------------------


def cmd_status() -> None:
    """Display current project state."""
    import wiring
    from kernel.config import VISION_FILE
    from kernel.roadmap import get_current_version, parse_roadmap_items, read_roadmap_file
    from kernel.state import load_history, load_state

    state = load_state()
    project_state = wiring.scan_project_state()
    vision = VISION_FILE.read_text()
    history = load_history()
    gaps = wiring.analyze_gaps(vision, project_state, history)

    print(f"\n{'=' * 60}")
    print("  ANIMA -- Status")
    print(f"{'=' * 60}")
    print(f"\n  Iterations: {state['iteration_count']}")
    print(f"  Status: {state['status']}")
    print(f"  Failures (consecutive): {state['consecutive_failures']}")
    print(f"  Last iteration: {state.get('last_iteration', '--')}")

    # Roadmap progress
    current_version = get_current_version()
    roadmap_content = read_roadmap_file(current_version)
    unchecked, checked = parse_roadmap_items(roadmap_content)
    total = len(unchecked) + len(checked)
    print(f"\n  Roadmap target: v{current_version}")
    print(f"  Roadmap progress: {len(checked)}/{total} items checked")

    print("\n  Architecture:")
    print(f"    domain/:          {'ok' if project_state['domain_exists'] else 'missing'}")
    print(f"    adapters/:        {'ok' if project_state['adapters_exist'] else 'not yet'}")
    print(f"    kernel/:          {'ok' if project_state['kernel_exists'] else 'not yet'}")
    print(f"    pyproject.toml:   {'ok' if project_state['has_pyproject'] else 'missing'}")
    print(f"    pyrightconfig.json: {'ok' if project_state['has_pyrightconfig'] else 'missing'}")

    print("\n  Modules:")
    if project_state["modules"]:
        for name, info in project_state["modules"].items():
            flags: list[str] = []
            for field, label in [
                ("has_contract", "contract"),
                ("has_spec", "spec"),
                ("has_core", "core"),
                ("has_tests", "tests"),
            ]:
                flags.append(f"{'ok' if info.get(field) else 'no'}-{label}")
            print(f"    {name}: {' '.join(flags)}")
    else:
        print("    (none)")

    qr = project_state.get("quality_results", {})
    if qr:
        print("\n  Quality Pipeline:")
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
        print("\n  Recent iterations:")
        for h in history[-5:]:
            ok = "ok" if h.get("success") else "fail"
            print(f"    [{ok}] {h['id']}: {h.get('summary', '--')[:60]}")

    print()


def cmd_reset() -> None:
    """Reset failure count and resume."""
    from kernel.state import load_state, save_state

    state = load_state()
    state["consecutive_failures"] = 0
    state["status"] = "sleep"
    save_state(state)
    print("State reset. Anima is ready to iterate.")


def cmd_log(args: argparse.Namespace) -> None:
    """Show iteration history."""
    from kernel.state import load_history

    history = load_history()
    if not history:
        print("No iterations yet.")
        return

    entries = history[-args.last :] if args.last else history
    for h in entries:
        ok = "ok" if h.get("success") else "FAIL"
        cost = h.get("cost_usd", 0)
        elapsed = h.get("elapsed_seconds", 0)
        summary = h.get("summary", "--")[:80]
        print(f"  [{ok}] {h['id']}  ${cost:.4f}  {elapsed:.0f}s  {summary}")


def cmd_instruct(args: argparse.Namespace) -> None:
    """Inject a human instruction into the inbox."""
    from kernel.config import INBOX_DIR

    INBOX_DIR.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    # Derive a short slug from the message
    slug = args.message[:40].lower().replace(" ", "-")
    slug = "".join(c for c in slug if c.isalnum() or c == "-").strip("-")
    filename = f"{timestamp}-{slug}.md"

    path = INBOX_DIR / filename
    content = f"# Instruction\n\n{args.message}\n"
    path.write_text(content)
    print(f"  Instruction saved to inbox/{filename}")
    print("  It will be picked up on the next iteration.")


def cmd_start(args: argparse.Namespace) -> None:
    """Run iteration loop."""
    from kernel.config import LOCK_FILE, ROADMAP_DIR, VISION_FILE

    if not VISION_FILE.exists():
        print("ERROR: VISION.md not found. Anima cannot iterate without a vision.")
        sys.exit(1)

    if not ROADMAP_DIR.exists():
        print("WARNING: roadmap/ directory not found. Roadmap tracking disabled.")

    # Acquire exclusive process lock (skip for dry-run — no side effects)
    lock_fd = None
    if not args.dry_run:
        LOCK_FILE.parent.mkdir(parents=True, exist_ok=True)
        lock_fd = open(LOCK_FILE, "w")  # noqa: SIM115
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            lock_fd.close()
            print("ERROR: Another anima process is already running.")
            print(f"  Lock file: {LOCK_FILE}")
            sys.exit(1)
        lock_fd.write(str(os.getpid()))
        lock_fd.flush()

    try:
        _run_start(args)
    finally:
        if lock_fd is not None:
            lock_fd.close()
            LOCK_FILE.unlink(missing_ok=True)


def _run_start(args: argparse.Namespace) -> None:
    """Inner start logic, wrapped by cmd_start for lock management."""
    from kernel import loop
    from kernel.config import AUTO_PUSH, INBOX_DIR, ITERATIONS_DIR, MODULES_DIR
    from kernel.git_ops import ensure_git, git
    from kernel.roadmap import update_readme
    from kernel.state import load_state, save_state

    ensure_git()

    # Refuse to start with a dirty working tree (unless dry-run)
    if not args.dry_run:
        code, porcelain = git("status", "--porcelain")
        if code != 0:
            print(f"ERROR: git status failed: {porcelain}")
            sys.exit(1)
        if porcelain.strip():
            print("ERROR: Working tree is not clean. Commit or stash your changes first.")
            print("  git status  # see what's pending")
            sys.exit(1)

    for d in [INBOX_DIR, ITERATIONS_DIR, MODULES_DIR]:
        d.mkdir(parents=True, exist_ok=True)

    state = load_state()

    if state["status"] == "paused":
        print("  Anima is paused due to consecutive failures.")
        print("  anima status    # see what happened")
        print("  anima reset     # clear and resume")
        sys.exit(1)

    # In dry-run mode, skip all git commits and state changes
    if not args.dry_run:
        # Enter alive state — commit + push so remote reflects we're awake
        state["status"] = "alive"
        save_state(state)
        update_readme(state)
        git("add", "-A")
        code, _ = git("diff", "--cached", "--quiet")
        if code != 0:
            git("commit", "-m", "chore(anima): I'm waking up")
            if AUTO_PUSH:
                git("push")

    count = 0
    if not args.once:
        logger.info("  Anima entering continuous iteration (cooldown: %ds)", args.cooldown)
        if args.max:
            logger.info("   Will stop after %d iterations", args.max)

    try:
        while True:
            state = loop.run_iteration(state, dry_run=args.dry_run)
            count += 1

            # Update README after each successful iteration
            if not args.dry_run and state.get("status") != "paused":
                update_readme(state)

            if args.once:
                break
            if args.max and count >= args.max:
                logger.info("\nReached max iterations (%d). Stopping.", args.max)
                break
            if state["status"] in ("paused", "sleep"):
                logger.info("\nAnima entered '%s' state. Stopping.", state["status"])
                break

            logger.info("\n  Cooling down %ds...", args.cooldown)
            time.sleep(args.cooldown)

    except KeyboardInterrupt:
        logger.warning("\n\nInterrupted.")

    if args.dry_run:
        return

    # Enter sleep state (unless paused by failures)
    if state["status"] != "paused":
        state["status"] = "sleep"
    save_state(state)
    update_readme(state)

    # Commit and push final status change
    status_messages = {
        "sleep": "I'm going to sleep",
        "paused": "I'm stuck, need help",
    }
    msg = status_messages.get(state["status"], state["status"])
    git("add", "-A")
    code, _ = git("diff", "--cached", "--quiet")
    if code != 0:
        git("commit", "-m", f"chore(anima): {msg}")
        if AUTO_PUSH:
            git("push")


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
    start_p.add_argument("--verbose", action="store_true", help="Enable debug logging")
    start_p.add_argument("--quiet", action="store_true", help="Only show warnings and errors")

    # anima status
    sub.add_parser("status", help="Show project state and gaps")

    # anima reset
    sub.add_parser("reset", help="Reset failure count and resume")

    # anima log
    log_p = sub.add_parser("log", help="Show iteration history")
    log_p.add_argument("--last", type=int, default=0, help="Show last N iterations (0=all)")

    # anima instruct
    instruct_p = sub.add_parser("instruct", help="Send instruction for next iteration")
    instruct_p.add_argument("message", help="The instruction text")

    args = parser.parse_args()

    # Configure logging for the start command
    if args.command == "start":
        if args.verbose:
            level = logging.DEBUG
        elif args.quiet:
            level = logging.WARNING
        else:
            level = logging.INFO
        logging.basicConfig(format="%(message)s", level=level)

    if args.command == "start":
        cmd_start(args)
    elif args.command == "status":
        cmd_status()
    elif args.command == "reset":
        cmd_reset()
    elif args.command == "log":
        cmd_log(args)
    elif args.command == "instruct":
        cmd_instruct(args)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
