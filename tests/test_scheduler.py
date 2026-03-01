"""Tests for the scheduler loop with mocked agents."""

from collections.abc import AsyncIterator, Callable
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from anima.agent.acceptor import AcceptorAgent
from anima.agent.developer import DeveloperAgent
from anima.domain.models import (
    AcceptanceResult,
    AgentRole,
    StreamEvent,
)
from anima.git.ops import GitOperations
from anima.scheduler.loop import MAX_RETRIES, Scheduler
from anima.state.manager import StateManager


def _make_send(
    *texts: str,
) -> Callable[..., AsyncIterator[StreamEvent]]:
    """Create an async generator function that yields StreamEvents."""

    async def _send(message: str) -> AsyncIterator[StreamEvent]:
        for text in texts:
            yield StreamEvent(type="assistant", content=text)
        yield StreamEvent(type="result", content="")

    return _send


@pytest.fixture
def mock_developer() -> MagicMock:
    dev = MagicMock(spec=DeveloperAgent)
    dev.role = AgentRole.DEVELOPER
    dev.start = AsyncMock()
    dev.stop = AsyncMock()
    # By default, signal completion immediately
    dev.send = _make_send("ALL_FEATURES_COMPLETE")
    return dev


@pytest.fixture
def mock_acceptor() -> MagicMock:
    acc = MagicMock(spec=AcceptorAgent)
    acc.role = AgentRole.ACCEPTOR
    acc.start = AsyncMock()
    acc.stop = AsyncMock()
    acc.send = _make_send("ACCEPTED\nLooks good")
    return acc


@pytest.fixture
def mock_git() -> MagicMock:
    git = MagicMock(spec=GitOperations)
    git.current_commit = AsyncMock(return_value="a" * 40)
    git.create_branch = AsyncMock()
    git.commit = AsyncMock(return_value="b" * 40)
    git.merge_to_main = AsyncMock()
    git.tag = AsyncMock()
    git.reset_last_commit = AsyncMock()
    return git


@pytest.fixture
def mock_tui() -> MagicMock:
    tui = MagicMock()
    tui.on_agent_output = MagicMock()
    tui.on_status_change = MagicMock()
    tui.on_acceptance = MagicMock()
    tui.wait_for_human_input = AsyncMock(return_value="continue")
    return tui


@pytest.fixture
def state_manager(tmp_project: Path) -> StateManager:
    return StateManager()


