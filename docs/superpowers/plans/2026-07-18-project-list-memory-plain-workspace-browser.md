# Project List Memory and Plain Workspace Browser Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist one global sidebar project-list expansion preference across projects and relaunches, and expose existing terminal browser access for plain workspaces.

**Architecture:** Add `projectListExpanded` to the existing restorable `SessionState` pipeline and repos-store projection. Extend `TerminalStatusActions` to resolve plain-workspace terminal identities through `repoPlainWorkspacePath()` and `NON_GIT_WORKSPACE_TERMINAL_BRANCH`, while keeping Git resolution unchanged.

**Tech Stack:** React 19, Zustand, Hono settings persistence, TypeScript strip-only mode, Vitest.

## Global Constraints

- Do not add dependencies or server routes.
- Use repo-alias imports with explicit `.ts`/`.tsx` extensions.
- Do not use enums, runtime namespaces, parameter properties, or import aliases.
- Keep `projectListExpanded` restorable, not runtime-coherent.
- Keep test fixtures privacy-safe with generic paths and identifiers.
- Do not create Git commits or push changes.
- Verify with focused tests, `bun run typecheck`, `bun run check:architecture`, and `bun run test`.

---

### Task 1: Restorable Session Contract

**Files:**

- Modify: `src/shared/rpc.ts`
- Modify: `src/shared/settings-defaults.ts`
- Modify: `src/server/modules/settings-source.ts`
- Test: `src/server/modules/settings-source.test.ts`

**Interfaces:**

- Produces: required `SessionState.projectListExpanded: boolean`.
- Produces: `DEFAULT_PROJECT_LIST_EXPANDED` with value `false`.
- Preserves valid booleans; missing or invalid values normalize to `false`.

- [x] **Step 1: Write the failing normalization test**

Add a test that saves `projectListExpanded: true`, expects `true`, then saves `'invalid' as never` and expects `false`.

```ts
await expect(mod.setServerSessionState({ ...defaultSessionState(), projectListExpanded: true })).resolves.toMatchObject(
  { projectListExpanded: true },
)

await expect(
  mod.setServerSessionState({
    ...defaultSessionState(),
    projectListExpanded: 'invalid' as never,
  }),
).resolves.toMatchObject({ projectListExpanded: false })
```

- [x] **Step 2: Run the test and verify RED**

Run: `bun run test "src/server/modules/settings-source.test.ts"`

Expected: FAIL because the session contract and normalizer do not own the field.

- [x] **Step 3: Add the field, default, and normalization**

Add `projectListExpanded: boolean` to `SessionState`, export `DEFAULT_PROJECT_LIST_EXPANDED = false`, and return that default from `defaultSessionState()`.

Normalize with:

```ts
projectListExpanded:
  typeof partial.projectListExpanded === 'boolean'
    ? partial.projectListExpanded
    : DEFAULT_PROJECT_LIST_EXPANDED,
```

- [x] **Step 4: Run the focused test and verify GREEN**

Run: `bun run test "src/server/modules/settings-source.test.ts"`

Expected: PASS.

### Task 2: Renderer Restorable State and Project List UI

**Files:**

- Modify: `src/web/settings-queries.ts`
- Modify: `src/web/stores/session-restore.ts`
- Modify: `src/web/stores/repos/types.ts`
- Modify: `src/web/stores/repos/store.ts`
- Modify: `src/web/stores/repos/selection.ts`
- Modify: `src/web/stores/repos/selector-state.ts`
- Modify: `src/web/stores/repos/test-utils.ts`
- Modify: `src/web/restorable-workspace-state.ts`
- Test: `src/web/restorable-workspace-state.test.ts`
- Modify: `src/web/hooks/useAppBootstrap.ts`
- Test: `src/web/hooks/useAppBootstrap.test.tsx`
- Modify: `src/web/hooks/useSessionPersistence.ts`
- Test: `src/web/hooks/useSessionPersistence.test.tsx`
- Modify: `src/web/components/repo-workspace/SidebarProjectHeader.tsx`
- Test: `src/web/components/repo-workspace/SidebarProjectHeader.test.tsx`

**Interfaces:**

- Produces: `RestorableWorkspaceState.projectListExpanded: boolean`.
- Produces: `setProjectListExpanded(expanded: boolean): void` and `toggleProjectListExpanded(): void`.
- Consumes: `SessionState.projectListExpanded` during boot and persistence.

- [x] **Step 1: Write failing restorable mapping tests**

Add `projectListExpanded: true` to both conversion cases in `restorable-workspace-state.test.ts` and expect it in both directions.

- [x] **Step 2: Write failing bootstrap and persistence tests**

Include `projectListExpanded: true` in the boot session and assert:

```ts
expect(useReposStore.getState().projectListExpanded).toBe(true)
```

Seed `projectListExpanded: true` in the persistence test and assert:

```ts
expect(persistSessionStateMock).toHaveBeenCalledWith(expect.objectContaining({ projectListExpanded: true }))
```

