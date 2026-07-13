# 工作树操作历史功能设计

## 概述

在仓库工具栏右侧添加工作树操作历史展示区域，显示当前选中工作树最近 3 次 Git 操作的图标，支持点击重新执行操作。历史记录持久化到磁盘。

## 需求确认

- **历史范围**：当前选中工作树的操作历史
- **操作类型**：Git 操作（checkout、pull、push、commit、merge、create worktree、delete branch 等）
- **交互行为**：点击图标重新执行该操作
- **持久化**：保存到磁盘，重启后保留

## 架构设计

### 组件结构

```
RepoToolbar (src/web/components/repo-toolbar/RepoToolbar.tsx)
├── FocusBranchControls (左侧)
└── 右侧控制区
    ├── WorktreeActionHistory (新增) ← 显示最近3次操作图标
    ├── ProjectThemeMenuConnected
    └── WorkspaceLayoutControlConnected
```

### 数据流

1. **存储层**：扩展 `RepoWorktreeState` 添加 `actionHistory` 字段
2. **持久化层**：在 `persistence.ts` 中添加工作树历史记录的持久化逻辑
3. **记录层**：在执行 Git 操作时记录到对应工作树的历史
4. **展示层**：`WorktreeActionHistory` 组件从 store 读取并渲染图标

### 类型定义

#### 扩展 RepoEventAction

```typescript
// src/web/stores/repos/types.ts
export type RepoEventAction =
  | { kind: 'checkout'; branch: string }
  | { kind: 'pull'; branch: string }
  | { kind: 'push'; branch: string }
  | { kind: 'commit'; branch: string; message: string }
  | { kind: 'merge'; branch: string; sourceBranch: string }
  | { kind: 'createWorktree'; branch: string; worktreePath: string }
  | { kind: 'createBranch'; branch: string; baseBranch: string }
  | { kind: 'trackRemoteBranch'; branch: string; remoteRef: string }
  | { kind: 'deleteBranch'; branch: string }
  | { kind: 'removeWorktree'; branch: string; worktreePath: string; alsoDeleteBranch: boolean }
```

#### 扩展 RepoWorktreeState

```typescript
// src/web/stores/repos/types.ts
export interface RepoWorktreeState {
  path: string
  branch?: string
  head?: string
  isDetached?: boolean
  isMain: boolean
  isDirty?: boolean
  changeCount?: number
  isLocked?: boolean
  actionHistory?: RepoEventAction[]  // 新增：操作历史，最新的在前
}
```

#### 扩展 RestorableRepoSnapshot

```typescript
// src/web/stores/repos/persistence.ts
interface RestorableRepoSnapshot {
  // ... 现有字段
  worktreeActionHistories?: Record<string, RepoEventAction[]>
  // key: worktreePath, value: 该工作树的操作历史
}
```

## 操作历史记录机制

### 记录时机

在以下位置记录操作：
- `useBranchWriteActions.tsx` - 当执行 branch action 成功后
- 服务端返回成功的 `RepoEvent` 时，在前端 store 中记录

### 记录逻辑

在 `ReposStore` 中添加新的 action：

```typescript
addWorktreeActionHistory: (repoId: string, worktreePath: string, action: RepoEventAction) => {
  const repo = get().repos[repoId]
  if (!repo) return
  
  const worktree = repo.data.worktreesByPath[worktreePath]
  if (!worktree) return
  
  const history = worktree.actionHistory ?? []
  const newHistory = [action, ...history].slice(0, 10) // 保留最近10条
  
  set((state) => {
    const repo = state.repos[repoId]
    if (!repo) return
    
    repo.data.worktreesByPath[worktreePath] = {
      ...worktree,
      actionHistory: newHistory,
    }
  })
  
  // 触发持久化
  persistRestorableRepoSnapshot(set, get().repos[repoId], repo.instanceToken)
}
```

### 操作去重策略

**选择方案**：全部记录，不去重

**理由**：
1. 用户可能需要重复执行相同操作（如连续多次 pull）
2. 保持历史记录的完整性和真实性
3. 实现简单，无需复杂的去重逻辑

## UI 组件设计

### WorktreeActionHistory 组件

**文件位置**：`src/web/components/repo-toolbar/WorktreeActionHistory.tsx`

**布局结构**：
```
[图标1] [图标2] [图标3]
↑ 最新  ↑ 次新  ↑ 第三新
```

**交互设计**：
- 每个图标是一个可点击的按钮（`Button` variant="ghost" size="icon-sm"）
- Hover 显示 tooltip：操作类型 + 分支名 + 相对时间
- 点击执行对应的操作
- 执行中显示 loading 状态（`Loader2` 图标）
- 历史记录不足 3 条时，只显示实际数量

**图标映射**：

