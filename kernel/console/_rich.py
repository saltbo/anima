"""kernel.console._rich -- Rich-based TUI backend.

Provides coloured, structured terminal output using the Rich library.
Lazily imports Rich sub-modules so that startup cost is minimal.
"""

from __future__ import annotations

import select
import sys

from rich import box
from rich.console import Console
from rich.panel import Panel
from rich.rule import Rule
from rich.theme import Theme

_THEME = Theme(
    {
        "info": "blue",
        "success": "bold green",
        "warning": "bold yellow",
        "error": "bold red",
        "step.num": "bold cyan",
        "step.desc": "default",
        "tool": "magenta",
        "dim": "dim",
        "prompt.label": "bold cyan",
    }
)


class RichBackend:
    """ConsoleProtocol implementation backed by Rich."""

    def __init__(self) -> None:
        self._con = Console(theme=_THEME, highlight=False)

    # -- General messages ---------------------------------------------------

    def info(self, message: str) -> None:
        self._con.print(f"  {message}", style="info")

    def success(self, message: str) -> None:
        self._con.print(f"  \u2713 {message}", style="success")

    def warning(self, message: str) -> None:
        self._con.print(f"  \u26a0 {message}", style="warning")

    def error(self, message: str) -> None:
        self._con.print(f"  \u2717 {message}", style="error")

    # -- Structured panels --------------------------------------------------

    def panel(self, content: str, *, title: str = "", style: str = "") -> None:
        from rich.panel import Panel

        self._con.print(
            Panel(content, title=title or None, border_style=style or "dim"),
        )

    def table(self, headers: list[str], rows: list[list[str]], *, title: str = "") -> None:
        from rich.table import Table

        t = Table(title=title or None, box=box.SIMPLE, show_edge=False, pad_edge=True)
        for h in headers:
            t.add_column(h)
        for r in rows:
            t.add_row(*r)
        self._con.print(t)

    def kv(self, data: dict[str, str], *, title: str = "") -> None:
        from rich.table import Table

        t = Table(
            title=title or None,
            box=box.SIMPLE,
            show_header=False,
            show_edge=False,
            pad_edge=True,
        )
        t.add_column("Key", style="bold", justify="right")
        t.add_column("Value")
        for k, v in data.items():
            t.add_row(k, v)
        self._con.print(t)

    # -- Iteration lifecycle ------------------------------------------------

    def iteration_header(self, num: int, timestamp: str) -> None:
        self._con.print()
        self._con.print(
            Rule(f" Iteration #{num} ", style="bold", align="left"),
        )
        self._con.print(f"  [dim]{timestamp} UTC[/]")

    def step(self, current: int, total: int, description: str) -> None:
        self._con.print(f"\n  [step.num]\\[{current}/{total}][/] {description}")

    def step_detail(self, message: str) -> None:
        self._con.print(f"    [dim]{message}[/]")

    def iteration_result(
        self,
        iteration_id: str,
        success: bool,
        elapsed: float,
        improvements: list[str],
        issues: list[str],
        cost_usd: float,
        total_tokens: int,
    ) -> None:
        for imp in improvements:
            self._con.print(f"  [success]\u2713[/] {imp}")
        for issue in issues:
            self._con.print(f"  [error]\u2717[/] {str(issue)[:120]}")

        icon = "\u2713" if success else "\u2717"
        word = "passed" if success else "failed"
        style = "green" if success else "red"
        self._con.print()
        self._con.print(
            Rule(
                f" {icon} Iteration #{iteration_id} {word} "
                f"\u2500\u2500 {elapsed:.1f}s \u00b7 ${cost_usd:.4f} \u00b7 {total_tokens:,} ",
                style=style,
            ),
        )

    # -- Agent streaming ----------------------------------------------------

    def stream_text(self, text: str) -> None:
        # Use Console.out for raw, unbuffered text (no markup processing)
        self._con.out(text, end="", highlight=False)

    def stream_tool(self, tool_name: str, summary: str) -> None:
        self._con.print()
        panel = Panel(
            f"  {summary}",
            title=f"{tool_name}",
            title_align="left",
            border_style="dim",
            box=box.ROUNDED,
            padding=(0, 1),
        )
        self._con.print(panel)

    def stream_end(self) -> None:
        self._con.print()

    def stream_result(self, elapsed: float, cost: float, tokens: int) -> None:
        self._con.print(
            f"\n  [dim]\u23f1 {elapsed:.1f}s \u00b7 ${cost:.4f} \u00b7 {tokens:,} tokens[/]"
        )

    # -- Interactive prompt -------------------------------------------------

    def prompt(self, label: str = "Annie", timeout: float | None = None) -> str | None:
        """Show interactive prompt. Returns user input or None on timeout."""
        try:
            self._con.print()
            self._con.print(f"[prompt.label]{label}>[/] ", end="")
            if timeout is not None and timeout > 0:
                ready, _, _ = select.select([sys.stdin], [], [], timeout)
                if not ready:
                    self._con.print()
                    return None
            line = sys.stdin.readline()
            if not line:
                return None
            return line.rstrip("\n")
        except EOFError:
            return None
