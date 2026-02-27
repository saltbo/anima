# Verifier Contract

## Purpose

Runs the full quality pipeline (lint, typecheck, tests) against the project and produces a verification report.

## Input

- `iteration_id: str` — The iteration being verified.
- `execution_result: ExecutionResult` — The execution output to verify.

## Output

- `VerificationReport` — Contains per-stage results (`StageResult` for lint, typecheck, tests), overall pass/fail, and a human-readable summary.

## Dependencies

- `LinterPort` — To run ruff lint and format checks, and pyright type checking.
- `TestRunnerPort` — To run pytest with coverage.

## Constraints

- Must run all three stages: lint, typecheck, tests — in that order.
- `all_passed` must be `True` only if ALL stages passed.
- Must capture full output from each stage for debugging failed iterations.
- Must not modify any files — verification is read-only.
- A stage failure should not prevent subsequent stages from running (run all, report all).
- core.py must only import from `domain/`.
