"""Conformance test: verify wiring.analyze_gaps matches or exceeds seed.

When the agent replaces analyze_gaps in wiring.py, this test ensures
the new implementation finds all gaps that the seed finds (and possibly more).

Usage:
    pytest tests/conformance/test_analyze_gaps.py
"""

from __future__ import annotations

import wiring
from kernel import seed
from kernel.config import VISION_FILE
from kernel.state import load_history


def _make_project_state() -> dict[str, object]:
    """Build a lightweight project_state without running subprocesses."""
    return {
        "files": [],
        "modules": {},
        "domain_exists": False,
        "adapters_exist": False,
        "kernel_exists": True,
        "has_tests": False,
        "has_pyproject": True,
        "has_pyrightconfig": True,
        "inbox_items": [],
        "_protected_hashes": {},
    }


def test_wiring_resolves_to_callable() -> None:
    """wiring.analyze_gaps is a callable."""
    assert callable(wiring.analyze_gaps)


def test_wiring_matches_seed_for_no_gaps() -> None:
    """When seed returns NO_GAPS, wiring should also return NO_GAPS."""
    # This test is meaningful once analyze_gaps is replaced.
    # For now it verifies the wiring passthrough works.
    vision = VISION_FILE.read_text() if VISION_FILE.exists() else ""
    project_state = _make_project_state()
    history = load_history()

    seed_result = seed.analyze_gaps(vision, project_state, history)
    wiring_result = wiring.analyze_gaps(vision, project_state, history)

    if seed_result == "NO_GAPS":
        assert wiring_result == "NO_GAPS"
    else:
        # Each gap line from seed should appear in wiring output
        for line in seed_result.strip().split("\n"):
            stripped = line.strip()
            if stripped.startswith("- "):
                gap_text = stripped[2:]
                assert gap_text in wiring_result, (
                    f"Seed gap not found in wiring output: {gap_text}"
                )
