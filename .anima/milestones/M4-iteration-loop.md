# M4 — Iteration Loop

## Goal

实现 Developer-Acceptor 自动迭代引擎，以及项目的睡眠/唤醒生命周期管理。
Anima 同时管理多个项目，每个项目有独立的调度器和唤醒周期，并发运行、互不干扰。

## Features

### 项目生命周期：睡眠 / 唤醒

每个项目有独立的生命周期，由各自的 `wake_schedule`（来自 `.anima/config.json`）驱动。

**状态流转：**
```
sleeping
  ↓ 唤醒时间到 / 用户手动"Wake Now"
checking          扫描是否有 ready 里程碑（数秒内完成）
  ├→ sleeping     没有 ready 里程碑，重新入睡
  └→ awake        发现 ready 里程碑，开始迭代
awake
  ↓ 迭代完成 / 无更多 ready 里程碑
sleeping
```

**唤醒调度器（每个项目独立）：**
- `interval` 模式：使用 `setInterval` 每隔 N 分钟触发一次 check
- `times` 模式：每天在指定时间点触发 check（使用系统时间比较）
- `manual` 模式：仅响应用户操作，不自动触发
- 应用启动时立即执行一次 check，然后按调度继续

**checking 逻辑：**
1. 读取 `milestones/order.json` 获取排好序的里程碑 ID 列表
2. 过滤出 `status: ready` 的里程碑
3. 若有 → 取第一个，进入迭代流程；`state.status → awake`
4. 若无 → `state.status → sleeping`，等待下次唤醒

### API 额度限制处理

Claude Code CLI 在达到 API 额度上限时会输出包含恢复时间的错误信息。Anima 需要解析此错误并自动等待恢复。

**处理流程：**
1. 解析 `node-pty` 输出流，识别额度限制错误（匹配关键词如 `rate limit`、`quota`、`try again in`）
2. 从错误信息中提取预计恢复时间（如 "try again in 47 minutes"）
3. 将 `state.status` 更新为 `rate_limited`，记录 `rate_limit_reset_at`（ISO 8601 时间戳）
4. 展示 UI 通知："API quota reached. Will resume at {time}"
5. 调度一个定时器，在恢复时间到达后自动重新唤醒并继续迭代
6. 若错误信息中无法提取具体时间，默认等待 60 分钟后重试
7. 恢复后从上次中断的位置继续（重启 Agent 进程，注入恢复上下文）

**`state.json` 新增字段：**
```json
{
  "status": "rate_limited",
  "rate_limit_reset_at": "2024-01-01T13:00:00Z"
}
```

系统托盘图标在 `rate_limited` 状态显示为橙色，鼠标悬停提示恢复时间。

### 自动触发

Anima 启动时为所有已添加的项目各自启动一个独立的调度器，并发运行。

每个调度器在以下时机执行 checking：
- 应用启动时（立即执行一次）
- 按项目的 `wake_schedule` 定期触发
- 用户点击"Wake Now"手动触发
- API 额度恢复时自动触发

发现 `ready` 里程碑后：
1. 通过 `simple-git` 创建并切换到 `milestone/{id}` 分支（`git switch -c milestone/{id}`），Agent 进程 cwd 始终为被管理项目根目录
2. 里程碑状态 → `in_progress`，记录 `base_commit`
3. `state.json`：`status → awake`，`current_milestone → id`

### Agent 进程管理

通过 `node-pty` 为每个活跃里程碑启动两个持久化 `claude` CLI 进程（在整个里程碑期间存活，顺序轮流接收任务，不同时处理）：

- **Developer Agent**：实现功能、写测试、提交代码
- **Acceptor Agent**：审查代码、做出 ACCEPTED / REJECTED 判断

多个项目的 Agent 进程并发存在，每个项目独立管理自己的进程。

### Scheduler（调度循环，每个项目独立）

