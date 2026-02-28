"""Tests for kernel/git_ops.py — git wrapper, snapshot, commit, rollback."""

from __future__ import annotations

import subprocess
from unittest.mock import MagicMock, patch

from kernel import git_ops

# ---------------------------------------------------------------------------
# git()
# ---------------------------------------------------------------------------


@patch("kernel.git_ops.subprocess.run")
def test_git_returns_returncode_and_output(mock_run: MagicMock) -> None:
    mock_run.return_value = MagicMock(returncode=0, stdout="ok\n", stderr="")
    code, output = git_ops.git("status")
    assert code == 0
    assert output == "ok"
    mock_run.assert_called_once()


@patch(
    "kernel.git_ops.subprocess.run", side_effect=subprocess.TimeoutExpired(cmd="git", timeout=60)
)
def test_git_timeout_returns_neg1(mock_run: MagicMock) -> None:
    code, output = git_ops.git("log", timeout=60)
    assert code == -1
    assert "timed out" in output


# ---------------------------------------------------------------------------
# ensure_git
# ---------------------------------------------------------------------------


@patch("kernel.git_ops.git")
def test_ensure_git_skips_if_git_exists(mock_git: MagicMock, tmp_path: MagicMock) -> None:
    """When .git exists, ensure_git should not call git init."""
    with patch.object(git_ops, "ROOT", tmp_path):
        (tmp_path / ".git").mkdir()
        git_ops.ensure_git()
        mock_git.assert_not_called()


# ---------------------------------------------------------------------------
# create_snapshot
# ---------------------------------------------------------------------------


@patch("kernel.git_ops.git")
def test_create_snapshot_returns_sha(mock_git: MagicMock) -> None:
    mock_git.side_effect = [
        (0, ""),  # add -A
        (1, ""),  # diff --cached --quiet (changes exist)
        (0, ""),  # commit
        (0, "abc123"),  # rev-parse HEAD
    ]
    sha = git_ops.create_snapshot("test-label")
    assert sha == "abc123"


# ---------------------------------------------------------------------------
# commit_iteration
# ---------------------------------------------------------------------------


@patch("kernel.git_ops.git")
def test_commit_iteration_calls_push(mock_git: MagicMock) -> None:
    mock_git.return_value = (0, "")
    git_ops.commit_iteration("0001", "summary text")
    # Should call: add -A, commit, push
    assert mock_git.call_count == 3
    calls = [c.args for c in mock_git.call_args_list]
    assert calls[0] == ("add", "-A")
    assert calls[1][0] == "commit"
    assert calls[2] == ("push",)


# ---------------------------------------------------------------------------
# rollback_to
# ---------------------------------------------------------------------------


@patch("kernel.git_ops.git")
def test_rollback_to_calls_reset_and_clean(mock_git: MagicMock) -> None:
    mock_git.return_value = (0, "")
    git_ops.rollback_to("abc123")
    calls = [c.args for c in mock_git.call_args_list]
    assert calls[0] == ("reset", "--hard", "abc123")
    assert calls[1] == ("clean", "-fd")
