"""Bridge adapter: modules.executor.core → seed-compatible interface.

The executor module's Executor.execute() accepts an IterationPlan and
returns an ExecutionResult dataclass.  This bridge constructs the
Executor with the configured agent backend and converts the result
to a dict for compatibility with kernel/loop.py.

Agent selection: reads the ``ANIMA_AGENT`` environment variable
(default ``"claude"``).  Supported values: ``"claude"``, ``"codex"``,
``"gemini"``.
"""

from __future__ import annotations

import logging
import os
from dataclasses import asdict
from typing import TYPE_CHECKING, Any

from domain.models import IterationPlan
from modules.executor.core import Executor

if TYPE_CHECKING:
    from domain.ports import AgentPort

logger = logging.getLogger("anima.executor_bridge")

_AGENT_BACKENDS: dict[str, str] = {
    "claude": "adapters.agents.claude_code.ClaudeCodeAdapter",
    "codex": "adapters.agents.codex.CodexAdapter",
    "gemini": "adapters.agents.gemini.GeminiAdapter",
}


def _resolve_agent() -> AgentPort:
    """Instantiate the agent backend based on ``ANIMA_AGENT`` env var.

    Defaults to ``"claude"`` when the variable is unset or empty.
    """
    backend = os.environ.get("ANIMA_AGENT", "claude").strip().lower() or "claude"
    dotted = _AGENT_BACKENDS.get(backend)
    if dotted is None:
        supported = ", ".join(sorted(_AGENT_BACKENDS))
        msg = f"Unknown agent backend '{backend}'. Supported: {supported}"
        raise ValueError(msg)

    module_path, class_name = dotted.rsplit(".", 1)

    import importlib

    mod = importlib.import_module(module_path)
    cls = getattr(mod, class_name)
    agent: AgentPort = cls()
    logger.info("Using agent backend: %s (%s)", backend, dotted)
    return agent


def execute_plan(prompt: str, dry_run: bool = False) -> dict[str, Any]:
    """Execute a plan using the executor module.

    Matches the seed.execute_plan(prompt, dry_run) signature so
    kernel/loop.py can call it without changes.
    """
    agent = _resolve_agent()
    executor = Executor(agent)

    plan = IterationPlan(
        prompt=prompt,
        iteration_number=0,
        target_version="",
        gaps_summary="",
    )

    result = executor.execute(plan, dry_run=dry_run)
    return asdict(result)