```
while 里程碑未完成:
    1. 构造 Developer prompt（注入上下文，见"Developer Prompt 策略"）
    2. 发送给 Developer，等待回复
       - 若超时（agent_timeout_ms）→ 视为本轮失败，consecutive_rejections += 1
       - 若检测到额度限制错误 → 进入 rate_limited 等待流程
    3. 解析 Developer 回复：
       - 若回复 ALL_FEATURES_COMPLETE → 进入"最终整体验收"阶段（见下方）
       - 否则继续步骤 4
    4. 将 Developer 的实现报告（含 commit hash）发给 Acceptor 审查
    5. 等待 Acceptor 回复，解析结果：
       - 若 ACCEPTED:
           consecutive_rejections = 0
           iteration_count += 1
           写回 milestone JSON
           进入下一轮
       - 若 REJECTED: {原因}:
           consecutive_rejections += 1
           若 consecutive_rejections < 3:
               将拒绝原因发回 Developer，要求修复，继续循环
           若 consecutive_rejections >= 3:
               state.status → paused
               通知 UI 进入等待人工介入状态（M5 处理）
               暂停循环

最终整体验收阶段（由 ALL_FEATURES_COMPLETE 触发）:
    1. 构造 Acceptor 整体验收 prompt（注入完整 Acceptance Criteria + 所有 commit 列表）
    2. 发送给 Acceptor，等待回复
    3. 若 ACCEPTED:
           milestone.status → completed（或 awaiting_review 若 requires_human_review: true）
           state.status → sleeping，current_milestone → null
           退出循环，执行下一次 checking（可能有其他 ready 里程碑）
    4. 若 REJECTED: {未满足的 AC 项}:
           将反馈发回 Developer，要求补充实现（此阶段拒绝不计入 consecutive_rejections）
           继续主循环
```

### Developer Agent Prompt 策略

每轮 Developer 调用注入以下上下文：

| 上下文 | 内容 |
|--------|------|
| `VISION.md` | 项目愿景，帮助 Developer 理解方向 |
| `.anima/soul.md` | 代码规范、质量标准、Red Lines（Developer 必须遵守） |
| `.anima/milestones/{id}.md` | 里程碑完整定义（Goal / Features / Acceptance Criteria / Constraints） |
| `.anima/memory/project.md` | 项目架构认知（避免重复踩坑） |
| 当前分支名 | `milestone/{id}`（Developer 所有 commit 必须在此分支上） |
| 当前迭代轮次 | `iteration_count + 1` |
| 已完成功能列表 | 上轮报告中标记为完成的功能（或从 git log 提取） |
| 若是修复轮 | Acceptor 的拒绝原因 |

**Developer 的任务指令：**
1. 实现下一个**尚未完成**的功能（或修复 Acceptor 的拒绝问题）
2. 运行验证：lint + type check + 相关测试，全部通过
3. 执行 `git add` + `git commit`（conventional commit 格式），commit 到当前分支
4. 回复实现报告（格式如下）

若所有功能均已实现并验证通过，回复 `ALL_FEATURES_COMPLETE` 报告。

**Developer 实现报告格式：**

```
## Implementation Report — Round {N}

**Feature**: {实现的功能描述}
**Commit**: {commit hash}
**Tests**: {通过数} passed, {失败数} failed
**Lint**: clean / {问题数} issues

### Changes
- {文件路径}: {改动说明}

### Notes
{实现过程中的决策或注意事项（可选）}
```

**ALL_FEATURES_COMPLETE 报告格式：**

```
## ALL_FEATURES_COMPLETE

所有功能已实现并提交。

### Commits
- {commit hash}: {commit message}

### Summary
{本次里程碑总体实现情况}
```

### Acceptor Agent Prompt 策略

**逐功能审查（每轮 Developer 完成后触发）：**

注入：`.anima/soul.md`、该功能的验收标准、Developer 实现报告（含 commit hash）

指令：
- 通过 `git show {commit_hash}` 或 `git diff HEAD~N` 查看实际代码变更
- 基于功能验收标准和 Soul 质量要求审查
- 回复：`ACCEPTED` 或 `REJECTED: {具体原因，引用哪条标准不满足}`

**整体验收（ALL_FEATURES_COMPLETE 触发后）：**

