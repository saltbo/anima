"""Unit tests for modules/planner/core.py — validates SPEC.md behavior."""

from __future__ import annotations

from typing import Any
from unittest.mock import patch

from domain.models import IterationPlan
from modules.planner.core import plan


def _empty_state(**overrides: Any) -> dict[str, Any]:
    """Minimal project state."""
    base: dict[str, Any] = {
        "files": [],
        "modules": {},
        "domain_exists": True,
        "adapters_exist": True,
        "kernel_exists": True,
        "has_tests": True,
        "has_pyproject": True,
        "has_pyrightconfig": True,
        "inbox_items": [],
        "quality_results": {},
        "test_results": None,
        "_protected_hashes": {},
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# SPEC behavior 5: Returns IterationPlan dataclass
# ---------------------------------------------------------------------------


@patch("modules.planner.core.get_current_version", return_value="0.3")
def test_returns_iteration_plan(_ver: Any) -> None:
    """plan() returns an IterationPlan dataclass."""
    result = plan(_empty_state(), "some gaps", [], 5)
    assert isinstance(result, IterationPlan)


# ---------------------------------------------------------------------------
# SPEC behavior 5: iteration_number = iteration_count + 1
# ---------------------------------------------------------------------------


@patch("modules.planner.core.get_current_version", return_value="0.3")
def test_iteration_number_is_count_plus_one(_ver: Any) -> None:
    """iteration_number is iteration_count + 1."""
    result = plan(_empty_state(), "gaps", [], 7)
    assert result.iteration_number == 8


# ---------------------------------------------------------------------------
# SPEC behavior 5: target_version from get_current_version
# ---------------------------------------------------------------------------


@patch("modules.planner.core.get_current_version", return_value="0.5")
def test_target_version_from_roadmap(_ver: Any) -> None:
    """target_version matches get_current_version()."""
    result = plan(_empty_state(), "gaps", [], 0)
    assert result.target_version == "0.5"


# ---------------------------------------------------------------------------
# SPEC behavior 5: gaps_summary truncated at 200 chars
# ---------------------------------------------------------------------------


@patch("modules.planner.core.get_current_version", return_value="0.3")
def test_gaps_summary_short_text(_ver: Any) -> None:
    """Short gap text appears fully in gaps_summary."""
    result = plan(_empty_state(), "Fix the bug", [], 0)
    assert result.gaps_summary == "Fix the bug"


@patch("modules.planner.core.get_current_version", return_value="0.3")
def test_gaps_summary_truncated_with_ellipsis(_ver: Any) -> None:
    """Gap text longer than 200 chars is truncated with '...'."""
    long_gaps = "x" * 300
    result = plan(_empty_state(), long_gaps, [], 0)
    assert len(result.gaps_summary) == 203  # 200 + "..."
    assert result.gaps_summary.endswith("...")


# ---------------------------------------------------------------------------
# SPEC behavior 2: Prompt contains instructions to read key files
# ---------------------------------------------------------------------------


@patch("modules.planner.core.get_current_version", return_value="0.3")
def test_prompt_contains_file_instructions(_ver: Any) -> None:
    """Prompt instructs agent to read SOUL.md, VISION.md, and roadmap."""
    result = plan(_empty_state(), "gaps", [], 0)
    assert "SOUL.md" in result.prompt
    assert "VISION.md" in result.prompt
    assert "roadmap/v0.3.md" in result.prompt


# ---------------------------------------------------------------------------
# SPEC behavior 2: Prompt contains iteration number and version
# ---------------------------------------------------------------------------


@patch("modules.planner.core.get_current_version", return_value="0.3")
def test_prompt_contains_iteration_info(_ver: Any) -> None:
    """Prompt includes iteration number and target version."""
    result = plan(_empty_state(), "gaps", [], 4)
    assert "Iteration #5" in result.prompt
    assert "v0.3" in result.prompt


# ---------------------------------------------------------------------------
# SPEC behavior 2: Prompt contains gaps
# ---------------------------------------------------------------------------


@patch("modules.planner.core.get_current_version", return_value="0.3")
def test_prompt_contains_gaps(_ver: Any) -> None:
    """Prompt includes the gap text under GAPS TO ADDRESS."""
    result = plan(_empty_state(), "UNCOMPLETED: Build feature X", [], 0)
    assert "GAPS TO ADDRESS:" in result.prompt
    assert "UNCOMPLETED: Build feature X" in result.prompt


# ---------------------------------------------------------------------------
# SPEC behavior 2: Prompt contains recent history (last 3)
# ---------------------------------------------------------------------------


@patch("modules.planner.core.get_current_version", return_value="0.3")
def test_prompt_contains_recent_history(_ver: Any) -> None:
    """Prompt includes last 3 iteration summaries."""
    history = [
        {"success": True, "summary": "Added module A"},
        {"success": False, "summary": "Failed lint"},
        {"success": True, "summary": "Fixed lint"},
        {"success": True, "summary": "Added module B"},
    ]
    result = plan(_empty_state(), "gaps", history, 4)
    assert "RECENT ITERATIONS:" in result.prompt
    # Only last 3 should appear
    assert "Added module A" not in result.prompt
    assert "Failed lint" in result.prompt
    assert "Fixed lint" in result.prompt
    assert "Added module B" in result.prompt


@patch("modules.planner.core.get_current_version", return_value="0.3")
def test_prompt_no_history_section_when_empty(_ver: Any) -> None:
    """No RECENT ITERATIONS section when history is empty."""
    result = plan(_empty_state(), "gaps", [], 0)
    assert "RECENT ITERATIONS:" not in result.prompt


# ---------------------------------------------------------------------------
# SPEC behavior 2: Prompt contains state summary
# ---------------------------------------------------------------------------


@patch("modules.planner.core.get_current_version", return_value="0.3")
def test_prompt_contains_state_summary(_ver: Any) -> None:
    """Prompt includes module list, domain status, test status, inbox count."""
    state = _empty_state(
        modules={"scanner": {}, "planner": {}},
        domain_exists=True,
        has_tests=True,
        inbox_items=[{"filename": "req.md", "content": "do thing"}],
    )
    result = plan(state, "gaps", [], 0)
    assert "STATE SUMMARY:" in result.prompt
    assert "scanner" in result.prompt
    assert "planner" in result.prompt
    assert "exists" in result.prompt
    assert "1 items" in result.prompt


# ---------------------------------------------------------------------------
# SPEC behavior 3: State summary must NOT include full file listings
# ---------------------------------------------------------------------------


@patch("modules.planner.core.get_current_version", return_value="0.3")
def test_prompt_no_file_listings(_ver: Any) -> None:
    """Prompt does not contain full file paths from state.files."""
    state = _empty_state(files=["domain/models.py", "wiring.py", "modules/planner/core.py"])
    result = plan(state, "gaps", [], 0)
    assert "domain/models.py" not in result.prompt
    assert "wiring.py" not in result.prompt
    assert "modules/planner/core.py" not in result.prompt


# ---------------------------------------------------------------------------
# SPEC behavior 2: Prompt contains execution and verification instructions
# ---------------------------------------------------------------------------


@patch("modules.planner.core.get_current_version", return_value="0.3")
def test_prompt_contains_action_instructions(_ver: Any) -> None:
    """Prompt instructs agent to execute and verify."""
    result = plan(_empty_state(), "gaps", [], 0)
    assert "Execute the single most important next step" in result.prompt
    assert "ruff check" in result.prompt
    assert "pyright" in result.prompt
    assert "pytest" in result.prompt


# ---------------------------------------------------------------------------
# SPEC behavior 2: History pass/fail markers
# ---------------------------------------------------------------------------


@patch("modules.planner.core.get_current_version", return_value="0.3")
def test_history_markers(_ver: Any) -> None:
    """Passing iterations get checkmark, failing get cross."""
    history = [
        {"success": True, "summary": "passed iter"},
        {"success": False, "summary": "failed iter"},
    ]
    result = plan(_empty_state(), "gaps", history, 2)
    assert "[\u2713] passed iter" in result.prompt
    assert "[\u2717] failed iter" in result.prompt