class TestScheduler:
    async def test_run_milestone_creates_branch(
        self,
        tmp_project: Path,
        mock_developer: MagicMock,
        mock_acceptor: MagicMock,
        mock_git: MagicMock,
        mock_tui: MagicMock,
        state_manager: StateManager,
    ) -> None:
        # Developer signals ALL_FEATURES_COMPLETE immediately
        scheduler = Scheduler(
            project_dir=tmp_project,
            developer=mock_developer,  # type: ignore[arg-type]
            acceptor=mock_acceptor,  # type: ignore[arg-type]
            state_manager=state_manager,
            git_ops=mock_git,  # type: ignore[arg-type]
            tui=mock_tui,
        )

        await scheduler.run_milestone("v0.1", "milestones/v0.1.md")

        # Should create branch, merge to main and tag
        mock_git.create_branch.assert_awaited_once()
        mock_git.merge_to_main.assert_awaited_once()
        mock_git.tag.assert_awaited_once_with(tmp_project, "v0.1")

    async def test_feature_accepted_flow(
        self,
        tmp_project: Path,
        mock_acceptor: MagicMock,
        mock_git: MagicMock,
        mock_tui: MagicMock,
        state_manager: StateManager,
    ) -> None:
        # Developer implements one feature, then signals completion
        call_count = 0

        async def _dev_send(message: str) -> AsyncIterator[StreamEvent]:
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                yield StreamEvent(type="assistant", content="Implemented feature X")
            else:
                # After commit prompt or on next iteration
                if "commit" in message.lower():
                    yield StreamEvent(type="assistant", content="Committed")
                else:
                    yield StreamEvent(type="assistant", content="ALL_FEATURES_COMPLETE")
            yield StreamEvent(type="result", content="")

        mock_developer = MagicMock(spec=DeveloperAgent)
        mock_developer.role = AgentRole.DEVELOPER
        mock_developer.start = AsyncMock()
        mock_developer.stop = AsyncMock()
        mock_developer.send = _dev_send

        scheduler = Scheduler(
            project_dir=tmp_project,
            developer=mock_developer,  # type: ignore[arg-type]
            acceptor=mock_acceptor,  # type: ignore[arg-type]
            state_manager=state_manager,
            git_ops=mock_git,  # type: ignore[arg-type]
            tui=mock_tui,
        )

        await scheduler.run_milestone("v0.1", "milestones/v0.1.md")

        # Acceptance callback should have been called with ACCEPTED
        mock_tui.on_acceptance.assert_called()
        call_args = mock_tui.on_acceptance.call_args
        assert call_args[0][0] == AcceptanceResult.ACCEPTED

    async def test_feature_rejected_retries(
        self,
        tmp_project: Path,
        mock_git: MagicMock,
        mock_tui: MagicMock,
        state_manager: StateManager,
    ) -> None:
        # Developer: implement, then fix, then commit, then ALL_FEATURES_COMPLETE
        dev_call_count = 0

        async def _dev_send(message: str) -> AsyncIterator[StreamEvent]:
            nonlocal dev_call_count
            dev_call_count += 1
            if "commit" in message.lower():
                yield StreamEvent(type="assistant", content="Committed")
            elif dev_call_count == 1:
                yield StreamEvent(type="assistant", content="Implemented feature")
            elif "rejected" in message.lower() or "fix" in message.lower():
                yield StreamEvent(type="assistant", content="Fixed the issues")
            else:
                yield StreamEvent(type="assistant", content="ALL_FEATURES_COMPLETE")
            yield StreamEvent(type="result", content="")

        mock_developer = MagicMock(spec=DeveloperAgent)
        mock_developer.role = AgentRole.DEVELOPER
        mock_developer.start = AsyncMock()
        mock_developer.stop = AsyncMock()
        mock_developer.send = _dev_send

        # Acceptor rejects first, then accepts
        accept_call_count = 0

        async def _accept_stream(message: str) -> AsyncIterator[StreamEvent]:
            nonlocal accept_call_count
            accept_call_count += 1
            if accept_call_count <= 1:
                yield StreamEvent(type="assistant", content="REJECTED\nNeeds tests")
            else:
                yield StreamEvent(type="assistant", content="ACCEPTED\nGood")
            yield StreamEvent(type="result", content="")

        mock_acceptor = MagicMock(spec=AcceptorAgent)
        mock_acceptor.role = AgentRole.ACCEPTOR
        mock_acceptor.start = AsyncMock()
        mock_acceptor.stop = AsyncMock()
        mock_acceptor.send = _accept_stream

        scheduler = Scheduler(
            project_dir=tmp_project,
            developer=mock_developer,  # type: ignore[arg-type]
            acceptor=mock_acceptor,  # type: ignore[arg-type]
            state_manager=state_manager,
            git_ops=mock_git,  # type: ignore[arg-type]
            tui=mock_tui,
        )

        await scheduler.run_milestone("v0.1", "milestones/v0.1.md")

        # Acceptor should have been called at least twice (reject + accept)
        assert accept_call_count >= 2

    async def test_max_retries_pauses_for_human(
        self,
        tmp_project: Path,
        mock_git: MagicMock,
        mock_tui: MagicMock,
        state_manager: StateManager,
    ) -> None:
        # Developer: implement, then fixes, then commit, then ALL_FEATURES_COMPLETE
        dev_call_count = 0

        async def _dev_send(message: str) -> AsyncIterator[StreamEvent]:
            nonlocal dev_call_count
            dev_call_count += 1
            if "commit" in message.lower():
                yield StreamEvent(type="assistant", content="Committed")
            elif dev_call_count == 1:
                yield StreamEvent(type="assistant", content="Implemented feature")
            elif "human feedback" in message.lower():
                yield StreamEvent(type="assistant", content="Fixed with human guidance")
            elif "rejected" in message.lower() or "fix" in message.lower():
                yield StreamEvent(type="assistant", content="Trying to fix")
            else:
                yield StreamEvent(type="assistant", content="ALL_FEATURES_COMPLETE")
            yield StreamEvent(type="result", content="")

        mock_developer = MagicMock(spec=DeveloperAgent)
        mock_developer.role = AgentRole.DEVELOPER
        mock_developer.start = AsyncMock()
        mock_developer.stop = AsyncMock()
        mock_developer.send = _dev_send

        # Acceptor rejects MAX_RETRIES times, then accepts after human input
        reject_count = 0

        async def _reject_then_accept(message: str) -> AsyncIterator[StreamEvent]:
            nonlocal reject_count
            reject_count += 1
            if reject_count <= MAX_RETRIES:
                yield StreamEvent(type="assistant", content="REJECTED\nStill wrong")
            else:
                yield StreamEvent(type="assistant", content="ACCEPTED\nOK now")
            yield StreamEvent(type="result", content="")

        mock_acceptor = MagicMock(spec=AcceptorAgent)
        mock_acceptor.role = AgentRole.ACCEPTOR
        mock_acceptor.start = AsyncMock()
        mock_acceptor.stop = AsyncMock()
        mock_acceptor.send = _reject_then_accept

        scheduler = Scheduler(
            project_dir=tmp_project,
            developer=mock_developer,  # type: ignore[arg-type]
            acceptor=mock_acceptor,  # type: ignore[arg-type]
            state_manager=state_manager,
            git_ops=mock_git,  # type: ignore[arg-type]
            tui=mock_tui,
        )

        await scheduler.run_milestone("v0.1", "milestones/v0.1.md")

        # Should have asked for human input
        mock_tui.wait_for_human_input.assert_awaited_once()

    async def test_is_running_flag(
        self,
        tmp_project: Path,
        mock_developer: MagicMock,
        mock_acceptor: MagicMock,
        mock_git: MagicMock,
        mock_tui: MagicMock,
        state_manager: StateManager,
    ) -> None:
        scheduler = Scheduler(
            project_dir=tmp_project,
            developer=mock_developer,  # type: ignore[arg-type]
            acceptor=mock_acceptor,  # type: ignore[arg-type]
            state_manager=state_manager,
            git_ops=mock_git,  # type: ignore[arg-type]
            tui=mock_tui,
        )

        assert not scheduler.is_running
        await scheduler.run_milestone("v0.1", "milestones/v0.1.md")
        assert not scheduler.is_running  # Should be false after completion
