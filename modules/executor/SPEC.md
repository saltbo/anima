# Executor — Specification

## Overview

The executor takes an IterationPlan and delegates the actual code
generation/modification to an AI coding agent via the AgentPort. It
validates the plan before execution, invokes the agent, and collects
the resulting file changes into an ExecutionResult.

## Class: `Executor`

### Constructor

```python
def __init__(self, agent: AgentPort) -> None
```

The AgentPort is the sole external dependency — the executor itself
contains no code generation logic.

### Primary Method

```python
def execute(self, plan: IterationPlan) -> ExecutionResult
```

### Execution Flow

#### Step 1: Validate Plan (Pre-flight)

Check that no action in `plan.actions` targets a protected file:
- `seed.py`
- `VISION.md`
- Any path starting with `kernel/`

If a protected file is found, return immediately with:
- `success = False`
- `error_message = "Plan targets protected file: {path}"`
- `files_changed = []`

#### Step 2: Delegate to Agent

Call `self.agent.execute_plan(plan)`.

The AgentPort is responsible for:
- Interpreting the plan's actions.
- Making the actual file modifications.
- Returning an ExecutionResult with all file changes.

#### Step 3: Validate Result

After the agent returns, verify the result:
- If `result.success` is `True` but `result.files_changed` is empty and the
  plan had actions with non-empty `target_files`, set `success = False` and
  `error_message = "Agent reported success but no files were changed"`.
- Ensure `result.iteration_id` matches `plan.iteration_id`.
- Ensure `result.plan` matches the input `plan`.

#### Step 4: Return Result

Return the (possibly corrected) ExecutionResult.

## Protected Files

The following paths are protected and must never be modified:
- `seed.py` (exact match)
- `VISION.md` (exact match)
- `kernel/` (prefix match — any path starting with `kernel/`)

Protection is enforced at two levels:
1. Pre-flight validation (Step 1) — rejects plans that target protected files.
2. Post-execution validation — if `files_changed` contains a protected path,
   set `success = False` with an appropriate error message.

## Error Handling

If `agent.execute_plan()` raises an exception:
- Catch the exception.
- Return an ExecutionResult with `success = False`,
  `error_message = str(exception)`, and `files_changed = []`.
- The `agent_output` field should contain any partial output available,
  or the exception traceback as a string.

## Edge Cases

- **Plan with no actions**: Pass through to agent (agent may still perform
  useful work based on acceptance criteria).
- **Agent timeout**: If the AgentPort implementation raises a timeout error,
  capture it as a failed ExecutionResult.
- **Agent modifies protected files**: Caught in post-execution validation.

## Test Requirements

1. Execute valid plan → delegates to AgentPort and returns result.
2. Plan targeting seed.py → immediate failure, agent never called.
3. Plan targeting kernel/loop.py → immediate failure.
4. Agent raises exception → returns failed ExecutionResult with error.
5. Agent returns success but no files changed → corrected to failure.
6. Iteration ID consistency between plan and result.
7. Post-execution protected file detection.
