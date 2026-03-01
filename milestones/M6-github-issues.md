# M6 — GitHub Issues Integration

## Goal

将 GitHub Issues 作为 Inbox 的自动输入源。Issue 创建或更新时自动同步到 Inbox，
用户在规划 Milestone 时可直接从中挑选。

## Features

### 配置

在 `config.json` 中新增：
```json
{
  "github": {
    "repo": "owner/repo",
    "token": "ghp_...",
    "sync_label": "anima",
    "sync_interval_minutes": 30
  }
}
```

- `sync_label`：只同步带有指定 label 的 issue（避免所有 issue 涌入）
- `sync_interval_minutes`：轮询间隔

### 同步机制

- 应用启动时执行一次同步
- 按配置间隔定时轮询 GitHub Issues API
- 新 issue → 创建 Inbox 条目（`source: "github"`, `source_ref: "owner/repo#42"`）
- 已同步的 issue 更新时，同步更新对应 Inbox 条目的标题和描述
- issue 关闭时，对应 Inbox 条目标记为 `dismissed`（若尚未 included）

### Inbox 条目扩展

GitHub 来源的条目额外展示：
- Issue 编号和链接
- 原始 label

### 迭代完成后回写

Milestone 完成后，自动在对应 GitHub Issue 上评论：
```
✅ Resolved in milestone: {milestone title}
Branch merged: milestone/{id} → main
```

### UI

- 配置页：填写 GitHub repo、token、label、轮询间隔
- Inbox 列表中 GitHub 来源的条目有角标标识
- 同步状态显示在配置页（上次同步时间、同步数量）

## Acceptance Criteria

- [ ] 配置 GitHub repo 和 token 后，带指定 label 的 issue 自动出现在 Inbox
- [ ] 已同步 issue 更新时，Inbox 条目同步更新
- [ ] issue 关闭时，对应 Inbox 条目状态变为 `dismissed`
- [ ] Inbox 列表中 GitHub 来源条目有来源标识和 issue 链接
- [ ] Milestone 完成后，对应 issue 收到自动评论
- [ ] 不带指定 label 的 issue 不会进入 Inbox
