"""Custom widgets for Anima TUI."""

from __future__ import annotations

import json
from typing import Any

from rich.markdown import Markdown
from rich.markup import escape as rich_escape
from textual.containers import Vertical
from textual.widgets import RichLog, Static


def _escape(text: str) -> str:
    """Escape text so Rich markup characters are not interpreted."""
    return rich_escape(text)


class StatusBar(Static):
    """Top status bar showing current state."""

    DEFAULT_CSS = """
    StatusBar {
        dock: top;
        height: 1;
        background: $primary;
        color: $text;
        text-style: bold;
        padding: 0 1;
    }
    """

    def __init__(self) -> None:
        super().__init__("ANIMA v0.1 | Ready")

    def set_status(self, text: str) -> None:
        """Update the status bar text."""
        self.update(text)


_STATUS_ICONS: dict[str, str] = {
    "completed": "[green]✓[/green]",
    "in_progress": "[bold cyan]▶[/bold cyan]",
    "pending": "[dim]○[/dim]",
}


class AgentPanel(Vertical):
    """Composite panel: stream output on top, todo list on bottom."""

    DEFAULT_CSS = """
    AgentPanel {
        width: 1fr;
    }
    """

    def __init__(self, title: str) -> None:
        super().__init__()
        self.can_focus = False
        self._title = title
        self._stream = RichLog(
            wrap=True, highlight=True, markup=True,
            id=f"stream-{title.lower()}",
            classes="agent-stream",
        )
        self._stream.can_focus = False
        self._todo = RichLog(
            wrap=True, highlight=True, markup=True,
            id=f"todo-{title.lower()}",
            classes="agent-todo",
        )
        self._todo.can_focus = False
        self._todos: list[dict[str, Any]] = []
        self._last_event: str = ""

    def compose(self):  # type: ignore[override]
        """Layout: title bar, stream area, todo area."""
        yield Static(
            f"[bold]{_escape(self._title)}[/bold]",
            classes="agent-title",
        )
        yield self._stream
        yield self._todo

    def on_mount(self) -> None:
        """Start with todo area hidden."""
        self._todo.display = False

    # ── public API ───────────────────────────────────────

    def append_output(self, text: str) -> None:
        """Append agent output with Claude Code-style rendering."""
        lines = text.split("\n")
        text_buf: list[str] = []

        for line in lines:
            if not line:
                continue

            # Detect event type from prefix
            if line.startswith("[todo:update] "):
                self._flush_text(text_buf)
                self._handle_todo_update(line[14:])
            elif line.startswith("[thinking] "):
                self._flush_text(text_buf)
                self._break_before("thinking")
                self._render_thinking(line[11:])
            elif line.startswith("[tool:call] "):
                self._flush_text(text_buf)
                self._break_before("tool:call")
                self._render_tool_call(line[12:])
            elif line.startswith("[tool:done] "):
                self._flush_text(text_buf)
                self._render_tool_done(line[12:])
            elif line.startswith("[tool:error] "):
                self._flush_text(text_buf)
                self._render_tool_error(line[13:])
            elif line.startswith("[system] "):
                self._flush_text(text_buf)
                self._break_before("system")
                self._render_system(line[9:])
            else:
                # Accumulate plain text for Markdown rendering
                if not text_buf and self._last_event not in ("", "text"):
                    self._stream.write("")  # blank line before text block
                text_buf.append(line)

        self._flush_text(text_buf)

    def append_status(self, text: str) -> None:
        """Append a scheduler / system status message."""
        self._stream.write(f"  [yellow]{_escape(text)}[/yellow]")

    def update_todos(self, data: dict[str, Any]) -> None:
        """Replace the todo list and re-render."""
        self._todos = data.get("todos", [])
        self._refresh_todos()

    def set_state(self, msg: str) -> None:
        """Show a state message in the stream area."""
        self._stream.write(f"  [italic dim]{_escape(msg)}[/italic dim]")

    # ── renderers ────────────────────────────────────────

    def _break_before(self, event_type: str) -> None:
        """Insert a blank line when switching event types."""
        if self._last_event and self._last_event != event_type:
            self._stream.write("")
        self._last_event = event_type

    def _flush_text(self, buf: list[str]) -> None:
        """Render accumulated text lines as Markdown, then clear buffer."""
        if not buf:
            return
        md_source = "\n".join(buf)
        self._stream.write(Markdown(md_source))
        self._last_event = "text"
        buf.clear()

    def _handle_todo_update(self, raw_json: str) -> None:
        """Parse todo JSON and update the todo area."""
        try:
            data = json.loads(raw_json)
        except json.JSONDecodeError:
            return
        self.update_todos(data)

    def _render_thinking(self, body: str) -> None:
        if len(body) > 120:
            body = body[:120] + "..."
        self._stream.write(f"  [dim italic]✻ {_escape(body)}[/dim italic]")
        self._last_event = "thinking"

    def _render_tool_call(self, body: str) -> None:
        if ": " in body:
            name, summary = body.split(": ", 1)
            self._stream.write(
                f"  [bold]▶ {_escape(name)}[/bold]  [dim]{_escape(summary)}[/dim]"
            )
        else:
            self._stream.write(f"  [bold]▶ {_escape(body)}[/bold]")
        self._last_event = "tool:call"

    def _render_tool_done(self, body: str) -> None:
        if len(body) > 150:
            body = body[:150] + "..."
        self._stream.write(f"    [green]⎿ {_escape(body)}[/green]")
        self._last_event = "tool:done"

    def _render_tool_error(self, body: str) -> None:
        self._stream.write(f"    [bold red]⎿ {_escape(body)}[/bold red]")
        self._last_event = "tool:error"

    def _render_system(self, body: str) -> None:
        self._stream.write(f"  [dim]{_escape(body)}[/dim]")
        self._last_event = "system"

    def _refresh_todos(self) -> None:
        """Full re-render of the todo list. Hide when all completed or empty."""
        has_active = any(
            t.get("status") in ("pending", "in_progress") for t in self._todos
        )
        self._todo.display = bool(self._todos) and has_active
        if not self._todo.display:
            return
        self._todo.clear()
        self._todo.write("[bold]Todo[/bold] [dim]━━━━━━━━━━━━━━━━━━━[/dim]")
        for todo in self._todos:
            status = todo.get("status", "pending")
            content = todo.get("content", "")
            icon = _STATUS_ICONS.get(status, "[dim]○[/dim]")
            if status == "completed":
                self._todo.write(
                    f"  {icon} [dim strikethrough]"
                    f"{_escape(content)}[/dim strikethrough]"
                )
            elif status == "in_progress":
                self._todo.write(f"  {icon} [bold]{_escape(content)}[/bold]")
            else:
                self._todo.write(f"  {icon} {_escape(content)}")
