# Planner — v0.1 Spec

Seed-equivalent implementation: construct an agent prompt from gaps and project state.

## Behavior

1. Accept project state, gap text, iteration history, and iteration count.
2. Build a prompt containing:
   - Instructions to read `SOUL.md`, `VISION.md`, and the current `roadmap/v{version}.md`.
   - The current iteration number (`iteration_count + 1`) and target version.
   - The full gap text under a `GAPS TO ADDRESS:` section.
   - Recent history: last 3 iteration summaries with pass/fail markers.
   - Brief state summary: module list, domain existence, test status, inbox count.
   - Instruction to execute the single most important next step.
   - Instruction to run verification after changes.
3. State summary must NOT include full file listings.
4. Current version is obtained via `kernel.roadmap.get_current_version()`.

## v0.1 Scope

- Returns a plain prompt string (not yet `IterationPlan` dataclass).
- Reads roadmap version via `kernel.roadmap` helpers.
- Accepts and returns untyped dicts/strings matching seed interface.

## Not in v0.1

- Returning typed `IterationPlan` dataclass (seed returns raw string).
- Intelligent prompt optimization or token budgeting.
- Adaptive planning based on failure patterns.
