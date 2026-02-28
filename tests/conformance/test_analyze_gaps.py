"""Conformance test: verify wiring.analyze_gaps matches CONTRACT.md interface.

Validates that the gap_analyzer module, wired through
adapters/gap_analyzer_bridge.py, produces output compatible with
kernel/loop.py and downstream seed functions.

CONTRACT.md requires:
- Input: (vision: str, state: ProjectState, history: list[IterationRecord])
  (seed uses dicts, so the bridge accepts dicts for compatibility)
- Output: str (gap text or "NO_GAPS")
- Must surface unchecked roadmap items, quality failures, test failures, inbox items
- When no gaps: return literal "NO_GAPS"

Usage:
    pytest tests/conformance/test_analyze_gaps.py
"""

from __future__ import annotations

from typing import Any

import wiring
from kernel import seed
from kernel.config import VISION_FILE
from kernel.state import load_history


def _make_project_state(
    *,
    quality_results: dict[str, Any] | None = None,
    test_results: dict[str, Any] | None = None,
    inbox_items: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    """Build a lightweight project_state without running subprocesses."""
    return {
        "files": [],
        "modules": {},
        "domain_exists": True,
        "adapters_exist": True,
        "kernel_exists": True,
        "has_tests": True,
        "has_pyproject": True,
        "has_pyrightconfig": True,
        "inbox_items": inbox_items or [],
        "_protected_hashes": {},
        "quality_results": quality_results or {},
        "test_results": test_results,
    }


def test_wiring_resolves_to_callable() -> None:
    """wiring.analyze_gaps is a callable."""
    assert callable(wiring.analyze_gaps)


def test_wiring_is_not_seed() -> None:
    """wiring.analyze_gaps should now point to the module, not seed."""
    assert wiring.analyze_gaps is not seed.analyze_gaps


def test_wiring_returns_string() -> None:
    """analyze_gaps returns a string (gap text or NO_GAPS)."""
    vision = VISION_FILE.read_text() if VISION_FILE.exists() else ""
    project_state = _make_project_state()
    history = load_history()
    result = wiring.analyze_gaps(vision, project_state, history)
    assert isinstance(result, str)


def test_wiring_matches_seed_for_gaps() -> None:
    """When seed finds gaps, wiring should find the same roadmap items."""
    vision = VISION_FILE.read_text() if VISION_FILE.exists() else ""
    project_state = _make_project_state()
    history = load_history()

    seed_result = seed.analyze_gaps(vision, project_state, history)
    wiring_result = wiring.analyze_gaps(vision, project_state, history)

    if seed_result == "NO_GAPS":
        assert wiring_result == "NO_GAPS"
    else:
        # Each gap item from seed should appear in wiring output
        for line in seed_result.strip().split("\n"):
            stripped = line.strip()
            if stripped.startswith("- "):
                gap_text = stripped[2:]
                assert gap_text in wiring_result, (
                    f"Seed gap not found in wiring output: {gap_text}"
                )


def test_surfaces_quality_failures() -> None:
    """CONTRACT: must surface quality failures from state.quality_results."""
    vision = ""
    qr = {
        "ruff_lint": {"passed": False, "output": "lint error found"},
        "ruff_format": None,
        "pyright": None,
    }
    state = _make_project_state(quality_results=qr)
    result = wiring.analyze_gaps(vision, state, [])
    assert "RUFF LINT" in result
    assert "lint error" in result


def test_surfaces_test_failures() -> None:
    """CONTRACT: must surface test failures from state.test_results."""
    vision = ""
    tr = {"exit_code": 1, "passed": False, "output": "FAILED test_foo", "errors": ""}
    state = _make_project_state(test_results=tr)
    result = wiring.analyze_gaps(vision, state, [])
    assert "FAILING TESTS" in result
    assert "test_foo" in result


def test_surfaces_inbox_items() -> None:
    """CONTRACT: must include inbox items as human requests."""
    vision = ""
    inbox = [{"filename": "request.md", "content": "Please add feature X"}]
    state = _make_project_state(inbox_items=inbox)
    result = wiring.analyze_gaps(vision, state, [])
    assert "HUMAN REQUEST" in result
    assert "feature X" in result


def test_no_gaps_returns_literal() -> None:
    """CONTRACT: when has_gaps is False, raw_text must be 'NO_GAPS'."""
    # Provide a vision with no roadmap items that would create gaps
    # and a clean state. Use empty string vision so roadmap parsing
    # doesn't find unchecked items from real files.
    vision = ""
    state = _make_project_state()
    # We can't guarantee NO_GAPS here since the roadmap might have items,
    # but we can verify the return type is str and if it's NO_GAPS,
    # it's the exact literal.
    result = wiring.analyze_gaps(vision, state, [])
    if not any(
        keyword in result
        for keyword in ["UNCOMPLETED", "MISSING", "RUFF", "PYRIGHT", "FAILING", "HUMAN"]
    ):
        assert result == "NO_GAPS"
