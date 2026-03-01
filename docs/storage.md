# Storage Design

Anima 的存储分为两个层次：
1. **App-level 配置**：Anima 自身的全局配置，存储在系统标准目录，与任何项目无关
2. **项目级数据**：每个被管理项目根目录下的 `.anima/` 目录，存放该项目的所有运行时数据

---

## 1. App-level 配置（Anima 自身）

存储路径：
- macOS: `~/Library/Application Support/Anima/config.json`
- Windows: `%APPDATA%\Anima\config.json`

```json
{
  "projects": [
    { "path": "/path/to/project-alpha", "added_at": "2024-01-01T00:00:00Z" },
    { "path": "/path/to/my-website",    "added_at": "2024-01-02T00:00:00Z" }
  ],
  "theme": "system"
}
```

| 字段 | 说明 |
|------|------|
| `projects` | 所有被管理的项目列表，每项包含路径和添加时间 |
| `projects[].path` | 被管理项目的根目录绝对路径 |
| `projects[].added_at` | 该项目被添加到 Anima 的时间（ISO 8601） |
| `theme` | UI 主题：`system` / `light` / `dark` |

Anima 启动时加载所有 `projects`，为每个项目独立启动调度器，互不干扰。

---

## 2. 项目级数据（被管理项目）

Anima 在被管理项目的根目录下创建 `.anima/` 目录，存放所有运行时数据。

### 目录结构

```
VISION.md                   # 项目愿景（项目根目录，对外公开）

.anima/
├── soul.md                 # 项目灵魂与原则（Anima 上下文）
├── state.json              # 全局状态（status、token、cost 累计）
├── config.json             # 项目级配置（含唤醒调度）
├── inbox/                  # Inbox 条目（bug / feature / optimization）
│   └── {id}.json
├── milestones/             # 里程碑数据
│   ├── {id}.md             # 里程碑内容文档（Agent 直接读取）
│   ├── {id}.json           # 里程碑运行时状态
│   └── order.json          # 里程碑在 ready 状态下的优先级排序
├── memory/                 # Agent 对项目的认知积累
│   ├── project.md          # 项目上下文，由 Agent 维护
│   └── iterations/         # 每次迭代的摘要，由 Agent 写入
│       └── {timestamp}-{milestone-id}.md
└── logs/                   # 运行日志（不纳入 git）
    └── anima.log
```

### Git 追踪策略

| 路径 | 追踪 | 原因 |
|------|------|------|
| `VISION.md` | ✅ | 项目愿景，随代码一起记录 |
| `.anima/soul.md` | ✅ | 项目灵魂，Anima 上下文 |
| `.anima/state.json` | ✅ | 项目生命体征，随代码一起记录 |
| `.anima/config.json` | ✅ | 项目配置 |
| `.anima/inbox/*.json` | ✅ | 待办条目，规划历史的一部分 |
| `.anima/milestones/*.md` | ✅ | 里程碑内容文档 |
| `.anima/milestones/*.json` | ✅ | 里程碑运行时状态 |
| `.anima/milestones/order.json` | ✅ | 里程碑优先级排序 |
| `.anima/memory/` | ✅ | Agent 的认知积累，跨会话复用 |
| `.anima/logs/` | ❌ | 纯运行日志，不需要版本化 |

---

## 文件规范

### `state.json`

全局运行状态，也是 README badge 的数据来源。

```json
{
  "status": "sleeping",
  "current_milestone": null,
  "total_tokens": 0,
  "total_cost_usd": 0.00,
  "first_activated_at": null,
  "last_active_at": null
}
```

**字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `status` | `"sleeping" \| "checking" \| "awake" \| "paused" \| "rate_limited"` | 见下方状态说明 |
| `current_milestone` | `string \| null` | 当前活跃的里程碑 ID（`awake` 时） |
| `rate_limit_reset_at` | `string \| null` | ISO 8601，API 额度预计恢复时间（`rate_limited` 时） |
| `total_tokens` | `number` | 所有会话累计消耗的 token 数 |
| `total_cost_usd` | `number` | 所有会话累计消耗的美元金额 |
| `first_activated_at` | `string \| null` | ISO 8601，首次激活时间 |
| `last_active_at` | `string \| null` | ISO 8601，最近一次活跃时间 |

