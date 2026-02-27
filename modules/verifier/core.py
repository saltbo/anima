"""Verifier module — runs the full quality pipeline and produces a verification report.

Runs lint, typecheck, and tests in fixed order. All stages always run regardless
of earlier failures. Produces a VerificationReport with per-stage results.

This module depends only on domain/ types and has zero external imports beyond stdlib.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from domain.models import StageResult, VerificationReport, VerificationStatus

if TYPE_CHECKING:
    from domain.models import ExecutionResult
    from domain.ports import LinterPort, TestRunnerPort


def _build_summary(stages: list[StageResult]) -> str:
    """Build a human-readable summary from stage results."""
    failed_stages = [s for s in stages if s.status == VerificationStatus.FAILED]
    if not failed_stages:
        return f"All {len(stages)} verification stages passed."

    failed_names = ", ".join(s.stage for s in failed_stages)
    detail_parts: list[str] = []
    for stage in stages:
        count = len(stage.details)
        label = "failures" if stage.stage == "tests" else "errors"
        detail_parts.append(f"{stage.stage}: {count} {label}")
    return f"Failed stages: {failed_names}. {', '.join(detail_parts)}."


def _extract_details(output: str) -> list[str]:
    """Extract non-empty, meaningful lines from tool output."""
    return [line for line in output.strip().splitlines() if line.strip()]


class Verifier:
    """Runs the verification pipeline and produces a VerificationReport.

    Constructor-injected LinterPort and TestRunnerPort handle all actual
    tool execution. The verifier orchestrates the stages and assembles results.
    """

    def __init__(self, linter: LinterPort, test_runner: TestRunnerPort) -> None:
        self._linter = linter
        self._test_runner = test_runner

    def verify(
        self,
        iteration_id: str,
        execution_result: ExecutionResult,
    ) -> VerificationReport:
        """Run all verification stages and produce a report.

        All stages run regardless of earlier failures so the report
        captures every problem, not just the first.
        """
        stages: list[StageResult] = [
            self._run_lint(),
            self._run_typecheck(),
            self._run_tests(),
        ]

        return VerificationReport(
            iteration_id=iteration_id,
            stages=stages,
            all_passed=all(s.status == VerificationStatus.PASSED for s in stages),
            summary=_build_summary(stages),
        )

    def _run_lint(self) -> StageResult:
        """Run lint stage, catching exceptions."""
        try:
            result = self._linter.run_lint()
        except Exception as exc:
            return StageResult(
                stage="lint",
                status=VerificationStatus.FAILED,
                output=str(exc),
                details=[str(exc)],
            )
        return StageResult(
            stage="lint",
            status=VerificationStatus.PASSED if result.passed else VerificationStatus.FAILED,
            output=result.output,
            details=_extract_details(result.output) if not result.passed else [],
        )

    def _run_typecheck(self) -> StageResult:
        """Run typecheck stage, catching exceptions."""
        try:
            result = self._linter.run_typecheck()
        except Exception as exc:
            return StageResult(
                stage="typecheck",
                status=VerificationStatus.FAILED,
                output=str(exc),
                details=[str(exc)],
            )
        return StageResult(
            stage="typecheck",
            status=VerificationStatus.PASSED if result.passed else VerificationStatus.FAILED,
            output=result.output,
            details=_extract_details(result.output) if not result.passed else [],
        )

    def _run_tests(self) -> StageResult:
        """Run tests stage, catching exceptions."""
        try:
            result = self._test_runner.run_tests()
        except Exception as exc:
            return StageResult(
                stage="tests",
                status=VerificationStatus.FAILED,
                output=str(exc),
                details=[str(exc)],
            )
        return StageResult(
            stage="tests",
            status=VerificationStatus.PASSED if result.passed else VerificationStatus.FAILED,
            output=result.output,
            details=_extract_details(result.output) if not result.passed else [],
        )
