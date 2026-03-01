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
9. **项目路径通过 Welcome 页选择**：Anima 是桌面应用，管理的是外部项目。启动时若无已打开的项目，显示 Welcome 页让用户选择目录。项目路径存储在 Anima 自身的 app-level 配置（系统 Application Support 目录），与被管理项目的 `.anima/` 目录严格分离。
10. **Claude Code CLI 两种调用模式**：
    - **对话模式**（M2 Vision/Soul 创建、M3 Milestone 创建）：通过 `node-pty` 驱动 `claude` CLI 的交互模式，Anima 将用户输入转发至 stdin，将 CLI stdout 流式转发至 UI 聊天界面。Agent 的 System Prompt 通过 `--system-prompt` 参数注入，或在会话开始时作为第一条消息发送。
    - **任务模式**（M4 Developer Agent、Acceptor Agent）：通过 `node-pty` 以 `claude --print` 或等效方式发送完整 prompt，Agent 自主执行任务（读文件、写代码、运行命令、git commit），完成后输出结构化报告（`ALL_FEATURES_COMPLETE` / `ACCEPTED` / `REJECTED: {原因}`）。Anima 解析输出中的关键词驱动 Scheduler 状态机。
