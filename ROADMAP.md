# Anima — Roadmap

## Tech Stack

- **Platform**: Electron (macOS + Windows)
- **Frontend**: React + TypeScript + Tailwind CSS + shadcn/ui
- **Build**: electron-vite + electron-builder
- **Agent**: Claude Code CLI via `node-pty`
- **Git**: `simple-git`

## Architecture Overview

```
Inbox（bug / feature / optimization 条目）
  ↓ 规划 Milestone 时从中挑选
Milestone 创建对话框（Claude Code CLI）
  ↓ 输出 .md 文档
.anima/milestones/{id}.md + {id}.json
  ↓ 检测到 pending 里程碑
Scheduler
  ├── Developer Agent (Claude Code CLI via node-pty)
  │     └── 实现功能 → git commit → 回复报告
  └── Acceptor Agent (Claude Code CLI via node-pty)
        └── 审查 → ACCEPTED / REJECTED
  ↓ ALL_FEATURES_COMPLETE
人工验收（若需要）或自动流转
  ↓
Git: merge to main + tag
  ↓
下一个 pending 里程碑
```

## Milestones

| # | 里程碑 | 核心交付 | 状态 |
|---|--------|----------|------|
| M1 | [UI Foundation](.anima/milestones/M1-ui-foundation.md) | Electron 应用骨架、布局、页面导航 | pending |
| M2 | [Project Setup](.anima/milestones/M2-project-setup.md) | 引导创建 VISION.md + .anima/soul.md | pending |
| M3 | [Inbox & Milestone Planning](.anima/milestones/M3-inbox-and-planning.md) | Inbox CRUD + 对话式创建 Milestone 文档 | pending |
| M4 | [Iteration Loop](.anima/milestones/M4-iteration-loop.md) | Developer-Acceptor 自动迭代引擎，含 Git 分支创建 | pending |
| M5 | [Human Acceptance](.anima/milestones/M5-human-acceptance.md) | 人工验收流、retry 介入、自动流转 | pending |
| M6 | [Git Integration](.anima/milestones/M6-git-integration.md) | merge + tag + rollback | pending |
| M7 | [GitHub Issues](.anima/milestones/M7-github-issues.md) | GitHub Issues 自动同步到 Inbox | pending |

## Key Design Decisions

1. **Vision + Soul 是前置条件**：没有 `VISION.md` 和 `.anima/soul.md` 就无法使用 Anima。Vision 放项目根目录（公开），Soul 放 `.anima/`（Anima 上下文）。
2. **全部 Agent 走 Claude Code CLI**：所有 Agent 交互通过 `node-pty` 驱动 `claude` CLI，保持一致性。
3. **Milestone 内容在 .md 文件中**：Agent 直接读取 Markdown 文档，JSON 状态文件只存运行时字段（status、branch、tokens 等）。
4. **Inbox 是素材库**：Inbox 条目是轻量的待办项（bug / feature / optimization），规划 Milestone 时从中挑选整合。
5. **开发即提交**：Developer Agent 在每次迭代后自行 commit，一个里程碑内多个 commit 是正常现象。
6. **人工验收在创建时标注**：`requires_human_review` 字段在 Milestone 创建对话中确定。
7. **分支随迭代开始创建**：M4 启动时建立 `milestone/{id}` 分支。M6 负责 merge + tag + rollback。
8. **Main 分支保护**：只有里程碑完成后才 merge 到 main，中间过程完全隔离。
