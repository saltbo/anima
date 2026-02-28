# Verifier — v0.1 Spec

Pure-function implementation: verify protected file integrity and quality gates
by comparing pre/post ProjectState snapshots.

## Behavior

1. Accept pre-execution and post-execution `ProjectState` dataclasses.
2. **Protected file integrity**:
   a. Convert `protected_hashes` tuples to dicts for both states.
   b. Compare hashes: detect modifications (hash changed), deletions (in pre but not post), and unexpected appearances (in post but not pre).
   c. Flag modifications as `"CRITICAL: {path} was modified by the agent"`.
   d. Flag deletions as `"CRITICAL: {path} was deleted by the agent"`.
   e. Flag unexpected appearances as `"CRITICAL: {path} appeared unexpectedly"`.
3. **Quality gate**:
   a. Check `post_state.quality_results` for ruff lint, ruff format, and pyright failures.
   b. Flag each as `"QUALITY: {tool} failures\n{output[:300]}"`.
4. **Test gate**:
   a. Check `post_state.test_results` for test failures.
   b. Flag as `"QUALITY: tests failing\n{output[:300]}"`.
5. **Improvements**: detect new files by comparing `post_state.files` vs `pre_state.files`.
6. Return `VerificationReport(passed=True)` only if `issues` is empty.

## v0.1 Scope

- Pure function: no filesystem I/O, all data comes from the two `ProjectState` snapshots.
- Returns typed `VerificationReport` dataclass.
- Bridge adapter (`adapters/verifier_bridge.py`) handles dict ↔ typed conversion for seed compatibility.

## Not in v0.1

- Granular per-file lint results with line numbers.
- Semantic diff analysis (understanding what changed, not just that something changed).
- Regression detection (did we break something that was working?).
- Coverage threshold enforcement.
