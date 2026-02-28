# Reporter — v0.1 Spec

Seed-equivalent implementation: record iteration results as JSON log files.

## Behavior

1. Accept iteration_id, gap text, execution result dict, verification dict, and elapsed time.
2. Build a report dict with:
   - `id` — the iteration_id
   - `timestamp` — ISO 8601 UTC timestamp
   - `success` — from `verification["passed"]`
   - `summary` — auto-generated (see below)
   - `gaps_addressed` — gap text truncated to 1000 chars
   - `improvements` — from `verification["improvements"]`
   - `issues` — from `verification["issues"]`
   - `agent_output_excerpt` — from `execution_result["output"]` truncated to 1000 chars
   - `elapsed_seconds` — from input
   - `cost_usd` — from `execution_result["cost_usd"]` (default 0)
   - `total_tokens` — from `execution_result["total_tokens"]` (default 0)
3. **Summary generation**:
   - If improvements exist: join first 3 with `"; "`.
   - Else if issues exist: `"Failed: {first_issue[:100]}"`.
   - Else: `"No significant changes"`.
4. Write JSON to `iterations/<iteration_id>.json` (indented, non-ASCII preserved).
5. Create `iterations/` directory if it doesn't exist.
6. Print a formatted status block to stdout showing pass/fail, time, improvements, and issues.

## v0.1 Scope

- Direct filesystem writes (no `FileSystemPort` injection).
- Accepts and returns untyped dicts matching seed interface.
- Uses `print()` for CLI output (reporter is a CLI command output context).

## Not in v0.1

- `FileSystemPort` injection (deferred to v0.2).
- Returning typed `IterationRecord` dataclass (seed returns dict).
- Graceful write failure handling (deferred to v0.2).
