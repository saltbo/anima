"""Unit tests for modules/gap_analyzer/core.py — validates SPEC.md behavior."""

from __future__ import annotations

from typing import Any
from unittest.mock import patch

from modules.gap_analyzer.core import analyze


def _empty_state(**overrides: Any) -> dict[str, Any]:
    """Minimal project state with no issues."""
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
# SPEC behavior 8: Return NO_GAPS when nothing is found
# ---------------------------------------------------------------------------


@patch("modules.gap_analyzer.core.get_current_version", return_value="99.0")
@patch("modules.gap_analyzer.core.read_roadmap_file", return_value="")
@patch("modules.gap_analyzer.core.parse_roadmap_items", return_value=([], []))
def test_no_gaps_returns_literal(_parse: Any, _read: Any, _ver: Any) -> None:
    """When no gaps exist, analyze returns the literal string 'NO_GAPS'."""
    result = analyze("vision text", _empty_state(), [])
    assert result == "NO_GAPS"


# ---------------------------------------------------------------------------
# SPEC behavior 2-3: Unchecked roadmap items
# ---------------------------------------------------------------------------


@patch("modules.gap_analyzer.core.get_current_version", return_value="0.3")
@patch("modules.gap_analyzer.core.read_roadmap_file", return_value="- [ ] Build X\n- [x] Done Y")
@patch(
    "modules.gap_analyzer.core.parse_roadmap_items",
    return_value=(["Build X"], ["Done Y"]),
)
def test_unchecked_roadmap_items_reported(_parse: Any, _read: Any, _ver: Any) -> None:
    """Unchecked roadmap items appear as gaps with count header."""
    result = analyze("vision", _empty_state(), [])
    assert "UNCOMPLETED ROADMAP ITEMS for v0.3 (1):" in result
    assert "  - Build X" in result


# ---------------------------------------------------------------------------
# SPEC behavior 4: Infrastructure gaps scoped to roadmap
# ---------------------------------------------------------------------------


@patch("modules.gap_analyzer.core.get_current_version", return_value="0.1")
@patch(
    "modules.gap_analyzer.core.read_roadmap_file",
    return_value="Set up domain/ and pyproject.toml and pyrightconfig.json",
)
@patch("modules.gap_analyzer.core.parse_roadmap_items", return_value=([], []))
def test_infrastructure_gaps_when_in_roadmap(_parse: Any, _read: Any, _ver: Any) -> None:
    """Infrastructure gaps are reported if mentioned in the current roadmap."""
    state = _empty_state(domain_exists=False, has_pyproject=False, has_pyrightconfig=False)
    result = analyze("vision", state, [])
    assert "MISSING: domain/ layer" in result
    assert "MISSING: pyproject.toml" in result
    assert "MISSING: pyrightconfig.json" in result


@patch("modules.gap_analyzer.core.get_current_version", return_value="0.3")
@patch(
    "modules.gap_analyzer.core.read_roadmap_file",
    return_value="Replace gap analyzer and planner",
)
@patch("modules.gap_analyzer.core.parse_roadmap_items", return_value=([], []))
def test_infrastructure_gaps_not_reported_when_not_in_roadmap(
    _parse: Any, _read: Any, _ver: Any
) -> None:
    """Infrastructure gaps are NOT reported if not in the current roadmap scope."""
    state = _empty_state(domain_exists=False, has_pyproject=False, has_pyrightconfig=False)
    result = analyze("vision", state, [])
    assert result == "NO_GAPS"


# ---------------------------------------------------------------------------
# SPEC behavior 5: Quality failures
# ---------------------------------------------------------------------------


@patch("modules.gap_analyzer.core.get_current_version", return_value="99.0")
@patch("modules.gap_analyzer.core.read_roadmap_file", return_value="")
@patch("modules.gap_analyzer.core.parse_roadmap_items", return_value=([], []))
def test_ruff_lint_failure_reported(_parse: Any, _read: Any, _ver: Any) -> None:
    """Ruff lint failures appear in the gap report."""
    state = _empty_state(
        quality_results={
            "ruff_lint": {"passed": False, "output": "E501 line too long"},
            "ruff_format": None,
            "pyright": None,
        }
    )
    result = analyze("vision", state, [])
    assert "RUFF LINT FAILURES:" in result
    assert "E501 line too long" in result


