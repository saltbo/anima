# Module Reference

## Contents

- [docgen](#docgen)
- [executor](#executor)
- [failure_analyzer](#failure-analyzer)
- [gap_analyzer](#gap-analyzer)
- [gate](#gate)
- [init_detector](#init-detector)
- [module_health](#module-health)
- [planner](#planner)
- [reporter](#reporter)
- [scanner](#scanner)
- [toolchain_writer](#toolchain-writer)
- [verifier](#verifier)
- [vision_templates](#vision-templates)

---

## docgen

### Contract

# Docgen — Contract

## Purpose

Generate comprehensive project documentation from the system's own
specification files (CONTRACT.md, SPEC.md, VISION.md, SOUL.md, domain sources).

## Interface

```python
def generate(project_root: str) -> DocBundle
def render(bundle: DocBundle) -> dict[str, str]
```

## Input

| Parameter      | Type  | Description                       |
|----------------|-------|-----------------------------------|
| `project_root` | `str` | Absolute path to the project root |

## Output

`generate()` returns a `DocBundle` dataclass containing:

- `vision` — raw VISION.md content
- `soul` — raw SOUL.md content
- `modules` — tuple of `ModuleDoc` (name, contract text, spec text)
- `domain_models_source` — domain/models.py content
- `domain_ports_source` — domain/ports.py content

`render()` returns a `dict[str, str]` mapping relative file paths to
generated markdown content:

- `docs/index.md` — project overview and navigation
- `docs/architecture.md` — architecture reference
- `docs/modules.md` — module reference (all CONTRACT + SPEC)

## Dependencies

None. Uses only `os` and `pathlib` from the standard library.

## Constraints

1. Must not modify any source files — documentation generation is read-only.
2. Missing files (no CONTRACT.md, no SPEC.md) are represented as empty strings.
3. Modules are sorted alphabetically by name.
4. Output is deterministic for the same input.


### Spec

# Docgen — v1.0 Spec

Generate project documentation from the system's own specs.

## Behavior

### generate(project_root)

1. Read `VISION.md` from `project_root` (empty string if missing).
2. Read `SOUL.md` from `project_root` (empty string if missing).
3. Scan `modules/` for subdirectories. For each:
   - Read `CONTRACT.md` (empty string if missing).
   - Read `SPEC.md` (empty string if missing).
   - Skip directories starting with `.` or `__`.
   - Create a `ModuleDoc(name, contract, spec)`.
4. Read `domain/models.py` (empty string if missing).
5. Read `domain/ports.py` (empty string if missing).
6. Return `DocBundle` with all collected content.
7. Sort modules alphabetically by name.

### render(bundle)

Produce three documentation files:

1. **docs/index.md** — Project overview:
   - Title and identity extracted from VISION.md first heading
   - Core principles from SOUL.md
   - Table of modules with completeness indicators
   - Links to other doc pages

2. **docs/architecture.md** — Architecture reference:
   - Full architecture section from VISION.md
   - Domain model listing (class names and docstrings)
   - Domain ports listing (Protocol names and docstrings)

3. **docs/modules.md** — Module reference:
   - For each module: heading, CONTRACT.md content, SPEC.md content
   - Modules sorted alphabetically

## v1.0 Scope

- Direct filesystem reads (no FileSystemPort injection).
- Markdown output only.
- Static generation (no incremental updates).

## Not in v1.0

- HTML output or static site generation.
- Cross-referencing between modules.
- API documentation from Python docstrings (beyond what's in source files).


---

## executor

### Contract

# Executor — Contract

## Purpose

Send an iteration plan to an AI agent and capture the execution result.

## Interface

```python
def execute(plan: IterationPlan, dry_run: bool = False) -> ExecutionResult
```

## Input

| Parameter | Type            | Description                              |
|-----------|-----------------|------------------------------------------|
| `plan`    | `IterationPlan` | The iteration plan containing the prompt |
| `dry_run` | `bool`          | If `True`, display the prompt without executing |

## Output

Returns `domain.models.ExecutionResult`:

- `success` — `True` if the agent exited with code 0
- `output` — agent's text output (truncated to last 5000 chars)
- `errors` — stderr output (truncated to last 2000 chars)
- `exit_code` — agent process exit code
- `elapsed_seconds` — wall-clock execution time
- `cost_usd` — monetary cost reported by the agent (default `0.0`)
- `total_tokens` — token usage reported by the agent (default `0`)
- `dry_run` — reflects the `dry_run` input flag
- `quota_state` — optional `QuotaState` with API quota/rate-limit info (default `None`)

## Dependencies

| Port        | Usage                                  |
|-------------|----------------------------------------|
| `AgentPort` | Execute the prompt and return results  |

## Constraints

1. In dry-run mode, must return `ExecutionResult(success=True, output="(dry run)", dry_run=True, ...)` without invoking the agent.
2. Must handle agent command not found gracefully (return failure, not raise).
3. Must handle agent timeout gracefully (return failure after timeout).
4. Must save the prompt to `.anima/current_prompt.txt` before execution for debugging.
5. Must stream agent output in real-time when possible.
6. Must capture and report cost/token metrics when the agent provides them.
7. Must propagate `quota_state` from the agent result without modification.
8. Must not retry when `quota_state` indicates rate limiting or quota exhaustion.


### Spec

# Executor — v0.6 Spec

Robust agent execution with retry logic, structured output, and quota awareness.

## Behavior

1. Accept an `IterationPlan` and a `dry_run` flag.
2. **Dry-run mode**: log the prompt (truncated to 3000 chars) and return
   `ExecutionResult(success=True, output="(dry run)", dry_run=True, ...)` without
   invoking the agent.
3. **Normal mode**:
   a. Save the prompt to `.anima/current_prompt.txt`.
   b. Delegate execution to the injected `AgentPort`.
   c. On transient failure (non-zero exit, agent error), retry up to
      `max_retries` times with exponential backoff (base 2s, capped at 30s).
   d. **Skip retries** when the result carries a `quota_state` with status
      `RATE_LIMITED` or `QUOTA_EXHAUSTED` — retrying won't help.
   e. Return the final `ExecutionResult` (including `quota_state` if detected).
4. Handle `KeyboardInterrupt` by re-raising without retry.

## Constructor

```python
Executor(agent: AgentPort, *, max_retries: int = 2, base_delay: float = 2.0)
```

## Public Method

```python
def execute(self, plan: IterationPlan, dry_run: bool = False) -> ExecutionResult
```

## Retry Policy

- Only retry when `ExecutionResult.success` is `False` and exit_code != -1
  (exit_code -1 means the agent command was not found — no point retrying).
- **Do not retry** when `quota_state` indicates `RATE_LIMITED` or
  `QUOTA_EXHAUSTED` — the failure is not transient within the retry window.
- Delay between retries: `min(base_delay * 2^attempt, 30.0)` seconds.
- Log each retry attempt at WARNING level.
- Return the result of the last attempt.

## Quota Awareness

The `ExecutionResult.quota_state` field (optional `QuotaState`) is populated
by the `AgentPort` adapter when it detects rate-limit or quota signals in
the agent's output.  The executor propagates this field unchanged so the
kernel can inspect it and decide whether to sleep or pause.

## Not in Scope

- Configurable agent command (handled by adapter).
- Multiple agent backend selection (future work).
- Auto-sleep/resume on quota exhaustion (kernel responsibility, v0.6).


---

## failure_analyzer

### Contract

# Failure Analyzer — CONTRACT

## Purpose

Detect repeated failure patterns in iteration history so the system
can skip stuck gaps or suggest alternative approaches.

## Interface

```python
def analyze_patterns(
    history: list[dict[str, Any]],
    current_gaps: list[str],
    *,
    threshold: int = 3,
) -> tuple[FailurePattern, ...]
```

## Input

- `history` — list of past iteration records (dicts with `gaps_addressed`,
  `success`, `summary` fields)
- `current_gaps` — individual gap text lines from the current gap analysis
- `threshold` — number of consecutive appearances before a gap is "stuck"

## Output

- Tuple of `FailurePattern` instances for gaps that exceed the threshold.
  Each pattern includes the gap text, occurrence count, failed attempt count,
  and a recommended action (`SKIP` or `REAPPROACH`).

## Dependencies

- `domain.models.FailurePattern`, `domain.models.FailureAction`
- Python standard library only (no adapters, no kernel)

## Constraints

- Pure function, no side effects
- Must not import from `kernel/` or `adapters/`
- O(history × gaps) complexity — acceptable for bounded history


### Spec

# Failure Analyzer — SPEC v0.6

## Algorithm

1. For each current gap line, scan the last N iteration records.
2. Count how many of those records include that gap text in their
   `gaps_addressed` field (occurrence count).
3. Count how many of those records are failures (`success=False`)
   that included the gap (failed attempt count).
4. If a gap has appeared in >= `threshold` consecutive iterations
   AND the system has not resolved it (it still appears in current gaps):
   - If `failed_attempts >= 2`: recommend `SKIP` (the system repeatedly
     crashes trying to address it)
   - Otherwise: recommend `REAPPROACH` (the system keeps deferring it;
     try a different angle)

## Gap Matching

Gap matching uses substring containment: a gap is "present" in an
iteration record if any line of the record's `gaps_addressed` field
contains the gap text (after whitespace stripping).

For roadmap items, the matching strips the leading `- ` prefix to
match against the summary text.

## Edge Cases

- Empty history → no patterns
- History with no failures → still detect stale gaps (REAPPROACH)
- Gap text that appears in every iteration → stuck, needs action


---

## gap_analyzer

### Contract

# Gap Analyzer — Contract

## Purpose

Compare the project vision and roadmap against the current project state to identify actionable gaps.

## Interface

```python
def analyze(vision: str, state: ProjectState, history: list[IterationRecord]) -> GapReport
```

## Input

| Parameter | Type                    | Description                              |
|-----------|-------------------------|------------------------------------------|
| `vision`  | `str`                   | Raw text content of VISION.md            |
| `state`   | `ProjectState`          | Current project state from scanner       |
| `history` | `list[IterationRecord]` | Previous iteration records (may be empty)|

## Output

Returns `domain.models.GapReport`:

- `gaps` — ordered tuple of gap descriptions (most important first)
- `has_gaps` — `True` if any gaps exist, `False` otherwise
- `raw_text` — formatted text representation of all gaps for prompt construction

## Dependencies

None. This module is pure logic operating on domain types.

## Constraints

1. Must read the current roadmap version and identify unchecked items.
2. Must surface quality failures (ruff lint, ruff format, pyright) from `state.quality_results`.
3. Must surface test failures from `state.test_results`.
4. Must include inbox items as human requests.
5. Must not perform I/O — all data comes through input parameters.
6. When `has_gaps` is `False`, `raw_text` must be the literal string `"NO_GAPS"`.
7. Infrastructure gaps (missing domain/, pyproject.toml, etc.) are only reported if they appear in the current roadmap version's scope.


### Spec

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


---

## gate

### Contract

# Gate Module — Contract

## Purpose

Classify iteration plans by risk level and manage gating state.
High-risk plans pause execution until a human approves via `anima approve`.

## Input

- `prompt: str` — the full agent prompt for the iteration
- Gate state files in `.anima/` directory

## Output

- `GateDecision` — whether the plan is gated, its risk level, and
  which indicators triggered

## Dependencies

- `domain.models.RiskLevel`, `domain.models.GateDecision`
- File system access for gate state files (`.anima/gate_pending.json`,
  `.anima/gate_bypass`)

## Constraints

- Risk classification is a pure function (no I/O)
- Gate file I/O is in separate functions
- Must not import from kernel/ or adapters/


### Spec

# Gate Module — Spec v0.6

## Risk Classification

`classify_risk(prompt: str) -> GateDecision`

Scans the agent prompt for high-risk indicators. A plan is HIGH risk
if any of these patterns appear in the prompt:

1. **Domain type changes** — prompt targets `domain/models.py` or
   `domain/ports.py` modifications
2. **Wiring changes** — prompt targets `wiring.py` modifications
3. **File deletion** — prompt mentions deleting or removing files
4. **Multi-module rewrite** — prompt targets rewriting 3+ modules

If no indicators match, the plan is LOW risk and `gated=False`.

Pattern matching is case-insensitive and uses simple substring/regex
checks on the prompt text.

## Gate State Management

Gate state is stored in `.anima/`:

- `gate_pending.json` — written when a high-risk plan is detected.
  Contains `{gaps_summary, risk_indicators, timestamp}`.
- `gate_bypass` — marker file written by `approve_iteration()`.
  Signals that one execution should proceed without risk checking.
  Deleted after the bypass is consumed.

### Functions

- `is_gate_pending(anima_dir: Path) -> bool` — check if gate file exists
- `is_gate_bypassed(anima_dir: Path) -> bool` — check if bypass marker exists
- `write_gate(anima_dir: Path, gaps_summary: str, indicators: tuple[str, ...]) -> None`
- `clear_gate(anima_dir: Path) -> None` — remove gate file + write bypass marker
- `consume_bypass(anima_dir: Path) -> bool` — remove bypass marker, return True if it existed


---

## init_detector

### Contract

# Init Detector — Contract

## Purpose

Detect tech stacks in an existing project by scanning for known marker files,
and return structured detection results suitable for toolchain configuration.

## Interface

```python
def detect(root: str) -> DetectionResult
```

## Input

| Parameter | Type  | Description                          |
|-----------|-------|--------------------------------------|
| `root`    | `str` | Absolute path to the project root    |

## Output

Returns `domain.models.DetectionResult` containing:

- `entries` — tuple of `ToolchainEntry`, one per detected tech stack

Each `ToolchainEntry` contains:
- `path` — relative path where the stack was detected (e.g. `"."`, `"backend/"`)
- `stack` — stack identifier (`"python"`, `"node"`, `"go"`, `"rust"`)
- `lint` — default lint command for this stack
- `typecheck` — default type-check command (empty string if none)
- `test` — default test command
- `coverage` — default coverage command (empty string if none)

## Dependencies

None. Uses only `os` and `pathlib` from the standard library.

## Constraints

1. Must not modify any files — detection is read-only.
2. Scans the project root and one level of immediate subdirectories.
3. Returns deterministically sorted entries (by path, then stack).
4. Full-stack projects may produce multiple entries (e.g. Go backend + Node frontend).
5. If no stacks are detected, returns an empty `DetectionResult`.


### Spec

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


---

## module_health

### Contract

# Module Health — Contract

## Purpose

Score the health of each pipeline module by combining structural
completeness (contract, spec, core, tests) with runtime reliability
(fallback rate from wiring health data). Produces a `HealthReport`
that downstream consumers (gap analyzer, auto-rewrite trigger) use to
identify degraded modules.

## Interface

```python
def score_health(
    modules: tuple[ModuleInfo, ...],
    health_stats: dict[str, Any],
    timestamp: str,
) -> HealthReport
```

## Input

| Parameter      | Type                       | Description                                    |
|----------------|----------------------------|------------------------------------------------|
| modules        | tuple[ModuleInfo, ...]     | Module metadata from scanner                   |
| health_stats   | dict[str, Any]             | Runtime stats from wiring health.json           |
| timestamp      | str                        | ISO-8601 timestamp for the report              |

## Output

| Field          | Type                           | Description                               |
|----------------|--------------------------------|-------------------------------------------|
| HealthReport   | HealthReport                   | Aggregated scores for all modules         |

## Dependencies

None — pure function, no ports required.

## Constraints

1. Must be a pure function with no I/O.
2. Scores are floats in [0.0, 1.0].
3. Status thresholds: >= 0.7 HEALTHY, >= 0.4 DEGRADED, < 0.4 CRITICAL.
4. Structural completeness accounts for 60% of score.
5. Runtime reliability accounts for 40% of score.
6. Modules with no runtime data default to 1.0 reliability.


### Spec

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


---

## planner

### Contract

# Planner — Contract

## Purpose

Transform a gap report into a concrete iteration plan (prompt) for the AI agent.

## Interface

```python
def plan(
    state: ProjectState,
    gaps: GapReport,
    history: list[IterationRecord],
    iteration_count: int,
) -> IterationPlan
```

## Input

| Parameter         | Type                    | Description                            |
|-------------------|-------------------------|----------------------------------------|
| `state`           | `ProjectState`          | Current project state from scanner     |
| `gaps`            | `GapReport`             | Gap analysis output                    |
| `history`         | `list[IterationRecord]` | Previous iteration records             |
| `iteration_count` | `int`                   | Number of iterations completed so far  |

## Output

Returns `domain.models.IterationPlan`:

- `prompt` — complete prompt text for the agent, carrying only dynamic per-iteration data (static context like SOUL.md/VISION.md is read by the agent itself)
- `iteration_number` — `iteration_count + 1`
- `target_version` — current roadmap version string (e.g. `"0.1"`)
- `gaps_summary` — brief summary of addressed gaps

## Dependencies

None. This module is pure logic operating on domain types.

## Constraints

1. The prompt must include: gap list, recent history (last 3 iterations), and a brief state summary.
2. The prompt must NOT include full file listings — the agent can scan the project itself.
3. The prompt must instruct the agent to read SOUL.md, VISION.md, and the current roadmap file.
4. The prompt must instruct the agent to run verification after changes.
5. The prompt must focus on the single most important gap (per SOUL.md principle 1).
6. Must not perform I/O — all data comes through input parameters.


### Spec

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


---

## reporter

### Contract

# Reporter — Contract

## Purpose

Record the results of a completed iteration as a structured, persistent log entry.

## Interface

```python
def record(
    iteration_id: str,
    gaps: GapReport,
    execution: ExecutionResult,
    verification: VerificationReport,
    elapsed: float,
) -> IterationRecord
```

## Input

| Parameter      | Type                 | Description                                |
|----------------|----------------------|--------------------------------------------|
| `iteration_id` | `str`                | Unique iteration identifier (e.g. `"0004-20260227-120000"`) |
| `gaps`         | `GapReport`          | The gap analysis that drove this iteration |
| `execution`    | `ExecutionResult`    | Agent execution output                     |
| `verification` | `VerificationReport` | Verification results                       |
| `elapsed`      | `float`              | Total wall-clock seconds for the iteration |

## Output

Returns `domain.models.IterationRecord` with all fields populated:

- `iteration_id` — echoed from input
- `timestamp` — ISO 8601 UTC timestamp of when the record was created
- `success` — from `verification.passed`
- `summary` — auto-generated one-line summary from improvements or first issue
- `gaps_addressed` — truncated text of gaps (max 1000 chars)
- `improvements` — from `verification.improvements`
- `issues` — from `verification.issues`
- `agent_output_excerpt` — truncated agent output (max 1000 chars)
- `elapsed_seconds` — from input
- `cost_usd` — from `execution.cost_usd`
- `total_tokens` — from `execution.total_tokens`

## Dependencies

| Port             | Usage                                    |
|------------------|------------------------------------------|
| `FileSystemPort` | Write the JSON log to `iterations/`      |

## Constraints

1. Must write a JSON file to `iterations/<iteration_id>.json`.
2. The JSON must be human-readable (indented, non-ASCII preserved).
3. Must create the `iterations/` directory if it doesn't exist.
4. Summary generation: if improvements exist, join first 3; if only issues, use first issue (truncated to 100 chars); otherwise `"No significant changes"`.
5. Must not raise on write failure — log the error and return the record anyway.
6. Agent output excerpt must be truncated to 1000 characters maximum.


### Spec

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


---

## scanner

### Contract

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


### Spec

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


---

## toolchain_writer

### Contract

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


### Spec

# Toolchain Writer — Spec v0.7

## Overview

Serializes `DetectionResult` into TOML format for `.anima/toolchain.toml`.

## TOML Format

```toml
# Generated by anima init — edit freely.

[[toolchain]]
path = "."
stack = "python"
lint = "ruff check ."
typecheck = "pyright"
test = "pytest"
coverage = "pytest --cov"

[[toolchain]]
path = "frontend/"
stack = "node"
lint = "eslint ."
typecheck = "tsc --noEmit"
test = "npm test"
coverage = ""
```

## Functions

### `generate_toml(result: DetectionResult) -> str`

1. If `result.entries` is empty, return only the header comment.
2. For each entry, emit a `[[toolchain]]` section with all six fields.
3. Sections are separated by a blank line.
4. String values are double-quoted.
5. Returns the complete TOML string (with trailing newline).

### `write_toolchain(result: DetectionResult, anima_dir: str) -> str`

1. Call `generate_toml(result)` to produce the content.
2. Create `anima_dir` if it does not exist (`mkdir -p` equivalent).
3. Write content to `<anima_dir>/toolchain.toml` (UTF-8).
4. Return the absolute path of the written file.


---

## verifier

### Contract

# Verifier — Contract

## Purpose

Verify that an iteration's changes are safe and correct by checking protected file integrity and quality gate results.

## Interface

```python
def verify(pre_state: ProjectState, post_state: ProjectState) -> VerificationReport
```

## Input

| Parameter    | Type           | Description                             |
|--------------|----------------|-----------------------------------------|
| `pre_state`  | `ProjectState` | Project state snapshot before execution |
| `post_state` | `ProjectState` | Project state snapshot after execution  |

## Output

Returns `domain.models.VerificationReport`:

- `passed` — `True` if no issues were found
- `issues` — tuple of issue descriptions (empty if passed)
- `improvements` — tuple of detected improvements (e.g. "New files: 5")

## Dependencies

None. Operates on the two `ProjectState` snapshots provided as input.

## Constraints

1. **Protected file integrity** — must detect any modification, creation, or deletion of files under `PROTECTED_PATHS` (VISION.md, kernel/) by comparing `protected_hashes` between pre and post states.
2. Protected file violations are prefixed with `"CRITICAL:"` in the issues list.
3. **Quality gate** — must check `post_state.quality_results` for ruff lint, ruff format, and pyright failures. Quality issues are prefixed with `"QUALITY:"`.
4. **Test gate** — must check `post_state.test_results` for test failures. Test issues are prefixed with `"QUALITY:"`.
5. `passed` is `True` only when `issues` is empty.
6. Must detect new files as improvements by comparing `pre_state.files` vs `post_state.files`.
7. Must not perform I/O — all data comes through the two state snapshots.


### Spec

# Verifier — v0.1 Spec

Pure-function implementation: verify protected file integrity and quality gates
by comparing pre/post ProjectState snapshots.

## Behavior

1. Accept pre-execution and post-execution `ProjectState` dataclasses.
2. **Protected file integrity**:
   a. Convert `protected_hashes` tuples to dicts for both states.
   b. Compare hashes: detect modifications (hash changed), deletions (in pre but not post), and unexpected appearances (in post but not pre).
   c. Flag modifications as `"CRITICAL: {path} was modified by the agent"`.
   d. Flag deletions as `"CRITICAL: {path} was deleted by the agent"`.
   e. Flag unexpected appearances as `"CRITICAL: {path} appeared unexpectedly"`.
3. **Quality gate**:
   a. Check `post_state.quality_results` for ruff lint, ruff format, and pyright failures.
   b. Flag each as `"QUALITY: {tool} failures\n{output[:300]}"`.
4. **Test gate**:
   a. Check `post_state.test_results` for test failures.
   b. Flag as `"QUALITY: tests failing\n{output[:300]}"`.
5. **Improvements**: detect new files by comparing `post_state.files` vs `pre_state.files`.
6. Return `VerificationReport(passed=True)` only if `issues` is empty.

## v0.1 Scope

- Pure function: no filesystem I/O, all data comes from the two `ProjectState` snapshots.
- Returns typed `VerificationReport` dataclass.
- Bridge adapter (`adapters/verifier_bridge.py`) handles dict ↔ typed conversion for seed compatibility.

## Not in v0.1

- Granular per-file lint results with line numbers.
- Semantic diff analysis (understanding what changed, not just that something changed).
- Regression detection (did we break something that was working?).
- Coverage threshold enforcement.


---

## vision_templates

### Contract

# Vision Templates — Contract

## Purpose

Provide VISION.md starter templates for common project types. Templates
give humans a structured starting point to describe their project's
identity, principles, architecture, and roadmap.

## Interface

```python
def get_template(name: str | None = None) -> str
def list_templates() -> tuple[str, ...]
```

## Input

| Parameter | Type           | Description                                         |
|-----------|----------------|-----------------------------------------------------|
| `name`    | `str \| None`  | Template name, or None for the generic template      |

## Output

- `get_template` — returns the template content as a string
- `list_templates` — returns available template names (excludes generic)

## Dependencies

None. Pure string operations, no external imports.

## Constraints

1. Templates are plain Markdown strings with placeholder markers.
2. Placeholder format: `<YOUR_...>` (e.g. `<YOUR_PROJECT_NAME>`).
3. `get_template(None)` and `get_template("generic")` return the same template.
4. Unknown template names raise `ValueError`.
5. Available templates: `generic`, `web-app`, `cli-tool`, `library`.
6. Pure functions — no file I/O.


### Spec

# Vision Templates — Spec v1

## Overview

Provides four VISION.md templates: generic, web-app, cli-tool, library.
Each template follows the same structure (Identity, Core Principles,
Architecture, Quality, Roadmap) with content tailored to the project type.

## Template Structure

All templates include these sections:

1. **Identity** — project name, purpose, one-line description
2. **Core Principles** — 3-5 guiding principles for autonomous iteration
3. **Architecture** — high-level directory structure and rules
4. **Quality Assurance** — verification pipeline definition
5. **Roadmap** — starter version milestones

## Placeholders

Templates use `<YOUR_...>` markers where humans fill in specifics:

- `<YOUR_PROJECT_NAME>` — project name
- `<YOUR_ONE_LINE_DESCRIPTION>` — brief project description
- `<YOUR_PRINCIPLE_N>` — project-specific principles
- `<YOUR_ARCHITECTURE_DESCRIPTION>` — architecture overview

## Implementation

- `_TEMPLATES` dict maps names to template strings
- `get_template()` does case-insensitive lookup with None→"generic" fallback
- `list_templates()` returns sorted tuple of non-generic names


---

*Generated from system specs by Anima docgen.*
