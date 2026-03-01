"""Claude Code CLI subprocess adapter with stream-json I/O.

Uses --input-format stream-json + --output-format stream-json to maintain
a single long-lived process.  Messages are sent as JSON via stdin;
responses are streamed back as NDJSON on stdout.
"""

import asyncio
import json
import logging
import os
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any, cast

from anima.domain.models import StreamEvent

logger = logging.getLogger(__name__)


class ClaudeAdapter:
    """Manages a long-lived Claude CLI subprocess with stream-json I/O."""

    def __init__(
        self,
        system_prompt: str,
        model: str = "sonnet",
    ) -> None:
        self._system_prompt = system_prompt
        self._model = model
        self._process: asyncio.subprocess.Process | None = None
        self._project_dir: Path | None = None
        self._stdout_reader: asyncio.StreamReader | None = None

    @property
    def is_running(self) -> bool:
        """Check if the subprocess is alive."""
        return self._process is not None and self._process.returncode is None

    async def start(self, project_dir: Path) -> None:
        """Start the Claude CLI subprocess."""
        self._project_dir = project_dir
        logger.info("Starting ClaudeAdapter for %s", project_dir)
        await self._spawn_process()

    async def _spawn_process(self) -> None:
        """Spawn the Claude CLI process."""
        if self._project_dir is None:
            msg = "project_dir not set; call start() first"
            raise RuntimeError(msg)

        cmd: list[str] = [
            "claude",
            "--verbose",
            "--input-format",
            "stream-json",
            "--output-format",
            "stream-json",
            "--dangerously-skip-permissions",
            "--model",
            self._model,
            "--system-prompt",
            self._system_prompt,
        ]

        # Strip CLAUDE* env vars to allow nested invocation
        env = {k: v for k, v in os.environ.items() if not k.startswith("CLAUDE")}

        logger.info("Spawning claude process")
        self._process = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=self._project_dir,
            env=env,
        )
        self._stdout_reader = self._process.stdout
        logger.info("Process spawned, pid=%s", self._process.pid)

    async def send(self, message: str) -> AsyncIterator[StreamEvent]:
        """Send a message via stream-json and yield response events."""
        if not self.is_running:
            logger.warning("Process not running, respawning")
            await self._spawn_process()

        assert self._process is not None
        assert self._process.stdin is not None
        assert self._stdout_reader is not None

        # Send as stream-json user message
        payload = json.dumps(
            {
                "type": "user",
                "message": {"role": "user", "content": message},
            }
        )
        logger.info("Sending message (%d chars): %.100s", len(message), message)
        self._process.stdin.write((payload + "\n").encode())
        await self._process.stdin.drain()
        logger.debug("Message written to stdin")

        # Read response events until result
        async for event in self._read_events():
            yield event
            if event.type == "result":
                return

    async def _read_events(self) -> AsyncIterator[StreamEvent]:
        """Read NDJSON lines from stdout and yield StreamEvents."""
        assert self._stdout_reader is not None
        while True:
            line = await self._stdout_reader.readline()
            if not line:
                logger.warning("stdout EOF")
                break
            text = line.decode().strip()
            if not text:
                continue
            try:
                data: dict[str, object] = json.loads(text)
            except json.JSONDecodeError:
                logger.debug("Non-JSON line: %s", text)
                continue

            event = self._parse_event(data)
            if event.content:
                logger.debug(
                    "Event type=%s content_len=%d",
                    event.type,
                    len(event.content),
                )
            else:
                logger.debug(
                    "Event type=%s content_len=0 raw=%s",
                    event.type,
                    json.dumps(data, default=str)[:300],
                )
            yield event
            if event.type == "result":
                return

    def _parse_event(self, data: dict[str, object]) -> StreamEvent:
        """Parse a JSON object into a StreamEvent."""
        event_type = str(data.get("type", "unknown"))
        content = _extract_content(data, event_type)
        return StreamEvent(type=event_type, content=content, raw=data)

    async def stop(self) -> None:
        """Terminate the subprocess."""
        if self._process is not None and self._process.returncode is None:
            logger.info("Stopping process pid=%s", self._process.pid)
            self._process.terminate()
            try:
                await asyncio.wait_for(self._process.wait(), timeout=5.0)
            except TimeoutError:
                self._process.kill()
                await self._process.wait()
        self._process = None
        self._stdout_reader = None


