"""Initialize the .anima/ directory structure."""

from pathlib import Path

from anima.config import (
    anima_dir,
    config_file,
    logs_dir,
    milestones_dir,
    state_file,
)

_DEFAULT_CONFIG = """\
# Anima project configuration
version: "0.1"
agent:
  model: sonnet
"""

_DEFAULT_STATE = """\
current_milestone: ""
milestones: {}
"""

_GITIGNORE = """\
logs/
"""


def is_initialized(project_root: Path) -> bool:
    """Check if .anima/ directory exists and is initialized."""
    return anima_dir(project_root).is_dir()


def initialize(project_root: Path) -> Path:
    """Initialize .anima/ directory structure.

    Returns the path to the .anima directory.
    """
    root = anima_dir(project_root)
    root.mkdir(exist_ok=True)
    milestones_dir(project_root).mkdir(exist_ok=True)
    logs_dir(project_root).mkdir(exist_ok=True)

    cf = config_file(project_root)
    if not cf.exists():
        cf.write_text(_DEFAULT_CONFIG)

    sf = state_file(project_root)
    if not sf.exists():
        sf.write_text(_DEFAULT_STATE)

    gitignore = root / ".gitignore"
    if not gitignore.exists():
        gitignore.write_text(_GITIGNORE)

    return root
