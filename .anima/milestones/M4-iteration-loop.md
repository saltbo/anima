# M4 — Iteration Loop

## Goal

实现 Developer-Acceptor 自动迭代引擎，以及项目的睡眠/唤醒生命周期管理。
Anima 同时管理多个项目，每个项目有独立的调度器和唤醒周期，并发运行、互不干扰。

## 存储架构

### 全局 config（`~/Library/Application Support/Anima/config.json`）

仅作项目注册表，只存识别信息：

```json
{
  "projects": [
    { "id": "...", "path": "/path/to/project", "name": "...", "addedAt": "..." }
  ]
}
```

### 项目运行状态（`.anima/state.json`，per-project，M4 新增）

```json
{
  "status": "sleeping",
  "currentMilestone": null,
  "iterationCount": 0,
  "nextWakeTime": null,
  "wakeSchedule": {
    "mode": "manual",
    "intervalMinutes": null,
    "times": []
  },
  "totalTokens": 0,
  "totalCost": 0,
  "rateLimitResetAt": null
}
```

## 数据模型变更

### MilestoneTask（新增 `iteration` 字段）

```typescript
interface MilestoneTask {
  id: string
  title: string
  description?: string
  completed: boolean
  order: number
  iteration: number  // 第几轮迭代产生（从 1 开始）
}
```

### AcceptanceCriterion（新增 `iteration` 字段）

```typescript
interface AcceptanceCriterion {
  title: string
  description?: string
  status: 'pending' | 'passed' | 'rejected'
  iteration: number  // 第几轮迭代产生（从 1 开始）
}
```

### Milestone（新增迭代跟踪字段）

```typescript
interface Milestone {
  // ...现有字段不变...
  iterationCount: number   // 累计迭代轮次，默认 0
  baseCommit?: string      // 里程碑分支起始 commit hash
}
```

**Task 与 AcceptanceCriterion 的数据来源：**

- `tasks[]` ← Developer Agent 的 `TodoWrite` 事件实时捕获，追加写入
- `acceptanceCriteria[]` ← Acceptor Agent 的 `TodoWrite` 事件实时捕获，追加写入
- 两者均跨迭代累积（新条目追加，不覆盖历史），通过 `iteration` 字段区分轮次
- Task 与 AcceptanceCriterion 为 N:M 关系（多个 Task 可对应一个验收项）

## Features

### 项目生命周期：睡眠 / 唤醒

每个项目有独立的生命周期，由 `.anima/state.json` 中的 `wakeSchedule` 驱动。

**状态流转：**
```
sleeping
  ↓ 唤醒时间到 / 用户手动"Wake Now"
checking          扫描是否有 ready 里程碑（数秒内完成）
  ├→ sleeping     没有 ready 里程碑，重新入睡
  └→ awake        发现 ready 里程碑，开始迭代
awake
  ↓ 里程碑完成 / 无更多 ready 里程碑
sleeping
```

**唤醒调度器（每个项目独立）：**
- `interval` 模式：每隔 N 分钟触发一次 check
- `times` 模式：每天在指定时间点触发 check
- `manual` 模式（默认）：仅响应用户操作，不自动触发
- 应用启动时立即执行一次 check，然后按调度继续

**checking 逻辑：**
1. 读取 `milestones.json`，按数组顺序过滤出 `status: ready` 的里程碑
2. 若有 → 取第一个，进入迭代流程；`state.status → awake`
3. 若无 → `state.status → sleeping`，等待下次唤醒

### 自动触发

Anima 启动时为所有已添加的项目各自启动一个独立的调度器，并发运行。

每个调度器在以下时机执行 checking：
- 应用启动时（立即执行一次）
- 按项目的 `wakeSchedule` 定期触发
- 用户点击"Wake Now"手动触发
- API 额度恢复时自动触发

发现 `ready` 里程碑后：
1. 通过 `simple-git` 创建并切换到 `milestone/{id}` 分支
2. 里程碑状态 → `in-progress`，记录 `baseCommit`
3. `state.json`：`status → awake`，`currentMilestone → id`

### Agent 迭代引擎

每次迭代开启两个独立的 `conversationAgent` session，迭代结束后关闭。
多个项目的迭代并发存在，每个项目独立管理自己的 session。

