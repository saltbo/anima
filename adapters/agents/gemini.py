"""GeminiAdapter — AgentPort implementation for Gemini CLI.

Invokes the ``gemini`` CLI, feeds the prompt via stdin,
and returns a structured ``ExecutionResult``.
"""

from __future__ import annotations

import logging
import os
import subprocess
import time

from domain.models import ExecutionResult

logger = logging.getLogger("anima.adapters.agents")

_DEFAULT_TIMEOUT = 600  # seconds


class GeminiAdapter:
    """AgentPort implementation that invokes the Gemini CLI.

    Satisfies ``domain.ports.AgentPort`` via structural subtyping (PEP 544).

    The Gemini CLI accepts prompts via stdin and prints results to stdout.
    The ``--sandbox=none`` flag disables sandboxing so that the agent can
    make file-system changes directly, matching the behaviour of the other
    agent backends.
    """

    def __init__(
        self,
        *,
        timeout: int = _DEFAULT_TIMEOUT,
        command: str = "gemini",
    ) -> None:
        self._timeout = timeout
        self._command = command

    def execute(self, prompt: str) -> ExecutionResult:
        """Execute a prompt via the Gemini CLI and return structured results."""
        logger.info("Calling %s ...", self._command)
        start_time = time.time()

        env = dict(os.environ)

        try:
            proc = subprocess.run(
                [
                    self._command,
                    "--sandbox=none",
                    "-p",
                    prompt,
                ],
                cwd=os.getcwd(),
                capture_output=True,
                text=True,
                timeout=self._timeout,
                env=env,
            )
        except FileNotFoundError:
            return ExecutionResult(
                success=False,
                output="",
                errors=(
                    f"Agent command '{self._command}' not found. "
                    "Install the Gemini CLI: npm install -g @anthropic-ai/gemini-cli"
                ),
                exit_code=-1,
                elapsed_seconds=0.0,
            )
        except subprocess.TimeoutExpired:
            elapsed = time.time() - start_time
            return ExecutionResult(
                success=False,
                output="",
                errors=f"Agent timed out after {self._timeout} seconds",
                exit_code=-1,
                elapsed_seconds=round(elapsed, 1),
            )

        elapsed = time.time() - start_time
        stdout = proc.stdout or ""
        stderr = proc.stderr or ""

        return ExecutionResult(
            success=proc.returncode == 0,
            output=stdout[-5000:],
            errors=stderr[-2000:] if stderr else "",
            exit_code=proc.returncode,
            elapsed_seconds=round(elapsed, 1),
        )
