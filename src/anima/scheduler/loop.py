"""Core iteration loop: milestone -> feature -> Developer-Acceptor cycle."""

import logging
from pathlib import Path

from anima.agent.acceptor import AcceptorAgent, parse_acceptance
from anima.agent.developer import DeveloperAgent, parse_completion
from anima.domain.models import (
    AcceptanceResult,
    MilestoneState,
    MilestoneStatus,
)
from anima.domain.protocols import TUICallback
from anima.git.ops import GitOperations
from anima.state.manager import StateManager

logger = logging.getLogger(__name__)

MAX_RETRIES = 3


class Scheduler:
    """Orchestrates the Developer-Acceptor iteration loop."""

    def __init__(
        self,
        project_dir: Path,
        developer: DeveloperAgent,
        acceptor: AcceptorAgent,
        state_manager: StateManager,
        git_ops: GitOperations,
        tui: TUICallback,
    ) -> None:
        self._project_dir = project_dir
        self._developer = developer
        self._acceptor = acceptor
        self._state = state_manager
        self._git = git_ops
        self._tui = tui
        self._running = False

    @property
    def is_running(self) -> bool:
        return self._running

    async def run_milestone(self, milestone_id: str, milestone_file: str) -> None:
        """Run the full iteration loop for a milestone."""
        self._running = True
        try:
            await self._run_milestone_impl(milestone_id, milestone_file)
        finally:
            self._running = False

    async def _run_milestone_impl(self, milestone_id: str, milestone_file: str) -> None:
        """Internal implementation of the milestone loop."""
        current_state = self._state.load(self._project_dir)

        # Get or create milestone state
        ms = current_state.get_milestone(milestone_id)
        if ms is None:
            base_commit = await self._git.current_commit(self._project_dir)
            branch_name = f"milestone/{milestone_id}"
            ms = MilestoneState(
                milestone_id=milestone_id,
                status=MilestoneStatus.IN_PROGRESS,
                branch_name=branch_name,
                base_commit=base_commit,
            )
            current_state.set_milestone(ms)
            current_state.current_milestone = milestone_id
            self._state.save(self._project_dir, current_state)

            # Create milestone branch
            await self._git.create_branch(self._project_dir, branch_name)
            self._tui.on_status_change(
                f"Created branch {branch_name} for milestone {milestone_id}"
            )

        # Start agents
        await self._developer.start(self._project_dir)
        await self._acceptor.start(self._project_dir)

        try:
            await self._feature_loop(ms, milestone_file)
        finally:
            await self._developer.stop()
            await self._acceptor.stop()

    async def _feature_loop(self, ms: MilestoneState, milestone_file: str) -> None:
        """Run the Developer-Acceptor loop driven by Developer signals."""
        while True:
            self._tui.on_status_change(
                f"[Scheduler] Starting feature iteration "
                f"(iteration={ms.iteration_count})"
            )

            # Step 1: Ask Developer to implement next feature
            dev_prompt = (
                f"Read the milestone file at {milestone_file} and "
                f"implement the next feature. Iteration {ms.iteration_count}. "
                f"Implement ONE feature, write tests, run verification "
                f"(ruff check . && pyright && pytest). "
                f"If all features in the milestone are already complete, "
                f"reply with ALL_FEATURES_COMPLETE."
            )

            logger.info("Sending dev prompt (%d chars)", len(dev_prompt))
            dev_response = await self._collect_agent_output(self._developer, dev_prompt)
            logger.info(
                "Dev response (%d chars): %.200s", len(dev_response), dev_response
            )

            # Step 2: Check for completion signal
            if parse_completion(dev_response):
                self._tui.on_status_change(
                    "[Scheduler] Developer signaled ALL_FEATURES_COMPLETE"
                )
                break

            # Step 3-5: Acceptance loop for the current feature
            await self._acceptance_loop(ms, milestone_file, dev_response)

            # Save state after each iteration
            current_state = self._state.load(self._project_dir)
            current_state.set_milestone(ms)
            self._state.save(self._project_dir, current_state)

        # Milestone complete
        ms.status = MilestoneStatus.COMPLETED
        current_state = self._state.load(self._project_dir)
        current_state.set_milestone(ms)
        self._state.save(self._project_dir, current_state)

        # Merge to main and tag
        await self._git.merge_to_main(self._project_dir, ms.branch_name)
        await self._git.tag(self._project_dir, ms.milestone_id)
        self._tui.on_status_change(
            f"[Scheduler] Milestone {ms.milestone_id} completed, merged and tagged"
        )

    async def _acceptance_loop(
        self, ms: MilestoneState, milestone_file: str, dev_response: str
    ) -> None:
        """Inner loop: send to Acceptor, handle ACCEPTED/REJECTED."""
        while True:
            # Step 3: Ask Acceptor to review
            accept_prompt = (
                f"The Developer has completed work on a feature for milestone "
                f"'{ms.milestone_id}'. Review the changes against the milestone "
                f"file at {milestone_file}. "
                f"Developer's report:\n\n{dev_response}"
            )

            accept_response = await self._collect_agent_output(
                self._acceptor, accept_prompt
            )

            result, feedback = parse_acceptance(accept_response)
            self._tui.on_acceptance(result, feedback)

            if result == AcceptanceResult.ACCEPTED:
                # Step 4: Feature accepted - tell developer to commit
                commit_prompt = (
                    "Your work has been accepted. Please stage all changes "
                    "and commit with a descriptive conventional commit message."
                )
                await self._collect_agent_output(self._developer, commit_prompt)

                ms.iteration_count += 1
                ms.retry_count = 0

                self._tui.on_status_change("[Scheduler] Feature accepted and committed")
                break
            else:
                # Step 5: Feature rejected
                ms.retry_count += 1
                if ms.retry_count >= MAX_RETRIES:
                    self._tui.on_status_change(
                        f"[Scheduler] Retry limit ({MAX_RETRIES}) reached. "
                        f"Pausing for human input."
                    )
                    human_input = await self._tui.wait_for_human_input(
                        f"Developer-Acceptor cycle exceeded {MAX_RETRIES} retries. "
                        f"Feedback: {feedback}\n"
                        f"Please provide guidance:"
                    )
                    # Send human feedback to developer and use as new dev_response
                    dev_response = await self._collect_agent_output(
                        self._developer, f"Human feedback: {human_input}"
                    )
                    ms.retry_count = 0
                else:
                    # Send rejection feedback to developer and use as new dev_response
                    retry_prompt = (
                        f"Your implementation was rejected. Feedback:\n{feedback}\n"
                        f"Please fix the issues. Retry {ms.retry_count}/{MAX_RETRIES}."
                    )
                    dev_response = await self._collect_agent_output(
                        self._developer, retry_prompt
                    )

    async def _collect_agent_output(
        self,
        agent: DeveloperAgent | AcceptorAgent,
        message: str,
    ) -> str:
        """Send a message to an agent and collect all output text."""
        parts: list[str] = []
        async for event in agent.send(message):
            if event.content:
                self._tui.on_agent_output(agent.role, event.content)
            # Only collect assistant/result content for the response string;
            # user events (tool results) are display-only.
            if event.type in ("assistant", "result") and event.content:
                parts.append(event.content)
        return "".join(parts)

    def stop(self) -> None:
        """Signal the scheduler to stop."""
        self._running = False
