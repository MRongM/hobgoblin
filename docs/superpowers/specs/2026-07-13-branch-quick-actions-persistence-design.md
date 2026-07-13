# 分支快捷操作持久化设计

## 目标

让分支区的快捷操作（快捷按钮）记忆跨会话持久化，用户重新打开软件后能够恢复每个分支上次点击的操作。

## 背景

当前实现：
- `BranchActionsMenu.tsx` 使用模块级 `Map<string, string>` 存储快捷操作记忆
- Key 格式：`${repoId}\0${branchName}`
- Value：操作 ID（如 `'editor'`, `'terminal'`, `'create-worktree'`）
- **问题**：内存存储，软件重启后丢失

## 设计原则

1. **复用现有基础设施**：利用 `RestorableRepoSnapshot` + `persist` 中间件的持久化体系
2. **最小化改动**：保持 `BranchActionsMenu` 组件逻辑不变，仍使用内存 Map
3. **自动化**：数据随 repo snapshot 自动持久化和恢复，无需手动触发
4. **向后兼容**：旧版本数据无缝升级

## 架构

### 数据流向

**启动恢复流程**：
```
应用启动
  ↓
Store persist 中间件从 localStorage 读取
  ↓
normalizeRestorableRepoCache 验证并规范化数据
  ↓
每个 repo 打开时调用 restoreRepoProjectionFromSnapshot
  ↓
restoreProjectionFromSnapshot 填充 rememberedQuickActions Map
  ↓
BranchActionsMenu 渲染时直接读取 rememberedQuickActions
```

**运行时更新流程**：
```
用户点击操作
  ↓
BranchActionsMenu.runItem 更新内存 Map
  ↓
调用 store.persistQuickAction(repoId, branchName, actionId)
  ↓
persistRestorableRepoSnapshot 序列化 repo + quickActions
  ↓
Store persist 中间件写入 localStorage
```

### 组件关系

```
BranchActionsMenu (UI)
  ↓ 读取
rememberedQuickActions (全局 Map，在 store.ts 导出)
  ↑ 写入                    ↓ 通知持久化
  └─────────────> store.persistQuickAction(repoId, branchName, actionId)
                              ↓
                  persistRestorableRepoSnapshot(repo, quickActionsMap)
                              ↓
                  RestorableRepoSnapshot.ui.quickActions
                              ↓
                        localStorage (persist 中间件)
```

## 实现细节

### 1. 数据结构变更

#### `src/web/stores/repos/types.ts`

```typescript
export interface RestorableRepoSnapshot {
  savedAt: number
  name: string
  data: Pick<RepoDataState, 'branches' | 'currentBranch'>
  ui: Pick<RepoUiState, 'selectedBranch' | 'branchViewMode' | 'detailTab' | 'worktreePathOrder'> & {
    explorerTab?: ExplorerTab
    workspaceLayout?: RepoWorkspaceLayout
    fileTreePaneSizes?: WorkspaceDetailPaneSizes
    quickActions?: Record<string, string>  // 新增：branchName -> actionId
  }
}
```

**数据格式**：
- Key: 分支名称（如 `"main"`, `"feature/login"`）
- Value: 操作 ID（如 `"editor"`, `"terminal"`, `"create-worktree"`）
- 示例：`{ "main": "editor", "feature/auth": "terminal" }`

### 2. Schema 验证

#### `src/web/stores/repos/persistence.ts`

在 `RestorableRepoSnapshotSchema` 添加：

```typescript
const RestorableRepoSnapshotSchema = v.object({
  // ...现有字段...
  ui: v.object({
    // ...现有字段...
    quickActions: v.optional(v.record(v.string(), v.string())),  // 新增
  }),
})
```

### 3. 序列化：从内存 Map 收集数据

#### `persistence.ts` - `restorableRepoSnapshotFromRepo` 修改

**函数签名变更**：
```typescript
function restorableRepoSnapshotFromRepo(
  repo: RepoState,
  quickActionsMap: Map<string, string>  // 新增参数
): RestorableRepoSnapshot | null
```

