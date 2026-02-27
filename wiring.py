"""
wiring.py — Agent-modifiable step registry.

This file is Anima's sole mechanism for self-replacement. It maps each
pipeline step to its current implementation. Initially all steps point
to the seed functions.

When a module is ready (with conformance test), the agent changes the
assignment here. For example, to wire the gap_analyzer module:

    from adapters.seed_bridge import SeedBridge
    _bridge = SeedBridge(str(Path(__file__).parent))
    analyze_gaps = _bridge.analyze_gaps

Protected files (kernel/, VISION.md) cannot be modified by the agent.
This file CAN and SHOULD be modified by the agent as part of the
self-replacement protocol.
"""

from __future__ import annotations

from kernel import seed

# ---------------------------------------------------------------------------
# Replaceable pipeline steps
# ---------------------------------------------------------------------------
# When a module is ready (with conformance test), change the assignment.

scan_project_state = seed.scan_project_state
analyze_gaps = seed.analyze_gaps
plan_iteration = seed.plan_iteration
execute_plan = seed.execute_plan
verify_iteration = seed.verify_iteration
record_iteration = seed.record_iteration
