# Non-Git Workspace Layout Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show non-Git workspaces as two simultaneous areas, files and terminal, with a per-workspace outer layout toggle that defaults to left-right and keeps the terminal's internal multi-tab behavior intact.

**Architecture:** Move the outer workspace layout from a global renderer setting to per-repo UI state, restore it from the existing repo cache, and feed that layout into the active workspace shell. Replace the current plain-workspace single-area/tab shell with a real split shell that renders the file area and terminal area at the same time. Keep the terminal subsystem unchanged inside the terminal area so multi-session tabs still work exactly as before.

**Tech Stack:** TypeScript strip-only mode, React, Zustand, Vitest, existing repo/session persistence, current layout and terminal components.

---

## File Map

- Modify `src/web/stores/repos/types.ts`: add per-repo workspace layout state to `RepoUiState`.
- Modify `src/web/stores/repos/helpers.ts`: default new repos to left-right layout.
- Modify `src/web/stores/repos/persistence.ts`: persist and restore the per-repo layout in repo snapshots.
- Modify `src/web/stores/repos/selection.ts`: write layout changes to the targeted repo instead of the global workspace state.
- Modify `src/web/stores/repos/selector-state.ts`: stop treating the global workspace layout as the active UI source for workspace rendering.
- Modify `src/web/stores/repos/test-utils.ts`: let tests seed repo-specific layout state.
- Modify `src/web/components/RepoView.tsx`: read layout from the active repo and render the plain-workspace shell with that layout.
- Modify `src/web/components/repo-workspace/PlainWorkspacePane.tsx`: replace the current file/terminal tab swapper with a true two-area split shell.
- Modify `src/web/components/repo-workspace/RepoExplorerPane.tsx`: route plain workspaces into the split shell and keep Git workspaces unchanged.
- Modify `src/web/components/repo-toolbar/RepoToolbar.tsx`: bind the layout control to the active repo's layout.
- Modify `src/web/components/topbar/TopbarRepoControls.tsx`: keep the layout control visible for non-Git workspaces and bind it to the active repo.
- Modify `src/web/components/settings/pages/FileAreaSettings.tsx`: read and update file-area sizing against the active repo layout instead of a single global layout.
- Modify `src/web/stores/session-restore.ts`: keep restore defaults aligned with the repo-local layout seed.
- Modify `src/web/restorable-workspace-state.ts`: stop persisting the global layout as the canonical render source.
- Modify `src/web/hooks/useSessionPersistence.ts`: persist the restorable workspace state without relying on a single global layout for rendering.
- Modify `src/web/stores/repos/selection.test.ts`: cover per-repo layout isolation and defaulting.
- Modify `src/web/stores/repos/persistence.test.ts`: cover repo snapshot persistence and restoration of the layout.
- Modify `src/web/stores/repos/lifecycle.test.ts`: cover reopening a workspace with its remembered layout.
- Modify `src/web/components/RepoView.test.tsx`: cover per-workspace layout switching and no outer file/terminal tabs.
- Modify `src/web/components/repo-toolbar/RepoToolbar.test.tsx`: cover layout changes being scoped to the current repo.
- Modify `src/web/components/repo-workspace/RepoExplorerPane.test.tsx`: cover plain workspaces rendering both areas at once.
- Modify `src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.test.tsx`: keep terminal multi-tab behavior intact inside the terminal area.

---

### Task 1: Add Per-Workspace Layout State

**Files:**
- Modify: `src/web/stores/repos/types.ts`
- Modify: `src/web/stores/repos/helpers.ts`
- Modify: `src/web/stores/repos/persistence.ts`
- Modify: `src/web/stores/repos/selection.ts`
- Modify: `src/web/stores/repos/selector-state.ts`
- Modify: `src/web/stores/repos/test-utils.ts`
- Modify: `src/web/stores/session-restore.ts`
- Modify: `src/web/restorable-workspace-state.ts`
- Modify: `src/web/hooks/useSessionPersistence.ts`
- Modify: `src/web/stores/repos/selection.test.ts`
- Modify: `src/web/stores/repos/persistence.test.ts`
- Modify: `src/web/stores/repos/lifecycle.test.ts`

- [ ] **Step 1: Write the failing layout-state tests**

Add tests that prove the layout is now repo-local instead of global:

```ts
test('stores workspace layout per repo without leaking to other repos', () => {
  seedRepoState({ id: REPO_A, workspaceLayout: 'top-bottom' })
  seedRepoState({ id: REPO_B, workspaceLayout: 'left-right' })

  useReposStore.getState().setWorkspaceLayout(REPO_A, 'left-right')

  expect(useReposStore.getState().repos[REPO_A]?.ui.workspaceLayout).toBe('left-right')
  expect(useReposStore.getState().repos[REPO_B]?.ui.workspaceLayout).toBe('left-right')
})

test('restores a repo-specific workspace layout from cache', async () => {
  await useReposStore.getState().ensureWorkspaceOpen(REPO_A)
  useReposStore.getState().setWorkspaceLayout(REPO_A, 'top-bottom')
  useReposStore.getState().closeRepo(REPO_A)

  await useReposStore.getState().ensureWorkspaceOpen(REPO_A)
  expect(useReposStore.getState().repos[REPO_A]?.ui.workspaceLayout).toBe('top-bottom')
})
```

