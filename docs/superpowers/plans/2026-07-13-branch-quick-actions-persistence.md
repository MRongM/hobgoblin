# Branch Quick Actions Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让分支区快捷操作（快捷按钮）记忆跨会话持久化，重启软件后恢复每个分支上次点击的操作。

**Architecture:** 将 `BranchActionsMenu.tsx` 中模块级的内存 Map 改为由 store 层持有并导出；在 `RestorableRepoSnapshot.ui` 中新增 `quickActions` 字段；修改 `persistence.ts` 的序列化/反序列化函数，使快捷操作随 repo snapshot 自动持久化和恢复。

**Tech Stack:** TypeScript, Zustand (with persist middleware), valibot, Vitest

---

## File Map

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/web/stores/repos/types.ts` | Modify | `RestorableRepoSnapshot.ui` 添加 `quickActions` 字段 |
| `src/web/stores/repos/persistence.ts` | Modify | Schema 验证、序列化/反序列化函数扩展；导出 `rememberedQuickActions` Map |
| `src/web/stores/repos/persistence.test.ts` | Modify | 扩展现有测试，新增 quickActions 相关测试 |
| `src/web/components/BranchActionsMenu.tsx` | Modify | 从 `persistence.ts` 导入 Map，写入时调用 `persistRestorableRepoSnapshot` |

---

## Task 1: 扩展 `RestorableRepoSnapshot` 类型

**Files:**
- Modify: `src/web/stores/repos/types.ts`

- [ ] **Step 1: 在 `RestorableRepoSnapshot.ui` 添加 `quickActions` 可选字段**

找到 `RestorableRepoSnapshot` 接口（约第 44 行附近），将 `ui` 的类型扩展：

```typescript
export interface RestorableRepoSnapshot {
  savedAt: number
  name: string
  data: Pick<RepoDataState, 'branches' | 'currentBranch'>
  ui: Pick<RepoUiState, 'selectedBranch' | 'branchViewMode' | 'detailTab' | 'worktreePathOrder'> & {
    explorerTab?: ExplorerTab
    workspaceLayout?: RepoWorkspaceLayout
    fileTreePaneSizes?: WorkspaceDetailPaneSizes
    quickActions?: Record<string, string>
  }
}
```

- [ ] **Step 2: 类型检查**

```bash
cd /Users/longjiang/src/tries/2026-06-13-hobgoblin/hobgoblin-opt-history
bun run typecheck
```

Expected: 通过，零类型错误

- [ ] **Step 3: Commit**

```bash
git add src/web/stores/repos/types.ts
git commit -m "feat(types): add quickActions field to RestorableRepoSnapshot"
```

---

## Task 2: 扩展 persistence.ts — Schema、导出 Map、序列化/反序列化

**Files:**
- Modify: `src/web/stores/repos/persistence.ts`

- [ ] **Step 1: 在 `RestorableRepoSnapshotSchema` 中添加 `quickActions` 字段**

找到 `RestorableRepoSnapshotSchema`（约第 58 行），在 `ui` 对象的末尾添加：

```typescript
const RestorableRepoSnapshotSchema = v.object({
  savedAt: FiniteNumber,
  name: v.string(),
  data: v.object({
    branches: v.array(BranchSchema),
    currentBranch: v.string(),
  }),
  ui: v.object({
    selectedBranch: v.nullable(v.string()),
    branchViewMode: v.picklist(['all', 'worktrees', 'no-worktree']),
    detailTab: v.picklist(['status', 'changes', 'terminal']),
    explorerTab: v.optional(v.unknown()),
    workspaceLayout: v.optional(v.picklist(['top-bottom', 'left-right']), DEFAULT_WORKSPACE_LAYOUT),
    fileTreePaneSizes: v.optional(v.unknown()),
    worktreePathOrder: v.optional(v.array(v.string()), []),
    quickActions: v.optional(v.record(v.string(), v.string())),
  }),
})
```

- [ ] **Step 2: 在文件顶部导出 `rememberedQuickActions` Map**

在 import 语句之后、schema 定义之前添加：

```typescript
export const rememberedQuickActions = new Map<string, string>()
```

- [ ] **Step 3: 修改 `restorableRepoSnapshotFromRepo` — 序列化时收集 quickActions**

找到 `restorableRepoSnapshotFromRepo` 函数（约第 168 行），修改签名并在 `ui` 对象中加入 quickActions：

```typescript
function restorableRepoSnapshotFromRepo(repo: RepoState): RestorableRepoSnapshot | null {
  if (repo.data.branches.length === 0 && repo.resources.snapshot.loadedAt === null) return null

  const quickActions: Record<string, string> = {}
  for (const branch of repo.data.branches) {
    const key = `${repo.id}\0${branch.name}`
    const actionId = rememberedQuickActions.get(key)
    if (actionId) quickActions[branch.name] = actionId
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
      ...(Object.keys(quickActions).length > 0 ? { quickActions } : {}),
    },
  }
}
```

注意：函数签名**不变**（仍为 `(repo: RepoState): RestorableRepoSnapshot | null`），直接读取模块级的 `rememberedQuickActions`，无需修改所有调用点。

- [ ] **Step 4: 修改 `restoreProjectionFromSnapshot` — 反序列化时恢复 quickActions**

找到 `restoreProjectionFromSnapshot` 函数（约第 101 行），在返回 `RepoState` 之前填充 Map：

```typescript
function restoreProjectionFromSnapshot(repo: RepoState, snapshot: RestorableRepoSnapshot): RepoState {
  if (snapshot.ui.quickActions) {
    for (const [branchName, actionId] of Object.entries(snapshot.ui.quickActions)) {
      rememberedQuickActions.set(`${repo.id}\0${branchName}`, actionId)
    }
  }

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
  if (snapshot.data.branches.length > 0) finishResourceSuccess(resources.snapshot, snapshot.savedAt)
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

- [ ] **Step 5: 修改 `normalizeRestorableRepoSnapshotEntry` — 保留 quickActions**

找到 `normalizeRestorableRepoSnapshotEntry` 函数（约第 201 行），在 return 语句中保留 `quickActions`：

```typescript
function normalizeRestorableRepoSnapshotEntry(value: unknown): RestorableRepoSnapshot | null {
  const parsed = v.safeParse(RestorableRepoSnapshotSchema, value)
  if (!parsed.success) return null
  const snapshot = parsed.output
  const fileTreePaneSizes =
    snapshot.ui.fileTreePaneSizes === undefined ? undefined : normalizeFileTreePaneSizes(snapshot.ui.fileTreePaneSizes)
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
    },
  }
}
```

（`quickActions` 已经通过 `...ui` 展开携带，无需额外处理。）

- [ ] **Step 6: 类型检查**

```bash
bun run typecheck
```

Expected: 通过，零类型错误

- [ ] **Step 7: Commit**

```bash
git add src/web/stores/repos/persistence.ts
git commit -m "feat(persistence): persist and restore branch quick actions"
```

---

## Task 3: 更新 BranchActionsMenu.tsx — 从 persistence 导入 Map，写入时触发持久化

**Files:**
- Modify: `src/web/components/BranchActionsMenu.tsx`

- [ ] **Step 1: 替换模块级 Map 为从 persistence 导入**

在 `BranchActionsMenu.tsx` 顶部，将：

```typescript
const rememberedQuickActions = new Map<string, BranchActionItem['id']>()
```

删除，并在 import 区新增：

```typescript
import { rememberedQuickActions, persistRestorableRepoSnapshot } from '#/web/stores/repos/persistence.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
```

- [ ] **Step 2: 在 `runItem` 中写入后触发持久化**

找到 `BranchActionsDropdown` 组件中的 `runItem` 函数。在设置 Map 后，立即触发持久化：

```typescript
function runItem(item: BranchActionItem) {
  if (branchActionMenuItemDisabled(item, busyAction)) return
  if (memoryKey && !item.destructive) {
    rememberedQuickActions.set(memoryKey, item.id)
    setQuickActionRevision((revision) => revision + 1)

    // 触发持久化：读取当前 repo state 并写入 snapshot
    if (repoId) {
      const store = useReposStore.getState()
      const repo = store.repos[repoId]
      const token = repo?.instanceToken
      if (repo && token !== undefined) {
        persistRestorableRepoSnapshot(useReposStore.setState, repo, token)
      }
    }
  }
  void run(item.id, item.onSelect)
}
```

注意：`useReposStore.getState()` 和 `useReposStore.setState` 在组件外部调用是合法的 Zustand 模式，不需要 hook。

- [ ] **Step 3: 类型检查**

```bash
bun run typecheck
```

Expected: 通过，零类型错误

- [ ] **Step 4: Commit**

```bash
git add src/web/components/BranchActionsMenu.tsx
git commit -m "feat(ui): persist quick action selection on click"
```

---

## Task 4: 更新测试 — persistence.test.ts

**Files:**
- Modify: `src/web/stores/repos/persistence.test.ts`

- [ ] **Step 1: 在测试 `beforeEach` 中清空 `rememberedQuickActions`**

在文件顶部导入 Map，并在每个测试前清空：

```typescript
import { rememberedQuickActions } from '#/web/stores/repos/persistence.ts'

// 在现有 beforeEach 中添加：
beforeEach(() => {
  resetReposStore()
  rememberedQuickActions.clear()
})
```

- [ ] **Step 2: 新增 — 序列化时收集 quickActions**

在 `describe('persistRestorableRepoSnapshot', ...)` 块末尾添加：

```typescript
test('serializes quickActions from rememberedQuickActions map', () => {
  const now = Date.now()
  const repo = seedRepoState('/repo', {
    branches: [createRepoBranch('main'), createRepoBranch('feature/auth')],
    instanceToken: 1,
  })
  rememberedQuickActions.set('/repo\0main', 'editor')
  rememberedQuickActions.set('/repo\0feature/auth', 'terminal')

  persistRestorableRepoSnapshot(useReposStore.setState, repo, 1)

  const saved = useReposStore.getState().restorableRepoCache['/repo']
  expect(saved?.ui.quickActions).toEqual({ main: 'editor', 'feature/auth': 'terminal' })
})

test('omits quickActions from snapshot when map has no entries for repo', () => {
  const repo = seedRepoState('/repo', {
    branches: [createRepoBranch('main')],
    instanceToken: 1,
  })

  persistRestorableRepoSnapshot(useReposStore.setState, repo, 1)

  const saved = useReposStore.getState().restorableRepoCache['/repo']
  expect(saved?.ui.quickActions).toBeUndefined()
})

test('only serializes quickActions for branches that currently exist', () => {
  const repo = seedRepoState('/repo', {
    branches: [createRepoBranch('main')],
    instanceToken: 1,
  })
  rememberedQuickActions.set('/repo\0main', 'editor')
  rememberedQuickActions.set('/repo\0deleted-branch', 'terminal')

  persistRestorableRepoSnapshot(useReposStore.setState, repo, 1)

  const saved = useReposStore.getState().restorableRepoCache['/repo']
  expect(saved?.ui.quickActions).toEqual({ main: 'editor' })
})
```

- [ ] **Step 3: 新增 — 反序列化时恢复 quickActions**

在 `describe('restoreRepoProjectionFromSnapshot', ...)` 块末尾添加：

```typescript
test('restores quickActions from snapshot into rememberedQuickActions map', () => {
  const now = Date.now()
  const snapshot: RestorableRepoSnapshot = {
    savedAt: now,
    name: 'repo',
    data: { branches: [], currentBranch: 'main' },
    ui: {
      selectedBranch: null,
      branchViewMode: 'all',
      detailTab: 'status',
      worktreePathOrder: [],
      quickActions: { main: 'editor', 'feature/auth': 'terminal' },
    },
  }

  restoreRepoProjectionFromSnapshot(emptyRepo('/repo', 'repo'), snapshot)

  expect(rememberedQuickActions.get('/repo\0main')).toBe('editor')
  expect(rememberedQuickActions.get('/repo\0feature/auth')).toBe('terminal')
})

test('does not throw when snapshot has no quickActions', () => {
  const now = Date.now()
  const snapshot: RestorableRepoSnapshot = {
    savedAt: now,
    name: 'repo',
    data: { branches: [], currentBranch: 'main' },
    ui: {
      selectedBranch: null,
      branchViewMode: 'all',
      detailTab: 'status',
      worktreePathOrder: [],
    },
  }

  expect(() => restoreRepoProjectionFromSnapshot(emptyRepo('/repo', 'repo'), snapshot)).not.toThrow()
  expect(rememberedQuickActions.size).toBe(0)
})
```

- [ ] **Step 4: 新增 — normalizeRestorableRepoCache 保留 quickActions**

在 `describe('normalizeRestorableRepoCache', ...)` 块末尾添加：

```typescript
test('preserves quickActions field through normalization', () => {
  const now = Date.now()
  const raw = {
    savedAt: now,
    name: 'repo',
    data: { branches: [], currentBranch: 'main' },
    ui: {
      selectedBranch: null,
      branchViewMode: 'all',
      detailTab: 'status',
      worktreePathOrder: [],
      quickActions: { main: 'editor' },
    },
  }

  const normalized = normalizeRestorableRepoCache({ repo: raw })

  expect(normalized.repo?.ui.quickActions).toEqual({ main: 'editor' })
})

test('accepts snapshot without quickActions field', () => {
  const now = Date.now()
  const raw = {
    savedAt: now,
    name: 'repo',
    data: { branches: [], currentBranch: 'main' },
    ui: {
      selectedBranch: null,
      branchViewMode: 'all',
      detailTab: 'status',
      worktreePathOrder: [],
    },
  }

  const normalized = normalizeRestorableRepoCache({ repo: raw })

  expect(normalized.repo?.ui.quickActions).toBeUndefined()
})
```

- [ ] **Step 5: 运行测试**

```bash
bun run test src/web/stores/repos/persistence.test.ts
```

Expected: 所有测试通过，包括新增的测试

- [ ] **Step 6: 运行全部测试确认无回归**

```bash
bun run test
```

Expected: 全部通过

- [ ] **Step 7: Commit**

```bash
git add src/web/stores/repos/persistence.test.ts
git commit -m "test(persistence): add quickActions persistence test coverage"
```

---

## Task 5: 全量验证

- [ ] **Step 1: 类型检查**

```bash
bun run typecheck
```

Expected: 零错误

- [ ] **Step 2: 架构边界检查**

```bash
bun run check:architecture
```

Expected: 通过

- [ ] **Step 3: 全量测试**

```bash
bun run test
```

Expected: 全部通过

- [ ] **Step 4: 手动验证清单**

1. 启动开发应用：`bun run dev`
2. 打开任意 repo，在某个分支上点击快捷操作（非默认的 `editor`，例如切换为 `terminal`）
3. 检查 localStorage：打开 DevTools → Application → localStorage，找到 `hobgoblin-repos`，确认 `ui.quickActions` 包含该分支的操作 ID
4. 完全关闭并重启应用
5. 打开同一 repo，确认分支旁的快捷按钮仍显示上次选择的操作

---

## 验收标准

- [ ] 用户点击分支快捷操作后，重启应用能够恢复该操作
- [ ] 不同分支的快捷操作记忆独立
- [ ] 旧版本数据（无 `quickActions` 字段）无缝升级，不报错
- [ ] 删除分支后，下次序列化自动清理该分支的记录
- [ ] 所有现有单元测试通过
- [ ] 新增测试覆盖核心逻辑
