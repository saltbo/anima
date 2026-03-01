"""Core data models for Anima."""

from dataclasses import dataclass, field
from enum import Enum


class MilestoneStatus(Enum):
    """Status of a milestone."""

    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class AgentRole(Enum):
    """Role of an agent."""

    DEVELOPER = "developer"
    ACCEPTOR = "acceptor"


class MessageType(Enum):
    """Types of messages in the stream-json protocol."""

    ASSISTANT = "assistant"
    RESULT = "result"
    SYSTEM = "system"


class AcceptanceResult(Enum):
    """Result of an acceptance review."""

    ACCEPTED = "accepted"
    REJECTED = "rejected"


@dataclass
class AgentMessage:
    """A message sent to or received from an agent."""

    role: str
    content: str
    agent_role: AgentRole | None = None


@dataclass
class StreamEvent:
    """A parsed event from Claude CLI stream-json output."""

    type: str
    content: str = ""
    raw: dict[str, object] = field(default_factory=lambda: dict[str, object]())


@dataclass
class MilestoneState:
    """Persistent state for the current iteration."""

    milestone_id: str
    status: MilestoneStatus = MilestoneStatus.PENDING
    branch_name: str = ""
    base_commit: str = ""
    iteration_count: int = 0
    retry_count: int = 0


@dataclass
class AnimaState:
    """Top-level persistent state."""

    current_milestone: str = ""
    milestones: dict[str, MilestoneState] = field(
        default_factory=lambda: dict[str, MilestoneState]()
    )

    def get_milestone(self, milestone_id: str) -> MilestoneState | None:
        """Get a milestone state by ID."""
        return self.milestones.get(milestone_id)

    def set_milestone(self, state: MilestoneState) -> None:
        """Set or update a milestone state."""
        self.milestones[state.milestone_id] = state