- [x] **Step 3: Write the failing global UI-state test**

Expose a mocked `projectListExpanded` and `toggleProjectListExpanded`, expand project A, rerender project B, and assert `aria-expanded="true"`, one list element, and one toggle call.

- [x] **Step 4: Run renderer tests and verify RED**

```sh
bun run test "src/web/restorable-workspace-state.test.ts" "src/web/hooks/useAppBootstrap.test.tsx" "src/web/hooks/useSessionPersistence.test.tsx" "src/web/components/repo-workspace/SidebarProjectHeader.test.tsx"
```

Expected: FAIL because the field/actions do not exist and the header still uses local state.

- [x] **Step 5: Implement the renderer state pipeline**

Add the field to store state/defaults/reset helpers, selectors, and both restorable conversion functions. Add actions:

```ts
setProjectListExpanded(expanded: boolean) {
  set((state) =>
    state.projectListExpanded === expanded ? state : { projectListExpanded: expanded },
  )
},

toggleProjectListExpanded() {
  set((state) => ({ projectListExpanded: !state.projectListExpanded }))
},
```

Restore with `setProjectListExpanded(restoredWorkspaceState.projectListExpanded)` before `hydrateSession()`. Select, serialize, and watch the field in `useSessionPersistence()`.

- [x] **Step 6: Connect the header**

Remove the local expansion `useState` and use:

```ts
const listExpanded = useReposStore((state) => state.projectListExpanded)
const toggleProjectListExpanded = useReposStore((state) => state.toggleProjectListExpanded)
```

The trigger calls `toggleProjectListExpanded`.

- [x] **Step 7: Run renderer tests and verify GREEN**

Run the command from Step 4. Expected: PASS.

### Task 3: Plain Workspace Terminal Browser Access

**Files:**

- Modify: `src/web/components/terminal/TerminalStatusActions.tsx`
- Test: `src/web/components/StatusBar.test.tsx`

**Interfaces:**

- Consumes: `repoPlainWorkspacePath(repo): string | null`.
- Consumes: `NON_GIT_WORKSPACE_TERMINAL_BRANCH`.
- Preserves the existing Git target path.
- Produces browser and LAN QR links for local and remote plain workspaces.

- [x] **Step 1: Write the failing local plain-workspace test**

Seed a plain workspace and selected terminal. Expect the browser URL target to be:

```ts
{
  repoId: REPO_ID,
  worktreePath: REPO_ID,
  branch: NON_GIT_WORKSPACE_TERMINAL_BRANCH,
  terminalId: 'terminal-1',
}
```

Also assert both browser and LAN QR buttons render.

- [x] **Step 2: Write the failing remote plain-workspace test**

Seed a remote plain workspace with `remote.target.remotePath = '/srv/plain'`. Assert the deep link uses `/srv/plain` as `worktreePath` and keeps the remote repo ID as `repoId`.

- [x] **Step 3: Run tests and verify RED**

Run: `bun run test "src/web/components/StatusBar.test.tsx"`

Expected: FAIL because the action currently requires a Git branch worktree.

- [x] **Step 4: Extend target resolution**

Resolve a plain workspace before the existing Git path:

```ts
const repo = state.repos[repoId]
const plainWorkspacePath = repoPlainWorkspacePath(repo)
if (plainWorkspacePath) {
  return {
    branch: NON_GIT_WORKSPACE_TERMINAL_BRANCH,
    worktreePath: plainWorkspacePath,
  }
}
```

- [x] **Step 5: Run tests and verify GREEN**

Run: `bun run test "src/web/components/StatusBar.test.tsx"`

Expected: PASS for existing Git and new local/remote plain-workspace cases.

### Task 4: Full Verification

**Files:** Verify all scoped source, test, context, spec, and plan files.

- [x] **Step 1: Run focused tests together**

```sh
bun run test "src/server/modules/settings-source.test.ts" "src/web/restorable-workspace-state.test.ts" "src/web/hooks/useAppBootstrap.test.tsx" "src/web/hooks/useSessionPersistence.test.tsx" "src/web/components/repo-workspace/SidebarProjectHeader.test.tsx" "src/web/components/StatusBar.test.tsx"
```

Expected: PASS.

- [x] **Step 2: Run type and architecture checks**

Run `bun run typecheck` and `bun run check:architecture`. Expected: both exit 0.

- [x] **Step 3: Run the complete suite**

Run: `bun run test`. Expected: exit 0 with no failed tests.

Observed: 277/279 test files and 2255/2257 tests passed. The two failures are independently reproducible in unchanged baseline files `src/web/terminal.test.ts` and `src/web/components/BranchList.test.tsx`; no out-of-scope fix was attempted.

- [x] **Step 4: Review the final diff**

Run:

```sh
git status --short
git diff --check
git diff --stat
```

Expected: only scoped files are modified, no whitespace errors, and no commit exists from this task.
