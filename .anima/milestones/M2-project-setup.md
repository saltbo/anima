# M2 — Project Setup

## Goal

引导用户为他们的项目创建 Vision 和 Soul，这是 Anima 能够工作的前提。
没有 Vision 和 Soul，Anima 不知道项目要去哪里、应该遵循什么原则。

## 触发时机

Anima 启动时检测项目目录：
- 没有 `VISION.md` → 进入 Vision 创建引导
- 没有 `.anima/soul.md` → 进入 Soul 创建引导
- 两者都有 → 直接进入主界面

两者独立检测，可以只缺其中一个。

## Features

### Onboarding 界面

首次进入时展示欢迎页，说明：
- 什么是 Vision（项目要去哪里）
- 什么是 Soul（项目如何行事）
- 为什么需要它们

两个步骤顺序引导：先 Vision，再 Soul。

---

### Step 1：创建 Vision

通过与 Agent 对话，生成项目的 `VISION.md`。

**Agent 职责：**
- 引导用户说清楚：
  - 这个项目是什么（Identity）
  - 它要解决什么问题（Problem）
  - 目标用户是谁（Audience）
  - 长期愿景是什么（Long-term goal）
- 追问直到信息足够完整
- 生成结构化的 `VISION.md` 并展示给用户预览
- 用户确认后写入项目根目录

**输出文件：`VISION.md`（项目根目录）**

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

---

### Step 2：创建 Soul

通过与 Agent 对话，生成项目的 `.anima/soul.md`。

**Agent 职责：**
- 引导用户定义项目的行事原则：
  - 代码质量标准
  - 技术选型偏好
  - 不能触碰的红线
  - 迭代节奏和风格
- Soul 可以简短，但每一条都要具体、可执行
- 生成后展示预览，用户确认后写入

**输出文件：`.anima/soul.md`**

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
```

---

### Vision & Soul 在后续流程中的作用

生成后，这两个文件作为上下文注入所有后续 Agent 交互：
- **Milestone 创建**：Agent 判断新 Milestone 是否符合 Vision 方向
- **Inbox 分析**：Agent 判断反馈是否值得做
- **迭代循环**：Developer 和 Acceptor 遵循 Soul 中的原则

### 编辑入口

主界面设置页提供入口，允许用户随时重新编辑 Vision 和 Soul（重新打开对话框或直接编辑文件）。

## Acceptance Criteria

- [ ] 启动时检测 `VISION.md` 和 `.anima/soul.md` 是否存在
- [ ] 缺失时自动进入对应的创建引导流程
- [ ] Agent 能通过追问引导用户完成 Vision 的四个要素
- [ ] Agent 能通过追问引导用户完成 Soul 的核心原则
- [ ] 用户可预览生成内容后再确认写入
- [ ] `VISION.md` 正确写入项目根目录
- [ ] `.anima/soul.md` 正确写入 `.anima/` 目录
- [ ] 两者都存在时直接跳过引导进入主界面
- [ ] 设置页有入口可重新编辑
