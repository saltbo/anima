# Executor — v0.6 Spec

Robust agent execution with retry logic, structured output, and quota awareness.

## Behavior

1. Accept an `IterationPlan` and a `dry_run` flag.
2. **Dry-run mode**: log the prompt (truncated to 3000 chars) and return
   `ExecutionResult(success=True, output="(dry run)", dry_run=True, ...)` without
   invoking the agent.
3. **Normal mode**:
   a. Save the prompt to `.anima/current_prompt.txt`.
   b. Delegate execution to the injected `AgentPort`.
   c. On transient failure (non-zero exit, agent error), retry up to
      `max_retries` times with exponential backoff (base 2s, capped at 30s).
   d. **Skip retries** when the result carries a `quota_state` with status
      `RATE_LIMITED` or `QUOTA_EXHAUSTED` — retrying won't help.
   e. Return the final `ExecutionResult` (including `quota_state` if detected).
4. Handle `KeyboardInterrupt` by re-raising without retry.

## Constructor

```python
Executor(agent: AgentPort, *, max_retries: int = 2, base_delay: float = 2.0)
```

## Public Method

```python
def execute(self, plan: IterationPlan, dry_run: bool = False) -> ExecutionResult
```

## Retry Policy

- Only retry when `ExecutionResult.success` is `False` and exit_code != -1
  (exit_code -1 means the agent command was not found — no point retrying).
- **Do not retry** when `quota_state` indicates `RATE_LIMITED` or
  `QUOTA_EXHAUSTED` — the failure is not transient within the retry window.
- Delay between retries: `min(base_delay * 2^attempt, 30.0)` seconds.
- Log each retry attempt at WARNING level.
- Return the result of the last attempt.

## Quota Awareness

The `ExecutionResult.quota_state` field (optional `QuotaState`) is populated
by the `AgentPort` adapter when it detects rate-limit or quota signals in
the agent's output.  The executor propagates this field unchanged so the
kernel can inspect it and decide whether to sleep or pause.

## Not in Scope

- Configurable agent command (handled by adapter).
- Multiple agent backend selection (future work).
- Auto-sleep/resume on quota exhaustion (kernel responsibility, v0.6).
