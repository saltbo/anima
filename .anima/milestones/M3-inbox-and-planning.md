# M3 — Inbox & Milestone Planning

## Goal

实现 Inbox（待办列表）的管理，以及通过对话创建 Milestone 文档的完整流程。
Inbox 是素材库，Milestone 创建对话框是将素材整合成可执行计划的地方。

## Features

### Inbox 管理

Inbox 是一个简单的待办列表，存放尚未规划进里程碑的 bug、需求和优化项。

**UI：**
- Inbox 列表页：展示所有条目，每条显示类型（bug / feature / optimization）、标题、优先级、状态、来源
- 支持四个操作：创建、查看、编辑、删除
- 条目状态：`pending`（待规划）| `included`（已纳入里程碑）| `dismissed`（已忽略）
- 创建/编辑表单：类型、标题、描述、优先级

**数据（`.anima/inbox/{id}.json`）：**
```json
{
  "id": "uuid",
  "type": "bug | feature | optimization",
  "title": "...",
  "description": "...",
  "priority": "low | medium | high",
  "source": "manual | github",
  "source_ref": null,
  "status": "pending",
  "included_in_milestone": null,
  "created_at": "..."
}
```

字段说明：

| 字段 | 说明 |
|------|------|
| `type` | 条目类型：bug 修复 / 新功能 / 优化 |
| `priority` | 优先级：low / medium / high，用于列表排序和 Milestone 规划时的参考 |
| `source` | 来源：手动创建 / GitHub Issue |
| `source_ref` | GitHub 来源时填写，如 `"owner/repo#42"` |
| `status` | `pending`：待规划；`included`：已纳入某个 Milestone；`dismissed`：已忽略 |
| `included_in_milestone` | 被纳入的 Milestone ID |

### Milestone 创建对话框

通过与 Agent 对话，将想法和 Inbox 条目整合成一份规范的 Milestone `.md` 文档。

**UI：**
- 聊天界面（消息气泡，流式输出）
- 侧边栏展示 Inbox 中的 `pending` 条目（按优先级排序），可勾选后注入对话上下文
- 输入框 + 发送，支持回车

**流程：**
1. 用户进入创建页，可选择性从 Inbox 挑选条目（勾选后作为上下文传给 Agent）
2. 用户描述这个版本想做什么（可以是自然语言，不需要结构化）
3. Agent 结合 Inbox 条目 + 用户描述，通过追问补全细节
4. Agent 确认信息完整后，询问是否需要人工验收（`requires_human_review`）
5. Agent 生成 Milestone `.md` 文档并在聊天界面内以 Markdown 代码块展示预览
6. 用户可选择：
   - **"确认创建"** → 保存 `.md` 和 `.json`（`status: draft`），被选中的 Inbox 条目状态更新为 `included`，进入创建成功页
   - **"继续修改"** → 继续对话，重新迭代后再次生成预览

**创建成功后的 UX：**
- 展示成功提示，显示 Milestone 标题和 ID
- 提供两个选项：
  - **"立即开始迭代"** → 状态更新为 `ready`，Scheduler 立即拾取 → `in_progress`
  - **"存为草稿"** → 保持 `draft` 状态，用户可在 Milestone 详情页审阅和编辑后再手动标记为就绪

**Agent 系统提示词（System Prompt）：**

```
你是一个 Milestone 规划助手。你的任务是通过对话，将用户的想法和 Inbox 条目整合成一份规范的 Milestone 文档。

对话策略：
- 帮助用户明确本次 Milestone 的范围边界（哪些做，哪些不做）
- 对每个待实现的功能追问验收标准（怎么算做完？）
- 识别并记录技术约束（不能动哪些、必须兼容什么）
- 确认是否需要人工验收（复杂功能/涉及 UI 的通常建议开启）

完成条件：目标明确、每个功能有验收标准、约束已记录。

信息收集完整后，输出以下格式的 Milestone 文档（用 Markdown 代码块包裹）：
```

