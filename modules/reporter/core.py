"""Reporter module -- Record iteration results as structured JSON log entries.

Replaces kernel.seed.record_iteration with structured output.
See CONTRACT.md for the interface and SPEC.md for the implementation details.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from kernel.console import console

if TYPE_CHECKING:
    from pathlib import Path

logger = logging.getLogger("anima.reporter")


def record(
    iteration_id: str,
    gaps: str,
    execution_result: dict[str, Any],
    verification: dict[str, Any],
    elapsed: float,
    *,
    iterations_dir: Path,
) -> dict[str, Any]:
    """Record iteration results and write a JSON log file.

    Args:
        iteration_id: Unique iteration identifier.
        gaps: Gap analysis text that drove this iteration.
        execution_result: Agent execution output dict.
        verification: Verification results dict.
        elapsed: Total wall-clock seconds.
        iterations_dir: Path to the iterations/ directory.

    Returns:
        A report dict matching the seed record_iteration interface.
    """
    summary = generate_summary(verification)

    report: dict[str, Any] = {
        "id": iteration_id,
        "timestamp": datetime.now(UTC).isoformat(),
        "success": verification["passed"],
        "summary": summary,
        "gaps_addressed": gaps[:1000],
        "improvements": verification.get("improvements", []),
        "issues": verification.get("issues", []),
        "agent_output_excerpt": execution_result.get("output", "")[:1000],
        "elapsed_seconds": elapsed,
        "cost_usd": execution_result.get("cost_usd", 0),
        "total_tokens": execution_result.get("total_tokens", 0),
    }

    # Write JSON log file
    try:
        iterations_dir.mkdir(parents=True, exist_ok=True)
        log_file = iterations_dir / f"{iteration_id}.json"
        log_file.write_text(json.dumps(report, indent=2, ensure_ascii=False))
        logger.info("Wrote iteration log to %s", log_file)
    except OSError:
        logger.error("Failed to write iteration log for %s", iteration_id)

    # CLI output via console
    console.iteration_result(
        iteration_id,
        report["success"],
        elapsed,
        verification.get("improvements", []),
        verification.get("issues", []),
        execution_result.get("cost_usd", 0),
        execution_result.get("total_tokens", 0),
    )

    return report


def generate_summary(verification: dict[str, Any]) -> str:
    """Generate a one-line summary from verification results.

    Rules:
        - If improvements exist: join first 3 with "; ".
        - Else if issues exist: "Failed: {first_issue[:100]}".
        - Else: "No significant changes".
    """
    improvements = verification.get("improvements", [])
    issues = verification.get("issues", [])

    if improvements:
        return "; ".join(improvements[:3])
    if issues:
        return f"Failed: {issues[0][:100]}"
    return "No significant changes"
