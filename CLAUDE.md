# Anima — Claude Code Instructions

## MCP Browser Tools (Electron UI Interaction)

Use Playwright MCP to interact with the running Electron app for visual verification after CSS/layout changes. It connects via CDP (`--cdp-endpoint http://localhost:9222`) directly to the Electron renderer — configured in `.mcp.json`.

> **Prerequisite:** The Electron app must be running with remote debugging enabled on port 9222 (`--remote-debugging-port=9222`). Without this, Playwright MCP will fall back to opening a separate browser — avoid that.

### Playwright MCP (`mcp__playwright__*`)

**Core tools:**
- `browser_snapshot` → a11y tree with `ref` IDs for each element (preferred for interaction)
- `browser_take_screenshot` → visual PNG/JPEG (default saves to `.playwright-mcp/`, already gitignored)
- `browser_navigate` → navigate within the Electron app (HashRouter: `http://localhost:5173/#/...`)
- `browser_click` → click element by `ref` from snapshot (requires `element` description + `ref`)
- `browser_type`, `browser_fill_form` → text input and form interaction
- `browser_hover`, `browser_press_key` → other interactions
- `browser_evaluate` → run JS in the Electron renderer context
- `browser_console_messages` → check for errors/warnings
- `browser_network_requests` → inspect API calls
- `browser_tabs` → list/create/close/select tabs

### Workflow for UI verification
1. Ensure the app is running with remote debugging (`npm run dev`)
2. `browser_snapshot` → get the current page's a11y tree with `ref` IDs
3. Click sidebar links or interact with elements using `ref` values from the snapshot
4. `browser_take_screenshot` → capture visual result to `screenshots/` for comparison
5. Repeat: snapshot → interact → screenshot for each page to verify
