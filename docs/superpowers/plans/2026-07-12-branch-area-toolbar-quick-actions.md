# Branch Area Toolbar Quick Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Editor and Terminal icon buttons to the branch area toolbar that activate the currently selected worktree with one click.

**Architecture:** Add a `BranchAreaQuickActions` sub-component inside `BranchArea` in `RepoExplorerPane.tsx`. It subscribes to the store for the selected branch, calls `useBranchActionItems` to get existing `editor` and `terminal` actions (including their `onSelect` handlers, icons, and disabled state), and renders them as icon-only buttons.

**Tech Stack:** React, Zustand, `useBranchActionItems` hook, `AsyncButton`, `Tip`

---

### Task 1: Add `BranchAreaQuickActions` component and wire it into `BranchArea`

**Files:**
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.tsx`
- Test: `src/web/components/repo-workspace/RepoExplorerPane.test.tsx`

#### Step 1: Write the failing tests

Add two tests to `RepoExplorerPane.test.tsx`. Open the existing test file and add these after the last existing test case (before the closing `}` of the `describe` block):

```tsx
test('branch area toolbar shows disabled editor and terminal buttons when selected branch has no worktree', async () => {
  seedRepoState({
    id: REPO_ID,
    branches: [createRepoBranch('main')], // no worktree
    currentBranch: 'main',
    selectedBranch: 'main',
  })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<RepoExplorerPane repoId={REPO_ID} layout="top-bottom" showActions />)
  })

  const toolbar = container.querySelector('[data-testid="branch-area-toolbar"]')
  expect(toolbar).toBeTruthy()

  const editorBtn = toolbar?.querySelector('[data-testid="branch-area-editor-btn"]') as HTMLButtonElement | null
  const terminalBtn = toolbar?.querySelector('[data-testid="branch-area-terminal-btn"]') as HTMLButtonElement | null
  expect(editorBtn).toBeTruthy()
  expect(terminalBtn).toBeTruthy()
  expect(editorBtn?.disabled).toBe(true)
  expect(terminalBtn?.disabled).toBe(true)

  await act(async () => root.unmount())
})

test('branch area toolbar shows enabled editor and terminal buttons when selected branch has a worktree', async () => {
  seedRepoState({
    id: REPO_ID,
    branches: [createRepoBranch('main', { worktree: { path: '/repos/main', isDetached: false } })],
    currentBranch: 'main',
    selectedBranch: 'main',
  })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<RepoExplorerPane repoId={REPO_ID} layout="top-bottom" showActions />)
  })

  const toolbar = container.querySelector('[data-testid="branch-area-toolbar"]')
  const editorBtn = toolbar?.querySelector('[data-testid="branch-area-editor-btn"]') as HTMLButtonElement | null
  const terminalBtn = toolbar?.querySelector('[data-testid="branch-area-terminal-btn"]') as HTMLButtonElement | null
  expect(editorBtn).toBeTruthy()
  expect(terminalBtn).toBeTruthy()
  expect(editorBtn?.disabled).toBe(false)
  expect(terminalBtn?.disabled).toBe(false)

  await act(async () => root.unmount())
})
```

**Note:** `createRepoBranch` may not accept a `worktree` option yet — check its signature first:

```bash
grep -n "createRepoBranch" src/web/stores/repos/test-utils.ts
```

If it doesn't accept worktree options, the second test can seed via `useReposStore.getState().repos[REPO_ID].data.branches` directly, or skip the enabled-state test and only test the disabled case (since the disabled path is the main regression risk).

- [ ] **Step 1a: Check `createRepoBranch` signature**

Run:
```bash
grep -n "createRepoBranch\|function createRepoBranch" src/web/stores/repos/test-utils.ts
```

Read the function to understand what parameters it accepts. If it does not accept a `worktree` property, use the simpler approach: only write the disabled-state test (Task 1, Step 1 first test only), and note that the enabled path is covered by manual browser testing.

- [ ] **Step 1b: Add the failing test(s) to `RepoExplorerPane.test.tsx`**

Add the test(s) identified in Step 1a.

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/web/components/repo-workspace/RepoExplorerPane.test.tsx --reporter=verbose 2>&1 | tail -30
```

Expected: new tests FAIL with something like `null` for `branch-area-editor-btn`.

- [ ] **Step 3: Add `BranchAreaQuickActions` to `RepoExplorerPane.tsx`**

Open `src/web/components/repo-workspace/RepoExplorerPane.tsx`.

Add these imports at the top (alongside the existing imports):

```tsx
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { createElement } from 'react'
import { AsyncButton } from '#/web/components/AsyncButton.tsx'
import { Tip } from '#/web/components/Tip.tsx'
import { EditorAppIcon, TerminalAppIcon } from '#/web/components/ExternalAppIcon/index.tsx'
import { useRuntimeExternalAppSettings } from '#/web/runtime-settings-external-apps.ts'
import { useBranchActionItems } from '#/web/hooks/useBranchActionItems.ts'
import type { BranchActionRepo } from '#/web/hooks/branch-action-state.ts'
```

**Note:** Some of these may already be imported — check the top of the file and only add the ones that are missing.

Add the new component **after** the `BranchArea` function definition (around line 133):