@patch("modules.gap_analyzer.core.get_current_version", return_value="99.0")
@patch("modules.gap_analyzer.core.read_roadmap_file", return_value="")
@patch("modules.gap_analyzer.core.parse_roadmap_items", return_value=([], []))
def test_ruff_format_failure_reported(_parse: Any, _read: Any, _ver: Any) -> None:
    """Ruff format failures appear in the gap report."""
    state = _empty_state(
        quality_results={
            "ruff_lint": None,
            "ruff_format": {"passed": False, "output": "Would reformat foo.py"},
            "pyright": None,
        }
    )
    result = analyze("vision", state, [])
    assert "RUFF FORMAT FAILURES:" in result


@patch("modules.gap_analyzer.core.get_current_version", return_value="99.0")
@patch("modules.gap_analyzer.core.read_roadmap_file", return_value="")
@patch("modules.gap_analyzer.core.parse_roadmap_items", return_value=([], []))
def test_pyright_failure_reported(_parse: Any, _read: Any, _ver: Any) -> None:
    """Pyright failures appear in the gap report."""
    state = _empty_state(
        quality_results={
            "ruff_lint": None,
            "ruff_format": None,
            "pyright": {"passed": False, "output": "error: type mismatch"},
        }
    )
    result = analyze("vision", state, [])
    assert "PYRIGHT TYPE ERRORS:" in result


@patch("modules.gap_analyzer.core.get_current_version", return_value="99.0")
@patch("modules.gap_analyzer.core.read_roadmap_file", return_value="")
@patch("modules.gap_analyzer.core.parse_roadmap_items", return_value=([], []))
def test_quality_output_truncated_at_500(_parse: Any, _read: Any, _ver: Any) -> None:
    """Quality output is truncated to 500 characters."""
    long_output = "x" * 1000
    state = _empty_state(
        quality_results={
            "ruff_lint": {"passed": False, "output": long_output},
            "ruff_format": None,
            "pyright": None,
        }
    )
    result = analyze("vision", state, [])
    # The output portion should be at most 500 chars of x's
    assert "x" * 500 in result
    assert "x" * 501 not in result


# ---------------------------------------------------------------------------
# SPEC behavior 6: Test failures
# ---------------------------------------------------------------------------


@patch("modules.gap_analyzer.core.get_current_version", return_value="99.0")
@patch("modules.gap_analyzer.core.read_roadmap_file", return_value="")
@patch("modules.gap_analyzer.core.parse_roadmap_items", return_value=([], []))
def test_test_failure_reported(_parse: Any, _read: Any, _ver: Any) -> None:
    """Test failures appear in the gap report."""
    state = _empty_state(
        test_results={"exit_code": 1, "passed": False, "output": "FAILED test_foo", "errors": ""}
    )
    result = analyze("vision", state, [])
    assert "FAILING TESTS:" in result
    assert "FAILED test_foo" in result


@patch("modules.gap_analyzer.core.get_current_version", return_value="99.0")
@patch("modules.gap_analyzer.core.read_roadmap_file", return_value="")
@patch("modules.gap_analyzer.core.parse_roadmap_items", return_value=([], []))
def test_passing_tests_not_reported(_parse: Any, _read: Any, _ver: Any) -> None:
    """Passing tests do not appear in the gap report."""
    state = _empty_state(
        test_results={"exit_code": 0, "passed": True, "output": "all passed", "errors": ""}
    )
    result = analyze("vision", state, [])
    assert result == "NO_GAPS"


# ---------------------------------------------------------------------------
# SPEC behavior 7: Inbox items
# ---------------------------------------------------------------------------


