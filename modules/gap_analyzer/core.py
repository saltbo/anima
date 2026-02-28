"""Gap analysis between vision/roadmap and project state.

v0.6: Adds failure pattern detection — annotates stuck gaps so the
planner can skip or re-approach them.
"""

from __future__ import annotations

import logging
from typing import Any

from domain.models import FailureAction
from kernel.roadmap import get_current_version, parse_roadmap_items, read_roadmap_file
from modules.failure_analyzer.core import analyze_patterns

logger = logging.getLogger("anima.gap_analyzer")


def _annotate_stuck_gaps(
    unchecked: list[str],
    history: list[dict[str, Any]],
) -> dict[str, FailureAction]:
    """Return a map of gap_text → recommended action for stuck items."""
    if not unchecked or not history:
        return {}
    patterns = analyze_patterns(history, unchecked, threshold=3)
    return {p.gap_text: p.action for p in patterns}


def analyze(
    vision: str,
    project_state: dict[str, Any],
    history: list[dict[str, Any]],
) -> str:
    """Analyze gaps between the roadmap/vision and current project state.

    Returns a newline-joined gap report string, or the literal "NO_GAPS"
    if nothing needs attention.
    """
    gaps: list[str] = []

    # 1. Current roadmap unchecked items
    current_version = get_current_version()
    roadmap_content = read_roadmap_file(current_version)
    unchecked, _checked = parse_roadmap_items(roadmap_content)

    # Detect stuck gaps using failure pattern analysis
    stuck = _annotate_stuck_gaps(unchecked, history)

    if unchecked:
        gaps.append(f"UNCOMPLETED ROADMAP ITEMS for v{current_version} ({len(unchecked)}):")
        for item in unchecked:
            action = stuck.get(item)
            if action == FailureAction.SKIP:
                gaps.append(f"  - {item}  [STUCK — skip this, work on something else]")
            elif action == FailureAction.REAPPROACH:
                gaps.append(f"  - {item}  [STUCK — try a different approach]")
            else:
                gaps.append(f"  - {item}")

    # 2. Infrastructure gaps (only if mentioned in current roadmap)
    roadmap_text = roadmap_content.lower()
    if not project_state.get("domain_exists") and "domain/" in roadmap_text:
        gaps.append("\nMISSING: domain/ layer (models.py + ports.py)")
    if not project_state.get("has_pyproject") and "pyproject.toml" in roadmap_text:
        gaps.append("\nMISSING: pyproject.toml (project config, ruff config, pytest config)")
    if not project_state.get("has_pyrightconfig") and "pyrightconfig.json" in roadmap_text:
        gaps.append("\nMISSING: pyrightconfig.json (strict type checking config)")

    # 3. Quality failures
    qr = project_state.get("quality_results", {})
    if qr:
        if qr.get("ruff_lint") and not qr["ruff_lint"]["passed"]:
            gaps.append(f"\nRUFF LINT FAILURES:\n{qr['ruff_lint']['output'][:500]}")
        if qr.get("ruff_format") and not qr["ruff_format"]["passed"]:
            gaps.append(f"\nRUFF FORMAT FAILURES:\n{qr['ruff_format']['output'][:500]}")
        if qr.get("pyright") and not qr["pyright"]["passed"]:
            gaps.append(f"\nPYRIGHT TYPE ERRORS:\n{qr['pyright']['output'][:500]}")

    # 4. Test failures
    test_results = project_state.get("test_results")
    if test_results and not test_results["passed"]:
        gaps.append(f"\nFAILING TESTS:\n{test_results['output']}")

    # 5. Inbox items
    for item in project_state.get("inbox_items", []):
        gaps.append(f"\nHUMAN REQUEST ({item['filename']}):\n{item['content']}")

    # 6. Module health — auto-rewrite trigger
    module_health: list[dict[str, Any]] = project_state.get("module_health", [])
    degraded = [m for m in module_health if m.get("status") in ("degraded", "critical")]
    if degraded:
        gaps.append("\nAUTO-REWRITE TRIGGER — degraded modules detected:")
        for m in degraded:
            status = str(m["status"]).upper()
            score = float(m["score"])
            issues = ", ".join(str(i) for i in m.get("issues", []))
            label = f"  - {m['module_name']}: {status} (score={score:.3f})"
            if issues:
                label += f" — {issues}"
            gaps.append(label)

    if not gaps:
        return "NO_GAPS"

    return "\n".join(gaps)
