# Scanner — v0.1 Spec

Seed-equivalent implementation: scan the project tree and produce a `ProjectState`.

## Behavior

1. Walk the project tree from `root`, skipping `.git`, `__pycache__`, `node_modules`,
   `.venv`, `venv`, `.pytest_cache`, `.ruff_cache`, `.anima`, `iterations`.
2. Collect all file paths relative to root, sorted deterministically.
3. For each directory under `modules/`, produce a `ModuleInfo` with:
   - `has_contract` — `CONTRACT.md` exists
   - `has_spec` — `SPEC.md` exists
   - `has_core` — `core.py` exists
   - `has_tests` — `tests/` dir exists with at least one `test_*.py`
   - `files` — all files in the module directory
4. Check existence of `domain/`, `adapters/`, `kernel/` layers.
5. Check existence of `pyproject.toml`, `pyrightconfig.json`.
6. Read `inbox/*.md` files as `InboxItem` entries.
7. Run quality checks (ruff lint, ruff format, pyright) via `LinterPort`. Return `None` for unavailable tools.
8. Run tests via `TestRunnerPort`. Return `None` if unavailable.
9. Compute SHA-256 hashes of all files under `PROTECTED_PATHS`, excluding `__pycache__` and `.pyc`.

## v0.1 Scope

- Direct filesystem operations (no `FileSystemPort` injection yet — uses `os.walk` and `pathlib`).
- Quality checks and test runs invoke CLI tools via `subprocess`.
- Returns a plain dict matching `ProjectState` fields (not yet the domain dataclass).

## Not in v0.1

- `FileSystemPort` / `LinterPort` / `TestRunnerPort` injection (deferred to v0.2).
- Returning typed `ProjectState` dataclass (seed returns dict).
