#!/usr/bin/env python3
"""TUI command completion integration tests.

Run directly: uv run python tests/test_tui_cmds.py
Not collected by pytest (no test_ functions at module level).
"""

from __future__ import annotations

import asyncio
import sys

from anima.tui.app import AnimaApp

_PASS = 0
_FAIL = 0


async def _run(name: str, fn) -> None:
    global _PASS, _FAIL
    try:
        await fn()
        print(f"  PASS: {name}")
        _PASS += 1
    except Exception as e:
        print(f"  FAIL: {name} — {e}")
        _FAIL += 1


async def slash_shows_list() -> None:
    app = AnimaApp()
    async with app.run_test(size=(120, 30)) as pilot:
        await pilot.press("/")
        await pilot.pause()
        cl = app.query_one("#cmd-list")
        assert cl.display is True, f"display={cl.display}"
        assert cl.highlighted == 0, f"highlighted={cl.highlighted}"
        assert cl.option_count == 5, f"count={cl.option_count}"


async def tab_completes_first() -> None:
    app = AnimaApp()
    async with app.run_test(size=(120, 30)) as pilot:
        await pilot.press("/")
        await pilot.pause()
        await pilot.press("tab")
        await pilot.pause()
        inp = app.query_one("#input-bar")
        assert inp.value == "/start", f"value='{inp.value}'"
        assert not app.query_one("#cmd-list").display


async def arrow_navigation() -> None:
    app = AnimaApp()
    async with app.run_test(size=(120, 30)) as pilot:
        await pilot.press("/")
        await pilot.pause()
        await pilot.press("down")
        await pilot.press("down")
        await pilot.pause()
        cl = app.query_one("#cmd-list")
        assert cl.highlighted == 2, f"highlighted={cl.highlighted}"
        await pilot.press("up")
        await pilot.pause()
        assert cl.highlighted == 1, f"highlighted={cl.highlighted}"


async def arrow_then_tab() -> None:
    app = AnimaApp()
    async with app.run_test(size=(120, 30)) as pilot:
        await pilot.press("/")
        await pilot.pause()
        await pilot.press("down")
        await pilot.press("down")
        await pilot.pause()
        await pilot.press("tab")
        await pilot.pause()
        assert app.query_one("#input-bar").value == "/milestones"


async def enter_executes_highlighted() -> None:
    app = AnimaApp()
    async with app.run_test(size=(120, 30)) as pilot:
        await pilot.press("/")
        await pilot.pause()
        await pilot.press("enter")
        await pilot.pause()
        assert app.query_one("#input-bar").value == ""
        assert not app.query_one("#cmd-list").display


async def down_enter() -> None:
    app = AnimaApp()
    async with app.run_test(size=(120, 30)) as pilot:
        await pilot.press("/")
        await pilot.pause()
        await pilot.press("down")
        await pilot.pause()
        await pilot.press("enter")
        await pilot.pause()
        assert app.query_one("#input-bar").value == ""
        assert not app.query_one("#cmd-list").display


async def prefix_filter() -> None:
    app = AnimaApp()
    async with app.run_test(size=(120, 30)) as pilot:
        await pilot.press("/")
        await pilot.press("s")
        await pilot.pause()
        cl = app.query_one("#cmd-list")
        assert cl.display is True
        assert cl.option_count == 2


async def escape_hides() -> None:
    app = AnimaApp()
    async with app.run_test(size=(120, 30)) as pilot:
        await pilot.press("/")
        await pilot.pause()
        await pilot.press("escape")
        await pilot.pause()
        assert not app.query_one("#cmd-list").display
        assert app.query_one("#input-bar").value == "/"


async def plain_text_no_list() -> None:
    app = AnimaApp()
    async with app.run_test(size=(120, 30)) as pilot:
        for ch in "hello":
            await pilot.press(ch)
        await pilot.pause()
        assert not app.query_one("#cmd-list").display


async def tab_then_enter() -> None:
    app = AnimaApp()
    async with app.run_test(size=(120, 30)) as pilot:
        await pilot.press("/")
        await pilot.pause()
        await pilot.press("tab")
        await pilot.pause()
        assert app.query_one("#input-bar").value == "/start"
        await pilot.press("enter")
        await pilot.pause()
        assert app.query_one("#input-bar").value == ""


async def direct_type_enter() -> None:
    app = AnimaApp()
    async with app.run_test(size=(120, 30)) as pilot:
        for ch in "/start":
            await pilot.press(ch)
        await pilot.pause()
        assert app.query_one("#input-bar").value == "/start"
        await pilot.press("enter")
        await pilot.pause()
        assert app.query_one("#input-bar").value == ""


async def main() -> None:
    print("=== TUI Command Completion Tests ===")
    tests = [
        ("/ shows list", slash_shows_list),
        ("Tab completes first", tab_completes_first),
        ("Arrow navigation", arrow_navigation),
        ("Arrow + Tab", arrow_then_tab),
        ("Enter executes highlighted", enter_executes_highlighted),
        ("Down + Enter", down_enter),
        ("Prefix filter /s", prefix_filter),
        ("Escape hides list", escape_hides),
        ("Plain text no list", plain_text_no_list),
        ("Tab then Enter", tab_then_enter),
        ("Direct type + Enter", direct_type_enter),
    ]
    for name, fn in tests:
        await _run(name, fn)
    print(f"\n=== {_PASS}/{_PASS + _FAIL} passed ===")
    if _FAIL:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
