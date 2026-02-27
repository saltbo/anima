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

import subprocess
import json
import os
import re
import time
import hashlib
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

ROOT = Path(__file__).parent.parent.resolve()
VISION_FILE = ROOT / "VISION.md"
STATE_FILE = ROOT / ".anima" / "state.json"
ITERATIONS_DIR = ROOT / "iterations"
INBOX_DIR = ROOT / "inbox"
MODULES_DIR = ROOT / "modules"
DOMAIN_DIR = ROOT / "domain"
ADAPTERS_DIR = ROOT / "adapters"
KERNEL_DIR = ROOT / "kernel"
ROADMAP_DIR = ROOT / "roadmap"

# How long to wait between iterations in continuous mode (seconds)
ITERATION_COOLDOWN = 10

# Max consecutive failures before pausing and waiting for human
MAX_CONSECUTIVE_FAILURES = 3

# Agent command — change this if using a different agent
AGENT_CMD = "claude"

# Protected paths that the agent must not modify
PROTECTED_PATHS = [
    "VISION.md",
    "kernel/",
]

# ---------------------------------------------------------------------------
# Roadmap Helpers
# ---------------------------------------------------------------------------


def _get_current_version() -> str:
    """Return the first version that still has unchecked items (e.g. '0.2').

    Scans roadmap/v*.md in sorted order. Returns the highest version if all
    are complete.
    """
    if not ROADMAP_DIR.exists():
        return "0.1"
    versions: list[str] = []
    for f in sorted(ROADMAP_DIR.glob("v*.md")):
        ver = f.stem[1:]  # "v0.2" -> "0.2"
        versions.append(ver)
        content = f.read_text()
        if "- [ ]" in content:
            return ver
    return versions[-1] if versions else "0.1"


def _read_roadmap_file(version: str) -> str:
    """Read the content of roadmap/v{version}.md."""
    path = ROADMAP_DIR / f"v{version}.md"
    if path.exists():
        return path.read_text()
    return ""


def _parse_roadmap_items(content: str) -> tuple[list[str], list[str]]:
    """Parse markdown checklist, return (unchecked, checked) item texts."""
    unchecked: list[str] = []
    checked: list[str] = []
    for line in content.split("\n"):
        stripped = line.strip()
        if stripped.startswith("- [ ]"):
            unchecked.append(stripped[6:].strip())
        elif stripped.startswith("- [x]") or stripped.startswith("- [X]"):
            checked.append(stripped[6:].strip())
    return unchecked, checked




# ---------------------------------------------------------------------------
# State Management
# ---------------------------------------------------------------------------


def load_state() -> dict:
    """Load persistent state from disk."""
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {
        "iteration_count": 0,
        "consecutive_failures": 0,
        "last_iteration": None,
        "completed_items": [],
        "module_versions": {},
        "status": "sleep",  # alive | sleep | paused
    }


def save_state(state: dict) -> None:
    """Persist state to disk."""
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2, ensure_ascii=False))


# ---------------------------------------------------------------------------
# Git Operations
# ---------------------------------------------------------------------------


def git(*args: str) -> tuple[int, str]:
    """Run a git command and return (returncode, output)."""
    result = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    return result.returncode, (result.stdout + result.stderr).strip()


def ensure_git() -> None:
    """Initialize git repo if not already initialized."""
    if not (ROOT / ".git").exists():
        git("init")
        gitignore = ROOT / ".gitignore"
        if not gitignore.exists():
            gitignore.write_text(
                "__pycache__/\n*.pyc\n.anima/\n.pytest_cache/\n"
                "venv/\n.venv/\nnode_modules/\n.ruff_cache/\n"
            )
        git("add", "-A")
        git("commit", "-m", "chore(anima): initial commit")
        print("[git] Initialized repository")


def create_snapshot(label: str) -> str:
    """Create a commit snapshot before iteration. Returns commit SHA."""
    git("add", "-A")
    code, _ = git("diff", "--cached", "--quiet")
    if code != 0:
        git("commit", "-m", f"chore(anima): pre-iteration snapshot {label}")
    _, sha = git("rev-parse", "HEAD")
    return sha


