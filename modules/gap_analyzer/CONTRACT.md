# Gap Analyzer Contract

## Purpose

Compares the project vision against current project state to identify gaps that need to be addressed.

## Input

- `vision: Vision` — Structured representation of the project vision (parsed from VISION.md).
- `state: ProjectState` — Snapshot of the current project (files, quality results, recent iterations).
- `inbox_items: list[InboxItem]` — Human intent items from the inbox/ directory.

## Output

- `GapReport` — Contains a prioritized list of `Gap` objects and the single most critical gap.

## Dependencies

- `FileSystemPort` — To read VISION.md and scan project structure.

## Constraints

- Must return gaps sorted by priority (URGENT > HIGH > MEDIUM > LOW).
- Must always identify `most_critical` as the highest-priority, most actionable gap.
- Must incorporate inbox items as HIGH or URGENT priority gaps.
- Must not modify any files — this module is read-only analysis.
- Must produce a deterministic result for the same inputs (no randomness).
- core.py must only import from `domain/`.
