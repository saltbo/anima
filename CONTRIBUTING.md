# Contributing to Anima

Thanks for your interest in contributing to Anima!

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated

### Install

```bash
git clone https://github.com/saltbo/anima.git
cd anima
npm install
```

### Run

```bash
npm run dev        # Start in dev mode with hot reload
npm run build      # Production build
npm run package    # Package as macOS .dmg / Windows .exe
npm run test       # Run tests
npm run lint       # Lint (zero warnings policy)
```

### Tech Stack

- **Desktop:** Electron + electron-vite
- **Frontend:** React + TypeScript + Tailwind CSS
- **Storage:** SQLite (better-sqlite3, WAL mode)
- **AI Agents:** Claude Code CLI via MCP

### Architecture

```
electron/main/
  db/             # SQLite schema & singleton
  repositories/   # Data access layer
  services/       # Business logic
  ipc/            # IPC handlers (renderer ↔ main)
  soul/           # Soul heartbeat loop (sense → think → act)
  agents/         # Agent runner & CLI parser
  mcp/            # MCP server & config

src/              # React renderer (UI)
  pages/          # Route pages
  components/     # Shared components
  store/          # React Context providers
```

## Submitting Changes

1. Fork the repo and create a branch from `main`.
2. Make your changes and ensure tests pass (`npm run test`).
3. Ensure lint passes with zero warnings (`npm run lint`).
4. Submit a pull request.
