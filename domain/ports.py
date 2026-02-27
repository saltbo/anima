"""Port interfaces for Anima.

All ports are defined as typing.Protocol — structural subtyping means any class
with matching method signatures satisfies the Protocol without inheritance.

This module has ZERO external imports — only stdlib and typing.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from domain.models import (
        ExecutionResult,
        FileInfo,
        IterationPlan,
        IterationRecord,
        QualityResult,
    )


class FileSystemPort(Protocol):
    """Abstraction over file system operations."""

    def read_file(self, path: str) -> str:
        """Read and return the contents of a file."""
        ...

    def write_file(self, path: str, content: str) -> None:
        """Write content to a file, creating parent directories as needed."""
        ...

    def list_files(self, root: str, pattern: str = "**/*") -> list[FileInfo]:
        """List files matching the given glob pattern under root."""
        ...

    def file_exists(self, path: str) -> bool:
        """Return True if the file exists."""
        ...

    def delete_file(self, path: str) -> None:
        """Delete a file."""
        ...

    def make_directory(self, path: str) -> None:
        """Create a directory (and parents) if it doesn't exist."""
        ...


class VersionControlPort(Protocol):
    """Abstraction over version control operations (e.g., git).

    Lifecycle responsibilities beyond basic VCS:
    - commit_and_push: every successful iteration must be pushed to remote
    - tag_milestone: when the project reaches a new semver milestone (e.g.
      v0.1.0 → v0.2.0), create an annotated tag and push it to remote
    """

    def current_branch(self) -> str:
        """Return the name of the current branch."""
        ...

    def current_commit_hash(self) -> str:
        """Return the hash of the current HEAD commit."""
        ...

    def create_snapshot(self, message: str) -> str:
        """Stage all changes and commit. Return the commit hash."""
        ...

    def commit_and_push(self, message: str) -> bool:
        """Stage all changes, commit, and push to remote.

        Returns True if push succeeded.
        """
        ...

    def rollback_to(self, commit_hash: str) -> None:
        """Reset the working tree to the given commit."""
        ...

    def tag_milestone(self, version: str) -> bool:
        """Create an annotated tag (e.g. 'v0.2.0') and push it to remote.

        Should be a no-op if the tag already exists.
        Returns True if a new tag was created and pushed.
        """
        ...

    def has_uncommitted_changes(self) -> bool:
        """Return True if there are uncommitted changes."""
        ...

    def diff_summary(self) -> list[str]:
        """Return a list of changed file paths since last commit."""
        ...


class TestRunnerPort(Protocol):
    """Abstraction over test execution."""

    def run_tests(self) -> QualityResult:
        """Run the test suite and return the result."""
        ...


class LinterPort(Protocol):
    """Abstraction over linting and type checking."""

    def run_lint(self) -> QualityResult:
        """Run the linter (ruff check + ruff format check) and return the result."""
        ...

    def run_typecheck(self) -> QualityResult:
        """Run the type checker (pyright) and return the result."""
        ...


class AgentPort(Protocol):
    """Abstraction over AI coding agents (Claude Code, Codex, Gemini, etc.)."""

    def execute_plan(self, plan: IterationPlan) -> ExecutionResult:
        """Execute an iteration plan and return the result."""
        ...


class ReporterPort(Protocol):
    """Abstraction over iteration reporting / persistence."""

    def save_record(self, record: IterationRecord) -> str:
        """Persist an iteration record. Return the file path."""
        ...

    def load_recent_records(self, count: int) -> list[IterationRecord]:
        """Load the N most recent iteration records."""
        ...
