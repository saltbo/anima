"""CLI entry point for anima."""

from pathlib import Path


def main() -> None:
    """Entry point for the `anima` command."""
    from anima.tui.app import AnimaApp

    project_dir = Path.cwd()
    app = AnimaApp(project_dir=project_dir)
    app.run()


if __name__ == "__main__":
    main()
