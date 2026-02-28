"""kernel.console._rich -- Rich-based TUI backend.

Provides coloured, structured terminal output using the Rich library.
Lazily imports Rich sub-modules so that startup cost is minimal.
"""

from __future__ import annotations

from rich import box
from rich.console import Console
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
        from rich.panel import Panel

        self._con.print()
        self._con.print(
            Panel(
                f"\U0001f331 ANIMA \u2014 Iteration #{num}\n   {timestamp} UTC",
                border_style="green",
                box=box.DOUBLE,
            ),
        )

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
        from rich.panel import Panel

        status = "[success]\u2713 PASSED[/]" if success else "[error]\u2717 FAILED[/]"
        lines = [
            f"  Iteration [bold]{iteration_id}[/]",
            f"  Status: {status}",
            f"  Time: {elapsed:.1f}s  Cost: ${cost_usd:.4f}  Tokens: {total_tokens}",
        ]
        for imp in improvements:
            lines.append(f"  [success]\u2713[/] {imp}")
        for issue in issues:
            lines.append(f"  [error]\u2717[/] {str(issue)[:120]}")
        border = "green" if success else "red"
        self._con.print(Panel("\n".join(lines), border_style=border, box=box.ROUNDED))

    # -- Agent streaming ----------------------------------------------------

    def stream_text(self, text: str) -> None:
        # Use Console.out for raw, unbuffered text (no markup processing)
        self._con.out(text, end="", highlight=False)

    def stream_tool(self, tool_name: str, summary: str) -> None:
        self._con.print(f"\n  [tool]\u25b6 [{tool_name}][/] {summary}")

    def stream_end(self) -> None:
        self._con.print()

    def stream_result(self, elapsed: float, cost: float, tokens: int) -> None:
        self._con.print(
            f"\n  [dim][executor][/] Done in {elapsed:.1f}s, "
            f"cost: [bold]${cost:.4f}[/], tokens: {tokens}"
        )
