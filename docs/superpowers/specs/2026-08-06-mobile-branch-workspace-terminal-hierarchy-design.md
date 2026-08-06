# Mobile Web 子工作区终端层级设计

## 背景

Mobile Web 隐藏全局项目 topbar，由当前紧凑表面的本地 topbar 承担上下文导航。普通 Git 仓库终端已经按“返回、项目、仓库、终端”的顺序展示上下文，并让整条内容参与横向滚动；子工作区根终端当前只有“返回、终端”，导致层级缺失且行为不一致。

## 目标

- 子工作区根终端在 Mobile Web topbar 中按“项目 > 子工作区 > 终端”展示。
- 项目和子工作区继续是可切换的现有上下文控件，终端继续使用现有紧凑终端切换器。
- 极窄视口下保持返回、上下文切换和终端切换连续可达。
- 桌面分栏与桌面终端 Focus 行为保持不变。

## 方案比较

### 采用：复用普通 Git 仓库的上下文链路

在 `BranchWorkspaceTerminalPanel` 的紧凑模式中依次渲染现有返回控件、`FocusProjectSwitcher`、`WorkspaceRepositorySwitcher` 和 `TerminalTabs`。`WorkspaceRepositorySwitcher` 已根据活动工作区上下文显示子工作区公共分支名，无需复制名称解析或导航状态。

整条链路复用 `mobile-topbar-scroll` 与 `mobile-topbar-scroll-content`，并让 `TerminalTabs` 在紧凑模式中使用上下文栏语义。

### 不采用：静态文字面包屑

静态文字可以显示层级，但会失去普通 Git 仓库已有的切换能力，并产生第二套项目名和子工作区名解析逻辑。

### 不采用：新建通用面包屑抽象

当前差异只在子工作区终端面板缺少既有控件和容器。新建抽象会扩大变更面，且不能为本次需求提供额外行为。

## 组件与状态

- 不新增状态、请求或协议。
- 项目层级由 `FocusProjectSwitcher` 读取现有项目状态。
- 子工作区层级由 `WorkspaceRepositorySwitcher` 读取现有活动工作区上下文，并展示公共分支名。
- 终端层级由 `TerminalTabs` 读取现有目录级终端快照。
- `toolbarLeading` 仍拥有 Mobile Web 返回子工作区范围列表的入口。

## 响应式与交互

- Mobile Web：使用紧凑 toolbar 高度；整条上下文链路横向滚动；项目和子工作区切换器使用紧凑宽度。
- 桌面普通分栏：不显示项目和子工作区上下文控件，保留现有终端 tabs 与拖拽区域。
- 桌面终端 Focus：继续显示退出、项目、子工作区和终端控件。
- 子工作区成员终端继续复用普通 Git 仓库的 `BranchDetailToolbar`，本次只修正子工作区根终端。

## 验证

- 回归测试先证明 Mobile Web 子工作区根终端缺少项目与子工作区层级。
- 验证修复后控件顺序为“返回、项目、子工作区、终端”。
- 验证紧凑参数、横向滚动容器和 toolbar 高度与普通 Git 仓库一致。
- 验证桌面非 Focus 不新增上下文控件，桌面 Focus 保持原行为。

## 文档影响

本次只统一既有 **Terminal topbar**、**Branch workspace** 和紧凑上下文导航，不新增领域术语，因此不修改 `CONTEXT.md`。
