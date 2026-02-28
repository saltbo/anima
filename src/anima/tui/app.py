"""Anima TUI application."""

import asyncio
from collections.abc import Iterator
from pathlib import Path

from textual.app import App
from textual.widget import Widget
from textual.widgets import Input

from anima.agent.acceptor import AcceptorAgent
from anima.agent.developer import DeveloperAgent
from anima.config import milestones_dir
from anima.domain.models import AcceptanceResult, AgentRole
from anima.git.ops import GitOperations
from anima.scheduler.loop import Scheduler
from anima.state.initializer import initialize, is_initialized
from anima.state.manager import StateManager
from anima.tui.widgets import StatusBar, StreamPanel


class AnimaApp(App[None]):
    """Main Anima TUI application."""

    TITLE = "Anima"
    CSS_PATH = "app.tcss"

    BINDINGS = [  # type: ignore[assignment]  # noqa: RUF012
        ("q", "quit", "Quit"),
    ]

    def __init__(self, project_dir: Path | None = None) -> None:
        super().__init__()
        self._project_dir = project_dir or Path.cwd()
        self._status_bar = StatusBar()
        self.stream_panel = StreamPanel()
        self._input = Input(
            placeholder="Type /start to begin, /help for commands",
            id="input-bar",
        )
        self._human_input_event: asyncio.Event | None = None
        self._human_input_value: str = ""
        self._scheduler_running = False

    def compose(self) -> Iterator[Widget]:
        """Create child widgets."""
        yield self._status_bar
        yield self.stream_panel
        yield self._input

    def on_mount(self) -> None:
        """Initialize project on mount."""
        if not is_initialized(self._project_dir):
            initialize(self._project_dir)
            self.stream_panel.append_status("Initialized .anima/ directory")
        self._status_bar.set_status(f"ANIMA v0.1 | {self._project_dir.name} | Ready")
        self.stream_panel.append_status(
            "Welcome to Anima. Type /help for available commands."
        )
        self._input.focus()

    def on_input_submitted(self, event: Input.Submitted) -> None:
        """Handle input: slash commands or human feedback."""
        text = event.value.strip()
        self._input.value = ""
        if not text:
            return

        # If scheduler is waiting for human input, deliver it
        if self._human_input_event is not None:
            self._human_input_value = text
            self._human_input_event.set()
            return

        # Slash commands
        if text.startswith("/"):
            self._handle_command(text)
        else:
            self.stream_panel.append_status(
                f"Unknown input: {text}. Use /help for commands."
            )

    def _handle_command(self, cmd: str) -> None:
        """Dispatch slash commands."""
        parts = cmd.split(maxsplit=1)
        command = parts[0].lower()
        arg = parts[1] if len(parts) > 1 else ""

        if command == "/help":
            self._cmd_help()
        elif command == "/start":
            self._cmd_start(arg)
        elif command == "/status":
            self._cmd_status()
        elif command == "/milestones":
            self._cmd_milestones()
        elif command == "/quit" or command == "/q":
            self.exit()
        else:
            self.stream_panel.append_status(f"Unknown command: {command}. Type /help.")

    def _cmd_help(self) -> None:
        """Show available commands."""
        self.stream_panel.append_status(
            "/start [milestone]  Start iteration (auto-detects if omitted)"
        )
        self.stream_panel.append_status("/status             Show current state")
        self.stream_panel.append_status("/milestones         List milestone files")
        self.stream_panel.append_status("/quit               Exit Anima")

    def _cmd_milestones(self) -> None:
        """List available milestone files."""
        ms_dir = milestones_dir(self._project_dir)
        if not ms_dir.exists():
            self.stream_panel.append_status("No milestones directory found.")
            return
        files = sorted(ms_dir.glob("*.md"))
        if not files:
            self.stream_panel.append_status(
                "No milestone files found in .anima/milestones/"
            )
            return
        for f in files:
            self.stream_panel.append_status(f"  {f.stem}")

    def _cmd_status(self) -> None:
        """Show current iteration state."""
        mgr = StateManager()
        state = mgr.load(self._project_dir)
        if not state.current_milestone:
            self.stream_panel.append_status("No active milestone.")
            return
        ms = state.get_milestone(state.current_milestone)
        if ms is None:
            self.stream_panel.append_status(
                f"Milestone {state.current_milestone}: no state."
            )
            return
        self.stream_panel.append_status(
            f"Milestone: {ms.milestone_id} ({ms.status.value})"
        )
        self.stream_panel.append_status(
            f"Branch: {ms.branch_name} | Feature index: {ms.current_feature_index}"
        )
        for f in ms.features:
            mark = "x" if f.status.value == "completed" else " "
            self.stream_panel.append_status(f"  [{mark}] {f.name} ({f.status.value})")

    def _cmd_start(self, arg: str) -> None:
        """Start the scheduler for a milestone."""
        if self._scheduler_running:
            self.stream_panel.append_status("Scheduler is already running.")
            return

        # Determine milestone
        milestone_id, milestone_file = self._resolve_milestone(arg)
        if milestone_id is None or milestone_file is None:
            return

        self.stream_panel.append_status(f"Starting milestone: {milestone_id}")
        self.run_worker(
            self._run_scheduler(milestone_id, milestone_file),
            exclusive=True,
        )

    def _resolve_milestone(self, arg: str) -> tuple[str | None, str | None]:
        """Resolve milestone ID and file path from user arg."""
        ms_dir = milestones_dir(self._project_dir)

        if arg:
            # User specified a milestone
            milestone_id = arg.strip()
            # Try to find the file
            candidate = ms_dir / f"{milestone_id}.md"
            if candidate.exists():
                return milestone_id, str(candidate)
            # Also check project root milestones/
            root_candidate = self._project_dir / "milestones" / f"{milestone_id}.md"
            if root_candidate.exists():
                return milestone_id, str(root_candidate)
            self.stream_panel.append_status(
                f"Milestone file not found: {milestone_id}.md"
            )
            return None, None

        # Auto-detect: check .anima/milestones/ then project milestones/
        for search_dir in [ms_dir, self._project_dir / "milestones"]:
            if search_dir.exists():
                files = sorted(search_dir.glob("*.md"))
                if files:
                    milestone_id = files[0].stem
                    return milestone_id, str(files[0])

        self.stream_panel.append_status(
            "No milestone files found. "
            "Place .md files in .anima/milestones/ "
            "or milestones/"
        )
        return None, None

    async def _run_scheduler(self, milestone_id: str, milestone_file: str) -> None:
        """Run the scheduler (called from worker)."""
        self._scheduler_running = True
        self._status_bar.set_status(
            f"ANIMA v0.1 | {self._project_dir.name} | Running: {milestone_id}"
        )
        self._input.placeholder = "Scheduler running... type here when prompted"

        try:
            developer = DeveloperAgent()
            acceptor = AcceptorAgent()
            state_manager = StateManager()
            git_ops = GitOperations()
            tui_callback = _TUICallbackImpl(self)

            scheduler = Scheduler(
                project_dir=self._project_dir,
                developer=developer,
                acceptor=acceptor,
                state_manager=state_manager,
                git_ops=git_ops,
                tui=tui_callback,
            )

            await scheduler.run_milestone(milestone_id, milestone_file)
            self._status_bar.set_status(
                f"ANIMA v0.1 | {self._project_dir.name} | Completed: {milestone_id}"
            )
            self.stream_panel.append_status(f"Milestone {milestone_id} completed!")
        except Exception as e:
            self.stream_panel.append_status(f"Error: {e}")
            self._status_bar.set_status(
                f"ANIMA v0.1 | {self._project_dir.name} | Error"
            )
        finally:
            self._scheduler_running = False
            self._input.placeholder = "Type /start to begin, /help for commands"

    async def wait_for_human_input(self, prompt: str) -> str:
        """Enable input and wait for human response."""
        self.stream_panel.append_status(f"Waiting for input: {prompt}")
        self._input.placeholder = "Enter your response..."
        self._input.focus()

        self._human_input_event = asyncio.Event()
        await self._human_input_event.wait()
        self._human_input_event = None

        self._input.placeholder = "Scheduler running... type here when prompted"
        return self._human_input_value


class _TUICallbackImpl:
    """Bridges the TUICallback protocol to AnimaApp."""

    def __init__(self, app: AnimaApp) -> None:
        self._app = app

    def on_agent_output(self, role: AgentRole, text: str) -> None:
        self._app.stream_panel.append_output(role.value, text)

    def on_status_change(self, message: str) -> None:
        self._app.stream_panel.append_status(message)

    def on_acceptance(self, result: AcceptanceResult, feedback: str) -> None:
        label = "ACCEPTED" if result == AcceptanceResult.ACCEPTED else "REJECTED"
        self._app.stream_panel.append_output("Acceptor", f"{label}: {feedback}")

    async def wait_for_human_input(self, prompt: str) -> str:
        return await self._app.wait_for_human_input(prompt)
