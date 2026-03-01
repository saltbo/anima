# M2 — Inbox & Milestone Planning

## Goal

实现 Inbox（待办列表）的管理，以及通过对话创建 Milestone 文档的完整流程。
Inbox 是素材库，Milestone 创建对话框是将素材整合成可执行计划的地方。

## Features

### Inbox 管理

Inbox 是一个简单的待办列表，存放尚未规划进里程碑的 bug、需求和优化项。

**UI：**
- Inbox 列表页：展示所有条目，每条显示类型（bug / feature / optimization）、标题、状态、来源
- 支持四个操作：创建、查看、编辑、删除
- 条目状态：`pending`（待规划）| `included`（已纳入里程碑）| `dismissed`（已忽略）
- 创建/编辑表单：类型、标题、描述

**数据（`.anima/inbox/{id}.json`）：**
```json
{
  "id": "uuid",
  "type": "bug | feature | optimization",
  "title": "...",
  "description": "...",
  "source": "manual | github",
  "source_ref": null,
  "status": "pending",
  "included_in_milestone": null,
  "created_at": "..."
}
```

### Milestone 创建对话框

通过与 Agent 对话，将想法和 Inbox 条目整合成一份规范的 Milestone `.md` 文档。

**UI：**
- 聊天界面（消息气泡，流式输出）
- 侧边栏展示 Inbox 中的 pending 条目，可勾选后注入对话上下文
- 输入框 + 发送，支持回车

**流程：**
1. 用户进入创建页，可选择性从 Inbox 挑选条目（勾选后作为上下文传给 Agent）
2. 用户描述这个版本想做什么（可以是自然语言，不需要结构化）
3. Agent 结合 Inbox 条目 + 用户描述，通过追问补全细节
4. Agent 确认信息完整后，询问是否需要人工验收
5. Agent 生成 Milestone `.md` 文档，保存到 `.anima/milestones/`
6. 被选中的 Inbox 条目状态更新为 `included`

**Agent 系统提示词职责：**
- 引导用户明确这个版本的范围
- 对每个条目追问优先级和验收标准
- 输出结构规范的 Milestone Markdown（见下方格式）

**Milestone `.md` 格式：**
```markdown
# {title}

## Goal
本版本的整体目标。

## Items

### Bug Fixes
- [ ] {描述}

### Features
- [ ] {描述}

### Optimizations
- [ ] {描述}

## Acceptance Criteria
- {验收标准 1}
- {验收标准 2}

## Constraints
{约束条件（可选）}
```

**Milestone 状态文件（`.anima/milestones/{id}.json`）：**
```json
{
  "id": "uuid",
  "title": "...",
  "file": ".anima/milestones/{id}.md",
  "requires_human_review": false,
  "status": "pending",
  "branch_name": "milestone/uuid",
  "base_commit": null,
  "iteration_count": 0,
  "retry_count": 0,
  "tokens_used": 0,
  "cost_usd": 0.00,
  "created_at": "...",
  "started_at": null,
  "completed_at": null
}
```

### Milestone 列表页

- 展示所有里程碑，显示标题、状态、是否需要人工验收
- 点击可查看对应的 `.md` 文档内容
- 新建按钮跳转到创建对话框

## Acceptance Criteria

- [ ] 可创建、查看、编辑、删除 Inbox 条目
- [ ] Inbox 条目状态正确流转（pending → included / dismissed）
- [ ] 创建 Milestone 时可从 Inbox 勾选条目并注入对话上下文
- [ ] Agent 能通过追问将模糊描述整合成规范的 Milestone 文档
- [ ] Milestone `.md` 文件正确保存到 `.anima/milestones/`
- [ ] Milestone 状态 JSON 正确创建，`status: pending`
- [ ] 被选中的 Inbox 条目状态更新为 `included`
- [ ] Milestone 列表页可查看已创建的里程碑及其状态
- [ ] 重启后数据仍然存在
