# Benchmark #2: REST API with Database — Bookmark Service

## Goal

Prove that Anima's pipeline can take a project specification and produce a
working REST API application with database persistence through autonomous
iteration.

## Application Spec

A bookmark management REST API called `linkr` that stores and retrieves
web bookmarks with SQLite persistence.

### Endpoints

| Method | Path | Description | Example |
|--------|------|-------------|---------|
| `POST /bookmarks` | Create bookmark | `{"url": "...", "title": "..."}` |
| `GET /bookmarks` | List all bookmarks | Returns JSON array |
| `GET /bookmarks/{id}` | Get single bookmark | Returns JSON object |
| `PUT /bookmarks/{id}` | Update bookmark | `{"url": "...", "title": "..."}` |
| `DELETE /bookmarks/{id}` | Delete bookmark | Returns 204 |

### Data Model

Each bookmark has:
- `id` (int) — auto-incrementing identifier
- `url` (str) — the bookmark URL
- `title` (str) — bookmark title
- `created_at` (str) — ISO 8601 timestamp

### Persistence

Bookmarks are stored in a SQLite database (`linkr.db`).

### Project Structure

```
linkr/
├── pyproject.toml        # Project metadata, dependencies
├── src/
│   └── linkr/
│       ├── __init__.py
│       ├── app.py        # Application factory and route definitions
│       ├── models.py     # Bookmark dataclass / model
│       └── database.py   # SQLite connection and queries
└── tests/
    ├── __init__.py
    ├── test_app.py
    ├── test_models.py
    └── test_database.py
```

### Quality Requirements

- Python 3.12+
- Type annotations on all functions
- Any ASGI/WSGI framework (FastAPI, Flask, Starlette, etc.)
- `@dataclass` for the Bookmark model
- SQLite for database (no external DB servers)
- Tests with pytest
- Passes ruff linting

## Validation Criteria

1. **Project structure** — required files and directories exist
2. **Application entry point** — app module with route definitions exists
3. **Data model** — Bookmark dataclass with required fields
4. **CRUD endpoints** — POST, GET list, GET detail, PUT, DELETE implemented
5. **Database layer** — SQLite-based database module exists
6. **HTTP framework** — uses a recognized web framework
7. **Test coverage** — test files exist for each source module
8. **Type annotations** — source files contain type annotations
