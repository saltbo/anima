# M8 — @mention Agent Dispatch（ExecutionTask 重构）

## Goal

用 @mention 机制替换 ExecutionTask 中硬编码的 developer↔reviewer 乒乓循环，使 agent 间协作通过互相 @mention 自然形成，而非由一个 for 循环强制编排。

## 背景

当前 `MilestoneExecutionTask` 把 developer→reviewer→developer 的迭代循环写死在一个 for 循环里（最多 20 轮）。prompt 构建、session 管理、角色切换全部硬编码。这导致：

- 无法灵活引入新 agent 角色（如 designer、tester）
- 迭代节奏由代码控制，agent 无法自主决定下一步该 @ 谁
- 每次加新角色或改流程都要改 ExecutionTask 代码

@mention 是更通用的原语：agent 做完工作后通过 `add_comment("@reviewer ...")` 触发下一个 agent，Soul 检测到 mention 后 dispatch，迭代循环自然形成。

## 设计

### 核心概念

```
当前:  Soul → think() → ExecutionTask → for 循环 { developer → reviewer }
目标:  Soul → think() → MentionTask → 启动单个 agent → agent 自行 @mention 下一个
```

### 流程

1. Soul `think()` 检测到 milestone `ready` → 决定 `{ task: 'dispatch-agent', agentId: 'developer', milestoneId }`
2. MentionTask 启动 developer agent
3. Developer 完成工作后 `add_comment("@reviewer please review")`
4. Comment 保存触发 `soul.wake()` → 下一轮 tick
5. `think()` 检测到 undispatched mention → `{ task: 'dispatch-agent', agentId: 'reviewer' }`
6. MentionTask 启动 reviewer agent
7. Reviewer 如果不通过 → `add_comment("@developer fix ...")`
8. 循环自然形成，无需 for 循环

### DB 变更

- `milestone_comments` 加 `mention_dispatched INTEGER NOT NULL DEFAULT 0`
- CommentRepository 新增 `getUndispatchedMentions()` / `markMentionDispatched()`

### 新文件

- `electron/main/agents/mention.ts` — `parseMentions(body)` 解析 comment 中的 @agentId
- `electron/main/soul/tasks/MentionTask.ts` — 通用的 "启动指定 agent" 任务

### Soul 改动

- `SoulContext` 新增 `pendingMentions` 字段
- `sense()` 采集 undispatched mentions
- `think()` 新增 mention 优先级（in-progress > ready > **mention** > plan-milestone）
- `prompts.ts` export `withIdentity()`

### Agent Prompt 改动

- Developer/Reviewer 的 systemPrompt 需要加入 @mention 规则：完成后 @ 下一个角色
- Agent 需要知道可用的 agent 列表（或至少知道 @developer / @reviewer）

### ExecutionTask 退役

- 确认 MentionTask + agent 互相 @mention 能完整覆盖当前 ExecutionTask 的所有场景后，删除 ExecutionTask
- 需要覆盖的场景：正常迭代、rate limit 处理、max iterations 保护、auto-merge

### 关键前提

- `add_comment` MCP 工具保存 comment 后需触发 `soul.wake()`
- Agent 退出后 Soul 自动进入下一轮 tick（当前已支持）
- 需要有 max iteration 保护机制防止 agent 无限互相 @

## Acceptance Criteria

- [ ] MentionTask 能根据 comment 中的 @agentId 启动对应 agent
- [ ] Developer agent 完成后自动 @reviewer，reviewer 完成后按需 @developer
- [ ] 迭代循环与当前 ExecutionTask 行为等价（正常迭代、通过、拒绝）
- [ ] Rate limit 检测与处理正常工作
- [ ] Max iteration 保护生效（防止无限 @mention 循环）
- [ ] 同一条 comment 不会重复 dispatch（mention_dispatched 标记）
- [ ] ExecutionTask 删除后所有现有测试通过或已更新
- [ ] `npm run lint && npm run test` 通过
