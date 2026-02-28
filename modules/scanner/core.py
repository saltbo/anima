"""Scanner module — Scan project structure and produce a ProjectState snapshot.

Replaces kernel.seed.scan_project_state with structured domain-type output.
See CONTRACT.md for the interface and SPEC.md for the implementation details.
"""

from __future__ import annotations

import hashlib
import logging
import os
import subprocess
from pathlib import Path

from domain.models import (
    InboxItem,
    ModuleInfo,
    ProjectState,
    QualityCheckResult,
    QualityReport,
    TestResult,
)

logger = logging.getLogger("anima.scanner")

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

_PROTECTED_PATHS = ["VISION.md", "kernel/"]


def scan(root: str) -> ProjectState:
    """Scan the project tree and return a structured ProjectState.

    Args:
        root: Absolute path to the project root.

    Returns:
        A fully populated ProjectState snapshot.
    """
    root_path = Path(root)
    logger.info("Scanning project at %s", root_path)

    files = collect_files(root_path)
    modules = discover_modules(root_path)
    inbox_items = read_inbox(root_path)
    quality_results = _run_quality_checks(root_path)
    test_results = _run_tests(root_path)
    protected_hashes = compute_protected_hashes(root_path)

    domain_dir = root_path / "domain"
    adapters_dir = root_path / "adapters"
    kernel_dir = root_path / "kernel"

    has_tests = any("test_" in f and f.endswith(".py") for f in files)

    state = ProjectState(
        files=tuple(files),
        modules=tuple(modules),
        domain_exists=domain_dir.exists() and any(domain_dir.rglob("*.py")),
        adapters_exist=adapters_dir.exists() and any(adapters_dir.rglob("*.py")),
        kernel_exists=kernel_dir.exists() and any(kernel_dir.rglob("*.py")),
        has_tests=has_tests,
        has_pyproject=(root_path / "pyproject.toml").exists(),
        has_pyrightconfig=(root_path / "pyrightconfig.json").exists(),
        inbox_items=tuple(inbox_items),
        quality_results=quality_results,
        test_results=test_results,
        protected_hashes=tuple(protected_hashes),
    )

    logger.info(
        "Scan complete: %d files, %d modules",
        len(state.files),
        len(state.modules),
    )
    return state


def collect_files(root: Path) -> list[str]:
    """Walk the project tree and collect sorted relative file paths."""
    files: list[str] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d not in _SKIP_DIRS)
        for filename in sorted(filenames):
            rel = os.path.relpath(os.path.join(dirpath, filename), root)
            files.append(rel)
    return files


def discover_modules(root: Path) -> list[ModuleInfo]:
    """Discover pipeline modules under modules/."""
    modules_dir = root / "modules"
    if not modules_dir.exists():
        return []

    result: list[ModuleInfo] = []
    for module_dir in sorted(modules_dir.iterdir()):
        if not module_dir.is_dir() or module_dir.name.startswith("."):
            continue

        module_files: list[str] = []
        for f in module_dir.rglob("*"):
            if f.is_file():
                module_files.append(str(f.relative_to(module_dir)))

        tests_dir = module_dir / "tests"
        has_tests = tests_dir.exists() and any(tests_dir.rglob("test_*.py"))

        info = ModuleInfo(
            name=module_dir.name,
            has_contract=(module_dir / "CONTRACT.md").exists(),
            has_spec=(module_dir / "SPEC.md").exists(),
            has_core=(module_dir / "core.py").exists(),
            has_tests=has_tests,
            files=tuple(module_files),
        )
        result.append(info)

    return result


def read_inbox(root: Path) -> list[InboxItem]:
    """Read inbox/*.md files as InboxItem entries."""
    inbox_dir = root / "inbox"
    if not inbox_dir.exists():
        return []

    items: list[InboxItem] = []
    for item_path in sorted(inbox_dir.iterdir()):
        if item_path.is_file() and item_path.suffix == ".md":
            items.append(
                InboxItem(
                    filename=item_path.name,
                    content=item_path.read_text(),
                )
            )
    return items


def _run_quality_checks(root: Path) -> QualityReport | None:
    """Run ruff and pyright, returning a QualityReport."""
    exclude_args = ["--exclude", "kernel/"]

    ruff_lint = _run_check(["ruff", "check", ".", *exclude_args], root)
    ruff_format = _run_check(["ruff", "format", "--check", ".", *exclude_args], root)
    pyright = _run_check(["pyright"], root, timeout=120)

    if ruff_lint is None and ruff_format is None and pyright is None:
        return None

    return QualityReport(
        ruff_lint=ruff_lint,
        ruff_format=ruff_format,
        pyright=pyright,
    )


def _run_check(cmd: list[str], cwd: Path, timeout: int = 60) -> QualityCheckResult | None:
    """Run a single quality check command."""
    try:
        r = subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return QualityCheckResult(
            passed=r.returncode == 0,
            output=(r.stdout + r.stderr)[-1000:],
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None


def _run_tests(root: Path) -> TestResult | None:
    """Run pytest and return a TestResult."""
    try:
        r = subprocess.run(
            ["python", "-m", "pytest", "--tb=short", "-q"],
            cwd=root,
            capture_output=True,
            text=True,
            timeout=120,
        )
        return TestResult(
            exit_code=r.returncode,
            passed=r.returncode == 0,
            output=r.stdout[-2000:] if r.stdout else "",
            errors=r.stderr[-2000:] if r.stderr else "",
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None


def _file_hash(path: Path) -> str | None:
    """Compute SHA-256 hash of a file, or None if it doesn't exist."""
    if not path.exists():
        return None
    return hashlib.sha256(path.read_bytes()).hexdigest()


def compute_protected_hashes(root: Path) -> list[tuple[str, str | None]]:
    """Compute SHA-256 hashes for all files under protected paths."""
    hashes: list[tuple[str, str | None]] = []
    for p in _PROTECTED_PATHS:
        path = root / p
        if path.is_file():
            hashes.append((p, _file_hash(path)))
        elif path.is_dir():
            for f in sorted(path.rglob("*")):
                if f.is_file() and "__pycache__" not in f.parts and f.suffix != ".pyc":
                    rel = str(f.relative_to(root))
                    hashes.append((rel, _file_hash(f)))
    return hashes
