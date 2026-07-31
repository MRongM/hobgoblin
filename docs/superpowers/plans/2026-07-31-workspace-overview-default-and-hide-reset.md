# Workspace Overview Default And Hide Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. This plan is explicitly assigned to inline execution in the current session; do not dispatch subagents.

**Goal:** Make every top-level multi-repository workspace activation enter its Overview, and make hiding workspace repositories also exit repository/worktree context and collapse the File area.

**Architecture:** Keep workspace context selection in the existing repos Store and File area visibility in its existing component-local React owners. `WorkspaceRepositoryRail` emits an idempotent collapse intent before activating Overview and hiding the list; top-level activation and hydration normalize multi-repository workspaces to `{ kind: 'overview' }`.

**Tech Stack:** React 19, Zustand, TypeScript 6 strip-only mode, Vitest, Testing Library-compatible React DOM tests.

## Global Constraints

- Do not add runtime TypeScript enums, runtime namespaces, parameter properties, or import aliases.
- Use repo-alias imports with explicit `.ts` / `.tsx` extensions.
- File area visibility remains renderer-local; do not add a server API, realtime path, persistence field, or Zustand field.
- Preserve standalone Git repository and plain-directory activation behavior.
- Keep tests and docs privacy-safe with generic paths and identifiers.
- Do not create a branch or run `git commit`; the user did not authorize Git mutations.
- Verify with `bun run typecheck`, `bun run check:architecture`, and `bun run test`.

---

### Task 1: Normalize Multi-Repository Workspace Activation To Overview

**Files:**

- Modify: `src/web/stores/repos/selection.ts`
- Modify: `src/web/stores/repos/workspace-projects.ts`
- Modify: `src/web/stores/repos/lifecycle.ts`
- Modify: `src/web/stores/repos/lifecycle-write-paths.ts`
- Test: `src/web/stores/repos/selection.test.ts`
- Test: `src/web/stores/repos/workspace-projects.test.ts`
- Test: `src/web/stores/repos/lifecycle.test.ts`
- Test: `src/web/stores/repos/lifecycle-hydrate.test.ts`

**Interfaces:**

- Consumes: existing `activateWorkspaceContext(set, state, rootId, context)` and `WorkspaceActiveContext`.
- Produces: invariant that activating a top-level workspace yields `activeId === rootId`, `activeProjectId === rootId`, and `workspaceActiveContextByRoot[rootId] === { kind: 'overview' }`.

- [ ] **Step 1: Change selection tests to require Overview defaults**

Replace the saved-repository restoration expectation in `selection.test.ts` with:

```ts
test('activates a workspace project at Overview instead of restoring its saved repository', () => {
  seedWorkspaceSelection()

  useReposStore.getState().activateWorkspaceRepository(rootId, childId)
  useReposStore.getState().setActive(soloId)
  useReposStore.getState().activateProject(rootId)

  expect(useReposStore.getState().activeId).toBe(rootId)
  expect(useReposStore.getState().activeProjectId).toBe(rootId)
  expect(useReposStore.getState().workspaceActiveContextByRoot[rootId]).toEqual({ kind: 'overview' })
})
```

Change the cycle-back assertion to:

```ts
useReposStore.getState().cycleActive(-1)
expect(useReposStore.getState().activeId).toBe(rootId)
expect(useReposStore.getState().workspaceActiveContextByRoot[rootId]).toEqual({ kind: 'overview' })
```

Remove `projectActivationTarget` cases from `workspace-projects.test.ts`; keep the `workspaceActiveContext` validation cases because runtime navigation still uses saved context while already inside a workspace.

- [ ] **Step 2: Change lifecycle tests to require root fallback and root hydration**

In `lifecycle.test.ts`, change the configured-member removal assertions to:

```ts
expect(useReposStore.getState().activeId).toBe(root)
expect(useReposStore.getState().workspaceActiveContextByRoot[root]).toEqual({ kind: 'overview' })
```

Add this close fallback case:

```ts
test('closing a project activates the next workspace at Overview', () => {
  const root = '/tmp/gbl-workspace'
  const child = `${root}/api`
  const solo = '/tmp/gbl-solo'
  useReposStore.setState({
    repos: {
      [root]: replaceRepo(emptyRepo(root, 'workspace'), (repo) => {
        repo.isGitRepo = false
      }),
      [child]: replaceRepo(emptyRepo(child, 'api'), (repo) => {
        repo.workspaceRootId = root
      }),
      [solo]: emptyRepo(solo, 'solo'),
    },
    order: [root, solo],
    activeId: solo,
    activeProjectId: solo,
    workspaceProjects: {
      [root]: {
        rootId: root,
        repositoryIds: [child],
        candidates: [],
        configured: false,
        configurationError: null,
        phase: 'ready',
        skipped: [],
        error: null,
      },
    },
    workspaceActiveContextByRoot: { [root]: { kind: 'repository', repositoryId: child } },
  })

  useReposStore.getState().closeRepo(solo)

  expect(useReposStore.getState().activeId).toBe(root)
  expect(useReposStore.getState().activeProjectId).toBe(root)
  expect(useReposStore.getState().workspaceActiveContextByRoot[root]).toEqual({ kind: 'overview' })
})
```

