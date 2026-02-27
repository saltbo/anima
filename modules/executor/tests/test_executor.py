"""Tests for the executor module."""

from __future__ import annotations

from domain.models import (
    ExecutionResult,
    FileChange,
    Gap,
    IterationPlan,
    PlannedAction,
    Priority,
)
from modules.executor.core import Executor


def _make_gap(description: str = "Test gap") -> Gap:
    """Create a test gap."""
    return Gap(
        category="roadmap",
        description=description,
        priority=Priority.HIGH,
        roadmap_version="v0.1",
        evidence="test evidence",
    )


def _make_plan(
    iteration_id: str = "iter-0001",
    actions: list[PlannedAction] | None = None,
) -> IterationPlan:
    """Create a test iteration plan."""
    if actions is None:
        actions = [
            PlannedAction(
                description="Create module",
                target_files=["modules/foo/core.py"],
                action_type="create",
            ),
        ]
    return IterationPlan(
        iteration_id=iteration_id,
        gap=_make_gap(),
        actions=actions,
        acceptance_criteria=["Tests pass"],
        estimated_risk="low",
    )


class FakeAgent:
    """Fake AgentPort that returns a configurable result."""

    def __init__(
        self,
        result: ExecutionResult | None = None,
        *,
        raise_exc: Exception | None = None,
    ) -> None:
        self._result = result
        self._raise_exc = raise_exc
        self.called_with: IterationPlan | None = None

    def execute_plan(self, plan: IterationPlan) -> ExecutionResult:
        """Record the call and return the configured result."""
        self.called_with = plan
        if self._raise_exc is not None:
            raise self._raise_exc
        assert self._result is not None
        return self._result


def _success_result(plan: IterationPlan) -> ExecutionResult:
    """Create a successful execution result for a plan."""
    return ExecutionResult(
        iteration_id=plan.iteration_id,
        plan=plan,
        files_changed=[
            FileChange(
                path="modules/foo/core.py",
                change_type="created",
                diff_summary="new file",
            ),
        ],
        agent_output="Done",
        success=True,
        error_message="",
    )


class TestExecutorValidPlan:
    """Tests for executing a valid plan."""

    def test_delegates_to_agent_and_returns_result(self) -> None:
        """Execute valid plan delegates to AgentPort and returns result."""
        plan = _make_plan()
        expected = _success_result(plan)
        agent = FakeAgent(result=expected)
        executor = Executor(agent=agent)

        result = executor.execute(plan)

        assert agent.called_with == plan
        assert result.success is True
        assert result.files_changed == expected.files_changed
        assert result.iteration_id == plan.iteration_id

    def test_plan_with_no_actions_passes_through(self) -> None:
        """Plan with no actions is passed through to the agent."""
        plan = _make_plan(actions=[])
        expected = ExecutionResult(
            iteration_id=plan.iteration_id,
            plan=plan,
            files_changed=[],
            agent_output="Nothing to do",
            success=True,
            error_message="",
        )
        agent = FakeAgent(result=expected)
        executor = Executor(agent=agent)

        result = executor.execute(plan)

        assert agent.called_with == plan
        assert result.success is True


class TestExecutorProtectedFiles:
    """Tests for protected file enforcement."""

    def test_plan_targeting_seed_py_fails_immediately(self) -> None:
        """Plan targeting seed.py fails without calling agent."""
        plan = _make_plan(
            actions=[
                PlannedAction(
                    description="Modify seed",
                    target_files=["seed.py"],
                    action_type="modify",
                ),
            ],
        )
        agent = FakeAgent()
        executor = Executor(agent=agent)

        result = executor.execute(plan)

        assert result.success is False
        assert "seed.py" in result.error_message
        assert agent.called_with is None  # Agent never called.

    def test_plan_targeting_vision_md_fails_immediately(self) -> None:
        """Plan targeting VISION.md fails without calling agent."""
        plan = _make_plan(
            actions=[
                PlannedAction(
                    description="Edit vision",
                    target_files=["VISION.md"],
                    action_type="modify",
                ),
            ],
        )
        agent = FakeAgent()
        executor = Executor(agent=agent)

        result = executor.execute(plan)

        assert result.success is False
        assert "VISION.md" in result.error_message
        assert agent.called_with is None

    def test_plan_targeting_kernel_fails_immediately(self) -> None:
        """Plan targeting kernel/loop.py fails without calling agent."""
        plan = _make_plan(
            actions=[
                PlannedAction(
                    description="Modify kernel",
                    target_files=["kernel/loop.py"],
                    action_type="modify",
                ),
            ],
        )
        agent = FakeAgent()
        executor = Executor(agent=agent)

        result = executor.execute(plan)

        assert result.success is False
        assert "kernel/loop.py" in result.error_message
        assert agent.called_with is None

    def test_agent_modifies_protected_file_post_execution(self) -> None:
        """Agent returning protected file in files_changed is caught."""
        plan = _make_plan()
        bad_result = ExecutionResult(
            iteration_id=plan.iteration_id,
            plan=plan,
            files_changed=[
                FileChange(
                    path="kernel/config.py",
                    change_type="modified",
                    diff_summary="sneaky change",
                ),
            ],
            agent_output="Done",
            success=True,
            error_message="",
        )
        agent = FakeAgent(result=bad_result)
        executor = Executor(agent=agent)

        result = executor.execute(plan)

        assert result.success is False
        assert "kernel/config.py" in result.error_message


class TestExecutorErrorHandling:
    """Tests for error handling scenarios."""

    def test_agent_raises_exception(self) -> None:
        """Agent exception is caught and returned as failed result."""
        plan = _make_plan()
        agent = FakeAgent(raise_exc=RuntimeError("Agent crashed"))
        executor = Executor(agent=agent)

        result = executor.execute(plan)

        assert result.success is False
        assert "Agent crashed" in result.error_message
        assert result.files_changed == []
        assert result.agent_output  # Should contain traceback.

    def test_agent_success_but_no_files_changed(self) -> None:
        """Agent reports success but no files changed → corrected to failure."""
        plan = _make_plan()  # Has target_files.
        empty_result = ExecutionResult(
            iteration_id=plan.iteration_id,
            plan=plan,
            files_changed=[],
            agent_output="Did nothing",
            success=True,
            error_message="",
        )
        agent = FakeAgent(result=empty_result)
        executor = Executor(agent=agent)

        result = executor.execute(plan)

        assert result.success is False
        assert "no files were changed" in result.error_message


class TestExecutorConsistency:
    """Tests for iteration ID and plan consistency."""

    def test_iteration_id_mismatch_is_corrected(self) -> None:
        """Mismatched iteration_id in result is corrected to plan's ID."""
        plan = _make_plan(iteration_id="iter-0001")
        wrong_id_result = ExecutionResult(
            iteration_id="iter-9999",
            plan=plan,
            files_changed=[
                FileChange(
                    path="modules/foo/core.py",
                    change_type="created",
                    diff_summary="new file",
                ),
            ],
            agent_output="Done",
            success=True,
            error_message="",
        )
        agent = FakeAgent(result=wrong_id_result)
        executor = Executor(agent=agent)

        result = executor.execute(plan)

        assert result.iteration_id == "iter-0001"
        assert result.success is True
