"""Conformance test: verify wiring.plan_iteration matches CONTRACT.md interface.

Validates that the planner module, wired through
adapters/planner_bridge.py, produces output compatible with
kernel/loop.py and downstream seed functions.

CONTRACT.md requires:
- Input: (state: ProjectState, gaps: GapReport, history: list[IterationRecord],
          iteration_count: int)
  (seed uses dicts/strings, so the bridge accepts those for compatibility)
- Output: str (prompt text — bridge extracts from IterationPlan.prompt)
- Prompt must include: gap list, recent history (last 3), state summary
- Prompt must NOT include full file listings
- Prompt must instruct agent to read SOUL.md, VISION.md, and roadmap
- Prompt must instruct agent to run verification after changes
- Prompt must focus on the single most important gap

Usage:
    pytest tests/conformance/test_plan_iteration.py
"""

from __future__ import annotations

from typing import Any

import wiring
from kernel import seed
from kernel.state import load_history


def _make_project_state(
    *,
    modules: dict[str, Any] | None = None,
    inbox_items: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    """Build a lightweight project_state without running subprocesses."""
    return {
        "files": ["domain/models.py", "wiring.py"],
        "modules": modules or {},
        "domain_exists": True,
        "adapters_exist": True,
        "kernel_exists": True,
        "has_tests": True,
        "has_pyproject": True,
        "has_pyrightconfig": True,
        "inbox_items": inbox_items or [],
        "_protected_hashes": {},
        "quality_results": {},
        "test_results": None,
    }


def test_wiring_resolves_to_callable() -> None:
    """wiring.plan_iteration is a callable."""
    assert callable(wiring.plan_iteration)


def test_wiring_is_not_seed() -> None:
    """wiring.plan_iteration should now point to the module, not seed."""
    assert wiring.plan_iteration is not seed.plan_iteration


def test_wiring_returns_string() -> None:
    """plan_iteration returns a string (prompt text)."""
    state = _make_project_state()
    history = load_history()
    result = wiring.plan_iteration(state, "some gaps", history, 0)
    assert isinstance(result, str)


def test_prompt_contains_gaps() -> None:
    """CONTRACT: prompt must include the gap list."""
    state = _make_project_state()
    result = wiring.plan_iteration(state, "UNCOMPLETED: Build feature X", [], 0)
    assert "GAPS TO ADDRESS:" in result
    assert "UNCOMPLETED: Build feature X" in result


def test_prompt_contains_recent_history() -> None:
    """CONTRACT: prompt must include recent history (last 3 iterations)."""
    state = _make_project_state()
    history = [
        {"success": True, "summary": "iter one"},
        {"success": False, "summary": "iter two"},
        {"success": True, "summary": "iter three"},
        {"success": True, "summary": "iter four"},
    ]
    result = wiring.plan_iteration(state, "gaps", history, 4)
    assert "RECENT ITERATIONS:" in result
    # Only last 3
    assert "iter one" not in result
    assert "iter two" in result
    assert "iter three" in result
    assert "iter four" in result


def test_prompt_contains_state_summary() -> None:
    """CONTRACT: prompt must include a brief state summary."""
    state = _make_project_state(modules={"scanner": {}, "planner": {}})
    result = wiring.plan_iteration(state, "gaps", [], 0)
    assert "STATE SUMMARY:" in result
    assert "scanner" in result
    assert "planner" in result


def test_prompt_no_file_listings() -> None:
    """CONTRACT: prompt must NOT include full file listings."""
    state = _make_project_state()
    result = wiring.plan_iteration(state, "gaps", [], 0)
    assert "domain/models.py" not in result
    assert "wiring.py" not in result


def test_prompt_instructs_read_key_files() -> None:
    """CONTRACT: prompt must instruct agent to read SOUL.md, VISION.md, roadmap."""
    state = _make_project_state()
    result = wiring.plan_iteration(state, "gaps", [], 0)
    assert "SOUL.md" in result
    assert "VISION.md" in result
    assert "roadmap/v" in result


def test_prompt_instructs_verification() -> None:
    """CONTRACT: prompt must instruct agent to run verification after changes."""
    state = _make_project_state()
    result = wiring.plan_iteration(state, "gaps", [], 0)
    assert "ruff check" in result
    assert "pyright" in result
    assert "pytest" in result


def test_prompt_focuses_on_single_step() -> None:
    """CONTRACT: prompt must focus on the single most important gap."""
    state = _make_project_state()
    result = wiring.plan_iteration(state, "gaps", [], 0)
    assert "single most important next step" in result


def test_wiring_matches_seed_structure() -> None:
    """Wiring output has same structural elements as seed output."""
    state = _make_project_state()
    history: list[dict[str, Any]] = [{"success": True, "summary": "did thing"}]
    iteration_count = 3

    seed_result = seed.plan_iteration(state, "test gaps", history, iteration_count)
    wiring_result = wiring.plan_iteration(state, "test gaps", history, iteration_count)

    # Both must contain the same key structural elements
    for marker in [
        "SOUL.md",
        "VISION.md",
        "GAPS TO ADDRESS:",
        "test gaps",
        "RECENT ITERATIONS:",
        "did thing",
        "STATE SUMMARY:",
        "Iteration #4",
        "single most important next step",
    ]:
        assert marker in seed_result, f"Seed missing: {marker}"
        assert marker in wiring_result, f"Wiring missing: {marker}"
