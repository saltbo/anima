# Reporter Contract

## Purpose

Persists a complete iteration record as a structured JSON file in the iterations/ directory.

## Input

- `record: IterationRecord` — The complete iteration record containing gap, plan, execution, verification, and outcome.

## Output

- `str` — The file path where the record was saved.

## Dependencies

- `FileSystemPort` — To write JSON files to the iterations/ directory.

## Constraints

- Must write records to `iterations/<iteration_id>.json`.
- Must serialize the full `IterationRecord` to valid JSON with proper formatting.
- Must create the iterations/ directory if it doesn't exist.
- Must be able to load and return recent records sorted by timestamp (newest first).
- Must never overwrite an existing record — iteration IDs are unique.
- core.py must only import from `domain/`.
