# 文件区友好横向滚动条设计

## 摘要

保留左侧导航与文件区现有的横向滚动能力，将其中的原生横向滚动条统一为已确认的“细胶囊，悬停增强”样式。默认状态降低视觉权重，悬停或拖动时扩大可见滑块并使用主题强调色。

## 已确认方案

- 横向溢出和拖动滚动继续存在，不通过收缩内容或隐藏 overflow 消除滚动条。
- WebKit 原生横向 scrollbar 保留 8px 操作区域。
- thumb 默认显示为 4px 低对比度胶囊。
- thumb 在 hover/active 时显示为 6px，并沿用现有主题 hover/active 色。
- track 与 corner 保持透明。
- Firefox 继续使用现有 `scrollbar-width: thin` 和主题色能力。
- Radix 横向 ScrollArea 已采用相同的 8px/4px/6px 几何和主题状态色，不修改其行为。

## 方案比较

### A：共享区域作用域（采用）

把现有仅用于文件树的横向 scrollbar 几何提升到 `.project-navigation-tone` 与 `.project-file-area-tone` 的原生 scrollbar 作用域。`FileAreaSplitPane` 再将文件区 tone 传给 `SplitPane` 的 `afterClassName`，使 `ResizablePanel` 生成的真实滚动容器进入该作用域。历史面板和其他文件区内容继续复用同一套样式。

优点：与现有主题架构一致、无需业务组件感知、避免逐组件重复。缺点：作用域内所有原生横向滚动条都会统一变化，这是本需求期望的行为。

### B：历史面板专用 class

只给历史面板添加 class 并复制 scrollbar 样式。范围最小，但会让文件树与历史面板维护两份相同规则，未来其他文件区横向滚动条仍可能不一致。

### C：迁移到 Radix ScrollArea

将产生原生滚动条的容器迁移到共享 Radix 组件。DOM 和交互更统一，但会改变滚动所有权、测量与显隐行为，超出视觉修正范围。

## 架构与实现

`src/web/theme/contract.css` 继续作为唯一 scrollbar 主题与几何样式所有者：

1. 现有语义 token 提供默认、hover、active 三态颜色。
2. 现有区域选择器继续负责原生纵向和横向 scrollbar 的基础样式。
3. 新的共享横向规则覆盖 scrollbar 高度与 thumb 透明边框，使默认可见高度为 4px，hover/active 为 6px。
4. 删除文件树专用的同等规则，避免重复。
5. `FileAreaSplitPane` 通过 `afterClassName="project-file-area-tone"` 标记 `SplitPane` 的文件区内容容器；该容器保留 `overflow: auto`，只是获得主题作用域。

业务内容面板不增加专用 scrollbar class，不改变布局、滚动行为或数据流。布局适配器只复用已有的语义 tone class 标记真实滚动所有者。

## 非目标

- 不消除历史面板或其他文件区的横向滚动。
- 不修改纵向 scrollbar 尺寸。
- 不修改终端 xterm、设置、菜单或右侧详情区 scrollbar。
- 不增加动画、设置项、依赖或逐主题 scrollbar 配置。
- 不改变滚轮、触控板、拖动、自动隐藏或键盘滚动行为。

## 测试与验收

- 主题契约测试锁定共享区域原生横向 scrollbar 的 8px 高度。
- 测试锁定 thumb 默认 2px 透明边框，以及 hover/active 的 1px 边框。
- 测试确认规则不再依赖 `.project-file-tree-scroll` 专用选择器。
- `FileAreaSplitPane` 测试确认文件区的 `ResizablePanel` 内容容器接收 `.project-file-area-tone`。
- 历史面板保留原有布局，不添加用于消除横向溢出的 `min-w-0` 约束。
- 运行针对性测试、`bun run typecheck`、`bun run test`、`bun run check:architecture`、Prettier 与 `git diff --check`。

## 工程原则

- KISS：只调整共享 CSS 几何，并在布局适配器上复用现有 tone 标记。
- DRY：把文件树专用规则提升为区域共享规则。
- YAGNI：不引入专用 React 组件或用户配置。
- SOLID：主题 contract 继续单独负责视觉语义，业务面板保持业务职责。
