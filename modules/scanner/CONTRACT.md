# Scanner — Contract

## Purpose

Scan the current project structure and produce a complete `ProjectState` snapshot.

## Interface

```python
def scan(root: str) -> ProjectState
```

## Input

| Parameter | Type  | Description                          |
|-----------|-------|--------------------------------------|
| `root`    | `str` | Absolute path to the project root    |

## Output

Returns `domain.models.ProjectState` with all fields populated:

- `files` — all tracked file paths (relative to root), excluding `.git`, `__pycache__`, `.venv`, etc.
- `modules` — `ModuleInfo` for each directory under `modules/`
- `domain_exists`, `adapters_exist`, `kernel_exists` — architectural layer checks
- `has_tests` — whether any `test_*.py` files exist
- `has_pyproject`, `has_pyrightconfig` — config file existence
- `inbox_items` — parsed `InboxItem` entries from `inbox/*.md`
- `quality_results` — `QualityReport` from running lint/format/type checks (may be `None`)
- `test_results` — `TestResult` from running pytest (may be `None`)
- `protected_hashes` — SHA-256 hashes of all files under `PROTECTED_PATHS`

## Dependencies

| Port             | Usage                                |
|------------------|--------------------------------------|
| `FileSystemPort` | List files, read file contents       |
| `LinterPort`     | Run ruff lint, ruff format, pyright  |
| `TestRunnerPort` | Run pytest                           |

## Constraints

1. Must not modify any files — scan is read-only.
2. Must skip directories: `.git`, `__pycache__`, `node_modules`, `.venv`, `venv`, `.pytest_cache`, `.ruff_cache`, `.anima`, `iterations`.
3. File list must be sorted deterministically.
4. Module discovery must handle missing subdirectories gracefully (a module with only `__init__.py` is valid but incomplete).
5. Protected hash computation must cover all non-`__pycache__`, non-`.pyc` files under each protected path.
6. Quality checks and tests are optional — if tools are unavailable, the corresponding fields are `None`.
