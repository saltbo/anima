"""
kernel/git_ops.py — Git operations for the iteration lifecycle.

Low-level git wrapper plus snapshot, commit, and rollback operations
used by the iteration loop.
"""

from __future__ import annotations

import subprocess

from kernel.config import ROOT


def git(*args: str) -> tuple[int, str]:
    """Run a git command and return (returncode, output)."""
    result = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    return result.returncode, (result.stdout + result.stderr).strip()


def ensure_git() -> None:
    """Initialize git repo if not already initialized."""
    if not (ROOT / ".git").exists():
        git("init")
        gitignore = ROOT / ".gitignore"
        if not gitignore.exists():
            gitignore.write_text(
                "__pycache__/\n*.pyc\n.anima/\n.pytest_cache/\n"
                "venv/\n.venv/\nnode_modules/\n.ruff_cache/\n"
            )
        git("add", "-A")
        git("commit", "-m", "chore(anima): initial commit")
        print("[git] Initialized repository")


def create_snapshot(label: str) -> str:
    """Create a commit snapshot before iteration. Returns commit SHA."""
    git("add", "-A")
    code, _ = git("diff", "--cached", "--quiet")
    if code != 0:
        git("commit", "-m", f"chore(anima): pre-iteration snapshot {label}")
    _, sha = git("rev-parse", "HEAD")
    return sha


def commit_iteration(iteration_id: str, summary: str) -> None:
    """Commit changes from a successful iteration and push."""
    git("add", "-A")
    git("commit", "-m", f"feat(anima): [{iteration_id}] {summary}")
    code, out = git("push")
    if code != 0:
        print(f"  [git] push failed: {out[:200]}")


def rollback_to(ref: str) -> None:
    """Rollback to a previous snapshot by commit SHA."""
    git("reset", "--hard", ref)
    git("clean", "-fd")
    print(f"[git] Rolled back to {ref[:12]}")