注入：`.anima/soul.md`、里程碑完整 Acceptance Criteria、本里程碑所有 commit 列表

指令：
- 逐条核验每个 AC 是否满足（可运行 `git log`、读取文件、运行测试）
- 回复：`ACCEPTED` 或 `REJECTED: {列出未满足的 AC 项及原因}`

### 迭代监控 UI（Iteration Monitor 页）

- 左右双面板：分别展示 Developer 和 Acceptor 的输出流（当前活跃 Agent 高亮）
- 顶部状态栏：当前里程碑名称、当前轮次（`iteration_count`）、连续拒绝次数
- 底部状态行：当前阶段（"等待 Developer" / "等待 Acceptor" / "最终整体验收" / "已暂停" / "额度受限，将于 {time} 恢复"）

### 超时与失控保护

- **单次 Agent 调用超时**：由 `config.json` 的 `agent_timeout_ms` 控制（默认 10 分钟），超时视为本轮失败，`consecutive_rejections += 1`
- **最大迭代轮次**：由 `config.json` 的 `max_iterations_per_milestone` 控制（默认 20 轮），超过后 Scheduler 暂停等待人工介入

### 状态持久化

每轮迭代结束后写回 `.anima/milestones/{id}.json`：
- `iteration_count`、`consecutive_rejections`、`status`
- `tokens_used` / `cost_usd`：累加本轮消耗

### 重启恢复

应用重启后检测到 `status: in_progress` 或 `status: rate_limited` 的里程碑时：

1. 读取 `milestones/{id}.json` 获取当前状态
2. 若 `rate_limited`：检查 `rate_limit_reset_at`，若未到时间则继续等待；若已过则立即重试
3. 通过 `simple-git` 确认当前分支是否为 `milestone/{id}`，若不是则切换
4. 运行 `git status` 检查脏状态：若有未提交改动，先向 Developer 发送清理指令
5. 重新启动两个 Agent 进程，注入恢复上下文：
   - 已完成轮次数（`iteration_count`）
   - `git log --oneline`（本分支已有的所有 commit）
   - `memory/project.md` 当前内容
   - 明确说明："本里程碑因应用重启中断，请从上次中断处继续"
6. 继续 Scheduler 主循环

## Acceptance Criteria

- [ ] 每个项目有独立的调度器，按各自 `wake_schedule` 唤醒，并发运行不互相影响
- [ ] 唤醒后执行 checking：有 `ready` 里程碑 → 开始迭代；无 → 回到 sleeping
- [ ] `times` 和 `interval` 两种调度模式均正常工作
- [ ] 检测到 API 额度限制时，解析恢复时间，`state.status → rate_limited`
- [ ] 额度恢复时间到达后，自动重新唤醒并从中断处继续
- [ ] 若无法解析恢复时间，默认等待 60 分钟后重试
- [ ] Scheduler 只拾取 `ready` 状态的里程碑，`draft` 状态被忽略
- [ ] 里程碑按 `order.json` 定义的顺序依次处理
- [ ] 迭代开始时自动创建 `milestone/{id}` 分支，Agent cwd 指向被管理项目根目录
- [ ] Developer 实现完成后立即 commit，commit 出现在 milestone 分支上，main 不受影响
- [ ] Acceptor 收到报告后可通过 `git show` / `git diff` 查看实际代码变更
- [ ] Acceptor 的 REJECTED 反馈正确传回 Developer，携带具体原因
- [ ] 连续 3 次 REJECTED（ACCEPTED 后清零）后 Scheduler 暂停并通知 UI
- [ ] ALL_FEATURES_COMPLETE 触发 Acceptor 整体验收，通过后才流转 completed
- [ ] 单次 Agent 超时后正确处理，不死锁
- [ ] 迭代超过 max_iterations 后 Scheduler 暂停
- [ ] 里程碑完成后 `state.json` 同步更新，调度器继续执行 checking（处理下一个 ready 里程碑）
- [ ] 应用重启后自动恢复 in_progress / rate_limited 里程碑的迭代