def commit_iteration(iteration_id: str, summary: str) -> None:
    """Commit changes from a successful iteration and push."""
    git("add", "-A")
    git("commit", "-m", f"feat(anima): [{iteration_id}] {summary}")
    code, out = git("push")
    if code != 0:
        print(f"  [git] push failed: {out[:200]}")


def rollback_to(ref: str) -> None:
    """Rollback to a previous snapshot by commit SHA."""
    git("reset", "--hard", ref)
    git("clean", "-fd")
    print(f"[git] Rolled back to {ref[:12]}")


# ---------------------------------------------------------------------------
# Project State Scanner
# ---------------------------------------------------------------------------


def scan_project_state() -> dict:
    """Scan the current project to understand what exists."""
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
    skip_dirs = {".git", "__pycache__", "node_modules", "venv", ".venv",
                 ".pytest_cache", ".ruff_cache", ".anima", "iterations"}
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

    # Run quality pipeline if tooling is available
    state["quality_results"] = run_quality_checks()

    # Run tests if they exist
    if state["has_tests"]:
        state["test_results"] = run_tests()

    # Scan inbox
    if INBOX_DIR.exists():
        for item in sorted(INBOX_DIR.iterdir()):
            if item.is_file() and item.suffix == ".md":
                state["inbox_items"].append({
                    "filename": item.name,
                    "content": item.read_text(),
                })

    return state


