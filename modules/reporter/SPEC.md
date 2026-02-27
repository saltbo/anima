# Reporter — Specification

## Overview

The reporter persists complete iteration records as structured JSON files
in the `iterations/` directory. It also provides read access to recent
records, enabling the planner to learn from history.

## Class: `Reporter`

### Constructor

```python
def __init__(self, fs: FileSystemPort) -> None
```

The FileSystemPort handles all file I/O — the reporter contains only
serialization and deserialization logic.

### Methods

#### `save_record`

```python
def save_record(self, record: IterationRecord) -> str
```

Serializes the record to JSON and writes it to
`iterations/{record.iteration_id}.json`.

Returns the file path where the record was saved.

**Behavior:**
1. Create `iterations/` directory if it doesn't exist (via `fs.make_directory`).
2. Check if the file already exists (via `fs.file_exists`). If so, raise
   `ValueError(f"Record already exists: {record.iteration_id}")`.
3. Convert the `IterationRecord` to a JSON-serializable dict.
4. Write the JSON string (indented with 2 spaces) via `fs.write_file`.
5. Return the file path.

#### `load_recent_records`

```python
def load_recent_records(self, count: int) -> list[IterationRecord]
```

Reads up to `count` iteration records from `iterations/`, sorted by
timestamp (newest first).

**Behavior:**
1. List all `.json` files in `iterations/` via `fs.list_files`.
2. Read and deserialize each file into an `IterationRecord`.
3. Sort by `record.timestamp` descending.
4. Return the first `count` items.
5. If any file fails to deserialize, skip it (log the error in the
   record's `notes` field is not applicable here — simply skip).

## Serialization Format

All domain models use `@dataclass(frozen=True)`, so serialization uses
`dataclasses.asdict()` to convert to a dict, then `json.dumps()`.

For deserialization, the reporter reconstructs dataclass instances from
the JSON dicts. Enum values are stored as their `.value` strings and
reconstructed via the enum class.

### JSON Structure

```json
{
  "iteration_id": "iter-0001-20260227-120000",
  "timestamp": "2026-02-27T12:00:00Z",
  "gap_addressed": {
    "category": "roadmap",
    "description": "...",
    "priority": "high",
    "roadmap_version": "v0.1",
    "evidence": "..."
  },
  "plan": { "..." },
  "execution": { "..." },
  "verification": { "..." },
  "outcome": "success",
  "duration_seconds": 42.5,
  "notes": ""
}
```

Enum fields (`Priority`, `IterationOutcome`, `VerificationStatus`) are
serialized as their string values (e.g., `"high"`, `"success"`, `"passed"`).

## Edge Cases

- **Empty iterations/ directory**: `load_recent_records` returns `[]`.
- **iterations/ doesn't exist**: `load_recent_records` returns `[]`
  (the directory is created on first `save_record`).
- **Duplicate iteration_id**: `save_record` raises `ValueError`.
- **Corrupted JSON file**: `load_recent_records` skips the file silently.
- **count = 0**: Returns `[]`.
- **count > available records**: Returns all available records.

## Test Requirements

1. Save a record → file is created at correct path with valid JSON.
2. Load recent records → returns records sorted by timestamp descending.
3. Save duplicate → raises ValueError.
4. Load from empty directory → returns empty list.
5. Round-trip: save then load → record fields match original.
6. Enum serialization: Priority, IterationOutcome stored as strings.
7. Enum deserialization: strings reconstructed to correct enum values.
8. count parameter respected: load 2 from 5 → returns exactly 2.
