#!/usr/bin/env python3
"""
SEED — Function library for Anima.

Anima is an Autonomous Iteration Engine that gives software projects a life
of their own. This seed script is the initial spark — every function here
is meant to be replaced by a purpose-built module that Anima creates for itself.

The seed provides the core functions for the five iteration steps:
  1. analyze_gaps() — find gaps between vision and current state
  2. plan_iteration() — plan the next iteration
  3. execute_plan() — execute the plan via an AI agent
  4. verify_iteration() — verify results (ruff + pyright + pytest + contract checks)
  5. record_iteration() — report and commit (or rollback)

CLI entry point: kernel/cli.py (installed as 'anima' command)
Backward compat: python seed.py [args] still works (redirects to kernel.cli)
"""

import hashlib
import json
import os
import subprocess
import time
from datetime import UTC, datetime
from pathlib import Path

# ---------------------------------------------------------------------------
# Configuration — imported from kernel.config
# ---------------------------------------------------------------------------
from kernel.config import (
    ADAPTERS_DIR,
    AGENT_CMD,
    DOMAIN_DIR,
    INBOX_DIR,
    ITERATIONS_DIR,
    KERNEL_DIR,
    MODULES_DIR,
    PROTECTED_PATHS,
    ROOT,
)

# ---------------------------------------------------------------------------
# Git operations — imported from kernel.git_ops
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Roadmap helpers — imported from kernel.roadmap
# ---------------------------------------------------------------------------
from kernel.roadmap import (
    get_current_version as _get_current_version,
)
from kernel.roadmap import (
    parse_roadmap_items as _parse_roadmap_items,
)
from kernel.roadmap import (
    read_roadmap_file as _read_roadmap_file,
)

# ---------------------------------------------------------------------------
# Roadmap/milestone ops — imported from kernel.roadmap
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# State Management
# ---------------------------------------------------------------------------
# State management — imported from kernel.state
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Project State Scanner
# ---------------------------------------------------------------------------


def scan_project_state(*, skip_checks: bool = False) -> dict:
    """Scan the current project to understand what exists.

    Args:
        skip_checks: If True, skip quality pipeline and test execution
                     (useful for fast status display).
    """
    state: dict = {
        "files": [],
        "modules": {},
        "domain_exists": False,
        "adapters_exist": False,
        "kernel_exists": False,
        "has_tests": False,
        "has_pyproject": (ROOT / "pyproject.toml").exists(),
        "has_pyrightconfig": (ROOT / "pyrightconfig.json").exists(),
        "test_results": None,
        "quality_results": None,
        "inbox_items": [],
    }

    # Scan file tree — use os.walk to prune directories early (avoid .venv etc)
    skip_dirs = {
        ".git",
        "__pycache__",
        "node_modules",
        "venv",
        ".venv",
        ".pytest_cache",
        ".ruff_cache",
        ".anima",
        "iterations",
    }
    for dirpath, dirnames, filenames in os.walk(ROOT):
        # Prune skip_dirs in-place so os.walk won't descend into them
        dirnames[:] = sorted(d for d in dirnames if d not in skip_dirs)
        for filename in sorted(filenames):
            rel = os.path.relpath(os.path.join(dirpath, filename), ROOT)
            state["files"].append(rel)

    # Check architectural layers
    state["domain_exists"] = DOMAIN_DIR.exists() and any(DOMAIN_DIR.rglob("*.py"))
    state["adapters_exist"] = ADAPTERS_DIR.exists() and any(ADAPTERS_DIR.rglob("*.py"))
    state["kernel_exists"] = KERNEL_DIR.exists() and any(KERNEL_DIR.rglob("*.py"))

    # Scan modules
    if MODULES_DIR.exists():
        for module_dir in sorted(MODULES_DIR.iterdir()):
            if module_dir.is_dir() and not module_dir.name.startswith("."):
                module_info = {
                    "has_contract": (module_dir / "CONTRACT.md").exists(),
                    "has_spec": (module_dir / "SPEC.md").exists(),
                    "has_core": (module_dir / "core.py").exists(),
                    "has_tests": (module_dir / "tests").exists()
                    and any((module_dir / "tests").rglob("test_*.py")),
                    "files": [],
                }
                for f in module_dir.rglob("*"):
                    if f.is_file():
                        module_info["files"].append(str(f.relative_to(module_dir)))
                state["modules"][module_dir.name] = module_info

    # Check for tests anywhere in the project
    test_files = [f for f in state["files"] if "test_" in f and f.endswith(".py")]
    state["has_tests"] = len(test_files) > 0

    # Run quality pipeline if tooling is available (skip for fast status)
    if not skip_checks:
        state["quality_results"] = run_quality_checks()

        # Run tests if they exist
        if state["has_tests"]:
            state["test_results"] = run_tests()

    # Scan inbox
    if INBOX_DIR.exists():
        for item in sorted(INBOX_DIR.iterdir()):
            if item.is_file() and item.suffix == ".md":
                state["inbox_items"].append(
                    {
                        "filename": item.name,
                        "content": item.read_text(),
                    }
                )

    return state