**实现逻辑**：
```typescript
function restorableRepoSnapshotFromRepo(
  repo: RepoState,
  quickActionsMap: Map<string, string>
): RestorableRepoSnapshot | null {
  if (repo.data.branches.length === 0 && repo.resources.snapshot.loadedAt === null) {
    return null
  }
  
  // 收集该 repo 的所有分支快捷操作
  const quickActions: Record<string, string> = {}
  try {
    for (const branch of repo.data.branches) {
      const key = `${repo.id}\0${branch.name}`
      const actionId = quickActionsMap.get(key)
      if (actionId && typeof actionId === 'string') {
        quickActions[branch.name] = actionId
      }
    }
  } catch (err) {
    console.warn('[persistence] failed to serialize quickActions:', err)
  }
  
  return {
    savedAt: Date.now(),
    name: repo.name,
    data: {
      branches: cachedBranches(repo.data.branches),
      currentBranch: repo.data.currentBranch,
    },
    ui: {
      selectedBranch: repo.ui.selectedBranch,
      branchViewMode: repo.ui.branchViewMode,
      detailTab: normalizeCachedDetailTab(repo.ui.detailTab),
      explorerTab: repo.ui.explorerTab,
      workspaceLayout: repo.ui.workspaceLayout ?? DEFAULT_WORKSPACE_LAYOUT,
      ...(repo.ui.fileTreePaneSizes ? { fileTreePaneSizes: repo.ui.fileTreePaneSizes } : {}),
      worktreePathOrder: repo.ui.worktreePathOrder,
      ...(Object.keys(quickActions).length > 0 ? { quickActions } : {}),  // 新增
    },
  }
}
```

**关键点**：
- 只序列化当前存在的分支（`repo.data.branches`），自动过滤已删除分支
- 空对象不写入，保持数据紧凑
- 错误不影响其他字段序列化

### 4. 反序列化：恢复到内存 Map

#### `persistence.ts` - `restoreProjectionFromSnapshot` 修改

**函数签名变更**：
```typescript
function restoreProjectionFromSnapshot(
  repo: RepoState,
  snapshot: RestorableRepoSnapshot,
  quickActionsMap: Map<string, string>  // 新增参数
): RepoState
```

**实现逻辑**：
```typescript
function restoreProjectionFromSnapshot(
  repo: RepoState,
  snapshot: RestorableRepoSnapshot,
  quickActionsMap: Map<string, string>
): RepoState {
  // 恢复快捷操作到全局 Map
  try {
    if (snapshot.ui.quickActions && typeof snapshot.ui.quickActions === 'object') {
      for (const [branchName, actionId] of Object.entries(snapshot.ui.quickActions)) {
        if (typeof branchName === 'string' && typeof actionId === 'string') {
          const key = `${repo.id}\0${branchName}`
          quickActionsMap.set(key, actionId)
        }
      }
    }
  } catch (err) {
    console.warn('[persistence] failed to restore quickActions:', err)
  }
  
  // 返回的 RepoState 不包含 quickActions（它不属于 RepoState）
  const selectedBranch = selectedBranchForBranchSet({
    branches: snapshot.data.branches,
    currentBranch: snapshot.data.currentBranch,
    selectedBranch: snapshot.ui.selectedBranch,
    viewMode: snapshot.ui.branchViewMode,
  })
  
  const resources = {
    ...repo.resources,
    snapshot: { ...repo.resources.snapshot },
  }
  if (snapshot.data.branches.length > 0) {
    finishResourceSuccess(resources.snapshot, snapshot.savedAt)
  }
  
  const branches = cachedBranches(snapshot.data.branches)
  
  return {
    ...repo,
    name: snapshot.name || repo.name,
    data: {
      ...repo.data,
      branches,
      currentBranch: snapshot.data.currentBranch,
    },
    resources,
    ui: {
      ...repo.ui,
      selectedBranch,
      branchViewMode: snapshot.ui.branchViewMode,
      detailTab: normalizeCachedDetailTab(snapshot.ui.detailTab),
      explorerTab: normalizeCachedExplorerTab(snapshot.ui.explorerTab),
      workspaceLayout: snapshot.ui.workspaceLayout ?? DEFAULT_WORKSPACE_LAYOUT,
      fileTreePaneSizes: snapshot.ui.fileTreePaneSizes,
      worktreePathOrder: snapshot.ui.worktreePathOrder,
    },
    projection: {
      source: 'cache',
      savedAt: snapshot.savedAt,
    },
  }
}
```

**关键点**：
- 通过副作用填充全局 Map，不修改 `RepoState` 结构
- 类型守卫防止无效数据
- 恢复失败不影响 repo 其他状态

#### `persistence.ts` - 公开函数签名同步变更

