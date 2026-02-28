#!/usr/bin/env python3
"""
Anima CLI -- Stable entry point for the Autonomous Iteration Engine.

This file is human-maintained and protected. Pipeline step dispatch
is handled by wiring.py (agent-modifiable) via kernel/loop.py.

Usage:
  anima start [--once] [--max N] [--dry-run] [--cooldown N]
  anima status
  anima reset
  anima log [--last N]
  anima instruct <message>
  anima init [--template NAME]
  anima approve <iteration-id>
"""

from __future__ import annotations

import argparse
import fcntl
import logging
import os
import sys
import time
from datetime import UTC, datetime

from kernel.console import configure, console

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

    # Roadmap progress
    current_version = get_current_version()
    roadmap_content = read_roadmap_file(current_version)
    unchecked, checked = parse_roadmap_items(roadmap_content)
    total = len(unchecked) + len(checked)

    console.panel("ANIMA -- Status", title="Anima", style="green")

    console.kv(
        {
            "Iterations": str(state["iteration_count"]),
            "Status": state["status"],
            "Failures (consecutive)": str(state["consecutive_failures"]),
            "Last iteration": state.get("last_iteration", "--") or "--",
            "Roadmap target": f"v{current_version}",
            "Roadmap progress": f"{len(checked)}/{total} items checked",
        },
        title="Overview",
    )

    console.table(
        ["Layer", "Status"],
        [
            ["domain/", "ok" if project_state["domain_exists"] else "missing"],
            ["adapters/", "ok" if project_state["adapters_exist"] else "not yet"],
            ["kernel/", "ok" if project_state["kernel_exists"] else "not yet"],
            ["pyproject.toml", "ok" if project_state["has_pyproject"] else "missing"],
            ["pyrightconfig.json", "ok" if project_state["has_pyrightconfig"] else "missing"],
        ],
        title="Architecture",
    )

    if project_state["modules"]:
        module_rows: list[list[str]] = []
        for name, info in project_state["modules"].items():
            flags: list[str] = []
            for field, label in [
                ("has_contract", "contract"),
                ("has_spec", "spec"),
                ("has_core", "core"),
                ("has_tests", "tests"),
            ]:
                flags.append(f"{'ok' if info.get(field) else 'no'}-{label}")
            module_rows.append([name, " ".join(flags)])
        console.table(["Module", "Components"], module_rows, title="Modules")
    else:
        console.info("Modules: (none)")

    qr = project_state.get("quality_results", {})
    if qr:
        quality_rows: list[list[str]] = []
        for tool in ["ruff_lint", "ruff_format", "pyright"]:
            if qr.get(tool):
                quality_rows.append([tool, "ok" if qr[tool]["passed"] else "failing"])
            else:
                quality_rows.append([tool, "not installed"])
        console.table(["Tool", "Status"], quality_rows, title="Quality Pipeline")

    if project_state.get("test_results"):
        tr = project_state["test_results"]
        console.info(f"Tests: {'passing' if tr['passed'] else 'failing'}")

    console.info(f"Inbox: {len(project_state['inbox_items'])} items")
    for item in project_state["inbox_items"]:
        console.step_detail(f"- {item['filename']}")

    gap_count = 0 if gaps == "NO_GAPS" else len(gaps.splitlines())
    console.info(f"Gaps: {gap_count if gap_count else 'none -- system at rest'}")

    if history:
        history_rows: list[list[str]] = []
        for h in history[-5:]:
            ok = "ok" if h.get("success") else "fail"
            history_rows.append([ok, h["id"], h.get("summary", "--")[:60]])
        console.table(["Status", "ID", "Summary"], history_rows, title="Recent Iterations")


def cmd_reset() -> None:
    """Reset failure count and resume."""
    from kernel.state import load_state, save_state

    state = load_state()
    state["consecutive_failures"] = 0
    state["status"] = "sleep"
    save_state(state)
    console.success("State reset. Anima is ready to iterate.")


def cmd_log(args: argparse.Namespace) -> None:
    """Show iteration history."""
    from kernel.state import load_history

    history = load_history()
    if not history:
        console.info("No iterations yet.")
        return

    entries = history[-args.last :] if args.last else history
    rows: list[list[str]] = []
    for h in entries:
        ok = "ok" if h.get("success") else "FAIL"
        cost = h.get("cost_usd", 0)
        elapsed = h.get("elapsed_seconds", 0)
        summary = h.get("summary", "--")[:80]
        rows.append([ok, h["id"], f"${cost:.4f}", f"{elapsed:.0f}s", summary])

    console.table(["Status", "ID", "Cost", "Time", "Summary"], rows)


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
    console.success(f"Instruction saved to inbox/{filename}")
    console.info("It will be picked up on the next iteration.")


def cmd_init(args: argparse.Namespace) -> None:
    """Initialize Anima in an existing project."""
    import wiring

    wiring.init_project(template=args.template)


def cmd_approve(args: argparse.Namespace) -> None:
    """Approve a gated iteration."""
    import wiring

    wiring.approve_iteration(iteration_id=args.iteration_id)


