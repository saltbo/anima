# Planner — Contract

## Purpose

Transform a gap report into a concrete iteration plan (prompt) for the AI agent.

## Interface

```python
def plan(
    state: ProjectState,
    gaps: GapReport,
    history: list[IterationRecord],
    iteration_count: int,
) -> IterationPlan
```

## Input

| Parameter         | Type                    | Description                            |
|-------------------|-------------------------|----------------------------------------|
| `state`           | `ProjectState`          | Current project state from scanner     |
| `gaps`            | `GapReport`             | Gap analysis output                    |
| `history`         | `list[IterationRecord]` | Previous iteration records             |
| `iteration_count` | `int`                   | Number of iterations completed so far  |

## Output

Returns `domain.models.IterationPlan`:

- `prompt` — complete prompt text for the agent, carrying only dynamic per-iteration data (static context like SOUL.md/VISION.md is read by the agent itself)
- `iteration_number` — `iteration_count + 1`
- `target_version` — current roadmap version string (e.g. `"0.1"`)
- `gaps_summary` — brief summary of addressed gaps

## Dependencies

None. This module is pure logic operating on domain types.

## Constraints

1. The prompt must include: gap list, recent history (last 3 iterations), and a brief state summary.
2. The prompt must NOT include full file listings — the agent can scan the project itself.
3. The prompt must instruct the agent to read SOUL.md, VISION.md, and the current roadmap file.
4. The prompt must instruct the agent to run verification after changes.
5. The prompt must focus on the single most important gap (per SOUL.md principle 1).
6. Must not perform I/O — all data comes through input parameters.
