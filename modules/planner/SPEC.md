# Planner — Specification

## Overview

The planner translates a GapReport into a single, concrete IterationPlan.
It picks the most critical gap and produces file-level actions with clear
acceptance criteria. It also consults iteration history to avoid repeating
failed approaches.

## Class: `Planner`

### Constructor

```python
def __init__(self, fs: FileSystemPort) -> None
```

The FileSystemPort allows the planner to read CONTRACT.md and SPEC.md files
for modules it plans to create or modify, giving it context for generating
accurate actions.

### Primary Method

```python
def plan(
    self,
    gap_report: GapReport,
    recent_records: list[IterationRecord],
    state: ProjectState,
) -> IterationPlan | None
```

Returns `None` if the gap report has no gaps (`most_critical is None`).

## Planning Logic

### Step 1: Select the Gap

Use `gap_report.most_critical`. If it is `None`, return `None`.

### Step 2: Check History for Repeated Failures

Scan `recent_records` (up to the last 5) for iterations that:
- Addressed the same gap category and description.
- Had `outcome == IterationOutcome.FAILURE` or `IterationOutcome.ROLLBACK`.

If the same gap has failed 3+ times consecutively, downgrade it: skip to the
next gap in `gap_report.gaps` that has NOT failed 3+ times. If all gaps have
been exhausted, return a plan with `estimated_risk = "high"` and a note in
the first action's description explaining the repeated failure.

### Step 3: Generate Actions

Based on the gap's `category`:

#### Category: `"quality"`
- Single action: `action_type = "modify"`, targeting the files mentioned in
  the quality tool's output (extracted from `gap.evidence`).
- Description: `"Fix {tool} failures"`.

#### Category: `"inbox"`
- Read the inbox item's constraints and generate actions accordingly.
- Default action_type is `"create"` for new files, `"modify"` for existing.
- Target files are inferred from the description keywords and project
  structure (e.g., "domain" → `domain/*.py`, "module X" → `modules/X/`).

#### Category: `"roadmap"`
- Map the roadmap item description to concrete file operations:
  - "Create ..." → `action_type = "create"`, target files derived from description.
  - "Implement ..." → `action_type = "create"` or `"modify"`.
  - "Tests for ..." → `action_type = "create"`, target `modules/X/tests/`.
  - "All code passes ..." → `action_type = "modify"`, target failing files.

### Step 4: Generate Acceptance Criteria

Every plan must include at least:
1. `"All new/modified files pass ruff check"`.
2. `"All new/modified files pass pyright strict"`.
3. Gap-specific criteria derived from the gap description.

### Step 5: Assess Risk

- `"low"`: Actions only create new files or modify test files.
- `"medium"`: Actions modify existing source files (not in domain/).
- `"high"`: Actions modify domain/ files, or the gap has failed before.

### Step 6: Generate Iteration ID

Format: `iter-NNNN-YYYYMMDD-HHMMSS` where NNNN is a zero-padded sequence
number derived from the count of `recent_records + 1`.

### Protected File Validation

Before returning the plan, validate that no action targets:
- `seed.py`
- `VISION.md`
- Any path starting with `kernel/`

If a protected file is targeted, remove that action from the plan. If all
actions are removed, return `None`.

## Edge Cases

- **No gaps**: Return `None`.
- **All gaps exhausted by failure history**: Return high-risk plan for the
  original most_critical gap with a warning.
- **Empty recent_records**: Skip failure history check entirely.
- **Gap description doesn't map to files**: Generate a single action with
  `target_files = []` and `action_type = "create"` — the executor/agent
  will determine the actual files.

## Test Requirements

1. Plan with no gaps → returns `None`.
2. Plan with one roadmap gap → produces valid IterationPlan.
3. Plan with quality gap → targets files from evidence.
4. Protected file filtering → actions targeting seed.py are removed.
5. Repeated failure handling → skips to next gap after 3 failures.
6. Risk assessment: new files → low, domain/ changes → high.
7. Iteration ID format is correct.
8. Acceptance criteria always include ruff and pyright checks.