@patch("modules.gap_analyzer.core.get_current_version", return_value="99.0")
@patch("modules.gap_analyzer.core.read_roadmap_file", return_value="")
@patch("modules.gap_analyzer.core.parse_roadmap_items", return_value=([], []))
def test_inbox_items_reported(_parse: Any, _read: Any, _ver: Any) -> None:
    """Inbox items appear as HUMAN REQUEST gaps."""
    state = _empty_state(
        inbox_items=[{"filename": "fix-bug.md", "content": "Please fix the login bug"}]
    )
    result = analyze("vision", state, [])
    assert "HUMAN REQUEST (fix-bug.md):" in result
    assert "Please fix the login bug" in result


# ---------------------------------------------------------------------------
# Combined gaps
# ---------------------------------------------------------------------------


@patch("modules.gap_analyzer.core.get_current_version", return_value="0.3")
@patch(
    "modules.gap_analyzer.core.read_roadmap_file",
    return_value="- [ ] Task A\n- [ ] Task B",
)
@patch(
    "modules.gap_analyzer.core.parse_roadmap_items",
    return_value=(["Task A", "Task B"], []),
)
def test_multiple_gap_types_combined(_parse: Any, _read: Any, _ver: Any) -> None:
    """Multiple gap types are combined in the output."""
    state = _empty_state(
        quality_results={
            "ruff_lint": {"passed": False, "output": "lint error"},
            "ruff_format": None,
            "pyright": None,
        },
        inbox_items=[{"filename": "req.md", "content": "do thing"}],
    )
    result = analyze("vision", state, [])
    assert "UNCOMPLETED ROADMAP ITEMS" in result
    assert "RUFF LINT FAILURES:" in result
    assert "HUMAN REQUEST" in result


# ---------------------------------------------------------------------------
# Failure pattern annotations (v0.6)
# ---------------------------------------------------------------------------


def _history_record(gaps_addressed: str, success: bool = True) -> dict[str, Any]:
    """Build a minimal history record."""
    return {"gaps_addressed": gaps_addressed, "success": success, "summary": "test"}


@patch("modules.gap_analyzer.core.get_current_version", return_value="0.6")
@patch("modules.gap_analyzer.core.read_roadmap_file", return_value="- [ ] Stuck item")
@patch(
    "modules.gap_analyzer.core.parse_roadmap_items",
    return_value=(["Stuck item"], []),
)
def test_stuck_gap_annotated_reapproach(_parse: Any, _read: Any, _ver: Any) -> None:
    """A gap present in 3+ consecutive iterations (all success) is marked REAPPROACH."""
    history = [
        _history_record("Stuck item"),
        _history_record("Stuck item"),
        _history_record("Stuck item"),
    ]
    result = analyze("vision", _empty_state(), history)
    assert "[STUCK" in result
    assert "try a different approach" in result


@patch("modules.gap_analyzer.core.get_current_version", return_value="0.6")
@patch("modules.gap_analyzer.core.read_roadmap_file", return_value="- [ ] Bad item")
@patch(
    "modules.gap_analyzer.core.parse_roadmap_items",
    return_value=(["Bad item"], []),
)
def test_stuck_gap_annotated_skip(_parse: Any, _read: Any, _ver: Any) -> None:
    """A gap with 2+ failures is marked SKIP."""
    history = [
        _history_record("Bad item", success=False),
        _history_record("Bad item", success=False),
        _history_record("Bad item", success=True),
    ]
    result = analyze("vision", _empty_state(), history)
    assert "[STUCK" in result
    assert "skip this" in result


@patch("modules.gap_analyzer.core.get_current_version", return_value="0.6")
@patch(
    "modules.gap_analyzer.core.read_roadmap_file",
    return_value="- [ ] Fresh item",
)
@patch(
    "modules.gap_analyzer.core.parse_roadmap_items",
    return_value=(["Fresh item"], []),
)
def test_fresh_gap_not_annotated(_parse: Any, _read: Any, _ver: Any) -> None:
    """A gap appearing for the first time has no annotation."""
    result = analyze("vision", _empty_state(), [])
    assert "STUCK" not in result
    assert "  - Fresh item" in result


