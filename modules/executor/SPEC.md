# Executor — v0.1 Spec

Seed-equivalent implementation: invoke the AI agent CLI and capture results.

## Behavior

1. Accept a prompt string and a `dry_run` flag.
2. **Dry-run mode**: print the prompt (truncated to 3000 chars) and return success without executing.
3. **Normal mode**:
   a. Save the prompt to `.anima/current_prompt.txt`.
   b. Invoke the agent command (`claude` by default) with `--print --verbose --dangerously-skip-permissions --output-format stream-json --include-partial-messages`.
   c. Pipe the prompt via stdin.
   d. Parse NDJSON stream events in real-time:
      - Display text deltas as they arrive.
      - Show tool use summaries (`[ToolName] brief_info`).
      - Extract cost and token metrics from the `result` event.
   e. Return structured result with success, output, errors, exit_code, elapsed time, cost, and tokens.
4. Handle `FileNotFoundError` (agent not installed) gracefully.
5. Handle timeout (600s) gracefully.
6. Handle `KeyboardInterrupt` by terminating the agent process and re-raising.

## v0.1 Scope

- Direct `subprocess.Popen` invocation (no `AgentPort` injection).
- Hardcoded to Claude Code CLI with stream-json output.
- Returns a plain dict matching `ExecutionResult` fields.

## Not in v0.1

- `AgentPort` abstraction for multiple agent backends (deferred to v0.4).
- Returning typed `ExecutionResult` dataclass (seed returns dict).
- Configurable timeout or agent command.
