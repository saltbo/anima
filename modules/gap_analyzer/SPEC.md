# Gap Analyzer — v0.8 Spec

Compare roadmap and project state to identify gaps. Includes failure pattern
detection (v0.6) and auto-rewrite trigger from module health scoring (v0.8).

## Behavior

1. Read the current roadmap version via `kernel.roadmap.get_current_version()`.
2. Parse the roadmap file to find unchecked items (`- [ ]`).
3. If unchecked items exist, add them as gaps with count header. Annotate stuck
   gaps using failure pattern analysis (SKIP or REAPPROACH).
4. Check infrastructure gaps (missing `domain/`, `pyproject.toml`, `pyrightconfig.json`)
   only if they appear in the current roadmap version's scope.
5. Check `quality_results` for ruff lint, ruff format, and pyright failures.
   Append failure output as gaps.
6. Check `test_results` for test failures. Append test output as gap.
7. Include inbox items as `HUMAN REQUEST` gaps.
8. Check `module_health` in project_state for degraded or critical modules.
   If any module has status "degraded" or "critical", add an `AUTO-REWRITE
   TRIGGER` gap section listing each affected module with its score and issues.
   Health data is injected by the wiring layer from module_health scoring.
9. Return `"NO_GAPS"` if no gaps found, otherwise return newline-joined gap text.

## Current Scope

- Pure string-based gap report (not yet `GapReport` dataclass).
- Reads roadmap files via `kernel.roadmap` helpers.
- Accepts and returns untyped dicts/strings matching seed interface.
- Failure pattern detection annotates stuck items.
- Auto-rewrite trigger from module health data.

## Not Yet Implemented

- Returning typed `GapReport` dataclass (seed returns raw string).
- Priority ordering of gaps beyond the fixed order above.
- Gap deduplication against recent history.
