"""Executor module — delegates iteration plans to an AI agent and collects results.

Validates plans before execution, delegates to an AgentPort, and validates
the results afterward. Enforces protected file constraints at both pre-flight
and post-execution stages.

This module depends only on domain/ types and has zero external imports beyond stdlib.
"""

from __future__ import annotations

import traceback
from typing import TYPE_CHECKING

from domain.models import ExecutionResult, IterationPlan

if TYPE_CHECKING:
    from domain.ports import AgentPort

# Files that Anima must never modify.
_PROTECTED_PATHS: frozenset[str] = frozenset({"seed.py", "VISION.md"})
_PROTECTED_PREFIXES: tuple[str, ...] = ("kernel/",)


def _is_protected(path: str) -> bool:
    """Return True if the path is protected from modification."""
    if path in _PROTECTED_PATHS:
        return True
    return any(path.startswith(prefix) for prefix in _PROTECTED_PREFIXES)


def _plan_targets_protected_file(plan: IterationPlan) -> str | None:
    """Check if any action in the plan targets a protected file.

    Returns the first protected path found, or None if all paths are safe.
    """
    for action in plan.actions:
        for path in action.target_files:
            if _is_protected(path):
                return path
    return None


def _result_contains_protected_file(result: ExecutionResult) -> str | None:
    """Check if any file change in the result touches a protected file.

    Returns the first protected path found, or None if all paths are safe.
    """
    for change in result.files_changed:
        if _is_protected(change.path):
            return change.path
    return None


def _plan_has_target_files(plan: IterationPlan) -> bool:
    """Return True if any action in the plan has non-empty target_files."""
    return any(action.target_files for action in plan.actions)


class Executor:
    """Executes an iteration plan by delegating to an AI coding agent.

    Constructor-injected AgentPort handles all actual code generation.
    The executor validates plans and results but never modifies files directly.
    """

    def __init__(self, agent: AgentPort) -> None:
        self._agent = agent

    def execute(self, plan: IterationPlan) -> ExecutionResult:
        """Execute an iteration plan and return the result.

        Steps:
        1. Pre-flight: reject plans targeting protected files.
        2. Delegate to agent.
        3. Validate the agent's result.
        4. Return the (possibly corrected) result.
        """
        # Step 1: Pre-flight validation.
        protected_path = _plan_targets_protected_file(plan)
        if protected_path is not None:
            return ExecutionResult(
                iteration_id=plan.iteration_id,
                plan=plan,
                files_changed=[],
                agent_output="",
                success=False,
                error_message=f"Plan targets protected file: {protected_path}",
            )

        # Step 2: Delegate to agent.
        try:
            result = self._agent.execute_plan(plan)
        except Exception as exc:
            return ExecutionResult(
                iteration_id=plan.iteration_id,
                plan=plan,
                files_changed=[],
                agent_output=traceback.format_exc(),
                success=False,
                error_message=str(exc),
            )

        # Step 3: Validate result.
        # Ensure iteration_id and plan match.
        if result.iteration_id != plan.iteration_id or result.plan != plan:
            result = ExecutionResult(
                iteration_id=plan.iteration_id,
                plan=plan,
                files_changed=result.files_changed,
                agent_output=result.agent_output,
                success=result.success,
                error_message=result.error_message,
            )

        # Check for protected files in the result.
        protected_in_result = _result_contains_protected_file(result)
        if protected_in_result is not None:
            return ExecutionResult(
                iteration_id=result.iteration_id,
                plan=result.plan,
                files_changed=result.files_changed,
                agent_output=result.agent_output,
                success=False,
                error_message=f"Agent modified protected file: {protected_in_result}",
            )

        # Check for success with no files changed when files were expected.
        if result.success and not result.files_changed and _plan_has_target_files(plan):
            return ExecutionResult(
                iteration_id=result.iteration_id,
                plan=result.plan,
                files_changed=[],
                agent_output=result.agent_output,
                success=False,
                error_message="Agent reported success but no files were changed",
            )

        # Step 4: Return result.
        return result
