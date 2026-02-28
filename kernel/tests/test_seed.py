"""Tests for kernel/seed.py — scan, verify, analyze_gaps, plan, record, helpers."""

from __future__ import annotations

import hashlib
import json
from typing import TYPE_CHECKING, Any

import pytest

from kernel import config as kernel_config
from kernel import seed

if TYPE_CHECKING:
    from pathlib import Path


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _isolate_paths(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Redirect config paths to tmp_path for filesystem tests."""
    monkeypatch.setattr(kernel_config, "ROOT", tmp_path)
    monkeypatch.setattr(kernel_config, "ITERATIONS_DIR", tmp_path / "iterations")
    monkeypatch.setattr(kernel_config, "INBOX_DIR", tmp_path / "inbox")
    monkeypatch.setattr(kernel_config, "MODULES_DIR", tmp_path / "modules")
    monkeypatch.setattr(kernel_config, "DOMAIN_DIR", tmp_path / "domain")
    monkeypatch.setattr(kernel_config, "ADAPTERS_DIR", tmp_path / "adapters")
    monkeypatch.setattr(kernel_config, "KERNEL_DIR", tmp_path / "kernel")
    monkeypatch.setattr(kernel_config, "ROADMAP_DIR", tmp_path / "roadmap")
    # seed.py imports these from config at module level, so also patch on seed
    monkeypatch.setattr(seed, "ROOT", tmp_path)
    monkeypatch.setattr(seed, "ITERATIONS_DIR", tmp_path / "iterations")
    monkeypatch.setattr(seed, "INBOX_DIR", tmp_path / "inbox")
    monkeypatch.setattr(seed, "MODULES_DIR", tmp_path / "modules")
    monkeypatch.setattr(seed, "DOMAIN_DIR", tmp_path / "domain")
    monkeypatch.setattr(seed, "ADAPTERS_DIR", tmp_path / "adapters")
    monkeypatch.setattr(seed, "KERNEL_DIR", tmp_path / "kernel")
    monkeypatch.setattr(seed, "PROTECTED_PATHS", ["VISION.md", "kernel/"])


# ---------------------------------------------------------------------------
# _file_hash
# ---------------------------------------------------------------------------


def test_file_hash_real_file(tmp_path: Path) -> None:
    f = tmp_path / "test.txt"
    f.write_text("hello")
    expected = hashlib.sha256(b"hello").hexdigest()
    assert seed._file_hash(f) == expected


def test_file_hash_missing_file(tmp_path: Path) -> None:
    assert seed._file_hash(tmp_path / "nonexistent") is None


# ---------------------------------------------------------------------------
# _generate_summary
# ---------------------------------------------------------------------------


def test_generate_summary_improvements() -> None:
    v: dict[str, Any] = {"improvements": ["New files: 3", "Tests added"], "issues": []}
    assert "New files: 3" in seed._generate_summary(v)


def test_generate_summary_issues() -> None:
    v: dict[str, Any] = {"improvements": [], "issues": ["CRITICAL: kernel/config.py modified"]}
    assert "Failed:" in seed._generate_summary(v)


def test_generate_summary_empty() -> None:
    v: dict[str, Any] = {"improvements": [], "issues": []}
    assert seed._generate_summary(v) == "No significant changes"


# ---------------------------------------------------------------------------
# _summarize_tool_input
# ---------------------------------------------------------------------------


def test_summarize_tool_input_read() -> None:
    inp = json.dumps({"file_path": "/foo/bar.py"})
    assert seed._summarize_tool_input("Read", inp) == "/foo/bar.py"


def test_summarize_tool_input_bash() -> None:
    inp = json.dumps({"command": "echo hello"})
    assert seed._summarize_tool_input("Bash", inp) == "echo hello"


def test_summarize_tool_input_grep() -> None:
    inp = json.dumps({"pattern": "def foo"})
    assert seed._summarize_tool_input("Grep", inp) == "/def foo/"


def test_summarize_tool_input_glob() -> None:
    inp = json.dumps({"pattern": "**/*.py"})
    assert seed._summarize_tool_input("Glob", inp) == "**/*.py"


def test_summarize_tool_input_write() -> None:
    inp = json.dumps({"file_path": "/some/file.py"})
    assert seed._summarize_tool_input("Write", inp) == "/some/file.py"


def test_summarize_tool_input_unknown() -> None:
    inp = json.dumps({"key": "value"})
    result = seed._summarize_tool_input("UnknownTool", inp)
    assert result == "value"


def test_summarize_tool_input_invalid_json() -> None:
    assert seed._summarize_tool_input("Read", "NOT JSON") == ""


# ---------------------------------------------------------------------------
# verify_iteration
# ---------------------------------------------------------------------------


def test_verify_no_changes_passes(tmp_path: Path) -> None:
    """No protected files touched → pass."""
    (tmp_path / "VISION.md").write_text("vision")
    kdir = tmp_path / "kernel"
    kdir.mkdir()
    (kdir / "loop.py").write_text("code")

    pre_hashes = {
        "VISION.md": seed._file_hash(tmp_path / "VISION.md"),
        "kernel/loop.py": seed._file_hash(tmp_path / "kernel" / "loop.py"),
    }
    pre_state: dict[str, Any] = {"files": ["a.py"], "_protected_hashes": pre_hashes}
    post_state: dict[str, Any] = {"files": ["a.py", "b.py"]}

    result = seed.verify_iteration(pre_state, post_state)
    assert result["passed"] is True
    assert result["issues"] == []


def test_verify_modification_detected(tmp_path: Path) -> None:
    (tmp_path / "VISION.md").write_text("original")
    pre_hashes = {"VISION.md": seed._file_hash(tmp_path / "VISION.md")}

    # Simulate agent modifying the file
    (tmp_path / "VISION.md").write_text("modified by agent")

    pre_state: dict[str, Any] = {"files": [], "_protected_hashes": pre_hashes}
    post_state: dict[str, Any] = {"files": []}

    result = seed.verify_iteration(pre_state, post_state)
    assert result["passed"] is False
    assert any("modified" in i for i in result["issues"])


def test_verify_deletion_detected(tmp_path: Path) -> None:
    (tmp_path / "VISION.md").write_text("content")
    pre_hashes = {"VISION.md": seed._file_hash(tmp_path / "VISION.md")}

    # Simulate agent deleting the file
    (tmp_path / "VISION.md").unlink()

    pre_state: dict[str, Any] = {"files": [], "_protected_hashes": pre_hashes}
    post_state: dict[str, Any] = {"files": []}

    result = seed.verify_iteration(pre_state, post_state)
    assert result["passed"] is False
    assert any("deleted" in i for i in result["issues"])


def test_verify_new_file_in_protected_dir(tmp_path: Path) -> None:
    """A file appearing in kernel/ that wasn't there before → flagged."""
    kdir = tmp_path / "kernel"
    kdir.mkdir()

    pre_state: dict[str, Any] = {"files": [], "_protected_hashes": {}}
    # Now a new file appears in kernel/
    (kdir / "evil.py").write_text("bad code")
    post_state: dict[str, Any] = {"files": ["kernel/evil.py"]}

    result = seed.verify_iteration(pre_state, post_state)
    assert result["passed"] is False
    assert any("appeared unexpectedly" in i for i in result["issues"])


# ---------------------------------------------------------------------------
# analyze_gaps
# ---------------------------------------------------------------------------


def test_analyze_gaps_no_gaps(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """With all roadmap items checked and no inbox → NO_GAPS."""
    rd = tmp_path / "roadmap"
    rd.mkdir()
    (rd / "v0.1.md").write_text("- [x] Done item")
    monkeypatch.setattr(seed, "_get_current_version", lambda: "0.1")
    monkeypatch.setattr(seed, "_read_roadmap_file", lambda v: "- [x] Done item")
    monkeypatch.setattr(seed, "_parse_roadmap_items", lambda c: ([], ["Done item"]))

    project_state: dict[str, Any] = {
        "domain_exists": True,
        "has_pyproject": True,
        "has_pyrightconfig": True,
        "inbox_items": [],
    }
    result = seed.analyze_gaps("vision text", project_state, [])
    assert result == "NO_GAPS"


def test_analyze_gaps_unchecked_items(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(seed, "_get_current_version", lambda: "0.1")
    monkeypatch.setattr(seed, "_read_roadmap_file", lambda v: "- [ ] Task A")
    monkeypatch.setattr(seed, "_parse_roadmap_items", lambda c: (["Task A"], []))

    project_state: dict[str, Any] = {
        "domain_exists": True,
        "has_pyproject": True,
        "has_pyrightconfig": True,
        "inbox_items": [],
    }
    result = seed.analyze_gaps("vision", project_state, [])
    assert "UNCOMPLETED ROADMAP" in result
    assert "Task A" in result


def test_analyze_gaps_quality_failures(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(seed, "_get_current_version", lambda: "0.1")
    monkeypatch.setattr(seed, "_read_roadmap_file", lambda v: "")
    monkeypatch.setattr(seed, "_parse_roadmap_items", lambda c: ([], []))

    project_state: dict[str, Any] = {
        "domain_exists": True,
        "has_pyproject": True,
        "has_pyrightconfig": True,
        "quality_results": {
            "ruff_lint": {"passed": False, "output": "E501 line too long"},
            "ruff_format": None,
            "pyright": None,
        },
        "test_results": None,
        "inbox_items": [],
    }
    result = seed.analyze_gaps("vision", project_state, [])
    assert "RUFF LINT FAILURES" in result


def test_analyze_gaps_test_failures(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(seed, "_get_current_version", lambda: "0.1")
    monkeypatch.setattr(seed, "_read_roadmap_file", lambda v: "")
    monkeypatch.setattr(seed, "_parse_roadmap_items", lambda c: ([], []))

    project_state: dict[str, Any] = {
        "domain_exists": True,
        "has_pyproject": True,
        "has_pyrightconfig": True,
        "quality_results": {},
        "test_results": {"passed": False, "output": "FAILED test_foo"},
        "inbox_items": [],
    }
    result = seed.analyze_gaps("vision", project_state, [])
    assert "FAILING TESTS" in result


def test_analyze_gaps_inbox_items(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(seed, "_get_current_version", lambda: "0.1")
    monkeypatch.setattr(seed, "_read_roadmap_file", lambda v: "")
    monkeypatch.setattr(seed, "_parse_roadmap_items", lambda c: ([], []))

    project_state: dict[str, Any] = {
        "domain_exists": True,
        "has_pyproject": True,
        "has_pyrightconfig": True,
        "inbox_items": [{"filename": "task.md", "content": "Please fix X"}],
    }
    result = seed.analyze_gaps("vision", project_state, [])
    assert "HUMAN REQUEST" in result
    assert "Please fix X" in result


# ---------------------------------------------------------------------------
# plan_iteration
# ---------------------------------------------------------------------------


def test_plan_iteration_includes_version(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(seed, "_get_current_version", lambda: "0.3")
    prompt = seed.plan_iteration(
        {"modules": {}, "domain_exists": False, "has_tests": False, "inbox_items": []},
        "some gaps",
        [],
        5,
    )
    assert "v0.3" in prompt
    assert "Iteration #6" in prompt


def test_plan_iteration_includes_recent_history(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(seed, "_get_current_version", lambda: "0.1")
    history = [
        {"success": True, "summary": "Added tests"},
        {"success": False, "summary": "Lint failed"},
    ]
    prompt = seed.plan_iteration(
        {"modules": {}, "domain_exists": True, "has_tests": True, "inbox_items": []},
        "gaps",
        history,
        2,
    )
    assert "RECENT ITERATIONS" in prompt
    assert "Added tests" in prompt


# ---------------------------------------------------------------------------
# record_iteration
# ---------------------------------------------------------------------------


def test_record_iteration_writes_json(tmp_path: Path) -> None:
    seed.record_iteration(
        "0001-test",
        "some gaps",
        {"output": "agent output", "cost_usd": 0.05, "total_tokens": 1000},
        {"passed": True, "improvements": ["New files: 2"], "issues": []},
        10.5,
    )
    log_file = tmp_path / "iterations" / "0001-test.json"
    assert log_file.exists()
    data = json.loads(log_file.read_text())
    assert data["id"] == "0001-test"
    assert data["success"] is True


def test_record_iteration_returns_report_dict(tmp_path: Path) -> None:
    report = seed.record_iteration(
        "0002-test",
        "gaps",
        {"output": "", "cost_usd": 0, "total_tokens": 0},
        {"passed": False, "improvements": [], "issues": ["error"]},
        5.0,
    )
    assert report["id"] == "0002-test"
    assert report["success"] is False
    assert report["elapsed_seconds"] == 5.0


# ---------------------------------------------------------------------------
# scan_project_state
# ---------------------------------------------------------------------------


def test_scan_project_state_returns_expected_keys(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """scan_project_state returns a dict with all expected top-level keys."""
    # Create minimal project structure
    (tmp_path / "pyproject.toml").write_text("[project]\nname='test'")
    (tmp_path / "VISION.md").write_text("vision")
    kdir = tmp_path / "kernel"
    kdir.mkdir()
    (kdir / "__init__.py").write_text("")

    # Mock subprocess calls to avoid recursive pytest invocation
    monkeypatch.setattr(
        seed,
        "run_quality_checks",
        lambda: {"ruff_lint": None, "ruff_format": None, "pyright": None},
    )
    monkeypatch.setattr(
        seed, "run_tests", lambda: {"exit_code": 0, "passed": True, "output": "", "errors": ""}
    )

    result = seed.scan_project_state()
    assert "files" in result
    assert "modules" in result
    assert "domain_exists" in result
    assert "has_tests" in result
    assert "inbox_items" in result
    assert "_protected_hashes" in result


def test_scan_project_state_skips_venv(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """scan should skip .venv and __pycache__ directories."""
    (tmp_path / ".venv").mkdir()
    (tmp_path / ".venv" / "lib.py").write_text("x")
    (tmp_path / "__pycache__").mkdir()
    (tmp_path / "__pycache__" / "mod.pyc").write_bytes(b"\x00")
    (tmp_path / "real.py").write_text("code")

    monkeypatch.setattr(seed, "run_quality_checks", lambda: {})
    monkeypatch.setattr(
        seed, "run_tests", lambda: {"exit_code": 0, "passed": True, "output": "", "errors": ""}
    )

    result = seed.scan_project_state()
    files = result["files"]
    assert any("real.py" in f for f in files)
    assert not any(".venv" in f for f in files)
    assert not any("__pycache__" in f for f in files)
