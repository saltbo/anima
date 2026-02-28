"""Gate mechanism — risk classification and gate state management.

Classifies iteration plans by risk level. High-risk plans pause
execution until a human approves via ``anima approve``.

v0.6: Initial implementation per SPEC.md.
"""

from __future__ import annotations

import json
import logging
import re
import time
from typing import TYPE_CHECKING

from domain.models import GateDecision, RiskLevel

if TYPE_CHECKING:
    from pathlib import Path

logger = logging.getLogger("anima.gate")

_GATE_FILE = "gate_pending.json"
_BYPASS_FILE = "gate_bypass"

# ---------------------------------------------------------------------------
# Risk classification (pure — no I/O)
# ---------------------------------------------------------------------------

# Patterns that indicate high-risk changes.  Each is a tuple of
# (compiled regex, human-readable indicator label).
_RISK_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (
        re.compile(r"domain/models\.py|domain/ports\.py", re.IGNORECASE),
        "modifies domain types",
    ),
    (
        re.compile(r"\bwiring\.py\b", re.IGNORECASE),
        "modifies wiring.py",
    ),
    (
        re.compile(r"\b(delet|remov)(e|ing)\b.*\bfile", re.IGNORECASE),
        "deletes files",
    ),
    (
        re.compile(
            r"(?<![-\w])rewrite\b.{0,30}\bmodule|restructur|major refactor",
            re.IGNORECASE,
        ),
        "major restructuring",
    ),
)


def classify_risk(prompt: str) -> GateDecision:
    """Classify the risk level of an iteration plan.

    Scans the prompt for high-risk indicators. Returns a ``GateDecision``
    with ``gated=True`` if any indicators match.

    Args:
        prompt: Full agent prompt for the iteration.

    Returns:
        A ``GateDecision`` with risk level and matched indicators.
    """
    indicators: list[str] = []
    for pattern, label in _RISK_PATTERNS:
        if pattern.search(prompt):
            indicators.append(label)

    if indicators:
        logger.info("High-risk indicators detected: %s", indicators)
        return GateDecision(
            gated=True,
            risk_level=RiskLevel.HIGH,
            indicators=tuple(indicators),
        )

    return GateDecision(
        gated=False,
        risk_level=RiskLevel.LOW,
        indicators=(),
    )


# ---------------------------------------------------------------------------
# Gate state management (file I/O)
# ---------------------------------------------------------------------------


def is_gate_pending(anima_dir: Path) -> bool:
    """Check whether a gate approval is pending.

    Args:
        anima_dir: Path to the ``.anima/`` directory.

    Returns:
        True if a gate file exists and is awaiting approval.
    """
    return (anima_dir / _GATE_FILE).exists()


def is_gate_bypassed(anima_dir: Path) -> bool:
    """Check whether a one-time bypass marker exists.

    Args:
        anima_dir: Path to the ``.anima/`` directory.

    Returns:
        True if the bypass marker file exists.
    """
    return (anima_dir / _BYPASS_FILE).exists()


def write_gate(
    anima_dir: Path,
    gaps_summary: str,
    indicators: tuple[str, ...],
) -> None:
    """Write the gate-pending file to pause execution.

    Args:
        anima_dir: Path to the ``.anima/`` directory.
        gaps_summary: Summary of the gaps that triggered gating.
        indicators: Risk indicators that were detected.
    """
    anima_dir.mkdir(parents=True, exist_ok=True)
    gate_path = anima_dir / _GATE_FILE
    data = {
        "gaps_summary": gaps_summary,
        "risk_indicators": list(indicators),
        "timestamp": time.time(),
    }
    gate_path.write_text(json.dumps(data, indent=2))
    logger.info("Gate file written: %s", gate_path)


def read_gate(anima_dir: Path) -> dict[str, object]:
    """Read the gate-pending file contents.

    Args:
        anima_dir: Path to the ``.anima/`` directory.

    Returns:
        Parsed gate data dict, or empty dict if file missing/corrupt.
    """
    gate_path = anima_dir / _GATE_FILE
    try:
        if gate_path.exists():
            data: dict[str, object] = json.loads(gate_path.read_text())
            return data
    except (json.JSONDecodeError, OSError):
        logger.warning("Could not read gate file: %s", gate_path)
    return {}


def clear_gate(anima_dir: Path) -> None:
    """Clear the gate and write a one-time bypass marker.

    Called by ``anima approve``. Removes the gate-pending file and
    writes a bypass marker so the next execution skips risk checking.

    Args:
        anima_dir: Path to the ``.anima/`` directory.
    """
    gate_path = anima_dir / _GATE_FILE
    bypass_path = anima_dir / _BYPASS_FILE

    if gate_path.exists():
        gate_path.unlink()
        logger.info("Gate file cleared: %s", gate_path)

    bypass_path.write_text("")
    logger.info("Bypass marker written: %s", bypass_path)


def consume_bypass(anima_dir: Path) -> bool:
    """Consume the one-time bypass marker if it exists.

    Returns True if the bypass was consumed, False otherwise.

    Args:
        anima_dir: Path to the ``.anima/`` directory.

    Returns:
        True if the bypass marker existed and was removed.
    """
    bypass_path = anima_dir / _BYPASS_FILE
    if bypass_path.exists():
        bypass_path.unlink()
        logger.info("Bypass marker consumed: %s", bypass_path)
        return True
    return False
