"""Seed bridge — adapts seed.py's dict-based interface to typed domain modules.

This adapter enables seed.py to delegate gap analysis and reporting to the
purpose-built modules (gap_analyzer, reporter) while maintaining backward
compatibility with the seed's existing function signatures.

Architecture: adapters → modules → domain (correct dependency direction).
"""

from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from adapters.local_fs import LocalFileSystem
from domain.models import (
    ExecutionResult,
    Gap,
    GapReport,
    InboxItem,
    IterationOutcome,
    IterationPlan,
    IterationRecord,
    PlannedAction,
    Priority,
    ProjectState,
    QualityResult,
    RoadmapItem,
    StageResult,
    VerificationReport,
    VerificationStatus,
    Vision,
)
from modules.gap_analyzer.core import GapAnalyzer
from modules.reporter.core import Reporter

if TYPE_CHECKING:
    from domain.ports import FileSystemPort


# ---------------------------------------------------------------------------
# Conversion helpers (seed dict → domain types)
# ---------------------------------------------------------------------------


def parse_roadmap_items(fs: FileSystemPort) -> list[RoadmapItem]:
    """Parse all roadmap items from roadmap/v*.md files via FileSystemPort."""
    try:
        file_infos = fs.list_files("roadmap", "v*.md")
    except (FileNotFoundError, OSError):
        return []

    items: list[RoadmapItem] = []
    for fi in file_infos:
        match = re.search(r"v([\d.]+)\.md$", fi.path)
        if not match:
            continue
        version = match.group(1)
        content = fs.read_file(fi.path)
        for line in content.split("\n"):
            stripped = line.strip()
            if stripped.startswith("- [ ]"):
                items.append(
                    RoadmapItem(
                        version=version,
                        description=stripped[6:].strip(),
                        completed=False,
                    )
                )
            elif stripped.startswith(("- [x]", "- [X]")):
                items.append(
                    RoadmapItem(
                        version=version,
                        description=stripped[6:].strip(),
                        completed=True,
                    )
                )
    return items


def build_vision(roadmap_items: list[RoadmapItem]) -> Vision:
    """Build a Vision from roadmap items.

    Identity, principles, and quality_standards are set to minimal defaults
    since GapAnalyzer primarily operates on roadmap_items.
    """
    return Vision(
        identity="Anima — Autonomous Iteration Engine",
        principles=[],
        roadmap_items=roadmap_items,
        quality_standards=[],
    )


def convert_quality_results(state_dict: dict[str, Any]) -> list[QualityResult]:
    """Convert seed's quality_results and test_results to domain QualityResult list."""
    results: list[QualityResult] = []

    qr: dict[str, Any] = state_dict.get("quality_results") or {}
    for key in ("ruff_lint", "ruff_format", "pyright"):
        data: Any = qr.get(key)
        if data is not None:
            results.append(
                QualityResult(
                    tool=key,
                    passed=bool(data.get("passed", False)),
                    output=str(data.get("output", "")),
                    error_count=0,
                )
            )

    test_data: Any = state_dict.get("test_results")
    if test_data is not None:
        results.append(
            QualityResult(
                tool="pytest",
                passed=bool(test_data.get("passed", False)),
                output=str(test_data.get("output", "")),
                error_count=0,
            )
        )

    return results


def build_project_state(state_dict: dict[str, Any]) -> ProjectState:
    """Convert seed's project state dict to a domain ProjectState."""
    return ProjectState(
        files=[],
        quality_results=convert_quality_results(state_dict),
        recent_iterations=[],
        current_branch="master",
        commit_hash="",
    )


def parse_inbox_item(item_dict: dict[str, Any]) -> InboxItem:
    """Parse a seed inbox item dict into a domain InboxItem.

    Expects keys: ``filename`` (str) and ``content`` (str with markdown sections).
    """
    content: str = str(item_dict.get("content", ""))
    filename: str = str(item_dict.get("filename", "unknown.md"))

    title = ""
    current_section = ""
    section_lines: dict[str, list[str]] = {}

    for line in content.split("\n"):
        stripped = line.strip()
        if stripped.startswith("# ") and not title:
            title = stripped[2:].strip()
        elif stripped.startswith("## "):
            current_section = stripped[3:].strip().lower()
            # Normalize "constraints (optional)" → "constraints"
            current_section = current_section.split("(")[0].strip()
            section_lines[current_section] = []
        elif current_section:
            section_lines.setdefault(current_section, []).append(line)

    what = "\n".join(section_lines.get("what", [])).strip()
    why = "\n".join(section_lines.get("why", [])).strip()
    constraints = "\n".join(section_lines.get("constraints", [])).strip()

    priority_text = "\n".join(section_lines.get("priority", [])).strip().lower()
    if "urgent" in priority_text:
        priority = Priority.URGENT
    elif "high" in priority_text:
        priority = Priority.HIGH
    elif "low" in priority_text:
        priority = Priority.LOW
    else:
        priority = Priority.MEDIUM

    return InboxItem(
        filename=filename,
        title=title or filename,
        what=what,
        why=why,
        priority=priority,
        constraints=constraints,
    )


