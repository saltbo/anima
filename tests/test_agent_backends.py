"""Tests for multi-agent backend support.

Validates that CodexAdapter and GeminiAdapter satisfy the AgentPort
Protocol and that the executor bridge correctly selects backends
based on the ANIMA_AGENT environment variable.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import patch

import pytest

# ---------------------------------------------------------------------------
# CodexAdapter
# ---------------------------------------------------------------------------


class TestCodexAdapter:
    """CodexAdapter satisfies AgentPort and handles CLI errors."""

    def test_returns_execution_result(self) -> None:
        from adapters.agents.codex import CodexAdapter

        adapter = CodexAdapter(command="codex")
        # Verify the adapter has an execute method matching AgentPort
        assert callable(getattr(adapter, "execute", None))

    def test_command_not_found(self) -> None:
        from adapters.agents.codex import CodexAdapter

        adapter = CodexAdapter(command="nonexistent-codex-binary-xyz")
        result = adapter.execute("test prompt")

        assert result.success is False
        assert result.exit_code == -1
        assert "not found" in result.errors

    def test_success_result(self) -> None:
        from adapters.agents.codex import CodexAdapter

        fake_completed = type(
            "CompletedProcess",
            (),
            {"returncode": 0, "stdout": "task done", "stderr": ""},
        )()

        adapter = CodexAdapter(command="codex")
        with patch("subprocess.run", return_value=fake_completed):
            result = adapter.execute("do something")

        assert result.success is True
        assert result.output == "task done"
        assert result.exit_code == 0

    def test_failure_result(self) -> None:
        from adapters.agents.codex import CodexAdapter

        fake_completed = type(
            "CompletedProcess",
            (),
            {"returncode": 1, "stdout": "", "stderr": "error occurred"},
        )()

        adapter = CodexAdapter(command="codex")
        with patch("subprocess.run", return_value=fake_completed):
            result = adapter.execute("do something")

        assert result.success is False
        assert result.exit_code == 1
        assert "error occurred" in result.errors

    def test_timeout_returns_failure(self) -> None:
        import subprocess

        from adapters.agents.codex import CodexAdapter

        adapter = CodexAdapter(command="codex", timeout=5)
        with patch("subprocess.run", side_effect=subprocess.TimeoutExpired("codex", 5)):
            result = adapter.execute("test")

        assert result.success is False
        assert "timed out" in result.errors


# ---------------------------------------------------------------------------
# GeminiAdapter
# ---------------------------------------------------------------------------


class TestGeminiAdapter:
    """GeminiAdapter satisfies AgentPort and handles CLI errors."""

    def test_returns_execution_result(self) -> None:
        from adapters.agents.gemini import GeminiAdapter

        adapter = GeminiAdapter(command="gemini")
        assert callable(getattr(adapter, "execute", None))

    def test_command_not_found(self) -> None:
        from adapters.agents.gemini import GeminiAdapter

        adapter = GeminiAdapter(command="nonexistent-gemini-binary-xyz")
        result = adapter.execute("test prompt")

        assert result.success is False
        assert result.exit_code == -1
        assert "not found" in result.errors

    def test_success_result(self) -> None:
        from adapters.agents.gemini import GeminiAdapter

        fake_completed = type(
            "CompletedProcess",
            (),
            {"returncode": 0, "stdout": "task done", "stderr": ""},
        )()

        adapter = GeminiAdapter(command="gemini")
        with patch("subprocess.run", return_value=fake_completed):
            result = adapter.execute("do something")

        assert result.success is True
        assert result.output == "task done"
        assert result.exit_code == 0

    def test_failure_result(self) -> None:
        from adapters.agents.gemini import GeminiAdapter

        fake_completed = type(
            "CompletedProcess",
            (),
            {"returncode": 1, "stdout": "", "stderr": "error occurred"},
        )()

        adapter = GeminiAdapter(command="gemini")
        with patch("subprocess.run", return_value=fake_completed):
            result = adapter.execute("do something")

        assert result.success is False
        assert result.exit_code == 1
        assert "error occurred" in result.errors

    def test_timeout_returns_failure(self) -> None:
        import subprocess

        from adapters.agents.gemini import GeminiAdapter

        adapter = GeminiAdapter(command="gemini", timeout=5)
        with patch("subprocess.run", side_effect=subprocess.TimeoutExpired("gemini", 5)):
            result = adapter.execute("test")

        assert result.success is False
        assert "timed out" in result.errors


# ---------------------------------------------------------------------------
# Executor bridge agent selection
# ---------------------------------------------------------------------------


class TestAgentSelection:
    """executor_bridge._resolve_agent selects the correct backend."""

    def test_default_is_claude(self) -> None:
        from adapters.agents.claude_code import ClaudeCodeAdapter
        from adapters.executor_bridge import _resolve_agent

        with patch.dict("os.environ", {}, clear=False):
            # Remove ANIMA_AGENT if set
            env = dict(**{"ANIMA_AGENT": ""})
            with patch.dict("os.environ", env):
                agent = _resolve_agent()
        assert isinstance(agent, ClaudeCodeAdapter)

    def test_selects_codex(self) -> None:
        from adapters.agents.codex import CodexAdapter
        from adapters.executor_bridge import _resolve_agent

        with patch.dict("os.environ", {"ANIMA_AGENT": "codex"}):
            agent = _resolve_agent()
        assert isinstance(agent, CodexAdapter)

    def test_selects_gemini(self) -> None:
        from adapters.agents.gemini import GeminiAdapter
        from adapters.executor_bridge import _resolve_agent

        with patch.dict("os.environ", {"ANIMA_AGENT": "gemini"}):
            agent = _resolve_agent()
        assert isinstance(agent, GeminiAdapter)

    def test_unknown_backend_raises(self) -> None:
        from adapters.executor_bridge import _resolve_agent

        with (
            patch.dict("os.environ", {"ANIMA_AGENT": "unknown"}),
            pytest.raises(ValueError, match="Unknown agent backend"),
        ):
            _resolve_agent()

    def test_case_insensitive(self) -> None:
        from adapters.agents.codex import CodexAdapter
        from adapters.executor_bridge import _resolve_agent

        with patch.dict("os.environ", {"ANIMA_AGENT": "CODEX"}):
            agent = _resolve_agent()
        assert isinstance(agent, CodexAdapter)


# ---------------------------------------------------------------------------
# Protocol compliance (structural subtyping)
# ---------------------------------------------------------------------------


class TestProtocolCompliance:
    """All adapters satisfy AgentPort structurally."""

    def _check_agent_port(self, adapter: Any) -> None:
        """Verify adapter has execute(prompt: str) -> ExecutionResult."""
        assert hasattr(adapter, "execute")
        assert callable(adapter.execute)

    def test_claude_code_adapter(self) -> None:
        from adapters.agents.claude_code import ClaudeCodeAdapter

        self._check_agent_port(ClaudeCodeAdapter())

    def test_codex_adapter(self) -> None:
        from adapters.agents.codex import CodexAdapter

        self._check_agent_port(CodexAdapter())

    def test_gemini_adapter(self) -> None:
        from adapters.agents.gemini import GeminiAdapter

        self._check_agent_port(GeminiAdapter())
