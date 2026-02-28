"""ClaudeCodeAdapter — AgentPort implementation for Claude Code CLI.

Encapsulates subprocess management, NDJSON stream parsing, cost/token
extraction, and real-time output display for the Claude Code agent.
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
import time
from datetime import UTC, datetime
from typing import Any

from domain.models import ExecutionResult, QuotaState, QuotaStatus
from kernel.config import AGENT_CMD, ROOT

logger = logging.getLogger("anima.adapters.agents")

_DEFAULT_TIMEOUT = 600  # seconds

_EXHAUSTION_PATTERNS = (
    "quota exceeded",
    "quota exhausted",
    "billing",
    "spending limit",
    "usage limit",
    "out of usage",
    "out of extra usage",
)
_RATE_LIMIT_PATTERNS = ("rate limit", "rate_limit", "429", "too many requests", "overloaded")


def _summarize_tool_input(tool_name: str, raw_json: str) -> str:
    """Extract a brief summary from tool input JSON for display."""
    try:
        inp = json.loads(raw_json)
    except (json.JSONDecodeError, ValueError):
        return ""
    if tool_name == "Read":
        return inp.get("file_path", "")
    if tool_name in ("Write", "Edit"):
        return inp.get("file_path", "")
    if tool_name == "Bash":
        cmd = inp.get("command", "")
        return cmd[:120] if cmd else ""
    if tool_name == "Glob":
        return inp.get("pattern", "")
    if tool_name == "Grep":
        return f"/{inp.get('pattern', '')}/"
    if tool_name == "TodoWrite":
        todos = inp.get("todos", [])
        if todos:
            first = todos[0] if isinstance(todos[0], str) else todos[0].get("content", "")
            return f"({len(todos)} items) {first[:60]}"
        return ""
    for v in inp.values():
        if isinstance(v, str) and v:
            return v[:80]
    return ""


class ClaudeCodeAdapter:
    """AgentPort implementation that invokes the Claude Code CLI.

    Satisfies ``domain.ports.AgentPort`` via structural subtyping (PEP 544).
    """

    def __init__(self, *, timeout: int = _DEFAULT_TIMEOUT) -> None:
        self._timeout = timeout

    def execute(self, prompt: str) -> ExecutionResult:
        """Execute a prompt via the Claude Code CLI and return structured results.

        Streams NDJSON events in real-time, extracting text deltas and
        tool-use summaries.  Captures cost and token metrics from the
        ``result`` event.
        """
        logger.info("Calling %s (streaming)...", AGENT_CMD)
        start_time = time.time()

        # Remove CLAUDE* env vars to allow nested invocation in --print mode
        env = {k: v for k, v in os.environ.items() if not k.startswith("CLAUDE")}

        try:
            proc = subprocess.Popen(
                [
                    AGENT_CMD,
                    "--print",
                    "--verbose",
                    "--dangerously-skip-permissions",
                    "--output-format",
                    "stream-json",
                    "--include-partial-messages",
                ],
                cwd=ROOT,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                env=env,
            )
            assert proc.stdin is not None
            proc.stdin.write(prompt)
            proc.stdin.close()
        except FileNotFoundError:
            return ExecutionResult(
                success=False,
                output="",
                errors=(
                    f"Agent command '{AGENT_CMD}' not found. "
                    "Install it or update AGENT_CMD in kernel/config.py."
                ),
                exit_code=-1,
                elapsed_seconds=0.0,
            )

        result_text, cost, total_tokens, stream_quota_state, stream_error = self._stream_output(proc)
        elapsed = time.time() - start_time

        assert proc.stderr is not None
        stderr_output = proc.stderr.read()
        if stderr_output:
            logger.debug("Agent stderr: %s", stderr_output[:500])

        combined = (result_text + " " + stderr_output).lower()
        quota_state = stream_quota_state or self._detect_quota_state(combined, proc.returncode or 0)
        if quota_state is not None:
            logger.warning(
                "Quota signal detected: %s — %s", quota_state.status.value, quota_state.message
            )

        errors = stderr_output[-2000:] if stderr_output else ""
        if not errors and stream_error:
            errors = stream_error[-2000:]
        if not errors and proc.returncode not in (None, 0):
            # Claude CLI often prints user-facing failure text on stdout.
            errors = (result_text or "agent execution failed")[-2000:]

        return ExecutionResult(
            success=proc.returncode == 0,
            output=result_text[-5000:] if result_text else "",
            errors=errors,
            exit_code=proc.returncode if proc.returncode is not None else -1,
            elapsed_seconds=round(elapsed, 1),
            cost_usd=cost,
            total_tokens=total_tokens,
            quota_state=quota_state,
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _stream_output(
        self, proc: subprocess.Popen[str]
    ) -> tuple[str, float, int, QuotaState | None, str]:
        """Parse NDJSON stream, display events, return (result_text, cost, tokens).

        Raises ``KeyboardInterrupt`` after terminating the subprocess if
        the user interrupts.
        """
        result_text = ""
        current_tool: str | None = None
        tool_input_chunks: list[str] = []
        cost = 0.0
        total_tokens = 0
        quota_state: QuotaState | None = None
        stream_error = ""

        try:
            assert proc.stdout is not None
            for line in iter(proc.stdout.readline, ""):
                line = line.strip()
                if not line:
                    continue
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    continue

                etype = event.get("type", "")

                if etype == "stream_event":
                    current_tool, tool_input_chunks = self._handle_stream_event(
                        event.get("event", {}), current_tool, tool_input_chunks
                    )
                elif etype == "rate_limit_event":
                    quota_state = self._parse_rate_limit_event(event)

                elif etype == "result":
                    result_text = event.get("result", "")
                    if event.get("is_error") is True:
                        stream_error = str(result_text or "")
                        error_code = str(event.get("error", "")).lower()
                        if "rate_limit" in error_code and quota_state is None:
                            quota_state = QuotaState(
                                status=QuotaStatus.RATE_LIMITED,
                                retry_after_seconds=60.0,
                                message="Detected structured result error: rate_limit",
                            )
                    cost = event.get("total_cost_usd", 0)
                    duration = event.get("duration_ms", 0)
                    usage = event.get("usage", {})
                    input_tokens = usage.get("input_tokens", 0)
                    output_tokens = usage.get("output_tokens", 0)
                    cache_read = usage.get("cache_read_input_tokens", 0)
                    cache_creation = usage.get("cache_creation_input_tokens", 0)
                    total_tokens = input_tokens + output_tokens + cache_read + cache_creation
                    logger.info(
                        "Done in %.1fs, cost: $%.4f, tokens: %d",
                        duration / 1000,
                        cost,
                        total_tokens,
                    )

            print()  # newline after streaming
            proc.wait(timeout=self._timeout)

        except KeyboardInterrupt:
            logger.warning("Interrupted — killing agent process...")
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()
            raise

        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
            return "", 0.0, 0, None, ""

        return result_text, cost, total_tokens, quota_state, stream_error

    @staticmethod
    def _detect_quota_state(combined_output: str, exit_code: int) -> QuotaState | None:
        """Detect rate-limit or quota-exhaustion signals from agent output.

        Scans the combined stdout+stderr (lowercased) for known patterns
        returned by the Anthropic API and Claude CLI.
        """
        for pattern in _EXHAUSTION_PATTERNS:
            if pattern in combined_output:
                return QuotaState(
                    status=QuotaStatus.QUOTA_EXHAUSTED,
                    message=f"Detected: {pattern}",
                )

        for pattern in _RATE_LIMIT_PATTERNS:
            if pattern in combined_output:
                return QuotaState(
                    status=QuotaStatus.RATE_LIMITED,
                    retry_after_seconds=60.0,
                    message=f"Detected: {pattern}",
                )

        return None

    @staticmethod
    def _format_reset_time(resets_at: int | float | None) -> str | None:
        """Format a reset timestamp into a concise UTC string."""
        if resets_at is None:
            return None
        try:
            dt = datetime.fromtimestamp(float(resets_at), tz=UTC)
        except (TypeError, ValueError, OSError):
            return None
        return dt.strftime("%Y-%m-%d %H:%M UTC")

    @classmethod
    def _parse_rate_limit_event(cls, event: dict[str, Any]) -> QuotaState | None:
        """Parse a structured rate_limit_event payload into QuotaState."""
        info = event.get("rate_limit_info")
        if not isinstance(info, dict):
            return None

        status = str(info.get("status", "")).lower()
        rl_type = str(info.get("rateLimitType", "")).lower()
        overage_status = str(info.get("overageStatus", "")).lower()
        resets_at = info.get("resetsAt")
        reset_text = cls._format_reset_time(resets_at)

        if status == "rejected" and overage_status in ("rejected", "disabled"):
            retry_after: float | None = None
            if isinstance(resets_at, (int, float)):
                retry_after = max(0.0, float(resets_at) - time.time())
            message = "Detected structured rate_limit_event: quota exhausted"
            if reset_text:
                message = f"{message}; resets {reset_text}"
            return QuotaState(
                status=QuotaStatus.QUOTA_EXHAUSTED,
                retry_after_seconds=retry_after if retry_after and retry_after > 0 else None,
                message=message,
            )

        if status in ("limited", "rejected") or rl_type:
            retry_after: float | None = None
            if isinstance(resets_at, (int, float)):
                retry_after = max(0.0, float(resets_at) - time.time())
            message = "Detected structured rate_limit_event: rate limited"
            if reset_text:
                message = f"{message}; resets {reset_text}"
            return QuotaState(
                status=QuotaStatus.RATE_LIMITED,
                retry_after_seconds=retry_after if retry_after and retry_after > 0 else 60.0,
                message=message,
            )

        return None

    @staticmethod
    def _handle_stream_event(
        inner: dict[str, Any],
        current_tool: str | None,
        tool_input_chunks: list[str],
    ) -> tuple[str | None, list[str]]:
        """Process a single stream_event, printing output as it arrives."""
        inner_type = inner.get("type", "")

        if inner_type == "content_block_delta":
            delta: dict[str, Any] = inner.get("delta") or {}
            delta_type: str = delta.get("type", "")
            if delta_type == "text_delta":
                text: str = delta.get("text", "")
                print(text, end="", flush=True)
            elif delta_type == "input_json_delta":
                partial: str = delta.get("partial_json", "")
                tool_input_chunks.append(partial)

        elif inner_type == "content_block_start":
            block: dict[str, Any] = inner.get("content_block") or {}
            block_type: str = block.get("type", "")
            if block_type == "tool_use":
                print("", flush=True)
                current_tool = str(block.get("name", "unknown"))
                tool_input_chunks = []
            elif block_type == "text":
                print("", flush=True)

        elif inner_type == "content_block_stop":
            if current_tool:
                summary = _summarize_tool_input(current_tool, "".join(tool_input_chunks))
                print(f"  \u25b6 [{current_tool}] {summary}", flush=True)
                current_tool = None
                tool_input_chunks = []

        return current_tool, tool_input_chunks
