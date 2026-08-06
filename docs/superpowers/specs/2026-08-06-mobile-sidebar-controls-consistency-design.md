# Mobile Web 左侧导航控件一致性设计

## 背景

普通 Git 仓库的 Mobile Web 终端 topbar 使用左面板图标打开工作区范围，按钮采用标准 `icon` 尺寸。子工作区根终端虽然已经展示“项目 > 子工作区 > 终端”层级，但层级前仍使用较小的普通返回箭头。

左侧范围面板中的项目、工作区仓库、子工作区和成员行共享三槽快捷动作 dock。编辑快捷图标在触控小屏上占用固定位置，而内部终端是移动端仍需直接点击的高频动作。

## 目标

- 子工作区根终端的 Mobile Web 层级入口与普通 Git 仓库使用相同的左面板图标和按钮尺寸。
- Mobile Web 左侧列表行不显示编辑快捷图标。
- Mobile Web 左侧列表行继续显示并允许点击内部终端快捷按钮。
- 桌面快捷动作、移动端上下文菜单和现有终端创建语义保持不变。

## 采用方案

### 子工作区终端层级入口

只修改 `BranchWorkspacePane` 传给子工作区根终端 topbar 的 `compactScopeButton`：将 `ArrowLeft`/`icon-xs` 替换为普通 Git 仓库 `BranchDetailToolbar` 已使用的 `PanelLeftOpen`/`icon`。文件表面的返回范围按钮仍使用原有箭头，因为它不是终端层级入口。

### 左侧列表快捷动作

在共享 `WorkspaceListItemActionDock` 的编辑槽应用小屏隐藏、`sm` 及以上恢复的响应式展示规则。内部终端槽和 More 菜单槽不添加隐藏规则，因此所有采用该共享 dock 的左侧列表保持一致。

编辑动作仍保留在现有上下文菜单中；本次只移除 Mobile Web 行内编辑快捷图标，不删除能力，也不改变桌面端。

## 不采用方案

- 不在 `SidebarProjectList`、`WorkspaceRepositoryList`、`BranchWorkspaceList` 和成员行分别判断移动端，避免重复和遗漏。
- 不删除 Mobile Web 上下文菜单中的编辑动作，因为用户只要求不显示行内 icon。
- 不新增图标组件或响应式状态，直接复用 Lucide 图标和既有 Tailwind 断点。

## 测试

- `BranchWorkspacePane` 的紧凑根终端测试断言范围按钮使用 `PanelLeftOpen` 且按钮尺寸为 `icon`，同时仍能返回范围面板。
- `WorkspaceListItem` 测试断言编辑槽在小屏隐藏、桌面恢复，内部终端槽不隐藏，并通过真实点击回调证明内部终端仍可用。
- 运行相关组件测试、类型检查、架构检查、Web 构建和完整测试。

## 文档影响

本次统一既有 Terminal topbar、紧凑范围导航和 Internal terminal 快捷动作，不新增领域术语，不修改 `CONTEXT.md`，也不需要 ADR。
