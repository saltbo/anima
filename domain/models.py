"""Core domain models for Anima.

All models are frozen dataclasses with complete type annotations.
This module has ZERO external imports — only stdlib and typing.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum


class Priority(Enum):
    """Priority levels for gaps and tasks."""

    URGENT = "urgent"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class IterationOutcome(Enum):
    """Outcome of an iteration attempt."""

    SUCCESS = "success"
    PARTIAL = "partial"
    FAILURE = "failure"
    ROLLBACK = "rollback"


class VerificationStatus(Enum):
    """Status of a verification stage."""

    PASSED = "passed"
    FAILED = "failed"
    SKIPPED = "skipped"


# ── Vision ──────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class RoadmapItem:
    """A single item from the version roadmap."""

    version: str
    description: str
    completed: bool


@dataclass(frozen=True)
class Vision:
    """Structured representation of the project vision.

    Parsed from VISION.md — the immutable north star that drives gap analysis.
    """

    identity: str
    principles: list[str]
    roadmap_items: list[RoadmapItem]
    quality_standards: list[str]


# ── Project State ───────────────────────────────────────────────────────────


@dataclass(frozen=True)
class FileInfo:
    """Metadata about a file in the project."""

    path: str
    size_bytes: int
    last_modified: str


@dataclass(frozen=True)
class QualityResult:
    """Result of running a single quality tool."""

    tool: str
    passed: bool
    output: str
    error_count: int


@dataclass(frozen=True)
class ProjectState:
    """Snapshot of the project at a point in time.

    Captures file structure, quality pipeline results, and recent history.
    """

    files: list[FileInfo]
    quality_results: list[QualityResult]
    recent_iterations: list[str]
    current_branch: str
    commit_hash: str


# ── Gap Report ──────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Gap:
    """A single gap between current state and desired state."""

    category: str
    description: str
    priority: Priority
    roadmap_version: str
    evidence: str


@dataclass(frozen=True)
class GapReport:
    """Result of gap analysis: what needs to be done.

    Produced by the gap_analyzer module. Consumed by the planner module.
    """

    gaps: list[Gap]
    most_critical: Gap | None
    timestamp: str


# ── Iteration Plan ──────────────────────────────────────────────────────────


@dataclass(frozen=True)
class PlannedAction:
    """A single action the agent should take during an iteration."""

    description: str
    target_files: list[str]
    action_type: str  # "create", "modify", "delete"


@dataclass(frozen=True)
class IterationPlan:
    """What to do in the next iteration.

    Produced by the planner module. Consumed by the executor module.
    """

    iteration_id: str
    gap: Gap
    actions: list[PlannedAction]
    acceptance_criteria: list[str]
    estimated_risk: str  # "low", "medium", "high"


# ── Execution Result ────────────────────────────────────────────────────────


@dataclass(frozen=True)
class FileChange:
    """A file that was created, modified, or deleted during execution."""

    path: str
    change_type: str  # "created", "modified", "deleted"
    diff_summary: str


@dataclass(frozen=True)
class ExecutionResult:
    """Output from the agent executing an iteration plan.

    Produced by the executor module. Consumed by the verifier module.
    """

    iteration_id: str
    plan: IterationPlan
    files_changed: list[FileChange]
    agent_output: str
    success: bool
    error_message: str


# ── Verification Report ─────────────────────────────────────────────────────


@dataclass(frozen=True)
class StageResult:
    """Result of a single verification stage (lint, typecheck, test)."""

    stage: str
    status: VerificationStatus
    output: str
    details: list[str]


@dataclass(frozen=True)
class VerificationReport:
    """Pass/fail result of the full verification pipeline.

    Produced by the verifier module. Consumed by the reporter and kernel.
    """

    iteration_id: str
    stages: list[StageResult]
    all_passed: bool
    summary: str


# ── Iteration Record ────────────────────────────────────────────────────────


@dataclass(frozen=True)
class IterationRecord:
    """Persisted log entry for a completed iteration.

    Written to iterations/ as a JSON file by the reporter module.
    """

    iteration_id: str
    timestamp: str
    gap_addressed: Gap
    plan: IterationPlan
    execution: ExecutionResult
    verification: VerificationReport
    outcome: IterationOutcome
    duration_seconds: float
    notes: str


# ── Inbox Item ──────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class InboxItem:
    """A human intent item from the inbox/ directory."""

    filename: str
    title: str
    what: str
    why: str
    priority: Priority
    constraints: str
