# File Area Height Per Project Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make file area split height independent per project while keeping settings as the default for projects without their own saved size.

**Architecture:** Store project-specific file area pane sizes in `repo.ui.fileTreePaneSizes`, persisted through the existing `RestorableRepoSnapshot` path. Keep workspace-level `state.fileTreePaneSizes` as default pane sizes, and make renderers resolve `repo.ui.fileTreePaneSizes?.[layout] ?? state.fileTreePaneSizes[layout]`.

**Tech Stack:** React, Zustand, Immer, Valibot, Vitest, Bun, TypeScript strip-only mode.

**Git note:** This repository's `AGENTS.md` says not to plan or execute git commits or branches unless the user asks. This plan intentionally omits commit steps.

---

## File Structure

- Modify `src/web/stores/repos/types.ts`: add optional project-level `fileTreePaneSizes` to repo UI state and cache snapshot types; split default and project resize action names.
- Modify `src/web/stores/repos/selection.ts`: add `setRepoFileTreePaneSize(repoId, layout, size)` and rename the existing default setter to `setDefaultFileTreePaneSize(layout, size)`.
- Modify `src/web/stores/repos/persistence.ts`: validate, normalize, persist, and restore project-level file tree pane sizes.
- Modify `src/web/stores/repos/test-utils.ts`: let tests seed project-level pane sizes.
- Modify `src/web/stores/repos/selection.test.ts`: cover per-project storage, default storage, and reset behavior.
- Modify `src/web/stores/repos/persistence.test.ts`: cover cache normalization, persistence, restore, and old-cache compatibility.
- Modify `src/web/components/repo-workspace/RepoExplorerPane.tsx`: use effective project/default size and write project-level sizes on resize.
- Modify `src/web/components/repo-workspace/RepoExplorerPane.test.tsx`: expose split size in the mock and test fallback, project override, and resize.
- Modify `src/web/components/settings/pages/FileAreaSettings.tsx`: show/update default file area height, not the active repo override.
- Modify `src/web/components/SettingsSurface.test.tsx`: ensure settings update defaults without changing project overrides.
- Modify `src/shared/i18n/en.ts`, `src/shared/i18n/zh.ts`, `src/shared/i18n/ko.ts`, `src/shared/i18n/ja.ts`: update settings label and hint copy.

---

### Task 1: Add Project-Level Types And Test Seeding

**Files:**
- Modify: `src/web/stores/repos/types.ts`
- Modify: `src/web/stores/repos/test-utils.ts`

- [ ] **Step 1: Extend repo UI and snapshot types**

In `src/web/stores/repos/types.ts`, update `RepoUiState`, `RestorableRepoSnapshot`, and `RestorableWorkspaceActions`.

Use this exact shape:

```ts
export interface RepoUiState {
  selectedBranch: string | null
  branchViewMode: BranchViewMode
  detailTab: DetailTab
  workspaceLayout: RepoWorkspaceLayout
  fileTreePaneSizes?: WorkspaceDetailPaneSizes
  worktreePathOrder: string[]
}
```

Change `RestorableRepoSnapshot` so `ui` includes the optional cached field:

```ts
export interface RestorableRepoSnapshot {
  savedAt: number
  name: string
  data: Pick<RepoDataState, 'branches' | 'currentBranch'>
  ui: Pick<
    RepoUiState,
    'selectedBranch' | 'branchViewMode' | 'detailTab' | 'worktreePathOrder'
  > & {
    workspaceLayout?: RepoWorkspaceLayout
    fileTreePaneSizes?: WorkspaceDetailPaneSizes
  }
}
```

In `RestorableWorkspaceActions`, replace the old file tree setter signature:

```ts
setFileTreePaneSize: (layout: RepoWorkspaceLayout, size: number) => void
```

with these two actions:

```ts
setRepoFileTreePaneSize: (id: string, layout: RepoWorkspaceLayout, size: number) => void
setDefaultFileTreePaneSize: (layout: RepoWorkspaceLayout, size: number) => void
```

- [ ] **Step 2: Let tests seed project file area sizes**

