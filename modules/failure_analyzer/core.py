"""Failure pattern analysis for iteration history.

Detects repeated failures on the same gap so the system can skip
stuck gaps or suggest alternative approaches.

v0.6: Initial implementation per SPEC.md.
"""

from __future__ import annotations

import logging
from typing import Any

from domain.models import FailureAction, FailurePattern

logger = logging.getLogger("anima.failure_analyzer")

# Minimum failed attempts before recommending SKIP instead of REAPPROACH.
_SKIP_FAILURE_THRESHOLD = 2


def _normalize_gap(gap: str) -> str:
    """Strip whitespace and leading list markers for matching."""
    text = gap.strip()
    if text.startswith("- "):
        text = text[2:]
    return text


def _gap_present_in_record(gap_normalized: str, record_gaps: str) -> bool:
    """Check if a gap text appears anywhere in a record's gaps_addressed."""
    return gap_normalized in record_gaps


def analyze_patterns(
    history: list[dict[str, Any]],
    current_gaps: list[str],
    *,
    threshold: int = 3,
) -> tuple[FailurePattern, ...]:
    """Detect failure patterns for current gaps by scanning history.

    Args:
        history: Past iteration records (dicts with ``gaps_addressed``,
            ``success``, ``summary`` keys).
        current_gaps: Individual gap text lines from the current analysis.
        threshold: Consecutive-appearance count before a gap is "stuck".

    Returns:
        Tuple of ``FailurePattern`` for gaps exceeding the threshold.
    """
    if not history or not current_gaps:
        return ()

    # Only look at the most recent window of iterations.
    window = history[-threshold:]
    patterns: list[FailurePattern] = []

    for gap in current_gaps:
        normalized = _normalize_gap(gap)
        if not normalized:
            continue

        occurrences = 0
        failed_attempts = 0

        for record in window:
            record_gaps = record.get("gaps_addressed", "")
            if _gap_present_in_record(normalized, record_gaps):
                occurrences += 1
                if not record.get("success", True):
                    failed_attempts += 1

        if occurrences < threshold:
            continue

        # Gap has persisted for >= threshold iterations — it's stuck.
        if failed_attempts >= _SKIP_FAILURE_THRESHOLD:
            action = FailureAction.SKIP
        else:
            action = FailureAction.REAPPROACH

        patterns.append(
            FailurePattern(
                gap_text=normalized,
                occurrences=occurrences,
                failed_attempts=failed_attempts,
                action=action,
            )
        )
        logger.debug(
            "  Failure pattern: %r — %d occurrences, %d failures → %s",
            normalized[:60],
            occurrences,
            failed_attempts,
            action.value,
        )

    if patterns:
        logger.info("  Detected %d stuck gap(s) in history", len(patterns))

    return tuple(patterns)
