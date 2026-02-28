# Gate Module — Contract

## Purpose

Classify iteration plans by risk level and manage gating state.
High-risk plans pause execution until a human approves via `anima approve`.

## Input

- `prompt: str` — the full agent prompt for the iteration
- Gate state files in `.anima/` directory

## Output

- `GateDecision` — whether the plan is gated, its risk level, and
  which indicators triggered

## Dependencies

- `domain.models.RiskLevel`, `domain.models.GateDecision`
- File system access for gate state files (`.anima/gate_pending.json`,
  `.anima/gate_bypass`)

## Constraints

- Risk classification is a pure function (no I/O)
- Gate file I/O is in separate functions
- Must not import from kernel/ or adapters/
