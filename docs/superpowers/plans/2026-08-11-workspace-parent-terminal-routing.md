# Workspace Parent Terminal Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make configured-workspace project and root-directory clicks reveal the exact root or branch-workspace terminal represented by their aggregate terminal badge.

**Architecture:** Add one pure Renderer resolver for stable parent-scope target selection and one stateless executor for existing navigation/terminal actions. Keep both UI entry points thin, read current Query/terminal projections only at click time, and leave global Store activation and Terminal Provider semantics unchanged.

**Tech Stack:** React 19, TypeScript 6 in Node.js strip-only mode, Zustand, TanStack Query, Vitest.

## Global Constraints

- Preserve the existing dirty worktree; do not revert or overwrite unrelated edits, including the current `WorkspaceRepositoryRail.tsx` batch-discard change.
- Do not add dependencies, server calls, realtime events, persistence fields, re-export shims, or TypeScript features unsupported by Node.js strip-only mode.
- Use repo-alias imports with explicit `.ts`/`.tsx` extensions.
- Limit automatic routing to configured-workspace project-row and Manifest root-row clicks.
- Prefer root terminal, then the last selected viable branch workspace, then the first viable branch workspace in Query order.
- Treat `opening`, `restarting`, and `open` as viable; ignore `error` and `closed`.
- Do not route aggregate parent clicks to repository-member worktree terminals.
- Do not commit, push, reset, or create branches unless the user explicitly requests it.

---

### Task 1: Pure Workspace Parent Terminal Target Resolver

**Files:**

- Create: `src/web/components/repo-workspace/workspace-parent-terminal-navigation.test.ts`
- Create: `src/web/components/repo-workspace/workspace-parent-terminal-navigation.ts`

**Interfaces:**

- Consumes: `rootId`, `rootPath`, `activeBranchWorkspaceId`, ordered `Pick<BranchWorkspaceSnapshot, 'id' | 'path' | 'available'>[]`, and `TerminalSessionReadContextValue['worktreeSnapshot']`.
- Produces: `resolveWorkspaceParentTerminalTarget(input): WorkspaceParentTerminalTarget | null`.
- Produces: `activateWorkspaceParentTerminalTarget(target, actions): boolean`.

- [x] **Step 1: Write the failing root-priority test**

Create a real resolver test with complete `WorktreeTerminalSnapshot` values. Give the root two viable sessions, mark the second selected, and give the first branch workspace another terminal:

```ts
const ROOT = '/workspace'
const BRANCH_ONE_PATH = '/workspace/feature-one'
const BRANCH_TWO_PATH = '/workspace/feature-two'
const branchWorkspaces = [
  { id: 'branch-1', path: BRANCH_ONE_PATH, available: true },
  { id: 'branch-2', path: BRANCH_TWO_PATH, available: true },
]

function session(
  worktreeKey: string,
  index: number,
  selected = false,
  phase: TerminalSessionSummary['phase'] = 'open',
) {
  return {
    key: `${worktreeKey}\0terminal-${index}`,
    worktreeTerminalKey: worktreeKey,
    terminalId: `terminal-${index}`,
    index,
    title: `terminal ${index}`,
    phase,
    selected,
    hasBell: false,
  } satisfies TerminalSessionSummary
}

function snapshot(worktreeKey: string, sessions: TerminalSessionSummary[]): WorktreeTerminalSnapshot {
  return { worktreeTerminalKey: worktreeKey, selectedDescriptor: null, sessions, count: sessions.length }
}

function snapshotReader(snapshots: WorktreeTerminalSnapshot[]) {
  const byKey = new Map(snapshots.map((item) => [item.worktreeTerminalKey, item]))
  return (key: string) => byKey.get(key) ?? snapshot(key, [])
}

const target = resolveWorkspaceParentTerminalTarget({
  rootId: ROOT,
  rootPath: ROOT,
  activeBranchWorkspaceId: 'branch-1',
  branchWorkspaces,
  worktreeSnapshot: snapshotReader([
    snapshot(`${ROOT}\0${ROOT}`, [session(`${ROOT}\0${ROOT}`, 1), session(`${ROOT}\0${ROOT}`, 2, true)]),
    snapshot(`${ROOT}\0${BRANCH_ONE_PATH}`, [session(`${ROOT}\0${BRANCH_ONE_PATH}`, 1, true)]),
  ]),
})

expect(target).toEqual({
  branchWorkspaceId: null,
  worktreeTerminalKey: `${ROOT}\0${ROOT}`,
  terminalKey: `${ROOT}\0${ROOT}\0terminal-2`,
})
```

