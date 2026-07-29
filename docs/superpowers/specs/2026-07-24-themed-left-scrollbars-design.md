# 左侧区域主题化滚动条设计

## 摘要

让左侧导航区域与文件区的纵向、横向滚动条跟随当前颜色主题。实现复用现有 CSS token 和区域 tone class，不增加 React 主题分支、不改变滚动行为，也不扩大到终端或右侧详情区。

## 已确认范围

- 左侧项目列表。
- 多仓库工作区的仓库列表与子工作区列表。
- 分支列表。
- 文件区的原生横向、纵向滚动条。
- 分离文件区窗口中的同类滚动条。
- 全局主题与项目级有效主题切换后立即更新，无需重新挂载组件。

## 方案比较

### 方案 A：区域作用域 + 语义 token（采用）

在主题 contract 中定义 scrollbar thumb 的默认、hover、active 语义色；由现有 `.project-navigation-tone` 与 `.project-file-area-tone` 统一应用到原生 scrollbar 和 Radix ScrollArea thumb。

优点：改动集中、纯 CSS 响应主题切换、覆盖既有原生和 Radix 两种实现、不会污染业务组件。缺点：Radix thumb 需要一个稳定的 `data-slot` 钩子。

### 方案 B：逐组件添加主题 scrollbar class

给每个 `overflow-*` 容器和 `ScrollArea` 调用点添加 class。

优点：作用范围显式。缺点：重复且容易漏掉未来新增的左侧滚动容器，与 DRY 不符。

### 方案 C：把所有容器迁移到 Radix ScrollArea

统一滚动实现后只修改共享组件。

优点：DOM 与交互一致。缺点：改动面大，可能影响文件树横向滚动、拖拽与键盘定位，超出当前需求。

## 视觉设计

### Token

- `--color-scrollbar-thumb`：以主题次级文字色为基础，降低不操作时的视觉权重。
- `--color-scrollbar-thumb-hover`：混入主题 accent，明确当前可操作目标。
- `--color-scrollbar-thumb-active`：进一步提高 accent 占比，形成按压反馈。
- track 与 corner 保持透明，让滚动条贴合其所在的 sidebar/file-area 表面。

所有颜色由每个主题已有的 `--goblin-text-secondary` 与 `--goblin-accent` 派生，不维护第二套逐主题色板。

### 形态

- 原生 scrollbar 使用 10px 布局宽度，thumb 通过 3px 透明边框呈现为细胶囊。
- Radix ScrollArea 保留现有宽度、显隐延迟与命中区域，只替换颜色来源。
- 横向和纵向使用同一状态色，避免方向造成无意义的视觉差异。
- 不新增动画；保留 Radix 现有的 opacity 与尺寸过渡。

### 独特点

静止时滚动条保持克制，用户 hover/拖动时才显露所选主题的 accent。这种“操作时显色”把主题辨识集中在交互瞬间，不与文件状态色、选中态和终端指示器争夺注意力。

字体和布局不变；本需求没有新增文案。

## 架构

`src/web/theme/contract.css` 是唯一颜色与区域样式所有者：

1. theme preset 提供 `--goblin-text-secondary` 与 `--goblin-accent`。
2. contract 派生三个 scrollbar 语义 token。
3. `.project-navigation-tone` 与 `.project-file-area-tone` 将 token 应用于其后代原生 scrollbar。
4. 同一作用域通过稳定的 `data-slot="scroll-area-thumb"` 覆盖 Radix thumb 状态色。

`src/web/components/ui/scroll-area.tsx` 只增加无行为的 DOM 标识，不读取主题状态。

## 非目标

- 不修改终端 xterm scrollbar；它继续使用 terminal foreground token。
- 不统一应用到设置对话框、菜单或右侧详情面板。
- 不改变 scrollbar 尺寸、滚动方式、自动隐藏、拖拽或触控行为。
- 不增加设置项、自定义颜色或依赖。

## 测试

- contract 测试锁定三个 scrollbar 语义 token。
- contract 测试锁定两个区域 tone class 对原生横/纵 scrollbar 和 Radix thumb 的覆盖。
- ScrollArea 组件测试确认 thumb 暴露稳定的 `data-slot`。
- 运行 `bun run typecheck`、`bun run test` 与 `bun run check:architecture`。

## 验收标准

- 所选主题变化时，左侧项目、工作区、分支列表的滚动条颜色立即变化。
- 文件区横向与纵向滚动条颜色立即变化，包括分离文件区窗口。
- 默认、hover、active 三态可区分，track/corner 透明。
- 不出现 React 主题条件分支，不修改滚动行为，不影响终端和右侧详情区。
- 类型检查、测试和架构检查通过。

## 工程原则

- KISS：基于两个既有区域作用域完成覆盖。
- DRY：统一派生 token 与作用域规则，不逐组件复制 scrollbar CSS。
- YAGNI：不迁移滚动组件、不增加用户配置。
- SOLID：主题 contract 负责视觉语义，ScrollArea 只负责滚动结构。