In `src/web/stores/repos/test-utils.ts`, add `WorkspaceDetailPaneSizes` to the existing import from `#/shared/workspace-layout.ts`.

The import should include:

```ts
import {
  DEFAULT_DETAIL_COLLAPSED,
  DEFAULT_DETAIL_PANE_SIZES,
  DEFAULT_FILE_TREE_PANE_SIZES,
  DEFAULT_WORKSPACE_LAYOUT,
  type WorkspaceDetailPaneSizes,
} from '#/shared/workspace-layout.ts'
```

Add this option to the `seedRepoState` options object:

```ts
fileTreePaneSizes?: WorkspaceDetailPaneSizes
```

Then include it in the seeded `ui` object:

```ts
ui: {
  ...base.ui,
  selectedBranch: options.selectedBranch ?? base.ui.selectedBranch,
  branchViewMode: options.branchViewMode ?? base.ui.branchViewMode,
  detailTab: options.detailTab ?? base.ui.detailTab,
  workspaceLayout: options.workspaceLayout ?? base.ui.workspaceLayout,
  fileTreePaneSizes: options.fileTreePaneSizes ?? base.ui.fileTreePaneSizes,
  worktreePathOrder: options.worktreePathOrder ?? base.ui.worktreePathOrder,
},
```

- [ ] **Step 3: Run typecheck for the expected compile errors**

Run:

```bash
bun run typecheck
```

Expected: fail with errors because the renamed setters are declared but implementation and call sites still use `setFileTreePaneSize`.

---

### Task 2: Persist And Restore Project File Area Sizes

**Files:**
- Modify: `src/web/stores/repos/persistence.ts`
- Modify: `src/web/stores/repos/persistence.test.ts`

- [ ] **Step 1: Add failing persistence tests**

In `src/web/stores/repos/persistence.test.ts`, update the imports:

```ts
import { DEFAULT_FILE_TREE_PANE_SIZES } from '#/shared/workspace-layout.ts'
```

Add these tests inside `describe('normalizeRestorableRepoCache', () => { ... })`:

```ts
test('normalizes cached project file tree pane sizes', () => {
  const now = Date.now()
  const raw = cachedRepo(now) as any
  raw.ui.fileTreePaneSizes = { 'top-bottom': 44.44, 'left-right': 'bad' }

  const normalized = normalizeRestorableRepoCache({ repo: raw })

  expect(normalized.repo?.ui.fileTreePaneSizes).toEqual({
    'top-bottom': 44.4,
    'left-right': DEFAULT_FILE_TREE_PANE_SIZES['left-right'],
  })
})

test('keeps old cached repos without project file tree pane sizes valid', () => {
  const now = Date.now()
  const raw = cachedRepo(now)

  const normalized = normalizeRestorableRepoCache({ repo: raw })

  expect(normalized.repo?.ui.fileTreePaneSizes).toBeUndefined()
})
```

Add this test inside `describe('persistRestorableRepoSnapshot', () => { ... })`:

```ts
test('persists project file tree pane sizes in repo cache', () => {
  const repo = seedRepoState({
    id: '/repo',
    instanceToken: 1,
    branches: [createRepoBranch('main')],
    currentBranch: 'main',
    selectedBranch: 'main',
    fileTreePaneSizes: { 'top-bottom': 42.2, 'left-right': 73.4 },
  })

  persistRestorableRepoSnapshot(useReposStore.setState, repo, 1)

  expect(useReposStore.getState().restorableRepoCache['/repo']?.ui.fileTreePaneSizes).toEqual({
    'top-bottom': 42.2,
    'left-right': 73.4,
  })
})
```

Add this test inside `describe('restoreRepoProjectionFromSnapshot', () => { ... })`:

```ts
test('restores project file tree pane sizes from cache', () => {
  const now = Date.now()
  const cached = cachedRepo(now)
  cached.ui.fileTreePaneSizes = { 'top-bottom': 41.5, 'left-right': 70.5 }

  const repo = restoreRepoProjectionFromSnapshot(emptyRepo('/repo', 'repo'), cached)

  expect(repo.ui.fileTreePaneSizes).toEqual({ 'top-bottom': 41.5, 'left-right': 70.5 })
})
```

