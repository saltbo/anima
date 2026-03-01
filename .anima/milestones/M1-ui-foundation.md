# M1 — UI Foundation

## Goal

搭建 Electron + React 应用骨架，建立所有后续功能赖以构建的 UI 框架和工程基础。

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
- macOS (.dmg) 和 Windows (.exe) 打包配置

### 应用布局
- 左侧固定导航栏，包含以下入口：
  - Dashboard（总览）
  - Milestones（里程碑列表）
- 主内容区，根据导航切换页面
- 顶部标题栏（显示应用名称和当前页面）

### 页面骨架（内容可为空/占位符）
- **Dashboard**：总览页，预留核心指标展示区域
- **Milestone List**：里程碑列表页，预留列表和"新建"入口
- **Create Milestone**：对话式创建页，预留聊天界面区域
- **Iteration Monitor**：迭代监控页，预留双 Agent 面板区域

## Acceptance Criteria

- [ ] 应用在 macOS 上可正常启动
- [ ] 应用在 Windows 上可正常启动
- [ ] 左侧导航可在各页面间正常切换
- [ ] 所有页面骨架可正常渲染（无报错）
- [ ] `npm run build` 能产出 macOS 和 Windows 的安装包
- [ ] 代码通过 ESLint 检查无错误