In `lifecycle-hydrate.test.ts`, update workspace-root restoration cases to assert:

```ts
expect(useReposStore.getState().activeId).toBe(root)
expect(useReposStore.getState().activeProjectId).toBe(root)
expect(useReposStore.getState().workspaceActiveContextByRoot[root]).toEqual({ kind: 'overview' })
```

Keep the table case for `activeProject === child`; that case must still assert `activeId === child` and `activeProjectId === child` because the repository is being restored as an independent top-level project.

- [ ] **Step 3: Run Store tests and verify the new expectations fail**

Run:

```bash
bun run test src/web/stores/repos/workspace-projects.test.ts src/web/stores/repos/selection.test.ts src/web/stores/repos/lifecycle.test.ts src/web/stores/repos/lifecycle-hydrate.test.ts
```

Expected: failures show workspace activation, cycle-back, member-removal fallback, close fallback, and root session restoration still selecting a saved member repository.

- [ ] **Step 4: Make top-level selection activate Overview**

Replace the workspace branch of `activateProject` in `selection.ts` with:

```ts
activateProject(id: string) {
  const state = get()
  if (!state.workspaceProjects[id]) {
    get().setActive(id)
    return
  }
  activateWorkspaceContext(set, state, id, { kind: 'overview' })
},
```

Delete the now-unused `projectActivationTarget` export from `workspace-projects.ts` and remove its imports.

- [ ] **Step 5: Normalize invalid-member and close fallbacks**

In `reconcileWorkspaceProject` inside `lifecycle-write-paths.ts`, replace automatic selection of the first remaining repository with:

```ts
if (activeBelongsToWorkspace && state.activeId !== rootId && !repositoryIds.includes(state.activeId!)) {
  return {
    repos,
    order,
    activeId: rootId,
    workspaceProjects,
    workspaceActiveContextByRoot: {
      ...state.workspaceActiveContextByRoot,
      [rootId]: { kind: 'overview' as const },
    },
  }
}
```

In `closeRepo`, use the next top-level project id directly as `activeId`. If that id names a workspace, overwrite only its context with Overview before returning the next state:

```ts
const activeId = nextProjectId
const nextWorkspaceActiveContextByRoot =
  nextProjectId && workspaceProjects[nextProjectId]
    ? {
        ...workspaceActiveContextByRoot,
        [nextProjectId]: { kind: 'overview' as const },
      }
    : workspaceActiveContextByRoot
```

Return `workspaceActiveContextByRoot: nextWorkspaceActiveContextByRoot` together with `activeId` and `activeProjectId: nextProjectId`.

Guard this reset with `currentProjectId === projectId`. Closing an inactive project must retain `s.activeId` and the current workspace context rather than treating the current project as a newly activated fallback.

- [ ] **Step 6: Normalize hydration contexts and the active target**

At the start of `hydrateSession` in `lifecycle.ts`, derive Overview contexts from the saved workspace keys:

```ts
const defaultWorkspaceActiveContextByRoot = Object.fromEntries(
  Object.keys(workspaceActiveContextByRoot).map((rootId) => [rootId, { kind: 'overview' as const }]),
)
```

Seed the Store with `defaultWorkspaceActiveContextByRoot`. In the final hydration update, retain the original saved map only for legacy active-project identity resolution, then choose the top-level project id as the visible target and ensure an active workspace context is Overview:

```ts
const activeProjectId = restoredActiveProjectId(activeProject, activeRepo, s.order, workspaceActiveContextByRoot)
const activeId =
  activeProjectId ?? activeRepoIdAfterWorkspaceHydration(s.activeId, s.repos, s.order, activeRepo, managedActiveId)
const normalizedContexts =
  activeProjectId && s.workspaceProjects[activeProjectId]
    ? {
        ...s.workspaceActiveContextByRoot,
        [activeProjectId]: { kind: 'overview' as const },
      }
    : s.workspaceActiveContextByRoot
return {
  activeId,
  activeProjectId,
  workspaceActiveContextByRoot: normalizedContexts,
  sessionReady: true,
}
```

- [ ] **Step 7: Run Store tests and verify they pass**

Run the command from Step 3.

Expected: all four Store test files pass; standalone repository restoration remains unchanged.

