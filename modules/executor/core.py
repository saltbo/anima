"""Executor module — robust agent execution with retry logic.

Delegates prompt execution to an injected ``AgentPort`` and handles
dry-run mode, prompt persistence, and retry with exponential backoff.
"""

from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING

from domain.models import ExecutionResult, IterationPlan
from kernel.config import ROOT

if TYPE_CHECKING:
    from domain.ports import AgentPort

logger = logging.getLogger("anima.executor")


class Executor:
    """Execute iteration plans via an injected agent with retry logic.

    Parameters
    ----------
    agent:
        Any object satisfying ``domain.ports.AgentPort``.
    max_retries:
        Maximum number of retry attempts on transient failure (default 2).
    base_delay:
        Base delay in seconds for exponential backoff (default 2.0).
    """

    def __init__(
        self,
        agent: AgentPort,
        *,
        max_retries: int = 2,
        base_delay: float = 2.0,
    ) -> None:
        self._agent = agent
        self._max_retries = max_retries
        self._base_delay = base_delay

    def execute(self, plan: IterationPlan, dry_run: bool = False) -> ExecutionResult:
        """Execute *plan* through the agent, retrying on transient failures.

        In dry-run mode the prompt is logged but the agent is not invoked.
        """
        if dry_run:
            logger.info("[dry-run] Prompt (%d chars):\n%s", len(plan.prompt), plan.prompt[:3000])
            return ExecutionResult(
                success=True,
                output="(dry run)",
                errors="",
                exit_code=0,
                elapsed_seconds=0.0,
                dry_run=True,
            )

        # Persist prompt for debugging
        prompt_file = ROOT / ".anima" / "current_prompt.txt"
        prompt_file.parent.mkdir(parents=True, exist_ok=True)
        prompt_file.write_text(plan.prompt)

        result = self._execute_with_retry(plan.prompt)
        return result

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _execute_with_retry(self, prompt: str) -> ExecutionResult:
        """Call the agent, retrying up to *max_retries* on transient failure."""
        last_result: ExecutionResult | None = None

        for attempt in range(self._max_retries + 1):
            result = self._agent.execute(prompt)
            last_result = result

            if result.success:
                return result

            # exit_code -1 means agent not found — no point retrying
            if result.exit_code == -1:
                return result

            if attempt < self._max_retries:
                delay = min(self._base_delay * (2**attempt), 30.0)
                logger.warning(
                    "Attempt %d/%d failed (exit %d). Retrying in %.1fs...",
                    attempt + 1,
                    self._max_retries + 1,
                    result.exit_code,
                    delay,
                )
                time.sleep(delay)

        assert last_result is not None
        return last_result
