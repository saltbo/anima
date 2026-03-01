# Anima — Roadmap

## Tech Stack

- **Platform**: Electron (macOS + Windows)
- **Frontend**: React + TypeScript + Tailwind CSS + shadcn/ui
- **Build**: electron-vite + electron-builder
- **Agent**: Claude Code CLI via `node-pty`
- **Git**: `simple-git`

## Architecture Overview

```
用户
  ↓ 创建里程碑（对话）
Claude Code CLI (Milestone Agent)
  ↓ 生成结构化里程碑定义
本地状态 (.anima/milestones/)
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
| M2 | [Milestone Creation](milestones/M2-milestone-creation.md) | 对话式创建里程碑、质量判断、本地保存 | pending |
| M3 | [Iteration Loop](milestones/M3-iteration-loop.md) | Developer-Acceptor 自动迭代引擎 | pending |
| M4 | [Human Acceptance](milestones/M4-human-acceptance.md) | 人工验收流、retry 介入、自动流转 | pending |
| M5 | [Git Integration](milestones/M5-git-integration.md) | 分支管理、merge + tag、rollback | pending |

## Key Design Decisions

1. **全部 Agent 走 Claude Code CLI**：milestone 创建和迭代循环都通过 `node-pty` 驱动 `claude` CLI，保持一致性。
2. **开发即提交**：Developer Agent 在每次迭代后自行 commit，一个里程碑内多个 commit 是正常现象。
3. **人工验收在创建时标注**：`requires_human_review` 字段在里程碑创建对话中确定，不依赖运行时判断。
4. **分支随迭代开始创建**：M3 启动迭代时立即建立 `milestone/{id}` 分支，所有开发在该分支进行。M5 负责完成后的 merge + tag + rollback。
5. **Main 分支保护**：只有里程碑完成后才 merge 到 main，中间过程完全隔离。
