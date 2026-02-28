"""kernel.console._plain -- Plain-text fallback backend.

Reproduces the current print()-based output with no external dependencies.
Used when Rich is not installed or stdout is not a TTY.
"""

from __future__ import annotations

import select
import sys


class PlainBackend:
    """ConsoleProtocol implementation using only built-in print()."""

    # -- General messages ---------------------------------------------------

    def info(self, message: str) -> None:
        print(f"  {message}")

    def success(self, message: str) -> None:
        print(f"  [ok] {message}")

    def warning(self, message: str) -> None:
        print(f"  [warn] {message}")

    def error(self, message: str) -> None:
        print(f"  [error] {message}")

    # -- Structured panels --------------------------------------------------

    def panel(self, content: str, *, title: str = "", style: str = "") -> None:
        width = 60
        header = f" {title} " if title else ""
        border = header.center(width, "=")
        print(f"\n{border}")
        for line in content.splitlines():
            print(f"  {line}")
        print("=" * width)

    def table(self, headers: list[str], rows: list[list[str]], *, title: str = "") -> None:
        if title:
            print(f"\n  {title}:")

        if not headers and not rows:
            return

        # Calculate column widths
        all_rows = [headers, *rows]
        col_widths = [
            max(len(str(row[i])) if i < len(row) else 0 for row in all_rows)
            for i in range(len(headers))
        ]
        # Ensure minimum width
        col_widths = [max(w, len(h)) for w, h in zip(col_widths, headers, strict=True)]

        # Header
        header_line = "  " + "  ".join(
            h.ljust(w) for h, w in zip(headers, col_widths, strict=True)
        )
        print(header_line)
        print("  " + "  ".join("-" * w for w in col_widths))

        # Rows
        for row in rows:
            cells = [
                str(row[i]).ljust(col_widths[i]) if i < len(row) else " " * col_widths[i]
                for i in range(len(headers))
            ]
            print("  " + "  ".join(cells))

    def kv(self, data: dict[str, str], *, title: str = "") -> None:
        if title:
            print(f"\n  {title}:")
        if not data:
            return
        max_key = max(len(k) for k in data)
        for k, v in data.items():
            print(f"  {k.rjust(max_key)}: {v}")

    # -- Iteration lifecycle ------------------------------------------------

    def iteration_header(self, num: int, timestamp: str) -> None:
        rule = "\u2501" * 60
        print(f"\n{rule}")
        print(f"  Iteration #{num}  \u2500  {timestamp} UTC")
        print(rule)

    def step(self, current: int, total: int, description: str) -> None:
        print(f"\n  [{current}/{total}] {description}")

    def step_detail(self, message: str) -> None:
        print(f"    {message}")

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
            print(f"  \u2713 {imp}")
        for issue in issues:
            print(f"  \u2717 {str(issue)[:120]}")

        icon = "\u2713" if success else "\u2717"
        word = "passed" if success else "failed"
        print()
        print(
            f"\u2501\u2501 {icon} Iteration #{iteration_id} {word} "
            f"\u2500\u2500 {elapsed:.1f}s \u00b7 ${cost_usd:.4f} \u00b7 {total_tokens:,} \u2501\u2501"
        )

    # -- Agent streaming ----------------------------------------------------

    def stream_text(self, text: str) -> None:
        print(text, end="", flush=True)

    def stream_tool(self, tool_name: str, summary: str) -> None:
        width = 70
        header = f"\u250c\u2500 {tool_name} " + "\u2500" * max(0, width - 5 - len(tool_name)) + "\u2510"
        print(f"\n  {header}", flush=True)
        print(f"  \u2502 {summary.ljust(width - 2)}\u2502", flush=True)
        print("  \u2514" + "\u2500" * (width - 1) + "\u2518", flush=True)

    def stream_end(self) -> None:
        print(flush=True)

    def stream_result(self, elapsed: float, cost: float, tokens: int) -> None:
        print(f"\n  \u23f1 {elapsed:.1f}s \u00b7 ${cost:.4f} \u00b7 {tokens:,} tokens")

    # -- Interactive prompt -------------------------------------------------

    def prompt(self, label: str = "Annie", timeout: float | None = None) -> str | None:
        """Show interactive prompt. Returns user input or None on timeout."""
        try:
            print(f"\n{label}> ", end="", flush=True)
            if timeout is not None and timeout > 0:
                ready, _, _ = select.select([sys.stdin], [], [], timeout)
                if not ready:
                    print()
                    return None
            line = sys.stdin.readline()
            if not line:
                return None
            return line.rstrip("\n")
        except EOFError:
            return None

    # -- Utility (for test/introspection) -----------------------------------

    @staticmethod
    def _is_tty() -> bool:
        return sys.stdout.isatty()
