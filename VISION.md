# VISION: Anima

## Identity

**Anima** (Latin: "soul, life force") is an Autonomous Iteration Engine — a system
that gives software projects a life of their own through continuous, goal-driven,
self-directed development cycles.

Anima is also **its own first user**. It builds itself through the same autonomous
iteration process it provides to others. When Anima reaches maturity, its every
release will have been produced by itself.

## Core Principles (Immutable)

1. **Gap-Driven**: Anima iterates only when a gap exists between current state
   and desired state. No gap, no action.
2. **Module Isolation**: Anima is composed of replaceable modules with strict
   interface contracts (Protocols). Any module can be rewritten from scratch
   without affecting others.
3. **Verify Before Commit**: Nothing is committed without passing the full
   verification pipeline (ruff + pyright + pytest). Failed iterations are
   rolled back and their failure is recorded as knowledge.
4. **Seed Replacement**: Anima progressively replaces the seed script's primitive
   logic with its own purpose-built modules. The seed is scaffolding, not architecture.
5. **Human as Visionary**: Humans define *what* and *why*. Anima decides *how* and *when*.
6. **Type Safety as Contract**: All code must have complete type annotations and
   pass strict static analysis. Types are the machine-enforceable form of contracts.
7. **Rewrite Over Patch**: When changes exceed 40% of a module's code, prefer a
   clean rewrite over accumulated patches. Anima writes code fast — use that advantage.

## Architecture

Anima follows **Clean Architecture** principles adapted for an autonomous iteration engine:
dependency flows inward, the core domain has zero external dependencies, and all
external interactions are mediated through abstract Ports implemented by Adapters.

The system is divided into two trust zones:
- **Kernel** (immutable by Anima, human-only modifications)
- **Everything else** (iterable by Anima, subject to verification)

### Directory Structure

```
anima/
├── domain/                    # Core domain — pure Python, ZERO external dependencies
│   ├── models.py              # Core data types (dataclass + full type annotations)
│   │   ├── Vision             # Structured representation of the vision
│   │   ├── ProjectState       # Project state snapshot
│   │   ├── GapReport          # Gap analysis report
│   │   ├── IterationPlan      # What to do in this iteration
│   │   ├── ExecutionResult    # Agent execution output
│   │   ├── VerificationReport # Pass/fail + details
│   │   └── IterationRecord    # Persisted iteration log entry
│   │
│   └── ports.py               # Abstract interfaces for all external dependencies
│       ├── AgentPort           # AI agent abstraction (Protocol)
│       ├── VersionControlPort  # Version control abstraction (Protocol)
│       ├── TestRunnerPort      # Test execution abstraction (Protocol)
│       ├── LinterPort          # Lint + type check abstraction (Protocol)
│       └── FileSystemPort      # File system operations abstraction (Protocol)
│
├── modules/                   # Functional modules (each is a Use Case)
│   ├── gap_analyzer/          # Vision + State → GapReport
│   │   ├── CONTRACT.md
│   │   ├── core.py            # Pure logic, depends only on domain/
│   │   └── tests/
│   ├── planner/               # GapReport + History → IterationPlan
│   │   ├── CONTRACT.md
│   │   ├── core.py
│   │   └── tests/
│   ├── executor/              # IterationPlan → ExecutionResult (via AgentPort)
│   │   ├── CONTRACT.md
│   │   ├── core.py
│   │   └── tests/
│   ├── verifier/              # Pre/Post State → VerificationReport
│   │   ├── CONTRACT.md
│   │   ├── core.py
│   │   └── tests/
│   └── reporter/              # VerificationReport → IterationRecord
│       ├── CONTRACT.md
│       ├── core.py
│       └── tests/
│
├── adapters/                  # Concrete implementations of Ports
│   ├── agents/
│   │   ├── claude_code.py     # ClaudeCodeAdapter implements AgentPort
│   │   ├── codex.py           # CodexAdapter implements AgentPort
│   │   └── gemini.py          # GeminiAdapter implements AgentPort
│   ├── git_vc.py              # GitVersionControl implements VersionControlPort
│   ├── pytest_runner.py       # PytestRunner implements TestRunnerPort
│   ├── quality_checker.py     # RuffPyrightChecker implements LinterPort
│   └── local_fs.py            # LocalFileSystem implements FileSystemPort
│
├── kernel/                    # IMMUTABLE — Anima cannot modify this
│   ├── loop.py                # Iteration loop scheduler
│   ├── rollback.py            # Rollback mechanism
│   └── config.py              # System configuration
│
├── cli/                       # User-facing command-line interface
│   └── main.py                # anima init / start / status / instruct / pause / approve
│
├── inbox/                     # Human intent injection (drop .md files here)
├── iterations/                # Iteration logs (auto-generated)
└── seed.py                    # Bootstrap script (to be replaced by modules)
```

### Clean Architecture Rules