def current_version(fs: FileSystemPort) -> str:
    """Return the first roadmap version that still has unchecked items."""
    try:
        file_infos = fs.list_files("roadmap", "v*.md")
    except (FileNotFoundError, OSError):
        return "0.1"

    if not file_infos:
        return "0.1"

    for fi in file_infos:
        content = fs.read_file(fi.path)
        if "- [ ]" in content:
            match = re.search(r"v([\d.]+)\.md$", fi.path)
            if match:
                return match.group(1)

    # All versions complete — return the last one.
    last = file_infos[-1]
    match = re.search(r"v([\d.]+)\.md$", last.path)
    return match.group(1) if match else "0.1"


# ---------------------------------------------------------------------------
# GapReport → text formatting (matching seed.py's output format)
# ---------------------------------------------------------------------------


def format_gap_report(report: GapReport, version: str) -> str:
    """Format a GapReport as text compatible with seed.py's prompt format."""
    if not report.gaps:
        return "NO_GAPS"

    lines: list[str] = []

    # Group by category.
    roadmap_gaps = [
        g for g in report.gaps if g.category == "roadmap" and g.roadmap_version == version
    ]
    quality_gaps = [g for g in report.gaps if g.category == "quality"]
    inbox_gaps = [g for g in report.gaps if g.category == "inbox"]

    if roadmap_gaps:
        lines.append(f"UNCOMPLETED ROADMAP ITEMS for v{version} ({len(roadmap_gaps)}):")
        for gap in roadmap_gaps:
            lines.append(f"  - {gap.description}")

    for gap in quality_gaps:
        tool = gap.description.replace("Quality check failed: ", "")
        if tool == "pytest":
            lines.append(f"\nFAILING TESTS:\n{gap.evidence}")
        elif tool == "ruff_lint":
            lines.append(f"\nRUFF LINT FAILURES:\n{gap.evidence}")
        elif tool == "ruff_format":
            lines.append(f"\nRUFF FORMAT FAILURES:\n{gap.evidence}")
        elif tool == "pyright":
            lines.append(f"\nPYRIGHT TYPE ERRORS:\n{gap.evidence}")
        else:
            lines.append(f"\n{gap.description}:\n{gap.evidence}")

    for gap in inbox_gaps:
        lines.append(f"\nHUMAN REQUEST:\n{gap.description}")
        if gap.evidence:
            lines.append(f"Why: {gap.evidence}")

    return "\n".join(lines) if lines else "NO_GAPS"


# ---------------------------------------------------------------------------
# IterationRecord builder (seed dicts → domain IterationRecord)
# ---------------------------------------------------------------------------


def build_iteration_record(
    iteration_id: str,
    gaps: str,
    execution_result: dict[str, Any],
    verification: dict[str, Any],
    elapsed: float,
) -> IterationRecord:
    """Build an IterationRecord from seed.py's simple dict inputs.

    Fields not available in seed's data are filled with minimal placeholders.
    """
    timestamp = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")

    gap_addressed = Gap(
        category="iteration",
        description=gaps[:200] if gaps else "Unknown gap",
        priority=Priority.MEDIUM,
        roadmap_version="unknown",
        evidence="",
    )

    plan = IterationPlan(
        iteration_id=iteration_id,
        gap=gap_addressed,
        actions=[
            PlannedAction(
                description="Automated iteration",
                target_files=[],
                action_type="modify",
            ),
        ],
        acceptance_criteria=["Quality pipeline passes"],
        estimated_risk="low",
    )

    execution = ExecutionResult(
        iteration_id=iteration_id,
        plan=plan,
        files_changed=[],
        agent_output=str(execution_result.get("output", ""))[:2000],
        success=bool(execution_result.get("success", False)),
        error_message=str(execution_result.get("errors", "")),
    )

    stages: list[StageResult] = []
    issues: list[str] = verification.get("issues") or []
    if issues:
        for issue in issues:
            stages.append(
                StageResult(
                    stage="verification",
                    status=VerificationStatus.FAILED,
                    output=str(issue)[:500],
                    details=[],
                )
            )
    else:
        stages.append(
            StageResult(
                stage="verification",
                status=VerificationStatus.PASSED,
                output="All checks passed",
                details=[],
            )
        )

    ver_report = VerificationReport(
        iteration_id=iteration_id,
        stages=stages,
        all_passed=bool(verification.get("passed", False)),
        summary=_generate_summary(verification),
    )

    outcome = (
        IterationOutcome.SUCCESS if verification.get("passed", False) else IterationOutcome.FAILURE
    )

    return IterationRecord(
        iteration_id=iteration_id,
        timestamp=timestamp,
        gap_addressed=gap_addressed,
        plan=plan,
        execution=execution,
        verification=ver_report,
        outcome=outcome,
        duration_seconds=elapsed,
        notes="",
    )


