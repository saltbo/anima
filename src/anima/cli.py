"""CLI entry point for anima."""

import logging
from pathlib import Path

from anima.config import logs_dir


def _setup_logging(project_dir: Path) -> None:
    """Configure file logging to .anima/logs/anima.log."""
    log_dir = logs_dir(project_dir)
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "anima.log"

    handler = logging.FileHandler(log_file, encoding="utf-8")
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(name)s %(levelname)s %(message)s")
    )

    root = logging.getLogger()
    root.setLevel(logging.DEBUG)
    root.addHandler(handler)


def main() -> None:
    """Entry point for the `anima` command."""
    from anima.tui.app import AnimaApp

    project_dir = Path.cwd()
    _setup_logging(project_dir)
    app = AnimaApp(project_dir=project_dir)
    app.run()


if __name__ == "__main__":
    main()
