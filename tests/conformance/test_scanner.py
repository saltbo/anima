"""Conformance test: verify wiring.scan_project_state matches seed interface.

Validates that the scanner module, wired through adapters/scanner_bridge.py,
produces output compatible with kernel/loop.py and downstream seed functions.

The tests mock subprocess calls to avoid recursive pytest invocation.

Usage:
    pytest tests/conformance/test_scanner.py
"""

from __future__ import annotations

import subprocess
from typing import Any, cast
from unittest.mock import patch

import wiring
from kernel import seed


def _noop_subprocess_run(*args: Any, **kwargs: Any) -> subprocess.CompletedProcess[str]:
    """Return a passing no-op result for subprocess.run calls."""
    return subprocess.CompletedProcess(args=args[0], returncode=0, stdout="", stderr="")


@patch("modules.scanner.core.subprocess.run", _noop_subprocess_run)
@patch("kernel.seed.subprocess.run", _noop_subprocess_run)
def _call_both() -> tuple[dict[str, Any], dict[str, Any]]:
    """Call both wired and seed scanners with subprocess mocked."""
    wired = wiring.scan_project_state()
    seed_state = seed.scan_project_state()
    return wired, seed_state


def test_wiring_resolves_to_callable() -> None:
    """wiring.scan_project_state is a callable."""
    assert callable(wiring.scan_project_state)


def test_wiring_is_not_seed() -> None:
    """wiring.scan_project_state should now point to the module, not seed."""
    assert wiring.scan_project_state is not seed.scan_project_state


def _validate_state_structure(state: dict[str, Any]) -> None:
    """Assert the dict has all keys the loop and downstream steps expect."""
    # Keys accessed by kernel/loop.py
    assert "files" in state
    assert isinstance(state["files"], list)
    assert "modules" in state
    assert isinstance(state["modules"], dict)
    assert "domain_exists" in state
    assert isinstance(state["domain_exists"], bool)
    assert "adapters_exist" in state
    assert isinstance(state["adapters_exist"], bool)
    assert "kernel_exists" in state
    assert isinstance(state["kernel_exists"], bool)
    assert "has_tests" in state
    assert isinstance(state["has_tests"], bool)
    assert "has_pyproject" in state
    assert isinstance(state["has_pyproject"], bool)
    assert "has_pyrightconfig" in state
    assert isinstance(state["has_pyrightconfig"], bool)
    assert "inbox_items" in state
    assert isinstance(state["inbox_items"], list)

    # Keys accessed by seed.verify_iteration
    assert "_protected_hashes" in state
    assert isinstance(state["_protected_hashes"], dict)

    # Quality results structure
    assert "quality_results" in state
    qr = state["quality_results"]
    if qr:
        for key in ("ruff_lint", "ruff_format", "pyright"):
            assert key in qr
            if qr[key] is not None:
                assert "passed" in qr[key]
                assert "output" in qr[key]

    # Test results structure
    assert "test_results" in state
    tr = state["test_results"]
    if tr is not None:
        assert "exit_code" in tr
        assert "passed" in tr
        assert "output" in tr
        assert "errors" in tr

    # Module info structure
    mods = cast("dict[str, dict[str, Any]]", state["modules"])
    for info in mods.values():
        assert isinstance(info, dict)
        assert "has_contract" in info
        assert "has_spec" in info
        assert "has_core" in info
        assert "has_tests" in info
        assert "files" in info


def test_wiring_returns_compatible_structure() -> None:
    """The wired scan_project_state returns a dict with all expected keys."""
    wired, _ = _call_both()
    _validate_state_structure(wired)


def test_wiring_finds_same_layers_as_seed() -> None:
    """Module detects the same architectural layers as seed."""
    wired, seed_state = _call_both()

    assert wired["domain_exists"] == seed_state["domain_exists"]
    assert wired["adapters_exist"] == seed_state["adapters_exist"]
    assert wired["kernel_exists"] == seed_state["kernel_exists"]
    assert wired["has_pyproject"] == seed_state["has_pyproject"]
    assert wired["has_pyrightconfig"] == seed_state["has_pyrightconfig"]


# Directories that are not real modules but may appear in seed output.
_NON_MODULE_DIRS = {"__pycache__"}


def test_wiring_finds_same_modules_as_seed() -> None:
    """Module discovers the same real modules as seed.

    The module scanner correctly filters out non-module directories
    (e.g. __pycache__) that the seed scanner may include.
    """
    wired, seed_state = _call_both()

    wired_names = set(wired["modules"].keys())
    seed_names = set(seed_state["modules"].keys()) - _NON_MODULE_DIRS
    assert wired_names == seed_names


def test_wiring_protects_same_files_as_seed() -> None:
    """Module hashes the same protected files as seed."""
    wired, seed_state = _call_both()

    wired_paths = set(wired["_protected_hashes"].keys())
    seed_paths = set(seed_state["_protected_hashes"].keys())
    assert wired_paths == seed_paths

    # Hashes should match exactly
    for path in wired_paths:
        assert wired["_protected_hashes"][path] == seed_state["_protected_hashes"][path]
