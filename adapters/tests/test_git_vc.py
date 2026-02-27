"""Tests for the GitVersionControl adapter.

All tests use a temporary directory initialized as a git repo so no real
project files are touched.
"""

from __future__ import annotations

import subprocess
from typing import TYPE_CHECKING

import pytest

from adapters.git_vc import GitVersionControl

if TYPE_CHECKING:
    from pathlib import Path


@pytest.fixture()
def git_repo(tmp_path: Path) -> Path:
    """Create a temporary git repository with an initial commit."""
    subprocess.run(["git", "init"], cwd=tmp_path, capture_output=True, text=True, check=True)
    subprocess.run(
        ["git", "config", "user.email", "test@anima.dev"],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=True,
    )
    subprocess.run(
        ["git", "config", "user.name", "Anima Test"],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=True,
    )
    # Create initial commit so HEAD exists
    (tmp_path / "README.md").write_text("# Test Repo", encoding="utf-8")
    subprocess.run(["git", "add", "-A"], cwd=tmp_path, capture_output=True, text=True, check=True)
    subprocess.run(
        ["git", "commit", "-m", "Initial commit"],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=True,
    )
    return tmp_path


# ── Test 1: current_branch returns correct branch name ─────────────────────


def test_current_branch(git_repo: Path) -> None:
    """current_branch returns the name of the active branch."""
    vc = GitVersionControl(str(git_repo))
    branch = vc.current_branch()
    # Git defaults to "main" or "master" depending on config
    assert branch in ("main", "master")


# ── Test 2: current_commit_hash returns a valid hash ───────────────────────


def test_current_commit_hash(git_repo: Path) -> None:
    """current_commit_hash returns a 40-character hex string."""
    vc = GitVersionControl(str(git_repo))
    commit_hash = vc.current_commit_hash()
    assert len(commit_hash) == 40
    assert all(c in "0123456789abcdef" for c in commit_hash)


# ── Test 3: has_uncommitted_changes detects changes ────────────────────────


def test_has_uncommitted_changes_false_when_clean(git_repo: Path) -> None:
    """has_uncommitted_changes returns False on a clean working tree."""
    vc = GitVersionControl(str(git_repo))
    assert not vc.has_uncommitted_changes()


def test_has_uncommitted_changes_true_with_new_file(git_repo: Path) -> None:
    """has_uncommitted_changes returns True when new files exist."""
    (git_repo / "new.txt").write_text("hello", encoding="utf-8")
    vc = GitVersionControl(str(git_repo))
    assert vc.has_uncommitted_changes()


def test_has_uncommitted_changes_true_with_modified_file(git_repo: Path) -> None:
    """has_uncommitted_changes returns True when tracked files are modified."""
    (git_repo / "README.md").write_text("modified", encoding="utf-8")
    vc = GitVersionControl(str(git_repo))
    assert vc.has_uncommitted_changes()


# ── Test 4: create_snapshot stages and commits ─────────────────────────────


def test_create_snapshot(git_repo: Path) -> None:
    """create_snapshot stages all changes and returns the new commit hash."""
    vc = GitVersionControl(str(git_repo))
    (git_repo / "feature.py").write_text("print('hi')", encoding="utf-8")

    old_hash = vc.current_commit_hash()
    new_hash = vc.create_snapshot("Add feature.py")

    assert new_hash != old_hash
    assert len(new_hash) == 40
    assert not vc.has_uncommitted_changes()


# ── Test 5: rollback_to resets to a prior commit ──────────────────────────


def test_rollback_to(git_repo: Path) -> None:
    """rollback_to resets the working tree to a prior commit."""
    vc = GitVersionControl(str(git_repo))
    original_hash = vc.current_commit_hash()

    (git_repo / "temp.txt").write_text("temporary", encoding="utf-8")
    vc.create_snapshot("Add temp file")
    assert (git_repo / "temp.txt").exists()

    vc.rollback_to(original_hash)
    assert vc.current_commit_hash() == original_hash
    assert not (git_repo / "temp.txt").exists()


# ── Test 6: diff_summary lists changed files ──────────────────────────────


def test_diff_summary_empty_when_clean(git_repo: Path) -> None:
    """diff_summary returns empty list on a clean working tree."""
    vc = GitVersionControl(str(git_repo))
    assert vc.diff_summary() == []


def test_diff_summary_with_untracked_file(git_repo: Path) -> None:
    """diff_summary includes untracked files."""
    (git_repo / "untracked.txt").write_text("new", encoding="utf-8")
    vc = GitVersionControl(str(git_repo))
    summary = vc.diff_summary()
    assert "untracked.txt" in summary


def test_diff_summary_with_modified_file(git_repo: Path) -> None:
    """diff_summary includes modified tracked files."""
    vc = GitVersionControl(str(git_repo))
    # Stage the file first so HEAD diff shows it
    (git_repo / "README.md").write_text("changed content", encoding="utf-8")
    summary = vc.diff_summary()
    assert "README.md" in summary


# ── Test 7: tag_milestone creates a tag ────────────────────────────────────


def test_tag_milestone_creates_tag(git_repo: Path) -> None:
    """tag_milestone creates an annotated tag locally."""
    vc = GitVersionControl(str(git_repo))
    # No remote, so push will fail, but tag should be created locally
    vc.tag_milestone("v0.1.0")

    result = subprocess.run(
        ["git", "tag", "-l", "v0.1.0"],
        cwd=git_repo,
        capture_output=True,
        text=True,
        check=True,
    )
    assert "v0.1.0" in result.stdout


def test_tag_milestone_noop_if_exists(git_repo: Path) -> None:
    """tag_milestone returns False if the tag already exists."""
    vc = GitVersionControl(str(git_repo))
    vc.tag_milestone("v0.1.0")
    result = vc.tag_milestone("v0.1.0")
    assert result is False


# ── Test 8: commit_and_push stages and commits (push fails without remote) ─


def test_commit_and_push_commits_changes(git_repo: Path) -> None:
    """commit_and_push creates a commit even when push fails (no remote)."""
    vc = GitVersionControl(str(git_repo))
    (git_repo / "pushed.txt").write_text("data", encoding="utf-8")

    old_hash = vc.current_commit_hash()
    # Push will fail (no remote), but commit should succeed
    result = vc.commit_and_push("Push test")

    assert result is False  # no remote
    assert vc.current_commit_hash() != old_hash
    assert not vc.has_uncommitted_changes()


# ── Test 9: repo_dir property ─────────────────────────────────────────────


def test_repo_dir_property(git_repo: Path) -> None:
    """repo_dir property returns the resolved repository directory."""
    vc = GitVersionControl(str(git_repo))
    assert vc.repo_dir == str(git_repo.resolve())
