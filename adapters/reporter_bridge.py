"""Bridge adapter: modules.reporter.core → seed-compatible dict interface.

Converts the call from kernel/loop.py (which passes seed-style arguments)
to the reporter module's record() function.
"""

from __future__ import annotations

from typing import Any

from kernel.config import ITERATIONS_DIR
from modules.reporter.core import record


def record_iteration(
    iteration_id: str,
    gaps: str,
    execution_result: dict[str, Any],
    verification: dict[str, Any],
    elapsed: float,
) -> dict[str, Any]:
    """Record iteration results using the reporter module.

    Matches the seed.record_iteration signature so kernel/loop.py
    can call it without changes.
    """
    return record(
        iteration_id=iteration_id,
        gaps=gaps,
        execution_result=execution_result,
        verification=verification,
        elapsed=elapsed,
        iterations_dir=ITERATIONS_DIR,
    )
