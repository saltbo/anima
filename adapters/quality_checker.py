"""Adapter: RuffPyrightChecker implements LinterPort.

Runs ruff lint, ruff format check, and pyright via subprocess,
returning an aggregated QualityReport.
"""

from __future__ import annotations

import logging
import subprocess
from typing import TYPE_CHECKING

from domain.models import QualityCheckResult, QualityReport

if TYPE_CHECKING:
    from pathlib import Path

logger = logging.getLogger("anima.adapters")


class RuffPyrightChecker:
    """Concrete implementation of LinterPort using ruff and pyright."""

    def __init__(self, root: Path) -> None:
        """Initialise with the project root directory.

        Args:
            root: Absolute path to the project root.
        """
        self._root = root

    def check(self) -> QualityReport:
        """Run all quality checks and return aggregated results.

        Runs ruff lint, ruff format --check, and pyright sequentially.

        Returns:
            A QualityReport with results from each check tool.
        """
        ruff_lint = self._run_check(["ruff", "check", "."])
        ruff_format = self._run_check(["ruff", "format", "--check", "."])
        pyright = self._run_check(["pyright"], timeout=120)
        return QualityReport(
            ruff_lint=ruff_lint,
            ruff_format=ruff_format,
            pyright=pyright,
        )

    def _run_check(
        self,
        cmd: list[str],
        timeout: int = 60,
    ) -> QualityCheckResult | None:
        """Run a single quality check command.

        Args:
            cmd: Command and arguments to execute.
            timeout: Maximum seconds before timeout.

        Returns:
            A QualityCheckResult, or None if the tool is unavailable or timed out.
        """
        try:
            result = subprocess.run(
                cmd,
                cwd=self._root,
                capture_output=True,
                text=True,
                timeout=timeout,
            )
            return QualityCheckResult(
                passed=result.returncode == 0,
                output=(result.stdout + result.stderr)[-1000:],
            )
        except FileNotFoundError:
            logger.warning("Tool not found: %s", cmd[0])
            return None
        except subprocess.TimeoutExpired:
            logger.warning("Tool timed out: %s", cmd[0])
            return None
