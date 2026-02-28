# Failure Analyzer — CONTRACT

## Purpose

Detect repeated failure patterns in iteration history so the system
can skip stuck gaps or suggest alternative approaches.

## Interface

```python
def analyze_patterns(
    history: list[dict[str, Any]],
    current_gaps: list[str],
    *,
    threshold: int = 3,
) -> tuple[FailurePattern, ...]
```

## Input

- `history` — list of past iteration records (dicts with `gaps_addressed`,
  `success`, `summary` fields)
- `current_gaps` — individual gap text lines from the current gap analysis
- `threshold` — number of consecutive appearances before a gap is "stuck"

## Output

- Tuple of `FailurePattern` instances for gaps that exceed the threshold.
  Each pattern includes the gap text, occurrence count, failed attempt count,
  and a recommended action (`SKIP` or `REAPPROACH`).

## Dependencies

- `domain.models.FailurePattern`, `domain.models.FailureAction`
- Python standard library only (no adapters, no kernel)

## Constraints

- Pure function, no side effects
- Must not import from `kernel/` or `adapters/`
- O(history × gaps) complexity — acceptable for bounded history
