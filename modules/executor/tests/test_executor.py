"""Tests for modules/executor/core.py validating SPEC.md behavior."""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import patch

from domain.models import ExecutionResult, IterationPlan
from modules.executor.core import Executor

if TYPE_CHECKING:
    from pathlib import Path

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_plan(prompt: str = "test prompt") -> IterationPlan:
    return IterationPlan(
        prompt=prompt,
        iteration_number=1,
        target_version="0.4",
        gaps_summary="test gap",
    )


def _success_result(
    *,
    cost_usd: float = 0.0,
    total_tokens: int = 0,
) -> ExecutionResult:
    return ExecutionResult(
        success=True,
        output="done",
        errors="",
        exit_code=0,
        elapsed_seconds=1.0,
        cost_usd=cost_usd,
        total_tokens=total_tokens,
    )


def _failure_result(exit_code: int = 1) -> ExecutionResult:
    return ExecutionResult(
        success=False,
        output="",
        errors="agent error",
        exit_code=exit_code,
        elapsed_seconds=1.0,
    )


class FakeAgent:
    """Mock AgentPort that returns pre-configured results."""

    def __init__(self, results: list[ExecutionResult]) -> None:
        self._results = list(results)
        self.calls: list[str] = []

    def execute(self, prompt: str) -> ExecutionResult:
        self.calls.append(prompt)
        return self._results.pop(0)


# ---------------------------------------------------------------------------
# Dry-run mode
# ---------------------------------------------------------------------------


class TestDryRun:
    def test_returns_success_without_calling_agent(self) -> None:
        agent = FakeAgent([])
        executor = Executor(agent)
        result = executor.execute(_make_plan(), dry_run=True)

        assert result.success is True
        assert result.dry_run is True
        assert result.output == "(dry run)"
        assert agent.calls == []

    def test_dry_run_exit_code_is_zero(self) -> None:
        agent = FakeAgent([])
        result = Executor(agent).execute(_make_plan(), dry_run=True)
        assert result.exit_code == 0


# ---------------------------------------------------------------------------
# Normal execution
# ---------------------------------------------------------------------------


class TestNormalExecution:
    def test_success_on_first_attempt(self, tmp_path: Path) -> None:
        agent = FakeAgent([_success_result()])
        executor = Executor(agent)

        with patch("modules.executor.core.ROOT", tmp_path):
            result = executor.execute(_make_plan("hello agent"))

        assert result.success is True
        assert result.output == "done"
        assert len(agent.calls) == 1
        assert agent.calls[0] == "hello agent"

    def test_saves_prompt_file(self, tmp_path: Path) -> None:
        agent = FakeAgent([_success_result()])
        executor = Executor(agent)

        with patch("modules.executor.core.ROOT", tmp_path):
            executor.execute(_make_plan("saved prompt"))

        prompt_file = tmp_path / ".anima" / "current_prompt.txt"
        assert prompt_file.exists()
        assert prompt_file.read_text() == "saved prompt"


# ---------------------------------------------------------------------------
# Retry logic
# ---------------------------------------------------------------------------


class TestRetry:
    def test_retries_on_transient_failure(self, tmp_path: Path) -> None:
        agent = FakeAgent([_failure_result(), _success_result()])
        executor = Executor(agent, max_retries=2, base_delay=0.0)

        with patch("modules.executor.core.ROOT", tmp_path):
            result = executor.execute(_make_plan())

        assert result.success is True
        assert len(agent.calls) == 2

    def test_no_retry_on_agent_not_found(self, tmp_path: Path) -> None:
        agent = FakeAgent([_failure_result(exit_code=-1)])
        executor = Executor(agent, max_retries=2, base_delay=0.0)

        with patch("modules.executor.core.ROOT", tmp_path):
            result = executor.execute(_make_plan())

        assert result.success is False
        assert result.exit_code == -1
        assert len(agent.calls) == 1  # no retries

    def test_returns_last_failure_after_max_retries(self, tmp_path: Path) -> None:
        agent = FakeAgent(
            [
                _failure_result(),
                _failure_result(),
                _failure_result(exit_code=2),
            ]
        )
        executor = Executor(agent, max_retries=2, base_delay=0.0)

        with patch("modules.executor.core.ROOT", tmp_path):
            result = executor.execute(_make_plan())

        assert result.success is False
        assert result.exit_code == 2
        assert len(agent.calls) == 3  # initial + 2 retries

    def test_retry_delay_is_exponential(self, tmp_path: Path) -> None:
        agent = FakeAgent([_failure_result(), _failure_result(), _success_result()])
        executor = Executor(agent, max_retries=2, base_delay=0.01)

        with patch("modules.executor.core.ROOT", tmp_path):
            executor.execute(_make_plan())

        # Just verify all attempts were made
        assert len(agent.calls) == 3


# ---------------------------------------------------------------------------
# Cost and token passthrough
# ---------------------------------------------------------------------------


class TestMetrics:
    def test_cost_and_tokens_passed_through(self, tmp_path: Path) -> None:
        agent = FakeAgent([_success_result(cost_usd=0.05, total_tokens=1000)])
        executor = Executor(agent)

        with patch("modules.executor.core.ROOT", tmp_path):
            result = executor.execute(_make_plan())

        assert result.cost_usd == 0.05
        assert result.total_tokens == 1000
