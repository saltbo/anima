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
| M1 | [UI Foundation](milestones/M1-ui-foundation.md) | Electron 应用骨架、布局、页面导航 | pending |
| M2 | [Inbox & Milestone Planning](milestones/M2-inbox-and-planning.md) | Inbox CRUD + 对话式创建 Milestone 文档 | pending |
| M3 | [Iteration Loop](milestones/M3-iteration-loop.md) | Developer-Acceptor 自动迭代引擎，含 Git 分支创建 | pending |
| M4 | [Human Acceptance](milestones/M4-human-acceptance.md) | 人工验收流、retry 介入、自动流转 | pending |
| M5 | [Git Integration](milestones/M5-git-integration.md) | merge + tag + rollback | pending |
| M6 | [GitHub Issues](milestones/M6-github-issues.md) | GitHub Issues 自动同步到 Inbox | pending |

## Key Design Decisions

1. **全部 Agent 走 Claude Code CLI**：Milestone 创建和迭代循环都通过 `node-pty` 驱动 `claude` CLI，保持一致性。
2. **Milestone 内容在 .md 文件中**：Agent 直接读取 Markdown 文档，JSON 状态文件只存运行时字段（status、branch、tokens 等），不存具体功能和验收标准。
3. **Inbox 是素材库**：Inbox 条目是轻量的待办项（bug / feature / optimization），在规划 Milestone 时从中挑选并整合进文档。
4. **开发即提交**：Developer Agent 在每次迭代后自行 commit，一个里程碑内多个 commit 是正常现象。
5. **人工验收在创建时标注**：`requires_human_review` 字段在 Milestone 创建对话中确定。
6. **分支随迭代开始创建**：M3 启动时建立 `milestone/{id}` 分支，所有开发在该分支进行。M5 负责完成后的 merge + tag + rollback。
7. **Main 分支保护**：只有里程碑完成后才 merge 到 main，中间过程完全隔离。