- [ ] **Step 2: Run persistence tests and verify failure**

Run:

```bash
bun run test src/web/stores/repos/persistence.test.ts
```

Expected: fail because project file tree pane sizes are not yet accepted, persisted, or restored.

- [ ] **Step 3: Implement persistence support**

In `src/web/stores/repos/persistence.ts`, update the import from `#/shared/workspace-layout.ts`:

```ts
import { DEFAULT_WORKSPACE_LAYOUT, normalizeFileTreePaneSizes } from '#/shared/workspace-layout.ts'
```

In `RestorableRepoSnapshotSchema.ui`, add:

```ts
fileTreePaneSizes: v.optional(v.unknown()),
```

In `restoreProjectionFromSnapshot`, add the field to `ui`:

```ts
fileTreePaneSizes: snapshot.ui.fileTreePaneSizes,
```

In `restorableRepoSnapshotFromRepo`, include the field only when the repo has a project-level value:

```ts
ui: {
  selectedBranch: repo.ui.selectedBranch,
  branchViewMode: repo.ui.branchViewMode,
  detailTab: normalizeCachedDetailTab(repo.ui.detailTab),
  workspaceLayout: repo.ui.workspaceLayout ?? DEFAULT_WORKSPACE_LAYOUT,
  ...(repo.ui.fileTreePaneSizes ? { fileTreePaneSizes: repo.ui.fileTreePaneSizes } : {}),
  worktreePathOrder: repo.ui.worktreePathOrder,
},
```

In `normalizeRestorableRepoSnapshotEntry`, normalize optional cached pane sizes before returning:

```ts
const fileTreePaneSizes =
  snapshot.ui.fileTreePaneSizes === undefined ? undefined : normalizeFileTreePaneSizes(snapshot.ui.fileTreePaneSizes)
const { fileTreePaneSizes: _rawFileTreePaneSizes, ...ui } = snapshot.ui
return {
  ...snapshot,
  data: {
    ...snapshot.data,
    branches: cachedBranches(snapshot.data.branches),
  },
  ui: {
    ...ui,
    detailTab: normalizeCachedDetailTab(snapshot.ui.detailTab),
    workspaceLayout: snapshot.ui.workspaceLayout ?? DEFAULT_WORKSPACE_LAYOUT,
    ...(fileTreePaneSizes ? { fileTreePaneSizes } : {}),
  },
}
```

- [ ] **Step 4: Run persistence tests and verify pass**

Run:

```bash
bun run test src/web/stores/repos/persistence.test.ts
```

Expected: pass.

---

### Task 3: Split Store Actions Into Project Override And Default Setter

**Files:**
- Modify: `src/web/stores/repos/selection.ts`
- Modify: `src/web/stores/repos/selection.test.ts`

- [ ] **Step 1: Add failing store tests**

In `src/web/stores/repos/selection.test.ts`, replace the existing `describe('setFileTreePaneSize', () => { ... })` block with this block:

```ts
describe('setRepoFileTreePaneSize', () => {
  test('stores file tree pane sizes per repo without leaking to other repos or defaults', () => {
    seedRepo({ selectedBranch: 'main', branches: [branch('main', { worktree: { path: '/repo' } })] })
    const repoB = replaceRepo(emptyRepo(REPO_B_ID, 'repo-b'), (repo) => {
      repo.ui.workspaceLayout = 'top-bottom'
    })
    useReposStore.setState((s) => ({
      repos: { ...s.repos, [REPO_B_ID]: repoB },
      order: [REPO_ID, REPO_B_ID],
      fileTreePaneSizes: { 'top-bottom': 66.7, 'left-right': 55.5 },
    }))

    useReposStore.getState().setRepoFileTreePaneSize(REPO_ID, 'top-bottom', 44.44)

    expect(useReposStore.getState().repos[REPO_ID]?.ui.fileTreePaneSizes).toEqual({
      'top-bottom': 44.4,
      'left-right': 55.5,
    })
    expect(useReposStore.getState().repos[REPO_B_ID]?.ui.fileTreePaneSizes).toBeUndefined()
    expect(useReposStore.getState().fileTreePaneSizes).toEqual({ 'top-bottom': 66.7, 'left-right': 55.5 })
    expect(useReposStore.getState().restorableRepoCache[REPO_ID]?.ui.fileTreePaneSizes).toEqual({
      'top-bottom': 44.4,
      'left-right': 55.5,
    })
  })

  test('ignores resize events for missing repos', () => {
    const before = useReposStore.getState()

    useReposStore.getState().setRepoFileTreePaneSize('/missing', 'left-right', 72)

    expect(useReposStore.getState()).toBe(before)
  })
})

describe('setDefaultFileTreePaneSize', () => {
  test('stores default file tree pane sizes per workspace layout', () => {
    useReposStore.getState().setDefaultFileTreePaneSize('top-bottom', 44.4)
    useReposStore.getState().setDefaultFileTreePaneSize('left-right', 35.2)

    expect(useReposStore.getState().fileTreePaneSizes).toEqual({
      'top-bottom': 44.4,
      'left-right': 35.2,
    })
  })
})
```

Update the existing `resetLayout` test setup so it seeds a project override and verifies it is preserved:

```ts
seedRepo({ selectedBranch: 'main', branches: [branch('main', { worktree: { path: '/repo' } })] })
useReposStore.getState().setRepoFileTreePaneSize(REPO_ID, 'top-bottom', 42)
useReposStore.setState({
  workspaceLayout: 'top-bottom',
  detailCollapsed: true,
  detailFocusMode: true,
  detailPaneSizes: { 'top-bottom': 35, 'left-right': 70 },
  fileTreePaneSizes: { 'top-bottom': 52, 'left-right': 38 },
})

useReposStore.getState().resetLayout()

expect(useReposStore.getState().workspaceLayout).toBe('left-right')
expect(useReposStore.getState().detailCollapsed).toBe(false)
expect(useReposStore.getState().detailFocusMode).toBe(false)
expect(useReposStore.getState().detailPaneSizes).toBe(DEFAULT_DETAIL_PANE_SIZES)
expect(useReposStore.getState().fileTreePaneSizes).toBe(DEFAULT_FILE_TREE_PANE_SIZES)
expect(useReposStore.getState().repos[REPO_ID]?.ui.fileTreePaneSizes).toEqual({
  'top-bottom': 42,
  'left-right': DEFAULT_FILE_TREE_PANE_SIZES['left-right'],
})
```

- [ ] **Step 2: Run store tests and verify failure**

Run:

```bash
bun run test src/web/stores/repos/selection.test.ts -- -t "file tree pane"
```

Expected: fail because the new action names and project-level behavior do not exist.

- [ ] **Step 3: Implement the store actions**

In `src/web/stores/repos/selection.ts`, update `RestorableWorkspaceSelectionActions` to pick the new action names:

```ts
  | 'setRepoFileTreePaneSize'
  | 'setDefaultFileTreePaneSize'
```

Replace the current `setFileTreePaneSize` implementation with:

```ts
setRepoFileTreePaneSize(id: string, layout: RepoWorkspaceLayout, size: number) {
  let changed = false
  let token: number | undefined
  set((s) => {
    const repo = s.repos[id]
    if (!repo) return s
    const next = normalizeFileTreePaneSize(layout, size)
    const current = repo.ui.fileTreePaneSizes?.[layout] ?? s.fileTreePaneSizes[layout]
    if (current === next) return s
    changed = true
    token = repo.instanceToken
    return {
      repos: {
        ...s.repos,
        [id]: replaceRepo(repo, (r) => {
          r.ui.fileTreePaneSizes = {
            ...(r.ui.fileTreePaneSizes ?? s.fileTreePaneSizes),
            [layout]: next,
          }
        }),
      },
    }
  })
  const repo = get().repos[id]
  if (changed && token !== undefined && repo) persistRestorableRepoSnapshot(set, repo, token)
},

setDefaultFileTreePaneSize(layout: RepoWorkspaceLayout, size: number) {
  set((s) => {
    const next = normalizeFileTreePaneSize(layout, size)
    if (s.fileTreePaneSizes[layout] === next) return s
    return { fileTreePaneSizes: { ...s.fileTreePaneSizes, [layout]: next } }
  })
},
```