- [ ] **Step 2: Run the focused store tests and confirm they fail**

Run:

```bash
bun run test src/web/stores/repos/selection.test.ts src/web/stores/repos/persistence.test.ts src/web/stores/repos/lifecycle.test.ts
```

Expected: failures because `workspaceLayout` is still treated as a shared workspace field and repo snapshots do not restore it yet.

- [ ] **Step 3: Move layout storage into repo UI state**

Update the repo model and snapshot layer so the layout belongs to each repo:

```ts
export interface RepoUiState {
  selectedBranch: string | null
  branchViewMode: BranchViewMode
  detailTab: DetailTab
  workspaceLayout: RepoWorkspaceLayout
  worktreePathOrder: string[]
}
```

```ts
export function emptyRepo(id: string, name: string): RepoState {
  return {
    id,
    name,
    isGitRepo: true,
    instanceToken: nextInstanceToken++,
    data: { branches: [], currentBranch: '', status: [], statusLoaded: false, worktreesByPath: {} },
    resources: emptyRepoResources(),
    operations: emptyRepoOperations(),
    ui: {
      selectedBranch: null,
      branchViewMode: 'all',
      detailTab: 'status',
      workspaceLayout: DEFAULT_WORKSPACE_LAYOUT,
      worktreePathOrder: [],
    },
    projection: { source: 'fresh', savedAt: null },
    remote: { remotes: [], remoteDetails: [], hasRemotes: false, hasBrowserRemote: false, browserRemoteProvider: undefined, remoteProviders: {}, hasGitHubRemote: false, fetchFailed: false, fetchError: null },
    availability: { phase: 'available' },
    events: [],
  }
}
```

Also update `restorableRepoSnapshotFromRepo()`, `restoreProjectionFromSnapshot()`, and `normalizeRestorableRepoSnapshotEntry()` so `ui.workspaceLayout` is persisted and restored alongside `selectedBranch`, `branchViewMode`, and `detailTab`.

- [ ] **Step 4: Update the layout action to target a repo**

Replace the current global layout mutation with a repo-scoped one:

```ts
setWorkspaceLayout(id: string, layout: RepoWorkspaceLayout) {
  set((s) => {
    const repo = s.repos[id]
    if (!repo) return s
    if (repo.ui.workspaceLayout === layout) return s
    return replaceRepoState(s, repo, (draft) => {
      draft.ui.workspaceLayout = layout
    })
  })
}
```

Update `selection.ts`, `selector-state.ts`, `session-restore.ts`, `restorable-workspace-state.ts`, and `useSessionPersistence.ts` so the repo-local layout is the value that workspace UI reads and writes.

- [ ] **Step 5: Run the focused store tests and confirm they pass**

Run:

```bash
bun run test src/web/stores/repos/selection.test.ts src/web/stores/repos/persistence.test.ts src/web/stores/repos/lifecycle.test.ts
```

Expected: pass, with repo A and repo B keeping independent layout state.

---

### Task 2: Bind Layout Controls to the Active Repo

**Files:**
- Modify: `src/web/components/RepoView.tsx`
- Modify: `src/web/components/repo-toolbar/RepoToolbar.tsx`
- Modify: `src/web/components/topbar/TopbarRepoControls.tsx`
- Modify: `src/web/components/settings/pages/FileAreaSettings.tsx`
- Modify: `src/web/components/repo-toolbar/WorkspaceLayoutControl.tsx`
- Modify: `src/web/components/RepoView.test.tsx`
- Modify: `src/web/components/repo-toolbar/RepoToolbar.test.tsx`

- [ ] **Step 1: Write the failing UI tests**

Add tests that prove the control reads from the current repo and switching one workspace does not change another:

```tsx
test('layout changes only affect the active repo', () => {
  seedRepoState({ id: REPO_A, workspaceLayout: 'left-right' })
  seedRepoState({ id: REPO_B, workspaceLayout: 'top-bottom' })

  renderRepoView(REPO_A)
  container?.querySelector<HTMLButtonElement>('button[aria-label="workspace.layout-tooltip.top-bottom"]')?.click()

  expect(useReposStore.getState().repos[REPO_A]?.ui.workspaceLayout).toBe('top-bottom')
  expect(useReposStore.getState().repos[REPO_B]?.ui.workspaceLayout).toBe('top-bottom')
})

test('non-git workspace keeps the layout toggle visible while hiding git actions', () => {
  seedRepoState({ id: REPO_A, isGitRepo: false, workspaceLayout: 'left-right' })

  renderRepoView(REPO_A)

  expect(container?.querySelector('[aria-label="workspace.layout-label"]')).not.toBeNull()
  expect(container?.querySelector('button[aria-label="action.create-worktree-title"]')).toBeNull()
})
```