def run_quality_checks() -> dict:
    """Run ruff and pyright if available. Returns structured results."""
    results: dict = {"ruff_lint": None, "ruff_format": None, "pyright": None}

    # Exclude protected files from quality checks — they are not managed by Anima
    exclude_args = ["--exclude", "seed.py"]

    # ruff check
    try:
        r = subprocess.run(
            ["ruff", "check", ".", *exclude_args],
            cwd=ROOT, capture_output=True, text=True, timeout=60,
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
            cwd=ROOT, capture_output=True, text=True, timeout=60,
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
            cwd=ROOT, capture_output=True, text=True, timeout=120,
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
            ["python", "-m", "pytest", "--tb=short", "-q",
             "--cov=domain", "--cov=modules", "--cov=adapters",
             "--cov-report=term-missing"],
            cwd=ROOT, capture_output=True, text=True, timeout=120,
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
    unchecked, checked = _parse_roadmap_items(roadmap_content)

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
    vision: str,
    project_state: dict,
    gaps: str,
    history: list[dict],
    iteration_count: int,
) -> str:
    """
    Construct the prompt for the AI agent.

    Seed's planning logic. Will be replaced by modules/planner/core.py.
    """
    recent_history = ""
    if history:
        last_3 = history[-3:]
        entries = []
        for h in last_3:
            status = "✓" if h.get("success") else "✗"
            entries.append(f"  [{status}] {h.get('summary', 'no summary')}")
        recent_history = f"\nRECENT ITERATIONS:\n" + "\n".join(entries)

    file_list = "\n".join(f"  {f}" for f in project_state.get("files", []))

    module_status = ""
    if project_state.get("modules"):
        lines = []
        for name, info in project_state["modules"].items():
            flags = []
            if info["has_contract"]:
                flags.append("contract")
            if info.get("has_spec"):
                flags.append("spec")
            if info.get("has_core"):
                flags.append("core")
            if info["has_tests"]:
                flags.append("tests")
            lines.append(f"  {name}: [{', '.join(flags) if flags else 'empty'}]")
        module_status = "\nMODULE STATUS:\n" + "\n".join(lines)

    arch_status = (
        f"\nARCHITECTURE STATUS:\n"
        f"  domain/ layer: {'exists' if project_state.get('domain_exists') else 'MISSING'}\n"
        f"  adapters/ layer: {'exists' if project_state.get('adapters_exist') else 'MISSING'}\n"
        f"  kernel/ layer: {'exists' if project_state.get('kernel_exists') else 'not yet needed'}\n"
        f"  pyproject.toml: {'exists' if project_state.get('has_pyproject') else 'MISSING'}\n"
        f"  pyrightconfig.json: {'exists' if project_state.get('has_pyrightconfig') else 'MISSING'}"
    )

    quality_status = ""
    qr = project_state.get("quality_results", {})
    if qr:
        parts = []
        for tool in ["ruff_lint", "ruff_format", "pyright"]:
            if qr.get(tool):
                parts.append(f"  {tool}: {'✓' if qr[tool]['passed'] else '✗ FAILING'}")
            else:
                parts.append(f"  {tool}: not installed")
        quality_status = "\nQUALITY PIPELINE:\n" + "\n".join(parts)

    test_status = ""
    if project_state.get("test_results"):
        tr = project_state["test_results"]
        test_status = f"\nTESTS: {'✓ passing' if tr['passed'] else '✗ FAILING'}"

    # Load current roadmap target
    current_version = _get_current_version()
    roadmap_content = _read_roadmap_file(current_version)

    prompt = f"""You are the AI agent driving Anima, an Autonomous Iteration Engine.
Anima builds itself through iterative development cycles. You are in iteration #{iteration_count + 1}.

======== VISION (read VISION.md for full details) ========
{vision}

======== CURRENT ROADMAP TARGET (v{current_version}) ========
{roadmap_content}

======== CURRENT STATE ========
FILES:
{file_list if file_list else '  (no files yet beyond seed.py and VISION.md)'}
{arch_status}
{module_status}
{quality_status}
{test_status}
{recent_history}

======== GAPS TO ADDRESS ========
{gaps}

======== YOUR TASK ========
Execute THE SINGLE MOST IMPORTANT next step to advance Anima. Rules:

1. **ONE THING WELL.** Pick the highest-priority gap and address it thoroughly.
   Do not attempt multiple unrelated changes.

2. **FINISH THE CURRENT VERSION FIRST.** Only work on items listed in the
   CURRENT ROADMAP TARGET (v{current_version}) above. Do NOT start tasks from
   later versions until all items in v{current_version} are checked off.

3. **PRIORITY ORDER** (do the first applicable item from the current version):
   a. If quality checks are failing (ruff/pyright) → fix the issues
   b. If tests are failing → fix them
   c. Pick the next unchecked roadmap item and implement it
   d. If inbox has items → incorporate into specs/plans
   e. If all items in current version are done → advance to next roadmap version

4. **ROADMAP TRACKING**: When you complete a roadmap item, check it off yourself
   by changing `- [ ]` to `- [x]` in the corresponding roadmap/v*.md file.

5. **SELF-REPLACEMENT**: You may modify seed.py to delegate functions to modules
   you have built. This is how Anima grows — replacing seed scaffolding with
   purpose-built modules. Make sure tests still pass after any seed.py change.

6. **DO NOT MODIFY these files** (they are protected — violations cause rollback):
   - VISION.md
   - Anything in kernel/ (if it exists)

Now execute. Create or modify files to address the most important gap.
After making changes, verify them by running: ruff check . && pyright && python -m pytest
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
        return f'/{inp.get("pattern", "")}/'
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

    try:
        # Remove CLAUDECODE env var to allow nested invocation in --print mode
        env = {k: v for k, v in os.environ.items() if not k.startswith("CLAUDE")}
        proc = subprocess.Popen(
            [AGENT_CMD, "--print", "--verbose", "--dangerously-skip-permissions",
             "--output-format", "stream-json", "--include-partial-messages",
             prompt],
            cwd=ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=env,
        )

        # Parse stream-json NDJSON and display events in real-time
        result_text = ""
        current_tool: Optional[str] = None
        tool_input_chunks: list[str] = []
        assert proc.stdout is not None
        for line in proc.stdout:
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
                        summary = _summarize_tool_input(
                            current_tool, "".join(tool_input_chunks))
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
                print(f"\n  [executor] Done in {duration/1000:.1f}s, cost: ${cost:.4f}, tokens: {total_tokens}")

        print()  # newline after streaming
        proc.wait(timeout=600)

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
    except subprocess.TimeoutExpired:
        proc.kill()
        return {
            "success": False,
            "output": "",
            "errors": "Agent timed out after 600 seconds",
            "exit_code": -1,
            "elapsed_seconds": 600,
        }
    except FileNotFoundError:
        return {
            "success": False,
            "output": "",
            "errors": f"Agent command '{AGENT_CMD}' not found. Install it or update AGENT_CMD in seed.py.",
            "exit_code": -1,
            "elapsed_seconds": 0,
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

    protected_hashes_before = {
        p: _file_hash(ROOT / p)
        for p in protected_files
    }

    current_state = scan_project_state()

    for path, hash_before in protected_hashes_before.items():
        hash_after = _file_hash(ROOT / path)
        if hash_before != hash_after:
            issues.append(f"CRITICAL: {path} was modified by the agent")

    # --- Quality pipeline ---
    qr = current_state.get("quality_results", {})
    if qr:
        for tool_name, tool_result in qr.items():
            if tool_result and not tool_result["passed"]:
                issues.append(f"Quality check failed ({tool_name}): {tool_result['output'][:200]}")

    # --- Tests ---
    if current_state["has_tests"]:
        test_results = run_tests()
        if not test_results["passed"]:
            issues.append(f"Tests failed:\n{test_results['output'][:500]}")
        else:
            improvements.append("All tests passing")

    # --- Detect improvements ---
    new_files = set(current_state["files"]) - set(pre_state["files"])
    if new_files:
        improvements.append(f"New files: {len(new_files)}")

    return {
        "passed": len(issues) == 0,
        "issues": issues,
        "improvements": improvements,
        "post_state": current_state,
    }




def _file_hash(path: Path) -> Optional[str]:
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
        "timestamp": datetime.now(timezone.utc).isoformat(),
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

    print(f"\n{'─'*50}")
    print(f"  Iteration {iteration_id}")
    print(f"  Status: {'✓ PASSED' if report['success'] else '✗ FAILED'}")
    print(f"  Time: {elapsed:.1f}s")
    if report["improvements"]:
        for imp in report["improvements"]:
            print(f"  ✓ {imp}")
    if report["issues"]:
        for issue in report["issues"]:
            print(f"  ✗ {issue[:120]}")
    print(f"{'─'*50}")

    return report


def _generate_summary(verification: dict) -> str:
    """Generate a one-line summary."""
    if verification["improvements"]:
        return "; ".join(verification["improvements"][:3])
    if verification["issues"]:
        return f"Failed: {verification['issues'][0][:100]}"
    return "No significant changes"


def load_history() -> list[dict]:
    """Load all past iteration reports."""
    history: list[dict] = []
    if ITERATIONS_DIR.exists():
        for log_file in sorted(ITERATIONS_DIR.glob("*.json")):
            try:
                history.append(json.loads(log_file.read_text()))
            except (json.JSONDecodeError, IOError):
                continue
    return history


# ---------------------------------------------------------------------------
# Module Replacement Check
# ---------------------------------------------------------------------------




# ---------------------------------------------------------------------------
# Main Iteration Cycle
# ---------------------------------------------------------------------------


def run_iteration(state: dict, dry_run: bool = False) -> dict:
    """Execute a single iteration cycle."""
    iteration_num = state["iteration_count"] + 1
    iteration_id = f"{iteration_num:04d}-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    iteration_start = time.time()

    print(f"\n{'═'*60}")
    print(f"  🌱 ANIMA — Iteration #{iteration_num}")
    print(f"     {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'═'*60}")

    # Step 1: Scan current state
    print("\n[1/5] Scanning project state...")
    project_state = scan_project_state()
    print(f"  Files: {len(project_state['files'])}")
    print(f"  Modules: {list(project_state['modules'].keys()) or '(none)'}")
    print(f"  Domain: {'✓' if project_state['domain_exists'] else '✗'}")
    print(f"  Tests: {'✓' if project_state['has_tests'] else '—'}")
    print(f"  Inbox: {len(project_state['inbox_items'])} items")

    # Step 2: Analyze gaps
    print("\n[2/5] Analyzing gaps...")
    vision = VISION_FILE.read_text()
    history = load_history()
    gaps = analyze_gaps(vision, project_state, history)

    if gaps == "NO_GAPS":
        print("  No gaps found. Anima is at rest. 🌿")
        state["status"] = "sleep"
        save_state(state)
        return state

    gap_lines = gaps.strip().split("\n")
    print(f"  Found {len(gap_lines)} gap entries")

    # Step 3: Plan + Snapshot
    print("\n[3/5] Planning iteration...")
    prompt = plan_iteration(vision, project_state, gaps, history, state["iteration_count"])
    snapshot_ref = create_snapshot(iteration_id)

    # Step 4: Execute
    print("\n[4/5] Executing plan...")
    exec_result = execute_plan(prompt, dry_run=dry_run)

    if dry_run:
        print("\n[dry-run] Skipping verification and commit")
        return state

    if not exec_result["success"]:
        print(f"  Agent execution failed: {exec_result.get('errors', 'unknown error')[:200]}")

    # Step 5: Verify
    print("\n[5/5] Verifying results...")
    verification = verify_iteration(project_state, scan_project_state())

    # Report + commit/rollback
    elapsed = time.time() - iteration_start
    report = record_iteration(iteration_id, gaps, exec_result, verification, elapsed)

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
            print("    python seed.py --status     # see what went wrong")
            print("    python seed.py --reset      # clear failures and resume")
            state["status"] = "paused"

    state["iteration_count"] = iteration_num
    state["last_iteration"] = report["id"]
    save_state(state)
    return state


# ---------------------------------------------------------------------------
# README Status Badge
# ---------------------------------------------------------------------------

README_FILE = ROOT / "README.md"
STATUS_START = "<!-- anima:status:start -->"
STATUS_END = "<!-- anima:status:end -->"
STAGE_START = "<!-- anima:stage:start -->"
STAGE_END = "<!-- anima:stage:end -->"
PROGRESS_START = "<!-- anima:progress:start -->"
PROGRESS_END = "<!-- anima:progress:end -->"


def _parse_version(v: str) -> tuple[int, ...]:
    """Parse 'v0.4.0' or 'v0.4' into a comparable tuple like (0, 4, 0)."""
    return tuple(int(x) for x in v.lstrip("v").split("."))


def _detect_current_milestone(state: dict) -> str:
    """Detect the current version milestone using roadmap files.

    Scans roadmap/v*.md in order. The first version that still has unchecked
    items is the *current target*; the previous version is the achieved
    milestone. Requires roadmap/ directory to exist.
    """
    _ = state  # reserved for future use

    if not ROADMAP_DIR.exists():
        print("  [milestone] WARNING: roadmap/ directory missing, returning v0.0.0")
        return "v0.0.0"

    prev_version = "v0.0.0"
    for f in sorted(ROADMAP_DIR.glob("v*.md")):
        ver = f.stem  # "v0.2"
        content = f.read_text()
        if "- [ ]" in content:
            return prev_version
        prev_version = ver + ".0"  # "v0.2" -> "v0.2.0"
    return prev_version  # all complete


def tag_milestone_if_advanced(state: dict) -> None:
    """Create a git tag when the milestone version advances (never downgrades)."""
    new_milestone = _detect_current_milestone(state)
    old_milestone = state.get("current_milestone", "v0.0.0")

    if _parse_version(new_milestone) <= _parse_version(old_milestone):
        return

    state["current_milestone"] = new_milestone

    # Check if this tag already exists (e.g. from a manual run)
    code, _ = git("rev-parse", new_milestone)
    if code == 0:
        print(f"  [git] Tag {new_milestone} already exists, skipping")
        return

    git("tag", "-a", new_milestone, "-m", f"Milestone {new_milestone}")
    code, out = git("push", "origin", new_milestone)
    if code != 0:
        print(f"  [git] push tag failed: {out[:200]}")
    else:
        print(f"  🏷️  Tagged {new_milestone} (was {old_milestone})")


def _replace_block(content: str, start: str, end: str, block: str) -> str:
    """Replace content between start/end markers, or return unchanged."""
    pattern = re.compile(re.escape(start) + r".*?" + re.escape(end), re.DOTALL)
    if pattern.search(content):
        return pattern.sub(block, content)
    return content


def _roadmap_progress() -> tuple[int, int]:
    """Count checked and total roadmap items across all version files."""
    checked = 0
    total = 0
    if ROADMAP_DIR.exists():
        for f in sorted(ROADMAP_DIR.glob("v*.md")):
            text = f.read_text()
            total += text.count("- [x]") + text.count("- [ ]")
            checked += text.count("- [x]")
    return checked, total


def update_readme(state: dict) -> None:
    """Update README.md auto-generated blocks (status, stage, progress)."""
    if not README_FILE.exists():
        return

    milestone = _detect_current_milestone(state)
    content = README_FILE.read_text()

    # --- Status block: agent status + milestone badges ---
    status = state.get("status", "sleep")
    status_color = {"alive": "brightgreen", "sleep": "yellow", "paused": "red"}.get(
        status, "lightgrey"
    )
    # Format cumulative stats for badges
    total_cost = state.get("total_cost_usd", 0)
    total_tokens = state.get("total_tokens", 0)
    total_seconds = state.get("total_elapsed_seconds", 0)

    # Human-readable time: "1h_23m" or "45m" or "2m" (underscore for shields.io)
    total_minutes = int(total_seconds // 60)
    if total_minutes >= 60:
        time_label = f"{total_minutes // 60}h_{total_minutes % 60}m"
    else:
        time_label = f"{total_minutes}m"

    # Human-readable tokens: "123k" or "1.2M"
    if total_tokens >= 1_000_000:
        tokens_label = f"{total_tokens / 1_000_000:.1f}M"
    elif total_tokens >= 1_000:
        tokens_label = f"{total_tokens / 1_000:.0f}k"
    else:
        tokens_label = str(total_tokens)

    cost_label = f"${total_cost:.2f}"

    status_block = (
        f"{STATUS_START}\n"
        f"![status](https://img.shields.io/badge/status-{status}-{status_color})"
        f" ![milestone](https://img.shields.io/badge/milestone-{milestone}-purple)"
        f" ![time](https://img.shields.io/badge/time-{time_label}-blue)"
        f" ![tokens](https://img.shields.io/badge/tokens-{tokens_label}-blue)"
        f" ![cost](https://img.shields.io/badge/cost-{cost_label}-blue)\n"
        f"{STATUS_END}"
    )
    content = _replace_block(content, STATUS_START, STATUS_END, status_block)

    # --- Stage block: Growing vs Available ---
    # Parse major version from milestone (e.g. "v0.4.0" -> 0)
    major = 0
    m = re.match(r"v(\d+)\.", milestone)
    if m:
        major = int(m.group(1))

    if major >= 1:
        stage_block = (
            f"{STAGE_START}\n"
            f"> **Status: Available** — Install Anima via pip: `pip install anima`\n"
            f"{STAGE_END}"
        )
    else:
        stage_block = (
            f"{STAGE_START}\n"
            f"> **Status: Growing** — Anima is building itself."
            f" It is not yet available for external use.\n"
            f"{STAGE_END}"
        )
    content = _replace_block(content, STAGE_START, STAGE_END, stage_block)

    # --- Progress block: milestone + roadmap counts ---
    checked, total = _roadmap_progress()
    progress_block = (
        f"{PROGRESS_START}\n"
        f"**Milestone: {milestone}** — Roadmap: {checked} / {total} tasks complete\n"
        f"{PROGRESS_END}"
    )
    content = _replace_block(content, PROGRESS_START, PROGRESS_END, progress_block)

    README_FILE.write_text(content)

