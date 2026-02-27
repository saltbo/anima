# 🌱 Anima

**Give your project a soul.**

Anima is an Autonomous Iteration Engine — a system that drives software projects
through continuous, goal-driven, self-directed development cycles. It builds itself
using the same process it provides to others.

## Quickstart

```bash
# Prerequisites: Python 3.11+, Git, Claude Code CLI (or other supported agent)

# See current state
python seed.py --status

# Preview what Anima will do (without executing)
python seed.py --dry-run

# Run a single iteration
python seed.py

# Run continuous iterations
python seed.py --loop

# Run exactly 5 iterations
python seed.py --loop --max 5

# Inject a new idea
echo "# My idea\n\n## What\nAdd X feature\n\n## Why\nBecause Y\n\n## Priority\nhigh" \
  > inbox/$(date +%Y%m%d-%H%M%S)-my-idea.md

# Reset after failures
python seed.py --reset
```

## How It Works

Anima runs a gap-driven loop: **scan → analyze gaps → plan → execute → verify → commit or rollback**.

The seed script is scaffolding. Every function in it will be replaced by a module
that Anima builds for itself. When all functions are replaced, the seed has served its purpose.

## Architecture

Anima follows Clean Architecture: dependency flows inward, the core domain has zero
external dependencies, all external interactions go through abstract Ports.

```
anima/
├── seed.py              # Bootstrap (gets replaced)
├── VISION.md            # Product vision (human-authored)
├── domain/              # Core types + interfaces (zero external deps)
│   ├── models.py        # Dataclasses: Vision, GapReport, IterationPlan, ...
│   └── ports.py         # Protocols: AgentPort, VersionControlPort, ...
├── modules/             # Functional modules (built by Anima itself)
│   ├── gap_analyzer/    # Vision + State → GapReport
│   ├── planner/         # GapReport + History → IterationPlan
│   ├── executor/        # IterationPlan → ExecutionResult (via AgentPort)
│   ├── verifier/        # Changes → VerificationReport (ruff + pyright + pytest)
│   └── reporter/        # Results → IterationRecord
├── adapters/            # Concrete implementations of Ports
│   ├── agents/          # Claude Code, Codex, Gemini, ...
│   ├── git_vc.py        # Git version control
│   └── ...
├── kernel/              # Immutable core (human-only modifications)
├── inbox/               # Drop .md files to inject ideas
└── iterations/          # Iteration logs (auto-generated)
```

## Quality Pipeline

Every iteration must pass before changes are committed:

```
ruff check + format  →  pyright strict  →  pytest --cov ≥80%
```
