#!/usr/bin/env python3
"""
SEED — The bootstrap script for Anima.

Anima is an Autonomous Iteration Engine that gives software projects a life
of their own. This seed script is the initial spark — every function here
is meant to be replaced by a purpose-built module that Anima creates for itself.

The seed does exactly five things in a loop:
  1. Analyze gaps between vision and current state
  2. Plan the next iteration
  3. Execute the plan via an AI agent
  4. Verify the results (ruff + pyright + pytest + contract checks)
  5. Report and commit (or rollback)

Usage:
  python seed.py                  # Run one iteration
  python seed.py --loop           # Run continuous iterations
  python seed.py --loop --max 10  # Run up to 10 iterations
  python seed.py --dry-run        # Show what would be done without executing
  python seed.py --status         # Show current project state and gaps
"""

import subprocess
import json
import os
import sys
import time
import hashlib
import argparse
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

ROOT = Path(__file__).parent.resolve()
VISION_FILE = ROOT / "VISION.md"
STATE_FILE = ROOT / ".anima" / "state.json"
ITERATIONS_DIR = ROOT / "iterations"
INBOX_DIR = ROOT / "inbox"
MODULES_DIR = ROOT / "modules"
DOMAIN_DIR = ROOT / "domain"
ADAPTERS_DIR = ROOT / "adapters"
KERNEL_DIR = ROOT / "kernel"

# How long to wait between iterations in continuous mode (seconds)
ITERATION_COOLDOWN = 30

# Max consecutive failures before pausing and waiting for human
MAX_CONSECUTIVE_FAILURES = 3

# Agent command — change this if using a different agent
AGENT_CMD = "claude"

# Protected paths that the agent must not modify
PROTECTED_PATHS = [
    "seed.py",
    "VISION.md",
    "kernel/",
]

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
        "status": "running",  # running | paused | idle | error
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
        git("commit", "-m", "Initial commit: Anima seed + vision")
        print("[git] Initialized repository")


def create_snapshot(label: str) -> str:
    """Create a git tag as a snapshot before iteration."""
    tag = f"iter-{label}"
    git("add", "-A")
    code, _ = git("diff", "--cached", "--quiet")
    if code != 0:
        git("commit", "-m", f"Pre-iteration snapshot: {label}")
    git("tag", "-f", tag)
    return tag


def commit_iteration(iteration_id: str, summary: str) -> None:
    """Commit changes from a successful iteration."""
    git("add", "-A")
    git("commit", "-m", f"[iter-{iteration_id}] {summary}")
    git("tag", f"iter-{iteration_id}-done")


