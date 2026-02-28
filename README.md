# Anima

<!-- anima:status:start -->
![status](https://img.shields.io/badge/status-alive-brightgreen) ![milestone](https://img.shields.io/badge/milestone-v0.0.0-purple) ![time](https://img.shields.io/badge/time-31m-blue) ![tokens](https://img.shields.io/badge/tokens-8.5M-blue) ![cost](https://img.shields.io/badge/cost-%247.69-blue)
<!-- anima:status:end -->

**Give your project a soul.**

Anima is an Autonomous Iteration Engine — a system that drives software projects
through continuous, gap-driven, self-directed development cycles.

<!-- anima:stage:start -->
> **Status: Growing** — Anima is building itself. It is not yet available for external use.
<!-- anima:stage:end -->

## What is Anima?

Anima scans the gap between where your project is and where it should be, then
autonomously plans, executes, verifies, and commits changes — iteration after
iteration. It builds itself using the same engine it provides to others.

## Usage

> The following commands will be available after the v1.0 release.

```bash
anima init          # Initialize Anima in a project
anima start         # Begin autonomous iteration
anima status        # Show current progress and gaps
anima instruct "…"  # Give Anima a specific directive
anima pause         # Pause iteration
anima resume        # Resume iteration
```

## How It Works

Anima runs a gap-driven loop: **scan → analyze gaps → plan → execute → verify → commit or rollback**. Each iteration targets the highest-priority gap between the project vision and its current state. If verification fails, changes are rolled back automatically.

## Architecture

```
anima/
├── VISION.md            # Product vision (human-authored)
├── wiring.py            # Agent-modifiable step registry
├── domain/              # Core types + interfaces (zero external deps)
│   ├── models.py        # Dataclasses: Vision, GapReport, IterationPlan, ...
│   └── ports.py         # Protocols: AgentPort, VersionControlPort, ...
├── modules/             # Functional modules (built by Anima itself)
│   ├── scanner/         # Project → ProjectState
│   ├── gap_analyzer/    # Vision + State → GapReport
│   ├── planner/         # GapReport + History → IterationPlan
│   ├── executor/        # IterationPlan → ExecutionResult (via AgentPort)
│   ├── verifier/        # Changes → VerificationReport (ruff + pyright + pytest)
│   └── reporter/        # Results → IterationRecord
├── adapters/            # Concrete implementations of Ports
│   └── agents/          # Claude Code, Codex, Gemini, ...
├── kernel/              # Immutable core (human-only modifications)
│   └── seed.py          # Bootstrap implementations (get replaced)
├── inbox/               # Drop .md files to inject ideas
└── iterations/          # Iteration logs (auto-generated)
```

## Current Progress

<!-- anima:progress:start -->
**Milestone: v0.0.0** — Roadmap: 6 / 58 tasks complete
<!-- anima:progress:end -->