- **Developer Agent**：分析剩余需求，规划本轮工作，实现功能，提交代码
- **Acceptor Agent**：审查本轮实现，逐项验收，判断里程碑是否整体完成

### Scheduler（调度循环，每个项目独立）

```
里程碑激活后：

loop（直到里程碑完成或达到 max_iterations）:

  iterationCount += 1

  ── 开启本轮两个 session ──
  Developer Session 启动（conversationAgent）
  Acceptor Session 启动（conversationAgent）

  ── Developer 执行阶段 ──
  Developer 收到 prompt（见"Developer Prompt 策略"）
  Developer 分析剩余需求，决定本轮实现范围
  Developer 创建 TodoList（Anima 捕获 TodoWrite 事件 → milestone.tasks，iteration=N）
  Developer 实现、提交 commit

  ── 内层 Battle（最多 max_rounds_per_iteration 轮，默认 5）──
  round = 0
  loop:
    round += 1
    Developer 发送本轮实现报告
    Acceptor 收到报告，创建验收 TodoList（Anima 捕获 → milestone.acceptanceCriteria，iteration=N）
    Acceptor 逐项核验，更新 TodoList 状态

    if Acceptor TodoList 全部 completed:
      if 里程碑所有需求已满足（Acceptor 判断）:
        milestone.status → completed
        state.currentMilestone → null，state.status → sleeping
        退出所有循环，执行下一次 checking
      else:
        本轮迭代结束（进入下一次外层迭代）
        break
    else:
      if round >= max_rounds_per_iteration:
        本轮迭代结束（进入下一次外层迭代，携带未解决项上下文）
        break
      else:
        将 Acceptor 的具体反馈发回 Developer（同一 session 追加消息）
        Developer 修复，提交新 commit
        continue

  ── 关闭本轮两个 session ──

if iterationCount >= max_iterations:
  state.status → paused
  通知 UI 等待人工介入（M5 处理）
```

### Developer Prompt 策略

每轮迭代开始时注入以下上下文：

| 上下文 | 内容 |
|--------|------|
| `VISION.md` | 项目愿景 |
| `.anima/soul.md` | 代码规范、质量标准、Red Lines |
| `.anima/milestones/{id}.md` | 里程碑完整定义（需求 + 验收标准） |
| `.anima/memory/project.md` | 项目架构认知 |
| 当前分支名 | `milestone/{id}` |
| 当前迭代轮次 | `iterationCount` |
| 已完成工作摘要 | 历次迭代的 commit log（`git log --oneline milestone/{id}`） |
| 剩余需求 | 上轮 Acceptor 指出的尚未满足项（若有） |

**Developer 的任务指令：**
1. 分析 Milestone 需求与已有 commit，判断本轮要完成哪些内容
2. 用 `TodoWrite` 创建本轮执行计划
3. 实现并提交（conventional commit 格式，commit 到 `milestone/{id}` 分支）
4. 发送本轮实现报告

### Acceptor Prompt 策略

每轮 battle 开始时注入以下上下文：

| 上下文 | 内容 |
|--------|------|
| `.anima/soul.md` | 代码规范与质量标准 |
| `.anima/milestones/{id}.md` | 里程碑完整定义 |
| Developer 本轮实现报告 | 包含 commit hash 列表 |
| 历次迭代的 commit log | `git log --oneline milestone/{id}` |

**Acceptor 的任务指令：**
1. 用 `TodoWrite` 为本轮声明范围内的每个验收项创建一条 todo
2. 通过 `git show` / `git diff` 核查实际代码变更
3. 逐项验收，更新 todo 状态（`completed` = 通过，`pending` = 未通过）
4. 若有未通过项，在回复中给出具体原因
5. 判断整个 Milestone 的所有需求是否已全部满足，在报告末尾明确声明

### TodoWrite 事件捕获

Anima 在 `onEvent` 中拦截 `tool_use` 事件，filter `toolName === 'TodoWrite'`：

- **Developer session** 的 `TodoWrite` → 追加到 `milestone.tasks`，`iteration` = 当前轮次，状态实时同步
- **Acceptor session** 的 `TodoWrite` → 追加到 `milestone.acceptanceCriteria`，`iteration` = 当前轮次，状态实时同步

两个字段跨迭代累积，UI 可按 `iteration` 分组展示各轮工作内容。

