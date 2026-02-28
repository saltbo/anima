"""Core data types for Anima.

All types are frozen dataclasses with complete type annotations.
This module has ZERO imports from outside the Python standard library.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class IterationStatus(Enum):
    """Outcome of a completed iteration."""

    PASSED = "passed"
    FAILED = "failed"


class Priority(Enum):
    """Priority level for inbox items or tasks."""

    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class QuotaStatus(Enum):
    """API quota/rate-limit state reported by an agent."""

    OK = "ok"
    RATE_LIMITED = "rate_limited"
    QUOTA_EXHAUSTED = "quota_exhausted"


# ---------------------------------------------------------------------------
# Supporting types
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class QualityCheckResult:
    """Result of a single quality check (e.g. ruff lint, pyright)."""

    passed: bool
    output: str


@dataclass(frozen=True)
class TestResult:
    """Result of running the test suite."""

    exit_code: int
    passed: bool
    output: str
    errors: str


@dataclass(frozen=True)
class QualityReport:
    """Aggregated results from all quality checks."""

    ruff_lint: QualityCheckResult | None = None
    ruff_format: QualityCheckResult | None = None
    pyright: QualityCheckResult | None = None


@dataclass(frozen=True)
class QuotaState:
    """Snapshot of API quota/rate-limit state from an agent execution."""

    status: QuotaStatus
    retry_after_seconds: float | None = None
    message: str = ""


@dataclass(frozen=True)
class InboxItem:
    """A human instruction from the inbox directory."""

    filename: str
    content: str


@dataclass(frozen=True)
class ModuleInfo:
    """Metadata about a discovered pipeline module."""

    name: str
    has_contract: bool
    has_spec: bool
    has_core: bool
    has_tests: bool
    files: tuple[str, ...]


# ---------------------------------------------------------------------------
# Core pipeline types
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Vision:
    """Structured representation of the project vision."""

    raw_text: str
    current_version: str
    roadmap_text: str


@dataclass(frozen=True)
class ProjectState:
    """Snapshot of the current project state."""

    files: tuple[str, ...]
    modules: tuple[ModuleInfo, ...]
    domain_exists: bool
    adapters_exist: bool
    kernel_exists: bool
    has_tests: bool
    has_pyproject: bool
    has_pyrightconfig: bool
    inbox_items: tuple[InboxItem, ...]
    quality_results: QualityReport | None = None
    test_results: TestResult | None = None
    protected_hashes: tuple[tuple[str, str | None], ...] = ()


@dataclass(frozen=True)
class GapReport:
    """Analysis of gaps between vision and current state."""

    gaps: tuple[str, ...]
    has_gaps: bool
    raw_text: str


@dataclass(frozen=True)
class IterationPlan:
    """Plan for a single iteration."""

    prompt: str
    iteration_number: int
    target_version: str
    gaps_summary: str


@dataclass(frozen=True)
class ExecutionResult:
    """Result of executing an iteration plan via an agent."""

    success: bool
    output: str
    errors: str
    exit_code: int
    elapsed_seconds: float
    cost_usd: float = 0.0
    total_tokens: int = 0
    dry_run: bool = False
    quota_state: QuotaState | None = None


@dataclass(frozen=True)
class VerificationReport:
    """Result of verifying an iteration's changes."""

    passed: bool
    issues: tuple[str, ...]
    improvements: tuple[str, ...]


@dataclass(frozen=True)
class IterationRecord:
    """Persisted log entry for a completed iteration."""

    iteration_id: str
    timestamp: str
    success: bool
    summary: str
    gaps_addressed: str
    improvements: tuple[str, ...]
    issues: tuple[str, ...]
    agent_output_excerpt: str
    elapsed_seconds: float
    cost_usd: float = 0.0
    total_tokens: int = 0


class FailureAction(Enum):
    """Recommended action for a stuck gap."""

    SKIP = "skip"
    REAPPROACH = "re-approach"


@dataclass(frozen=True)
class FailurePattern:
    """A detected pattern of repeated failure on a specific gap.

    Tracks how many iterations a gap has persisted and whether
    those iterations failed, to recommend skipping or re-approaching.
    """

    gap_text: str
    occurrences: int
    failed_attempts: int
    action: FailureAction
