"""Tests for modules/failure_analyzer/core.py — failure pattern detection."""

from __future__ import annotations

from typing import Any

from domain.models import FailureAction
from modules.failure_analyzer.core import analyze_patterns


def _record(
    gaps_addressed: str,
    success: bool = True,
    summary: str = "ok",
) -> dict[str, Any]:
    """Build a minimal iteration record dict."""
    return {
        "gaps_addressed": gaps_addressed,
        "success": success,
        "summary": summary,
    }


# ---------------------------------------------------------------------------
# Empty / trivial inputs
# ---------------------------------------------------------------------------


def test_empty_history_returns_no_patterns() -> None:
    """No history means no patterns to detect."""
    assert analyze_patterns([], ["some gap"]) == ()


def test_empty_gaps_returns_no_patterns() -> None:
    """No current gaps means nothing is stuck."""
    assert analyze_patterns([_record("gap A")], []) == ()


def test_blank_gap_lines_are_skipped() -> None:
    """Whitespace-only gap lines should not produce patterns."""
    history = [_record("gap A")] * 3
    assert analyze_patterns(history, ["", "  ", "\n"]) == ()


# ---------------------------------------------------------------------------
# Below threshold — no pattern
# ---------------------------------------------------------------------------


def test_below_threshold_returns_no_pattern() -> None:
    """A gap appearing fewer than threshold times is not stuck."""
    history = [
        _record("gap A"),
        _record("gap A"),
    ]
    result = analyze_patterns(history, ["gap A"], threshold=3)
    assert result == ()


# ---------------------------------------------------------------------------
# At threshold — pattern detected
# ---------------------------------------------------------------------------


def test_gap_at_threshold_detected() -> None:
    """A gap appearing exactly threshold times triggers detection."""
    history = [
        _record("gap A\ngap B"),
        _record("gap A\ngap B"),
        _record("gap A\ngap B"),
    ]
    result = analyze_patterns(history, ["gap A"], threshold=3)
    assert len(result) == 1
    assert result[0].gap_text == "gap A"
    assert result[0].occurrences == 3
    assert result[0].action == FailureAction.REAPPROACH


def test_failed_attempts_counted() -> None:
    """Failures on records containing the gap are counted."""
    history = [
        _record("gap A", success=False),
        _record("gap A", success=False),
        _record("gap A", success=True),
    ]
    result = analyze_patterns(history, ["gap A"], threshold=3)
    assert len(result) == 1
    assert result[0].failed_attempts == 2
    assert result[0].action == FailureAction.SKIP


def test_skip_action_at_two_failures() -> None:
    """Two or more failures on a stuck gap recommend SKIP."""
    history = [
        _record("gap X", success=False),
        _record("gap X", success=False),
        _record("gap X", success=True),
    ]
    result = analyze_patterns(history, ["gap X"], threshold=3)
    assert result[0].action == FailureAction.SKIP


def test_reapproach_action_with_one_failure() -> None:
    """Only one failure still recommends REAPPROACH."""
    history = [
        _record("gap X", success=False),
        _record("gap X", success=True),
        _record("gap X", success=True),
    ]
    result = analyze_patterns(history, ["gap X"], threshold=3)
    assert result[0].action == FailureAction.REAPPROACH


def test_reapproach_action_with_no_failures() -> None:
    """All successes but gap persists → REAPPROACH."""
    history = [
        _record("gap Z", success=True),
        _record("gap Z", success=True),
        _record("gap Z", success=True),
    ]
    result = analyze_patterns(history, ["gap Z"], threshold=3)
    assert result[0].action == FailureAction.REAPPROACH
    assert result[0].failed_attempts == 0


# ---------------------------------------------------------------------------
# Gap normalization
# ---------------------------------------------------------------------------


def test_leading_dash_stripped_for_matching() -> None:
    """Roadmap items with '- ' prefix match against history."""
    history = [
        _record("Implement feature X"),
        _record("Implement feature X"),
        _record("Implement feature X"),
    ]
    result = analyze_patterns(history, ["- Implement feature X"], threshold=3)
    assert len(result) == 1
    assert result[0].gap_text == "Implement feature X"


def test_whitespace_stripped() -> None:
    """Leading/trailing whitespace is stripped from gap text."""
    history = [
        _record("feature Y"),
        _record("feature Y"),
        _record("feature Y"),
    ]
    result = analyze_patterns(history, ["  feature Y  "], threshold=3)
    assert len(result) == 1
    assert result[0].gap_text == "feature Y"


# ---------------------------------------------------------------------------
# Multiple gaps
# ---------------------------------------------------------------------------


def test_multiple_gaps_detected_independently() -> None:
    """Each current gap is analyzed independently."""
    history = [
        _record("gap A\ngap B"),
        _record("gap A\ngap B"),
        _record("gap A"),
    ]
    result = analyze_patterns(history, ["gap A", "gap B"], threshold=3)
    # gap A appears in all 3, gap B only in 2
    assert len(result) == 1
    assert result[0].gap_text == "gap A"


def test_all_gaps_stuck() -> None:
    """Both gaps stuck should both appear in results."""
    history = [
        _record("gap A\ngap B"),
        _record("gap A\ngap B"),
        _record("gap A\ngap B"),
    ]
    result = analyze_patterns(history, ["gap A", "gap B"], threshold=3)
    assert len(result) == 2
    texts = {p.gap_text for p in result}
    assert texts == {"gap A", "gap B"}


# ---------------------------------------------------------------------------
# Window behavior — only recent history matters
# ---------------------------------------------------------------------------


def test_only_recent_window_examined() -> None:
    """Only the last `threshold` records are examined."""
    old = _record("gap A")
    recent_without = _record("other gap")
    history = [old, old, old, recent_without, recent_without, recent_without]
    # With threshold=3, only the last 3 are checked — gap A not in them
    result = analyze_patterns(history, ["gap A"], threshold=3)
    assert result == ()


def test_window_includes_gap() -> None:
    """Gap present in the recent window is detected."""
    old = _record("other gap")
    recent = _record("gap A")
    history = [old, old, recent, recent, recent]
    result = analyze_patterns(history, ["gap A"], threshold=3)
    assert len(result) == 1


# ---------------------------------------------------------------------------
# Custom threshold
# ---------------------------------------------------------------------------


def test_custom_threshold() -> None:
    """Threshold parameter is respected."""
    history = [_record("gap A")] * 5
    # threshold=5 requires 5 occurrences
    result = analyze_patterns(history, ["gap A"], threshold=5)
    assert len(result) == 1
    assert result[0].occurrences == 5


def test_custom_threshold_below() -> None:
    """Below custom threshold → no pattern."""
    history = [_record("gap A")] * 4
    result = analyze_patterns(history, ["gap A"], threshold=5)
    assert result == ()
