"""Git version control adapter implementing VersionControlPort.

Uses subprocess to invoke git commands. All operations are relative to a
configurable repository root directory.
"""

from __future__ import annotations

import subprocess
from pathlib import Path


class GitVersionControl:
    """Concrete VersionControlPort implementation backed by git CLI.

    Parameters
    ----------
    repo_dir:
        Root directory of the git repository. All git commands execute
        with this as the working directory.

    """

    def __init__(self, repo_dir: str) -> None:
        self._root = Path(repo_dir).resolve()

    def _run(
        self,
        args: list[str],
        *,
        check: bool = True,
        capture: bool = True,
    ) -> subprocess.CompletedProcess[str]:
        """Run a git command in the repository directory."""
        return subprocess.run(
            ["git", *args],
            cwd=self._root,
            capture_output=capture,
            text=True,
            check=check,
        )

    def current_branch(self) -> str:
        """Return the name of the current branch."""
        result = self._run(["rev-parse", "--abbrev-ref", "HEAD"])
        return result.stdout.strip()

    def current_commit_hash(self) -> str:
        """Return the hash of the current HEAD commit."""
        result = self._run(["rev-parse", "HEAD"])
        return result.stdout.strip()

    def create_snapshot(self, message: str) -> str:
        """Stage all changes and commit. Return the commit hash."""
        self._run(["add", "-A"])
        self._run(["commit", "-m", message])
        return self.current_commit_hash()

    def commit_and_push(self, message: str) -> bool:
        """Stage all changes, commit, and push to remote.

        Returns True if push succeeded.
        """
        self._run(["add", "-A"])
        self._run(["commit", "-m", message])
        push = self._run(["push"], check=False)
        return push.returncode == 0

    def rollback_to(self, commit_hash: str) -> None:
        """Reset the working tree to the given commit."""
        self._run(["reset", "--hard", commit_hash])

    def tag_milestone(self, version: str) -> bool:
        """Create an annotated tag and push it to remote.

        Returns False if the tag already exists locally.
        """
        tag_check = self._run(["tag", "-l", version])
        if tag_check.stdout.strip():
            return False

        self._run(["tag", "-a", version, "-m", f"Milestone {version}"])
        push = self._run(["push", "origin", version], check=False)
        return push.returncode == 0

    def has_uncommitted_changes(self) -> bool:
        """Return True if there are uncommitted changes."""
        result = self._run(["status", "--porcelain"])
        return bool(result.stdout.strip())

    def diff_summary(self) -> list[str]:
        """Return a list of changed file paths since last commit."""
        result = self._run(["diff", "--name-only", "HEAD"], check=False)
        # Also include untracked files
        untracked = self._run(
            ["ls-files", "--others", "--exclude-standard"],
            check=False,
        )
        lines = result.stdout.strip().splitlines() + untracked.stdout.strip().splitlines()
        return [line for line in lines if line]

    @property
    def repo_dir(self) -> str:
        """Return the repository directory as a string."""
        return str(self._root)
