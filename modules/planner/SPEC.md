# Planner — v0.2 Spec

Structured implementation: returns `IterationPlan` dataclass instead of raw string.

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
5. Return an `IterationPlan` dataclass with:
   - `prompt` — the assembled prompt string
   - `iteration_number` — `iteration_count + 1`
   - `target_version` — current roadmap version string (e.g. `"0.3"`)
   - `gaps_summary` — first 200 characters of gap text (truncated with `...` if longer)

## v0.2 Scope

- Returns typed `IterationPlan` dataclass from `domain.models`.
- Reads roadmap version via `kernel.roadmap` helpers.
- Accepts untyped dicts/strings matching seed interface for input.
- Bridge adapter extracts `.prompt` for kernel/loop.py compatibility.

## Not in v0.2

- Intelligent prompt optimization or token budgeting.
- Adaptive planning based on failure patterns.
- Strategy selection (fix vs build vs refactor).
- Risk assessment or scope control.
