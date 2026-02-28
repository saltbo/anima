"""Vision Templates — VISION.md starter templates for common project types.

Provides structured templates that guide humans in defining their project's
identity, principles, architecture, and roadmap for autonomous iteration.
"""

from __future__ import annotations

_GENERIC = """\
# VISION: <YOUR_PROJECT_NAME>

## Identity

**<YOUR_PROJECT_NAME>** — <YOUR_ONE_LINE_DESCRIPTION>

## Core Principles

1. **<YOUR_PRINCIPLE_1>**: Describe a key guiding principle for this project.
2. **<YOUR_PRINCIPLE_2>**: Another principle that shapes design decisions.
3. **<YOUR_PRINCIPLE_3>**: A third principle for autonomous iteration to follow.

## Architecture

<YOUR_ARCHITECTURE_DESCRIPTION>

### Directory Structure

```
<your-project>/
├── src/              # Source code
├── tests/            # Test suite
└── ...
```

### Architecture Rules

1. Define your dependency direction and module boundaries here.
2. Specify which directories or files are off-limits to automation.

## Quality Assurance Pipeline

Every iteration must pass this pipeline before changes are committed:

```bash
# Replace with your project's lint, typecheck, and test commands
<YOUR_LINT_COMMAND> && <YOUR_TEST_COMMAND>
```

## Version Roadmap

See `roadmap/` for per-version checklists.

- roadmap/v0.1.md — Foundation
- roadmap/v0.2.md — Core Features
- roadmap/v1.0.md — Production Ready
"""

_WEB_APP = """\
# VISION: <YOUR_PROJECT_NAME>

## Identity

**<YOUR_PROJECT_NAME>** — <YOUR_ONE_LINE_DESCRIPTION>

A web application that serves users through a browser interface,
backed by server-side logic and data persistence.

## Core Principles

1. **User-First**: Every feature serves a real user need. No speculative features.
2. **Responsive by Default**: The UI works across devices and screen sizes.
3. **Secure by Design**: Authentication, authorization, and input validation
   are foundational, not afterthoughts.
4. **Progressive Enhancement**: Core functionality works without JavaScript;
   enhanced experiences layer on top.

## Architecture

<YOUR_ARCHITECTURE_DESCRIPTION>

### Directory Structure

```
<your-project>/
├── backend/          # Server-side logic (API, business rules)
│   ├── routes/       # HTTP route handlers
│   ├── models/       # Data models and schemas
│   ├── services/     # Business logic
│   └── tests/
├── frontend/         # Client-side code (UI, state management)
│   ├── components/   # Reusable UI components
│   ├── pages/        # Page-level components / routes
│   ├── styles/       # CSS / design tokens
│   └── tests/
├── database/         # Migrations, seeds, schemas
└── deploy/           # Deployment configuration
```

### Architecture Rules

1. Backend and frontend are independently deployable.
2. All API endpoints have request/response schemas.
3. Database changes use versioned migrations.
4. Environment-specific config lives in env files, never in code.

## Quality Assurance Pipeline

```bash
# Backend
<YOUR_BACKEND_LINT> && <YOUR_BACKEND_TEST>

# Frontend
<YOUR_FRONTEND_LINT> && <YOUR_FRONTEND_TEST>
```

## Version Roadmap

See `roadmap/` for per-version checklists.

- roadmap/v0.1.md — Project Setup & Dev Environment
- roadmap/v0.2.md — Core Data Model & API
- roadmap/v0.3.md — Authentication & Authorization
- roadmap/v0.4.md — Primary User Flows
- roadmap/v1.0.md — Production Launch
"""

