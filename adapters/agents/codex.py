"""CodexAdapter — AgentPort implementation for OpenAI Codex CLI.

Invokes the ``codex`` CLI in full-auto mode, captures output,
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


class CodexAdapter:
    """AgentPort implementation that invokes the OpenAI Codex CLI.

    Satisfies ``domain.ports.AgentPort`` via structural subtyping (PEP 544).

    The Codex CLI runs in ``full-auto`` approval mode so no interactive
    prompts block the pipeline.  Output is captured as plain text since
    the Codex CLI does not support structured streaming.
    """

    def __init__(
        self,
        *,
        timeout: int = _DEFAULT_TIMEOUT,
        command: str = "codex",
    ) -> None:
        self._timeout = timeout
        self._command = command

    def execute(self, prompt: str) -> ExecutionResult:
        """Execute a prompt via the Codex CLI and return structured results."""
        logger.info("Calling %s (full-auto)...", self._command)
        start_time = time.time()

        env = dict(os.environ)

        try:
            proc = subprocess.run(
                [
                    self._command,
                    "--full-auto",
                    "--quiet",
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
                    "Install it with: npm install -g @openai/codex"
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
