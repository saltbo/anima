"""Bridge adapter: modules.scanner.core → seed-compatible dict interface.

Converts the structured ProjectState from the scanner module into the
dict format that kernel/loop.py and downstream seed functions expect.
"""

from __future__ import annotations

from typing import Any

from kernel.config import ROOT
from modules.scanner.core import scan


def scan_project_state() -> dict[str, Any]:
    """Scan project state using the scanner module, return seed-compatible dict."""
    state = scan(str(ROOT))

    # Convert tuple[ModuleInfo, ...] → dict[str, dict]
    modules_dict: dict[str, Any] = {}
    for m in state.modules:
        modules_dict[m.name] = {
            "has_contract": m.has_contract,
            "has_spec": m.has_spec,
            "has_core": m.has_core,
            "has_tests": m.has_tests,
            "files": list(m.files),
        }

    # Convert tuple[tuple[str, str | None], ...] → dict[str, str | None]
    protected_hashes: dict[str, str | None] = dict(state.protected_hashes)

    # Convert QualityReport | None → dict[str, Any]
    quality_results: dict[str, Any] = {
        "ruff_lint": None,
        "ruff_format": None,
        "pyright": None,
    }
    if state.quality_results:
        qr = state.quality_results
        if qr.ruff_lint:
            quality_results["ruff_lint"] = {
                "passed": qr.ruff_lint.passed,
                "output": qr.ruff_lint.output,
            }
        if qr.ruff_format:
            quality_results["ruff_format"] = {
                "passed": qr.ruff_format.passed,
                "output": qr.ruff_format.output,
            }
        if qr.pyright:
            quality_results["pyright"] = {
                "passed": qr.pyright.passed,
                "output": qr.pyright.output,
            }

    # Convert TestResult | None → dict | None
    test_results: dict[str, Any] | None = None
    if state.test_results:
        tr = state.test_results
        test_results = {
            "exit_code": tr.exit_code,
            "passed": tr.passed,
            "output": tr.output,
            "errors": tr.errors,
        }

    # Convert InboxItem tuples → list of dicts
    inbox_items = [
        {"filename": item.filename, "content": item.content} for item in state.inbox_items
    ]

    return {
        "files": list(state.files),
        "modules": modules_dict,
        "domain_exists": state.domain_exists,
        "adapters_exist": state.adapters_exist,
        "kernel_exists": state.kernel_exists,
        "has_tests": state.has_tests,
        "has_pyproject": state.has_pyproject,
        "has_pyrightconfig": state.has_pyrightconfig,
        "inbox_items": inbox_items,
        "quality_results": quality_results,
        "test_results": test_results,
        "_protected_hashes": protected_hashes,
    }
