"""Tests for the init_detector module.

Validates tech stack detection against CONTRACT.md and SPEC.md.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from domain.models import DetectionResult, ToolchainEntry

if TYPE_CHECKING:
    from pathlib import Path
from modules.init_detector.core import detect


class TestDetectEmpty:
    """No marker files → empty result."""

    def test_empty_directory(self, tmp_path: Path) -> None:
        """An empty directory produces no entries."""
        result = detect(str(tmp_path))
        assert isinstance(result, DetectionResult)
        assert result.entries == ()

    def test_no_known_markers(self, tmp_path: Path) -> None:
        """Files that are not known markers produce no entries."""
        (tmp_path / "README.md").write_text("hello")
        (tmp_path / "Makefile").write_text("all:")
        result = detect(str(tmp_path))
        assert result.entries == ()


class TestDetectPython:
    """Python stack detection via pyproject.toml or setup.py."""

    def test_pyproject_toml(self, tmp_path: Path) -> None:
        """pyproject.toml triggers Python detection."""
        (tmp_path / "pyproject.toml").write_text("[project]\nname = 'foo'")
        result = detect(str(tmp_path))
        assert len(result.entries) == 1
        entry = result.entries[0]
        assert entry.path == "."
        assert entry.stack == "python"
        assert entry.lint == "ruff check ."
        assert entry.typecheck == "pyright"
        assert entry.test == "pytest"
        assert entry.coverage == "pytest --cov"

    def test_setup_py(self, tmp_path: Path) -> None:
        """setup.py triggers Python detection."""
        (tmp_path / "setup.py").write_text("from setuptools import setup; setup()")
        result = detect(str(tmp_path))
        assert len(result.entries) == 1
        assert result.entries[0].stack == "python"

    def test_both_pyproject_and_setup_py_produce_single_entry(self, tmp_path: Path) -> None:
        """Having both pyproject.toml and setup.py produces one Python entry."""
        (tmp_path / "pyproject.toml").write_text("[project]")
        (tmp_path / "setup.py").write_text("setup()")
        result = detect(str(tmp_path))
        python_entries = [e for e in result.entries if e.stack == "python"]
        assert len(python_entries) == 1


class TestDetectNode:
    """Node stack detection via package.json."""

    def test_package_json(self, tmp_path: Path) -> None:
        """package.json triggers Node detection."""
        (tmp_path / "package.json").write_text("{}")
        result = detect(str(tmp_path))
        assert len(result.entries) == 1
        entry = result.entries[0]
        assert entry.stack == "node"
        assert entry.lint == "eslint ."
        assert entry.typecheck == "tsc --noEmit"
        assert entry.test == "npm test"


class TestDetectGo:
    """Go stack detection via go.mod."""

    def test_go_mod(self, tmp_path: Path) -> None:
        """go.mod triggers Go detection."""
        (tmp_path / "go.mod").write_text("module example.com/foo")
        result = detect(str(tmp_path))
        assert len(result.entries) == 1
        entry = result.entries[0]
        assert entry.stack == "go"
        assert entry.lint == "golangci-lint run"
        assert entry.typecheck == ""
        assert entry.test == "go test ./..."


class TestDetectRust:
    """Rust stack detection via Cargo.toml."""

    def test_cargo_toml(self, tmp_path: Path) -> None:
        """Cargo.toml triggers Rust detection."""
        (tmp_path / "Cargo.toml").write_text("[package]\nname = 'foo'")
        result = detect(str(tmp_path))
        assert len(result.entries) == 1
        entry = result.entries[0]
        assert entry.stack == "rust"
        assert entry.lint == "cargo clippy"
        assert entry.test == "cargo test"


class TestDetectSubdirectories:
    """Detection in immediate subdirectories."""

    def test_subdirectory_detection(self, tmp_path: Path) -> None:
        """Marker in a subdirectory produces entry with subdir path."""
        backend = tmp_path / "backend"
        backend.mkdir()
        (backend / "go.mod").write_text("module example.com/backend")
        result = detect(str(tmp_path))
        assert len(result.entries) == 1
        assert result.entries[0].path == "backend/"
        assert result.entries[0].stack == "go"

    def test_root_and_subdirectory(self, tmp_path: Path) -> None:
        """Stacks in both root and subdirectory are all detected."""
        (tmp_path / "pyproject.toml").write_text("[project]")
        frontend = tmp_path / "frontend"
        frontend.mkdir()
        (frontend / "package.json").write_text("{}")
        result = detect(str(tmp_path))
        assert len(result.entries) == 2
        paths = [e.path for e in result.entries]
        assert "." in paths
        assert "frontend/" in paths

    def test_multiple_subdirectories(self, tmp_path: Path) -> None:
        """Full-stack project with multiple subdirectory stacks."""
        backend = tmp_path / "backend"
        backend.mkdir()
        (backend / "go.mod").write_text("module example.com/backend")
        frontend = tmp_path / "frontend"
        frontend.mkdir()
        (frontend / "package.json").write_text("{}")
        result = detect(str(tmp_path))
        assert len(result.entries) == 2
        stacks = {e.stack for e in result.entries}
        assert stacks == {"go", "node"}


class TestSkipDirectories:
    """Hidden and special directories are skipped."""

    def test_skip_hidden_directory(self, tmp_path: Path) -> None:
        """Directories starting with '.' are skipped."""
        hidden = tmp_path / ".hidden"
        hidden.mkdir()
        (hidden / "package.json").write_text("{}")
        result = detect(str(tmp_path))
        assert result.entries == ()

    def test_skip_node_modules(self, tmp_path: Path) -> None:
        """node_modules directory is skipped."""
        nm = tmp_path / "node_modules"
        nm.mkdir()
        (nm / "package.json").write_text("{}")
        result = detect(str(tmp_path))
        assert result.entries == ()

    def test_skip_venv(self, tmp_path: Path) -> None:
        """venv directory is skipped."""
        venv = tmp_path / "venv"
        venv.mkdir()
        (venv / "pyproject.toml").write_text("[project]")
        result = detect(str(tmp_path))
        assert result.entries == ()


class TestDeterministicOrder:
    """Entries are sorted by (path, stack)."""

    def test_sorted_by_path_then_stack(self, tmp_path: Path) -> None:
        """Entries are returned in deterministic order."""
        (tmp_path / "pyproject.toml").write_text("[project]")
        (tmp_path / "package.json").write_text("{}")
        alpha = tmp_path / "alpha"
        alpha.mkdir()
        (alpha / "Cargo.toml").write_text("[package]")
        result = detect(str(tmp_path))
        paths_stacks = [(e.path, e.stack) for e in result.entries]
        assert paths_stacks == sorted(paths_stacks)


class TestReturnTypes:
    """All return values match domain model types."""

    def test_return_type(self, tmp_path: Path) -> None:
        """detect() returns DetectionResult."""
        result = detect(str(tmp_path))
        assert isinstance(result, DetectionResult)

    def test_entry_type(self, tmp_path: Path) -> None:
        """Each entry is a ToolchainEntry."""
        (tmp_path / "go.mod").write_text("module foo")
        result = detect(str(tmp_path))
        assert all(isinstance(e, ToolchainEntry) for e in result.entries)

    def test_entries_is_tuple(self, tmp_path: Path) -> None:
        """entries field is a tuple, not a list."""
        (tmp_path / "go.mod").write_text("module foo")
        result = detect(str(tmp_path))
        assert isinstance(result.entries, tuple)


class TestNonexistentPath:
    """Graceful handling of invalid paths."""

    def test_nonexistent_root(self, tmp_path: Path) -> None:
        """A nonexistent root returns empty result."""
        result = detect(str(tmp_path / "nonexistent"))
        assert result.entries == ()
