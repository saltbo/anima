# M1 — UI Foundation

## Goal

搭建 Electron + React 应用骨架，建立所有后续功能赖以构建的 UI 框架和工程基础。
包含应用启动后的第一个用户交互：选择要管理的项目目录。

## Tech Stack

- **Runtime**: Electron (macOS + Windows)
- **Frontend**: React + TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Build**: electron-vite
- **Package**: electron-builder

## Features

### 工程搭建
- Electron + React + TypeScript 项目初始化（electron-vite 模板）
- Tailwind CSS 集成
- shadcn/ui 组件库集成
- ESLint + Prettier 代码规范配置
- macOS (.dmg) 和 Windows (.exe) 打包脚本配置（实际跨平台产物在 CI 中验证）

### 项目选择（Welcome 页）

Anima 管理的是外部项目。应用启动后，首先需要确定"要管理哪个项目目录"。

**交互逻辑：**
- 应用首次启动，或没有已打开的项目时，展示 **Welcome 页**
- Welcome 页提供：
  - **"Open Project"** 按钮：调用系统目录选择对话框，用户选择项目根目录
  - **"Recent Projects"** 列表：展示最近打开的项目路径，点击直接打开

**数据持久化：**
- 已打开的项目路径保存在 Anima 自身的 app-level 配置中（与项目无关）
- 路径: `~/Library/Application Support/Anima/config.json`（macOS）
- 应用启动时读取 `last_project_path`，若有效则直接打开，跳过 Welcome 页

**打开项目后：**
- 进入主界面（具体是 Onboarding 还是 Dashboard，由 M2 的检测逻辑决定）
- 顶部标题栏展示当前项目名（取目录名）

### 应用布局
- 左侧固定导航栏，包含以下入口：
  - Dashboard（总览）
  - Milestones（里程碑列表）
  - Inbox（待办条目）
  - Settings（设置）
- 顶部标题栏：显示应用名称、当前打开的项目名、当前页面
- 主内容区：根据导航切换页面
- 左侧导航在未打开项目时（Welcome 页）隐藏

### 页面骨架（内容可为空/占位符）

| 页面 | 路由 | 说明 |
|------|------|------|
| Welcome | `/welcome` | 项目选择页（Open / Recent Projects） |
| Dashboard | `/dashboard` | 总览页，预留核心指标展示区域 |
| Milestone List | `/milestones` | 里程碑列表页，预留列表和"新建"入口 |
| Create Milestone | `/milestones/new` | 对话式创建页，预留聊天界面区域 |
| Iteration Monitor | `/milestones/:id/monitor` | 迭代监控页，预留双 Agent 面板区域 |
| Inbox | `/inbox` | 待办条目列表页，预留列表和"新建"入口 |
| Settings | `/settings` | 设置页，预留 Vision / Soul 编辑入口区域 |

## Acceptance Criteria

- [ ] 应用在 macOS 上可正常启动
- [ ] 首次启动（无历史记录）时展示 Welcome 页
- [ ] Welcome 页可通过系统对话框选择项目目录
- [ ] Recent Projects 列表展示历史路径，点击可直接打开
- [ ] 选择项目后顶部标题栏展示当前项目名
- [ ] 左侧导航可在 Dashboard / Milestones / Inbox / Settings 间正常切换
- [ ] Welcome 页时左侧导航隐藏
- [ ] 所有页面骨架可正常渲染（无报错）
- [ ] `npm run build` 能产出 macOS 安装包（.dmg），Windows 打包脚本配置完毕
- [ ] 代码通过 ESLint 检查无错误
