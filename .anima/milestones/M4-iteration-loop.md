# M4 — Iteration Loop

## Goal

实现 Developer-Acceptor 自动迭代引擎：系统检测到 pending 的里程碑后自动开始，在 Developer 和 Acceptor 两个 Agent 之间驱动循环，直到里程碑完成。

## Features

### 自动触发

- 应用启动时检测是否有 `status: pending` 的里程碑（`auto_start: true` 时）
- 自动选取最早创建的 pending 里程碑开始迭代
- 迭代开始时（通过 `simple-git` 在 main process 中操作，Agent 进程 cwd 始终为被管理项目根目录）：
  1. 基于当前 main 分支创建并切换到 `milestone/{id}` 分支（`git switch -c milestone/{id}`）
  2. 将里程碑状态更新为 `in_progress`，记录 `base_commit`
  3. 同步更新 `state.json`：`status → awake`，`current_milestone → id`

### Agent 进程管理

通过 `node-pty` 启动两个持久化的 `claude` CLI 进程（在整个里程碑迭代期间保持存活，轮流接收任务，不同时处理）：

- **Developer Agent**：负责实现功能、写测试、提交代码
- **Acceptor Agent**：负责审查代码和实现质量，做出 ACCEPTED / REJECTED 判断

两个进程在同一里程碑内复用，避免重复冷启动。里程碑结束后统一回收。

### Scheduler（调度循环）

```
while 里程碑未完成:
    1. 构造 Developer prompt（注入上下文，见"Developer Prompt 策略"）
    2. 发送给 Developer，等待回复
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
           退出循环
    4. 若 REJECTED: {未满足的 AC 项}:
           将反馈发回 Developer，要求补充实现（此阶段的拒绝不计入 consecutive_rejections）
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

若所有功能均已实现并验证通过，回复 `ALL_FEATURES_COMPLETE` 报告（格式如下）。

**Developer 实现报告格式：**

```
## Implementation Report — Round {N}

**Feature**: {实现的功能描述}
**Commit**: {commit hash}
**Tests**: {通过数} passed, {失败数} failed
**Lint**: clean / {问题数} issues

### Changes
- {文件路径}: {改动说明}
- ...

### Notes
{实现过程中的决策或注意事项（可选）}
```

**ALL_FEATURES_COMPLETE 报告格式：**

```
## ALL_FEATURES_COMPLETE

所有功能已实现并提交。

### Commits
- {commit hash}: {commit message}
- ...

### Summary
{本次里程碑总体实现情况}
```

### Acceptor Agent Prompt 策略

**逐功能审查（每轮 Developer 完成后触发）：**

注入上下文：
- `.anima/soul.md`（质量标准和 Red Lines）
- 里程碑中该功能的验收标准（内联在功能描述里的 `验收：{...}`）
- Developer 的实现报告（含 commit hash）

指令：
- 通过 `git show {commit_hash}` 或 `git diff HEAD~N` 查看实际代码变更
- 基于功能的验收标准和 Soul 质量要求进行审查
- 回复格式（严格）：
  - 通过：`ACCEPTED`
  - 拒绝：`REJECTED: {具体原因，引用哪条标准不满足}`

**整体验收（ALL_FEATURES_COMPLETE 触发后）：**

注入上下文：
- `.anima/soul.md`
- 里程碑完整 Acceptance Criteria 列表
- 本里程碑所有 commit 的 hash 列表

指令：
- 逐条核验每个 Acceptance Criteria 是否已满足（可运行 `git log`、读取文件、运行测试）
- 回复格式：
  - 全部满足：`ACCEPTED`
  - 存在缺漏：`REJECTED: {列出未满足的 AC 项及原因}`

### 迭代监控 UI（Iteration Monitor 页）

- 左右双面板，分别展示 Developer 和 Acceptor 的输出流（当前活跃的 Agent 高亮）
- 顶部状态栏：当前里程碑名称、当前轮次（`iteration_count`）、连续拒绝次数（`consecutive_rejections`）
- 底部：当前 Scheduler 阶段（"等待 Developer" / "等待 Acceptor" / "最终整体验收" / "已暂停"）

### 超时与失控保护

- **单次 Agent 调用超时**：默认 10 分钟，超时后视为本轮失败，`consecutive_rejections += 1`，进入下一轮（超时原因写入报告）
- **最大迭代轮次**：默认 20 轮/里程碑（可在 `config.json` 中配置 `max_iterations_per_milestone`），超过后 Scheduler 暂停，等待人工介入
- 以上配置值均可在 `config.json` 中覆盖

### 状态持久化

每轮迭代结束后写回 `.anima/milestones/{id}.json`：
- `iteration_count`：已完成的轮次数
- `consecutive_rejections`：当前连续拒绝次数（ACCEPTED 后清零）
- `status`：当前状态
- `tokens_used` / `cost_usd`：累加本轮消耗

### 重启恢复

应用重启后检测到 `status: in_progress` 的里程碑时：

1. 读取 `milestones/{id}.json` 获取 `iteration_count`、`consecutive_rejections`、`branch_name`
2. 通过 `simple-git` 确认当前分支是否为 `milestone/{id}`，若不是则切换
3. 运行 `git status` 检查是否有未提交的脏状态：
   - 若有：先向 Developer 发送"清理"指令（提交或撤销未完成的改动），再继续
   - 若干净：直接继续
4. 重新启动两个 Agent 进程，在 prompt 中注入恢复上下文：
   - 已完成的轮次数（`iteration_count`）
   - `git log --oneline` 列出本分支已有的所有 commit
   - `memory/project.md` 当前内容
   - 明确说明："本里程碑因应用重启中断，请从上次中断处继续"
5. 继续 Scheduler 主循环

## Acceptance Criteria

- [ ] 应用启动后自动检测并开始处理 pending 里程碑（`auto_start: true`）
- [ ] 迭代开始时自动创建 `milestone/{id}` 分支，Agent 进程 cwd 指向被管理项目根目录
- [ ] Developer 实现完成后立即 commit，commit 出现在 milestone 分支上，main 不受影响
- [ ] Acceptor 收到报告后可通过 `git show` / `git diff` 查看实际代码变更
- [ ] Acceptor 的 REJECTED 反馈正确传回 Developer，携带具体原因
- [ ] 连续 3 次 REJECTED（ACCEPTED 后计数清零）后 Scheduler 暂停并通知 UI
- [ ] ALL_FEATURES_COMPLETE 触发 Acceptor 整体验收，验收通过后才流转 completed
- [ ] 整体验收 REJECTED 后反馈给 Developer 继续修复，不计入 consecutive_rejections
- [ ] 单次 Agent 调用超过 10 分钟触发超时处理
- [ ] 迭代超过 max_iterations 上限后 Scheduler 暂停
- [ ] 里程碑完成后状态更新为 `completed`（或 `awaiting_review`），`state.json` 同步更新
- [ ] 应用重启后自动检测 in_progress 里程碑，注入恢复上下文后继续迭代
- [ ] 重启恢复时若存在未提交的脏状态，先清理再继续
