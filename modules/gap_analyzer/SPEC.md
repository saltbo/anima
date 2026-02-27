# Gap Analyzer — Specification

## Overview

The gap analyzer compares a structured Vision against the current ProjectState
to produce a prioritized GapReport. It is the entry point of every iteration:
no gap means no action.

## Class: `GapAnalyzer`

### Constructor

```python
def __init__(self, fs: FileSystemPort) -> None
```

The FileSystemPort is injected but used only if the analyzer needs to read
additional project files beyond what ProjectState provides. In the initial
implementation, all inputs are passed directly — the `fs` dependency is
reserved for future use (e.g., reading VISION.md on demand).

### Primary Method

```python
def analyze(
    self,
    vision: Vision,
    state: ProjectState,
    inbox_items: list[InboxItem],
) -> GapReport
```

### Gap Detection Rules

The analyzer produces gaps from three sources, checked in order:

#### 1. Inbox Items → Gaps

Each `InboxItem` becomes a `Gap` with:
- `category`: `"inbox"`
- `description`: The item's `title` + `what` fields combined.
- `priority`: Mapped from the item's `Priority` value. If the inbox item
  has `Priority.LOW`, it is promoted to at least `Priority.MEDIUM` (humans
  don't write inbox items for things that don't matter).
- `roadmap_version`: `"inbox"` (not tied to a specific roadmap version).
- `evidence`: The item's `why` field.

#### 2. Roadmap Items → Gaps

Each `RoadmapItem` where `completed == False` becomes a `Gap` with:
- `category`: `"roadmap"`
- `description`: The roadmap item's `description`.
- `priority`: Derived from version ordering — lower versions are higher priority.
  v0.1 items → `Priority.URGENT`, v0.2 → `Priority.HIGH`,
  v0.3–v0.4 → `Priority.MEDIUM`, v0.5+ → `Priority.LOW`.
- `roadmap_version`: The item's `version` string.
- `evidence`: `"Uncompleted roadmap item for {version}"`.

#### 3. Quality Failures → Gaps

Each `QualityResult` in `state.quality_results` where `passed == False`
becomes a `Gap` with:
- `category`: `"quality"`
- `description`: `"Quality check failed: {tool}"`.
- `priority`: `Priority.URGENT` (broken pipeline blocks everything).
- `roadmap_version`: The current lowest incomplete roadmap version.
- `evidence`: The quality result's `output` (truncated to 500 chars).

### Sorting and Selection

All gaps are sorted by priority (URGENT > HIGH > MEDIUM > LOW), then by
category order: `quality` > `inbox` > `roadmap` (within the same priority).

`most_critical` is set to the first gap in the sorted list, or `None`
if no gaps exist.

### Timestamp

`GapReport.timestamp` is set to the current UTC time in ISO 8601 format
(`YYYY-MM-DDTHH:MM:SSZ`). The analyzer obtains this from `datetime.datetime`
(stdlib — no external dependency).

## Edge Cases

- **Empty vision roadmap**: Only inbox and quality gaps are produced.
- **No gaps at all**: Returns a `GapReport` with empty `gaps` list and
  `most_critical = None`.
- **All quality checks pass**: No quality gaps are generated.
- **Empty inbox**: No inbox gaps are generated.
- **Duplicate detection**: If an inbox item matches a roadmap item description
  (case-insensitive substring match), the inbox gap replaces the roadmap gap
  (inbox priority takes precedence since a human explicitly requested it).

## Test Requirements

1. Analyze with no gaps → empty GapReport.
2. Analyze with one uncompleted roadmap item → one roadmap gap.
3. Analyze with a failing quality check → quality gap is URGENT and first.
4. Analyze with inbox items → inbox gaps have correct priority mapping.
5. Priority sorting: quality > inbox > roadmap within same priority level.
6. LOW inbox items are promoted to MEDIUM.
7. Duplicate detection: inbox overrides matching roadmap gap.
8. Timestamp is valid ISO 8601 format.
