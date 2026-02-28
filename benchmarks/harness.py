"""Benchmark framework — types for benchmark validation results.

Provides frozen dataclasses used by all benchmark implementations.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class BenchmarkCriterion:
    """A single pass/fail criterion in a benchmark."""

    name: str
    passed: bool
    detail: str


@dataclass(frozen=True)
class BenchmarkResult:
    """Outcome of running a benchmark validation."""

    name: str
    passed: bool
    criteria: tuple[BenchmarkCriterion, ...]
    metrics: tuple[tuple[str, float], ...]
    summary: str
