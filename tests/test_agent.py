"""Tests for agent layer (unit tests with mocked subprocess)."""

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from anima.agent.acceptor import AcceptorAgent, parse_acceptance
from anima.agent.claude_adapter import ClaudeAdapter, _extract_content, _get
from anima.agent.developer import DeveloperAgent
from anima.domain.models import AcceptanceResult, AgentRole


class TestParseAcceptance:
    def test_accepted(self) -> None:
        result, feedback = parse_acceptance("ACCEPTED\nLooks good.")
        assert result == AcceptanceResult.ACCEPTED
        assert feedback == "Looks good."

    def test_rejected(self) -> None:
        result, feedback = parse_acceptance("REJECTED\nMissing tests.")
        assert result == AcceptanceResult.REJECTED
        assert feedback == "Missing tests."

    def test_accepted_case_insensitive(self) -> None:
        result, _ = parse_acceptance("accepted\nOK")
        assert result == AcceptanceResult.ACCEPTED

    def test_rejected_by_default(self) -> None:
        result, _ = parse_acceptance("Not sure\nHmm")
        assert result == AcceptanceResult.REJECTED

    def test_no_feedback(self) -> None:
        result, feedback = parse_acceptance("ACCEPTED")
        assert result == AcceptanceResult.ACCEPTED
        assert feedback == ""


class TestStreamEventParsing:
    def test_parse_result_event(self) -> None:
        adapter = ClaudeAdapter(system_prompt="test")
        data: dict[str, object] = {
            "type": "result",
            "result": "done",
            "session_id": "abc123",
        }
        event = adapter._parse_event(data)
        assert event.type == "result"
        assert event.content == "done"

    def test_parse_assistant_event(self) -> None:
        adapter = ClaudeAdapter(system_prompt="test")
        data: dict[str, object] = {
            "type": "assistant",
            "message": {"content": [{"type": "text", "text": "Hello world"}]},
        }
        event = adapter._parse_event(data)
        assert event.type == "assistant"
        assert event.content == "Hello world"

    def test_parse_assistant_multiple_blocks(self) -> None:
        adapter = ClaudeAdapter(system_prompt="test")
        data: dict[str, object] = {
            "type": "assistant",
            "message": {
                "content": [
                    {"type": "text", "text": "Hello "},
                    {"type": "tool_use", "name": "read"},
                    {"type": "text", "text": "world"},
                ]
            },
        }
        event = adapter._parse_event(data)
        assert event.content == "Hello world"

    def test_parse_assistant_no_message(self) -> None:
        adapter = ClaudeAdapter(system_prompt="test")
        data: dict[str, object] = {"type": "assistant"}
        event = adapter._parse_event(data)
        assert event.content == ""

    def test_parse_assistant_message_not_dict(self) -> None:
        adapter = ClaudeAdapter(system_prompt="test")
        data: dict[str, object] = {"type": "assistant", "message": "string"}
        event = adapter._parse_event(data)
        assert event.content == ""

    def test_parse_content_block_delta(self) -> None:
        adapter = ClaudeAdapter(system_prompt="test")
        data: dict[str, object] = {
            "type": "content_block_delta",
            "delta": {"text": "chunk"},
        }
        event = adapter._parse_event(data)
        assert event.type == "content_block_delta"
        assert event.content == "chunk"

    def test_parse_content_block_delta_no_text(self) -> None:
        adapter = ClaudeAdapter(system_prompt="test")
        data: dict[str, object] = {
            "type": "content_block_delta",
            "delta": {"type": "input_json_delta"},
        }
        event = adapter._parse_event(data)
        assert event.content == ""

    def test_parse_result_non_string(self) -> None:
        adapter = ClaudeAdapter(system_prompt="test")
        data: dict[str, object] = {"type": "result", "result": 42}
        event = adapter._parse_event(data)
        assert event.content == ""

    def test_parse_unknown_event(self) -> None:
        adapter = ClaudeAdapter(system_prompt="test")
        data: dict[str, object] = {"type": "ping"}
        event = adapter._parse_event(data)
        assert event.type == "ping"
        assert event.content == ""

    def test_parse_no_type(self) -> None:
        adapter = ClaudeAdapter(system_prompt="test")
        data: dict[str, object] = {"data": "something"}
        event = adapter._parse_event(data)
        assert event.type == "unknown"


class TestGetHelper:
    def test_get_from_dict(self) -> None:
        assert _get({"a": 1}, "a") == 1

    def test_get_missing_key(self) -> None:
        assert _get({"a": 1}, "b") is None

    def test_get_from_non_dict(self) -> None:
        assert _get("string", "a") is None

    def test_get_from_none(self) -> None:
        assert _get(None, "a") is None


