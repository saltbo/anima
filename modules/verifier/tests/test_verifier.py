"""Tests for the verifier module."""

from __future__ import annotations

from domain.models import (
    ExecutionResult,
    Gap,
    IterationPlan,
    PlannedAction,
    Priority,
    QualityResult,
    VerificationStatus,
)
from modules.verifier.core import Verifier


def _make_execution_result() -> ExecutionResult:
    """Create a minimal execution result for testing."""
    gap = Gap(
        category="roadmap",
        description="Test gap",
        priority=Priority.HIGH,
        roadmap_version="v0.1",
        evidence="test evidence",
    )
    plan = IterationPlan(
        iteration_id="iter-0001",
        gap=gap,
        actions=[
            PlannedAction(
                description="Create module",
                target_files=["modules/foo/core.py"],
                action_type="create",
            ),
        ],
        acceptance_criteria=["Tests pass"],
        estimated_risk="low",
    )
    return ExecutionResult(
        iteration_id="iter-0001",
        plan=plan,
        files_changed=[],
        agent_output="Done",
        success=True,
        error_message="",
    )


class FakeLinter:
    """Fake LinterPort with configurable results."""

    def __init__(
        self,
        lint_result: QualityResult | None = None,
        typecheck_result: QualityResult | None = None,
        *,
        lint_exc: Exception | None = None,
        typecheck_exc: Exception | None = None,
    ) -> None:
        self._lint_result = lint_result
        self._typecheck_result = typecheck_result
        self._lint_exc = lint_exc
        self._typecheck_exc = typecheck_exc

    def run_lint(self) -> QualityResult:
        """Return configured lint result or raise."""
        if self._lint_exc is not None:
            raise self._lint_exc
        assert self._lint_result is not None
        return self._lint_result

    def run_typecheck(self) -> QualityResult:
        """Return configured typecheck result or raise."""
        if self._typecheck_exc is not None:
            raise self._typecheck_exc
        assert self._typecheck_result is not None
        return self._typecheck_result


class FakeTestRunner:
    """Fake TestRunnerPort with configurable results."""

    def __init__(
        self,
        result: QualityResult | None = None,
        *,
        raise_exc: Exception | None = None,
    ) -> None:
        self._result = result
        self._raise_exc = raise_exc

    def run_tests(self) -> QualityResult:
        """Return configured test result or raise."""
        if self._raise_exc is not None:
            raise self._raise_exc
        assert self._result is not None
        return self._result


def _passing_lint() -> QualityResult:
    return QualityResult(tool="ruff", passed=True, output="All checks passed.", error_count=0)


def _passing_typecheck() -> QualityResult:
    return QualityResult(tool="pyright", passed=True, output="0 errors.", error_count=0)


def _passing_tests() -> QualityResult:
    return QualityResult(tool="pytest", passed=True, output="10 passed.", error_count=0)


def _failing_lint() -> QualityResult:
    return QualityResult(
        tool="ruff",
        passed=False,
        output="domain/models.py:1: E302 expected 2 blank lines\nadapters/local_fs.py:5: F401 unused import",
        error_count=2,
    )


def _failing_typecheck() -> QualityResult:
    return QualityResult(
        tool="pyright",
        passed=False,
        output="modules/foo/core.py:10: error: Argument missing\nmodules/foo/core.py:20: error: Type mismatch",
        error_count=2,
    )


def _failing_tests() -> QualityResult:
    return QualityResult(
        tool="pytest",
        passed=False,
        output="FAILED test_foo.py::test_bar - AssertionError\nFAILED test_foo.py::test_baz - TypeError",
        error_count=2,
    )


class TestVerifierAllPass:
    """Tests for the case when all stages pass."""

    def test_all_stages_pass(self) -> None:
        """All stages passing yields all_passed=True."""
        linter = FakeLinter(lint_result=_passing_lint(), typecheck_result=_passing_typecheck())
        test_runner = FakeTestRunner(result=_passing_tests())
        verifier = Verifier(linter=linter, test_runner=test_runner)

        report = verifier.verify("iter-0001", _make_execution_result())

        assert report.all_passed is True
        assert report.iteration_id == "iter-0001"
        assert len(report.stages) == 3
        assert all(s.status == VerificationStatus.PASSED for s in report.stages)
        assert "All 3" in report.summary
        assert "passed" in report.summary

    def test_stage_order_is_lint_typecheck_tests(self) -> None:
        """Stages always run in lint → typecheck → tests order."""
        linter = FakeLinter(lint_result=_passing_lint(), typecheck_result=_passing_typecheck())
        test_runner = FakeTestRunner(result=_passing_tests())
        verifier = Verifier(linter=linter, test_runner=test_runner)

        report = verifier.verify("iter-0001", _make_execution_result())

        assert report.stages[0].stage == "lint"
        assert report.stages[1].stage == "typecheck"
        assert report.stages[2].stage == "tests"

    def test_passed_stages_have_empty_details(self) -> None:
        """Passing stages have no detail lines."""
        linter = FakeLinter(lint_result=_passing_lint(), typecheck_result=_passing_typecheck())
        test_runner = FakeTestRunner(result=_passing_tests())
        verifier = Verifier(linter=linter, test_runner=test_runner)

        report = verifier.verify("iter-0001", _make_execution_result())

        for stage in report.stages:
            assert stage.details == []