def rollback_to(tag: str) -> None:
    """Rollback to a previous snapshot."""
    git("reset", "--hard", tag)
    git("clean", "-fd")
    print(f"[git] Rolled back to {tag}")


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

    # Parse vision for unchecked roadmap items
    unchecked: list[str] = []
    checked: list[str] = []
    for line in vision.split("\n"):
        stripped = line.strip()
        if stripped.startswith("- [ ]"):
            unchecked.append(stripped[6:].strip())
        elif stripped.startswith("- [x]") or stripped.startswith("- [X]"):
            checked.append(stripped[6:].strip())

    if unchecked:
        gaps.append(f"UNCOMPLETED ROADMAP ITEMS ({len(unchecked)}):")
        for item in unchecked:
            gaps.append(f"  - {item}")

    # Check architectural layers
    if not project_state.get("domain_exists"):
        gaps.append("\nMISSING: domain/ layer (models.py + ports.py)")
    if not project_state.get("has_pyproject"):
        gaps.append("\nMISSING: pyproject.toml (project config, ruff config, pytest config)")
    if not project_state.get("has_pyrightconfig"):
        gaps.append("\nMISSING: pyrightconfig.json (strict type checking config)")

    # Check modules
    expected_modules = ["planner", "executor", "verifier", "reporter", "gap_analyzer"]
    existing_modules = list(project_state.get("modules", {}).keys())
    missing_modules = [m for m in expected_modules if m not in existing_modules]

    if missing_modules:
        gaps.append(f"\nMISSING MODULES: {', '.join(missing_modules)}")

    # Check module completeness
    for name, info in project_state.get("modules", {}).items():
        issues: list[str] = []
        if not info["has_contract"]:
            issues.append("missing CONTRACT.md")
        if not info.get("has_spec"):
            issues.append("missing SPEC.md")
        if not info.get("has_core"):
            issues.append("missing core.py")
        if not info["has_tests"]:
            issues.append("missing tests")
        if issues:
            gaps.append(f"\nMODULE '{name}' INCOMPLETE: {', '.join(issues)}")

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

    prompt = f"""You are the AI agent driving Anima, an Autonomous Iteration Engine.
Anima builds itself through iterative development cycles. You are in iteration #{iteration_count + 1}.

======== VISION (read VISION.md for full details) ========
{vision}

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

2. **PRIORITY ORDER** (do the first applicable item):
   a. If pyproject.toml or pyrightconfig.json is missing → create them
   b. If domain/models.py or domain/ports.py is missing → create them
   c. If a module directory is missing → create the directory + CONTRACT.md
   d. If a module has CONTRACT.md but no SPEC.md → write SPEC.md
   e. If a module has SPEC.md but no core.py → implement core.py
   f. If a module has core.py but no tests → write tests
   g. If quality checks are failing (ruff/pyright) → fix the issues
   h. If tests are failing → fix them
   i. If inbox has items → incorporate into specs/plans
   j. If all above are done → advance to next roadmap version

3. **ARCHITECTURE RULES** (enforced — violations cause rollback):
   - domain/ must have ZERO external imports (only stdlib + typing)
   - modules/*/core.py must only import from domain/
   - adapters/ implement Protocols defined in domain/ports.py
   - Use @dataclass(frozen=True) for domain models
   - Use typing.Protocol for all port interfaces
   - Complete type annotations on ALL functions (params + return types)
   - No `Any` type in domain models

4. **FILE LOCATIONS**:
   - Domain types: domain/models.py
   - Port interfaces: domain/ports.py
   - Module logic: modules/<name>/core.py
   - Module contracts: modules/<name>/CONTRACT.md
   - Module specs: modules/<name>/SPEC.md
   - Module tests: modules/<name>/tests/test_<name>.py
   - Adapters: adapters/<name>.py or adapters/<category>/<name>.py
   - Config: pyproject.toml, pyrightconfig.json (project root)

5. **CONTRACT.md FORMAT**:
   ```
   # <Module Name> Contract
   ## Purpose
   One sentence.
   ## Input
   What this module receives (with Python types from domain/models.py).
   ## Output
   What this module produces (with Python types from domain/models.py).
   ## Dependencies
   Which Ports (from domain/ports.py) this module requires.
   ## Constraints
   Rules and invariants.
   ```

6. **DO NOT MODIFY these files** (they are protected):
   - seed.py
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
                        current_tool = block.get("name", "unknown")
                        tool_input_chunks = []

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
                print(f"\n  [executor] Done in {duration/1000:.1f}s, cost: ${cost:.4f}")

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
    1. Protected files not modified
    2. Quality pipeline passes (ruff + pyright)
    3. Tests pass
    4. Architecture rules not violated (domain/ has no external imports)

    Will be replaced by modules/verifier/core.py.
    """
    issues: list[str] = []
    improvements: list[str] = []

    # --- Protected file checks ---
    protected_hashes_before = {
        p: _file_hash(ROOT / p)
        for p in ["seed.py", "VISION.md"]
    }

    current_state = scan_project_state()

    for path, hash_before in protected_hashes_before.items():
        hash_after = _file_hash(ROOT / path)
        if hash_before != hash_after:
            issues.append(f"CRITICAL: {path} was modified by the agent")

    # --- Architecture rule: domain/ has no external imports ---
    domain_violation = check_domain_imports()
    if domain_violation:
        issues.append(f"ARCHITECTURE VIOLATION: {domain_violation}")

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

    new_modules = set(current_state["modules"].keys()) - set(pre_state["modules"].keys())
    if new_modules:
        improvements.append(f"New modules: {', '.join(new_modules)}")

    for name, info in current_state.get("modules", {}).items():
        old_info = pre_state.get("modules", {}).get(name)
        if old_info:
            for field in ["has_contract", "has_spec", "has_core", "has_tests"]:
                if info.get(field) and not old_info.get(field):
                    improvements.append(
                        f"Module '{name}' gained {field.replace('has_', '')}"
                    )

    if not pre_state.get("domain_exists") and current_state.get("domain_exists"):
        improvements.append("domain/ layer created")
    if not pre_state.get("has_pyproject") and current_state.get("has_pyproject"):
        improvements.append("pyproject.toml created")
    if not pre_state.get("has_pyrightconfig") and current_state.get("has_pyrightconfig"):
        improvements.append("pyrightconfig.json created")

    return {
        "passed": len(issues) == 0,
        "issues": issues,
        "improvements": improvements,
        "post_state": current_state,
    }