```typescript
export function persistRestorableRepoSnapshot(
  set: ReposSet,
  repo: RepoState | undefined,
  token: number,
  quickActionsMap: Map<string, string>  // 新增参数
): void {
  if (!repo || repo.instanceToken !== token) return
  const entry = restorableRepoSnapshotFromRepo(repo, quickActionsMap)
  if (!entry) return
  set((s) => {
    if (s.repos[repo.id]?.instanceToken !== token) return s
    const restorableRepoCache = trimRepoCache({ ...s.restorableRepoCache, [repo.id]: entry })
    return { restorableRepoCache }
  })
}

export function restoreRepoProjectionFromSnapshot(
  repo: RepoState,
  snapshot: RestorableRepoSnapshot | undefined,
  quickActionsMap: Map<string, string>  // 新增参数
): RepoState {
  if (!snapshot || isExpired(snapshot.savedAt)) return repo
  return restoreProjectionFromSnapshot(repo, snapshot, quickActionsMap)
}
```

#### `persistence.ts` - `normalizeRestorableRepoSnapshotEntry` 扩展

保留验证通过的 `quickActions` 字段：

```typescript
function normalizeRestorableRepoSnapshotEntry(value: unknown): RestorableRepoSnapshot | null {
  const parsed = v.safeParse(RestorableRepoSnapshotSchema, value)
  if (!parsed.success) return null
  
  const snapshot = parsed.output
  const fileTreePaneSizes =
    snapshot.ui.fileTreePaneSizes === undefined 
      ? undefined 
      : normalizeFileTreePaneSizes(snapshot.ui.fileTreePaneSizes)
  
  const { fileTreePaneSizes: _rawFileTreePaneSizes, explorerTab: rawExplorerTab, ...ui } = snapshot.ui
  
  return {
    ...snapshot,
    data: {
      ...snapshot.data,
      branches: cachedBranches(snapshot.data.branches),
    },
    ui: {
      ...ui,
      detailTab: normalizeCachedDetailTab(snapshot.ui.detailTab),
      explorerTab: normalizeCachedExplorerTab(rawExplorerTab),
      workspaceLayout: snapshot.ui.workspaceLayout ?? DEFAULT_WORKSPACE_LAYOUT,
      ...(fileTreePaneSizes ? { fileTreePaneSizes } : {}),
      quickActions: snapshot.ui.quickActions,  // 新增：保留字段
    },
  }
}
```

### 5. Store 层桥接

#### `src/web/stores/repos/store.ts`

**导出全局 Map**：
```typescript
// 模块顶层
export const rememberedQuickActions = new Map<string, string>()
```

**新增 action**：
```typescript
const useReposStore = create<ReposStore>()(
  persist(
    (set, get) => ({
      // ...现有 state 和 actions...
      
      persistQuickAction: (repoId: string, branchName: string, actionId: string) => {
        try {
          const key = `${repoId}\0${branchName}`
          rememberedQuickActions.set(key, actionId)
          
          const repo = get().repos[repoId]
          if (repo) {
            persistRestorableRepoSnapshot(set, repo, repo.instanceToken, rememberedQuickActions)
          }
        } catch (err) {
          console.warn('[repos] failed to persist quick action:', err)
        }
      },
    }),
    // ...persist 配置...
  )
)
```

**类型定义**：
```typescript
export interface ReposStore {
  // ...现有字段...
  persistQuickAction: (repoId: string, branchName: string, actionId: string) => void
}
```

**调用点修改**：
所有现有的 `persistRestorableRepoSnapshot` 调用都需要传入 `rememberedQuickActions` 参数。

### 6. UI 层调用

#### `src/web/components/BranchActionsMenu.tsx`

**移除模块级变量**：
```typescript
// 删除这行：
// const rememberedQuickActions = new Map<string, BranchActionItem['id']>()
```

**导入全局 Map 和 action**：
```typescript
import { useReposStore, rememberedQuickActions } from '#/web/stores/repos/store.ts'
```

**在组件内调用 action**：
```typescript
export function BranchActionsDropdown({
  repoId,
  branchName,
  // ...
}: /* ... */) {
  const t = useT()
  const persistQuickAction = useReposStore((s) => s.persistQuickAction)  // 新增
  const [, setQuickActionRevision] = useState(0)
  const { pending: pendingAction, run } = useAsyncPending<BranchActionItem['id']>()
  
  // ...现有逻辑...
  
  function runItem(item: BranchActionItem) {
    if (branchActionMenuItemDisabled(item, busyAction)) return
    if (memoryKey && !item.destructive) {
      rememberedQuickActions.set(memoryKey, item.id)
      setQuickActionRevision((revision) => revision + 1)
      
      // 新增：通知 store 持久化
      if (repoId && branchName) {
        persistQuickAction(repoId, branchName, item.id)
      }
    }
    void run(item.id, item.onSelect)
  }
  
  // ...
}
```