**`status` 状态说明：**

| 状态 | 含义 |
|------|------|
| `sleeping` | 空闲，等待下次唤醒时间 |
| `checking` | 已唤醒，正在扫描是否有 `ready` 里程碑（短暂过渡态） |
| `awake` | 发现 `ready` 里程碑，正在迭代 |
| `paused` | 连续 REJECTED ≥ 3 次，等待人工介入 |
| `rate_limited` | 触达 Claude API 额度上限，等待额度恢复（见 `rate_limit_reset_at`） |

**`state.json` 与 Milestone 状态的同步规则：**

| 触发事件 | `state.status` | `milestone.status` |
|----------|---------------|-------------------|
| 唤醒调度触发 | `checking` | 不变 |
| 发现 `ready` 里程碑，开始处理 | `awake` | `in_progress` |
| 无 `ready` 里程碑 | `sleeping` | 不变 |
| 检测到 API 额度限制 | `rate_limited` | `in_progress`（保持） |
| 额度恢复，重新唤醒 | `awake` | `in_progress`（保持） |
| 迭代完成（无需人工验收） | `sleeping` | `completed` |
| 迭代完成（需人工验收） | `sleeping` | `awaiting_review` |
| 连续 3 次 REJECTED，Scheduler 暂停 | `paused` | `in_progress`（保持） |
| 人工验收通过，merge 完成 | `sleeping` | `completed` |
| rollback 完成 | `sleeping` | `failed` |
| 用户取消 in_progress 里程碑 | `sleeping` | `cancelled` |

> `state.current_milestone` 在 Milestone 进入 `in_progress` 时写入，在 `completed` / `failed` / `cancelled` 后清空为 `null`。
> 两个文件的状态更新必须在同一事务内完成（先写 milestone JSON，再写 state.json），避免中间状态不一致。

---

### `config.json`

项目级配置，用户可手动编辑或通过 UI 修改。

```json
{
  "project_name": "",
  "wake_schedule": {
    "type": "interval",
    "interval_minutes": 120,
    "times": []
  },
  "default_requires_human_review": false,
  "agent_timeout_ms": 600000,
  "max_iterations_per_milestone": 20
}
```

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `project_name` | `string` | `""` | 项目名（默认取目录名） |
| `wake_schedule.type` | `"interval" \| "times" \| "manual"` | `"interval"` | 唤醒模式 |
| `wake_schedule.interval_minutes` | `number` | `120` | `interval` 模式：每隔 N 分钟检查一次 |
| `wake_schedule.times` | `string[]` | `[]` | `times` 模式：每天固定唤醒时间，如 `["09:00", "21:00"]` |
| `default_requires_human_review` | `boolean` | `false` | 创建里程碑时的默认人工验收选项 |
| `agent_timeout_ms` | `number` | `600000` | 单次 Agent 调用超时时间（毫秒），默认 10 分钟 |
| `max_iterations_per_milestone` | `number` | `20` | 单个里程碑最大迭代轮次，超过后 Scheduler 暂停 |

**`wake_schedule.type` 说明：**
- `interval`：按固定间隔检查，适合持续推进的项目
- `times`：每天在指定时间点唤醒，适合希望控制"工作时段"的项目
- `manual`：只响应手动唤醒，不自动触发

---

### `inbox/{id}.json`

Inbox 条目，是 Milestone 规划的素材来源。

```json
{
  "id": "uuid",
  "type": "bug | feature | optimization",
  "title": "...",
  "description": "...",
  "priority": "low | medium | high",
  "source": "manual | github",
  "source_ref": null,
  "status": "pending | included | dismissed",
  "included_in_milestone": null,
  "created_at": "2024-01-01T00:00:00Z"
}
```

| 字段 | 说明 |
|------|------|
| `type` | 条目类型：bug 修复 / 新功能 / 优化 |
| `priority` | 优先级：`low` / `medium` / `high`，用于列表排序和规划参考 |
| `source` | 来源：手动创建 / GitHub Issue |
| `source_ref` | GitHub 来源时填写，如 `"owner/repo#42"` |
| `status` | `pending`：待规划；`included`：已纳入某个 Milestone；`dismissed`：已忽略 |
| `included_in_milestone` | 被纳入的 Milestone ID |