def cmd_start(args: argparse.Namespace) -> None:
    """Run iteration loop."""
    from kernel.config import LOCK_FILE, ROADMAP_DIR, VISION_FILE

    if not VISION_FILE.exists():
        console.error("VISION.md not found. Anima cannot iterate without a vision.")
        sys.exit(1)

    if not ROADMAP_DIR.exists():
        console.warning("roadmap/ directory not found. Roadmap tracking disabled.")

    # Acquire exclusive process lock (skip for dry-run -- no side effects)
    lock_fd = None
    if not args.dry_run:
        LOCK_FILE.parent.mkdir(parents=True, exist_ok=True)
        lock_fd = open(LOCK_FILE, "w")  # noqa: SIM115
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            lock_fd.close()
            console.error("Another anima process is already running.")
            console.info(f"Lock file: {LOCK_FILE}")
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
            console.error(f"git status failed: {porcelain}")
            sys.exit(1)
        if porcelain.strip():
            console.error("Working tree is not clean. Commit or stash your changes first.")
            console.info("git status  # see what's pending")
            sys.exit(1)

    for d in [INBOX_DIR, ITERATIONS_DIR, MODULES_DIR]:
        d.mkdir(parents=True, exist_ok=True)

    state = load_state()

    if state["status"] == "paused":
        console.warning("Anima is paused due to consecutive failures.")
        console.info("anima status    # see what happened")
        console.info("anima reset     # clear and resume")
        sys.exit(1)

    # In dry-run mode, skip all git commits and state changes
    if not args.dry_run:
        # Enter alive state -- commit + push so remote reflects we're awake
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
        console.info(f"Anima entering continuous iteration (cooldown: {args.cooldown}s)")
        if args.max:
            console.info(f"Will stop after {args.max} iterations")

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
                console.info(f"Reached max iterations ({args.max}). Stopping.")
                break
            if state["status"] in ("paused", "sleep"):
                console.info(f"Anima entered '{state['status']}' state. Stopping.")
                break

            _interactive_cooldown(args.cooldown, state)

    except KeyboardInterrupt:
        console.warning("Interrupted.")

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
# Interactive cooldown
# ---------------------------------------------------------------------------


def _interactive_cooldown(cooldown: int, state: dict[str, object]) -> None:
    """Replace sleep with an interactive prompt during cooldown."""
    deadline = time.monotonic() + cooldown
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        user_input = console.prompt("Annie", timeout=remaining)
        if user_input is None:
            break  # timeout — start next iteration
        text = user_input.strip()
        if not text:
            continue
        if text.startswith("/"):
            _handle_prompt_command(text, state)
        else:
            _create_inbox_item(text)
            console.success("Sent to inbox")


def _handle_prompt_command(command: str, state: dict[str, object]) -> None:
    """Handle slash-commands entered at the Annie> prompt."""
    cmd = command.lower().split()[0]
    if cmd == "/status":
        console.kv(
            {
                "Status": str(state.get("status", "unknown")),
                "Iterations": str(state.get("iteration_count", 0)),
            }
        )
    elif cmd == "/pause":
        from kernel.state import save_state

        state["status"] = "paused"
        save_state(state)
        console.warning("Paused. Run 'anima reset' to resume.")
    elif cmd == "/help":
        console.info("Commands: /status  /pause  /help")
        console.info("Or type text to send a message to inbox.")
    else:
        console.warning(f"Unknown command: {cmd}")
        console.info("Try /help for available commands.")


def _create_inbox_item(message: str) -> None:
    """Write a message to the inbox directory."""
    from kernel.config import INBOX_DIR

    INBOX_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    slug = message[:40].lower().replace(" ", "-")
    slug = "".join(c for c in slug if c.isalnum() or c == "-").strip("-")
    filename = f"{timestamp}-{slug}.md"
    path = INBOX_DIR / filename
    path.write_text(f"# Instruction\n\n{message}\n")


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="anima",
        description="Anima -- Autonomous Iteration Engine",
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

    # anima init
    init_p = sub.add_parser("init", help="Initialize Anima in an existing project")
    init_p.add_argument(
        "--template",
        default=None,
        help="VISION.md template (e.g. web-app, cli-tool, library)",
    )

    # anima approve
    approve_p = sub.add_parser("approve", help="Approve a gated iteration")
    approve_p.add_argument("iteration_id", help="The iteration ID to approve")

    args = parser.parse_args()

    # -- Console configuration (TUI output) ---------------------------------
    configure(backend="auto")

    # -- Logging configuration (file-based audit log) -----------------------
    if args.command == "start":
        if args.verbose:
            level = logging.DEBUG
        elif args.quiet:
            level = logging.WARNING
        else:
            level = logging.INFO

        from kernel.config import ROOT

        log_dir = ROOT / ".anima"
        log_dir.mkdir(parents=True, exist_ok=True)
        logging.basicConfig(
            filename=str(log_dir / "anima.log"),
            format="%(asctime)s %(name)s %(levelname)s %(message)s",
            level=level,
        )

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
    elif args.command == "init":
        cmd_init(args)
    elif args.command == "approve":
        cmd_approve(args)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