**关键点**：
- 保持内存 Map 更新逻辑不变
- 增加一次 store action 调用触发持久化
- 失败不影响当前会话使用（内存 Map 已更新）

## 边界情况

### 1. 分支被删除
- **行为**：快捷操作记录保留在内存 Map 中
- **清理时机**：下次序列化时只保存 `repo.data.branches` 中存在的分支，自动过滤
- **影响**：无，不会造成数据泄漏

### 2. Repo 被关闭/重开
- **行为**：`instanceToken` 变化触发新 snapshot
- **影响**：旧内存 Map 数据在恢复时被重新填充，保持一致性

### 3. 无效的 actionId
- **行为**：组件的 `resolveQuickAction` 函数检测到 actionId 无效或被禁用时，fallback 到 `'editor'`
- **影响**：用户体验无感知，回退到默认操作

### 4. 空 repo（无分支）
- **行为**：`restorableRepoSnapshotFromRepo` 返回 `null`，不序列化
- **影响**：符合现有逻辑

### 5. 数据过期
- **行为**：随 `RestorableRepoSnapshot` 的 14 天过期机制一起清理
- **清理函数**：`trimRepoCache` 自动处理

## 兼容性

### 向后兼容
- `quickActions` 字段标记为 `optional`
- 旧版本数据（无此字段）：
  - Schema 验证通过（optional 字段）
  - `normalizeRestorableRepoSnapshotEntry` 返回 `quickActions: undefined`
  - `restoreProjectionFromSnapshot` 跳过恢复逻辑
  - 组件使用默认行为（`'editor'`）

### 数据迁移
- 无需手动迁移
- 首次使用新版本后，用户点击操作会自动生成 `quickActions` 数据
- 下次序列化时写入 localStorage

## 测试要点

### 单元测试
1. `restorableRepoSnapshotFromRepo`：
   - 正确收集多个分支的 quickActions
   - 过滤已删除分支
   - 空 Map 不写入 `quickActions` 字段
   
2. `restoreProjectionFromSnapshot`：
   - 正确恢复 quickActions 到全局 Map
   - 无效数据（非 string）跳过
   - 无 `quickActions` 字段不报错

3. `normalizeRestorableRepoSnapshotEntry`：
   - 旧版本数据（无 `quickActions`）验证通过
   - 无效 `quickActions` 被丢弃

### 集成测试
1. 启动恢复流程：
   - 打开多个 repo，每个 repo 有不同分支的快捷操作
   - 重启应用，验证每个分支的快捷按钮正确显示

2. 运行时更新：
   - 点击操作后，检查 localStorage 中的 `quickActions` 字段
   - 切换分支，验证记忆独立

3. 边界情况：
   - 删除分支后重启，验证记录被清理
   - 空 repo 不产生 `quickActions` 数据

## 风险评估

### 低风险
- **数据量小**：每个 repo 最多几十个分支，每条记录 < 50 字节
- **自动清理**：LRU + 过期机制防止无限增长
- **隔离性好**：失败不影响其他 repo 状态

### 需注意
- **调用点修改**：所有现有的 `persistRestorableRepoSnapshot` 和 `restoreRepoProjectionFromSnapshot` 调用都需要传入 `rememberedQuickActions` 参数，需要全局搜索确认

## 实现顺序

1. **类型定义**：修改 `types.ts` 的 `RestorableRepoSnapshot`
2. **Schema 验证**：扩展 `persistence.ts` 的 `RestorableRepoSnapshotSchema`
3. **持久化层**：修改 `persistence.ts` 的序列化/反序列化函数
4. **Store 层**：
   - 导出 `rememberedQuickActions` Map
   - 添加 `persistQuickAction` action
   - 修改所有 `persistRestorableRepoSnapshot` 调用点
5. **UI 层**：修改 `BranchActionsMenu.tsx` 调用 store action
6. **测试**：编写单元测试和集成测试
7. **验证**：手动测试所有边界情况

## 验收标准

- [ ] 用户点击分支快捷操作后，重启应用能够恢复该操作
- [ ] 不同分支的快捷操作记忆独立
- [ ] 旧版本数据无缝升级
- [ ] 删除分支后，记录在下次序列化时自动清理
- [ ] 所有现有单元测试通过
- [ ] 新增测试覆盖核心逻辑