- [ ] **Step 4: Run store tests and verify pass**

Run:

```bash
bun run test src/web/stores/repos/selection.test.ts -- -t "file tree pane|resetLayout"
```

Expected: pass.

---

### Task 4: Wire RepoExplorerPane To Effective Project Size

**Files:**
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.tsx`
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.test.tsx`

- [ ] **Step 1: Update the SplitPane test mock**

In `src/web/components/repo-workspace/RepoExplorerPane.test.tsx`, replace the existing `SplitPane` mock with this version:

```tsx
vi.mock('#/web/components/SplitPane.tsx', () => ({
  SplitPane: ({
    before,
    after,
    orientation,
    afterSize,
    onAfterSizeChange,
  }: {
    before: React.ReactNode
    after: React.ReactNode
    orientation: string
    afterSize: number
    onAfterSizeChange?: (size: number) => void
  }) => (
    <div data-testid="split-pane" data-orientation={orientation} data-after-size={String(afterSize)}>
      <button type="button" data-testid="resize-file-tree-pane" onClick={() => onAfterSizeChange?.(44.44)}>
        resize
      </button>
      {before}
      {after}
    </div>
  ),
}))
```

- [ ] **Step 2: Add failing component tests**

Add these tests inside `describe('RepoExplorerPane', () => { ... })`:

```tsx
test('uses default file tree pane size when the repo has no project override', async () => {
  seedRepoState({
    id: REPO_ID,
    branches: [createRepoBranch('main')],
    currentBranch: 'main',
    selectedBranch: 'main',
  })
  useReposStore.setState({ fileTreePaneSizes: { 'top-bottom': 41.5, 'left-right': 70.5 } })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(<RepoExplorerPane repoId={REPO_ID} layout="top-bottom" showActions />)
  })

  expect(container.querySelector('[data-testid="split-pane"]')?.getAttribute('data-after-size')).toBe('41.5')
  await act(async () => root.unmount())
})

test('uses project file tree pane size before the default', async () => {
  seedRepoState({
    id: REPO_ID,
    branches: [createRepoBranch('main')],
    currentBranch: 'main',
    selectedBranch: 'main',
    fileTreePaneSizes: { 'top-bottom': 38.2, 'left-right': 64.1 },
  })
  useReposStore.setState({ fileTreePaneSizes: { 'top-bottom': 41.5, 'left-right': 70.5 } })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(<RepoExplorerPane repoId={REPO_ID} layout="top-bottom" showActions />)
  })

  expect(container.querySelector('[data-testid="split-pane"]')?.getAttribute('data-after-size')).toBe('38.2')
  await act(async () => root.unmount())
})

test('resizing writes a project file tree pane size without changing defaults', async () => {
  seedRepoState({
    id: REPO_ID,
    branches: [createRepoBranch('main')],
    currentBranch: 'main',
    selectedBranch: 'main',
  })
  useReposStore.setState({ fileTreePaneSizes: { 'top-bottom': 41.5, 'left-right': 70.5 } })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(<RepoExplorerPane repoId={REPO_ID} layout="top-bottom" showActions />)
  })
  await act(async () => {
    container.querySelector<HTMLButtonElement>('[data-testid="resize-file-tree-pane"]')?.click()
  })

  expect(useReposStore.getState().repos[REPO_ID]?.ui.fileTreePaneSizes).toEqual({
    'top-bottom': 44.4,
    'left-right': 70.5,
  })
  expect(useReposStore.getState().fileTreePaneSizes).toEqual({ 'top-bottom': 41.5, 'left-right': 70.5 })
  await act(async () => root.unmount())
})
```