- [ ] **Step 2: Run the focused UI tests and confirm they fail**

Run:

```bash
bun run test src/web/components/RepoView.test.tsx src/web/components/repo-toolbar/RepoToolbar.test.tsx
```

Expected: failures because the UI still reads the shared layout and the controls are not yet bound to the repo-local field.

- [ ] **Step 3: Switch workspace chrome to repo-local layout**

Update the active workspace shell and toolbar controls so they read `repo.ui.workspaceLayout` and call `setWorkspaceLayout(repoId, layout)`:

```ts
const repo = useReposStore((s) => s.repos[repoId])
const layout = repo?.ui.workspaceLayout ?? DEFAULT_WORKSPACE_LAYOUT
const setWorkspaceLayout = useReposStore((s) => s.setWorkspaceLayout)
```

Apply that pattern in `RepoView.tsx`, `RepoToolbar.tsx`, `TopbarRepoControls.tsx`, and `FileAreaSettings.tsx`.

- [ ] **Step 4: Run the focused UI tests and confirm they pass**

Run:

```bash
bun run test src/web/components/RepoView.test.tsx src/web/components/repo-toolbar/RepoToolbar.test.tsx
```

Expected: pass, and the active repo keeps its own layout when another repo changes.

---

### Task 3: Render Plain Workspaces as a Real Two-Area Split

**Files:**
- Modify: `src/web/components/repo-workspace/PlainWorkspacePane.tsx`
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.tsx`
- Modify: `src/web/components/RepoView.tsx`
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.test.tsx`
- Modify: `src/web/components/RepoView.test.tsx`
- Modify: `src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.test.tsx`

- [ ] **Step 1: Write the failing split-shell tests**

Add tests that prove the plain workspace no longer swaps file and terminal with outer tabs:

```tsx
test('plain workspace renders files and terminal at the same time', async () => {
  seedRepoState({ id: REPO_A, isGitRepo: false, workspaceLayout: 'left-right' })
  render(<RepoExplorerPane repoId={REPO_A} layout="left-right" showActions />)

  expect(container.querySelector('[data-testid="split-pane"]')).toBeTruthy()
  expect(container.querySelector('[data-testid="project-file-tree"]')).toBeTruthy()
  expect(container.querySelector('[data-testid="plain-workspace-terminal"]')).toBeTruthy()
  expect(container.querySelectorAll('[role="tab"]').length).toBeGreaterThan(0)
})
```

The terminal tabs assertion should target the terminal area and not an outer file/terminal tab bar.

- [ ] **Step 2: Run the focused UI tests and confirm they fail**

Run:

```bash
bun run test src/web/components/repo-workspace/RepoExplorerPane.test.tsx src/web/components/RepoView.test.tsx src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.test.tsx
```

Expected: failures because the plain-workspace shell still uses a single-area tab swapper.

- [ ] **Step 3: Replace the outer tab swapper with a split shell**

Rewrite `PlainWorkspacePane.tsx` so it renders a split container instead of file/terminal tabs:

```tsx
return (
  <RepoWorkspace layout={layout} mode="split" branchPane={<ProjectFileTree repoId={repoId} revealRequest={revealRequest} />} detailPane={<PlainWorkspaceTerminalPanel repoId={repoId} />} />
)
```

Update `RepoExplorerPane.tsx` and `RepoView.tsx` to route non-Git workspaces through that split shell and to stop rendering any outer file/terminal tab bar for those workspaces.

- [ ] **Step 4: Run the focused UI tests and confirm they pass**

Run:

```bash
bun run test src/web/components/repo-workspace/RepoExplorerPane.test.tsx src/web/components/RepoView.test.tsx src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.test.tsx
```

Expected: pass, with files and terminal visible together and the terminal's internal multi-tab behavior unchanged.

---

### Task 4: Final Regression Pass

**Files:**
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.test.tsx`
- Modify: `src/web/components/RepoView.test.tsx`
- Modify: `src/web/components/repo-toolbar/RepoToolbar.test.tsx`
- Modify: `src/web/stores/repos/selection.test.ts`
- Modify: `src/web/stores/repos/lifecycle.test.ts`
- Modify: `src/web/stores/repos/persistence.test.ts`

- [ ] **Step 1: Run the targeted regression suite**

Run:

```bash
bun run test \
  src/web/stores/repos/selection.test.ts \
  src/web/stores/repos/persistence.test.ts \
  src/web/stores/repos/lifecycle.test.ts \
  src/web/components/RepoView.test.tsx \
  src/web/components/repo-toolbar/RepoToolbar.test.tsx \
  src/web/components/repo-workspace/RepoExplorerPane.test.tsx \
  src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.test.tsx
```

Expected: all listed files pass.

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: typecheck completes successfully.

- [ ] **Step 3: Run the architecture guard**

Run:

```bash
bun run check:architecture
```

Expected: the import boundary check passes.

- [ ] **Step 4: Run the full test suite**

Run:

```bash
bun run test
```

Expected: the full suite passes with no new regressions in Git workspaces, remote no-Git workspaces, or terminal session handling.

