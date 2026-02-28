"""Adapter: PytestRunner implements TestRunnerPort.

Runs the project test suite via subprocess and returns a structured TestResult.
"""

from __future__ import annotations

import logging
import subprocess
from typing import TYPE_CHECKING

from domain.models import TestResult

if TYPE_CHECKING:
    from pathlib import Path

logger = logging.getLogger("anima.adapters")


class PytestRunner:
    """Concrete implementation of TestRunnerPort using pytest."""

    def __init__(self, root: Path) -> None:
        """Initialise with the project root directory.

        Args:
            root: Absolute path to the project root.
        """
        self._root = root

    def run_tests(self) -> TestResult:
        """Run the test suite using pytest and return results.

        Returns:
            A TestResult with exit code, pass/fail status, stdout, and stderr.
        """
        try:
            result = subprocess.run(
                [
                    "python",
                    "-m",
                    "pytest",
                    "--cov",
                    "--cov-fail-under=80",
                    "--tb=short",
                    "-q",
                ],
                cwd=self._root,
                capture_output=True,
                text=True,
                timeout=120,
            )
            return TestResult(
                exit_code=result.returncode,
                passed=result.returncode == 0,
                output=result.stdout[-2000:] if result.stdout else "",
                errors=result.stderr[-2000:] if result.stderr else "",
            )
        except FileNotFoundError:
            logger.warning("pytest not found")
            return TestResult(exit_code=1, passed=False, output="", errors="pytest not found")
        except subprocess.TimeoutExpired:
            logger.warning("pytest timed out after 120s")
            return TestResult(exit_code=1, passed=False, output="", errors="pytest timed out")
