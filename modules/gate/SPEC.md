# Gate Module — Spec v0.6

## Risk Classification

`classify_risk(prompt: str) -> GateDecision`

Scans the agent prompt for high-risk indicators. A plan is HIGH risk
if any of these patterns appear in the prompt:

1. **Domain type changes** — prompt targets `domain/models.py` or
   `domain/ports.py` modifications
2. **Wiring changes** — prompt targets `wiring.py` modifications
3. **File deletion** — prompt mentions deleting or removing files
4. **Multi-module rewrite** — prompt targets rewriting 3+ modules

If no indicators match, the plan is LOW risk and `gated=False`.

Pattern matching is case-insensitive and uses simple substring/regex
checks on the prompt text.

## Gate State Management

Gate state is stored in `.anima/`:

- `gate_pending.json` — written when a high-risk plan is detected.
  Contains `{gaps_summary, risk_indicators, timestamp}`.
- `gate_bypass` — marker file written by `approve_iteration()`.
  Signals that one execution should proceed without risk checking.
  Deleted after the bypass is consumed.

### Functions

- `is_gate_pending(anima_dir: Path) -> bool` — check if gate file exists
- `is_gate_bypassed(anima_dir: Path) -> bool` — check if bypass marker exists
- `write_gate(anima_dir: Path, gaps_summary: str, indicators: tuple[str, ...]) -> None`
- `clear_gate(anima_dir: Path) -> None` — remove gate file + write bypass marker
- `consume_bypass(anima_dir: Path) -> bool` — remove bypass marker, return True if it existed