# ---------------------------------------------------------------------------
# Auto-rewrite trigger (v0.8)
# ---------------------------------------------------------------------------


@patch("modules.gap_analyzer.core.get_current_version", return_value="99.0")
@patch("modules.gap_analyzer.core.read_roadmap_file", return_value="")
@patch("modules.gap_analyzer.core.parse_roadmap_items", return_value=([], []))
def test_degraded_module_triggers_rewrite(_parse: Any, _read: Any, _ver: Any) -> None:
    """A degraded module appears in the gap report as an auto-rewrite trigger."""
    state = _empty_state(
        module_health=[
            {
                "module_name": "executor",
                "score": 0.55,
                "status": "degraded",
                "issues": ["fallback rate: 30% (3/10)"],
            },
        ]
    )
    result = analyze("vision", state, [])
    assert "AUTO-REWRITE TRIGGER" in result
    assert "executor: DEGRADED (score=0.550)" in result
    assert "fallback rate: 30% (3/10)" in result


@patch("modules.gap_analyzer.core.get_current_version", return_value="99.0")
@patch("modules.gap_analyzer.core.read_roadmap_file", return_value="")
@patch("modules.gap_analyzer.core.parse_roadmap_items", return_value=([], []))
def test_critical_module_triggers_rewrite(_parse: Any, _read: Any, _ver: Any) -> None:
    """A critical module appears in the gap report as an auto-rewrite trigger."""
    state = _empty_state(
        module_health=[
            {
                "module_name": "scanner",
                "score": 0.25,
                "status": "critical",
                "issues": ["high fallback rate: 80% (8/10)", "missing: SPEC.md"],
            },
        ]
    )
    result = analyze("vision", state, [])
    assert "AUTO-REWRITE TRIGGER" in result
    assert "scanner: CRITICAL (score=0.250)" in result


@patch("modules.gap_analyzer.core.get_current_version", return_value="99.0")
@patch("modules.gap_analyzer.core.read_roadmap_file", return_value="")
@patch("modules.gap_analyzer.core.parse_roadmap_items", return_value=([], []))
def test_healthy_modules_no_rewrite(_parse: Any, _read: Any, _ver: Any) -> None:
    """Healthy modules do not trigger auto-rewrite."""
    state = _empty_state(
        module_health=[
            {
                "module_name": "scanner",
                "score": 0.85,
                "status": "healthy",
                "issues": [],
            },
        ]
    )
    result = analyze("vision", state, [])
    assert result == "NO_GAPS"


@patch("modules.gap_analyzer.core.get_current_version", return_value="99.0")
@patch("modules.gap_analyzer.core.read_roadmap_file", return_value="")
@patch("modules.gap_analyzer.core.parse_roadmap_items", return_value=([], []))
def test_no_health_data_no_rewrite(_parse: Any, _read: Any, _ver: Any) -> None:
    """When no module_health data is present, no auto-rewrite is triggered."""
    result = analyze("vision", _empty_state(), [])
    assert result == "NO_GAPS"


@patch("modules.gap_analyzer.core.get_current_version", return_value="99.0")
@patch("modules.gap_analyzer.core.read_roadmap_file", return_value="")
@patch("modules.gap_analyzer.core.parse_roadmap_items", return_value=([], []))
def test_multiple_degraded_modules(_parse: Any, _read: Any, _ver: Any) -> None:
    """Multiple degraded modules all appear in the auto-rewrite section."""
    state = _empty_state(
        module_health=[
            {"module_name": "executor", "score": 0.55, "status": "degraded", "issues": []},
            {"module_name": "scanner", "score": 0.30, "status": "critical", "issues": []},
            {"module_name": "planner", "score": 0.85, "status": "healthy", "issues": []},
        ]
    )
    result = analyze("vision", state, [])
    assert "AUTO-REWRITE TRIGGER" in result
    assert "executor: DEGRADED" in result
    assert "scanner: CRITICAL" in result
    assert "planner" not in result