def _get(d: object, key: str) -> Any:
    """Safely get a value from a dict-like object."""
    if isinstance(d, dict):
        return d.get(key)  # type: ignore[union-attr]
    return None


def _extract_content(data: dict[str, object], event_type: str) -> str:
    """Extract displayable content from a stream-json event."""
    if event_type == "assistant":
        return _extract_assistant(data)
    if event_type == "user":
        return _extract_tool_results(data)
    if event_type == "system":
        subtype = _get(data, "subtype")
        if subtype == "init":
            return "[system] Session initialized"
        return ""
    if event_type == "content_block_delta":
        delta = _get(data, "delta")
        text_val = _get(delta, "text")
        if isinstance(text_val, str):
            return text_val
        thinking_val = _get(delta, "thinking")
        if isinstance(thinking_val, str) and thinking_val:
            return f"[thinking] {thinking_val}"
    if event_type == "result":
        result_val = _get(data, "result")
        if isinstance(result_val, str):
            return result_val
    return ""


def _extract_assistant(data: dict[str, object]) -> str:
    """Extract content from an assistant event."""
    message = _get(data, "message")
    content_blocks: Any = _get(message, "content")
    if not isinstance(content_blocks, list):
        return ""
    parts: list[str] = []
    blocks = cast(list[Any], content_blocks)
    for block in blocks:
        btype = _get(block, "type")
        if btype == "text":
            text_val = _get(block, "text")
            if isinstance(text_val, str):
                parts.append(text_val)
        elif btype == "thinking":
            thinking = _get(block, "thinking")
            if isinstance(thinking, str) and thinking:
                parts.append(f"[thinking] {thinking}")
        elif btype == "tool_use":
            name = _get(block, "name") or "tool"
            inp: Any = _get(block, "input") or {}
            if name == "TodoWrite":
                todos_json = json.dumps(inp)
                parts.append(f"[todo:update] {todos_json}")
            else:
                summary = _summarize_tool(str(name), inp)
                parts.append(f"[tool:call] {name}: {summary}")
    return "\n".join(parts)


def _extract_tool_results(data: dict[str, object]) -> str:
    """Extract content from a user event (tool results)."""
    message = _get(data, "message")
    content_blocks: Any = _get(message, "content")
    if not isinstance(content_blocks, list):
        return ""
    parts: list[str] = []
    blocks = cast(list[Any], content_blocks)
    for block in blocks:
        btype = _get(block, "type")
        if btype == "tool_result":
            is_error = _get(block, "is_error")
            content_val = _get(block, "content")
            raw = str(content_val) if content_val else ""
            summary = _summarize_result(raw)
            if is_error:
                parts.append(f"[tool:error] {summary}")
            else:
                parts.append(f"[tool:done] {summary}")
    return "\n".join(parts)


def _summarize_result(raw: str) -> str:
    """Build a short, clean summary of a tool result."""
    if not raw:
        return "OK"
    # Strip leading/trailing whitespace
    text = raw.strip()
    # Take only the first line
    first_line = text.split("\n", 1)[0].strip()
    # Strip line-number prefixes like "     1→..."
    if "→" in first_line:
        first_line = first_line.split("→", 1)[1].strip()
    # Count total lines for context
    total_lines = text.count("\n") + 1
    if total_lines > 1:
        if len(first_line) > 80:
            first_line = first_line[:80] + "..."
        return f"{first_line}  ({total_lines} lines)"
    if len(first_line) > 120:
        first_line = first_line[:120] + "..."
    return first_line


def _summarize_tool(name: str, inp: Any) -> str:
    """Build a short summary of a tool invocation."""
    if not isinstance(inp, dict):
        return ""
    d = cast(dict[str, Any], inp)
    if name in ("Read", "Write", "Edit"):
        return str(d.get("file_path", ""))
    if name == "Bash":
        cmd = str(d.get("command", ""))
        return cmd[:120]
    if name == "Glob":
        return str(d.get("pattern", ""))
    if name == "Grep":
        return f"/{d.get('pattern', '')}/"
    for v in d.values():
        if isinstance(v, str) and v:
            return v[:80]
    return ""
