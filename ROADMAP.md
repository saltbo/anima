# Anima — Roadmap

## Completed

### v0.1 ~ v0.8 — Python Kernel (Experimental)

Anima started as a Python CLI kernel to validate the core concept of autonomous iteration:

- Autonomous iteration loop (sleep → wake → iterate → sleep)
- Agent execution driven by Claude Code CLI
- Automatic milestone detection from Roadmap Markdown
- Three-phase iteration engine: Planner / Executor / Verifier
- Change tracking via conventional commits
- Rate limit detection and automatic recovery
- Rich TUI console output

> v0.0–v0.8 were entirely built by Anima itself in two days (2026-02-27/28), proving the feasibility of self-building software.

### v0.10 — Electron Desktop App

Full rewrite from Python CLI to an Electron + React desktop application for production-grade multi-project autonomous management:

**UI & Infrastructure**
- Multi-project management dashboard with system tray
- Project add/remove, per-project settings (wake schedule, auto-merge, auto-approve)
- SQLite persistence (WAL mode), 3-layer architecture (IPC → Service → Repository)

**Soul Architecture**
- Per-project Soul heartbeat loop (sense → think → act → sleep)
- Wake scheduler (interval / times / manual)
- Automatic rate limit detection and recovery

**Backlog & Milestone**
- Backlog CRUD (Kanban model)
- Soul-driven automatic milestone planning
- Milestone state machine (draft → planned → in_progress → in_review → completed)
- Acceptance checks linked to milestone items

**Agent System**
- Agent Identity (planner / developer / reviewer) with built-in system prompts
- AgentRunner: spawn Claude Code CLI, parse JSONL event stream
- @mention-driven agent dispatch (@developer / @reviewer in comments triggers agents)
- Session tracking (per-agent token usage & cost)
- MCP Server for agents to self-serve project data

**Git Integration**
- Automatic milestone branch creation and checkout
- Squash merge to main with branch cleanup
- Rollback / Cancel support

**Human-in-the-Loop**
- Accept / Request Changes / Rollback / Cancel / Close
- Milestone Detail page (timeline, comments, checks, agent session drawer)

### v0.11 — Agent Dispatch Refactor & Polish (in progress)

Major architecture refinements and bug fixes on top of v0.10:

- Agent dispatch model replacing the old iteration loop, with @mention support
- Milestone state machine redesign with clearer naming
- Agent Identity System — agents as first-class citizens
- Dedicated agent_sessions table for unified per-agent usage tracking
- Actions table for timeline and activity feed
- Reviewer (formerly acceptor) rename, scoped review limited to current iteration
- MCP business logic pushed down to Service layer
- App logo, CI/Release workflows, README rewrite

---

## Planned

### Phase 1 — Issue Tracker Integration

Connect Anima to external issue trackers so it can sense real-world user feedback.

- **GitHub Issues sync** — Filter and sync labeled issues into backlog; write back status when milestones complete
- **GitLab Issues sync** — Same capability for GitLab-hosted projects
- **Source attribution** — Backlog items from external sources show origin link and metadata
- **Bi-directional status** — Milestone completion auto-closes or comments on the originating issue

### Phase 2 — Multi-Agent Support

Anima currently only supports Claude Code CLI. Expand to more coding agents.

| Agent | Notes |
|-------|-------|
| Gemini CLI | Google's coding agent |
| OpenAI Codex | OpenAI's coding agent |
| Aider | Popular open-source AI coding tool |
| Cline | VS Code-based AI coding agent |

Key work:
- **Agent adapter interface** — Abstract CLI invocation and output parsing into a uniform plugin model
- **Per-project agent selection** — Let users choose which agent to use for each project
- **Output normalization** — Unified session event model regardless of underlying agent

### Phase 3 — Custom Agents

Allow users to define their own agents beyond the built-in planner/developer/reviewer.

- **Custom agent definitions** — Create agents with custom system prompts and roles via UI
- **Agent assignment** — Assign custom agents to specific tasks or milestones
- **@mention extension** — The mention-dispatch system recognizes user-defined agent names
- **Prompt templates** — Shareable agent templates for common workflows (e.g. security reviewer, docs writer, test specialist)

### Future Ideas

- **Webhook-driven wake** — Trigger Soul wake on push, PR, or issue events instead of polling
- **Cross-project awareness** — Detect dependencies between managed projects
- **Notification channels** — Slack / Discord / Email notifications for milestone completion, review requests, errors
- **Dashboard analytics** — Aggregate views of agent cost, iteration velocity, and project health over time
- **Windows support** — Electron supports it natively, but needs testing and packaging
