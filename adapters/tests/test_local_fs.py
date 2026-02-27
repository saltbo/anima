"""Tests for the LocalFileSystem adapter.

All tests use a temporary directory (via tmp_path) so no real project files
are touched.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from adapters.local_fs import LocalFileSystem

if TYPE_CHECKING:
    from pathlib import Path


# ── Test 1: read_file returns content written to disk ──────────────────────


def test_read_file_returns_content(tmp_path: Path) -> None:
    """read_file returns the content that was written to disk."""
    (tmp_path / "hello.txt").write_text("world", encoding="utf-8")

    fs = LocalFileSystem(str(tmp_path))
    assert fs.read_file("hello.txt") == "world"


# ── Test 2: read_file raises FileNotFoundError for missing file ────────────


def test_read_file_raises_for_missing(tmp_path: Path) -> None:
    """read_file raises FileNotFoundError for a nonexistent file."""
    fs = LocalFileSystem(str(tmp_path))
    raised = False
    try:
        fs.read_file("does_not_exist.txt")
    except FileNotFoundError:
        raised = True
    assert raised, "Expected FileNotFoundError"


# ── Test 3: write_file creates file and parent directories ────────────────


def test_write_file_creates_parents(tmp_path: Path) -> None:
    """write_file creates parent directories and writes content."""
    fs = LocalFileSystem(str(tmp_path))
    fs.write_file("a/b/c.txt", "nested content")

    assert (tmp_path / "a" / "b" / "c.txt").read_text(encoding="utf-8") == "nested content"


# ── Test 4: write_file overwrites existing file ───────────────────────────


def test_write_file_overwrites(tmp_path: Path) -> None:
    """write_file overwrites existing file content."""
    fs = LocalFileSystem(str(tmp_path))
    fs.write_file("f.txt", "first")
    fs.write_file("f.txt", "second")

    assert fs.read_file("f.txt") == "second"


# ── Test 5: file_exists returns True/False correctly ──────────────────────


def test_file_exists(tmp_path: Path) -> None:
    """file_exists returns True for existing files, False otherwise."""
    fs = LocalFileSystem(str(tmp_path))
    assert not fs.file_exists("nope.txt")

    fs.write_file("nope.txt", "now I exist")
    assert fs.file_exists("nope.txt")


# ── Test 6: file_exists returns False for directories ─────────────────────


def test_file_exists_false_for_directory(tmp_path: Path) -> None:
    """file_exists returns False for a directory path."""
    fs = LocalFileSystem(str(tmp_path))
    fs.make_directory("subdir")
    assert not fs.file_exists("subdir")


# ── Test 7: delete_file removes the file ──────────────────────────────────


def test_delete_file_removes(tmp_path: Path) -> None:
    """delete_file removes a file from disk."""
    fs = LocalFileSystem(str(tmp_path))
    fs.write_file("doomed.txt", "goodbye")
    assert fs.file_exists("doomed.txt")

    fs.delete_file("doomed.txt")
    assert not fs.file_exists("doomed.txt")


# ── Test 8: delete_file is a no-op for missing file ──────────────────────


def test_delete_file_noop_for_missing(tmp_path: Path) -> None:
    """delete_file does not raise for a nonexistent file."""
    fs = LocalFileSystem(str(tmp_path))
    fs.delete_file("never_existed.txt")  # should not raise


# ── Test 9: make_directory creates nested directories ─────────────────────


def test_make_directory_creates_nested(tmp_path: Path) -> None:
    """make_directory creates nested directory structure."""
    fs = LocalFileSystem(str(tmp_path))
    fs.make_directory("x/y/z")

    assert (tmp_path / "x" / "y" / "z").is_dir()


# ── Test 10: make_directory is idempotent ─────────────────────────────────


def test_make_directory_idempotent(tmp_path: Path) -> None:
    """make_directory does not raise if directory already exists."""
    fs = LocalFileSystem(str(tmp_path))
    fs.make_directory("existing")
    fs.make_directory("existing")  # should not raise

    assert (tmp_path / "existing").is_dir()


# ── Test 11: list_files finds all files recursively ──────────────────────


def test_list_files_recursive(tmp_path: Path) -> None:
    """list_files with default pattern returns all files recursively."""
    fs = LocalFileSystem(str(tmp_path))
    fs.write_file("root.txt", "r")
    fs.write_file("sub/deep.txt", "d")

    files = fs.list_files(".")
    paths = [f.path for f in files]
    assert "root.txt" in paths
    assert "sub/deep.txt" in paths


# ── Test 12: list_files with glob pattern ────────────────────────────────


def test_list_files_with_pattern(tmp_path: Path) -> None:
    """list_files filters by glob pattern."""
    fs = LocalFileSystem(str(tmp_path))
    fs.write_file("a.py", "python")
    fs.write_file("b.txt", "text")
    fs.write_file("sub/c.py", "nested python")

    py_files = fs.list_files(".", "**/*.py")
    paths = [f.path for f in py_files]
    assert "a.py" in paths
    assert "sub/c.py" in paths
    assert "b.txt" not in paths


# ── Test 13: list_files returns empty list for nonexistent directory ──────


def test_list_files_empty_for_missing_dir(tmp_path: Path) -> None:
    """list_files returns empty list if root directory does not exist."""
    fs = LocalFileSystem(str(tmp_path))
    files = fs.list_files("nonexistent")
    assert files == []


# ── Test 14: list_files returns FileInfo with correct metadata ───────────


def test_list_files_metadata(tmp_path: Path) -> None:
    """list_files returns FileInfo with size_bytes and last_modified."""
    fs = LocalFileSystem(str(tmp_path))
    fs.write_file("meta.txt", "hello")

    files = fs.list_files(".")
    assert len(files) == 1
    info = files[0]
    assert info.path == "meta.txt"
    assert info.size_bytes == 5
    assert info.last_modified != ""  # ISO timestamp is populated


# ── Test 15: round-trip write → read preserves content ───────────────────


def test_round_trip_unicode(tmp_path: Path) -> None:
    """Write and read back Unicode content preserves it exactly."""
    fs = LocalFileSystem(str(tmp_path))
    content = "日本語テスト 🚀 émojis"
    fs.write_file("unicode.txt", content)
    assert fs.read_file("unicode.txt") == content


# ── Test 16: base_dir property ───────────────────────────────────────────


def test_base_dir_property(tmp_path: Path) -> None:
    """base_dir property returns the resolved base directory."""
    fs = LocalFileSystem(str(tmp_path))
    assert fs.base_dir == str(tmp_path.resolve())
