"""Custom widgets for Anima TUI."""

from textual.widgets import RichLog, Static


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


class StreamPanel(RichLog):
    """Scrolling output panel for agent output and scheduler status."""

    DEFAULT_CSS = """
    StreamPanel {
        height: 1fr;
        border: solid $primary;
        padding: 0 1;
        scrollbar-size: 1 1;
    }
    """

    def __init__(self) -> None:
        super().__init__(wrap=True, highlight=True, markup=True)

    def append_output(self, role: str, text: str) -> None:
        """Append agent or scheduler output."""
        self.write(f"[bold cyan]\\[{role}][/bold cyan] {text}")

    def append_status(self, text: str) -> None:
        """Append a scheduler status message."""
        self.write(f"[bold yellow]{text}[/bold yellow]")
