"""Claude Code CLI subprocess adapter with stream-json parsing."""

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any, cast

from anima.domain.models import StreamEvent

logger = logging.getLogger(__name__)


class ClaudeAdapter:
    """Manages a Claude CLI subprocess with stream-json output."""

    def __init__(
        self,
        system_prompt: str,
        model: str = "sonnet",
    ) -> None:
        self._system_prompt = system_prompt
        self._model = model
        self._process: asyncio.subprocess.Process | None = None
        self._session_id: str | None = None
        self._project_dir: Path | None = None

    @property
    def is_running(self) -> bool:
        """Check if the subprocess is alive."""
        return self._process is not None and self._process.returncode is None

    async def start(self, project_dir: Path) -> None:
        """Start the Claude CLI subprocess."""
        self._project_dir = project_dir
        await self._spawn_process()

    async def _spawn_process(self) -> None:
        """Spawn or respawn the Claude CLI process."""
        if self._project_dir is None:
            msg = "project_dir not set; call start() first"
            raise RuntimeError(msg)

        cmd: list[str] = [
            "claude",
            "--output-format",
            "stream-json",
            "--verbose",
            "--dangerously-skip-permissions",
            "--model",
            self._model,
            "--append-system-prompt",
            self._system_prompt,
        ]
        if self._session_id is not None:
            cmd.extend(["--resume", self._session_id])

        self._process = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=self._project_dir,
        )

    async def send(self, message: str) -> AsyncIterator[StreamEvent]:
        """Send a message and yield stream events.

        If the interactive stdin mode fails (known bug), falls back to
        spawning a new process per message with -p flag.
        """
        if not self.is_running:
            await self._spawn_process()

        assert self._process is not None
        assert self._process.stdin is not None
        assert self._process.stdout is not None

        # Try interactive mode first
        try:
            self._process.stdin.write((message + "\n").encode())
            await self._process.stdin.drain()

            async for event in self._read_events(self._process.stdout):
                yield event
                if event.type == "result":
                    # Capture session ID for resume
                    session = event.raw.get("session_id")
                    if isinstance(session, str):
                        self._session_id = session
                    return
        except (BrokenPipeError, ConnectionResetError, OSError):
            logger.warning("Interactive mode failed, falling back to -p mode")
            async for event in self._fallback_send(message):
                yield event

    async def _fallback_send(self, message: str) -> AsyncIterator[StreamEvent]:
        """Fallback: spawn a new process per message with -p flag."""
        if self._project_dir is None:
            msg = "project_dir not set"
            raise RuntimeError(msg)

        cmd: list[str] = [
            "claude",
            "-p",
            message,
            "--output-format",
            "stream-json",
            "--verbose",
            "--dangerously-skip-permissions",
            "--model",
            self._model,
            "--append-system-prompt",
            self._system_prompt,
        ]
        if self._session_id is not None:
            cmd.extend(["--resume", self._session_id])

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=self._project_dir,
        )
        assert proc.stdout is not None

        async for event in self._read_events(proc.stdout):
            yield event
            if event.type == "result":
                session = event.raw.get("session_id")
                if isinstance(session, str):
                    self._session_id = session

        await proc.wait()
        # Update the main process reference
        self._process = None

    async def _read_events(
        self, stdout: asyncio.StreamReader
    ) -> AsyncIterator[StreamEvent]:
        """Read NDJSON lines from stdout and yield StreamEvents."""
        while True:
            line = await stdout.readline()
            if not line:
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
            self._process.terminate()
            try:
                await asyncio.wait_for(self._process.wait(), timeout=5.0)
            except TimeoutError:
                self._process.kill()
                await self._process.wait()
        self._process = None


def _get(d: object, key: str) -> Any:
    """Safely get a value from a dict-like object."""
    if isinstance(d, dict):
        return d.get(key)  # type: ignore[union-attr]
    return None


def _extract_content(data: dict[str, object], event_type: str) -> str:
    """Extract text content from a stream-json event."""
    if event_type == "assistant":
        message = _get(data, "message")
        content_blocks: Any = _get(message, "content")
        if isinstance(content_blocks, list):
            parts: list[str] = []
            blocks = cast(list[Any], content_blocks)
            for block in blocks:
                if _get(block, "type") == "text":
                    text_val = _get(block, "text")
                    if isinstance(text_val, str):
                        parts.append(text_val)
            return "".join(parts)
    elif event_type == "content_block_delta":
        delta = _get(data, "delta")
        text_val = _get(delta, "text")
        if isinstance(text_val, str):
            return text_val
    elif event_type == "result":
        result_val = _get(data, "result")
        if isinstance(result_val, str):
            return result_val
    return ""
