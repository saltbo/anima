# M5 — Git Integration

## Goal

实现里程碑完成后的 Git 收尾流程：merge + tag，以及失败时的 rollback。分支创建和切换由 M3 负责，本模块聚焦生命周期的结束阶段。

## Features

### 完成后 Merge + Tag
- 触发时机：里程碑状态变为 `completed`（人工 Accept 或自动流转）
- 操作流程：
  1. 将 `milestone/{id}` merge 到 main（fast-forward 或 merge commit）
  2. 在 main 上打 tag：`milestone-{id}`
  3. 删除 milestone 分支（可选，默认保留）

### Rollback（失败回滚）
- 触发时机：迭代过程中发生不可恢复的错误（进程崩溃、文件损坏等）
- 操作：将 milestone 分支 reset 到分支创建时的 base commit
- 里程碑状态更新为 `failed`，在 UI 中显示错误原因
- 不影响 main 分支

### Git 状态展示
- 在 Iteration Monitor 页的状态栏中展示：
  - 当前所在分支
  - 当前 commit 数（相对 base）

## Git 操作实现方式

使用 Node.js 的 `simple-git` 库封装所有 Git 操作，通过 Electron 主进程执行，渲染进程通过 IPC 调用。

## Acceptance Criteria

- [ ] 里程碑完成后，`milestone/{id}` 分支被 merge 到 main 且打上对应 tag
- [ ] main 分支在里程碑完成前不受任何影响
- [ ] 触发 rollback 后，milestone 分支回到 base commit，main 分支无变化
- [ ] Iteration Monitor 页正确显示当前分支名和 commit 数
