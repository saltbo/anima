# Module Health — Spec (v0.8)

## Behavior

- Iterates over each `ModuleInfo` from the scanner output.
- Computes a **structural score** (0.0–1.0) based on four components:
  - `has_contract`: 0.25
  - `has_spec`: 0.25
  - `has_core`: 0.25
  - `has_tests`: 0.25
- Computes a **reliability score** (0.0–1.0) from `health_stats`:
  - Maps module name to pipeline step name for lookup.
  - `reliability = 1.0 - fallback_rate` where `fallback_rate = fallbacks / (calls + fallbacks)`.
  - If no stats exist for the module, reliability defaults to 1.0.
- Final score = `0.6 * structural + 0.4 * reliability`.
- Classifies status:
  - `>= 0.7`: HEALTHY
  - `>= 0.4`: DEGRADED
  - `< 0.4`: CRITICAL
- Collects `missing_components` list (e.g. "CONTRACT.md", "tests").
- Collects `issues` list describing specific problems.
- Overall report score = average of individual module scores.

## Step-to-module name mapping

| Module name       | Pipeline step name      |
|-------------------|------------------------|
| scanner           | scan_project_state     |
| gap_analyzer      | analyze_gaps           |
| planner           | plan_iteration         |
| executor          | execute_plan           |
| verifier          | verify_iteration       |
| reporter          | record_iteration       |

Modules not in this mapping (e.g. gate, init_detector) have no
pipeline fallback tracking and default to 1.0 reliability.

## v0.8 Scope

- Structural + fallback-rate scoring only.
- No test coverage trend analysis (future).
- No change frequency tracking (future).

## Not in v0.8

- Test coverage trend (requires per-module coverage history).
- Change frequency (requires git log analysis per module).
- Failure rate from iteration logs (requires iteration-to-module mapping).
