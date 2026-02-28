"""Conformance test: verify wiring.verify_iteration matches seed interface.

Validates that the verifier module, wired through adapters/verifier_bridge.py,
produces output compatible with kernel/loop.py expectations.

Usage:
    pytest tests/conformance/test_verifier.py
"""

from __future__ import annotations

import hashlib
import tempfile
from pathlib import Path
from typing import Any
from unittest.mock import patch

import wiring
from kernel import seed


def _file_hash(path: Path) -> str | None:
    """Compute SHA-256 hash of a file, or None if it doesn't exist."""
    if not path.exists():
        return None
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _setup_project(tmpdir: Path) -> dict[str, str | None]:
    """Create a minimal project with protected files, return their hashes."""
    vision = tmpdir / "VISION.md"
    vision.write_text("# Test Vision")

    kernel_dir = tmpdir / "kernel"
    kernel_dir.mkdir()
    loop_py = kernel_dir / "loop.py"
    loop_py.write_text("# loop")
    init_py = kernel_dir / "__init__.py"
    init_py.write_text("")

    return {
        "VISION.md": _file_hash(vision),
        "kernel/loop.py": _file_hash(loop_py),
        "kernel/__init__.py": _file_hash(init_py),
    }


def _make_pre_state(
    hashes: dict[str, str | None],
    files: list[str] | None = None,
) -> dict[str, Any]:
    """Build a pre-state dict with protected hashes."""
    return {
        "files": files or ["a.py"],
        "_protected_hashes": hashes,
        "quality_results": {},
        "test_results": None,
    }


def _make_post_state(
    hashes: dict[str, str | None],
    files: list[str] | None = None,
    quality_passed: bool = True,
    tests_passed: bool = True,
) -> dict[str, Any]:
    """Build a post-state dict matching scanner_bridge output."""
    qr: dict[str, Any] = {
        "ruff_lint": {"passed": True, "output": ""} if quality_passed else None,
        "ruff_format": {"passed": True, "output": ""} if quality_passed else None,
        "pyright": {"passed": True, "output": ""} if quality_passed else None,
    }
    tr: dict[str, Any] = {
        "exit_code": 0 if tests_passed else 1,
        "passed": tests_passed,
        "output": "3 passed" if tests_passed else "1 failed",
        "errors": "",
    }
    return {
        "files": files or ["a.py"],
        "_protected_hashes": hashes,
        "quality_results": qr,
        "test_results": tr,
    }


def _patch_seed_root(tmp: Path) -> tuple[Any, Any]:
    """Patch ROOT in both kernel.config and kernel.seed (which imports it)."""
    return (
        patch("kernel.config.ROOT", tmp),
        patch("kernel.seed.ROOT", tmp),
    )


def test_wiring_resolves_to_callable() -> None:
    """wiring.verify_iteration is a callable."""
    assert callable(wiring.verify_iteration)


def test_wiring_is_not_seed() -> None:
    """wiring.verify_iteration should now point to the module, not seed."""
    assert wiring.verify_iteration is not seed.verify_iteration


def _validate_verification_structure(result: dict[str, Any]) -> None:
    """Assert the dict has all keys that kernel/loop.py expects."""
    assert "passed" in result
    assert isinstance(result["passed"], bool)
    assert "issues" in result
    assert isinstance(result["issues"], list)
    assert "improvements" in result
    assert isinstance(result["improvements"], list)
    assert "post_state" in result


def test_wiring_returns_compatible_structure() -> None:
    """The wired verify_iteration returns a dict with all expected keys."""
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        hashes = _setup_project(tmp)
        pre = _make_pre_state(hashes)
        post = _make_post_state(hashes)
        result = wiring.verify_iteration(pre, post)
    _validate_verification_structure(result)


def test_clean_iteration_both_pass() -> None:
    """Both seed and module pass when nothing changed."""
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        hashes = _setup_project(tmp)
        pre = _make_pre_state(hashes)
        post = _make_post_state(hashes)
        wired = wiring.verify_iteration(pre, post)
        p1, p2 = _patch_seed_root(tmp)
        with p1, p2:
            seed_result = seed.verify_iteration(pre, post)
    assert wired["passed"] is True
    assert seed_result["passed"] is True
    assert wired["issues"] == seed_result["issues"]


def test_modified_file_both_detect() -> None:
    """Both seed and module detect a modified protected file."""
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        hashes = _setup_project(tmp)
        pre = _make_pre_state(hashes)

        # Modify VISION.md
        (tmp / "VISION.md").write_text("# TAMPERED")
        new_hashes = dict(hashes)
        new_hashes["VISION.md"] = _file_hash(tmp / "VISION.md")
        post = _make_post_state(new_hashes)

        wired = wiring.verify_iteration(pre, post)
        p1, p2 = _patch_seed_root(tmp)
        with p1, p2:
            seed_result = seed.verify_iteration(pre, post)

    assert wired["passed"] is False
    assert seed_result["passed"] is False
    assert len(wired["issues"]) >= 1
    assert len(seed_result["issues"]) >= 1
    assert any("VISION.md" in i and "CRITICAL" in i for i in wired["issues"])
    assert any("VISION.md" in i and "CRITICAL" in i for i in seed_result["issues"])


def test_quality_failure_both_detect() -> None:
    """Both seed and module detect quality gate failures."""
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        hashes = _setup_project(tmp)
        pre = _make_pre_state(hashes)
        post = _make_post_state(hashes)
        post["quality_results"] = {
            "ruff_lint": {"passed": False, "output": "E501 error"},
            "ruff_format": None,
            "pyright": None,
        }

        wired = wiring.verify_iteration(pre, post)
        p1, p2 = _patch_seed_root(tmp)
        with p1, p2:
            seed_result = seed.verify_iteration(pre, post)

    assert wired["passed"] is False
    assert seed_result["passed"] is False
    assert any("QUALITY" in i for i in wired["issues"])
    assert any("QUALITY" in i for i in seed_result["issues"])


def test_new_files_detected_as_improvements() -> None:
    """Both seed and module detect new files as improvements."""
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        hashes = _setup_project(tmp)
        pre = _make_pre_state(hashes, files=["a.py"])
        post = _make_post_state(hashes, files=["a.py", "b.py", "c.py"])

        wired = wiring.verify_iteration(pre, post)
        p1, p2 = _patch_seed_root(tmp)
        with p1, p2:
            seed_result = seed.verify_iteration(pre, post)

    assert wired["passed"] is True
    assert seed_result["passed"] is True
    assert wired["improvements"] == seed_result["improvements"]
    assert any("New files: 2" in imp for imp in wired["improvements"])


def test_test_failure_both_detect() -> None:
    """Both seed and module detect test failures."""
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        hashes = _setup_project(tmp)
        pre = _make_pre_state(hashes)
        post = _make_post_state(hashes, tests_passed=False)

        wired = wiring.verify_iteration(pre, post)
        p1, p2 = _patch_seed_root(tmp)
        with p1, p2:
            seed_result = seed.verify_iteration(pre, post)

    assert wired["passed"] is False
    assert seed_result["passed"] is False
    assert any("tests failing" in i for i in wired["issues"])
    assert any("tests failing" in i for i in seed_result["issues"])