1. **domain/ has ZERO imports from outside the Python standard library.**
   It defines only dataclasses and Protocols. This layer never changes
   unless the fundamental concepts of the system change.

2. **modules/ depend only on domain/.** Each module's core.py receives
   Ports via constructor injection. It never imports from adapters/ or kernel/.

3. **adapters/ implement domain/ports.py Protocols.** They are the only
   code that touches external tools (git, pytest, claude CLI, file system).
   Swapping an adapter requires zero changes to modules.

4. **kernel/ is the trust root.** It orchestrates the iteration loop and
   manages rollback. Anima's self-iteration scope explicitly excludes kernel/.
   Only humans modify kernel/.

5. **Dependency direction: adapters → modules → domain ← kernel.**
   Never the reverse.

### Key Design Patterns

- **Protocol-based interfaces (PEP 544)**: Use `typing.Protocol` for all Ports.
  No inheritance required — structural subtyping means any class with matching
  method signatures satisfies the Protocol. pyright strict mode enforces this.

- **Dataclasses for all domain models**: Use `@dataclass(frozen=True)` for
  immutable value objects. Full type annotations on every field. No `Any` types
  in domain models.

- **Constructor injection**: Modules receive their dependencies (Ports) through
  `__init__`, never through global imports. This makes testing trivial and
  makes the dependency graph explicit.

## Quality Assurance Pipeline

Every iteration must pass this pipeline before changes are committed.
Failure at any stage triggers a rollback.

### Stage 1: Code Formatting & Linting (ruff)

```
ruff check . --fix && ruff format --check .
```

Enforces:
- Consistent code style (replaces black + isort)
- No unused imports or variables
- No overly complex functions (McCabe complexity)
- Docstrings on all public functions
- Import ordering and grouping

### Stage 2: Static Type Checking (pyright strict)

```
pyright --project pyrightconfig.json
```

Enforces:
- Complete type annotations on all functions (parameters + return)
- No implicit `Any` types
- Protocol compliance (all Adapters correctly implement their Ports)
- No unsafe type narrowing
- Proper handling of Optional/None

### Stage 3: Tests & Coverage (pytest + pytest-cov)

```
pytest --cov=anima --cov-fail-under=80 --tb=short -q
```

Enforces:
- All tests pass
- Minimum 80% code coverage
- Each module has at least one test validating its CONTRACT.md

### Pipeline Integration

The verification pipeline is defined as a single command that the Verifier
module (and initially the seed script) runs after every iteration:

```bash
ruff check . && ruff format --check . && pyright && pytest --cov=anima --cov-fail-under=80
```

All four must exit 0 for the iteration to be considered successful.

### Configuration Files

The following configuration files must be created as part of the project
scaffolding (v0.1):

- **pyproject.toml**: Project metadata, ruff configuration, pytest configuration
- **pyrightconfig.json**: pyright strict mode settings, include/exclude paths

## Version Roadmap

### v0.1 — Foundation & Toolchain

The seed script drives all iterations. Establish the project's structural
and quality foundation.

- [ ] Create complete directory structure matching the architecture above
- [ ] Create pyproject.toml with project metadata, ruff config, pytest config
- [ ] Create pyrightconfig.json with strict mode enabled
- [ ] Implement domain/models.py with all core dataclasses (fully typed, frozen)
- [ ] Implement domain/ports.py with all Protocol definitions (VersionControlPort must include commit_and_push + tag_milestone)
- [ ] Create CONTRACT.md for each module (gap_analyzer, planner, executor, verifier, reporter)
- [ ] Create SPEC.md for each module defining v0.1 target functionality
- [ ] Implement adapters/local_fs.py (LocalFileSystem implements FileSystemPort)
- [ ] Implement adapters/git_vc.py (GitVersionControl implements VersionControlPort)
- [ ] Set up pytest with conftest.py and fixtures for common test patterns
- [ ] All code passes: ruff check + ruff format + pyright strict + pytest
- [ ] Verify that domain/ has zero external imports

### v0.2 — Core Modules (Gap Analyzer & Reporter)

Build the two modules with the simplest contracts first.

- [ ] Implement gap_analyzer/core.py: reads Vision + ProjectState, outputs GapReport
- [ ] Tests for gap_analyzer validating CONTRACT.md
- [ ] Implement reporter/core.py: writes structured IterationRecord to iterations/
- [ ] Tests for reporter validating CONTRACT.md
- [ ] Seed delegates gap analysis to gap_analyzer module (first self-replacement)
- [ ] Seed delegates reporting to reporter module (second self-replacement)
- [ ] All code passes full quality pipeline

### v0.3 — Planner & Executor

Build the modules that drive the actual iteration work.

