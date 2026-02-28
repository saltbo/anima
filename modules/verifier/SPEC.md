# Verifier — v0.1 Spec

Seed-equivalent implementation: verify protected file integrity and quality gates.

## Behavior

1. Accept pre-execution and post-execution project state dicts.
2. **Protected file integrity**:
   a. Enumerate all files under `PROTECTED_PATHS` (VISION.md, kernel/), excluding `__pycache__` and `.pyc`.
   b. Compare SHA-256 hashes from `pre_state["_protected_hashes"]` against current file hashes.
   c. Flag modifications as `"CRITICAL: {path} was modified by the agent"`.
   d. Flag deletions as `"CRITICAL: {path} was deleted by the agent"`.
   e. Flag unexpected appearances as `"CRITICAL: {path} appeared unexpectedly"`.
3. **Quality gate**:
   a. Check `post_state.quality_results` for ruff lint, ruff format, and pyright failures.
   b. Flag each as `"QUALITY: {tool} failures\n{output}"`.
4. **Test gate**:
   a. Check `post_state.test_results` for test failures.
   b. Flag as `"QUALITY: tests failing\n{output}"`.
5. **Improvements**: detect new files by comparing `post_state.files` vs `pre_state.files`.
6. Return `passed=True` only if `issues` is empty.

## v0.1 Scope

- Reads file hashes directly from filesystem for post-state comparison.
- Accepts and returns untyped dicts matching seed interface.
- Uses `kernel.config.PROTECTED_PATHS` and `kernel.config.ROOT` directly.

## Not in v0.1

- Returning typed `VerificationReport` dataclass (seed returns dict).
- Pure function operating only on `ProjectState` snapshots (currently reads filesystem for post-hashes).
- Coverage threshold enforcement.
