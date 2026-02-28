# Docgen — Contract

## Purpose

Generate comprehensive project documentation from the system's own
specification files (CONTRACT.md, SPEC.md, VISION.md, SOUL.md, domain sources).

## Interface

```python
def generate(project_root: str) -> DocBundle
def render(bundle: DocBundle) -> dict[str, str]
```

## Input

| Parameter      | Type  | Description                       |
|----------------|-------|-----------------------------------|
| `project_root` | `str` | Absolute path to the project root |

## Output

`generate()` returns a `DocBundle` dataclass containing:

- `vision` — raw VISION.md content
- `soul` — raw SOUL.md content
- `modules` — tuple of `ModuleDoc` (name, contract text, spec text)
- `domain_models_source` — domain/models.py content
- `domain_ports_source` — domain/ports.py content

`render()` returns a `dict[str, str]` mapping relative file paths to
generated markdown content:

- `docs/index.md` — project overview and navigation
- `docs/architecture.md` — architecture reference
- `docs/modules.md` — module reference (all CONTRACT + SPEC)

## Dependencies

None. Uses only `os` and `pathlib` from the standard library.

## Constraints

1. Must not modify any source files — documentation generation is read-only.
2. Missing files (no CONTRACT.md, no SPEC.md) are represented as empty strings.
3. Modules are sorted alphabetically by name.
4. Output is deterministic for the same input.