```tsx
function BranchAreaQuickActions({ repoId }: { repoId: string }) {
  const { terminalApp, resolvedTerminalApp, terminalAvailable, editorApp, resolvedEditorApp, editorAvailable } =
    useRuntimeExternalAppSettings()

  const { repo, branch } = useStoreWithEqualityFn(
    useReposStore,
    (s) => {
      const r = s.repos[repoId]
      if (!r) return { repo: null, branch: null }
      const selectedBranch = r.ui.selectedBranch
        ? (r.data.branches.find((b) => b.name === r.ui.selectedBranch) ?? null)
        : null
      const actionRepo: BranchActionRepo = {
        id: r.id,
        instanceToken: r.instanceToken,
        data: {
          currentBranch: r.data.currentBranch,
          status: r.data.status,
          worktreesByPath: r.data.worktreesByPath,
        },
        ui: {
          selectedBranch: r.ui.selectedBranch,
        },
        operations: {
          branchAction: r.operations.branchAction,
          fetch: r.operations.fetch,
          manualRefresh: r.operations.manualRefresh,
        },
        remote: {
          target: r.remote.target,
          hasRemotes: r.remote.hasRemotes,
          hasBrowserRemote: r.remote.hasBrowserRemote,
          hasGitHubRemote: r.remote.hasGitHubRemote,
          browserRemoteProvider: r.remote.browserRemoteProvider,
          remoteProviders: r.remote.remoteProviders,
        },
      }
      return { repo: actionRepo, branch: selectedBranch }
    },
    (a, b) =>
      a.repo === b.repo &&
      a.branch === b.branch,
  )

  if (!repo || !branch) return null

  const actions = useBranchActionItems(repo, branch)
  const editorItem = actions.externalItems.find((item) => item.id === 'editor')
  const terminalItem = actions.externalItems.find((item) => item.id === 'terminal')

  const editorIconPref = resolvedEditorApp ?? editorApp
  const terminalIconPref = repo.remote.target ? 'auto' : (resolvedTerminalApp ?? terminalApp)

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      {editorItem && (
        <Tip label={editorItem.title ?? editorItem.label}>
          <span className="inline-flex">
            <AsyncButton
              data-testid="branch-area-editor-btn"
              variant="ghost"
              size="icon-sm"
              loading={editorItem.busy}
              disabled={editorItem.disabled || !editorAvailable}
              onClick={editorItem.onSelect}
              aria-label={editorItem.ariaLabel ?? editorItem.label}
            >
              {() => createElement(EditorAppIcon, { pref: editorIconPref })}
            </AsyncButton>
          </span>
        </Tip>
      )}
      {terminalItem && (
        <Tip label={terminalItem.title ?? terminalItem.label}>
          <span className="inline-flex">
            <AsyncButton
              data-testid="branch-area-terminal-btn"
              variant="ghost"
              size="icon-sm"
              loading={terminalItem.busy}
              disabled={terminalItem.disabled || !terminalAvailable}
              onClick={terminalItem.onSelect}
              aria-label={terminalItem.ariaLabel ?? terminalItem.label}
            >
              {() => createElement(TerminalAppIcon, { pref: terminalIconPref })}
            </AsyncButton>
          </span>
        </Tip>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Wire `BranchAreaQuickActions` into `BranchArea`**

Find the `BranchArea` function (around line 121) and update the toolbar's right section:

Before:
```tsx
function BranchArea({ repoId, showActions }: { repoId: string; showActions: boolean }) {
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <Toolbar data-testid="branch-area-toolbar" className="px-2" variant="detail">
        <BranchFilterControls repoId={repoId} className="h-full min-w-0 flex-1 gap-1" />
        <div className="flex shrink-0 items-center gap-1">
          <RepoToolbarActions repoId={repoId} compact />
        </div>
      </Toolbar>
      <BranchList repoId={repoId} showActions={showActions} />
    </section>
  )
}
```

After:
```tsx
function BranchArea({ repoId, showActions }: { repoId: string; showActions: boolean }) {
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <Toolbar data-testid="branch-area-toolbar" className="px-2" variant="detail">
        <BranchFilterControls repoId={repoId} className="h-full min-w-0 flex-1 gap-1" />
        <div className="flex shrink-0 items-center gap-1">
          <BranchAreaQuickActions repoId={repoId} />
          <RepoToolbarActions repoId={repoId} compact />
        </div>
      </Toolbar>
      <BranchList repoId={repoId} showActions={showActions} />
    </section>
  )
}
```

- [ ] **Step 5: Check TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors. If `BranchActionRepo` shape doesn't match, read `src/web/hooks/branch-action-state.ts` to see the exact interface and fix the mapping in `BranchAreaQuickActions`.

- [ ] **Step 6: Run the tests**

```bash
npx vitest run src/web/components/repo-workspace/RepoExplorerPane.test.tsx --reporter=verbose 2>&1 | tail -30
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/web/components/repo-workspace/RepoExplorerPane.tsx src/web/components/repo-workspace/RepoExplorerPane.test.tsx
git commit -m "feat(branch-area): add editor and terminal quick action buttons to toolbar"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| Two icon buttons (editor, terminal) in branch area toolbar | Task 1 Step 3–4 |
| Buttons activate currently selected worktree | Task 1 Step 3 (`onSelect` from `useBranchActionItems`) |
| No worktree / no selection → disabled | Task 1 Step 3 (`editorItem.disabled`) |
| Icons consistent with detail panel (`EditorAppIcon`/`TerminalAppIcon`) | Task 1 Step 3 |
| Only `RepoExplorerPane.tsx` changed | Task 1 |

**Placeholder scan:** None — all steps have code.

**Type consistency:** `BranchActionRepo` is used consistently in both the store selector and the `useBranchActionItems` call.
