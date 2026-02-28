"""Git operations for Anima."""

import asyncio
from pathlib import Path


class GitError(Exception):
    """Raised when a git operation fails."""


async def _run_git(project_dir: Path, *args: str) -> str:
    """Run a git command and return stdout."""
    proc = await asyncio.create_subprocess_exec(
        "git",
        *args,
        cwd=project_dir,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise GitError(f"git {' '.join(args)} failed: {stderr.decode().strip()}")
    return stdout.decode().strip()


class GitOperations:
    """Encapsulates git operations for the scheduler."""

    async def current_commit(self, project_dir: Path) -> str:
        """Get the current HEAD commit hash."""
        return await _run_git(project_dir, "rev-parse", "HEAD")

    async def current_branch(self, project_dir: Path) -> str:
        """Get the current branch name."""
        return await _run_git(project_dir, "rev-parse", "--abbrev-ref", "HEAD")

    async def create_branch(self, project_dir: Path, branch_name: str) -> None:
        """Create and checkout a new branch from current HEAD."""
        await _run_git(project_dir, "checkout", "-b", branch_name)

    async def checkout(self, project_dir: Path, branch_name: str) -> None:
        """Checkout an existing branch."""
        await _run_git(project_dir, "checkout", branch_name)

    async def commit(self, project_dir: Path, message: str) -> str:
        """Stage all changes and commit. Returns the commit hash."""
        await _run_git(project_dir, "add", "-A")
        await _run_git(project_dir, "commit", "-m", message)
        return await self.current_commit(project_dir)

    async def reset_last_commit(self, project_dir: Path) -> None:
        """Soft reset the last commit."""
        await _run_git(project_dir, "reset", "--soft", "HEAD~1")

    async def merge_to_main(self, project_dir: Path, branch_name: str) -> None:
        """Merge a branch into main."""
        main = await self._detect_main_branch(project_dir)
        await _run_git(project_dir, "checkout", main)
        await _run_git(
            project_dir,
            "merge",
            branch_name,
            "--no-ff",
            "-m",
            f"Merge {branch_name} into {main}",
        )

    async def tag(self, project_dir: Path, tag_name: str) -> None:
        """Create a tag at HEAD."""
        await _run_git(project_dir, "tag", tag_name)

    async def delete_branch(self, project_dir: Path, branch_name: str) -> None:
        """Delete a branch."""
        await _run_git(project_dir, "branch", "-D", branch_name)

    async def _detect_main_branch(self, project_dir: Path) -> str:
        """Detect whether the main branch is 'main' or 'master'."""
        try:
            await _run_git(project_dir, "rev-parse", "--verify", "main")
            return "main"
        except GitError:
            return "master"
