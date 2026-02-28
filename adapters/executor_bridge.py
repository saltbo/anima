"""Bridge adapter: modules.executor.core → seed-compatible interface.

The executor module's Executor.execute() accepts an IterationPlan and
returns an ExecutionResult dataclass.  This bridge constructs the
Executor with a ClaudeCodeAdapter and converts the result to a dict
for compatibility with kernel/loop.py.
"""

from __future__ import annotations

from dataclasses import asdict
from typing import Any

from adapters.agents.claude_code import ClaudeCodeAdapter
from domain.models import IterationPlan
from modules.executor.core import Executor


def execute_plan(prompt: str, dry_run: bool = False) -> dict[str, Any]:
    """Execute a plan using the executor module.

    Matches the seed.execute_plan(prompt, dry_run) signature so
    kernel/loop.py can call it without changes.
    """
    agent = ClaudeCodeAdapter()
    executor = Executor(agent)

    plan = IterationPlan(
        prompt=prompt,
        iteration_number=0,
        target_version="",
        gaps_summary="",
    )

    result = executor.execute(plan, dry_run=dry_run)
    return asdict(result)