- [x] **Step 2: Run the resolver test and verify RED**

Run:

```bash
bun run test src/web/components/repo-workspace/workspace-parent-terminal-navigation.test.ts
```

Expected: FAIL because the resolver module does not exist.

- [x] **Step 3: Implement the minimal root target**

Create the focused types and root lookup:

```ts
export interface WorkspaceParentTerminalTarget {
  branchWorkspaceId: string | null
  worktreeTerminalKey: string
  terminalKey: string
}

function viableSession(snapshot: WorktreeTerminalSnapshot): TerminalSessionSummary | null {
  const viable = (session: TerminalSessionSummary) => session.phase !== 'error' && session.phase !== 'closed'
  return (
    snapshot.sessions.find((session) => session.selected && viable(session)) ?? snapshot.sessions.find(viable) ?? null
  )
}
```

Use `worktreeTerminalKey(rootId, rootPath)` and return the selected viable root session before inspecting child workspaces.

- [x] **Step 4: Verify the root test is GREEN**

Run the same focused test command. Expected: PASS.

- [x] **Step 5: Add failing branch-order and phase-filter tests**

Add separate tests proving:

```ts
const firstKey = `${ROOT}\0${BRANCH_ONE_PATH}`
const secondKey = `${ROOT}\0${BRANCH_TWO_PATH}`
const bothOpen = snapshotReader([
  snapshot(firstKey, [session(firstKey, 1, true)]),
  snapshot(secondKey, [session(secondKey, 1, true)]),
])

expect(
  resolveWorkspaceParentTerminalTarget({
    rootId: ROOT,
    rootPath: ROOT,
    activeBranchWorkspaceId: 'branch-2',
    branchWorkspaces,
    worktreeSnapshot: bothOpen,
  })?.branchWorkspaceId,
).toBe('branch-2')

expect(
  resolveWorkspaceParentTerminalTarget({
    rootId: ROOT,
    rootPath: ROOT,
    activeBranchWorkspaceId: null,
    branchWorkspaces: [branchWorkspaces[1]!, branchWorkspaces[0]!],
    worktreeSnapshot: bothOpen,
  })?.branchWorkspaceId,
).toBe('branch-2')

expect(
  resolveWorkspaceParentTerminalTarget({
    rootId: ROOT,
    rootPath: ROOT,
    activeBranchWorkspaceId: null,
    branchWorkspaces,
    worktreeSnapshot: snapshotReader([
      snapshot(firstKey, [session(firstKey, 1, true, 'error'), session(firstKey, 2, false, 'closed')]),
    ]),
  }),
).toBeNull()
```

The ordered fallback fixture must preserve the supplied `branchWorkspaces` order rather than sorting paths.

- [x] **Step 6: Run the resolver test and verify RED**

Expected: the new child-resolution assertions fail because only the root path is implemented.

- [x] **Step 7: Implement child selection and the stateless executor**

Resolve the active child first when it is present and available, followed by the remaining available children in their original order. Add the executor:

```ts
export interface WorkspaceParentTerminalActions {
  activateOverview: () => void
  activateBranchWorkspace: (branchWorkspaceId: string) => void
  selectTerminal: (worktreeTerminalKey: string, terminalKey: string) => void
  focusTerminal: (terminalKey: string) => void
  revealTerminal: () => void
}

export function activateWorkspaceParentTerminalTarget(
  target: WorkspaceParentTerminalTarget | null,
  actions: WorkspaceParentTerminalActions,
): boolean {
  actions.activateOverview()
  if (!target) return false
  if (target.branchWorkspaceId) actions.activateBranchWorkspace(target.branchWorkspaceId)
  actions.selectTerminal(target.worktreeTerminalKey, target.terminalKey)
  actions.focusTerminal(target.terminalKey)
  actions.revealTerminal()
  return true
}
```

- [x] **Step 8: Verify all resolver tests are GREEN**

Run the focused resolver test. Expected: all tests pass with no warnings from the new module.

### Task 2: Workspace Manifest Root Click Wiring

**Files:**

- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.tsx`

**Interfaces:**

- Consumes: Task 1 resolver and executor.
- Produces: `handleOverviewActivate(): void` as the Manifest row click callback.

- [x] **Step 1: Write the failing Manifest navigation test**

Extend the existing `renderRail` fixture to provide a complete `TerminalSessionContextValue`. Seed no root session and one selected `open` session under `/workspace/goblin-feature-auth`, click `overviewButton()`, then assert:

```ts
expect(activateWorkspaceOverview).toHaveBeenCalledWith(ROOT)
expect(activateBranchWorkspace).toHaveBeenCalledWith(ROOT, 'branch-1')
expect(terminalCommands.selectTerminal).toHaveBeenCalledWith(branchKey, terminalKey)
expect(terminalCommands.focusTerminal).toHaveBeenCalledWith(terminalKey)
expect(useReposStore.getState().detailCollapsed).toBe(false)
```

Keep the existing no-terminal Overview assertion unchanged.

- [x] **Step 2: Run the rail test and verify RED**

Run:

```bash
bun run test src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx
```

Expected: FAIL because Manifest still calls only `activateWorkspaceOverview`.

- [x] **Step 3: Wire the shared target resolver**

Read `TerminalSessionReadContext` and `TerminalSessionContext` with `useContext`, capture `setDetailCollapsed`, and replace the inline Manifest callback with `handleOverviewActivate`. Resolve only when both contexts exist, then execute with:

```ts
activateWorkspaceParentTerminalTarget(target, {
  activateOverview: () => activateWorkspaceOverview(workspaceRootId),
  activateBranchWorkspace: (id) => activateBranchWorkspace(workspaceRootId, id),
  selectTerminal: terminalCommands.selectTerminal,
  focusTerminal: terminalCommands.focusTerminal,
  revealTerminal: () => setDetailCollapsed(false),
})
```

- [x] **Step 4: Verify the rail test is GREEN**

Run the focused rail test. Expected: existing Overview aggregation, hidden-list, double-click, batch-discard, and new terminal-routing cases all pass.

### Task 3: Sidebar Project Click Wiring and Convention Documentation

**Files:**

- Modify: `src/web/components/repo-workspace/SidebarProjectList.test.tsx`
- Modify: `src/web/components/repo-workspace/SidebarProjectList.tsx`
- Modify: `docs/ui-conventions.md`

**Interfaces:**

- Consumes: Task 1 resolver/executor and `useBranchWorkspaceQuery(workspace?.configured ? project.id : '')`.
- Produces: terminal-aware project-row click behavior without changing quick actions or generic navigation APIs.

- [x] **Step 1: Write the failing configured-workspace project test**

Mock only the branch-workspace Query boundary with a complete successful read result. Seed a configured plain workspace, its previous branch-workspace context, and one selected open child-root session. Click its project main row and assert that the original `onActivate(project.id)` still fires before branch activation, and that the exact session is selected and focused.

- [x] **Step 2: Run the sidebar test and verify RED**

Run:

```bash
bun run test src/web/components/repo-workspace/SidebarProjectList.test.tsx
```

Expected: FAIL because project clicks do not inspect child terminal state or activate a branch workspace.

- [x] **Step 3: Wire configured-workspace project clicks**

Always call `useBranchWorkspaceQuery` with the configured root ID or an empty disabled ID. On click, resolve only for configured workspaces with both terminal contexts, execute `onActivate(project.id)` as the Overview action, then optionally activate the resolved branch workspace. Keep non-workspace rows and no-target cases on the original path.

- [x] **Step 4: Verify sidebar and combined component tests are GREEN**

Run:

```bash
bun run test src/web/components/repo-workspace/SidebarProjectList.test.tsx src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx src/web/components/repo-workspace/workspace-parent-terminal-navigation.test.ts
```

Expected: all focused tests pass.

- [x] **Step 5: Record the click exception in UI conventions**

Amend `docs/ui-conventions.md` so configured-workspace parent rows default to Overview only when no viable aggregated root/branch-workspace terminal target exists, and explicitly preserve root-first plus prior-child/list-order priority.

- [x] **Step 6: Run formatting and complete verification**

Run Prettier on only the created or modified feature files, then:

```bash
bun run typecheck
bun run test
bun run check:architecture
git diff --check
```

Expected: typecheck, all Vitest files, architecture guard, and whitespace validation exit successfully. Existing third-party sourcemap/jsdom capability warnings from the clean baseline may remain; no new failures or warnings should be introduced.