- [ ] Implement planner/core.py: receives GapReport + history, produces IterationPlan
- [ ] Tests for planner validating CONTRACT.md
- [ ] Implement adapters/agents/claude_code.py (ClaudeCodeAdapter implements AgentPort)
- [ ] Implement executor/core.py: takes IterationPlan, calls AgentPort, returns ExecutionResult
- [ ] Tests for executor validating CONTRACT.md (with mock AgentPort)
- [ ] Seed delegates planning to planner module (third self-replacement)
- [ ] Seed delegates execution to executor module (fourth self-replacement)
- [ ] All code passes full quality pipeline

### v0.4 — Verifier & Quality Gate

Build the verification module and integrate the full quality pipeline.

- [ ] Implement adapters/pytest_runner.py (PytestRunner implements TestRunnerPort)
- [ ] Implement adapters/quality_checker.py (RuffPyrightChecker implements LinterPort)
- [ ] Implement verifier/core.py: runs lint + typecheck + tests, produces VerificationReport
- [ ] Tests for verifier validating CONTRACT.md
- [ ] Seed delegates verification to verifier module (fifth self-replacement — seed is now minimal)
- [ ] Implement protected file detection (kernel/ and VISION.md cannot be modified by agent)
- [ ] All code passes full quality pipeline

### v0.5 — Kernel & Full Autonomy

Extract the kernel and achieve complete seed replacement.

- [ ] Extract kernel/loop.py from seed.py iteration logic
- [ ] Extract kernel/rollback.py from seed.py git operations
- [ ] Extract kernel/config.py from seed.py configuration
- [ ] Seed script is now a thin entry point that calls kernel/loop.py
- [ ] System can iterate on its own modules (excluding kernel/)
- [ ] Lifecycle state machine: alive (iterating) / sleep (idle) / paused (failed)
- [ ] Continuous iteration by default; --once flag for single run
- [ ] Auto-detect milestone advancement and create semver git tags (v0.1.0, v0.2.0, ...)
- [ ] Commit and push to remote after every successful iteration
- [ ] Update README.md status badges (shields.io) on state transitions
- [ ] inbox/ monitoring: system detects and incorporates new .md files
- [ ] Gate mechanism: pause and request human approval on high-risk changes
- [ ] Iteration rate limiting and cost tracking
- [ ] All code passes full quality pipeline

### v0.6 — CLI & Developer Experience

Build the command-line interface for end users.

- [ ] `anima init <project>` — scaffold a new autonomous project
- [ ] `anima start` — launch iteration daemon
- [ ] `anima status` — show current state, gaps, module health
- [ ] `anima log` — show iteration history
- [ ] `anima instruct "..."` — inject human intent into inbox/
- [ ] `anima pause` / `anima resume` — control iteration flow
- [ ] `anima approve <iteration-id>` — approve pending decisions
- [ ] Published to PyPI, installable via `uv tool install anima`
- [ ] All code passes full quality pipeline

### v0.7 — Self-Validation & Benchmark

Establish the benchmark suite that proves the system works.

- [ ] Benchmark project #1: Simple TODO CLI app (spec → working app)
- [ ] Benchmark project #2: REST API with database (spec → working app)
- [ ] Benchmark project #3: Anima iterates itself (self-improvement cycle)
- [ ] Stable/Candidate promotion mechanism for self-iteration
- [ ] Module health scoring (test coverage trend, change frequency, patch count)
- [ ] Auto-rewrite trigger: when module health score drops below threshold

### v1.0 — Production Ready

- [ ] All seed.py logic fully replaced by purpose-built modules
- [ ] Self-iteration validated: Anima can improve its own modules reliably
- [ ] Multiple AI agent backends (Claude Code, Codex, Gemini CLI)
- [ ] Web dashboard (local) for iteration monitoring
- [ ] Comprehensive documentation (generated from system's own specs)
- [ ] Stable release on PyPI

## Inbox Protocol

Humans communicate intent by placing Markdown files in the `inbox/` directory:

```
inbox/
├── YYYYMMDD-HHMMSS-short-description.md
```

Each file should contain:

```markdown
# <Short Title>

## What
What should change or be added.

## Why
The motivation or problem being solved.

## Priority
high | medium | low

## Constraints (optional)
Any boundaries, requirements, or things to avoid.
```

The system processes inbox items by priority, incorporating them into
the gap analysis on the next iteration cycle. Processed items are archived
to `inbox/.archive/`.

## Quality Standards

- All code must have complete type annotations (enforced by pyright strict)
- All code must pass ruff linting and formatting checks
- All modules must have ≥80% test coverage
- All module interfaces must be defined as Protocols in domain/ports.py
- Every CONTRACT.md must be written before implementation begins
- Every iteration produces a structured JSON log entry
- Failed iterations are valuable data — always record the failure reason
- Code that passes tests but violates type contracts is a failure
- domain/ must never import from modules/, adapters/, or kernel/
- modules/ must never import from adapters/ or kernel/
- kernel/ is off-limits to Anima's self-iteration
