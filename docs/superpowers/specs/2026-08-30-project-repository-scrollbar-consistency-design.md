# 项目与仓库列表滚动条一致性设计

## 目标

让左侧“项目列表”和当前项目下的“Git 仓库列表”使用同一套细窄、无显眼轨道的纵向滚动条视觉。修改只覆盖这两处列表；文件区、横向滚动条、菜单、终端和其他滚动容器保持现状。

## 现状与原因

两处列表都使用原生 `overflow-y-auto`，但它们处于不同的主题作用域：

- `SidebarProjectList` 位于顶部项目区，当前使用浏览器原生滚动条。
- `WorkspaceRepositoryListPane` 位于 `.project-navigation-tone` 内，会命中主题契约中的 WebKit 原生滚动条规则。在 Windows Electron 中，这条路径会呈现带上下按钮和明显轨道的滚动条。

因此，不一致来自 CSS 作用域与浏览器滚动条路径，而不是列表布局、滚动逻辑或仓库状态。

## 方案比较

### 方案 A：共享语义类与精确 WebKit 滚动条契约（采用）

给两个原生滚动容器添加同一个 `project-list-scrollbar` 类，在主题契约中复用现有 `--color-scrollbar-thumb` token，并通过 WebKit 伪元素明确使用 `8px` 透明轨道和 `4px` 可见 thumb。

优点：作用范围精确；两个列表有同一视觉来源；像素不再由 Windows 平台决定；保留主题色；不改变 DOM 结构和交互；新增列表可显式复用。缺点：该视觉契约只面向当前 Electron/Chromium 渲染路径，不提供标准属性兼容回退。

### 方案 B：重写全部导航和文件区的原生滚动条规则

把现有 `.project-navigation-tone` 与 `.project-file-area-tone` 的全部滚动条切换到标准属性优先。

优点：可以统一更大的界面范围。缺点：会改变文件区、分支区和其他导航滚动容器，超出本次已确认范围，回归面更大。

### 方案 C：把两个列表迁移到 Radix ScrollArea

用共享 `ScrollArea` 组件替换原生溢出容器。

优点：滚动条 DOM 和像素视觉完全由应用控制。缺点：会改变布局层级、拖拽命中、键盘行为和尺寸计算，远超单一视觉修复所需。

## 设计

### 主题契约

`src/web/theme/contract.css` 新增 `.project-list-scrollbar` WebKit 伪元素规则：

- `::-webkit-scrollbar` 固定为 `8px`，不再使用由平台决定实际像素的 `scrollbar-width: thin`。
- track 与 corner 保持透明；thumb 使用 `2px` 透明边框，得到 `4px` 可见宽度。
- scrollbar button 明确隐藏，不显示截图中的顶部箭头。
- thumb 默认、hover 与 active 颜色继续复用现有三个 scrollbar 主题 token。
- 目标规则放在导航区既有 `10px` 规则之后，确保 Git 仓库列表命中精确的细样式。
- 不定义新的颜色 token，不增加主题分支或设置项。

该规则放在现有滚动条主题契约附近，继续由主题层单独负责视觉语义。

### 组件接入

- `SidebarProjectList.tsx`：在项目列表 `<ul>` 上添加 `project-list-scrollbar`。
- `WorkspaceRepositoryListPane.tsx`：在仓库列表的原生滚动 `<div>` 上添加同一类。

两处继续保留现有 `overflow-y-auto`、高度约束、内边距、拖拽上下文和调整高度行为。没有数据流、状态所有权、事件处理或可访问性变化。

### 错误与目标环境

滚动条样式不产生运行时错误路径。当前目标是 Electron/Chromium 的 WebKit 伪元素渲染路径；目标类不再保留标准滚动条属性或粗滚动条兼容回退。

## 测试

按 TDD 顺序覆盖三个契约：

1. 主题契约测试锁定 `.project-list-scrollbar` 的 `8px` 轨道、`4px` 可见 thumb、主题颜色、透明轨道和覆盖顺序，并禁止重新引入平台决定宽度的标准属性。
2. 项目列表组件测试锁定其滚动容器使用共享类。
3. 仓库列表组件测试锁定其滚动容器使用共享类。

实现后运行聚焦测试，再运行 `bun run typecheck`、`bun run test` 和 `bun run check:architecture`。

## 验收标准

- Windows Electron 中，两处纵向滚动条都呈现细窄样式，不再只有仓库列表显示宽白轨道和上下箭头。
- 默认、主题切换后的 thumb 颜色继续来自现有主题 token，轨道透明。
- 项目拖拽、仓库列表高度调整、鼠标滚轮、触控板和键盘滚动行为不变。
- 文件区、横向滚动条、菜单、终端和其他滚动容器不受影响。
- 类型检查、完整测试和架构检查通过。

## 工程约束

- KISS：只增加一个共享 CSS 视觉契约和两个接入点。
- DRY：两个列表复用同一组伪元素规则，不在组件中复制样式。
- YAGNI：不迁移滚动组件，不新增偏好或颜色系统。
- 架构边界：改动只在 `src/web/**` 与文档中，不引入跨进程依赖。
