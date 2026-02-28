# Gap Analyzer — v0.1 Spec

Seed-equivalent implementation: compare roadmap and project state to identify gaps.

## Behavior

1. Read the current roadmap version via `kernel.roadmap.get_current_version()`.
2. Parse the roadmap file to find unchecked items (`- [ ]`).
3. If unchecked items exist, add them as gaps with count header.
4. Check infrastructure gaps (missing `domain/`, `pyproject.toml`, `pyrightconfig.json`) only if they appear in the current roadmap version's scope.
5. Check `quality_results` for ruff lint, ruff format, and pyright failures. Append failure output as gaps.
6. Check `test_results` for test failures. Append test output as gap.
7. Include inbox items as `HUMAN REQUEST` gaps.
8. Return `"NO_GAPS"` if no gaps found, otherwise return newline-joined gap text.

## v0.1 Scope

- Pure string-based gap report (not yet `GapReport` dataclass).
- Reads roadmap files via `kernel.roadmap` helpers.
- Accepts and returns untyped dicts/strings matching seed interface.

## Not in v0.1

- Returning typed `GapReport` dataclass (seed returns raw string).
- Priority ordering of gaps beyond the fixed order above.
- Gap deduplication against recent history.
