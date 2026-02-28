"""Tests for modules/scanner — validates SPEC.md behavior.

These tests verify the scanner module's scanning logic using temporary
project trees, without running real quality checks or tests.
"""

from __future__ import annotations

import os
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pathlib import Path

from domain.models import (
    InboxItem,
    ModuleInfo,
    ProjectState,
    QualityReport,
    TestResult,
)
from modules.scanner.core import (
    collect_files,
    compute_protected_hashes,
    discover_modules,
    read_inbox,
    scan,
)


def _build_project(tmp_path: Path) -> Path:
    """Build a minimal project tree for testing."""
    # Core dirs
    (tmp_path / "domain").mkdir()
    (tmp_path / "domain" / "models.py").write_text("# models")
    (tmp_path / "kernel").mkdir()
    (tmp_path / "kernel" / "seed.py").write_text("# seed")
    (tmp_path / "adapters").mkdir()
    (tmp_path / "adapters" / "__init__.py").write_text("")

    # A module with full structure
    mod = tmp_path / "modules" / "scanner"
    (mod / "tests").mkdir(parents=True)
    (mod / "__init__.py").write_text("")
    (mod / "CONTRACT.md").write_text("# Contract")
    (mod / "SPEC.md").write_text("# Spec")
    (mod / "core.py").write_text("# core")
    (mod / "tests" / "test_scanner.py").write_text("# test")

    # A module with only __init__.py (incomplete)
    bare = tmp_path / "modules" / "bare"
    bare.mkdir(parents=True)
    (bare / "__init__.py").write_text("")

    # Config files
    (tmp_path / "pyproject.toml").write_text("[project]")
    (tmp_path / "pyrightconfig.json").write_text("{}")

    # Inbox
    inbox = tmp_path / "inbox"
    inbox.mkdir()
    (inbox / "task1.md").write_text("Do something")

    # Protected file
    (tmp_path / "VISION.md").write_text("# Vision")

    # Skipped dirs (should not appear in output)
    (tmp_path / ".git").mkdir()
    (tmp_path / ".git" / "HEAD").write_text("ref: refs/heads/main")
    (tmp_path / "__pycache__").mkdir()
    (tmp_path / "__pycache__" / "foo.cpython-312.pyc").write_bytes(b"\x00")

    return tmp_path


# ---- _collect_files ----


def test_collect_files_is_deterministic(tmp_path: Path) -> None:
    root = _build_project(tmp_path)
    first = collect_files(root)
    second = collect_files(root)
    assert first == second


def test_collect_files_skips_git_and_pycache(tmp_path: Path) -> None:
    root = _build_project(tmp_path)
    files = collect_files(root)
    for f in files:
        assert ".git" not in f.split(os.sep)
        assert "__pycache__" not in f.split(os.sep)


def test_collect_files_includes_expected(tmp_path: Path) -> None:
    root = _build_project(tmp_path)
    files = collect_files(root)
    assert "pyproject.toml" in files
    assert "VISION.md" in files
    assert os.path.join("domain", "models.py") in files


# ---- _discover_modules ----


def test_discover_modules_finds_all(tmp_path: Path) -> None:
    root = _build_project(tmp_path)
    modules = discover_modules(root)
    names = [m.name for m in modules]
    assert "scanner" in names
    assert "bare" in names


def test_discover_modules_detects_structure(tmp_path: Path) -> None:
    root = _build_project(tmp_path)
    modules = {m.name: m for m in discover_modules(root)}

    scanner = modules["scanner"]
    assert scanner.has_contract is True
    assert scanner.has_spec is True
    assert scanner.has_core is True
    assert scanner.has_tests is True
    assert isinstance(scanner.files, tuple)

    bare = modules["bare"]
    assert bare.has_contract is False
    assert bare.has_spec is False
    assert bare.has_core is False
    assert bare.has_tests is False


def test_discover_modules_returns_module_info(tmp_path: Path) -> None:
    root = _build_project(tmp_path)
    modules = discover_modules(root)
    for m in modules:
        assert isinstance(m, ModuleInfo)


# ---- _read_inbox ----


def test_read_inbox_reads_md_files(tmp_path: Path) -> None:
    root = _build_project(tmp_path)
    items = read_inbox(root)
    assert len(items) == 1
    assert items[0].filename == "task1.md"
    assert items[0].content == "Do something"
    assert isinstance(items[0], InboxItem)


def test_read_inbox_empty_when_no_dir(tmp_path: Path) -> None:
    assert read_inbox(tmp_path) == []


# ---- _compute_protected_hashes ----


def test_protected_hashes_covers_vision(tmp_path: Path) -> None:
    root = _build_project(tmp_path)
    hashes = compute_protected_hashes(root)
    paths = [h[0] for h in hashes]
    assert "VISION.md" in paths


def test_protected_hashes_covers_kernel_files(tmp_path: Path) -> None:
    root = _build_project(tmp_path)
    hashes = compute_protected_hashes(root)
    paths = [h[0] for h in hashes]
    assert any(p.startswith("kernel/") or p.startswith("kernel" + os.sep) for p in paths)


def test_protected_hashes_excludes_pycache(tmp_path: Path) -> None:
    root = _build_project(tmp_path)
    # Add a __pycache__ inside kernel
    pycache = root / "kernel" / "__pycache__"
    pycache.mkdir()
    (pycache / "seed.cpython-312.pyc").write_bytes(b"\x00")

    hashes = compute_protected_hashes(root)
    paths = [h[0] for h in hashes]
    for p in paths:
        assert "__pycache__" not in p
        assert not p.endswith(".pyc")


# ---- scan (integration) ----


def test_scan_returns_project_state(tmp_path: Path) -> None:
    root = _build_project(tmp_path)
    state = scan(str(root))
    assert isinstance(state, ProjectState)


def test_scan_populates_layer_checks(tmp_path: Path) -> None:
    root = _build_project(tmp_path)
    state = scan(str(root))
    assert state.domain_exists is True
    assert state.adapters_exist is True
    assert state.kernel_exists is True


def test_scan_detects_config_files(tmp_path: Path) -> None:
    root = _build_project(tmp_path)
    state = scan(str(root))
    assert state.has_pyproject is True
    assert state.has_pyrightconfig is True


def test_scan_detects_tests(tmp_path: Path) -> None:
    root = _build_project(tmp_path)
    state = scan(str(root))
    assert state.has_tests is True


def test_scan_uses_tuples(tmp_path: Path) -> None:
    """ProjectState fields use tuples, not lists (frozen dataclass)."""
    root = _build_project(tmp_path)
    state = scan(str(root))
    assert isinstance(state.files, tuple)
    assert isinstance(state.modules, tuple)
    assert isinstance(state.inbox_items, tuple)
    assert isinstance(state.protected_hashes, tuple)


def test_scan_quality_and_tests_may_be_none(tmp_path: Path) -> None:
    """Quality checks and tests can be None if tools are unavailable."""
    root = _build_project(tmp_path)
    state = scan(str(root))
    # These might be None or populated depending on the environment
    assert state.quality_results is None or isinstance(state.quality_results, QualityReport)
    assert state.test_results is None or isinstance(state.test_results, TestResult)
