# Init Detector — Contract

## Purpose

Detect tech stacks in an existing project by scanning for known marker files,
and return structured detection results suitable for toolchain configuration.

## Interface

```python
def detect(root: str) -> DetectionResult
```

## Input

| Parameter | Type  | Description                          |
|-----------|-------|--------------------------------------|
| `root`    | `str` | Absolute path to the project root    |

## Output

Returns `domain.models.DetectionResult` containing:

- `entries` — tuple of `ToolchainEntry`, one per detected tech stack

Each `ToolchainEntry` contains:
- `path` — relative path where the stack was detected (e.g. `"."`, `"backend/"`)
- `stack` — stack identifier (`"python"`, `"node"`, `"go"`, `"rust"`)
- `lint` — default lint command for this stack
- `typecheck` — default type-check command (empty string if none)
- `test` — default test command
- `coverage` — default coverage command (empty string if none)

## Dependencies

None. Uses only `os` and `pathlib` from the standard library.

## Constraints

1. Must not modify any files — detection is read-only.
2. Scans the project root and one level of immediate subdirectories.
3. Returns deterministically sorted entries (by path, then stack).
4. Full-stack projects may produce multiple entries (e.g. Go backend + Node frontend).
5. If no stacks are detected, returns an empty `DetectionResult`.
