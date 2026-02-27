"""Local filesystem adapter implementing FileSystemPort.

Uses pathlib for all path operations. All paths are resolved relative to a
configurable base directory.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime
from pathlib import Path

from domain.models import FileInfo


class LocalFileSystem:
    """Concrete FileSystemPort implementation backed by the local filesystem.

    Parameters
    ----------
    base_dir:
        Root directory for all operations. Paths passed to methods are resolved
        relative to this directory.

    """

    def __init__(self, base_dir: str) -> None:
        self._base = Path(base_dir).resolve()

    def _resolve(self, path: str) -> Path:
        """Resolve a relative path against the base directory."""
        return self._base / path

    def read_file(self, path: str) -> str:
        """Read and return the contents of a file."""
        resolved = self._resolve(path)
        return resolved.read_text(encoding="utf-8")

    def write_file(self, path: str, content: str) -> None:
        """Write content to a file, creating parent directories as needed."""
        resolved = self._resolve(path)
        resolved.parent.mkdir(parents=True, exist_ok=True)
        resolved.write_text(content, encoding="utf-8")

    def list_files(self, root: str, pattern: str = "**/*") -> list[FileInfo]:
        """List files matching the given glob pattern under root."""
        resolved_root = self._resolve(root)
        if not resolved_root.is_dir():
            return []

        results: list[FileInfo] = []
        for match in sorted(resolved_root.glob(pattern)):
            if not match.is_file():
                continue
            stat = match.stat()
            mtime = datetime.fromtimestamp(stat.st_mtime, tz=UTC).isoformat()
            rel_path = str(match.relative_to(self._base))
            results.append(
                FileInfo(
                    path=rel_path,
                    size_bytes=stat.st_size,
                    last_modified=mtime,
                )
            )
        return results

    def file_exists(self, path: str) -> bool:
        """Return True if the file exists."""
        return self._resolve(path).is_file()

    def delete_file(self, path: str) -> None:
        """Delete a file."""
        resolved = self._resolve(path)
        resolved.unlink(missing_ok=True)

    def make_directory(self, path: str) -> None:
        """Create a directory (and parents) if it doesn't exist."""
        self._resolve(path).mkdir(parents=True, exist_ok=True)

    @property
    def base_dir(self) -> str:
        """Return the base directory as a string."""
        return os.fspath(self._base)
