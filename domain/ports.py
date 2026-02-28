"""Abstract interfaces (Ports) for all external dependencies.

All ports are defined as typing.Protocol classes (PEP 544).
This module has ZERO imports from outside the Python standard library.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from domain.models import ExecutionResult, QualityReport, TestResult


class AgentPort(Protocol):
    """AI agent abstraction for executing iteration plans."""

    def execute(self, prompt: str) -> ExecutionResult:
        """Execute a prompt and return the result."""
        ...


class VersionControlPort(Protocol):
    """Version control abstraction for snapshots, commits, and rollbacks."""

    def snapshot(self) -> str:
        """Take a snapshot and return its identifier."""
        ...

    def commit(self, message: str) -> None:
        """Commit current changes with the given message."""
        ...

    def rollback(self, snapshot_id: str) -> None:
        """Rollback to a previous snapshot."""
        ...


class TestRunnerPort(Protocol):
    """Test execution abstraction."""

    def run_tests(self) -> TestResult:
        """Run the test suite and return results."""
        ...


class LinterPort(Protocol):
    """Lint and type-check abstraction."""

    def check(self) -> QualityReport:
        """Run all quality checks and return aggregated results."""
        ...


class FileSystemPort(Protocol):
    """File system operations abstraction."""

    def read_file(self, path: str) -> str:
        """Read and return the contents of a file."""
        ...

    def write_file(self, path: str, content: str) -> None:
        """Write content to a file."""
        ...

    def list_files(self, root: str) -> list[str]:
        """List all files under a root directory."""
        ...

    def file_exists(self, path: str) -> bool:
        """Check if a file exists."""
        ...

    def dir_exists(self, path: str) -> bool:
        """Check if a directory exists."""
        ...
