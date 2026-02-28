# Anima — Project Guide

Anima is an Autonomous Iteration Engine — a system that gives software
projects a life of their own through continuous, goal-driven development cycles.

## Architecture

```
kernel/           — Immutable trust root (human-maintained only)
  loop.py         — Fixed iteration loop, dispatches through wiring.py
  seed.py         — Seed implementations of the 6 pipeline steps
  config.py       — Path constants and configuration
  git_ops.py      — Git snapshot, commit, rollback
  state.py        — State persistence (load/save)
  roadmap.py      — Milestone detection, README updates
  cli.py          — CLI entry point (anima command)

wiring.py         — Step registry, maps pipeline steps to implementations
modules/          — Purpose-built pipeline step implementations
domain/           — Core types and Protocol interfaces
adapters/         — Concrete implementations of domain Ports
tests/conformance/— Tests proving module equivalence to seed
```

Key files:
- `SOUL.md` — Anima's identity and behavioral principles
- `VISION.md` — Project vision and goals
- `CLAUDE.md` — Technical guide and architecture rules (auto-loaded by Claude Code)

Two trust zones:
- **kernel/** — immutable, human-only modifications
- **Everything else** — iterable, subject to verification

## Protected Paths

These files must not be modified by automated processes:
- `VISION.md`
- `kernel/` (all files)

## Quality Pipeline

Every change must pass before commit:

```bash
ruff check . && ruff format --check . && pyright && pytest
```

## Architecture Rules

1. **domain/** has zero imports from outside the standard library
2. **modules/** depend only on domain/
3. **adapters/** implement domain/ports.py Protocols
4. **Dependency direction**: adapters → modules → domain ← kernel
5. Use `typing.Protocol` for all Ports (PEP 544)
6. Use `@dataclass(frozen=True)` for domain models
7. Constructor injection for dependencies

## Logging

All output uses Python `logging` through the `"anima"` logger hierarchy. **Never use `print()` for operational messages.**

```python
import logging

logger = logging.getLogger("anima")           # kernel/ modules
logger = logging.getLogger("anima.planner")   # modules/planner/
logger = logging.getLogger("anima.adapters")  # adapters/
```

Level guidelines:
- `logger.debug()` — verbose details (file counts, module lists, skipped items)
- `logger.info()` — normal progress (step banners, milestones, state transitions)
- `logger.warning()` — recoverable problems (push failed, rollback, missing optional files)
- `logger.error()` — failures that affect iteration outcome

`print()` is only allowed for direct CLI command output (`cmd_status`, `cmd_log`, `cmd_reset`, `cmd_instruct`) where the printed text **is** the command's purpose.

Logging is configured once in `cli.py:main()`. Controlled by `--verbose` (DEBUG) and `--quiet` (WARNING) flags on `anima start`.

## File Conventions

- Module contracts: `modules/<name>/CONTRACT.md` (stable interface: input/output/deps/constraints)
- Module specs: `modules/<name>/SPEC.md` (current version implementation spec)
- Module implementation: `modules/<name>/core.py`
- Module tests: `modules/<name>/tests/` (validate SPEC.md behavior)
- Conformance tests: `tests/conformance/test_<step_name>.py` (validate CONTRACT.md interface)
- Iteration logs: `iterations/<id>.json`
- Human instructions: `inbox/*.md`
