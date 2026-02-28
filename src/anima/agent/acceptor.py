"""Acceptor agent — reviews and validates feature implementations."""

from collections.abc import AsyncIterator
from pathlib import Path

from anima.agent.claude_adapter import ClaudeAdapter
from anima.domain.models import AcceptanceResult, AgentRole, StreamEvent

ACCEPTOR_SYSTEM_PROMPT = """\
You are the Acceptor agent of Anima, an autonomous iteration engine.

Your role:
- Review feature implementations against the milestone acceptance criteria.
- You do NOT run code or tests — focus purely on functional review.
- Check: Does the implementation satisfy the milestone requirements?
- Check: Is the code well-structured and maintainable?
- Check: Are there any obvious bugs or missing edge cases?

Response format:
- Start your response with either ACCEPTED or REJECTED on the first line.
- Follow with a brief explanation.
- If REJECTED, provide specific, actionable feedback for the Developer.

Example:
ACCEPTED
The TUI implementation correctly renders the status bar and stream panel.
All required features from the milestone are addressed.

Example:
REJECTED
The scheduler loop does not handle the retry limit. When Developer-Acceptor
cycle exceeds 3 retries, it should pause and wait for human input.
"""


def parse_acceptance(text: str) -> tuple[AcceptanceResult, str]:
    """Parse an acceptor response into result and feedback."""
    text = text.strip()
    lines = text.split("\n", 1)
    first_line = lines[0].strip().upper()
    feedback = lines[1].strip() if len(lines) > 1 else ""

    if "ACCEPTED" in first_line:
        return AcceptanceResult.ACCEPTED, feedback
    return AcceptanceResult.REJECTED, feedback


class AcceptorAgent:
    """Acceptor agent that reviews implementations."""

    def __init__(self, model: str = "sonnet") -> None:
        self._adapter = ClaudeAdapter(
            system_prompt=ACCEPTOR_SYSTEM_PROMPT,
            model=model,
        )

    @property
    def role(self) -> AgentRole:
        return AgentRole.ACCEPTOR

    async def start(self, project_dir: Path) -> None:
        """Start the acceptor agent."""
        await self._adapter.start(project_dir)

    async def send(self, message: str) -> AsyncIterator[StreamEvent]:
        """Send a message and stream back events."""
        async for event in self._adapter.send(message):
            yield event

    async def stop(self) -> None:
        """Stop the acceptor agent."""
        await self._adapter.stop()
