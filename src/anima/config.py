"""Path constants and configuration loading."""

from pathlib import Path

# .anima/ directory structure
ANIMA_DIR = ".anima"
CONFIG_FILE = "config.yaml"
STATE_FILE = "state.yaml"
MILESTONES_DIR = "milestones"
LOGS_DIR = "logs"


def anima_dir(project_root: Path) -> Path:
    """Return the .anima directory path for a project."""
    return project_root / ANIMA_DIR


def state_file(project_root: Path) -> Path:
    """Return the state.yaml path."""
    return anima_dir(project_root) / STATE_FILE


def config_file(project_root: Path) -> Path:
    """Return the config.yaml path."""
    return anima_dir(project_root) / CONFIG_FILE


def milestones_dir(project_root: Path) -> Path:
    """Return the milestones directory path."""
    return anima_dir(project_root) / MILESTONES_DIR


def logs_dir(project_root: Path) -> Path:
    """Return the logs directory path."""
    return anima_dir(project_root) / LOGS_DIR
