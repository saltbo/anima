"""
kernel/git_ops.py — Git operations for the iteration lifecycle.

Low-level git wrapper plus snapshot, commit, and rollback operations
used by the iteration loop.
"""

from __future__ import annotations

import logging
import subprocess

from kernel.config import AUTO_PUSH, ROOT

logger = logging.getLogger("anima")


def git(*args: str, timeout: int = 60) -> tuple[int, str]:
    """Run a git command and return (returncode, output)."""
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        output = result.stdout.strip()
        if result.returncode != 0 and result.stderr:
            output = (output + "\n" + result.stderr.strip()).strip()
        return result.returncode, output
    except subprocess.TimeoutExpired:
        return -1, f"git {' '.join(args)} timed out after {timeout}s"


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
        logger.info("[git] Initialized repository")


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
    if AUTO_PUSH:
        code, out = git("push", timeout=120)
        if code != 0:
            logger.warning("  [git] push failed: %s", out[:200])


def rollback_to(ref: str) -> None:
    """Rollback to a previous snapshot by commit SHA."""
    if not ref:
        logger.warning("[git] WARNING: empty ref, skipping rollback")
        return
    git("reset", "--hard", ref)
    git("clean", "-fd")
    logger.info("[git] Rolled back to %s", ref[:12])