def run_quality_checks() -> dict:
    """Run ruff and pyright if available. Returns structured results."""
    results: dict = {"ruff_lint": None, "ruff_format": None, "pyright": None}

    # Exclude kernel/ from quality checks — it is the human-maintained trust root
    exclude_args = ["--exclude", "kernel/"]

    # ruff check
    try:
        r = subprocess.run(
            ["ruff", "check", ".", *exclude_args],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=60,
        )
        results["ruff_lint"] = {
            "passed": r.returncode == 0,
            "output": (r.stdout + r.stderr)[-1000:],
        }
    except (FileNotFoundError, subprocess.TimeoutExpired):
        results["ruff_lint"] = None  # ruff not installed yet

    # ruff format --check
    try:
        r = subprocess.run(
            ["ruff", "format", "--check", ".", *exclude_args],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=60,
        )
        results["ruff_format"] = {
            "passed": r.returncode == 0,
            "output": (r.stdout + r.stderr)[-1000:],
        }
    except (FileNotFoundError, subprocess.TimeoutExpired):
        results["ruff_format"] = None

    # pyright
    try:
        r = subprocess.run(
            ["pyright"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=120,
        )
        results["pyright"] = {
            "passed": r.returncode == 0,
            "output": (r.stdout + r.stderr)[-1000:],
        }
    except (FileNotFoundError, subprocess.TimeoutExpired):
        results["pyright"] = None

    return results


def run_tests() -> dict:
    """Run pytest and return structured results."""
    try:
        result = subprocess.run(
            ["python", "-m", "pytest", "--tb=short", "-q"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=120,
        )
        return {
            "exit_code": result.returncode,
            "passed": result.returncode == 0,
            "output": result.stdout[-2000:] if result.stdout else "",
            "errors": result.stderr[-2000:] if result.stderr else "",
        }
    except (FileNotFoundError, subprocess.TimeoutExpired) as e:
        return {
            "exit_code": -1,
            "passed": False,
            "output": "",
            "errors": str(e),
        }


# ---------------------------------------------------------------------------
# Gap Analyzer (Seed Version — will be replaced by modules/gap_analyzer)
# ---------------------------------------------------------------------------


def analyze_gaps(vision: str, project_state: dict, history: list[dict]) -> str:
    """
    Compute the gap between vision and current state.

    Seed's primitive version. Constructs a textual gap analysis for the AI agent.
    Will be replaced by modules/gap_analyzer/core.py.
    """
    gaps: list[str] = []

    # Read only the current version's roadmap file
    current_version = _get_current_version()
    roadmap_content = _read_roadmap_file(current_version)
    unchecked, _checked = _parse_roadmap_items(roadmap_content)

    if unchecked:
        gaps.append(f"UNCOMPLETED ROADMAP ITEMS for v{current_version} ({len(unchecked)}):")
        for item in unchecked:
            gaps.append(f"  - {item}")

    # Only flag infrastructure gaps if they're in the current roadmap version
    roadmap_text = roadmap_content.lower()
    if not project_state.get("domain_exists") and "domain/" in roadmap_text:
        gaps.append("\nMISSING: domain/ layer (models.py + ports.py)")
    if not project_state.get("has_pyproject") and "pyproject.toml" in roadmap_text:
        gaps.append("\nMISSING: pyproject.toml (project config, ruff config, pytest config)")
    if not project_state.get("has_pyrightconfig") and "pyrightconfig.json" in roadmap_text:
        gaps.append("\nMISSING: pyrightconfig.json (strict type checking config)")

    # Check quality pipeline results
    qr = project_state.get("quality_results", {})
    if qr:
        if qr.get("ruff_lint") and not qr["ruff_lint"]["passed"]:
            gaps.append(f"\nRUFF LINT FAILURES:\n{qr['ruff_lint']['output'][:500]}")
        if qr.get("ruff_format") and not qr["ruff_format"]["passed"]:
            gaps.append(f"\nRUFF FORMAT FAILURES:\n{qr['ruff_format']['output'][:500]}")
        if qr.get("pyright") and not qr["pyright"]["passed"]:
            gaps.append(f"\nPYRIGHT TYPE ERRORS:\n{qr['pyright']['output'][:500]}")

    # Check test failures
    test_results = project_state.get("test_results")
    if test_results and not test_results["passed"]:
        gaps.append(f"\nFAILING TESTS:\n{test_results['output']}")

    # Include inbox items
    for item in project_state.get("inbox_items", []):
        gaps.append(f"\nHUMAN REQUEST ({item['filename']}):\n{item['content']}")

    if not gaps:
        return "NO_GAPS"

    return "\n".join(gaps)


# ---------------------------------------------------------------------------
# Planner (Seed Version — will be replaced by modules/planner)
# ---------------------------------------------------------------------------


def plan_iteration(
    project_state: dict,
    gaps: str,
    history: list[dict],
    iteration_count: int,
) -> str:
    """
    Construct the prompt for the AI agent.

    Static context (SOUL.md, VISION.md, CLAUDE.md, roadmap/) is read by the
    agent itself — the prompt only carries dynamic per-iteration data.

    Seed's planning logic. Will be replaced by modules/planner/core.py.
    """
    recent_history = ""
    if history:
        last_3 = history[-3:]
        entries = []
        for h in last_3:
            status = "✓" if h.get("success") else "✗"
            entries.append(f"  [{status}] {h.get('summary', 'no summary')}")
        recent_history = "\nRECENT ITERATIONS:\n" + "\n".join(entries)

    # Brief state summary (no full file list — agent can scan itself)
    modules = list(project_state.get("modules", {}).keys())
    state_summary = (
        f"  Modules: {modules or '(none)'}\n"
        f"  Domain: {'exists' if project_state.get('domain_exists') else 'MISSING'}\n"
        f"  Tests: {'✓' if project_state.get('has_tests') else '—'}\n"
        f"  Inbox: {len(project_state.get('inbox_items', []))} items"
    )

    current_version = _get_current_version()

    prompt = f"""You are Anima. Read these files to understand yourself and your mission:
- SOUL.md — your identity and behavioral principles
- VISION.md — the project vision and architecture
- roadmap/v{current_version}.md — current version target

Iteration #{iteration_count + 1}. Current roadmap target: v{current_version}.

GAPS TO ADDRESS:
{gaps}
{recent_history}

STATE SUMMARY:
{state_summary}

Execute the single most important next step to advance Anima.
After making changes, verify: ruff check . && pyright && python -m pytest
"""
    return prompt


# ---------------------------------------------------------------------------
# Executor (Seed Version — will be replaced by modules/executor)
# ---------------------------------------------------------------------------


def _summarize_tool_input(tool_name: str, raw_json: str) -> str:
    """Extract a brief summary from tool input JSON for display."""
    try:
        inp = json.loads(raw_json)
    except (json.JSONDecodeError, ValueError):
        return ""
    if tool_name == "Read":
        return inp.get("file_path", "")
    if tool_name in ("Write", "Edit"):
        return inp.get("file_path", "")
    if tool_name == "Bash":
        cmd = inp.get("command", "")
        return cmd[:120] if cmd else ""
    if tool_name == "Glob":
        return inp.get("pattern", "")
    if tool_name == "Grep":
        return f"/{inp.get('pattern', '')}/"
    if tool_name == "TodoWrite":
        todos = inp.get("todos", [])
        if todos:
            first = todos[0] if isinstance(todos[0], str) else todos[0].get("content", "")
            return f"({len(todos)} items) {first[:60]}"
        return ""
    # Generic: show first string value
    for v in inp.values():
        if isinstance(v, str) and v:
            return v[:80]
    return ""


def execute_plan(prompt: str, dry_run: bool = False) -> dict:
    """
    Send the plan to the AI agent and capture results.

    Will be replaced by modules/executor/core.py with AgentPort abstraction.
    """
    if dry_run:
        print("\n[dry-run] Would send the following prompt to agent:")
        print("=" * 60)
        print(prompt[:3000])
        if len(prompt) > 3000:
            print(f"\n... ({len(prompt) - 3000} more characters)")
        print("=" * 60)
        return {"success": True, "output": "(dry run)", "dry_run": True}

    print(f"[executor] Calling {AGENT_CMD} (streaming)...")
    start_time = time.time()

    # Save prompt to file for debugging / reference
    prompt_file = ROOT / ".anima" / "current_prompt.txt"
    prompt_file.parent.mkdir(parents=True, exist_ok=True)
    prompt_file.write_text(prompt)

    # Remove CLAUDECODE env var to allow nested invocation in --print mode
    env = {k: v for k, v in os.environ.items() if not k.startswith("CLAUDE")}
    try:
        proc = subprocess.Popen(
            [
                AGENT_CMD,
                "--print",
                "--verbose",
                "--dangerously-skip-permissions",
                "--output-format",
                "stream-json",
                "--include-partial-messages",
            ],
            cwd=ROOT,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=env,
        )
        assert proc.stdin is not None
        proc.stdin.write(prompt)
        proc.stdin.close()
    except FileNotFoundError:
        return {
            "success": False,
            "output": "",
            "errors": f"Agent command '{AGENT_CMD}' not found. Install it or update AGENT_CMD in seed.py.",
            "exit_code": -1,
            "elapsed_seconds": 0,
        }

    # Parse stream-json NDJSON and display events in real-time
    result_text = ""
    current_tool: str | None = None
    tool_input_chunks: list[str] = []
    cost = 0.0
    total_tokens = 0

    try:
        assert proc.stdout is not None
        for line in iter(proc.stdout.readline, ""):
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue

            etype = event.get("type", "")

            if etype == "stream_event":
                inner = event.get("event", {})
                inner_type = inner.get("type", "")

                # Text streaming
                if inner_type == "content_block_delta":
                    delta = inner.get("delta", {})
                    if delta.get("type") == "text_delta":
                        print(delta.get("text", ""), end="", flush=True)
                    elif delta.get("type") == "input_json_delta":
                        # Accumulate tool input JSON chunks
                        tool_input_chunks.append(delta.get("partial_json", ""))

                # Tool use start
                elif inner_type == "content_block_start":
                    block = inner.get("content_block", {})
                    if block.get("type") == "tool_use":
                        print("", flush=True)  # newline after preceding text
                        current_tool = block.get("name", "unknown")
                        tool_input_chunks = []
                    elif block.get("type") == "text":
                        print("", flush=True)  # newline after preceding tool output

                # Tool use end — parse accumulated input and show summary
                elif inner_type == "content_block_stop":
                    if current_tool:
                        summary = _summarize_tool_input(current_tool, "".join(tool_input_chunks))
                        print(f"  ▶ [{current_tool}] {summary}", flush=True)
                        current_tool = None
                        tool_input_chunks = []

            # Final result
            elif etype == "result":
                result_text = event.get("result", "")
                cost = event.get("total_cost_usd", 0)
                duration = event.get("duration_ms", 0)
                usage = event.get("usage", {})
                input_tokens = usage.get("input_tokens", 0)
                output_tokens = usage.get("output_tokens", 0)
                cache_read = usage.get("cache_read_input_tokens", 0)
                cache_creation = usage.get("cache_creation_input_tokens", 0)
                total_tokens = input_tokens + output_tokens + cache_read + cache_creation
                print(
                    f"\n  [executor] Done in {duration / 1000:.1f}s, cost: ${cost:.4f}, tokens: {total_tokens}"
                )

        print()  # newline after streaming
        proc.wait(timeout=600)

    except KeyboardInterrupt:
        print("\n\n[executor] Interrupted — killing agent process...")
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
        raise  # re-raise so cmd_start's KeyboardInterrupt handler runs

    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
        return {
            "success": False,
            "output": "",
            "errors": "Agent timed out after 600 seconds",
            "exit_code": -1,
            "elapsed_seconds": 600,
        }

    assert proc.stderr is not None
    stderr_output = proc.stderr.read()
    if stderr_output:
        print(f"  [agent stderr] {stderr_output[:500]}")

    elapsed = time.time() - start_time
    return {
        "success": proc.returncode == 0,
        "output": result_text[-5000:] if result_text else "",
        "errors": stderr_output[-2000:] if stderr_output else "",
        "exit_code": proc.returncode,
        "elapsed_seconds": round(elapsed, 1),
        "cost_usd": cost,
        "total_tokens": total_tokens,
    }


# ---------------------------------------------------------------------------
# Verifier (Seed Version — will be replaced by modules/verifier)
# ---------------------------------------------------------------------------


def verify_iteration(pre_state: dict, post_state: dict) -> dict:
    """
    Verify that the iteration produced valid results.

    Checks:
    1. Protected files not modified (VISION.md, kernel/)
    2. Quality pipeline passes (ruff + pyright)
    3. Tests pass

    Will be replaced by modules/verifier/core.py.
    """
    issues: list[str] = []
    improvements: list[str] = []

    # --- Protected file checks (use PROTECTED_PATHS) ---
    protected_files: list[str] = []
    for p in PROTECTED_PATHS:
        path = ROOT / p
        if path.is_file():
            protected_files.append(p)
        elif path.is_dir():
            for f in path.rglob("*"):
                if f.is_file():
                    protected_files.append(str(f.relative_to(ROOT)))

    for pf in protected_files:
        h_before = pre_state.get("_protected_hashes", {}).get(pf) or _file_hash(ROOT / pf)
        h_after = _file_hash(ROOT / pf)
        if h_before != h_after:
            issues.append(f"CRITICAL: {pf} was modified by the agent")

    # --- Quality pipeline ---
    qr = run_quality_checks()
    for tool_name, tool_result in qr.items():
        if tool_result and not tool_result["passed"]:
            issues.append(f"Quality check failed ({tool_name}): {tool_result['output'][:200]}")

    # --- Tests ---
    test_results = run_tests()
    if test_results["passed"]:
        improvements.append("All tests passing")
    else:
        issues.append(f"Tests failed:\n{test_results['output'][:500]}")

    # --- Detect improvements ---
    new_files = set(post_state.get("files", [])) - set(pre_state.get("files", []))
    if new_files:
        improvements.append(f"New files: {len(new_files)}")

    return {
        "passed": len(issues) == 0,
        "issues": issues,
        "improvements": improvements,
        "post_state": post_state,
    }


def _file_hash(path: Path) -> str | None:
    """Get SHA256 hash of a file, or None if it doesn't exist."""
    if not path.exists():
        return None
    return hashlib.sha256(path.read_bytes()).hexdigest()


# ---------------------------------------------------------------------------
# Reporter (Seed Version — will be replaced by modules/reporter)
# ---------------------------------------------------------------------------


def record_iteration(
    iteration_id: str,
    gaps: str,
    execution_result: dict,
    verification: dict,
    elapsed: float,
) -> dict:
    """Record iteration results. Will be replaced by modules/reporter/core.py."""
    ITERATIONS_DIR.mkdir(parents=True, exist_ok=True)

    report = {
        "id": iteration_id,
        "timestamp": datetime.now(UTC).isoformat(),
        "success": verification["passed"],
        "summary": _generate_summary(verification),
        "gaps_addressed": gaps[:1000],
        "improvements": verification.get("improvements", []),
        "issues": verification.get("issues", []),
        "agent_output_excerpt": execution_result.get("output", "")[:1000],
        "elapsed_seconds": elapsed,
        "cost_usd": execution_result.get("cost_usd", 0),
        "total_tokens": execution_result.get("total_tokens", 0),
    }

    log_file = ITERATIONS_DIR / f"{iteration_id}.json"
    log_file.write_text(json.dumps(report, indent=2, ensure_ascii=False))

    print(f"\n{'─' * 50}")
    print(f"  Iteration {iteration_id}")
    print(f"  Status: {'✓ PASSED' if report['success'] else '✗ FAILED'}")
    print(f"  Time: {elapsed:.1f}s")
    if report["improvements"]:
        for imp in report["improvements"]:
            print(f"  ✓ {imp}")
    if report["issues"]:
        for issue in report["issues"]:
            print(f"  ✗ {issue[:120]}")
    print(f"{'─' * 50}")

    return report


def _generate_summary(verification: dict) -> str:
    """Generate a one-line summary."""
    if verification["improvements"]:
        return "; ".join(verification["improvements"][:3])
    if verification["issues"]:
        return f"Failed: {verification['issues'][0][:100]}"
    return "No significant changes"


# ---------------------------------------------------------------------------
# Module Replacement Check
# ---------------------------------------------------------------------------
