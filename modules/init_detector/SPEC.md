# Init Detector — v0.7 Spec

Detect tech stacks by scanning project files for known markers.

## Behavior

1. Define a mapping of marker files to stack configurations:
   - `pyproject.toml` or `setup.py` → Python stack
   - `package.json` → Node stack
   - `go.mod` → Go stack
   - `Cargo.toml` → Rust stack

2. Scan the project root for marker files. If found, create a
   `ToolchainEntry` with `path="."`.

3. Scan each immediate subdirectory of root for marker files.
   If found, create a `ToolchainEntry` with `path="<dirname>/"`.

4. Skip hidden directories (starting with `.`) and common non-project
   directories (`node_modules`, `venv`, `.venv`, `__pycache__`, `.git`).

5. For Python stacks, additionally check for the presence of
   `pyrightconfig.json` or `pyright` config in `pyproject.toml` to
   include the typecheck command.

6. Return all entries sorted by (path, stack).

## Default Commands

| Stack  | lint                     | typecheck        | test                         | coverage                              |
|--------|--------------------------|------------------|------------------------------|---------------------------------------|
| python | `ruff check .`           | `pyright`        | `pytest`                     | `pytest --cov`                        |
| node   | `eslint .`               | `tsc --noEmit`   | `npm test`                   | ``                                    |
| go     | `golangci-lint run`      | ``               | `go test ./...`              | `go test -coverprofile=coverage.out ./...` |
| rust   | `cargo clippy`           | ``               | `cargo test`                 | ``                                    |

## v0.7 Scope

- Direct filesystem operations (no FileSystemPort injection).
- Marker-based detection only (no content analysis).
- Default commands are best-effort starting points.

## Not in v0.7

- Deep content analysis (parsing package.json for framework detection).
- Custom marker definitions.
- Interactive command confirmation.