---

### Task 2: Collapse File Area And Exit Repository Context When Hiding

**Files:**

- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.tsx`
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.tsx`
- Modify: `src/web/components/repo-workspace/PlainWorkspacePane.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspacePane.tsx`
- Modify: `src/web/components/RepoView.tsx`
- Test: `src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`
- Test: `src/web/components/RepoView.test.tsx`
- Test: `src/web/components/repo-workspace/BranchWorkspacePane.test.tsx`

**Interfaces:**

- Consumes: existing `activateWorkspaceOverview(rootId)` and `toggleWorkspaceRepositoryList(rootId)` Store actions.
- Produces: optional `onCollapseFileArea?: () => void`, an idempotent presentation intent passed from the File area state owner to `WorkspaceRepositoryRail`.

- [ ] **Step 1: Add failing Rail behavior tests**

Extend `renderRail` with `onCollapseFileArea?: () => void` and pass it to the component. Update the hide/show test to use:

```ts
const onCollapseFileArea = vi.fn()
renderRail({ currentRepoId: API, onCollapseFileArea })

const hide = container?.querySelector<HTMLButtonElement>(
  'section[aria-label="workspace.repositories"] [aria-label="workspace.repositories.hide"]',
)
act(() => hide?.click())

expect(onCollapseFileArea).toHaveBeenCalledTimes(1)
expect(activateWorkspaceOverview).toHaveBeenCalledWith(ROOT)
expect(container?.querySelector('section[aria-label="workspace.repositories"]')).toBeNull()

onCollapseFileArea.mockClear()
activateWorkspaceOverview.mockClear()
const show = container?.querySelector<HTMLButtonElement>('[aria-label="workspace.repositories.show"]')
act(() => show?.click())

expect(onCollapseFileArea).not.toHaveBeenCalled()
expect(activateWorkspaceOverview).not.toHaveBeenCalled()
```

- [ ] **Step 2: Add failing File area owner tests**

Expose `onCollapseFileArea` from the existing `RepoExplorerPane` mock in `RepoView.test.tsx` with:

```tsx
{
  onCollapseFileArea && (
    <button type="button" data-testid="collapse-file-area" onClick={onCollapseFileArea}>
      collapse files
    </button>
  )
}
```

Add the prop to the mock's parameter type and add this test:

```tsx
test('collapses the File area through an idempotent workspace navigation intent', () => {
  seedRepoWithSelectedWorktree()
  setCompactUi(false)
  renderRepoView()

  expect(container?.querySelector('[data-testid="repo-explorer-pane"]')?.getAttribute('data-file-area-collapsed')).toBe(
    'false',
  )

  act(() => container?.querySelector<HTMLButtonElement>('[data-testid="collapse-file-area"]')?.click())

  expect(container?.querySelector('[data-testid="repo-explorer-pane"]')?.getAttribute('data-file-area-collapsed')).toBe(
    'true',
  )
})
```

In `BranchWorkspacePane.test.tsx`, expose the Rail collapse callback with:

```tsx
{
  onCollapseFileArea ? (
    <button type="button" data-testid="rail-collapse-files" onClick={onCollapseFileArea}>
      collapse files
    </button>
  ) : null
}
```

Add the prop to the mock's parameter type and add this test:

