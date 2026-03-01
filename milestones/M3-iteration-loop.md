# M3 — Iteration Loop

## Goal

实现 Developer-Acceptor 自动迭代引擎：系统检测到 pending 的里程碑后自动开始，在 Developer 和 Acceptor 两个 Agent 之间驱动循环，直到里程碑完成。

## Features

### 自动触发
- 应用启动时检测是否有 `status: pending` 的里程碑
- 自动选取最早创建的 pending 里程碑开始迭代
- 迭代开始时将里程碑状态更新为 `in_progress`
- 在里程碑对应的 Git 分支上进行开发（分支由 M5 管理，M3 假设分支已存在）

### Agent 进程管理
- 通过 `node-pty` 分别启动两个独立的 `claude` CLI 进程：
  - **Developer Agent**：负责实现功能、写测试、提交代码
  - **Acceptor Agent**：负责审查代码和实现质量，做出 ACCEPTED / REJECTED 判断
- 每个里程碑迭代结束后回收两个进程

### Scheduler（调度循环）

```
while 里程碑未完成:
    1. 向 Developer 发送任务 prompt（包含里程碑定义和当前进度）
    2. 等待 Developer 完成并回复
    3. 若 Developer 回复 ALL_FEATURES_COMPLETE → 跳出循环
    4. 将 Developer 的报告发给 Acceptor 审查
    5. 等待 Acceptor 回复
    6. 若 ACCEPTED:
       - 告知 Developer 提交代码（Developer 自行 git commit）
       - 重置 retry 计数，进入下一轮
    7. 若 REJECTED:
       - retry_count += 1
       - 若 retry_count < 3: 将反馈发回 Developer，继续循环
       - 若 retry_count >= 3: 暂停，等待人工介入（M4 处理）

里程碑完成 → 状态更新为 completed（或 awaiting_review 若需人工验收）
```

### Developer Agent Prompt 策略
- 注入里程碑的完整定义（goal / acceptance_criteria / constraints）
- 当前迭代轮次
- 明确指令：实现下一个未完成的功能，写测试，运行验证（lint + test），完成后回复报告
- 若所有功能已完成，回复 `ALL_FEATURES_COMPLETE`
- 每次 Acceptor 接受后，自行执行 `git add` + `git commit`（conventional commit 格式）

### Acceptor Agent Prompt 策略
- 注入里程碑的完整定义和验收标准
- 注入 Developer 的实现报告
- 明确指令：基于验收标准审查，回复 `ACCEPTED` 或 `REJECTED: {具体原因}`

### 迭代监控 UI（Iteration Monitor 页）
- 左右双面板，分别实时展示 Developer 和 Acceptor 的输出流
- 顶部状态栏：当前里程碑名称、当前轮次、当前状态
- 底部：当前 Scheduler 状态（例如"等待 Developer 回复"）

### 状态持久化
- 每轮迭代后将状态写回 `.anima/milestones/{id}.json`：
  - `iteration_count`：已完成的轮次数
  - `retry_count`：当前连续拒绝次数
  - `status`：当前状态

## Acceptance Criteria

- [ ] 应用启动后自动检测并开始处理 pending 里程碑
- [ ] Developer 和 Acceptor 两个 Agent 进程同时运行且输出各自显示在对应面板
- [ ] Developer 实现完成后主动 commit（可在 Git log 中验证）
- [ ] Acceptor 的 REJECTED 反馈能正确传回 Developer
- [ ] 连续 3 次 REJECTED 后 Scheduler 暂停并进入等待状态
- [ ] `ALL_FEATURES_COMPLETE` 信号能正确终止循环
- [ ] 里程碑完成后状态更新为 `completed`（或 `awaiting_review`）
- [ ] 应用重启后可恢复 in_progress 状态的里程碑继续迭代