def check_domain_imports() -> Optional[str]:
    """Check that domain/ only imports from stdlib and typing."""
    if not DOMAIN_DIR.exists():
        return None

    # Known stdlib top-level modules (subset — enough for our purposes)
    stdlib_modules = {
        "abc", "asyncio", "collections", "copy", "dataclasses", "datetime",
        "enum", "functools", "hashlib", "io", "itertools", "json", "logging",
        "math", "os", "pathlib", "re", "secrets", "string", "subprocess",
        "sys", "time", "typing", "typing_extensions", "uuid",
        "__future__",
    }

    for py_file in DOMAIN_DIR.rglob("*.py"):
        # Skip test files — they are allowed to import pytest etc.
        rel_parts = py_file.relative_to(DOMAIN_DIR).parts
        if "tests" in rel_parts or py_file.name.startswith("test_"):
            continue
        try:
            content = py_file.read_text()
        except (IOError, UnicodeDecodeError):
            continue
        for line in content.split("\n"):
            stripped = line.strip()
            if stripped.startswith("import ") or stripped.startswith("from "):
                # Extract the top-level module name
                if stripped.startswith("from .") or stripped.startswith("from domain"):
                    continue  # relative imports within domain/ are fine
                if stripped.startswith("import ."):
                    continue
                parts = stripped.replace("from ", "").replace("import ", "").split()
                if parts:
                    top_module = parts[0].split(".")[0]
                    if top_module not in stdlib_modules and top_module != "domain":
                        return (
                            f"{py_file.relative_to(ROOT)} imports '{top_module}' "
                            f"— domain/ must only use stdlib"
                        )
    return None


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


def check_module_replacement() -> dict:
    """
    Check if any seed functions can be replaced by built modules.
    Returns a dict of {function_name: module_path} for available replacements.
    """
    replacements: dict[str, str] = {}
    module_map = {
        "gap_analyzer": "analyze_gaps",
        "planner": "plan_iteration",
        "executor": "execute_plan",
        "verifier": "verify_iteration",
        "reporter": "record_iteration",
    }

    for module_name, func_name in module_map.items():
        core_file = MODULES_DIR / module_name / "core.py"
        if core_file.exists():
            replacements[func_name] = f"modules/{module_name}/core.py"

    if replacements:
        print(f"[seed] Module replacements available: {list(replacements.keys())}")
        print("[seed] (Dynamic replacement coming in v0.5)")

    return replacements


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

    # Step 0: Check module replacements
    check_module_replacement()

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
        state["status"] = "idle"
        save_state(state)
        return state

    gap_lines = gaps.strip().split("\n")
    print(f"  Found {len(gap_lines)} gap entries")

    # Step 3: Plan + Snapshot
    print("\n[3/5] Planning iteration...")
    prompt = plan_iteration(vision, project_state, gaps, history, state["iteration_count"])
    snapshot_tag = create_snapshot(iteration_id)

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

    if verification["passed"]:
        commit_iteration(iteration_id, report["summary"])
        state["consecutive_failures"] = 0
        state["completed_items"].extend(verification.get("improvements", []))
    else:
        print(f"\n[rollback] Rolling back to {snapshot_tag}")
        rollback_to(snapshot_tag)
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
# Status Display
# ---------------------------------------------------------------------------


