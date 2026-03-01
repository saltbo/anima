# Storage Design

Anima 在被管理项目的根目录下创建 `.anima/` 目录，存放所有运行时数据。

## 目录结构

```
.anima/
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

## Git 追踪策略

| 路径 | 追踪 | 原因 |
|------|------|------|
| `state.json` | ✅ | 项目生命体征，随代码一起记录 |
| `config.json` | ✅ | 项目配置 |
| `inbox/*.json` | ✅ | 待办条目，规划历史的一部分 |
| `milestones/*.md` | ✅ | 里程碑内容文档 |
| `milestones/*.json` | ✅ | 里程碑运行时状态 |
| `memory/` | ✅ | Agent 的认知积累，跨会话复用 |
| `logs/` | ❌ | 纯运行日志，不需要版本化 |

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
| `status` | `"awake" \| "sleeping"` | `awake`：正在迭代；`sleeping`：空闲 |
| `current_milestone` | `string \| null` | 当前活跃的里程碑 ID |
| `total_tokens` | `number` | 所有会话累计消耗的 token 数 |
| `total_cost_usd` | `number` | 所有会话累计消耗的美元金额 |
| `first_activated_at` | `string \| null` | ISO 8601，首次激活时间 |
| `last_active_at` | `string \| null` | ISO 8601，最近一次活跃时间 |

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

**字段说明：**

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
| `pending` | 等待迭代 |
| `in_progress` | 正在迭代 |
| `awaiting_review` | 等待人工验收（`requires_human_review: true` 时） |
| `completed` | 已完成并 merge |
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

具体解析规则在 M3 实现阶段确定（依赖实际 CLI 输出格式）。

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

**更新时机：**
1. 迭代开始时（status → awake）
2. 每次 milestone 完成后（累计 token/cost 变化）
3. 迭代结束/暂停时（status → sleeping）
