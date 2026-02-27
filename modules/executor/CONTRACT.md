# Executor Contract

## Purpose

Executes an iteration plan by delegating code generation to an AI agent and collecting the results.

## Input

- `plan: IterationPlan` — The plan to execute, containing actions and acceptance criteria.

## Output

- `ExecutionResult` — Contains the iteration ID, the plan that was executed, list of `FileChange` objects, raw agent output, success flag, and error message.

## Dependencies

- `AgentPort` — To delegate code generation/modification to an AI coding agent.

## Constraints

- Must not execute plans that target protected files (seed.py, VISION.md, kernel/).
- Must capture all file changes made by the agent.
- Must set `success=False` and populate `error_message` if the agent fails or times out.
- Must not modify files directly — all modifications go through the AgentPort.
- core.py must only import from `domain/`.
