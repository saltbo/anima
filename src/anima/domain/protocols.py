"""Protocol interfaces for Anima components."""

from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path
from typing import Protocol

from anima.domain.models import (
    AcceptanceResult,
    AgentRole,
    AnimaState,
    StreamEvent,
)


class Agent(Protocol):
    """Interface for an AI agent (Developer or Acceptor)."""

    @property
    def role(self) -> AgentRole:
        """The role of this agent."""
        ...

    async def start(self, project_dir: Path) -> None:
        """Start the agent process."""
        ...

    async def send(self, message: str) -> AsyncIterator[StreamEvent]:
        """Send a message and stream back events."""
        ...

    async def stop(self) -> None:
        """Stop the agent process."""
        ...


class StateStore(Protocol):
    """Interface for state persistence."""

    def load(self, project_dir: Path) -> AnimaState:
        """Load state from disk."""
        ...

    def save(self, project_dir: Path, state: AnimaState) -> None:
        """Save state to disk."""
        ...


class GitOps(Protocol):
    """Interface for git operations."""

    async def current_commit(self, project_dir: Path) -> str:
        """Get the current commit hash."""
        ...

    async def create_branch(self, project_dir: Path, branch_name: str) -> None:
        """Create and checkout a new branch."""
        ...

    async def commit(self, project_dir: Path, message: str) -> str:
        """Stage all and commit. Return the commit hash."""
        ...

    async def reset_last_commit(self, project_dir: Path) -> None:
        """Reset the last commit (soft reset)."""
        ...

    async def merge_to_main(self, project_dir: Path, branch_name: str) -> None:
        """Merge a branch into main."""
        ...

    async def tag(self, project_dir: Path, tag_name: str) -> None:
        """Create a tag at HEAD."""
        ...


class TUICallback(Protocol):
    """Callback interface for the TUI to receive updates."""

    def on_agent_output(self, role: AgentRole, text: str) -> None:
        """Called when an agent produces output."""
        ...

    def on_status_change(self, message: str) -> None:
        """Called when the scheduler status changes."""
        ...

    def on_acceptance(self, result: AcceptanceResult, feedback: str) -> None:
        """Called when the acceptor produces a result."""
        ...

    async def wait_for_human_input(self, prompt: str) -> str:
        """Block until the human provides input via TUI."""
        ...
