# Benchmark #1: Simple CLI App — Todo Manager

## Goal

Prove that Anima's pipeline can take a project specification and produce a
working CLI application through autonomous iteration.

## Application Spec

A command-line todo manager called `taskr` that manages a list of tasks.

### Commands

| Command | Description | Example |
|---------|-------------|---------|
| `add <title>` | Add a new task | `taskr add "Buy groceries"` |
| `list` | Show all tasks (with status) | `taskr list` |
| `complete <id>` | Mark a task as done | `taskr complete 1` |
| `remove <id>` | Delete a task | `taskr remove 1` |

### Data Model

Each task has:
- `id` (int) — auto-incrementing identifier
- `title` (str) — task description
- `completed` (bool) — completion status
- `created_at` (str) — ISO 8601 timestamp

### Persistence

Tasks are stored in a JSON file (`~/.taskr/tasks.json`).

### Project Structure

```
taskr/
├── pyproject.toml        # Project metadata, dependencies, scripts entry
├── src/
│   └── taskr/
│       ├── __init__.py
│       ├── cli.py        # Argument parsing and command dispatch
│       ├── models.py     # Task dataclass
│       └── storage.py    # JSON file persistence
└── tests/
    ├── __init__.py
    ├── test_cli.py
    ├── test_models.py
    └── test_storage.py
```

### Quality Requirements

- Python 3.12+
- Type annotations on all functions
- `argparse` for CLI parsing (no external dependencies for core)
- `@dataclass` for the Task model
- Tests with pytest
- Passes ruff linting

## Validation Criteria

1. **Project structure** — required files and directories exist
2. **Entry point** — CLI module with main function exists
3. **Data model** — Task dataclass with required fields
4. **Core commands** — add, list, complete, remove implemented
5. **Persistence** — JSON-based storage module exists
6. **Argument parsing** — argparse usage in CLI module
7. **Test coverage** — test files exist for each source module
8. **Type annotations** — source files contain type annotations
