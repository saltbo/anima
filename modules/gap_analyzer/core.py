"""Gap Analyzer module — compares Vision against ProjectState to produce a GapReport.

This module is the entry point of every iteration cycle: no gap means no action.
It depends only on domain/ types and has zero external imports beyond stdlib.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from domain.models import (
    Gap,
    GapReport,
    InboxItem,
    Priority,
    ProjectState,
    Vision,
)

if TYPE_CHECKING:
    from domain.ports import FileSystemPort

# Category sort order: quality issues first, then human requests, then roadmap.
_CATEGORY_ORDER: dict[str, int] = {
    "quality": 0,
    "inbox": 1,
    "roadmap": 2,
}

_PRIORITY_ORDER: dict[Priority, int] = {
    Priority.URGENT: 0,
    Priority.HIGH: 1,
    Priority.MEDIUM: 2,
    Priority.LOW: 3,
}

# Roadmap version → priority mapping.
_VERSION_PRIORITY: list[tuple[str, Priority]] = [
    ("0.1", Priority.URGENT),
    ("0.2", Priority.HIGH),
    ("0.3", Priority.MEDIUM),
    ("0.4", Priority.MEDIUM),
]
# Anything v0.5+ defaults to LOW.


def _version_to_priority(version: str) -> Priority:
    """Map a roadmap version string to a priority level."""
    for prefix, priority in _VERSION_PRIORITY:
        if version.startswith(prefix) or version == prefix:
            return priority
    return Priority.LOW


def _sort_key(gap: Gap) -> tuple[int, int]:
    """Sort key: priority first (URGENT=0), then category order."""
    return (
        _PRIORITY_ORDER.get(gap.priority, 3),
        _CATEGORY_ORDER.get(gap.category, 99),
    )


class GapAnalyzer:
    """Compares a structured Vision against the current ProjectState to produce a GapReport.

    Constructor-injected FileSystemPort is reserved for future use (e.g., reading
    VISION.md on demand). In the initial implementation, all inputs are passed directly.
    """

    def __init__(self, fs: FileSystemPort) -> None:
        self._fs = fs

    def analyze(
        self,
        vision: Vision,
        state: ProjectState,
        inbox_items: list[InboxItem],
    ) -> GapReport:
        """Analyze gaps between vision and current state.

        Gap sources (checked in order):
        1. Inbox items → gaps (human requests).
        2. Roadmap items → gaps (uncompleted milestones).
        3. Quality failures → gaps (broken pipeline).

        Duplicate detection: if an inbox item matches a roadmap item description
        (case-insensitive substring), the inbox gap replaces the roadmap gap.
        """
        inbox_gaps = self._inbox_gaps(inbox_items)
        roadmap_gaps = self._roadmap_gaps(vision)
        quality_gaps = self._quality_gaps(state, vision)

        # Duplicate detection: remove roadmap gaps that match inbox items.
        roadmap_gaps = self._deduplicate(inbox_gaps, roadmap_gaps)

        all_gaps = inbox_gaps + roadmap_gaps + quality_gaps
        all_gaps.sort(key=_sort_key)

        most_critical = all_gaps[0] if all_gaps else None
        timestamp = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")

        return GapReport(
            gaps=all_gaps,
            most_critical=most_critical,
            timestamp=timestamp,
        )

    def _inbox_gaps(self, inbox_items: list[InboxItem]) -> list[Gap]:
        """Convert inbox items to gaps."""
        gaps: list[Gap] = []
        for item in inbox_items:
            # LOW inbox items are promoted to at least MEDIUM.
            priority = item.priority
            if priority == Priority.LOW:
                priority = Priority.MEDIUM

            gaps.append(
                Gap(
                    category="inbox",
                    description=f"{item.title}: {item.what}",
                    priority=priority,
                    roadmap_version="inbox",
                    evidence=item.why,
                )
            )
        return gaps

    def _roadmap_gaps(self, vision: Vision) -> list[Gap]:
        """Convert uncompleted roadmap items to gaps."""
        gaps: list[Gap] = []
        for item in vision.roadmap_items:
            if not item.completed:
                gaps.append(
                    Gap(
                        category="roadmap",
                        description=item.description,
                        priority=_version_to_priority(item.version),
                        roadmap_version=item.version,
                        evidence=f"Uncompleted roadmap item for {item.version}",
                    )
                )
        return gaps

    def _quality_gaps(self, state: ProjectState, vision: Vision) -> list[Gap]:
        """Convert quality failures to URGENT gaps."""
        # Find the lowest incomplete roadmap version for context.
        lowest_version = self._lowest_incomplete_version(vision)

        gaps: list[Gap] = []
        for result in state.quality_results:
            if not result.passed:
                gaps.append(
                    Gap(
                        category="quality",
                        description=f"Quality check failed: {result.tool}",
                        priority=Priority.URGENT,
                        roadmap_version=lowest_version,
                        evidence=result.output[:500],
                    )
                )
        return gaps

    def _lowest_incomplete_version(self, vision: Vision) -> str:
        """Find the lowest roadmap version that has incomplete items."""
        versions: list[str] = []
        for item in vision.roadmap_items:
            if not item.completed:
                versions.append(item.version)
        if not versions:
            return "unknown"
        versions.sort()
        return versions[0]

    def _deduplicate(
        self,
        inbox_gaps: list[Gap],
        roadmap_gaps: list[Gap],
    ) -> list[Gap]:
        """Remove roadmap gaps that are duplicated by inbox gaps.

        A roadmap gap is considered a duplicate if any inbox gap's description
        contains the roadmap gap's description as a case-insensitive substring,
        or vice versa.
        """
        if not inbox_gaps:
            return roadmap_gaps

        inbox_descriptions_lower = [g.description.lower() for g in inbox_gaps]

        filtered: list[Gap] = []
        for rg in roadmap_gaps:
            roadmap_desc_lower = rg.description.lower()
            is_duplicate = False
            for inbox_desc in inbox_descriptions_lower:
                if roadmap_desc_lower in inbox_desc or inbox_desc in roadmap_desc_lower:
                    is_duplicate = True
                    break
            if not is_duplicate:
                filtered.append(rg)
        return filtered
