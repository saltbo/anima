# Docgen — v1.0 Spec

Generate project documentation from the system's own specs.

## Behavior

### generate(project_root)

1. Read `VISION.md` from `project_root` (empty string if missing).
2. Read `SOUL.md` from `project_root` (empty string if missing).
3. Scan `modules/` for subdirectories. For each:
   - Read `CONTRACT.md` (empty string if missing).
   - Read `SPEC.md` (empty string if missing).
   - Skip directories starting with `.` or `__`.
   - Create a `ModuleDoc(name, contract, spec)`.
4. Read `domain/models.py` (empty string if missing).
5. Read `domain/ports.py` (empty string if missing).
6. Return `DocBundle` with all collected content.
7. Sort modules alphabetically by name.

### render(bundle)

Produce three documentation files:

1. **docs/index.md** — Project overview:
   - Title and identity extracted from VISION.md first heading
   - Core principles from SOUL.md
   - Table of modules with completeness indicators
   - Links to other doc pages

2. **docs/architecture.md** — Architecture reference:
   - Full architecture section from VISION.md
   - Domain model listing (class names and docstrings)
   - Domain ports listing (Protocol names and docstrings)

3. **docs/modules.md** — Module reference:
   - For each module: heading, CONTRACT.md content, SPEC.md content
   - Modules sorted alphabetically

## v1.0 Scope

- Direct filesystem reads (no FileSystemPort injection).
- Markdown output only.
- Static generation (no incremental updates).

## Not in v1.0

- HTML output or static site generation.
- Cross-referencing between modules.
- API documentation from Python docstrings (beyond what's in source files).
