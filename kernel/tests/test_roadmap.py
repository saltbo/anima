"""Tests for kernel/roadmap.py — roadmap parsing, milestone detection, README updates."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from pathlib import Path

import pytest

from kernel import roadmap
from kernel.config import (
    PROGRESS_END,
    PROGRESS_START,
    STAGE_END,
    STAGE_START,
    STATUS_END,
    STATUS_START,
)


@pytest.fixture(autouse=True)
def _isolate_paths(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Redirect ROADMAP_DIR and README_FILE to tmp_path."""
    monkeypatch.setattr(roadmap, "ROADMAP_DIR", tmp_path / "roadmap")
    monkeypatch.setattr(roadmap, "README_FILE", tmp_path / "README.md")


# ---------------------------------------------------------------------------
# parse_roadmap_items
# ---------------------------------------------------------------------------


def test_parse_roadmap_items_empty() -> None:
    unchecked, checked = roadmap.parse_roadmap_items("")
    assert unchecked == []
    assert checked == []


def test_parse_roadmap_items_unchecked_only() -> None:
    content = "- [ ] Task A\n- [ ] Task B"
    unchecked, checked = roadmap.parse_roadmap_items(content)
    assert unchecked == ["Task A", "Task B"]
    assert checked == []


def test_parse_roadmap_items_mixed() -> None:
    content = "- [x] Done\n- [ ] Todo\n- [X] Also done"
    unchecked, checked = roadmap.parse_roadmap_items(content)
    assert unchecked == ["Todo"]
    assert checked == ["Done", "Also done"]


def test_parse_roadmap_items_uppercase_x() -> None:
    content = "- [X] Uppercase check"
    unchecked, checked = roadmap.parse_roadmap_items(content)
    assert unchecked == []
    assert checked == ["Uppercase check"]


# ---------------------------------------------------------------------------
# _parse_version
# ---------------------------------------------------------------------------


def test_parse_version_standard() -> None:
    assert roadmap._parse_version("v0.4.0") == (0, 4, 0)


def test_parse_version_short() -> None:
    assert roadmap._parse_version("0.2") == (0, 2)


def test_parse_version_with_v_prefix() -> None:
    assert roadmap._parse_version("v1.2.3") == (1, 2, 3)


# ---------------------------------------------------------------------------
# _replace_block
# ---------------------------------------------------------------------------


def test_replace_block_found() -> None:
    content = "before\n<!-- start -->\nold\n<!-- end -->\nafter"
    result = roadmap._replace_block(
        content, "<!-- start -->", "<!-- end -->", "<!-- start -->\nnew\n<!-- end -->"
    )
    assert "new" in result
    assert "old" not in result
    assert result.startswith("before\n")
    assert result.endswith("\nafter")


def test_replace_block_missing_markers() -> None:
    content = "no markers here"
    result = roadmap._replace_block(content, "<!-- start -->", "<!-- end -->", "replacement")
    assert result == content


# ---------------------------------------------------------------------------
# get_current_version
# ---------------------------------------------------------------------------


def test_get_current_version_missing_dir() -> None:
    assert roadmap.get_current_version() == "0.1"


def test_get_current_version_all_complete(tmp_path: Path) -> None:
    rd = tmp_path / "roadmap"
    rd.mkdir()
    (rd / "v0.1.md").write_text("- [x] Done")
    (rd / "v0.2.md").write_text("- [x] Also done")
    assert roadmap.get_current_version() == "0.2"


def test_get_current_version_first_incomplete(tmp_path: Path) -> None:
    rd = tmp_path / "roadmap"
    rd.mkdir()
    (rd / "v0.1.md").write_text("- [x] Done")
    (rd / "v0.2.md").write_text("- [ ] Not done")
    assert roadmap.get_current_version() == "0.2"


# ---------------------------------------------------------------------------
# detect_current_milestone
# ---------------------------------------------------------------------------


def test_detect_current_milestone_no_roadmap() -> None:
    result = roadmap.detect_current_milestone()
    assert result == "v0.0.0"


def test_detect_current_milestone_partial_complete(tmp_path: Path) -> None:
    rd = tmp_path / "roadmap"
    rd.mkdir()
    (rd / "v0.1.md").write_text("- [x] Done")
    (rd / "v0.2.md").write_text("- [ ] Not done")
    result = roadmap.detect_current_milestone()
    assert result == "v0.1.0"


# ---------------------------------------------------------------------------
# _roadmap_progress
# ---------------------------------------------------------------------------


def test_roadmap_progress_counts(tmp_path: Path) -> None:
    rd = tmp_path / "roadmap"
    rd.mkdir()
    (rd / "v0.1.md").write_text("- [x] A\n- [x] B\n- [ ] C")
    (rd / "v0.2.md").write_text("- [ ] D\n- [X] E")
    checked, total = roadmap._roadmap_progress()
    assert checked == 3
    assert total == 5


# ---------------------------------------------------------------------------
# update_readme
# ---------------------------------------------------------------------------


def _make_readme(tmp_path: Path) -> Path:
    """Create a README with all marker blocks."""
    content = (
        "# Anima\n"
        f"{STATUS_START}\nold status\n{STATUS_END}\n"
        f"{STAGE_START}\nold stage\n{STAGE_END}\n"
        f"{PROGRESS_START}\nold progress\n{PROGRESS_END}\n"
    )
    readme = tmp_path / "README.md"
    readme.write_text(content)
    return readme


def test_update_readme_generates_badges(tmp_path: Path) -> None:
    _make_readme(tmp_path)
    rd = tmp_path / "roadmap"
    rd.mkdir()
    (rd / "v0.1.md").write_text("- [x] A\n- [ ] B")

    state: dict[str, Any] = {
        "status": "alive",
        "total_cost_usd": 1.5,
        "total_tokens": 50000,
        "total_elapsed_seconds": 3700,
    }
    roadmap.update_readme(state)

    content = (tmp_path / "README.md").read_text()
    assert "status-alive-brightgreen" in content
    assert "old status" not in content


def test_update_readme_stage_growing(tmp_path: Path) -> None:
    _make_readme(tmp_path)
    rd = tmp_path / "roadmap"
    rd.mkdir()
    (rd / "v0.1.md").write_text("- [ ] todo")

    roadmap.update_readme({"status": "sleep"})
    content = (tmp_path / "README.md").read_text()
    assert "Growing" in content


def test_update_readme_no_file(tmp_path: Path) -> None:
    """update_readme should be a no-op when README doesn't exist."""
    roadmap.update_readme({"status": "sleep"})
    assert not (tmp_path / "README.md").exists()
