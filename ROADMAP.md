# Anima — Roadmap

## Tech Stack

- **Platform**: Electron (macOS + Windows)
- **Frontend**: React + TypeScript + Tailwind CSS + shadcn/ui
- **Build**: electron-vite + electron-builder
- **Agent**: Claude Code CLI via `node-pty`
- **Git**: `simple-git`

## Architecture Overview

Anima 同时管理多个项目，每个项目有独立的迭代循环并发运行：

```
[Project A]                          [Project B]
Inbox → Milestone Planning           Inbox → Milestone Planning
          ↓ status: ready                      ↓ status: ready
       Scheduler (per-project)              Scheduler (per-project)
       wake_schedule 触发                   wake_schedule 触发
          ↓ checking → awake                   ↓ checking → awake
  Developer Agent (node-pty)           Developer Agent (node-pty)
    实现功能 → git commit → 报告           实现功能 → git commit → 报告
  Acceptor Agent (node-pty)            Acceptor Agent (node-pty)
    git diff → ACCEPTED / REJECTED        git diff → ACCEPTED / REJECTED
          ↓ ALL_FEATURES_COMPLETE                ↓ ALL_FEATURES_COMPLETE
    Acceptor 整体验收 AC                   Acceptor 整体验收 AC
          ↓                                      ↓
  人工验收（若需要）或自动流转             人工验收（若需要）或自动流转
          ↓                                      ↓
  Git: merge to main + tag               Git: merge to main + tag
          ↓                                      ↓
  checking → 下一个 ready 里程碑         checking → 下一个 ready 里程碑
```

## Milestones

| # | 里程碑 | 核心交付 | 状态 |
|---|--------|----------|------|
| M1 | [UI Foundation](.anima/milestones/M1-ui-foundation.md) | 多项目管理 UI、系统托盘、项目卡片总览 | pending |
| M2 | [Project Setup](.anima/milestones/M2-project-setup.md) | 引导创建 VISION.md + .anima/soul.md | pending |
| M3 | [Inbox & Milestone Planning](.anima/milestones/M3-inbox-and-planning.md) | Inbox CRUD + 对话式创建 Milestone + draft/ready 状态机 | pending |
| M4 | [Iteration Loop](.anima/milestones/M4-iteration-loop.md) | 多项目并发调度、睡眠/唤醒生命周期、Developer-Acceptor 迭代引擎 | pending |
| M5 | [Human Acceptance](.anima/milestones/M5-human-acceptance.md) | 人工验收流、retry 介入、自动流转 | pending |
| M6 | [Git Integration](.anima/milestones/M6-git-integration.md) | merge + tag + rollback | pending |
| M7 | [GitHub Issues](.anima/milestones/M7-github-issues.md) | GitHub Issues 自动同步到 Inbox | pending |

## Key Design Decisions

1. **Vision + Soul 是前置条件**：没有 `VISION.md` 和 `.anima/soul.md` 就无法使用 Anima。Vision 放项目根目录（公开），Soul 放 `.anima/`（Anima 上下文）。
2. **全部 Agent 走 Claude Code CLI**：所有 Agent 交互通过 `node-pty` 驱动 `claude` CLI，保持一致性。
3. **Milestone 内容在 .md 文件中**：Agent 直接读取 Markdown 文档，JSON 状态文件只存运行时字段（status、branch、tokens 等）。
4. **Inbox 是素材库**：Inbox 条目是轻量的待办项（bug / feature / optimization），规划 Milestone 时从中挑选整合。
5. **开发即提交**：Developer Agent 在实现并验证通过后立即 commit，Acceptor 通过 `git show` / `git diff` 审查真实代码。
6. **人工验收在创建时标注**：`requires_human_review` 字段在 Milestone 创建对话中确定。
7. **分支随迭代开始创建**：M4 启动时建立 `milestone/{id}` 分支。M6 负责 merge + tag + rollback。
8. **Main 分支保护**：只有里程碑完成后才 merge 到 main，中间过程完全隔离。
9. **多项目并发管理**：Anima 同时管理多个项目，每个项目有独立的调度器和 Agent 进程，并发运行互不干扰。项目列表存储在 Anima app-level 配置（`~/Library/Application Support/Anima/config.json`），被管理项目的数据全部在各自的 `.anima/` 目录内。
10. **每项目独立唤醒调度**：唤醒周期（interval / times / manual）在各项目的 `.anima/config.json` 中单独配置。Scheduler 唤醒后先进入 `checking` 状态扫描 `ready` 里程碑，有则开始迭代，无则回到 `sleeping`。
11. **Milestone 两阶段就绪**：Milestone 创建后初始状态为 `draft`（Scheduler 忽略），用户审阅后手动标记为 `ready` 才可被 Scheduler 拾取。`ready` 里程碑支持拖拽排序，Scheduler 按排序顺序依次处理。
12. **Claude Code CLI 两种调用模式**：
    - **对话模式**（M2 Vision/Soul 创建、M3 Milestone 创建）：通过 `node-pty` 驱动 `claude` CLI 的交互模式，Anima 将用户输入转发至 stdin，将 CLI stdout 流式转发至 UI 聊天界面。
    - **任务模式**（M4 Developer Agent、Acceptor Agent）：发送完整 prompt，Agent 自主执行任务（读文件、写代码、运行命令、git commit），完成后输出结构化报告（`ALL_FEATURES_COMPLETE` / `ACCEPTED` / `REJECTED: {原因}`）。
13. **API 额度限制自动恢复**：检测到 Claude Code CLI 的额度限制错误时，解析错误信息中的恢复时间，将项目状态设为 `rate_limited` 并调度定时器在额度恢复后自动继续迭代；无法解析时默认等待 60 分钟重试。
14. **系统托盘常驻**：关闭主窗口不退出，Anima 常驻系统托盘，唤醒调度和迭代循环在后台持续运行。Quit 是唯一真正退出的方式。
