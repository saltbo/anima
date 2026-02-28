"""Tests for kernel/state.py — state persistence and iteration history."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from pathlib import Path

import pytest

from kernel import state


@pytest.fixture(autouse=True)
def _isolate_paths(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Redirect STATE_FILE and ITERATIONS_DIR to tmp_path."""
    monkeypatch.setattr(state, "STATE_FILE", tmp_path / ".anima" / "state.json")
    monkeypatch.setattr(state, "ITERATIONS_DIR", tmp_path / "iterations")


# ---------------------------------------------------------------------------
# load_state
# ---------------------------------------------------------------------------


def test_load_state_returns_defaults_when_missing() -> None:
    result = state.load_state()
    assert result["iteration_count"] == 0
    assert result["consecutive_failures"] == 0
    assert result["status"] == "sleep"
    assert result["last_iteration"] is None


def test_load_state_parses_existing_json(tmp_path: Path) -> None:
    sf = tmp_path / ".anima" / "state.json"
    sf.parent.mkdir(parents=True)
    data: dict[str, Any] = {"iteration_count": 5, "status": "alive"}
    sf.write_text(json.dumps(data))

    result = state.load_state()
    assert result["iteration_count"] == 5
    assert result["status"] == "alive"


# ---------------------------------------------------------------------------
# save_state
# ---------------------------------------------------------------------------


def test_save_state_round_trips(tmp_path: Path) -> None:
    data: dict[str, Any] = {"iteration_count": 3, "status": "paused"}
    state.save_state(data)
    loaded = state.load_state()
    assert loaded == data


def test_save_state_creates_parent_dir(tmp_path: Path) -> None:
    sf = tmp_path / ".anima" / "state.json"
    assert not sf.parent.exists()
    state.save_state({"x": 1})
    assert sf.exists()


def test_save_state_atomic_write(tmp_path: Path) -> None:
    """The tmp file should not linger after save."""
    state.save_state({"x": 1})
    sf = tmp_path / ".anima" / "state.json"
    tmp_file = sf.with_suffix(".tmp")
    assert not tmp_file.exists()
    assert sf.exists()


# ---------------------------------------------------------------------------
# load_history
# ---------------------------------------------------------------------------


def test_load_history_returns_empty_when_no_dir() -> None:
    result = state.load_history()
    assert result == []


def test_load_history_skips_invalid_json(tmp_path: Path) -> None:
    idir = tmp_path / "iterations"
    idir.mkdir()
    (idir / "0001.json").write_text(json.dumps({"id": "0001", "ok": True}))
    (idir / "0002.json").write_text("NOT JSON{{{")
    (idir / "0003.json").write_text(json.dumps({"id": "0003", "ok": True}))

    result = state.load_history()
    assert len(result) == 2
    assert result[0]["id"] == "0001"
    assert result[1]["id"] == "0003"
