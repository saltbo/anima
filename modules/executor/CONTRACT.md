# Executor — Contract

## Purpose

Send an iteration plan to an AI agent and capture the execution result.

## Interface

```python
def execute(plan: IterationPlan, dry_run: bool = False) -> ExecutionResult
```

## Input

| Parameter | Type            | Description                              |
|-----------|-----------------|------------------------------------------|
| `plan`    | `IterationPlan` | The iteration plan containing the prompt |
| `dry_run` | `bool`          | If `True`, display the prompt without executing |

## Output

Returns `domain.models.ExecutionResult`:

- `success` — `True` if the agent exited with code 0
- `output` — agent's text output (truncated to last 5000 chars)
- `errors` — stderr output (truncated to last 2000 chars)
- `exit_code` — agent process exit code
- `elapsed_seconds` — wall-clock execution time
- `cost_usd` — monetary cost reported by the agent (default `0.0`)
- `total_tokens` — token usage reported by the agent (default `0`)
- `dry_run` — reflects the `dry_run` input flag

## Dependencies

| Port        | Usage                                  |
|-------------|----------------------------------------|
| `AgentPort` | Execute the prompt and return results  |

## Constraints

1. In dry-run mode, must return `ExecutionResult(success=True, output="(dry run)", dry_run=True, ...)` without invoking the agent.
2. Must handle agent command not found gracefully (return failure, not raise).
3. Must handle agent timeout gracefully (return failure after timeout).
4. Must save the prompt to `.anima/current_prompt.txt` before execution for debugging.
5. Must stream agent output in real-time when possible.
6. Must capture and report cost/token metrics when the agent provides them.
