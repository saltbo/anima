"""Anima TUI application."""

import asyncio
from collections.abc import Iterator
from pathlib import Path

from textual import events
from textual.app import App
from textual.containers import Horizontal
from textual.message import Message
from textual.widget import Widget
from textual.widgets import Input, OptionList
from textual.widgets.option_list import Option

from anima.agent.acceptor import AcceptorAgent
from anima.agent.developer import DeveloperAgent
from anima.config import milestones_dir
from anima.domain.models import AcceptanceResult, AgentRole
from anima.git.ops import GitOperations
from anima.scheduler.loop import Scheduler
from anima.state.initializer import initialize, is_initialized
from anima.state.manager import StateManager
from anima.tui.widgets import AgentPanel, StatusBar

_COMMANDS: dict[str, str] = {
    "/start": "Start iteration",
    "/status": "Show current state",
    "/milestones": "List milestone files",
    "/help": "Show available commands",
    "/quit": "Exit Anima",
}


class CommandInput(Input):
    """Input that intercepts Tab/Up/Down for command completion."""

    class TabPressed(Message):
        """Posted when user presses Tab."""

    class ArrowPressed(Message):
        """Posted when user presses Up/Down while cmd list is open."""

        def __init__(self, direction: int) -> None:
            super().__init__()
            self.direction = direction  # -1 = up, +1 = down

    class EscapePressed(Message):
        """Posted when user presses Escape."""

    async def _on_key(self, event: events.Key) -> None:
        if event.key == "tab":
            event.prevent_default()
            event.stop()
            self.post_message(self.TabPressed())
            return
        if event.key in ("up", "down"):
            event.prevent_default()
            event.stop()
            self.post_message(self.ArrowPressed(-1 if event.key == "up" else 1))
            return
        if event.key == "escape":
            event.prevent_default()
            event.stop()
            self.post_message(self.EscapePressed())
            return
        await super()._on_key(event)


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
        self.dev_panel = AgentPanel("Developer")
        self.acc_panel = AgentPanel("Acceptor")
        self._input = CommandInput(
            placeholder="Type / for commands",
            id="input-bar",
        )
        self._cmd_list = OptionList(
            *[Option(f"{cmd}  {desc}", id=cmd) for cmd, desc in _COMMANDS.items()],
            id="cmd-list",
        )
        self._cmd_list.can_focus = False
        self._human_input_event: asyncio.Event | None = None
        self._human_input_value: str = ""
        self._scheduler_running = False
        self._suppress_cmd_list = False

    def compose(self) -> Iterator[Widget]:
        """Create child widgets."""
        yield self._status_bar
        with Horizontal(id="main-content"):
            yield self.dev_panel
            yield self.acc_panel
        yield self._cmd_list
        yield self._input

    def on_mount(self) -> None:
        """Initialize project on mount."""
        self._cmd_list.display = False
        if not is_initialized(self._project_dir):
            initialize(self._project_dir)
            self.dev_panel.append_status("Initialized .anima/ directory")
        self._status_bar.set_status(f"ANIMA v0.1 | {self._project_dir.name} | Ready")
        self.dev_panel.append_status(
            "Welcome to Anima. Type /help for available commands."
        )
        self._input.focus()

    # ── input handling ───────────────────────────────────

    def on_input_changed(self, event: Input.Changed) -> None:
        """Show/hide command list as user types."""
        if self._suppress_cmd_list:
            self._suppress_cmd_list = False
            return
        val = event.value
        if val == "/":
            # Show all commands
            self._show_cmd_options(list(_COMMANDS.items()))
        elif val.startswith("/") and len(val) > 1:
            # Filter commands
            prefix = val.lower()
            matches = [(c, d) for c, d in _COMMANDS.items() if c.startswith(prefix)]
            if matches:
                self._show_cmd_options(matches)
            else:
                self._cmd_list.display = False
        else:
            self._cmd_list.display = False

    def _show_cmd_options(self, items: list[tuple[str, str]]) -> None:
        """Populate the command list and highlight the first item."""
        self._cmd_list.clear_options()
        self._cmd_list.add_options(
            [Option(f"{c}  {d}", id=c) for c, d in items]
        )
        self._cmd_list.highlighted = 0
        self._cmd_list.display = True

    def on_command_input_arrow_pressed(
        self, event: CommandInput.ArrowPressed
    ) -> None:
        """Move highlight in command list."""
        if not self._cmd_list.display:
            return
        idx = self._cmd_list.highlighted
        if idx is None:
            idx = 0
        else:
            idx += event.direction
        count = self._cmd_list.option_count
        idx = max(0, min(idx, count - 1))
        self._cmd_list.highlighted = idx

    def on_command_input_tab_pressed(self) -> None:
        """Tab-complete: fill input with highlighted command."""
        if not self._cmd_list.display:
            return
        idx = self._cmd_list.highlighted
        if idx is None:
            return
        option = self._cmd_list.get_option_at_index(idx)
        cmd = option.id
        if cmd is not None:
            self._suppress_cmd_list = True
            self._input.value = cmd
            self._input.action_end()
            self._cmd_list.display = False

    def on_option_list_option_selected(
        self, event: OptionList.OptionSelected
    ) -> None:
        """Fill input with selected command and execute."""
        cmd = event.option.id
        if cmd is None:
            return
        self._cmd_list.display = False
        self._input.value = ""
        self._input.focus()
        self._handle_command(cmd)

    def on_command_input_escape_pressed(self) -> None:
        """Hide command list on Escape."""
        self._cmd_list.display = False

    def _get_highlighted_cmd(self) -> str | None:
        """Return the highlighted command ID, or None."""
        idx = self._cmd_list.highlighted
        if idx is None:
            return None
        return self._cmd_list.get_option_at_index(idx).id

    def on_input_submitted(self, event: Input.Submitted) -> None:
        """Handle input: slash commands or human feedback."""
        # If cmd list is open, execute the highlighted command
        if self._cmd_list.display:
            cmd = self._get_highlighted_cmd()
            self._cmd_list.display = False
            self._input.value = ""
            if cmd:
                self._handle_command(cmd)
            return

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
            self.dev_panel.append_status(
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
            self.dev_panel.append_status(f"Unknown command: {command}. Type /help.")

    def _cmd_help(self) -> None:
        """Show available commands."""
        self.dev_panel.append_status(
            "/start [milestone]  Start iteration (auto-detects if omitted)"
        )
        self.dev_panel.append_status("/status             Show current state")
        self.dev_panel.append_status("/milestones         List milestone files")
        self.dev_panel.append_status("/quit               Exit Anima")

    def _cmd_milestones(self) -> None:
        """List available milestone files."""
        ms_dir = milestones_dir(self._project_dir)
        if not ms_dir.exists():
            self.dev_panel.append_status("No milestones directory found.")
            return
        files = sorted(ms_dir.glob("*.md"))
        if not files:
            self.dev_panel.append_status(
                "No milestone files found in .anima/milestones/"
            )
            return
        for f in files:
            self.dev_panel.append_status(f"  {f.stem}")

    def _cmd_status(self) -> None:
        """Show current iteration state."""
        mgr = StateManager()
        state = mgr.load(self._project_dir)
        if not state.current_milestone:
            self.dev_panel.append_status("No active milestone.")
            return
        ms = state.get_milestone(state.current_milestone)
        if ms is None:
            self.dev_panel.append_status(
                f"Milestone {state.current_milestone}: no state."
            )
            return
        self.dev_panel.append_status(
            f"Milestone: {ms.milestone_id} ({ms.status.value})"
        )
        self.dev_panel.append_status(
            f"Branch: {ms.branch_name} | Iterations: {ms.iteration_count}"
        )

    def _cmd_start(self, arg: str) -> None:
        """Start the scheduler for a milestone."""
        if self._scheduler_running:
            self.dev_panel.append_status("Scheduler is already running.")
            return

        # Determine milestone
        milestone_id, milestone_file = self._resolve_milestone(arg)
        if milestone_id is None or milestone_file is None:
            return

        self.dev_panel.append_status(f"Starting milestone: {milestone_id}")
        self.dev_panel.set_state("Working...")
        self.acc_panel.set_state("Waiting for review...")
        self.run_worker(
            self._run_scheduler(milestone_id, milestone_file),
            exclusive=True,
        )

    def _resolve_milestone(self, arg: str) -> tuple[str | None, str | None]:
        """Resolve milestone ID and file path from user arg."""
        ms_dir = milestones_dir(self._project_dir)

        if arg:
            milestone_id = arg.strip()
            candidate = ms_dir / f"{milestone_id}.md"
            if candidate.exists():
                return milestone_id, str(candidate)
            root_candidate = self._project_dir / "milestones" / f"{milestone_id}.md"
            if root_candidate.exists():
                return milestone_id, str(root_candidate)
            self.dev_panel.append_status(
                f"Milestone file not found: {milestone_id}.md"
            )
            return None, None

        # Auto-detect
        for search_dir in [ms_dir, self._project_dir / "milestones"]:
            if search_dir.exists():
                files = sorted(search_dir.glob("*.md"))
                if files:
                    milestone_id = files[0].stem
                    return milestone_id, str(files[0])

        self.dev_panel.append_status(
            "No milestone files found. "
            "Place .md files in .anima/milestones/ "
            "or milestones/"
        )
        return None, None

    async def _run_scheduler(self, milestone_id: str, milestone_file: str) -> None:
        """Run the scheduler (async worker, same thread as app)."""
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
            self.dev_panel.append_status(f"Milestone {milestone_id} completed!")
        except Exception as e:
            self.dev_panel.append_status(f"Error: {e}")
            self._status_bar.set_status(
                f"ANIMA v0.1 | {self._project_dir.name} | Error"
            )
        finally:
            self._scheduler_running = False
            self._input.placeholder = "Type / for commands"

    async def wait_for_human_input(self, prompt: str) -> str:
        """Enable input and wait for human response."""
        self.dev_panel.append_status(f"Waiting for input: {prompt}")
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
        panel = (
            self._app.dev_panel
            if role == AgentRole.DEVELOPER
            else self._app.acc_panel
        )
        panel.append_output(text)

    def on_status_change(self, message: str) -> None:
        self._app.dev_panel.append_status(message)

    def on_acceptance(self, result: AcceptanceResult, feedback: str) -> None:
        label = "ACCEPTED" if result == AcceptanceResult.ACCEPTED else "REJECTED"
        self._app.acc_panel.append_output(f"{label}: {feedback}")

    async def wait_for_human_input(self, prompt: str) -> str:
        return await self._app.wait_for_human_input(prompt)
