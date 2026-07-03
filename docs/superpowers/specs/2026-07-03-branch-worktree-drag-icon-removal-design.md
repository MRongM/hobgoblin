# Branch Worktree Drag Icon Removal Design

## 背景

`BranchList` 在 Worktrees 视图中使用 dnd-kit 允许用户重排已关联 worktree 的分支行。当前 `SortableBranchRow` 通过 `useSortable()` 获取排序属性和监听器，再把它们作为 `dragHandle` 传给 `BranchRow`。`BranchRow` 因此会在行最左侧渲染一个独立的 `GripVertical` 按钮，并为该按钮预留 `1.75rem` 的 grid 列。

用户确认不需要显示分支区工作树前面的可拖拽 icon，但仍按推荐方案保留 worktree 排序能力。目标是移除左侧拖拽图标和占位列，让工作树行视觉上回到普通分支行，同时保持 Worktrees 视图的排序交互。

## 目标

- Worktrees 视图不再显示工作树行前面的 `GripVertical` 拖拽 icon。
- Worktrees 视图不再为拖拽 icon 预留左侧空列。
- Worktrees 视图继续支持 worktree 行拖拽排序。
- All 视图和 No Worktree 视图继续不显示拖拽入口。
- 点击行选择分支、双击打开 status、action menu、selected state、terminal badge 和 worktree path 展示保持不变。
- 继续使用现有 dnd-kit 排序状态和 `reorderWorktrees(repoId, fromPath, toPath)` 数据流。

## 非目标

- 不移除 worktree 排序能力。
- 不新增设置项或 feature flag。
- 不改变 `worktreePathOrder` 的存储、持久化或排序 helper。
- 不调整 detached worktree 行。
- 不改变 terminal tab、repo tab 或其他 sortable UI 的拖拽表现。
- 不引入新的图标、tooltip 或说明文案。

## 方案

采用“隐藏 icon，整行作为拖拽激活区”的方案。

`BranchRow` 不再导入或渲染 `GripVertical`，也不再接收 `dragHandle` prop。`BranchRow` 继续接收 `sortable` prop，用于设置 `<li>` 的 `ref`、style、dragging class，以及可选的行级 sortable attributes/listeners。布局只根据 `showActions` 决定列结构：有 action 时使用 `grid-cols-[minmax(0,1fr)_auto]`，无 action 时使用 `grid-cols-1`。内容区域始终使用 `px-4`，不再因为拖拽 handle 切换成 `pr-4`。

`SortableBranchRow` 继续调用 `useSortable({ id })`，但不再传 `dragHandle`。它把 `attributes` 和 `listeners` 作为行级 sortable props 交给 `BranchRow`。dnd-kit 的 `PointerSensor` 继续使用现有 `activationConstraint: { distance: 6 }`，避免普通点击立即进入拖拽。`BranchRow` 的行级 `onClick` 和 `onDoubleClick` 保持当前分支选择和 status 打开行为；当用户移动超过拖拽阈值时，由 dnd-kit 处理排序。

## 数据流与行为

变更前：

1. Worktrees 视图渲染 worktree 分支行。
2. `SortableBranchRow` 把 `useSortable()` 的 attributes/listeners 绑定到 `BranchRow.dragHandle`。
3. `BranchRow` 渲染左侧 `GripVertical` 按钮。
4. 用户拖动该按钮后，`DndContext.onDragEnd` 调用 `reorderWorktrees()`。

变更后：

1. Worktrees 视图渲染 worktree 分支行。
2. `SortableBranchRow` 把 `useSortable()` 的 attributes/listeners 绑定到整行。
3. `BranchRow` 不渲染任何拖拽 icon 或左侧占位列。
4. 用户拖动行并超过 6px 阈值后，`DndContext.onDragEnd` 继续调用 `reorderWorktrees()`。
5. 用户普通点击行时仍选择分支，双击仍打开 status。

## 错误处理

该改动不新增异步流程和错误分支。拖拽结束时仍沿用现有保护：没有 `over`、拖到自身、缺失 repo 或无效 worktree path 时由现有 store/data flow no-op 处理。

## 测试与验证

需要更新 `src/web/components/BranchList.test.tsx`：

- 将“shows drag handles only in worktrees view without search”改为断言 Worktrees 视图不再显示 `branches.reorder-worktree` 按钮或 `lucide-grip-vertical` 图标。
- 保留或新增断言：Worktrees 视图仍注册 `DndContext.onDragEnd`，并且模拟 drag end 后 `worktreePathOrder` 仍更新。
- 保留 All 视图不显示拖拽入口的测试。
- 更新 stale branch search 相关测试：不再期待 handle 数量，但仍验证搜索状态不会阻止 Worktrees 视图显示 worktree rows；如当前代码仍会在 Worktrees 视图启用 DnD，则测试应只覆盖本次 icon 隐藏和排序能力，不扩大到搜索语义。

建议执行：

1. `bun run test "src/web/components/BranchList.test.tsx"`
2. `bun run test`
3. `bun run typecheck`
4. `bun run check:architecture`

## 自审

- 无未完成标记或悬而未决的需求。
- 范围明确：隐藏 worktree 拖拽 icon 和左侧占位列，不移除排序能力。
- 数据流保持现有 store 和 dnd-kit 边界，不新增状态。
- 行为风险集中在点击与拖拽共用整行，现有 6px activation constraint 是主要缓冲。
- 与当前未提交的终端字体和历史列表改动无文件重叠，后续实现可独立计划。