class TestVerifierPartialFailure:
    """Tests for when some stages fail."""

    def test_lint_fails_others_still_run(self) -> None:
        """Lint failure does not prevent typecheck and tests from running."""
        linter = FakeLinter(lint_result=_failing_lint(), typecheck_result=_passing_typecheck())
        test_runner = FakeTestRunner(result=_passing_tests())
        verifier = Verifier(linter=linter, test_runner=test_runner)

        report = verifier.verify("iter-0001", _make_execution_result())

        assert report.all_passed is False
        assert report.stages[0].status == VerificationStatus.FAILED
        assert report.stages[1].status == VerificationStatus.PASSED
        assert report.stages[2].status == VerificationStatus.PASSED
        assert "lint" in report.summary

    def test_failed_stage_has_details(self) -> None:
        """Failed lint stage populates details from output."""
        linter = FakeLinter(lint_result=_failing_lint(), typecheck_result=_passing_typecheck())
        test_runner = FakeTestRunner(result=_passing_tests())
        verifier = Verifier(linter=linter, test_runner=test_runner)

        report = verifier.verify("iter-0001", _make_execution_result())

        lint_stage = report.stages[0]
        assert len(lint_stage.details) == 2

    def test_typecheck_fails_alone(self) -> None:
        """Only typecheck failing sets all_passed=False."""
        linter = FakeLinter(lint_result=_passing_lint(), typecheck_result=_failing_typecheck())
        test_runner = FakeTestRunner(result=_passing_tests())
        verifier = Verifier(linter=linter, test_runner=test_runner)

        report = verifier.verify("iter-0001", _make_execution_result())

        assert report.all_passed is False
        assert report.stages[0].status == VerificationStatus.PASSED
        assert report.stages[1].status == VerificationStatus.FAILED
        assert report.stages[2].status == VerificationStatus.PASSED
        assert "typecheck" in report.summary


class TestVerifierAllFail:
    """Tests for when all stages fail."""

    def test_all_stages_fail(self) -> None:
        """All stages failing reports all three failures."""
        linter = FakeLinter(lint_result=_failing_lint(), typecheck_result=_failing_typecheck())
        test_runner = FakeTestRunner(result=_failing_tests())
        verifier = Verifier(linter=linter, test_runner=test_runner)

        report = verifier.verify("iter-0001", _make_execution_result())

        assert report.all_passed is False
        assert all(s.status == VerificationStatus.FAILED for s in report.stages)
        assert "lint" in report.summary
        assert "typecheck" in report.summary
        assert "tests" in report.summary


class TestVerifierExceptionHandling:
    """Tests for port exceptions."""

    def test_linter_exception_produces_failed_stage(self) -> None:
        """Linter exception is caught and produces a FAILED stage result."""
        linter = FakeLinter(
            typecheck_result=_passing_typecheck(),
            lint_exc=RuntimeError("ruff crashed"),
        )
        test_runner = FakeTestRunner(result=_passing_tests())
        verifier = Verifier(linter=linter, test_runner=test_runner)

        report = verifier.verify("iter-0001", _make_execution_result())

        assert report.all_passed is False
        assert report.stages[0].status == VerificationStatus.FAILED
        assert "ruff crashed" in report.stages[0].output
        # Other stages still ran.
        assert report.stages[1].status == VerificationStatus.PASSED
        assert report.stages[2].status == VerificationStatus.PASSED

    def test_typecheck_exception_produces_failed_stage(self) -> None:
        """Typecheck exception is caught without crashing."""
        linter = FakeLinter(
            lint_result=_passing_lint(),
            typecheck_exc=RuntimeError("pyright crashed"),
        )
        test_runner = FakeTestRunner(result=_passing_tests())
        verifier = Verifier(linter=linter, test_runner=test_runner)

        report = verifier.verify("iter-0001", _make_execution_result())

        assert report.stages[1].status == VerificationStatus.FAILED
        assert "pyright crashed" in report.stages[1].output

    def test_test_runner_exception_produces_failed_stage(self) -> None:
        """Test runner exception is caught without crashing."""
        linter = FakeLinter(lint_result=_passing_lint(), typecheck_result=_passing_typecheck())
        test_runner = FakeTestRunner(raise_exc=RuntimeError("pytest crashed"))
        verifier = Verifier(linter=linter, test_runner=test_runner)

        report = verifier.verify("iter-0001", _make_execution_result())

        assert report.stages[2].status == VerificationStatus.FAILED
        assert "pytest crashed" in report.stages[2].output
        # Earlier stages still passed.
        assert report.stages[0].status == VerificationStatus.PASSED
        assert report.stages[1].status == VerificationStatus.PASSED


class TestVerifierSummary:
    """Tests for summary generation."""

    def test_summary_includes_failed_stage_names(self) -> None:
        """Summary lists failed stage names."""
        linter = FakeLinter(lint_result=_failing_lint(), typecheck_result=_failing_typecheck())
        test_runner = FakeTestRunner(result=_passing_tests())
        verifier = Verifier(linter=linter, test_runner=test_runner)

        report = verifier.verify("iter-0001", _make_execution_result())

        assert "Failed stages: lint, typecheck" in report.summary

    def test_summary_includes_error_counts(self) -> None:
        """Summary includes per-stage error/failure counts."""
        linter = FakeLinter(lint_result=_failing_lint(), typecheck_result=_passing_typecheck())
        test_runner = FakeTestRunner(result=_passing_tests())
        verifier = Verifier(linter=linter, test_runner=test_runner)

        report = verifier.verify("iter-0001", _make_execution_result())

        assert "lint: 2 errors" in report.summary
        assert "typecheck: 0 errors" in report.summary
        assert "tests: 0 failures" in report.summary
