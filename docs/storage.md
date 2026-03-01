# Storage Design

Anima 的存储分为两个层次：
1. **App-level 配置**：Anima 自身的全局配置，存储在系统标准目录，与任何项目无关
2. **项目级数据**：被管理项目根目录下的 `.anima/` 目录，存放该项目的所有运行时数据

---

## 1. App-level 配置（Anima 自身）

存储路径：
- macOS: `~/Library/Application Support/Anima/config.json`
- Windows: `%APPDATA%\Anima\config.json`

```json
{
  "last_project_path": "/path/to/project",
  "recent_projects": [
    "/path/to/project",
    "/path/to/another-project"
  ],
  "theme": "system"
}
```

| 字段 | 说明 |
|------|------|
| `last_project_path` | 上次打开的项目路径，启动时自动加载（路径不存在则退回 Welcome 页） |
| `recent_projects` | 最近打开的项目路径列表，最多保留 10 条，用于 Welcome 页的 Recent Projects 列表 |
| `theme` | UI 主题：`system` / `light` / `dark` |

---

## 2. 项目级数据（被管理项目）

Anima 在被管理项目的根目录下创建 `.anima/` 目录，存放所有运行时数据。

### 目录结构

```
VISION.md                   # 项目愿景（项目根目录，对外公开）

.anima/
├── soul.md                 # 项目灵魂与原则（Anima 上下文）
├── state.json              # 全局状态（status、token、cost 累计）
├── config.json             # 项目级配置
├── inbox/                  # Inbox 条目（bug / feature / optimization）
│   └── {id}.json
├── milestones/             # 里程碑数据
│   ├── {id}.md             # 里程碑内容文档（Agent 直接读取）
│   └── {id}.json           # 里程碑运行时状态
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
| `status` | `"awake" \| "sleeping" \| "paused"` | `awake`：正在迭代；`sleeping`：空闲；`paused`：人工介入暂停 |
| `current_milestone` | `string \| null` | 当前活跃的里程碑 ID |
| `total_tokens` | `number` | 所有会话累计消耗的 token 数 |
| `total_cost_usd` | `number` | 所有会话累计消耗的美元金额 |
| `first_activated_at` | `string \| null` | ISO 8601，首次激活时间 |
| `last_active_at` | `string \| null` | ISO 8601，最近一次活跃时间 |

**`state.json` 与 Milestone 状态的同步规则：**

| 触发事件 | `state.status` | `milestone.status` |
|----------|---------------|-------------------|
| Scheduler 开始处理 Milestone | `awake` | `in_progress` |
| 迭代正常完成（无需人工验收） | `sleeping` | `completed` |
| 迭代完成（需人工验收） | `sleeping` | `awaiting_review` |
| 连续 3 次 REJECTED，Scheduler 暂停 | `paused` | `in_progress`（保持，等待介入） |
| 人工验收通过，merge 完成 | `sleeping` | `completed` |
| rollback 完成 | `sleeping` | `failed` |

> `state.current_milestone` 在 Milestone 进入 `in_progress` 时写入，在 `completed` / `failed` 后清空为 `null`。
> 两个文件的状态更新必须在同一事务内完成（先写 milestone JSON，再写 state.json），避免中间状态不一致。

---

### `config.json`

项目级配置，用户可手动编辑或通过 UI 修改。

```json
{
  "project_name": "",
  "auto_start": true,
  "default_requires_human_review": false
}
```

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `project_name` | `string` | `""` | 项目名（默认取目录名） |
| `auto_start` | `boolean` | `true` | 检测到 pending 里程碑时是否自动开始 |
| `default_requires_human_review` | `boolean` | `false` | 创建里程碑时的默认人工验收选项 |

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
  "status": "pending",
  "branch_name": "milestone/uuid-v4",
  "base_commit": null,
  "iteration_count": 0,
  "retry_count": 0,
  "tokens_used": 0,
  "cost_usd": 0.00,
  "created_at": "2024-01-01T00:00:00Z",
  "started_at": null,
  "completed_at": null
}
```

**status 流转：**

```
pending → in_progress → awaiting_review → completed
                      ↘ failed
```

| 状态 | 说明 |
|------|------|
| `pending` | 等待迭代开始（手动触发或 Scheduler 自动检测） |
| `in_progress` | 正在迭代（包含 Scheduler 暂停等待人工介入的中间状态） |
| `awaiting_review` | Developer/Acceptor 循环完成，等待人工验收（`requires_human_review: true`） |
| `completed` | 已完成并 merge 到 main |
| `failed` | 迭代失败，已 rollback |

---

### `memory/project.md`

由 Developer Agent 在每次迭代结束时主动维护。记录 Agent 对项目的积累认知，供后续迭代复用。

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

每次迭代结束后由 Developer Agent 写入，记录本次做了什么、遇到了什么。

文件名格式：`20240101-120000-{milestone-id}.md`

```markdown
# Iteration Summary

- **Milestone**: {milestone-id}
- **Date**: 2024-01-01T12:00:00Z
- **Iterations**: 3
- **Tokens**: 45,230
- **Cost**: $0.12

## What was done
（实现了哪些功能）

## Problems encountered
（遇到的问题和解决方式）

## Decisions made
（做出的设计决策和原因）
```

---

## Token & Cost 统计

Claude Code CLI 在交互过程中会输出 token 使用信息。Anima 通过解析 `node-pty` 的输出流提取这些数据，并累加到 `state.json` 和对应的 `milestones/{id}.json` 中。

具体解析规则在 M4 实现阶段确定（依赖实际 CLI 输出格式）。

---

## README Badge 更新

Anima 通过匹配 README.md 中的注释标记，整块替换 badge 内容：

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
| `sleeping` | `lightgrey` |
| `paused` | `red` |

**更新时机：**
1. 迭代开始时（status → awake）
2. 每次 milestone 完成后（累计 token/cost 变化）
3. 迭代结束/暂停时（status → sleeping / paused）
