# Verifier — Contract

## Purpose

Verify that an iteration's changes are safe and correct by checking protected file integrity and quality gate results.

## Interface

```python
def verify(pre_state: ProjectState, post_state: ProjectState) -> VerificationReport
```

## Input

| Parameter    | Type           | Description                             |
|--------------|----------------|-----------------------------------------|
| `pre_state`  | `ProjectState` | Project state snapshot before execution |
| `post_state` | `ProjectState` | Project state snapshot after execution  |

## Output

Returns `domain.models.VerificationReport`:

- `passed` — `True` if no issues were found
- `issues` — tuple of issue descriptions (empty if passed)
- `improvements` — tuple of detected improvements (e.g. "New files: 5")

## Dependencies

None. Operates on the two `ProjectState` snapshots provided as input.

## Constraints

1. **Protected file integrity** — must detect any modification, creation, or deletion of files under `PROTECTED_PATHS` (VISION.md, kernel/) by comparing `protected_hashes` between pre and post states.
2. Protected file violations are prefixed with `"CRITICAL:"` in the issues list.
3. **Quality gate** — must check `post_state.quality_results` for ruff lint, ruff format, and pyright failures. Quality issues are prefixed with `"QUALITY:"`.
4. **Test gate** — must check `post_state.test_results` for test failures. Test issues are prefixed with `"QUALITY:"`.
5. `passed` is `True` only when `issues` is empty.
6. Must detect new files as improvements by comparing `pre_state.files` vs `post_state.files`.
7. Must not perform I/O — all data comes through the two state snapshots.
