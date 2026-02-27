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
4. **Self-Bootstrapping**: Anima starts with a seed — minimal implementations of each
   pipeline step. It progressively replaces these with purpose-built modules, proving
   each replacement through conformance tests. The seed is scaffolding for bootstrapping,
   not architecture.
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
│   ├── __init__.py
│   ├── cli.py                 # CLI entry point (anima command)
│   ├── loop.py                # Fixed iteration loop (calls through wiring)
│   └── seed.py                # Seed implementations (initial/fallback)
│
├── wiring.py                  # Agent-modifiable step registry
├── inbox/                     # Human intent injection (drop .md files here)
├── iterations/                # Iteration logs (auto-generated)
└── tests/
    └── conformance/           # Conformance tests for module replacements
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

See `roadmap/` for per-version checklists:

- roadmap/v0.1.md — Foundation & Toolchain
- roadmap/v0.2.md — Scanner & Reporter (first self-replacements)
- roadmap/v0.3.md — Gap Analyzer & Planner (analysis intelligence)
- roadmap/v0.4.md — Executor (resilient agent integration)
- roadmap/v0.5.md — Verifier (protection & quality gate)
- roadmap/v0.6.md — Resilience & Self-Awareness
- roadmap/v0.7.md — CLI & Developer Experience
- roadmap/v0.8.md — Self-Validation & Benchmark
- roadmap/v1.0.md — Production Ready

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