def show_status() -> None:
    """Display current project state."""
    state = load_state()
    project_state = scan_project_state()
    vision = VISION_FILE.read_text()
    history = load_history()
    gaps = analyze_gaps(vision, project_state, history)

    print(f"\n{'═'*60}")
    print(f"  🌱 ANIMA — Status")
    print(f"{'═'*60}")
    print(f"\n  Iterations: {state['iteration_count']}")
    print(f"  Status: {state['status']}")
    print(f"  Failures (consecutive): {state['consecutive_failures']}")
    print(f"  Last iteration: {state.get('last_iteration', '—')}")

    print(f"\n  Architecture:")
    print(f"    domain/:          {'✓' if project_state['domain_exists'] else '✗ missing'}")
    print(f"    adapters/:        {'✓' if project_state['adapters_exist'] else '— not yet'}")
    print(f"    kernel/:          {'✓' if project_state['kernel_exists'] else '— not yet'}")
    print(f"    pyproject.toml:   {'✓' if project_state['has_pyproject'] else '✗ missing'}")
    print(f"    pyrightconfig.json: {'✓' if project_state['has_pyrightconfig'] else '✗ missing'}")

    print(f"\n  Modules:")
    if project_state["modules"]:
        for name, info in project_state["modules"].items():
            flags = []
            for field, label in [("has_contract", "contract"), ("has_spec", "spec"),
                                 ("has_core", "core"), ("has_tests", "tests")]:
                flags.append(f"{'✓' if info.get(field) else '✗'}{label}")
            print(f"    {name}: {' '.join(flags)}")
    else:
        print(f"    (none)")

    qr = project_state.get("quality_results", {})
    if qr:
        print(f"\n  Quality Pipeline:")
        for tool in ["ruff_lint", "ruff_format", "pyright"]:
            if qr.get(tool):
                print(f"    {tool}: {'✓' if qr[tool]['passed'] else '✗ failing'}")
            else:
                print(f"    {tool}: — not installed")

    if project_state.get("test_results"):
        tr = project_state["test_results"]
        print(f"\n  Tests: {'✓ passing' if tr['passed'] else '✗ failing'}")

    print(f"\n  Inbox: {len(project_state['inbox_items'])} items")
    for item in project_state["inbox_items"]:
        print(f"    - {item['filename']}")

    gap_count = 0 if gaps == "NO_GAPS" else len(gaps.splitlines())
    print(f"\n  Gaps: {gap_count if gap_count else 'none — system at rest 🌿'}")

    if history:
        print(f"\n  Recent iterations:")
        for h in history[-5:]:
            status = "✓" if h.get("success") else "✗"
            print(f"    [{status}] {h['id']}: {h.get('summary', '—')[:60]}")

    print()


# ---------------------------------------------------------------------------
# Entry Point
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="🌱 Anima Seed — Bootstrap for the Autonomous Iteration Engine"
    )
    parser.add_argument("--loop", action="store_true", help="Run continuous iterations")
    parser.add_argument("--max", type=int, default=0, help="Max iterations in loop mode (0=unlimited)")
    parser.add_argument("--dry-run", action="store_true", help="Preview without executing")
    parser.add_argument("--status", action="store_true", help="Show project state and gaps")
    parser.add_argument("--reset", action="store_true", help="Reset failure count")
    parser.add_argument("--cooldown", type=int, default=ITERATION_COOLDOWN,
                        help=f"Seconds between loop iterations (default: {ITERATION_COOLDOWN})")

    args = parser.parse_args()

    if not VISION_FILE.exists():
        print("ERROR: VISION.md not found. Anima cannot iterate without a vision.")
        sys.exit(1)

    if args.status:
        show_status()
        return

    if args.reset:
        state = load_state()
        state["consecutive_failures"] = 0
        state["status"] = "running"
        save_state(state)
        print("State reset. Anima is ready to iterate.")
        return

    ensure_git()
    for d in [INBOX_DIR, ITERATIONS_DIR, MODULES_DIR]:
        d.mkdir(parents=True, exist_ok=True)

    state = load_state()

    if state["status"] == "paused":
        print("⚠️  Anima is paused due to consecutive failures.")
        print("  python seed.py --status   # see what happened")
        print("  python seed.py --reset    # clear and resume")
        sys.exit(1)

    if args.loop:
        count = 0
        print(f"🌱 Anima entering continuous iteration (cooldown: {args.cooldown}s)")
        if args.max:
            print(f"   Will stop after {args.max} iterations")

        try:
            while True:
                state = run_iteration(state, dry_run=args.dry_run)
                count += 1

                if args.max and count >= args.max:
                    print(f"\nReached max iterations ({args.max}). Stopping.")
                    break
                if state["status"] in ("paused", "idle"):
                    print(f"\nAnima entered '{state['status']}' state. Stopping loop.")
                    break

                print(f"\n⏳ Cooling down {args.cooldown}s...")
                time.sleep(args.cooldown)

        except KeyboardInterrupt:
            print("\n\nInterrupted. State saved.")
            save_state(state)
    else:
        run_iteration(state, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
