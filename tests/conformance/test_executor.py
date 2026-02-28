"""Conformance test: verify wiring.execute_plan matches CONTRACT.md interface.

Validates that the executor module, wired through
adapters/executor_bridge.py, produces output compatible with
kernel/loop.py expectations.

CONTRACT.md requires:
- Input: (prompt: str, dry_run: bool) — seed-compatible signature
- Output: dict with keys: success, output, errors, exit_code,
  elapsed_seconds, cost_usd, total_tokens, dry_run
- Dry-run must return success without invoking the agent
- Must save prompt to .anima/current_prompt.txt before execution

Usage:
    pytest tests/conformance/test_executor.py
"""

from __future__ import annotations

import wiring
from kernel import seed


def test_wiring_resolves_to_callable() -> None:
    """wiring.execute_plan is a callable."""
    assert callable(wiring.execute_plan)


def test_wiring_is_not_seed() -> None:
    """wiring.execute_plan should now point to the module, not seed."""
    assert wiring.execute_plan is not seed.execute_plan


def test_dry_run_returns_dict() -> None:
    """execute_plan in dry-run mode returns a dict."""
    result = wiring.execute_plan("test prompt", dry_run=True)
    assert isinstance(result, dict)


def test_dry_run_success() -> None:
    """Dry-run must return success=True without invoking the agent."""
    result = wiring.execute_plan("test prompt", dry_run=True)
    assert result["success"] is True
    assert result["dry_run"] is True


def test_dry_run_has_required_keys() -> None:
    """Dry-run result must contain all keys expected by kernel/loop.py."""
    result = wiring.execute_plan("test prompt", dry_run=True)
    required_keys = {"success", "output", "errors", "exit_code", "elapsed_seconds"}
    assert required_keys.issubset(result.keys())


def test_dry_run_output_format() -> None:
    """Dry-run output must indicate it was a dry run."""
    result = wiring.execute_plan("dry run test", dry_run=True)
    assert "(dry run)" in result["output"]


def test_dry_run_matches_seed_interface() -> None:
    """Dry-run result from wiring has same keys as seed."""
    seed_result = seed.execute_plan("test", dry_run=True)
    wiring_result = wiring.execute_plan("test", dry_run=True)

    # Wiring result must have at least all keys from seed
    for key in seed_result:
        assert key in wiring_result, f"Missing key from seed interface: {key}"
