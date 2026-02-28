"""
kernel/roadmap.py — Roadmap parsing, milestone detection, and README updates.

Handles everything related to tracking progress through the version
roadmap and reflecting that progress in git tags and README badges.
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import quote

from kernel.config import (
    PROGRESS_END,
    PROGRESS_START,
    README_FILE,
    ROADMAP_DIR,
    STAGE_END,
    STAGE_START,
    STATUS_END,
    STATUS_START,
)
from kernel.git_ops import git

# ---------------------------------------------------------------------------
# Roadmap parsing
# ---------------------------------------------------------------------------


def get_current_version() -> str:
    """Return the first version that still has unchecked items (e.g. '0.2').

    Scans roadmap/v*.md in sorted order. Returns the highest version if all
    are complete.
    """
    if not ROADMAP_DIR.exists():
        return "0.1"
    versions: list[str] = []
    for f in sorted(ROADMAP_DIR.glob("v*.md")):
        ver = f.stem[1:]  # "v0.2" -> "0.2"
        versions.append(ver)
        content = f.read_text()
        if "- [ ]" in content:
            return ver
    return versions[-1] if versions else "0.1"


def read_roadmap_file(version: str) -> str:
    """Read the content of roadmap/v{version}.md."""
    path = ROADMAP_DIR / f"v{version}.md"
    if path.exists():
        return path.read_text()
    return ""


def parse_roadmap_items(content: str) -> tuple[list[str], list[str]]:
    """Parse markdown checklist, return (unchecked, checked) item texts."""
    unchecked: list[str] = []
    checked: list[str] = []
    for line in content.split("\n"):
        stripped = line.strip()
        if stripped.startswith("- [ ]"):
            unchecked.append(stripped[6:].strip())
        elif stripped.startswith("- [x]") or stripped.startswith("- [X]"):
            checked.append(stripped[6:].strip())
    return unchecked, checked


# ---------------------------------------------------------------------------
# Milestone detection and tagging
# ---------------------------------------------------------------------------


def _parse_version(v: str) -> tuple[int, ...]:
    """Parse 'v0.4.0' or 'v0.4' into a comparable tuple like (0, 4, 0)."""
    return tuple(int(x) for x in v.lstrip("v").split("."))


def detect_current_milestone(state: dict[str, Any]) -> str:
    """Detect the current version milestone using roadmap files.

    Scans roadmap/v*.md in order. The first version that still has unchecked
    items is the *current target*; the previous version is the achieved
    milestone. Requires roadmap/ directory to exist.
    """
    _ = state  # reserved for future use

    if not ROADMAP_DIR.exists():
        print("  [milestone] WARNING: roadmap/ directory missing, returning v0.0.0")
        return "v0.0.0"

    prev_version = "v0.0.0"
    for f in sorted(ROADMAP_DIR.glob("v*.md")):
        ver = f.stem  # "v0.2"
        content = f.read_text()
        if "- [ ]" in content:
            return prev_version
        prev_version = ver + ".0"  # "v0.2" -> "v0.2.0"
    return prev_version  # all complete


def tag_milestone_if_advanced(state: dict[str, Any]) -> None:
    """Create a git tag when the milestone version advances (never downgrades)."""
    new_milestone = detect_current_milestone(state)
    old_milestone = state.get("current_milestone", "v0.0.0")

    if _parse_version(new_milestone) <= _parse_version(old_milestone):
        return

    state["current_milestone"] = new_milestone

    # Check if this tag already exists (e.g. from a manual run)
    code, _ = git("rev-parse", new_milestone)
    if code == 0:
        print(f"  [git] Tag {new_milestone} already exists, skipping")
        return

    git("tag", "-a", new_milestone, "-m", f"Milestone {new_milestone}")
    code, out = git("push", "origin", new_milestone, timeout=120)
    if code != 0:
        print(f"  [git] push tag failed: {out[:200]}")
    else:
        print(f"  🏷️  Tagged {new_milestone} (was {old_milestone})")


# ---------------------------------------------------------------------------
# README updates
# ---------------------------------------------------------------------------


def _replace_block(content: str, start: str, end: str, block: str) -> str:
    """Replace content between start/end markers, or return unchanged."""
    pattern = re.compile(re.escape(start) + r".*?" + re.escape(end), re.DOTALL)
    if pattern.search(content):
        return pattern.sub(block, content)
    return content


def _roadmap_progress() -> tuple[int, int]:
    """Count checked and total roadmap items across all version files."""
    checked = 0
    total = 0
    if ROADMAP_DIR.exists():
        for f in sorted(ROADMAP_DIR.glob("v*.md")):
            text = f.read_text()
            done = text.count("- [x]") + text.count("- [X]")
            total += done + text.count("- [ ]")
            checked += done
    return checked, total


def update_readme(state: dict[str, Any]) -> None:
    """Update README.md auto-generated blocks (status, stage, progress)."""
    if not README_FILE.exists():
        return

    milestone = detect_current_milestone(state)
    content = README_FILE.read_text()

    # --- Status block: agent status + milestone badges ---
    status = state.get("status", "sleep")
    status_color = {"alive": "brightgreen", "sleep": "yellow", "paused": "red"}.get(
        status, "lightgrey"
    )
    # Format cumulative stats for badges
    total_cost = state.get("total_cost_usd", 0)
    total_tokens = state.get("total_tokens", 0)
    total_seconds = state.get("total_elapsed_seconds", 0)

    # Human-readable time: "1h_23m" or "45m" or "2m" (underscore for shields.io)
    total_minutes = int(total_seconds // 60)
    if total_minutes >= 60:
        time_label = f"{total_minutes // 60}h_{total_minutes % 60}m"
    else:
        time_label = f"{total_minutes}m"

    # Human-readable tokens: "123k" or "1.2M"
    if total_tokens >= 1_000_000:
        tokens_label = f"{total_tokens / 1_000_000:.1f}M"
    elif total_tokens >= 1_000:
        tokens_label = f"{total_tokens / 1_000:.0f}k"
    else:
        tokens_label = str(total_tokens)

    cost_label = quote(f"${total_cost:.2f}", safe="")

    status_block = (
        f"{STATUS_START}\n"
        f"![status](https://img.shields.io/badge/status-{status}-{status_color})"
        f" ![milestone](https://img.shields.io/badge/milestone-{milestone}-purple)"
        f" ![time](https://img.shields.io/badge/time-{time_label}-blue)"
        f" ![tokens](https://img.shields.io/badge/tokens-{tokens_label}-blue)"
        f" ![cost](https://img.shields.io/badge/cost-{cost_label}-blue)\n"
        f"{STATUS_END}"
    )
    content = _replace_block(content, STATUS_START, STATUS_END, status_block)

    # --- Stage block: Growing vs Available ---
    # Parse major version from milestone (e.g. "v0.4.0" -> 0)
    major = 0
    m = re.match(r"v(\d+)\.", milestone)
    if m:
        major = int(m.group(1))

    if major >= 1:
        stage_block = (
            f"{STAGE_START}\n"
            f"> **Status: Available** — Install Anima via pip: `pip install anima`\n"
            f"{STAGE_END}"
        )
    else:
        stage_block = (
            f"{STAGE_START}\n"
            f"> **Status: Growing** — Anima is building itself."
            f" It is not yet available for external use.\n"
            f"{STAGE_END}"
        )
    content = _replace_block(content, STAGE_START, STAGE_END, stage_block)

    # --- Progress block: milestone + roadmap counts ---
    checked, total = _roadmap_progress()
    progress_block = (
        f"{PROGRESS_START}\n"
        f"**Milestone: {milestone}** — Roadmap: {checked} / {total} tasks complete\n"
        f"{PROGRESS_END}"
    )
    content = _replace_block(content, PROGRESS_START, PROGRESS_END, progress_block)

    README_FILE.write_text(content)