_CLI_TOOL = """\
# VISION: <YOUR_PROJECT_NAME>

## Identity

**<YOUR_PROJECT_NAME>** — <YOUR_ONE_LINE_DESCRIPTION>

A command-line tool that solves a specific problem efficiently,
with clear output and composable behavior.

## Core Principles

1. **Do One Thing Well**: Each command has a single, clear purpose.
2. **Fail Loudly**: Errors produce actionable messages with exit codes.
   Silent failures are bugs.
3. **Composable**: Output is machine-parseable (JSON, plain text) so it
   works in pipelines. Human-friendly formatting is opt-in.
4. **Zero Surprise**: Flags and arguments follow POSIX conventions.
   Destructive operations require confirmation.

## Architecture

<YOUR_ARCHITECTURE_DESCRIPTION>

### Directory Structure

```
<your-project>/
├── src/
│   ├── cli.py        # Argument parsing and command dispatch
│   ├── commands/     # One module per subcommand
│   ├── core/         # Business logic (CLI-independent)
│   └── output/       # Formatting (text, JSON, table)
├── tests/
│   ├── test_cli.py   # Integration tests (subprocess)
│   └── test_core.py  # Unit tests (pure logic)
└── ...
```

### Architecture Rules

1. Business logic in `core/` has zero dependency on CLI framework.
2. Commands are thin wrappers: parse args, call core, format output.
3. All output goes through formatters — never print raw data.
4. Exit codes follow conventions: 0 success, 1 error, 2 usage error.

## Quality Assurance Pipeline

```bash
<YOUR_LINT_COMMAND> && <YOUR_TYPECHECK_COMMAND> && <YOUR_TEST_COMMAND>
```

## Version Roadmap

See `roadmap/` for per-version checklists.

- roadmap/v0.1.md — CLI Skeleton & Core Commands
- roadmap/v0.2.md — Input/Output Handling
- roadmap/v0.3.md — Error Handling & Edge Cases
- roadmap/v1.0.md — Stable Release & Distribution
"""

_LIBRARY = """\
# VISION: <YOUR_PROJECT_NAME>

## Identity

**<YOUR_PROJECT_NAME>** — <YOUR_ONE_LINE_DESCRIPTION>

A library that provides a clean, well-documented API for other
developers to build upon.

## Core Principles

1. **API Stability**: Public interfaces change only at major versions.
   Deprecation before removal.
2. **Zero Surprises**: Functions do what their names say. Side effects
   are explicit and documented.
3. **Minimal Dependencies**: Every dependency is a liability. Prefer
   standard library solutions.
4. **Type-Safe**: Complete type annotations on all public APIs.
   Consumers get full IDE support.

## Architecture

<YOUR_ARCHITECTURE_DESCRIPTION>

### Directory Structure

```
<your-project>/
├── src/<package>/
│   ├── __init__.py   # Public API surface
│   ├── core.py       # Core implementation
│   ├── types.py      # Public types and protocols
│   └── _internal/    # Private implementation details
├── tests/
│   ├── test_public_api.py   # Test the public interface
│   └── test_internals.py    # Test implementation details
├── docs/             # API documentation
└── examples/         # Usage examples
```

### Architecture Rules

1. Public API is defined in `__init__.py` — everything else is internal.
2. Internal modules use `_` prefix and are not part of the public contract.
3. No circular imports between modules.
4. All public functions have docstrings with examples.

## Quality Assurance Pipeline

```bash
<YOUR_LINT_COMMAND> && <YOUR_TYPECHECK_COMMAND> && <YOUR_TEST_COMMAND>
```

## Version Roadmap

See `roadmap/` for per-version checklists.

- roadmap/v0.1.md — Core API Design & Types
- roadmap/v0.2.md — Implementation & Unit Tests
- roadmap/v0.3.md — Documentation & Examples
- roadmap/v1.0.md — Stable Public API
"""

_TEMPLATES: dict[str, str] = {
    "generic": _GENERIC,
    "web-app": _WEB_APP,
    "cli-tool": _CLI_TOOL,
    "library": _LIBRARY,
}


def get_template(name: str | None = None) -> str:
    """Return a VISION.md template by name.

    Args:
        name: Template name (``"generic"``, ``"web-app"``, ``"cli-tool"``,
              ``"library"``).  ``None`` returns the generic template.

    Returns:
        Template content as a string with ``<YOUR_...>`` placeholders.

    Raises:
        ValueError: If *name* is not a recognised template name.
    """
    key = (name or "generic").lower()
    if key not in _TEMPLATES:
        available = ", ".join(sorted(_TEMPLATES))
        msg = f"Unknown template {name!r}. Available: {available}"
        raise ValueError(msg)
    return _TEMPLATES[key]


def list_templates() -> tuple[str, ...]:
    """Return available template names (excluding ``"generic"``).

    Returns:
        Sorted tuple of template names.
    """
    return tuple(sorted(k for k in _TEMPLATES if k != "generic"))
