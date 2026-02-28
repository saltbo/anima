"""Tests for modules/reporter/core.py — validates SPEC.md behavior.

Usage:
    pytest modules/reporter/tests/test_reporter.py
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from pathlib import Path

from modules.reporter.core import generate_summary, record


def _make_verification(
    passed: bool = True,
    improvements: list[str] | None = None,
    issues: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "passed": passed,
        "improvements": improvements or [],
        "issues": issues or [],
    }


def _make_execution(
    output: str = "agent did things",
    cost_usd: float = 0.05,
    total_tokens: int = 1000,
) -> dict[str, Any]:
    return {
        "output": output,
        "cost_usd": cost_usd,
        "total_tokens": total_tokens,
    }


# --- Summary generation ---


def test_summary_with_improvements() -> None:
    v = _make_verification(improvements=["Added X", "Fixed Y", "Removed Z", "Extra"])
    assert generate_summary(v) == "Added X; Fixed Y; Removed Z"


def test_summary_with_issues_only() -> None:
    v = _make_verification(passed=False, issues=["Something broke badly"])
    assert generate_summary(v) == "Failed: Something broke badly"


def test_summary_issue_truncation() -> None:
    long_issue = "x" * 200
    v = _make_verification(passed=False, issues=[long_issue])
    summary = generate_summary(v)
    assert summary == f"Failed: {long_issue[:100]}"
    assert len(summary) <= 108  # "Failed: " + 100 chars


def test_summary_no_changes() -> None:
    v = _make_verification()
    assert generate_summary(v) == "No significant changes"


# --- Record building ---


def test_record_returns_dict_with_all_fields(tmp_path: Path) -> None:
    result = record(
        iteration_id="0001-20260227-120000",
        gaps="some gaps here",
        execution_result=_make_execution(),
        verification=_make_verification(improvements=["New files: 3"]),
        elapsed=42.5,
        iterations_dir=tmp_path / "iterations",
    )

    assert result["id"] == "0001-20260227-120000"
    assert "timestamp" in result
    assert result["success"] is True
    assert result["summary"] == "New files: 3"
    assert result["gaps_addressed"] == "some gaps here"
    assert result["improvements"] == ["New files: 3"]
    assert result["issues"] == []
    assert result["agent_output_excerpt"] == "agent did things"
    assert result["elapsed_seconds"] == 42.5
    assert result["cost_usd"] == 0.05
    assert result["total_tokens"] == 1000


def test_record_writes_json_file(tmp_path: Path) -> None:
    iterations_dir = tmp_path / "iterations"
    record(
        iteration_id="0002-20260227-130000",
        gaps="gaps",
        execution_result=_make_execution(),
        verification=_make_verification(),
        elapsed=10.0,
        iterations_dir=iterations_dir,
    )

    log_file = iterations_dir / "0002-20260227-130000.json"
    assert log_file.exists()

    data = json.loads(log_file.read_text())
    assert data["id"] == "0002-20260227-130000"
    assert data["elapsed_seconds"] == 10.0


def test_record_creates_iterations_dir(tmp_path: Path) -> None:
    iterations_dir = tmp_path / "nested" / "iterations"
    assert not iterations_dir.exists()

    record(
        iteration_id="0003-test",
        gaps="",
        execution_result=_make_execution(),
        verification=_make_verification(),
        elapsed=1.0,
        iterations_dir=iterations_dir,
    )

    assert iterations_dir.exists()


def test_record_truncates_gaps(tmp_path: Path) -> None:
    long_gaps = "g" * 2000
    result = record(
        iteration_id="0004-test",
        gaps=long_gaps,
        execution_result=_make_execution(),
        verification=_make_verification(),
        elapsed=1.0,
        iterations_dir=tmp_path / "iterations",
    )

    assert len(result["gaps_addressed"]) == 1000


def test_record_truncates_agent_output(tmp_path: Path) -> None:
    long_output = "o" * 2000
    result = record(
        iteration_id="0005-test",
        gaps="",
        execution_result=_make_execution(output=long_output),
        verification=_make_verification(),
        elapsed=1.0,
        iterations_dir=tmp_path / "iterations",
    )

    assert len(result["agent_output_excerpt"]) == 1000


def test_record_defaults_cost_and_tokens(tmp_path: Path) -> None:
    result = record(
        iteration_id="0006-test",
        gaps="",
        execution_result={"output": "done"},
        verification=_make_verification(),
        elapsed=1.0,
        iterations_dir=tmp_path / "iterations",
    )

    assert result["cost_usd"] == 0
    assert result["total_tokens"] == 0


def test_record_json_is_human_readable(tmp_path: Path) -> None:
    iterations_dir = tmp_path / "iterations"
    record(
        iteration_id="0007-test",
        gaps="gaps with unicode: café ☕",
        execution_result=_make_execution(),
        verification=_make_verification(),
        elapsed=1.0,
        iterations_dir=iterations_dir,
    )

    raw = (iterations_dir / "0007-test.json").read_text()
    # Indented (not compact)
    assert "\n" in raw
    # Non-ASCII preserved (ensure_ascii=False)
    assert "café" in raw
    assert "☕" in raw
