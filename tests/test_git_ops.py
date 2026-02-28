"""Tests for git operations."""

import asyncio
import subprocess
from pathlib import Path

import pytest

from anima.git.ops import GitError, GitOperations


@pytest.fixture
def git_repo(tmp_path: Path) -> Path:
    """Create a temporary git repo with an initial commit."""
    subprocess.run(
        ["git", "init", "-b", "main"], cwd=tmp_path, check=True, capture_output=True
    )
    subprocess.run(
        ["git", "config", "user.email", "test@test.com"],
        cwd=tmp_path,
        check=True,
        capture_output=True,
    )
    subprocess.run(
        ["git", "config", "user.name", "Test"],
        cwd=tmp_path,
        check=True,
        capture_output=True,
    )
    (tmp_path / "README.md").write_text("# Test\n")
    subprocess.run(["git", "add", "-A"], cwd=tmp_path, check=True, capture_output=True)
    subprocess.run(
        ["git", "commit", "-m", "init"], cwd=tmp_path, check=True, capture_output=True
    )
    return tmp_path


class TestGitOperations:
    @pytest.fixture
    def ops(self) -> GitOperations:
        return GitOperations()

    async def test_current_commit(self, ops: GitOperations, git_repo: Path) -> None:
        commit = await ops.current_commit(git_repo)
        assert len(commit) == 40

    async def test_current_branch(self, ops: GitOperations, git_repo: Path) -> None:
        branch = await ops.current_branch(git_repo)
        assert branch == "main"

    async def test_create_branch(self, ops: GitOperations, git_repo: Path) -> None:
        await ops.create_branch(git_repo, "milestone/v0.1")
        branch = await ops.current_branch(git_repo)
        assert branch == "milestone/v0.1"

    async def test_commit(self, ops: GitOperations, git_repo: Path) -> None:
        (git_repo / "new_file.txt").write_text("content")
        commit_hash = await ops.commit(git_repo, "feat: add file")
        assert len(commit_hash) == 40

    async def test_reset_last_commit(self, ops: GitOperations, git_repo: Path) -> None:
        (git_repo / "temp.txt").write_text("temp")
        await ops.commit(git_repo, "temp commit")
        before = await ops.current_commit(git_repo)
        await ops.reset_last_commit(git_repo)
        after = await ops.current_commit(git_repo)
        assert before != after

    async def test_tag(self, ops: GitOperations, git_repo: Path) -> None:
        await ops.tag(git_repo, "v0.1.0")
        proc = await asyncio.create_subprocess_exec(
            "git",
            "tag",
            "-l",
            "v0.1.0",
            cwd=git_repo,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()
        assert "v0.1.0" in stdout.decode()

    async def test_merge_to_main(self, ops: GitOperations, git_repo: Path) -> None:
        await ops.create_branch(git_repo, "feature")
        (git_repo / "feature.txt").write_text("feature")
        await ops.commit(git_repo, "feat: feature work")
        await ops.merge_to_main(git_repo, "feature")
        branch = await ops.current_branch(git_repo)
        assert branch == "main"
        assert (git_repo / "feature.txt").exists()

    async def test_git_error_on_bad_command(
        self, ops: GitOperations, git_repo: Path
    ) -> None:
        with pytest.raises(GitError):
            await ops.checkout(git_repo, "nonexistent-branch")
