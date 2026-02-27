# Anima — Agent Instructions

Anima is an Autonomous Iteration Engine that builds itself through
iterative development cycles. You are the AI agent driving it.

## Architecture

```
kernel/loop.py  →  wiring.py (you modify this)  →  seed or module implementations
                →  kernel/seed.py (infrastructure — you cannot modify this)
```

- **kernel/** contains the fixed iteration loop and seed implementations
- **wiring.py** maps each pipeline step to its current implementation
- **modules/** contain purpose-built replacements for seed functions
- **domain/** defines core types and Protocol interfaces
- **adapters/** implement external integrations

## Protected Paths (DO NOT MODIFY — violations cause rollback)

- `VISION.md`
- `kernel/` (all files)
- `roadmap/` (checked off by the system, not by you)

## Self-Replacement Protocol

To replace a seed function with your module:

1. Build your module in `modules/<name>/` with `CONTRACT.md`, `core.py`, and `tests/`
2. Write a conformance test in `tests/conformance/` that proves your module
   produces equivalent or better output than the seed for the same inputs
3. Modify `wiring.py` to point the step to your implementation
4. The verification pipeline must pass with the new wiring

## You May Modify

- `wiring.py` — step registry (this is how you replace seed functions)
- `modules/` — your module implementations
- `adapters/` — port implementations
- `domain/` — core types and protocols
- `tests/conformance/` — conformance tests for replacements

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

## File Conventions

- Module contracts: `modules/<name>/CONTRACT.md`
- Module specs: `modules/<name>/SPEC.md`
- Module implementation: `modules/<name>/core.py`
- Module tests: `modules/<name>/tests/`
- Conformance tests: `tests/conformance/test_<step_name>.py`
- Iteration logs: `iterations/<id>.json`
- Human instructions: `inbox/*.md`