Add this missing import at the top:

```ts
import { useReposStore } from '#/web/stores/repos/store.ts'
```

- [ ] **Step 3: Run component tests and verify failure**

Run:

```bash
bun run test src/web/components/repo-workspace/RepoExplorerPane.test.tsx -- -t "file tree pane size|resizing writes"
```

Expected: fail because `RepoExplorerPane` still reads and writes the global setter.

- [ ] **Step 4: Implement RepoExplorerPane effective size**

In `src/web/components/repo-workspace/RepoExplorerPane.tsx`, change the Zustand selector to return project and default sizes:

```ts
  const { repoFileTreePaneSizes, defaultFileTreePaneSizes, setRepoFileTreePaneSize, changeCount } =
    useStoreWithEqualityFn(
      useReposStore,
      (state) => {
        const repo = state.repos[repoId]
        const selected = repo?.data.branches.find((branch) => branch.name === repo.ui.selectedBranch) ?? null
        const worktreePath = selected?.worktree?.path
        return {
          repoFileTreePaneSizes: repo?.ui.fileTreePaneSizes,
          defaultFileTreePaneSizes: state.fileTreePaneSizes,
          setRepoFileTreePaneSize: state.setRepoFileTreePaneSize,
          changeCount: worktreePath
            ? (repo?.data.status.find((status) => status.path === worktreePath)?.entries.length ?? 0)
            : 0,
        }
      },
      (a, b) =>
        a.repoFileTreePaneSizes === b.repoFileTreePaneSizes &&
        a.defaultFileTreePaneSizes === b.defaultFileTreePaneSizes &&
        a.setRepoFileTreePaneSize === b.setRepoFileTreePaneSize &&
        a.changeCount === b.changeCount,
    )
```

Then compute the effective size:

```ts
  const fileTreeSize = repoFileTreePaneSizes?.[layout] ?? defaultFileTreePaneSizes[layout]
```

Finally update the resize callback:

```tsx
onAfterSizeChange={(size) => setRepoFileTreePaneSize(repoId, layout, size)}
```

- [ ] **Step 5: Run component tests and verify pass**

Run:

```bash
bun run test src/web/components/repo-workspace/RepoExplorerPane.test.tsx
```

Expected: pass.

---

### Task 5: Update Settings To Edit Defaults Only

**Files:**
- Modify: `src/web/components/settings/pages/FileAreaSettings.tsx`
- Modify: `src/web/components/SettingsSurface.test.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/shared/i18n/ja.ts`

- [ ] **Step 1: Update settings test to protect project override**

In `src/web/components/SettingsSurface.test.tsx`, add these imports:

```ts
import { emptyRepo, replaceRepo } from '#/web/stores/repos/helpers.ts'
```

Replace the existing test named `edits the file area height ratio from settings` with:

```tsx
test('edits the new project default file area height ratio from settings without changing project overrides', async () => {
  const repo = replaceRepo(emptyRepo('/repo-a', 'repo-a'), (draft) => {
    draft.ui.fileTreePaneSizes = { 'top-bottom': 31.1, 'left-right': 32.2 }
  })
  useReposStore.setState({
    repos: { '/repo-a': repo },
    order: ['/repo-a'],
    activeId: '/repo-a',
    workspaceLayout: 'left-right',
    fileTreePaneSizes: { 'top-bottom': 66.7, 'left-right': 66.7 },
  })
  await render(<SettingsSurface page="files" onPageChange={() => {}} />)

  const input = document.getElementById('settings-file-tree-pane-size')
  if (!(input instanceof HTMLInputElement)) throw new Error('Missing file tree pane size input')

  await act(async () => {
    setInputValue(input, '72.5')
    await Promise.resolve()
  })

  expect(useReposStore.getState().fileTreePaneSizes['left-right']).toBe(72.5)
  expect(useReposStore.getState().repos['/repo-a']?.ui.fileTreePaneSizes).toEqual({
    'top-bottom': 31.1,
    'left-right': 32.2,
  })
})
```