```tsx
test('collapses both the local and parent File areas from workspace navigation', () => {
  const onCollapseFileArea = vi.fn()
  act(() =>
    root.render(
      <BranchWorkspacePane
        rootId="/workspace"
        workspace={workspace()}
        layout="left-right"
        onCollapseFileArea={onCollapseFileArea}
      />,
    ),
  )

  act(() => container.querySelector<HTMLButtonElement>('[data-testid="rail-files"]')?.click())
  expect(container.querySelector('[data-testid="split-pane"]')?.getAttribute('data-after-collapsed')).toBe('false')

  act(() => container.querySelector<HTMLButtonElement>('[data-testid="rail-collapse-files"]')?.click())

  expect(container.querySelector('[data-testid="split-pane"]')?.getAttribute('data-after-collapsed')).toBe('true')
  expect(onCollapseFileArea).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 3: Run component tests and verify they fail**

Run:

```bash
bun run test src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx src/web/components/RepoView.test.tsx src/web/components/repo-workspace/BranchWorkspacePane.test.tsx
```

Expected: failures report the missing `onCollapseFileArea` prop/intent and unchanged File area collapse state.

- [ ] **Step 4: Implement the atomic hide action in Rail**

Add the prop to `WorkspaceRepositoryRail` and replace the toggle button callback with:

```ts
const handleRepositoryListToggle = useCallback(() => {
  if (repositoryListVisible) {
    onCollapseFileArea?.()
    activateWorkspaceOverview(workspaceRootId)
  }
  toggleRepositoryList(workspaceRootId)
}, [activateWorkspaceOverview, onCollapseFileArea, repositoryListVisible, toggleRepositoryList, workspaceRootId])
```

Use `onClick={handleRepositoryListToggle}`. Showing the list therefore remains presentation-only.

- [ ] **Step 5: Thread the idempotent collapse intent from RepoView**

In `RepoView`, create:

```ts
const collapseFileArea = useCallback(() => setFileAreaCollapsed(true), [])
```

Pass it as `onCollapseFileArea={collapseFileArea}` to each `RepoExplorerPane` that can render workspace navigation and to `ActiveBranchWorkspaceView`. Add the prop to `ActiveBranchWorkspaceView` and forward it to `BranchWorkspacePane`.

Add `onCollapseFileArea?: () => void` to `RepoExplorerPaneProps` and `PlainWorkspacePaneProps`, then forward it to every `WorkspaceRepositoryRail` instance in those components.

- [ ] **Step 6: Compose child and parent collapse in BranchWorkspacePane**

Add `onCollapseFileArea?: () => void` to `BranchWorkspacePaneProps` and create:

```ts
const collapseFileArea = useCallback(() => {
  setFileAreaCollapsed(true)
  onCollapseFileArea?.()
}, [onCollapseFileArea])
```

Pass `onCollapseFileArea={collapseFileArea}` to both desktop and compact `WorkspaceRepositoryRail` instances. Do not replace existing double-click toggle callbacks; those remain intentional toggles.

- [ ] **Step 7: Run component tests and verify they pass**

Run the command from Step 3.

Expected: all three component test files pass; hide is idempotent and show does not reopen files.

---

### Task 3: Document The Interaction And Run Repository Gates

**Files:**

- Modify: `docs/ui-conventions.md`
- Verify: all changed source and test files

**Interfaces:**

- Consumes: the implemented Overview default and hide action.
- Produces: documented UI invariant and repository-wide verification evidence.

- [ ] **Step 1: Document the workspace navigation invariant**

Add this bullet under `## Branch workspace scope navigation` in `docs/ui-conventions.md`:

```md
- Activating a top-level multi-repository workspace starts at its workspace overview rather than restoring a repository or branch-workspace member. Hiding the workspace repository list also returns to that overview and collapses the desktop file area; showing the list does not reopen files or restore the prior member context.
```

- [ ] **Step 2: Run formatting and diff validation**

Run:

```bash
bunx prettier --write src/web/stores/repos/selection.ts src/web/stores/repos/workspace-projects.ts src/web/stores/repos/lifecycle.ts src/web/stores/repos/lifecycle-write-paths.ts src/web/stores/repos/selection.test.ts src/web/stores/repos/workspace-projects.test.ts src/web/stores/repos/lifecycle.test.ts src/web/stores/repos/lifecycle-hydrate.test.ts src/web/components/repo-workspace/WorkspaceRepositoryRail.tsx src/web/components/repo-workspace/RepoExplorerPane.tsx src/web/components/repo-workspace/PlainWorkspacePane.tsx src/web/components/repo-workspace/BranchWorkspacePane.tsx src/web/components/RepoView.tsx src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx src/web/components/RepoView.test.tsx src/web/components/repo-workspace/BranchWorkspacePane.test.tsx docs/ui-conventions.md docs/superpowers/specs/2026-07-31-workspace-overview-default-and-hide-reset-design.md docs/superpowers/plans/2026-07-31-workspace-overview-default-and-hide-reset.md
git diff --check
```

Expected: Prettier completes without errors and `git diff --check` prints no diagnostics.

- [ ] **Step 3: Run type and architecture gates**

Run:

```bash
bun run typecheck
bun run check:architecture
```

Expected: both commands exit with status 0.

- [ ] **Step 4: Run the full test suite**

Run:

```bash
bun run test
```

Expected: Vitest exits with status 0 and reports no failed test files.

- [ ] **Step 5: Review the final diff without committing**

Run:

```bash
git status --short
git diff --stat
git diff -- src/web/stores/repos/selection.ts src/web/stores/repos/workspace-projects.ts src/web/stores/repos/lifecycle.ts src/web/stores/repos/lifecycle-write-paths.ts src/web/components/repo-workspace/WorkspaceRepositoryRail.tsx src/web/components/repo-workspace/RepoExplorerPane.tsx src/web/components/repo-workspace/PlainWorkspacePane.tsx src/web/components/repo-workspace/BranchWorkspacePane.tsx src/web/components/RepoView.tsx docs/ui-conventions.md
```

Expected: only the approved behavior, its tests, and the two planning documents are changed; no generated files, package changes, branch changes, or commits exist.