class TestExtractContent:
    def test_extract_assistant_content(self) -> None:
        data: dict[str, object] = {
            "type": "assistant",
            "message": {"content": [{"type": "text", "text": "hello"}]},
        }
        assert _extract_content(data, "assistant") == "hello"

    def test_extract_delta_content(self) -> None:
        data: dict[str, object] = {
            "type": "content_block_delta",
            "delta": {"text": "chunk"},
        }
        assert _extract_content(data, "content_block_delta") == "chunk"

    def test_extract_result_content(self) -> None:
        data: dict[str, object] = {"type": "result", "result": "done"}
        assert _extract_content(data, "result") == "done"

    def test_extract_unknown_type(self) -> None:
        data: dict[str, object] = {"type": "ping"}
        assert _extract_content(data, "ping") == ""


class TestClaudeAdapterReadEvents:
    async def test_read_events_ndjson(self) -> None:
        adapter = ClaudeAdapter(system_prompt="test")
        assistant_data = {
            "type": "assistant",
            "message": {
                "content": [{"type": "text", "text": "hi"}],
            },
        }
        result_data = {"type": "result", "result": "done"}
        lines = [
            json.dumps(assistant_data) + "\n",
            json.dumps(result_data) + "\n",
        ]

        reader = AsyncMock(spec=asyncio.StreamReader)
        reader.readline = AsyncMock(
            side_effect=[line.encode() for line in lines] + [b""]
        )

        events = []
        async for event in adapter._read_events(reader):
            events.append(event)

        assert len(events) == 2
        assert events[0].type == "assistant"
        assert events[0].content == "hi"
        assert events[1].type == "result"

    async def test_read_events_skips_non_json(self) -> None:
        adapter = ClaudeAdapter(system_prompt="test")
        result_line = json.dumps({"type": "result", "result": "done"}).encode() + b"\n"
        lines = [b"not json\n", b"\n", result_line]

        reader = AsyncMock(spec=asyncio.StreamReader)
        reader.readline = AsyncMock(side_effect=[*lines, b""])

        events = []
        async for event in adapter._read_events(reader):
            events.append(event)

        assert len(events) == 1
        assert events[0].type == "result"

    async def test_read_events_stops_on_result(self) -> None:
        adapter = ClaudeAdapter(system_prompt="test")
        result_line = json.dumps({"type": "result", "result": "done"}).encode() + b"\n"
        assistant_line = (
            json.dumps({"type": "assistant", "message": {"content": []}}).encode()
            + b"\n"
        )
        lines = [result_line, assistant_line]

        reader = AsyncMock(spec=asyncio.StreamReader)
        reader.readline = AsyncMock(side_effect=[*lines, b""])

        events = []
        async for event in adapter._read_events(reader):
            events.append(event)

        # Should stop after result, not read the assistant event
        assert len(events) == 1


class TestClaudeAdapterStop:
    async def test_stop_when_not_running(self) -> None:
        adapter = ClaudeAdapter(system_prompt="test")
        await adapter.stop()  # Should not raise

    async def test_stop_terminates_process(self) -> None:
        adapter = ClaudeAdapter(system_prompt="test")
        mock_proc = MagicMock()
        mock_proc.returncode = None
        mock_proc.terminate = MagicMock()
        mock_proc.kill = MagicMock()

        async def mock_wait() -> None:
            mock_proc.returncode = 0

        mock_proc.wait = mock_wait
        adapter._process = mock_proc

        await adapter.stop()
        mock_proc.terminate.assert_called_once()
        assert adapter._process is None


class TestAgentRoles:
    def test_developer_role(self) -> None:
        dev = DeveloperAgent()
        assert dev.role == AgentRole.DEVELOPER

    def test_acceptor_role(self) -> None:
        acc = AcceptorAgent()
        assert acc.role == AgentRole.ACCEPTOR


class TestClaudeAdapter:
    def test_not_running_initially(self) -> None:
        adapter = ClaudeAdapter(system_prompt="test")
        assert not adapter.is_running

    def test_session_id_none_initially(self) -> None:
        adapter = ClaudeAdapter(system_prompt="test")
        assert adapter._session_id is None

    def test_model_default(self) -> None:
        adapter = ClaudeAdapter(system_prompt="test")
        assert adapter._model == "sonnet"

    def test_model_custom(self) -> None:
        adapter = ClaudeAdapter(system_prompt="test", model="opus")
        assert adapter._model == "opus"

    async def test_spawn_without_project_dir_raises(self) -> None:
        adapter = ClaudeAdapter(system_prompt="test")
        with pytest.raises(RuntimeError, match="project_dir not set"):
            await adapter._spawn_process()