### API 额度限制处理

Claude Code CLI 通过 JSON stream 输出 `rate_limit_event` 事件，Anima 的 `ClaudeCodeAgent` 已解析并发出 `{ event: 'rate_limit', utilization }` 事件。

**额度耗尽处理流程：**
1. Agent 发出 error 事件，消息包含恢复时间信息
2. Scheduler 识别后将 `state.status → rate_limited`，记录 `rateLimitResetAt`
3. 关闭当前迭代的两个 session
4. UI 通知："API quota reached. Will resume at {time}"
5. 托盘图标变橙色，悬停提示恢复时间
6. 恢复时间到达后自动触发 checking，重新进入迭代循环
7. 若无法解析恢复时间，默认等待 60 分钟后重试

### 超时与失控保护

- **单次 Agent session 超时**：由 `agent_timeout_ms` 控制（默认 10 分钟），超时后关闭 session，本轮迭代结束，进入下一轮
- **最大迭代轮次**：由 `max_iterations_per_milestone` 控制（默认 20 轮），超过后 Scheduler 暂停等待人工介入（M5 处理）
- **单轮最大 battle 次数**：由 `max_rounds_per_iteration` 控制（默认 5 次），超过后结束本轮迭代

### 重启恢复

应用重启后检测到 `state.status: awake` 时：

1. 读取 `state.json` 获取 `currentMilestone`
2. 通过 `simple-git` 确认当前分支是否为 `milestone/{id}`，若不是则切换
3. 检查 `git status`：若有未提交改动，将其视为上一轮迭代的遗留，记录到下轮上下文
4. 重新进入迭代循环（`iterationCount` 保持已有值继续累加）

### 迭代监控 UI（Iteration Monitor 页）

- 左右双面板：分别展示 Developer 和 Acceptor 的输出流（活跃中的 Agent 高亮）
- 顶部状态栏：当前里程碑名称、当前迭代轮次、当前 battle round
- Task 列表：按 `iteration` 分组展示 Developer 的 TodoList 及完成状态
- 验收项列表：按 `iteration` 分组展示 Acceptor 的验收 TodoList 及通过状态
- 底部状态行：`sleeping` / `checking` / `awake（迭代 N，battle round M）` / `paused` / `rate_limited（将于 {time} 恢复）`

## Acceptance Criteria

- [ ] 每个项目有独立的调度器，按各自 `wakeSchedule` 唤醒，并发运行不互相影响
- [ ] 唤醒后执行 checking：有 `ready` 里程碑 → 开始迭代；无 → 回到 sleeping
- [ ] `times` 和 `interval` 两种调度模式均正常工作，`manual` 为默认
- [ ] 里程碑按 `milestones.json` 数组顺序依次处理
- [ ] 迭代开始时自动创建 `milestone/{id}` 分支，Agent cwd 指向被管理项目根目录
- [ ] 每次迭代各开一对新的 Developer / Acceptor session，迭代结束后关闭
- [ ] Developer 的 TodoWrite 事件被捕获，实时追加到 `milestone.tasks`，携带正确的 `iteration` 值
- [ ] Acceptor 的 TodoWrite 事件被捕获，实时追加到 `milestone.acceptanceCriteria`，携带正确的 `iteration` 值
- [ ] Acceptor TodoList 全部 completed 后，Acceptor 正确判断里程碑是否整体完成
- [ ] 里程碑整体完成时 `milestone.status → completed`，`state.json` 同步更新
- [ ] battle 内 Acceptor 的拒绝反馈正确传回 Developer（同一 session 追加消息）
- [ ] 单轮 battle 达到 `max_rounds_per_iteration` 后结束本次迭代，进入下一轮
- [ ] 迭代达到 `max_iterations_per_milestone` 后 Scheduler 暂停并通知 UI
- [ ] 单次 Agent session 超时后正确关闭，不死锁
- [ ] 检测到 API 额度限制时，`state.status → rate_limited`，记录 `rateLimitResetAt`
- [ ] 额度恢复后自动重新 checking 并继续迭代
- [ ] 若无法解析恢复时间，默认等待 60 分钟后重试
- [ ] 应用重启后自动恢复 awake 状态的里程碑迭代
- [ ] 项目运行状态存储在 `.anima/state.json`，全局 config 仅保留注册表字段