| 操作类型 | 图标 | Lucide 组件 |
|---------|------|------------|
| checkout | 分支切换 | `GitBranch` |
| pull | 下拉 | `ArrowDown` |
| push | 上推 | `ArrowUp` |
| commit | 提交 | `GitCommit` |
| merge | 合并 | `GitMerge` |
| createWorktree | 创建工作树 | `FolderTree` |
| createBranch | 创建分支 | `GitBranchPlus` |
| trackRemoteBranch | 跟踪远程 | `CloudDownload` |
| deleteBranch | 删除分支 | `Trash2` |
| removeWorktree | 移除工作树 | `FolderMinus` |

**视觉样式**：
- 按钮：`variant="ghost"` `size="icon-sm"`
- 图标大小：16px (`size={16}`)
- 间距：`gap-1` (4px)
- 禁用状态：灰色，降低透明度

**响应式处理**：
- 在 compact 模式下隐藏（通过 `useResponsiveUiMode` 判断）

**组件接口**：

```typescript
interface WorktreeActionHistoryProps {
  repoId: string
  worktreePath: string
}
```

## 操作重新执行逻辑

### 执行策略

每种操作的重新执行行为：

| 操作 | 重新执行行为 | 安全机制 |
|-----|------------|---------|
| **checkout** | 切换到该分支（在当前工作树） | 未提交更改时提示 |
| **pull** | 在该工作树执行 pull | - |
| **push** | 在该工作树执行 push | - |
| **commit** | 打开提交对话框，预填充原提交信息作为参考 | 用户手动确认后提交 |
| **merge** | 将原 source branch 合并到当前分支 | 确认对话框 |
| **createWorktree** | 为该分支创建新的工作树（路径自动生成） | 分支已有工作树时提示 |
| **createBranch** | 基于原 base branch 创建同名分支 | 分支已存在时提示 |
| **trackRemoteBranch** | 跟踪该远程分支 | 已跟踪时提示 |
| **deleteBranch** | 删除该分支 | 确认对话框 |
| **removeWorktree** | 删除工作树 | 确认对话框 |

### 安全机制

1. **破坏性操作确认**
   - deleteBranch、removeWorktree、merge 显示确认对话框
   - 对话框包含操作详情和潜在影响说明

2. **重复操作提示**
   - 分支已存在、远程已跟踪等情况显示友好提示
   - 使用 toast 通知用户

3. **操作失败处理**
   - 通过 toast 显示具体错误信息
   - 不从历史记录中移除失败的操作
   - 允许用户重试

4. **并发控制**
   - 使用 `useAsyncPending` 确保同一时间只能执行一个操作
   - 其他按钮在操作执行期间禁用

### 上下文处理

1. **参数使用**
   - 使用历史记录中保存的参数（branch、worktreePath、message 等）
   - commit 操作的 message 作为默认值，可编辑

2. **有效性检查**
   - 目标分支已删除：禁用按钮，tooltip 说明"分支已删除"
   - 工作树已删除：禁用按钮，tooltip 说明"工作树已删除"
   - source branch 已删除（merge）：禁用按钮

## 持久化设计

### 存储位置

利用现有的 `persistence.ts` 机制，扩展 `RestorableRepoSnapshot`：

```typescript
interface RestorableRepoSnapshot {
  // ... 现有字段
  worktreeActionHistories?: Record<string, RepoEventAction[]>
}
```

### 持久化时机

1. **写入**：每次记录新操作后立即调用 `persistRestorableRepoSnapshot`
2. **读取**：仓库加载时从 `restorableRepoCache` 恢复
3. **清理**：工作树被删除时，保留其历史 30 天后清理（可选功能，初版可不实现）

### 数据量控制

- **每个工作树**：最多保存 10 条历史记录
- **整个仓库**：工作树历史总量不超过 100 条
- **超出限制时**：删除最旧的记录（FIFO）

### 迁移策略

- 新增字段为可选（`?`），旧数据自动兼容
- 首次加载时 `worktreeActionHistories` 为空对象 `{}`
- 无需数据迁移脚本

### 存储格式示例

```json
{
  "repoId": "uuid",
  "worktreeActionHistories": {
    "/Users/user/project/main": [
      { "kind": "pull", "branch": "main" },
      { "kind": "commit", "branch": "main", "message": "fix: bug" },
      { "kind": "push", "branch": "main" }
    ],
    "/Users/user/project/feature": [
      { "kind": "createWorktree", "branch": "feature-x", "worktreePath": "/Users/user/project/feature" },
      { "kind": "checkout", "branch": "feature-x" }
    ]
  }
}
```

## 错误处理与边界情况

### 边界情况处理

| 情况 | 处理方式 |
|-----|---------|
| **历史记录为空** | 不显示组件，不占用空间 |
| **历史记录少于3条** | 只显示实际数量的图标 |
| **当前工作树未选中** | 不显示组件 |
| **工作树已被删除** | 历史记录保留，所有按钮禁用，tooltip 提示 |
| **分支已被删除** | 相关操作禁用，tooltip 提示 |

