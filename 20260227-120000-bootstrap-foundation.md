# Bootstrap project foundation

## What
Create pyproject.toml, pyrightconfig.json, and the domain layer (models.py + ports.py)
as the first structural foundation for Anima.

## Why
Everything else depends on the domain types and quality toolchain being in place.
Without pyproject.toml there is no ruff/pytest config. Without domain/models.py
and domain/ports.py, modules have no types to work with and no Ports to depend on.

## Priority
high

## Constraints
- domain/ must have ZERO external imports (only stdlib + typing)
- Use @dataclass(frozen=True) for all domain models
- Use typing.Protocol for all port interfaces
- pyproject.toml must configure ruff (strict), pytest (cov>=80), and project metadata
- pyrightconfig.json must enable strict mode
