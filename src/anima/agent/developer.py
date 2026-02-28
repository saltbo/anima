"""Developer agent — implements features and writes tests."""

from collections.abc import AsyncIterator
from pathlib import Path

from anima.agent.claude_adapter import ClaudeAdapter
from anima.domain.models import AgentRole, StreamEvent

DEVELOPER_SYSTEM_PROMPT = """\
You are the Developer agent of Anima, an autonomous iteration engine.

Your role:
- You receive a milestone description and implement ONE feature at a time.
- Read the milestone file to understand what needs to be done.
- Analyze the current codebase state and decide which feature to implement next.
- Implement the feature: write code, write tests, run quality checks.
- Run verification: `ruff check . && ruff format --check . && pyright && pytest`
- If verification passes, report completion.
- If verification fails, fix the issues and try again.

Rules:
- Do NOT ask questions unless you encounter a critical ambiguity that blocks progress.
- Make autonomous decisions on implementation details.
- Each response should focus on implementing exactly ONE feature.
- After implementing, run the full verification suite.
- Use conventional commits: feat:, fix:, refactor:, test:, docs:, chore:
- When told to commit, stage all changes and commit with a descriptive message.
"""


class DeveloperAgent:
    """Developer agent that implements features."""

    def __init__(self, model: str = "sonnet") -> None:
        self._adapter = ClaudeAdapter(
            system_prompt=DEVELOPER_SYSTEM_PROMPT,
            model=model,
        )

    @property
    def role(self) -> AgentRole:
        return AgentRole.DEVELOPER

    async def start(self, project_dir: Path) -> None:
        """Start the developer agent."""
        await self._adapter.start(project_dir)

    async def send(self, message: str) -> AsyncIterator[StreamEvent]:
        """Send a message and stream back events."""
        async for event in self._adapter.send(message):
            yield event

    async def stop(self) -> None:
        """Stop the developer agent."""
        await self._adapter.stop()
