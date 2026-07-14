# 分支区 item 与 toolbar 简化设计

**日期**：2026-07-14
**范围**：`src/web/components/repo-workspace/BranchSummaryInline.tsx`、`src/web/components/branch-list/BranchRow.tsx`、`src/web/components/repo-workspace/RepoExplorerPane.tsx`

## 目标

将 BranchArea 顶部 toolbar 的 [编辑]/[终端]/[最近操作] icon 迁移到每个分支 row 内部，形成固定的行内操作序列；同时简化每个分支 item 的信息展示，去掉冗余的 worktree 路径行，并移除 hash tag 的 badge 视觉样式。

## 变更清单

### 1. `BranchSummaryInline` — 分支 item 内容简化

- **移除**：位于 item 底部的 `worktreePath` 显示行（当前实现中 `<span title={worktreePath}>...{worktreePath}</span>`）。
- **修改**：`commitHashTag` 从 `<Badge variant="outline">` 组件改为普通的 `<span>` 内联文本，位于分支名右侧。样式：`font-mono text-[10px] tabular-nums`，颜色使用 `text-muted-foreground`（未选中）/`text-selected-muted-foreground`（选中）。
- **移除**：hash tag 上的 `title` 属性（不再产生单独的悬停 tooltip）。
- **保留**：外层 `<div>` 的 `title` 组合串仍包含 `worktreePath` 与 `commitHashTag`，因此整行悬停时仍可看到 worktree 路径与 hash 信息。
- **保留**：其它徽章（`terminal-count-badge`、`dirty-worktree-badge`、`branches.gone`、ahead/behind 指示器）位置与逻辑不变。
- **测试**：更新 `BranchSummaryInline` 相关的测试与快照，`data-testid="branch-hash-tag"` 应仍存在于新的 `<span>` 上（保证外部测试仍可选中）。

### 2. `BranchRow` — 行内操作固定 3 个 + dropdown

- 修改 `BranchRowActions` / `BranchRowRecentActions` 的组合结构：
  - 保留只在 `branch.worktree?.path` 存在时才渲染的规则。
  - 保留 `hidden md:flex` 响应式规则（小屏不显示 icon 组）。
- 新的行内布局（从左到右）：
  - `[编辑]` — 复用 `useBranchActionItems(repo, branch)` 中的 `externalItems.find(i => i.id === 'editor')`，用 `AsyncButton` + `EditorAppIcon` 渲染（图标 pref 来自 `useRuntimeExternalAppSettings()` 的 `resolvedEditorApp ?? editorApp`）。
  - `[终端]` — 同上，取 `externalItems.find(i => i.id === 'terminal')`，`TerminalAppIcon` 渲染。
  - `[最近1个操作]` — 现有 `BranchRowRecentActions` 逻辑保留，但 `slice(0, 3)` 改为 `slice(0, 1)`（`REPEATABLE_ACTION_IDS` 中最近一次去重后的动作）。
  - `[BranchActionsDropdown]` — 保持不变，位于最后。
- `externalItems` 里 `editor`/`terminal` 两个 item 由 `useBranchActionItems` 恒定返回；其 `disabled` 字段已反映"未配置"或"能力不可用"的情况，直接透传给 `AsyncButton.disabled`。**为避免布局跳动，不再对 button 做 undefined 判空返回 null**。

### 3. `RepoExplorerPane` — 顶部 toolbar 清理

- 删除 `BranchArea` 组件里的 `<Toolbar data-testid="branch-area-toolbar">` 及其内部所有内容，使 `BranchArea` 只渲染 `<BranchList>`。
- 删除以下现在只在 toolbar 中使用的辅助组件与常量：
  - `BranchAreaQuickActions`
  - `BranchAreaQuickActionsInner`
  - `BranchAreaRecentActions`
  - `BranchAreaRecentActionButton`
  - `RECENT_ACTION_ICONS` 常量
  - `recentActionTooltip` 函数
- 相应移除仅由这些组件使用的 lucide-react 图标 import（`ArrowDown`、`ArrowUp`、`CloudDownload`、`FolderPlus`、`FolderMinus`、`GitBranchPlus`、`GitCommitHorizontal`、`GitMerge`、`SendHorizontal`、`Trash2` 中未再被别处使用的项，需检查后清理）。
- 删除对应 `useRuntimeExternalAppSettings`、`EditorAppIcon`、`TerminalAppIcon`、`createElement` 等的 import（如没有其它使用者）。
- 更新 `RepoExplorerPane.test.tsx` 中涉及 `branch-area-toolbar`、`branch-area-editor-btn`、`branch-area-terminal-btn` 的多处测试断言：
  - toolbar 移除后，`branch-area-toolbar` 应始终 `toBeNull`；
  - `branch-area-editor-btn` / `branch-area-terminal-btn` 的定位从 toolbar 迁移到 branch row 内部（选中 branch 的 row 里查找）。

## 组件与数据关系

```
BranchRow
├─ BranchSummaryInline (第一行分支名 + hash tag muted span + 其它徽章；无第二行)
└─ BranchRowActions (仅当有 worktree)
   └─ hidden md:flex 内
      ├─ [编辑] AsyncButton  ← externalItems[id=editor]
      ├─ [终端] AsyncButton  ← externalItems[id=terminal]
      └─ [最近1个操作] BranchRowRecentActions (slice 0..1)
   └─ [编辑▼] BranchActionsDropdown (始终可见)
```

## 兼容性与边界条件

- **无 worktree 的分支**：`[编辑][终端][最近1]` 组不渲染（保持现状），只显示 `[BranchActionsDropdown]`。
- **小屏 (`< md`)**：行内 icon 组隐藏，只保留 `[BranchActionsDropdown]`。
- **无最近操作记录**：`BranchRowRecentActions` 返回 `null`，只显示 `[编辑][终端][BranchActionsDropdown]`。
- **编辑器/终端不可用**：按钮 disabled 显示，不消失。
- **BranchArea toolbar 空间回收**：删除 toolbar 后，`BranchList` 直接紧贴 `RepoExplorerPane` 顶部；无空 toolbar 占位。

## 交付

- 修改 3 个源文件：`BranchSummaryInline.tsx`、`BranchRow.tsx`、`RepoExplorerPane.tsx`
- 更新相关测试文件：`BranchSummaryInline.test.tsx`（若存在）、`BranchList.test.tsx`、`BranchRow` 相关测试。
- 保持 `data-testid="branch-hash-tag"`、`data-testid="branch-area-editor-btn"`、`data-testid="branch-area-terminal-btn"` 的可用性（可能需要将 testid 迁移到 row 内部的新按钮上）。
- 运行 `bun run typecheck`、`bun run test`、`bun run check:architecture` 确认。

## 未来工作 / 显式非目标

- 不改变 `useBranchActionItems`、`BranchActionsMenu`、`branch-action-state` 的行为或 API。
- 不修改最近操作的存储或去重规则（`worktreeActionHistories`、`REPEATABLE_ACTION_IDS`）。
- 不改变小屏的响应式策略；后续如有需要再单独讨论 compact 屏体验。
