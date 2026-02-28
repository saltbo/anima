# Vision Templates — Contract

## Purpose

Provide VISION.md starter templates for common project types. Templates
give humans a structured starting point to describe their project's
identity, principles, architecture, and roadmap.

## Interface

```python
def get_template(name: str | None = None) -> str
def list_templates() -> tuple[str, ...]
```

## Input

| Parameter | Type           | Description                                         |
|-----------|----------------|-----------------------------------------------------|
| `name`    | `str \| None`  | Template name, or None for the generic template      |

## Output

- `get_template` — returns the template content as a string
- `list_templates` — returns available template names (excludes generic)

## Dependencies

None. Pure string operations, no external imports.

## Constraints

1. Templates are plain Markdown strings with placeholder markers.
2. Placeholder format: `<YOUR_...>` (e.g. `<YOUR_PROJECT_NAME>`).
3. `get_template(None)` and `get_template("generic")` return the same template.
4. Unknown template names raise `ValueError`.
5. Available templates: `generic`, `web-app`, `cli-tool`, `library`.
6. Pure functions — no file I/O.
