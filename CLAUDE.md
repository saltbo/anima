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
  console/        — TUI output system (Rich backend + plain fallback)

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
ruff check . && ruff format --check . && pyright && pytest --cov --cov-fail-under=80
```

## Architecture Rules

1. **domain/** has zero imports from outside the standard library
2. **modules/** depend only on domain/
3. **adapters/** implement domain/ports.py Protocols
4. **Dependency direction**: adapters → modules → domain ← kernel
5. Use `typing.Protocol` for all Ports (PEP 544)
6. Use `@dataclass(frozen=True)` for domain models
7. Constructor injection for dependencies

## Console & Logging

Console 和 Logging 是两件不同的事：

- **Console** (`kernel.console`) — 面向用户的终端 TUI 输出，显示当前需要关注的信息
- **Logging** (`logging`) — 面向调试/审计的记录，写入 `.anima/anima.log` 文件

**Never use `print()` anywhere.** 用 `console.*` 替代所有终端输出。

### Console 用法

```python
from kernel.console import console

# 通用消息
console.info("Found 42 files")
console.success("Iteration passed")
console.warning("Push failed, retrying...")
console.error("VISION.md not found")

# 结构化面板
console.panel("ANIMA — Status", title="Anima", style="green")
console.table(["Name", "Status"], [["domain/", "ok"], ["adapters/", "missing"]])
console.kv({"Iterations": "5", "Status": "alive"})

# 迭代生命周期（kernel 内部使用）
console.iteration_header(num, timestamp)
console.step(1, 6, "Scanning project state...")
console.step_detail("Files: 42")
console.iteration_result(id, success, elapsed, improvements, issues, cost, tokens)

# Agent 流式输出
console.stream_text(text)
console.stream_tool("Read", "/path/to/file")
console.stream_end()
console.stream_result(elapsed, cost, tokens)
```

Console 在 `cli.py:main()` 中配置一次：`configure(backend="auto")`。自动检测：有 Rich + 是 TTY → Rich 美化输出，否则纯文本回退。

### Logging 用法

```python
import logging

logger = logging.getLogger("anima")           # kernel/
logger = logging.getLogger("anima.planner")   # modules/planner/
logger = logging.getLogger("anima.adapters")  # adapters/
```

Level guidelines:
- `logger.debug()` — verbose details (file counts, module lists, skipped items)
- `logger.info()` — normal progress, state transitions (written to log file, not terminal)
- `logger.warning()` — recoverable problems (push failed, rollback, missing optional files)
- `logger.error()` — failures that affect iteration outcome

Logging is configured once in `cli.py:main()`, writes to `.anima/anima.log`. Controlled by `--verbose` (DEBUG) and `--quiet` (WARNING) flags on `anima start`.

### 何时用哪个？

- **用户需要看到的** → `console.*`
- **调试/审计需要记录的** → `logger.*`
- 同一事件可以同时出现在两边（console 显示 + logger 记录）

## File Conventions

- Module contracts: `modules/<name>/CONTRACT.md` (stable interface: input/output/deps/constraints)
- Module specs: `modules/<name>/SPEC.md` (current version implementation spec)
- Module implementation: `modules/<name>/core.py`
- Module tests: `modules/<name>/tests/` (validate SPEC.md behavior)
- Conformance tests: `tests/conformance/test_<step_name>.py` (validate CONTRACT.md interface)
- Iteration logs: `iterations/<id>.json`
- Human instructions: `inbox/*.md`
