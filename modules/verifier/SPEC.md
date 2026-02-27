# Verifier — Specification

## Overview

The verifier runs the full quality pipeline (lint, typecheck, tests) against
the project after an execution and produces a VerificationReport. It is the
gatekeeper: nothing gets committed unless the verifier says all stages passed.

## Class: `Verifier`

### Constructor

```python
def __init__(self, linter: LinterPort, test_runner: TestRunnerPort) -> None
```

Both ports are injected — the verifier contains no tool-specific logic.

### Primary Method

```python
def verify(
    self,
    iteration_id: str,
    execution_result: ExecutionResult,
) -> VerificationReport
```

### Verification Pipeline

Three stages run in fixed order. **All stages always run** — a failure in
an earlier stage does not skip later stages. This ensures the report captures
all problems, not just the first.

#### Stage 1: Lint (`ruff check` + `ruff format --check`)

Call `self.linter.run_lint()` → `QualityResult`.

Produce a `StageResult`:
- `stage = "lint"`
- `status = VerificationStatus.PASSED` if `quality_result.passed` else `FAILED`
- `output = quality_result.output`
- `details`: Split output into individual error lines (one per item).

#### Stage 2: Type Check (`pyright`)

Call `self.linter.run_typecheck()` → `QualityResult`.

Produce a `StageResult`:
- `stage = "typecheck"`
- `status = VerificationStatus.PASSED` if `quality_result.passed` else `FAILED`
- `output = quality_result.output`
- `details`: Extract error lines from pyright output.

#### Stage 3: Tests (`pytest --cov`)

Call `self.test_runner.run_tests()` → `QualityResult`.

Produce a `StageResult`:
- `stage = "tests"`
- `status = VerificationStatus.PASSED` if `quality_result.passed` else `FAILED`
- `output = quality_result.output`
- `details`: Extract individual test failure names, or coverage summary.

### Report Assembly

```python
VerificationReport(
    iteration_id=iteration_id,
    stages=[lint_result, typecheck_result, test_result],
    all_passed=all(s.status == VerificationStatus.PASSED for s in stages),
    summary=_build_summary(stages),
)
```

### Summary Generation

The `summary` field is a human-readable string:
- If all passed: `"All 3 verification stages passed."`
- If some failed: `"Failed stages: lint, typecheck"` (listing only failed ones).
- Include error counts: `"lint: 3 errors, typecheck: 0 errors, tests: 2 failures"`.

## Edge Cases

- **Execution was already failed**: Still run verification. The verifier
  reports on the current state of the codebase regardless of execution outcome.
  (The kernel decides whether to rollback based on both execution and verification.)
- **Port raises exception**: Catch and produce a FAILED StageResult with the
  exception message as output.
- **Empty test suite**: If pytest finds 0 tests, `TestRunnerPort` may still
  report `passed=True` depending on configuration. The verifier does not
  second-guess the port — it trusts the result.

## Test Requirements

1. All stages pass → `all_passed = True`, summary says "All 3 ... passed".
2. Lint fails → `all_passed = False`, but typecheck and tests still run.
3. All stages fail → report contains all three failures.
4. Summary includes failed stage names.
5. Port exception → produces FAILED StageResult without crashing.
6. Stage order is always lint → typecheck → tests.
7. Details list is populated from output.