**Milestone `.md` 格式（规范格式，Developer Agent 将依此实现）：**

```markdown
# {title}

## Goal
本版本的整体目标（1-3 句话）。

## Features

### Bug Fixes
- [ ] {描述}（验收：{怎么算修好}）

### New Features
- [ ] {描述}（验收：{怎么算做完}）

### Optimizations
- [ ] {描述}（验收：{怎么算完成}）

## Acceptance Criteria
- [ ] {端到端验收标准 1}
- [ ] {端到端验收标准 2}

## Constraints
{技术约束、不能触碰的范围（可选，无则省略此节）}
```

> **注意**：Bug Fixes / New Features / Optimizations 三个小节按需保留，没有的类型可省略。
> 每个功能项的括号内验收标准是给 Acceptor Agent 审查用的，必须具体可判断。

**Milestone 状态文件（`.anima/milestones/{id}.json`）：**
```json
{
  "id": "uuid",
  "title": "...",
  "file": ".anima/milestones/{id}.md",
  "requires_human_review": false,
  "status": "draft",
  "branch_name": "milestone/uuid",
  "base_commit": null,
  "iteration_count": 0,
  "consecutive_rejections": 0,
  "tokens_used": 0,
  "cost_usd": 0.00,
  "created_at": "...",
  "started_at": null,
  "completed_at": null
}
```

### Milestone 列表页

列表按状态分组展示，组内支持不同操作：

| 状态 | 显示 | 可用操作 |
|------|------|----------|
| `draft` | 草稿标签 | 查看/编辑详情、"标记为就绪"、删除 |
| `ready` | 就绪标签 | 查看详情、拖拽排序、"取消就绪"（退回 draft）、删除 |
| `in_progress` | 进行中 + 当前轮次 | "查看监控"、"取消迭代"（→ cancelled） |
| `awaiting_review` | 等待验收标签 | "开始验收"、"打回重做"、"取消"（→ cancelled） |
| `completed` | 完成标签 | 查看详情（只读） |
| `cancelled` / `failed` | 对应标签 | 查看详情（只读） |

**`ready` 状态里程碑支持拖拽排序**，排序结果写入 `milestones/order.json`，Scheduler 按此顺序依次处理。

**Milestone 详情页（`draft` 状态）：**
- 展示 `.md` 文件内容，提供内嵌 Markdown 编辑器（可直接修改）
- 保存后内容写回 `.md` 文件
- 底部操作栏："标记为就绪"（→ `ready`）、"删除"

## Acceptance Criteria

- [ ] 可创建、查看、编辑、删除 Inbox 条目
- [ ] Inbox 条目支持优先级（low / medium / high），列表按优先级排序展示
- [ ] Inbox 条目状态正确流转（pending → included / dismissed）
- [ ] 创建 Milestone 时可从 Inbox 勾选条目并注入对话上下文
- [ ] Agent 能通过追问将模糊描述整合成规范的 Milestone 文档（含各功能的验收标准）
- [ ] Milestone 文档预览以 Markdown 代码块形式展示在聊天界面内
- [ ] 用户可选择"确认创建"或"继续修改"
- [ ] 确认后 Milestone `.md` 和 `.json` 正确保存，初始 `status: draft`
- [ ] 被选中的 Inbox 条目状态更新为 `included`
- [ ] 创建成功页提供"立即开始迭代"（→ `ready` + 立即执行）和"存为草稿"两个选项
- [ ] `draft` 状态 Milestone 详情页提供内嵌编辑器，可修改 `.md` 内容
- [ ] `draft` 状态 Milestone 可通过"标记为就绪"转为 `ready`
- [ ] `ready` 状态 Milestone 支持拖拽排序，结果写入 `order.json`
- [ ] Milestone 列表按状态分组，各状态操作正确
- [ ] 重启后数据仍然存在
