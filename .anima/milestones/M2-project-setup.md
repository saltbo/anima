# M2 — Project Setup

## Goal

引导用户为**被管理项目**创建 Vision 和 Soul，这是 Anima 能够工作的前提。
没有 Vision 和 Soul，Anima 不知道项目要去哪里、应该遵循什么原则。

> **说明**：Vision 和 Soul 均写入**被管理项目**的目录，而非 Anima 自身的安装目录。

## 触发时机

用户在 M1 点击 **"+ Add Project"** 选择项目目录后，Anima 检测该目录：

- 没有 `VISION.md` → 进入 Vision 创建引导
- 没有 `.anima/soul.md` → 进入 Soul 创建引导
- 两者都有 → 直接进入该项目的 Dashboard

两者独立检测，可以只缺其中一个。支持多个项目同时处于不同的引导阶段。

## Features

### Onboarding 界面

检测到缺失文件时，在该项目的主内容区展示 Onboarding 引导页（替代项目 Dashboard），说明：
- 什么是 Vision（项目要去哪里）
- 什么是 Soul（项目如何行事）
- 为什么需要它们

点击"开始"后，按顺序进入引导步骤：先 Vision，再 Soul。

---

### Step 1：创建 Vision

通过与 Agent 对话，生成项目的 `VISION.md`。

**UI 交互流程：**

1. 展示聊天界面，Agent 自动发出第一句引导语（无需用户先说话）
2. 用户自由输入，Agent 逐步追问，每次只问一个维度
3. 四个要素收集完整后，Agent 在聊天界面内以 Markdown 代码块形式展示完整的 `VISION.md` 预览
4. 预览下方展示两个操作按钮：
   - **"确认写入"** → 写入 `VISION.md`，进入 Step 2
   - **"继续修改"** → 继续对话，重新迭代后再次生成预览
5. 写入成功后展示 toast 提示，自动进入 Step 2

**Agent 系统提示词（System Prompt）：**

```
你是一个项目 Vision 顾问。你的任务是通过对话，引导用户澄清他们项目的 Vision，并最终输出一份结构化的 VISION.md 文件。

需要收集的四个要素（缺一不可）：
1. Identity：这个项目是什么（一句话定义）
2. Problem：它要解决什么问题（具体痛点，不是泛泛而谈）
3. Audience：目标用户是谁（越具体越好）
4. Long-term Goal：长期愿景（终态是什么样子）

对话策略：
- 每次只追问一个尚未明确的要素，不要一次性抛出所有问题
- 如果用户的回答模糊，追问具体例子
- 不要替用户做决定，帮助他们想清楚自己的想法

当四个要素都足够清晰时，输出以下格式的完整文件（用 Markdown 代码块包裹）：

```markdown
# Vision: {Project Name}

## Identity
{项目是什么}

## Problem
{解决什么问题}

## Audience
{目标用户}

## Long-term Goal
{长期愿景}
```

输出预览后，询问用户是否确认写入，或是否需要继续修改。
```

**输出文件：`VISION.md`（被管理项目根目录）**

---

### Step 2：创建 Soul

通过与 Agent 对话，生成项目的 `.anima/soul.md`。

**UI 交互流程：**

1. 展示聊天界面，Agent 自动发出第一句引导语
2. Agent 按顺序引导用户定义五个维度，每个维度给出示例帮助理解
3. 五个维度收集完整后，Agent 以 Markdown 代码块形式展示完整的 `soul.md` 预览
4. 预览下方展示两个操作按钮：
   - **"确认写入"** → 创建 `.anima/` 目录（如不存在），写入 `soul.md`，进入主界面
   - **"继续修改"** → 继续对话，重新迭代后再次生成预览
5. 写入成功后进入主界面（Dashboard）

**Agent 系统提示词（System Prompt）：**

```
你是一个项目原则顾问。你的任务是通过对话，帮助用户定义项目的 Soul——项目的行事原则和工程标准。Soul 将作为后续所有 AI Agent 的行为准则。

需要收集的五个维度（缺一不可）：
1. Principles：项目行事最重要的 3-5 条原则（要具体可执行，不是口号）
2. Tech Preferences：语言、框架、工具链偏好（具体到版本偏好或风格要求）
3. Red Lines：绝对不能做的事（安全底线和不可跨越的约束）
4. Quality Bar：代码质量和测试要求（lint、类型检查、测试覆盖等）
5. Iteration Style：迭代节奏（激进 vs 保守、小步快跑 vs 大版本、是否要求每次迭代可发布）

对话策略：
- 每个维度给出 1-2 个示例，帮助用户理解期望的粒度
- 不要接受空洞的回答，引导用户给出具体内容
- Soul 可以简短，但每一条都必须是 AI Agent 能直接遵循的指令

当五个维度都足够清晰时，输出以下格式的完整文件（用 Markdown 代码块包裹）：

```markdown
# Soul: {Project Name}

## Principles
1. {原则一}
2. {原则二}
...

## Tech Preferences
{技术选型偏好}

## Red Lines
{不能做的事}

## Quality Bar
{质量标准}

## Iteration Style
{迭代节奏和风格}
```

输出预览后，询问用户是否确认写入，或是否需要继续修改。
```

**输出文件：`.anima/soul.md`（被管理项目的 `.anima/` 目录）**

---

### Vision & Soul 在后续流程中的作用

生成后，这两个文件作为上下文注入所有后续 Agent 交互：
- **Milestone 创建**：Agent 判断新 Milestone 是否符合 Vision 方向
- **Inbox 分析**：Agent 判断反馈是否值得做
- **迭代循环**：Developer 和 Acceptor 遵循 Soul 中的原则

### 编辑入口

主界面 **Settings 页**提供以下入口：
- **重新创建 Vision**：重新打开 Vision 对话框，完成后覆盖写入 `VISION.md`
- **重新创建 Soul**：重新打开 Soul 对话框，完成后覆盖写入 `.anima/soul.md`

用户也可以直接在外部编辑器中修改这两个文件；Anima 每次启动时重新读取，无需重启应用。

## Acceptance Criteria

- [ ] 添加项目后检测 `VISION.md` 和 `.anima/soul.md` 是否存在
- [ ] 缺失时在该项目内容区展示 Onboarding，先 Vision 后 Soul 依次引导
- [ ] 多个项目可同时处于不同引导阶段，互不干扰
- [ ] Agent 能通过追问引导用户完成 Vision 四个要素（Identity / Problem / Audience / Long-term Goal）
- [ ] Agent 能通过追问引导用户完成 Soul 五个维度（Principles / Tech Preferences / Red Lines / Quality Bar / Iteration Style）
- [ ] 生成内容以 Markdown 代码块形式展示在聊天界面内
- [ ] 用户可选择"确认写入"或"继续修改"，后者不会重置对话
- [ ] `VISION.md` 正确写入被管理项目根目录
- [ ] `.anima/soul.md` 正确写入被管理项目的 `.anima/` 目录
- [ ] 两者都存在时跳过 Onboarding 直接进入主界面
- [ ] Settings 页有入口可重新发起 Vision / Soul 创建对话