### 错误处理

1. **操作执行失败**
   - Toast 显示错误信息（具体错误内容）
   - 不从历史记录中移除
   - 允许用户重试

2. **权限错误**
   - Toast 显示"无权限执行该操作"
   - 禁用需要特殊权限的操作按钮

3. **网络错误**（pull/push）
   - Toast 显示"网络错误，请检查连接"
   - 保持按钮可用，允许重试

### 用户体验优化

1. **操作反馈**
   - 操作开始：按钮显示 `Loader2` loading 图标
   - 操作成功：Toast 提示成功 + 自动刷新仓库数据
   - 操作失败：Toast 显示错误详情

2. **性能优化**
   - 历史记录变化时使用 `useStoreWithEqualityFn` 避免不必要的重渲染
   - 图标按钮组件使用 `memo` 优化

3. **可访问性**
   - 所有按钮有明确的 `aria-label`："{操作类型}: {分支名}"
   - 键盘导航支持：按钮可通过 Tab 键聚焦
   - 高对比度模式下图标清晰可见

## 实现文件清单

### 新增文件

1. `src/web/components/repo-toolbar/WorktreeActionHistory.tsx`
   - 操作历史展示组件

### 修改文件

1. `src/web/stores/repos/types.ts`
   - 扩展 `RepoEventAction`（添加 commit、merge）
   - 扩展 `RepoWorktreeState`（添加 `actionHistory`）

2. `src/web/stores/repos/persistence.ts`
   - 扩展 `RestorableRepoSnapshot`（添加 `worktreeActionHistories`）
   - 添加历史记录的持久化和恢复逻辑

3. `src/web/stores/repos/store.ts`
   - 添加 `addWorktreeActionHistory` action
   - 在仓库加载时恢复历史记录

4. `src/web/components/repo-toolbar/RepoToolbar.tsx`
   - 在右侧控制区添加 `WorktreeActionHistory` 组件

5. `src/web/hooks/useBranchWriteActions.tsx`
   - 操作成功后调用 `addWorktreeActionHistory` 记录

## 测试策略

### 单元测试

1. **WorktreeActionHistory.test.tsx**
   - 渲染测试：历史记录为空、1条、3条、超过3条
   - 交互测试：点击按钮执行操作
   - 禁用状态测试：分支/工作树已删除

2. **persistence.test.ts**
   - 历史记录的持久化和恢复
   - 数据量控制（超过10条时的截断）

3. **store.test.ts**
   - `addWorktreeActionHistory` 逻辑
   - 历史记录的正确存储和排序

### 集成测试

1. 完整流程测试：
   - 执行操作 → 记录到历史 → 持久化 → 重启应用 → 恢复历史 → 点击重新执行

2. 跨工作树测试：
   - 不同工作树的历史记录相互独立

## 国际化

### 新增翻译 key

```typescript
// en.json
{
  "action-history": {
    "tooltip": {
      "checkout": "Checkout: {{branch}}",
      "pull": "Pull: {{branch}}",
      "push": "Push: {{branch}}",
      "commit": "Commit: {{message}}",
      "merge": "Merge: {{sourceBranch}} → {{branch}}",
      "createWorktree": "Create worktree: {{branch}}",
      "createBranch": "Create branch: {{branch}}",
      "trackRemoteBranch": "Track remote: {{remoteRef}}",
      "deleteBranch": "Delete branch: {{branch}}",
      "removeWorktree": "Remove worktree: {{branch}}"
    },
    "disabled": {
      "branchDeleted": "Branch has been deleted",
      "worktreeDeleted": "Worktree has been deleted",
      "sourceBranchDeleted": "Source branch has been deleted"
    }
  }
}
```

## 未来扩展

1. **操作详情查看**
   - 右键菜单或长按显示操作详细信息（时间戳、完整参数、执行结果）

2. **历史记录面板**
   - 查看完整的操作历史（不限于3条）
   - 支持筛选和搜索

3. **操作快捷方式**
   - 为常用操作配置键盘快捷键

4. **历史记录同步**
   - 跨设备同步操作历史（通过 remote repo target）

5. **智能推荐**
   - 根据历史记录推荐下一步操作

## 总结

本设计通过在仓库工具栏右侧添加操作历史展示区域，提升用户的工作效率：

**核心价值**：
- 快速重复常用操作，无需多次点击菜单
- 可视化操作历史，便于追踪工作流程
- 持久化保存，重启后不丢失

**技术亮点**：
- 利用现有架构和持久化机制，实现简洁
- 完善的错误处理和边界情况处理
- 良好的用户体验和可访问性

**实现优先级**：
1. P0：基础功能（显示历史、点击执行、持久化）
2. P1：安全机制（确认对话框、错误处理）
3. P2：用户体验优化（loading 状态、toast 反馈）
4. P3：未来扩展功能
