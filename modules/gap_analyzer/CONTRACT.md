# Gap Analyzer — Contract

## Purpose

Compare the project vision and roadmap against the current project state to identify actionable gaps.

## Interface

```python
def analyze(vision: str, state: ProjectState, history: list[IterationRecord]) -> GapReport
```

## Input

| Parameter | Type                    | Description                              |
|-----------|-------------------------|------------------------------------------|
| `vision`  | `str`                   | Raw text content of VISION.md            |
| `state`   | `ProjectState`          | Current project state from scanner       |
| `history` | `list[IterationRecord]` | Previous iteration records (may be empty)|

## Output

Returns `domain.models.GapReport`:

- `gaps` — ordered tuple of gap descriptions (most important first)
- `has_gaps` — `True` if any gaps exist, `False` otherwise
- `raw_text` — formatted text representation of all gaps for prompt construction

## Dependencies

None. This module is pure logic operating on domain types.

## Constraints

1. Must read the current roadmap version and identify unchecked items.
2. Must surface quality failures (ruff lint, ruff format, pyright) from `state.quality_results`.
3. Must surface test failures from `state.test_results`.
4. Must include inbox items as human requests.
5. Must not perform I/O — all data comes through input parameters.
6. When `has_gaps` is `False`, `raw_text` must be the literal string `"NO_GAPS"`.
7. Infrastructure gaps (missing domain/, pyproject.toml, etc.) are only reported if they appear in the current roadmap version's scope.
