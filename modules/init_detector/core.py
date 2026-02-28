"""Init detector module — Detect tech stacks in an existing project.

Scans for known marker files and returns structured detection results.
See CONTRACT.md for the interface and SPEC.md for implementation details.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from pathlib import Path

from domain.models import DetectionResult, ToolchainEntry

logger = logging.getLogger("anima.init_detector")

_SKIP_DIRS = frozenset(
    {
        ".git",
        "__pycache__",
        "node_modules",
        "venv",
        ".venv",
        ".pytest_cache",
        ".ruff_cache",
        ".anima",
        "iterations",
    }
)


@dataclass(frozen=True)
class _StackConfig:
    """Internal config for a detected tech stack."""

    stack: str
    lint: str
    typecheck: str
    test: str
    coverage: str


# Marker file → stack configuration mapping.
_MARKERS: dict[str, _StackConfig] = {
    "pyproject.toml": _StackConfig(
        stack="python",
        lint="ruff check .",
        typecheck="pyright",
        test="pytest",
        coverage="pytest --cov",
    ),
    "setup.py": _StackConfig(
        stack="python",
        lint="ruff check .",
        typecheck="pyright",
        test="pytest",
        coverage="pytest --cov",
    ),
    "package.json": _StackConfig(
        stack="node",
        lint="eslint .",
        typecheck="tsc --noEmit",
        test="npm test",
        coverage="",
    ),
    "go.mod": _StackConfig(
        stack="go",
        lint="golangci-lint run",
        typecheck="",
        test="go test ./...",
        coverage="go test -coverprofile=coverage.out ./...",
    ),
    "Cargo.toml": _StackConfig(
        stack="rust",
        lint="cargo clippy",
        typecheck="",
        test="cargo test",
        coverage="",
    ),
}


def detect(root: str) -> DetectionResult:
    """Detect tech stacks in the given project directory.

    Scans the project root and immediate subdirectories for known marker
    files (pyproject.toml, package.json, go.mod, Cargo.toml, etc.) and
    returns a structured detection result.

    Args:
        root: Absolute path to the project root.

    Returns:
        A DetectionResult containing all detected tech stacks.
    """
    root_path = Path(root)
    logger.info("Detecting tech stacks at %s", root_path)

    entries: list[ToolchainEntry] = []

    # Scan root directory.
    root_entries = _scan_directory(root_path, ".")
    entries.extend(root_entries)

    # Scan immediate subdirectories.
    try:
        subdirs = sorted(
            d
            for d in root_path.iterdir()
            if d.is_dir() and d.name not in _SKIP_DIRS and not d.name.startswith(".")
        )
    except OSError:
        subdirs = []

    for subdir in subdirs:
        rel_path = subdir.name + "/"
        sub_entries = _scan_directory(subdir, rel_path)
        entries.extend(sub_entries)

    # Sort deterministically by (path, stack).
    entries.sort(key=lambda e: (e.path, e.stack))

    logger.info("Detected %d tech stack(s)", len(entries))
    return DetectionResult(entries=tuple(entries))


def _scan_directory(directory: Path, rel_path: str) -> list[ToolchainEntry]:
    """Scan a single directory for known marker files.

    Args:
        directory: Absolute path to the directory to scan.
        rel_path: Relative path for the ToolchainEntry (e.g. "." or "backend/").

    Returns:
        List of ToolchainEntry for each detected stack.
    """
    seen_stacks: set[str] = set()
    entries: list[ToolchainEntry] = []

    try:
        dir_contents = set(os.listdir(directory))
    except OSError:
        return []

    for marker, config in _MARKERS.items():
        if marker in dir_contents and config.stack not in seen_stacks:
            seen_stacks.add(config.stack)
            entries.append(
                ToolchainEntry(
                    path=rel_path,
                    stack=config.stack,
                    lint=config.lint,
                    typecheck=config.typecheck,
                    test=config.test,
                    coverage=config.coverage,
                )
            )

    return entries
