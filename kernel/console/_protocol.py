"""kernel.console._protocol -- ConsoleProtocol definition.

Pure standard-library typing.Protocol for the Anima terminal output system.
No external dependencies allowed in this file.
"""

from __future__ import annotations

from typing import Protocol


class ConsoleProtocol(Protocol):
    """Anima terminal output protocol.

    Three layers of methods:

    **General messages** -- usable from any module::

        console.info("Found 42 files")
        console.success("Iteration passed")
        console.warning("Rollback triggered")
        console.error("Agent execution failed")

    **Structured panels** -- tables, key-value displays, panels::

        console.panel("preview text", title="Dry Run")
        console.table(["Col1", "Col2"], [["a", "b"]], title="Results")
        console.kv({"Status": "alive", "Iterations": "12"})

    **Iteration lifecycle** -- used by kernel/loop.py and kernel/seed.py::

        console.iteration_header(1, "2026-02-27 12:00:00")
        console.step(1, 6, "Scanning project state...")
        console.iteration_result(...)

    **Agent streaming** -- real-time agent output::

        console.stream_text("partial text")
        console.stream_tool("Read", "/foo/bar.py")
        console.stream_end()
        console.stream_result(12.5, 0.03, 1500)
    """

    # -- General messages ---------------------------------------------------

    def info(self, message: str) -> None:
        """Informational message."""
        ...

    def success(self, message: str) -> None:
        """Success / positive-outcome message."""
        ...

    def warning(self, message: str) -> None:
        """Warning message."""
        ...

    def error(self, message: str) -> None:
        """Error message."""
        ...

    # -- Structured panels --------------------------------------------------

    def panel(self, content: str, *, title: str = "", style: str = "") -> None:
        """Display *content* in a bordered panel."""
        ...

    def table(self, headers: list[str], rows: list[list[str]], *, title: str = "") -> None:
        """Display a table with *headers* and *rows*."""
        ...

    def kv(self, data: dict[str, str], *, title: str = "") -> None:
        """Display key-value pairs."""
        ...

    # -- Iteration lifecycle ------------------------------------------------

    def iteration_header(self, num: int, timestamp: str) -> None:
        """Display the iteration banner at the start of a cycle."""
        ...

    def step(self, current: int, total: int, description: str) -> None:
        """Display a pipeline step indicator ``[current/total] description``."""
        ...

    def step_detail(self, message: str) -> None:
        """Display an indented detail line under the current step."""
        ...

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
        """Display the end-of-iteration result summary."""
        ...

    # -- Agent streaming ----------------------------------------------------

    def stream_text(self, text: str) -> None:
        """Emit a text fragment from the agent (no trailing newline)."""
        ...

    def stream_tool(self, tool_name: str, summary: str) -> None:
        """Display a tool-use summary line."""
        ...

    def stream_end(self) -> None:
        """Finalize streaming output (e.g. trailing newline)."""
        ...

    def stream_result(self, elapsed: float, cost: float, tokens: int) -> None:
        """Display the post-stream execution summary."""
        ...
