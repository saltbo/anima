"""kernel.console -- Anima terminal output system.

Usage (any file)::

    from kernel.console import console

    console.info("Hello")
    console.step(1, 6, "Scanning...")
    console.table(["Col", "Val"], [["a", "1"]])

Configuration (call once in ``cli.py:main()``)::

    from kernel.console import configure

    configure(backend="auto")  # "rich" | "plain" | "auto"
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from kernel.console._plain import PlainBackend

if TYPE_CHECKING:
    from kernel.console._protocol import ConsoleProtocol

# ---------------------------------------------------------------------------
# Global singleton -- defaults to PlainBackend (zero-dependency startup)
# ---------------------------------------------------------------------------

_backend: ConsoleProtocol = PlainBackend()


def configure(*, backend: str = "auto") -> None:
    """Select the console backend.

    Should be called **once** at startup (in ``cli.py:main()``).

    Args:
        backend: ``"rich"`` -- always use Rich.
                 ``"plain"`` -- always use plain text.
                 ``"auto"`` (default) -- Rich when available **and** stdout
                 is a TTY; plain otherwise.
    """
    global _backend  # noqa: PLW0603

    if backend == "plain":
        _backend = PlainBackend()
        return

    if backend == "auto":
        import sys

        if not sys.stdout.isatty():
            _backend = PlainBackend()
            return
        backend = "rich"

    if backend == "rich":
        try:
            from kernel.console._rich import RichBackend

            _backend = RichBackend()
        except ImportError:
            _backend = PlainBackend()


def get_console() -> ConsoleProtocol:
    """Return the current backend instance."""
    return _backend


# ---------------------------------------------------------------------------
# Proxy object -- ``from kernel.console import console``
# ---------------------------------------------------------------------------


class _ConsoleProxy:
    """Transparent proxy that delegates to the current ``_backend``.

    This lets callers import ``console`` once at module level and
    automatically pick up any later ``configure()`` call.
    """

    def __getattr__(self, name: str) -> object:
        return getattr(_backend, name)


console: ConsoleProtocol = _ConsoleProxy()  # type: ignore[assignment]