def _generate_summary(verification: dict[str, Any]) -> str:
    """Generate a one-line summary from a verification dict."""
    improvements: list[str] = verification.get("improvements") or []
    issues: list[str] = verification.get("issues") or []
    if improvements:
        return "; ".join(improvements[:3])
    if issues:
        return f"Failed: {str(issues[0])[:100]}"
    return "No significant changes"


# ---------------------------------------------------------------------------
# SeedBridge — the main entry point for seed.py delegation
# ---------------------------------------------------------------------------


class SeedBridge:
    """Bridges seed.py's untyped interface to Anima's typed domain modules.

    Usage in seed.py::

        from adapters.seed_bridge import SeedBridge

        bridge = SeedBridge(str(ROOT))
        gaps = bridge.analyze_gaps(vision_text, project_state, history)
        report = bridge.record_iteration(iteration_id, gaps, exec_result, verification, elapsed)
    """

    def __init__(self, base_dir: str) -> None:
        self._fs: FileSystemPort = LocalFileSystem(base_dir)
        self._gap_analyzer = GapAnalyzer(self._fs)
        self._reporter = Reporter(self._fs)

    def analyze_gaps(
        self,
        vision_text: str,
        project_state: dict[str, Any],
        history: list[dict[str, Any]],
    ) -> str:
        """Drop-in replacement for seed.py's ``analyze_gaps`` function.

        Converts seed's dict-based inputs to domain types, delegates to the
        GapAnalyzer module, and formats the GapReport as text.
        """
        roadmap_items = parse_roadmap_items(self._fs)
        vision = build_vision(roadmap_items)
        state = build_project_state(project_state)

        raw_inbox: list[dict[str, Any]] = project_state.get("inbox_items") or []
        inbox_items = [parse_inbox_item(item) for item in raw_inbox]

        report = self._gap_analyzer.analyze(vision, state, inbox_items)
        ver = current_version(self._fs)
        return format_gap_report(report, ver)

    def record_iteration(
        self,
        iteration_id: str,
        gaps: str,
        execution_result: dict[str, Any],
        verification: dict[str, Any],
        elapsed: float,
    ) -> dict[str, Any]:
        """Drop-in replacement for seed.py's ``record_iteration`` function.

        Converts seed's dict-based inputs to an IterationRecord, delegates to
        the Reporter module for persistence, and returns a compatible dict.
        """
        record = build_iteration_record(
            iteration_id, gaps, execution_result, verification, elapsed
        )
        file_path = self._reporter.save_record(record)

        summary = _generate_summary(verification)
        report: dict[str, Any] = {
            "id": iteration_id,
            "timestamp": record.timestamp,
            "success": bool(verification.get("passed", False)),
            "summary": summary,
            "gaps_addressed": gaps[:1000],
            "improvements": verification.get("improvements") or [],
            "issues": verification.get("issues") or [],
            "agent_output_excerpt": str(execution_result.get("output", ""))[:1000],
            "elapsed_seconds": elapsed,
            "file_path": file_path,
        }

        # Print summary matching seed's output format.
        print(f"\n{'─' * 50}")
        print(f"  Iteration {iteration_id}")
        status = "✓ PASSED" if report["success"] else "✗ FAILED"
        print(f"  Status: {status}")
        print(f"  Time: {elapsed:.1f}s")
        for imp in report["improvements"]:
            print(f"  ✓ {imp}")
        for issue in report["issues"]:
            print(f"  ✗ {str(issue)[:120]}")
        print(f"{'─' * 50}")

        return report
