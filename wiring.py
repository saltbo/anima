"""
wiring.py — Agent-modifiable step registry.

This file is Anima's sole mechanism for self-replacement. It maps each
pipeline step to its current implementation. Initially all steps point
to the seed functions.

Protected files (kernel/, VISION.md) cannot be modified by the agent.
This file CAN and SHOULD be modified by the agent as part of the
self-replacement protocol.
"""

from __future__ import annotations

from adapters.gap_analyzer_bridge import analyze_gaps as analyze_gaps
from adapters.planner_bridge import plan_iteration as plan_iteration
from adapters.reporter_bridge import record_iteration as record_iteration
from adapters.scanner_bridge import scan_project_state as scan_project_state
from kernel import seed

# ---------------------------------------------------------------------------
# Replaceable pipeline steps
# ---------------------------------------------------------------------------
# analyze_gaps: wired to modules/gap_analyzer via adapters/gap_analyzer_bridge
# plan_iteration: wired to modules/planner via adapters/planner_bridge
execute_plan = seed.execute_plan
verify_iteration = seed.verify_iteration

# ---------------------------------------------------------------------------
# Replaceable CLI command implementations
# ---------------------------------------------------------------------------

init_project = seed.init_project
approve_iteration = seed.approve_iteration
