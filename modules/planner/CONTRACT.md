# Planner Contract

## Purpose

Translates a gap report into a concrete, actionable iteration plan with specific file operations.

## Input

- `gap_report: GapReport` — The gap analysis output identifying what needs to be done.
- `recent_records: list[IterationRecord]` — History of recent iterations (to avoid repeating failures).
- `state: ProjectState` — Current project state for context.

## Output

- `IterationPlan` — A plan containing the target gap, ordered list of `PlannedAction` items, acceptance criteria, and risk assessment.

## Dependencies

- `FileSystemPort` — To read existing module contracts and specs for planning context.

## Constraints

- Must plan for exactly ONE gap per iteration (the `most_critical` from the gap report).
- Must include concrete acceptance criteria that can be verified.
- Must assess risk level ("low", "medium", "high") based on scope of changes.
- Must not plan modifications to protected files (seed.py, VISION.md, kernel/).
- Must avoid re-attempting the same approach if recent history shows it failed.
- core.py must only import from `domain/`.
