# Toolchain Writer — Contract

## Purpose

Convert tech stack detection results into a `.anima/toolchain.toml`
configuration file that the kernel can execute generically.

## Interface

```python
def generate_toml(result: DetectionResult) -> str
def write_toolchain(result: DetectionResult, anima_dir: str) -> str
```

## Input

| Parameter   | Type              | Description                             |
|-------------|-------------------|-----------------------------------------|
| `result`    | `DetectionResult` | Output from init_detector.detect()      |
| `anima_dir` | `str`             | Absolute path to the `.anima/` directory|

## Output

- `generate_toml` — returns the TOML string (pure, no I/O)
- `write_toolchain` — writes `toolchain.toml` to `anima_dir`, returns
  the absolute path of the written file

## Dependencies

None. Uses only the standard library (`pathlib`).

## Constraints

1. Output must be valid TOML parseable by `tomllib.loads()`.
2. Each `ToolchainEntry` maps to one `[[toolchain]]` section.
3. Entries appear in the same order as the input `DetectionResult`.
4. Empty string fields are included (e.g. `typecheck = ""`).
5. `generate_toml` is a pure function — no file I/O.
6. `write_toolchain` creates `anima_dir` if it does not exist.
