# Architecture

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
│   ├── scanner/               # Project → ProjectState
│   │   ├── CONTRACT.md        # Stable interface (input/output/deps/constraints)
│   │   ├── SPEC.md            # Current version implementation spec
│   │   ├── core.py            # Pure logic, depends only on domain/
│   │   └── tests/
│   ├── gap_analyzer/          # Vision + State → GapReport
│   │   ├── CONTRACT.md
│   │   ├── SPEC.md
│   │   ├── core.py
│   │   └── tests/
│   ├── planner/               # GapReport + History → IterationPlan
│   │   ├── CONTRACT.md
│   │   ├── SPEC.md
│   │   ├── core.py
│   │   └── tests/
│   ├── executor/              # IterationPlan → ExecutionResult (via AgentPort)
│   │   ├── CONTRACT.md
│   │   ├── SPEC.md
│   │   ├── core.py
│   │   └── tests/
│   ├── verifier/              # Pre/Post State → VerificationReport
│   │   ├── CONTRACT.md
│   │   ├── SPEC.md
│   │   ├── core.py
│   │   └── tests/
│   └── reporter/              # VerificationReport → IterationRecord
│       ├── CONTRACT.md
│       ├── SPEC.md
│       ├── core.py
│       └── tests/
│
├── adapters/                  # Concrete implementations of domain Ports
│   └── agents/
│       ├── claude_code.py     # ClaudeCodeAdapter implements AgentPort
│       ├── codex.py           # CodexAdapter implements AgentPort
│       └── gemini.py          # GeminiAdapter implements AgentPort
│
├── kernel/                    # IMMUTABLE — Anima cannot modify this
│   ├── __init__.py
│   ├── cli.py                 # CLI entry point (anima command)
│   ├── config.py              # Path constants and configuration
│   ├── git_ops.py             # Git snapshot, commit, rollback
│   ├── loop.py                # Fixed iteration loop (calls through wiring)
│   ├── roadmap.py             # Milestone detection, README updates
│   ├── seed.py                # Seed implementations (initial/fallback)
│   └── state.py               # State persistence (load/save)
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

3. **adapters/ implement domain/ports.py Protocols** for swappable
   components (e.g. different AI agent backends). Infrastructure tools
   (git, pytest, ruff) are handled directly by kernel/.

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

## Domain Models

- **IterationStatus** — Outcome of a completed iteration.
- **Priority** — Priority level for inbox items or tasks.
- **QuotaStatus** — API quota/rate-limit state reported by an agent.
- **QualityCheckResult** — Result of a single quality check (e.g. ruff lint, pyright).
- **TestResult** — Result of running the test suite.
- **QualityReport** — Aggregated results from all quality checks.
- **QuotaState** — Snapshot of API quota/rate-limit state from an agent execution.
- **InboxItem** — A human instruction from the inbox directory.
- **ModuleInfo** — Metadata about a discovered pipeline module.
- **Vision** — Structured representation of the project vision.
- **ProjectState** — Snapshot of the current project state.
- **GapReport** — Analysis of gaps between vision and current state.
- **IterationPlan** — Plan for a single iteration.
- **ExecutionResult** — Result of executing an iteration plan via an agent.
- **VerificationReport** — Result of verifying an iteration's changes.
- **IterationRecord** — Persisted log entry for a completed iteration.
- **RiskLevel** — Risk classification for a planned iteration.
- **GateDecision** — Result of risk classification for an iteration plan. When ``gated`` is True, the iteration should pause and wait for human approval before execution proceeds.
- **ToolchainEntry** — A detected tech stack with its associated build/lint/test commands.
- **DetectionResult** — Result of tech stack detection for a project.
- **HealthStatus** — Health classification for a module.
- **ModuleHealthScore** — Health assessment for a single pipeline module. Combines structural completeness (contract, spec, core, tests) with runtime reliability (fallback rate from health.json).
- **HealthReport** — Aggregated health scores across all modules.
- **FailureAction** — Recommended action for a stuck gap.
- **FailurePattern** — A detected pattern of repeated failure on a specific gap. Tracks how many iterations a gap has persisted and whether those iterations failed, to recommend skipping or re-approaching.

## Domain Ports

- **AgentPort** — AI agent abstraction for executing iteration plans.
- **VersionControlPort** — Version control abstraction for snapshots, commits, and rollbacks.
- **TestRunnerPort** — Test execution abstraction.
- **LinterPort** — Lint and type-check abstraction.
- **FileSystemPort** — File system operations abstraction.

---

*Generated from system specs by Anima docgen.*