---

### `milestones/{id}.json`

里程碑运行时状态。具体内容（目标、功能列表、验收标准）在对应的 `.md` 文件中，此处不重复存储。

```json
{
  "id": "uuid-v4",
  "title": "里程碑标题",
  "file": ".anima/milestones/uuid-v4.md",
  "requires_human_review": false,
  "status": "draft",
  "branch_name": "milestone/uuid-v4",
  "base_commit": null,
  "iteration_count": 0,
  "consecutive_rejections": 0,
  "tokens_used": 0,
  "cost_usd": 0.00,
  "created_at": "2024-01-01T00:00:00Z",
  "started_at": null,
  "completed_at": null
}
```

**status 流转：**

```
draft ──── 用户"标记为就绪" ────→ ready
  │                                 │
  └─── 删除（无需 cancel）           ├── Scheduler 拾取 ──→ in_progress
                                    │                         │
                                    └── 删除                  ├──→ awaiting_review ──→ completed
                                                              │                    ├──→ in_progress（打回重做）
                                                              │                    └──→ cancelled
                                                              ├──→ completed
                                                              ├──→ cancelled（用户中止 + rollback）
                                                              └──→ failed（严重失败 + rollback）
```

| 状态 | 说明 |
|------|------|
| `draft` | 刚创建，尚未就绪；Scheduler 忽略此状态 |
| `ready` | 用户确认就绪，Scheduler 可拾取；支持拖拽排序 |
| `in_progress` | 正在迭代（含 Scheduler 暂停等待人工介入的中间状态） |
| `awaiting_review` | Developer/Acceptor 循环完成，等待人工验收 |
| `completed` | 已完成并 merge 到 main |
| `cancelled` | 用户主动中止；`in_progress` 时触发 branch rollback，`awaiting_review` 时仅归档不 rollback |
| `failed` | 严重失败，已 rollback（由 M6 处理） |

**`draft` / `ready` 可直接删除**（无代码产出，无需归档）。`in_progress` 及之后的状态不可删除，只能取消（`cancelled`）。

---

### `milestones/order.json`

记录 `ready` 状态里程碑的优先级排序（仅 `ready` 状态的 ID 参与排序，其他状态忽略）。Scheduler 按此顺序依次处理。

```json
{
  "order": ["uuid-1", "uuid-3", "uuid-2"]
}
```

用户在 Milestone 列表页对 `ready` 里程碑拖拽排序后，实时写入此文件。

---

### `memory/project.md`

由 Developer Agent 在每次迭代结束时主动维护。

```markdown
# Project Memory

## Tech Stack
（技术栈、框架、版本）

## Architecture
（目录结构、模块划分、核心设计决策）

## Conventions
（命名规范、提交格式、代码风格约定）

## Known Issues
（已知问题、待处理的技术债）
```

---

### `memory/iterations/{timestamp}-{milestone-id}.md`

每次迭代结束后由 Developer Agent 写入。文件名格式：`20240101-120000-{milestone-id}.md`

```markdown
# Iteration Summary

- **Milestone**: {milestone-id}
- **Date**: 2024-01-01T12:00:00Z
- **Iterations**: 3
- **Tokens**: 45,230
- **Cost**: $0.12

## What was done
## Problems encountered
## Decisions made
```

---

## Token & Cost 统计

Claude Code CLI 输出 token 使用信息，Anima 通过解析 `node-pty` 输出流提取并累加到 `state.json` 和 `milestones/{id}.json`。具体解析规则在 M4 实现阶段确定。

---

## README Badge 更新

```markdown
<!-- anima:status:start -->
![status](https://img.shields.io/badge/status-awake-brightgreen)
![tokens](https://img.shields.io/badge/tokens-1.2M-blue)
![cost](https://img.shields.io/badge/cost-%240.43-blue)
<!-- anima:status:end -->
```

| status | badge 颜色 |
|--------|-----------|
| `awake` | `brightgreen` |
| `checking` | `yellow` |
| `sleeping` | `lightgrey` |
| `paused` | `red` |
| `rate_limited` | `orange` |

**更新时机：**
1. 状态切换时（sleeping / checking / awake / paused）
2. 每次 milestone 完成后（累计 token/cost 变化）
