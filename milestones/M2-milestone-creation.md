# M2 — Milestone Creation

## Goal

实现通过对话式 UI 创建里程碑的完整流程：用户与 Claude Code Agent 对话，Agent 引导用户将目标细化为高质量、可验收的里程碑定义，并保存到本地。

## Features

### 对话 UI
- 聊天界面（消息气泡样式，区分用户/Agent 两侧）
- 流式输出：Agent 回复实时逐字渲染
- 输入框 + 发送按钮，支持回车发送
- 对话历史在当前会话内保留

### Claude Code CLI 集成
- 通过 `node-pty` 启动 `claude` CLI 进程
- 系统提示词注入（见下方"提示词策略"）
- 将用户输入传入 CLI stdin，将 CLI 输出渲染到对话气泡
- 对话结束后回收进程

### 提示词策略
Agent 被注入以下角色和任务：
1. **引导用户**说清楚四个要素：目标（What）、动机（Why）、验收标准（Definition of Done）、约束条件（Constraints）
2. **追问**：若用户描述模糊，继续追问直到信息完整
3. **质量判断**：信息完整后，Agent 明确告知"里程碑已通过质量检查"并给出结构化摘要
4. **询问验收方式**：里程碑完成后，是否需要人工验收？（是/否，以及原因）

### 里程碑保存
- 对话完成后，从 Agent 输出中提取结构化数据：
  - `id`：自动生成（时间戳或 UUID）
  - `title`：里程碑标题
  - `goal`：目标描述
  - `motivation`：动机
  - `acceptance_criteria`：验收标准列表
  - `constraints`：约束条件
  - `requires_human_review`：布尔值（创建时确定）
  - `status`：`pending`
  - `created_at`：创建时间
- 保存为本地 JSON 文件（`.anima/milestones/{id}.json`）

### 里程碑列表页
- 展示所有已创建的里程碑
- 每条显示：标题、状态（pending / in_progress / completed）、是否需要人工验收
- "新建里程碑"按钮跳转到创建页

## Acceptance Criteria

- [ ] 点击"新建里程碑"可进入对话页
- [ ] Agent 能通过追问将模糊描述引导为完整定义
- [ ] 模糊输入（如"做一个好 app"）不会被直接接受，Agent 会继续追问
- [ ] 完整输入后 Agent 给出明确的"通过"确认和结构化摘要
- [ ] 创建时正确记录"是否需要人工验收"
- [ ] 里程碑保存后出现在列表页
- [ ] 重启应用后里程碑数据仍然存在
