"""kernel.console._plain -- Plain-text fallback backend.

Reproduces the current print()-based output with no external dependencies.
Used when Rich is not installed or stdout is not a TTY.
"""

from __future__ import annotations

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
        col_widths = [max(w, len(h)) for w, h in zip(col_widths, headers)]

        # Header
        header_line = "  " + "  ".join(h.ljust(w) for h, w in zip(headers, col_widths))
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
        border = "=" * 60
        print(f"\n{border}")
        print(f"  \U0001f331 ANIMA -- Iteration #{num}")
        print(f"     {timestamp} UTC")
        print(border)

    def step(self, current: int, total: int, description: str) -> None:
        print(f"\n[{current}/{total}] {description}")

    def step_detail(self, message: str) -> None:
        print(f"  {message}")

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
        sep = "\u2500" * 50
        status = "\u2713 PASSED" if success else "\u2717 FAILED"
        print(f"\n{sep}")
        print(f"  Iteration {iteration_id}")
        print(f"  Status: {status}")
        print(f"  Time: {elapsed:.1f}s  Cost: ${cost_usd:.4f}  Tokens: {total_tokens}")
        for imp in improvements:
            print(f"  \u2713 {imp}")
        for issue in issues:
            print(f"  \u2717 {str(issue)[:120]}")
        print(sep)

    # -- Agent streaming ----------------------------------------------------

    def stream_text(self, text: str) -> None:
        print(text, end="", flush=True)

    def stream_tool(self, tool_name: str, summary: str) -> None:
        print(f"\n  \u25b6 [{tool_name}] {summary}", flush=True)

    def stream_end(self) -> None:
        print(flush=True)

    def stream_result(self, elapsed: float, cost: float, tokens: int) -> None:
        print(f"\n  [executor] Done in {elapsed:.1f}s, cost: ${cost:.4f}, tokens: {tokens}")

    # -- Utility (for test/introspection) -----------------------------------

    @staticmethod
    def _is_tty() -> bool:
        return sys.stdout.isatty()