- [ ] **Step 2: Run settings test and verify failure**

Run:

```bash
bun run test src/web/components/SettingsSurface.test.tsx -- -t "new project default file area height"
```

Expected: fail until the settings component uses `setDefaultFileTreePaneSize`.

- [ ] **Step 3: Update FileAreaSettings action usage**

In `src/web/components/settings/pages/FileAreaSettings.tsx`, change:

```ts
const setFileTreePaneSize = useReposStore((state) => state.setFileTreePaneSize)
```

to:

```ts
const setDefaultFileTreePaneSize = useReposStore((state) => state.setDefaultFileTreePaneSize)
```

Change the input callback:

```tsx
onChange={(size) => setDefaultFileTreePaneSize(workspaceLayout, size)}
```

Keep the value source as:

```ts
const fileTreePaneSize = useReposStore((state) => state.fileTreePaneSizes[workspaceLayout])
```

This keeps settings bound to defaults.

- [ ] **Step 4: Update localized settings copy**

In `src/shared/i18n/en.ts`, set:

```ts
'settings.files.height-ratio': 'New project default height ratio',
'settings.files.height-ratio-hint': 'Sets the file area height for projects that do not have their own saved size.',
```

In `src/shared/i18n/zh.ts`, set:

```ts
'settings.files.height-ratio': '新项目默认高度比例',
'settings.files.height-ratio-hint': '设置尚未保存独立大小的项目的文件区高度。',
```

In `src/shared/i18n/ko.ts`, set:

```ts
'settings.files.height-ratio': '새 프로젝트 기본 높이 비율',
'settings.files.height-ratio-hint': '자체 저장 크기가 없는 프로젝트의 파일 영역 높이를 설정합니다.',
```

In `src/shared/i18n/ja.ts`, set:

```ts
'settings.files.height-ratio': '新規プロジェクトのデフォルト高さ比率',
'settings.files.height-ratio-hint': '独自の保存サイズがないプロジェクトのファイル領域の高さを設定します。',
```

- [ ] **Step 5: Run settings and i18n tests**

Run:

```bash
bun run test src/web/components/SettingsSurface.test.tsx src/shared/i18n/dictionaries.test.ts
```

Expected: pass.

---

### Task 6: Update Remaining References And Verify End To End

**Files:**
- Modify any compile failures reported by typecheck.
- No new files expected.

- [ ] **Step 1: Find remaining old setter references**

Run:

```bash
rg -n "setFileTreePaneSize" "src"
```

Expected after implementation: no results.

- [ ] **Step 2: Run focused tests**

Run:

```bash
bun run test src/web/stores/repos/selection.test.ts src/web/stores/repos/persistence.test.ts src/web/components/repo-workspace/RepoExplorerPane.test.tsx src/web/components/SettingsSurface.test.tsx src/shared/i18n/dictionaries.test.ts
```

Expected: pass.

- [ ] **Step 3: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: pass.

- [ ] **Step 4: Run full test suite**

Run:

```bash
bun run test
```

Expected: pass.

- [ ] **Step 5: Inspect final diff**

Run:

```bash
git diff --stat
git diff -- src/web/stores/repos/types.ts src/web/stores/repos/selection.ts src/web/stores/repos/persistence.ts src/web/components/repo-workspace/RepoExplorerPane.tsx src/web/components/settings/pages/FileAreaSettings.tsx
```

Expected: diff shows project-level file tree pane sizes, default setter split, settings copy update, and tests only. No unrelated refactors.

---

## Self-Review Checklist

- Spec coverage: the plan stores sizes per project, persists them, keeps defaults for projects without overrides, updates settings semantics, and verifies no cross-project leakage.
- Placeholder scan: no incomplete sections or generic implementation instructions remain.
- Type consistency: action names are `setRepoFileTreePaneSize` and `setDefaultFileTreePaneSize`; project field is `repo.ui.fileTreePaneSizes`; default field remains `state.fileTreePaneSizes`.
- Project instruction compliance: no branch or commit steps are included.
