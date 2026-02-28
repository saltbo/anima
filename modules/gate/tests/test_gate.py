"""Tests for modules/gate/core.py — risk classification and gate state."""

from __future__ import annotations

from typing import TYPE_CHECKING

from domain.models import RiskLevel
from modules.gate.core import (
    classify_risk,
    clear_gate,
    consume_bypass,
    is_gate_bypassed,
    is_gate_pending,
    read_gate,
    write_gate,
)

if TYPE_CHECKING:
    from pathlib import Path


# ---------------------------------------------------------------------------
# Risk classification — pure logic
# ---------------------------------------------------------------------------


def test_low_risk_for_simple_prompt() -> None:
    """A prompt without high-risk indicators should be LOW risk."""
    decision = classify_risk("Fix a typo in modules/scanner/core.py")
    assert not decision.gated
    assert decision.risk_level == RiskLevel.LOW
    assert decision.indicators == ()


def test_high_risk_for_domain_models() -> None:
    """Prompt targeting domain/models.py is high risk."""
    decision = classify_risk("Modify domain/models.py to add a new type")
    assert decision.gated
    assert decision.risk_level == RiskLevel.HIGH
    assert "modifies domain types" in decision.indicators


def test_high_risk_for_domain_ports() -> None:
    """Prompt targeting domain/ports.py is high risk."""
    decision = classify_risk("Update domain/ports.py with new Protocol")
    assert decision.gated
    assert decision.risk_level == RiskLevel.HIGH
    assert "modifies domain types" in decision.indicators


def test_high_risk_for_wiring() -> None:
    """Prompt targeting wiring.py is high risk."""
    decision = classify_risk("Update wiring.py to add new module")
    assert decision.gated
    assert decision.risk_level == RiskLevel.HIGH
    assert "modifies wiring.py" in decision.indicators


def test_high_risk_for_file_deletion() -> None:
    """Prompt mentioning file deletion is high risk."""
    decision = classify_risk("Delete the file old_module.py and remove unused code")
    assert decision.gated
    assert decision.risk_level == RiskLevel.HIGH
    assert "deletes files" in decision.indicators


def test_high_risk_for_removing_files() -> None:
    """Prompt mentioning removing files is high risk."""
    decision = classify_risk("Remove the file tests/old_test.py")
    assert decision.gated
    assert "deletes files" in decision.indicators


def test_high_risk_for_major_rewrite() -> None:
    """Prompt mentioning module rewrite is high risk."""
    decision = classify_risk("Rewrite the module scanner to improve performance")
    assert decision.gated
    assert "major restructuring" in decision.indicators


def test_high_risk_for_restructuring() -> None:
    """Prompt mentioning restructuring is high risk."""
    decision = classify_risk("Restructure the adapters layer for clarity")
    assert decision.gated
    assert "major restructuring" in decision.indicators


def test_multiple_indicators() -> None:
    """A prompt triggering multiple patterns should list all indicators."""
    prompt = "Modify domain/models.py and update wiring.py accordingly"
    decision = classify_risk(prompt)
    assert decision.gated
    assert len(decision.indicators) >= 2
    assert "modifies domain types" in decision.indicators
    assert "modifies wiring.py" in decision.indicators


def test_case_insensitive_matching() -> None:
    """Risk patterns should match regardless of case."""
    decision = classify_risk("modify DOMAIN/MODELS.PY")
    assert decision.gated


# ---------------------------------------------------------------------------
# Gate state management — file I/O
# ---------------------------------------------------------------------------


def test_no_gate_pending_initially(tmp_path: Path) -> None:
    """No gate file means no pending gate."""
    assert not is_gate_pending(tmp_path)


def test_write_and_read_gate(tmp_path: Path) -> None:
    """Writing a gate file makes it readable and pending."""
    write_gate(tmp_path, "Add new domain type", ("modifies domain types",))
    assert is_gate_pending(tmp_path)
    data = read_gate(tmp_path)
    assert data["gaps_summary"] == "Add new domain type"
    assert data["risk_indicators"] == ["modifies domain types"]
    assert "timestamp" in data


def test_clear_gate_removes_file_and_writes_bypass(tmp_path: Path) -> None:
    """Clearing the gate removes it and writes a bypass marker."""
    write_gate(tmp_path, "test", ("indicator",))
    assert is_gate_pending(tmp_path)

    clear_gate(tmp_path)
    assert not is_gate_pending(tmp_path)
    assert is_gate_bypassed(tmp_path)


def test_consume_bypass_removes_marker(tmp_path: Path) -> None:
    """Consuming bypass removes the marker and returns True."""
    write_gate(tmp_path, "test", ("indicator",))
    clear_gate(tmp_path)
    assert is_gate_bypassed(tmp_path)

    result = consume_bypass(tmp_path)
    assert result is True
    assert not is_gate_bypassed(tmp_path)


def test_consume_bypass_returns_false_when_missing(tmp_path: Path) -> None:
    """Consuming a non-existent bypass returns False."""
    result = consume_bypass(tmp_path)
    assert result is False


def test_clear_gate_without_pending(tmp_path: Path) -> None:
    """Clearing when no gate file exists still writes bypass marker."""
    clear_gate(tmp_path)
    assert not is_gate_pending(tmp_path)
    assert is_gate_bypassed(tmp_path)


def test_read_gate_empty_when_missing(tmp_path: Path) -> None:
    """Reading a missing gate file returns empty dict."""
    data = read_gate(tmp_path)
    assert data == {}


def test_read_gate_handles_corrupt_file(tmp_path: Path) -> None:
    """Reading a corrupt gate file returns empty dict."""
    gate_file = tmp_path / "gate_pending.json"
    gate_file.write_text("not valid json{{{")
    data = read_gate(tmp_path)
    assert data == {}
