# 终端自定义按钮排序与网格编辑设计

## 背景

当前“设置 - 终端”的自定义终端按钮已经支持显示开关、按钮大小、标签、发送内容和动作类型。按钮在终端中的显示顺序由 `terminalCustomButtons` 数组顺序决定，但设置页编辑器没有排序能力；编辑时每个按钮以单列堆叠展示，配置多个按钮时空间利用率较低。

本设计在不改变持久化模型和终端渲染消费方式的前提下，为自定义终端按钮编辑器增加排序能力，并把编辑区改成紧凑的响应式网格。

## 目标

- 自定义终端按钮支持排序。
- 排序方式同时支持拖拽和上移/下移按钮。
- 编辑器采用响应式网格：窄屏单列，宽屏多列，最多三列。
- 编辑卡片保持紧凑，`value` 默认约两行高度并允许手动纵向调整。
- 排序、编辑、添加、删除统一进入未保存状态，点击“保存”后写入设置。
- 数据模型保持现有 `terminalCustomButtons` 数组，不新增 `order` 字段。

## 非目标

- 不增加按钮分组、图标、快捷键、变量模板或搜索过滤。
- 不改变终端底部按钮栏的渲染逻辑。
- 不改变 server settings schema 或规范化规则。
- 不引入新的拖拽依赖。
- 不把拖拽或移动操作改成即时保存。

## 组件结构

改动集中在 `src/web/components/settings/pages/TerminalSettings.tsx`。

将现有自定义按钮编辑区拆成两个小单元：

- `TerminalCustomButtonGrid`：渲染按钮编辑网格，接入 `DndContext` / `SortableContext`，处理拖拽结束后的本地重排。
- `TerminalCustomButtonCard`：渲染单个按钮的编辑卡片，负责标签、内容、动作、拖拽柄、上移、下移和删除控件。

`TerminalSettings` 继续持有当前的 `EditableTerminalCustomButton[] rows`、`dirty` 和保存逻辑。子组件只通过回调请求更新 `rows`，避免引入新的状态所有者。

## 数据流

排序只改变本地 `rows` 顺序：

1. 用户拖拽、点击上移或点击下移。
2. UI 调用同一个 `moveRow(fromIndex, toIndex)` helper。
3. helper 返回重排后的 `rows`。
4. `updateRows(nextRows)` 更新本地状态并设置 `dirty=true`。
5. 用户点击“保存”。
6. 现有 `validButtons(rows)` 过滤和规范化有效按钮。
7. 调用现有 `setTerminalCustomButtons(nextButtons)` 写入设置。
8. 保存成功后用 `editableFromButtons(nextButtons)` 重建本地 rows 并清除 dirty。

终端按钮栏无需修改，因为它已经按 `terminalCustomButtons.map(...)` 顺序渲染。

## 交互设计

编辑区使用 CSS grid：

- 窄屏：一列。
- 中等宽度：两列。
- 宽屏：最多三列。

每张卡片由两块组成：

- 顶部工具条：拖拽柄、序号、动作选择、上移、下移、删除。
- 内容区：`label` 输入框和 `value` 文本框。

拖拽柄使用 `GripVertical` 图标并提供 `aria-label` 和 `title`。上移和下移使用 `ArrowUp` / `ArrowDown` 图标。首项禁用上移，末项禁用下移。删除仍只删除本地 row，不立即写入。

`value` 文本框默认保持约两行高度，并保留 `resize-y`，让用户可以编辑多行命令而不破坏默认网格密度。

## 拖拽实现

复用项目现有 `@dnd-kit`：

- `DndContext`
- `PointerSensor`
- `KeyboardSensor`
- `closestCenter`
- `SortableContext`
- `rectSortingStrategy`
- `useSortable`
- `arrayMove`

拖拽结束时，如果 `active.id` 和 `over.id` 不同，则根据 row id 找到源索引和目标索引，再调用 `moveRow`。拖拽中的卡片只做轻量视觉反馈，例如提升层级、阴影或背景变化。

上移、下移按钮也复用 `moveRow`，保证拖拽和按钮排序行为一致。

## 边界规则

沿用当前保存规则：

- 空 `label` 或空 `value` 的 row 可在编辑中存在。
- 保存时只保留 `label.trim().length > 0` 且 `value.trim().length > 0` 的按钮。
- 保存时对 `label` 做 trim。
- `value` 原样保存。
- 最多保存 20 个有效按钮。
- `action` 只允许 `execute` 或 `input`，缺省视为 `execute`。

排序作用于当前编辑列表，包括尚未有效的空 row。这样用户可以先调整位置，再补充内容。

## 错误处理

保存失败继续沿用现有 settings controller 行为，不新增 toast、重试队列或错误状态。拖拽、上移和下移都是本地状态变更，不涉及异步错误。

如果拖拽结束时没有有效目标、源目标相同，或 row id 找不到索引，则不改变列表。

## 测试与验证

更新 `src/web/components/SettingsSurface.test.tsx`，覆盖：

- 添加多个按钮后，点击上移/下移会改变保存 payload 中 `terminalCustomButtons` 的数组顺序。
- 首项上移按钮禁用，末项下移按钮禁用。
- 网格编辑仍能保存 `label`、`value` 和 `action`。
- 纯函数测试覆盖 `moveRow` 的正常移动、边界索引和无效索引。
- 组件测试覆盖拖拽 wiring：通过 mocked `DndContext` 触发 `onDragEnd`，确认保存 payload 顺序变化。

验证命令：

- `bun run typecheck`
- `bun run test src/web/components/SettingsSurface.test.tsx`
- 必要时运行 `bun run test`

## 原则应用

- KISS：顺序继续由数组位置表达，不新增排序字段或额外持久化层。
- YAGNI：不实现分组、模板、图标等未要求能力。
- DRY：拖拽和上/下按钮共用同一个本地重排 helper。
- SOLID：网格容器负责排序，卡片负责单项编辑，设置页负责状态和保存。
