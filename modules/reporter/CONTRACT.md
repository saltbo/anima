# Reporter — Contract

## Purpose

Record the results of a completed iteration as a structured, persistent log entry.

## Interface

```python
def record(
    iteration_id: str,
    gaps: GapReport,
    execution: ExecutionResult,
    verification: VerificationReport,
    elapsed: float,
) -> IterationRecord
```

## Input

| Parameter      | Type                 | Description                                |
|----------------|----------------------|--------------------------------------------|
| `iteration_id` | `str`                | Unique iteration identifier (e.g. `"0004-20260227-120000"`) |
| `gaps`         | `GapReport`          | The gap analysis that drove this iteration |
| `execution`    | `ExecutionResult`    | Agent execution output                     |
| `verification` | `VerificationReport` | Verification results                       |
| `elapsed`      | `float`              | Total wall-clock seconds for the iteration |

## Output

Returns `domain.models.IterationRecord` with all fields populated:

- `iteration_id` — echoed from input
- `timestamp` — ISO 8601 UTC timestamp of when the record was created
- `success` — from `verification.passed`
- `summary` — auto-generated one-line summary from improvements or first issue
- `gaps_addressed` — truncated text of gaps (max 1000 chars)
- `improvements` — from `verification.improvements`
- `issues` — from `verification.issues`
- `agent_output_excerpt` — truncated agent output (max 1000 chars)
- `elapsed_seconds` — from input
- `cost_usd` — from `execution.cost_usd`
- `total_tokens` — from `execution.total_tokens`

## Dependencies

| Port             | Usage                                    |
|------------------|------------------------------------------|
| `FileSystemPort` | Write the JSON log to `iterations/`      |

## Constraints

1. Must write a JSON file to `iterations/<iteration_id>.json`.
2. The JSON must be human-readable (indented, non-ASCII preserved).
3. Must create the `iterations/` directory if it doesn't exist.
4. Summary generation: if improvements exist, join first 3; if only issues, use first issue (truncated to 100 chars); otherwise `"No significant changes"`.
5. Must not raise on write failure — log the error and return the record anyway.
6. Agent output excerpt must be truncated to 1000 characters maximum.
