# M4 — Human Acceptance

## Goal

实现人工验收流程：当里程碑标注了"需要人工验收"且迭代完成，或 retry 上限触发需要人工介入时，系统暂停并提示用户处理，用户的决策驱动后续流程。

## Features

### 触发场景

**场景 A：里程碑完成后的人工验收**
- 里程碑 `requires_human_review: true`
- Scheduler 检测到 `ALL_FEATURES_COMPLETE`
- 将里程碑状态更新为 `awaiting_review`，暂停自动流转

**场景 B：retry 上限触发的人工介入**
- retry_count >= 3，Developer-Acceptor 循环陷入僵局
- Scheduler 暂停，等待人工提供新方向

### 人工验收 UI（场景 A）

在 Iteration Monitor 页底部弹出验收面板：
- 展示里程碑名称、验收标准列表、Developer 最终报告摘要
- 两个操作按钮：
  - **Accept**：确认通过，触发 M5 的 merge + tag 流程，状态更新为 `completed`
  - **Reject**：拒绝，弹出反馈输入框，提交后将反馈传回 Developer，重新开始循环（retry_count 重置）

### 人工介入 UI（场景 B）

在状态栏显示"需要人工介入"提示：
- 展示最近的 Acceptor 拒绝理由（最近 3 次）
- 输入框：让用户提供新的方向或补充说明
- 提交后将人工反馈传给 Developer，retry_count 重置，循环继续

### 自动流转（无需人工验收）

- 里程碑 `requires_human_review: false`
- Scheduler 检测到 `ALL_FEATURES_COMPLETE` 后直接触发 M5 的 merge + tag
- 状态更新为 `completed`
- 自动检测下一个 pending 里程碑并开始迭代

### 通知机制
- 当进入 `awaiting_review` 或 `awaiting_human_input` 状态时：
  - macOS：系统通知推送（Electron Notification API）
  - Windows：系统通知推送
  - 应用内 UI 状态也有明确视觉提示

## Acceptance Criteria

- [ ] `requires_human_review: true` 的里程碑完成后，状态变为 `awaiting_review` 并显示验收面板
- [ ] 点击 Accept 后里程碑状态变为 `completed`，自动开始下一个里程碑
- [ ] 点击 Reject 并提交反馈后，Developer Agent 收到反馈并重新开始实现
- [ ] retry >= 3 时正确进入人工介入流程
- [ ] 人工提供方向后 retry_count 重置，循环正常继续
- [ ] `requires_human_review: false` 的里程碑完成后自动流转，无需用户操作
- [ ] macOS 和 Windows 上均能收到系统通知
