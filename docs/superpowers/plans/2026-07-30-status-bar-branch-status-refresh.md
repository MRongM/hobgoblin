# Status Bar Branch and Status Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the ordinary Git project status-bar branch control refresh repository branches/status and, for configured-workspace members, the parent branch-workspace snapshot.

**Architecture:** `StatusBar` remains the single UI caller. It invokes the existing repository `refreshCoreData` read orchestration and conditionally invokes `refreshBranchWorkspaceQuery` with the renderer query client; both reads settle independently and no remote sync or workspace rescan is introduced.

**Tech Stack:** React 19, Zustand, TanStack Query, TypeScript strip-only mode, Vitest/jsdom.

## Global Constraints

- Use repo-alias imports with explicit `.ts`/`.tsx` extensions.
- Do not use enums, runtime namespaces, parameter properties, or TypeScript import aliases.
- Reuse the existing `action.fetch-local-title` copy; do not add a duplicate translation key.
- Do not run `git commit`, `git push`, or branch operations without an explicit user request.
- Verify with `bun run typecheck`, `bun run test`, and `bun run check:architecture`.

---

### Task 1: Specify status-bar refresh behavior

**Files:**

- Modify: `src/web/components/StatusBar.test.tsx`

**Interfaces:**

- Consumes: `ReposStore.refreshCoreData(id, { token })`, `readBranchWorkspaces(rootId)`.
- Produces: executable behavior expectations for the status-bar refresh button.

- [x] **Step 1: Add failing component tests**

Add tests that click `button[aria-label="action.fetch-local-title"]` and assert:

```ts
expect(refreshCoreData).toHaveBeenCalledWith(REPO_ID, { token })
expect(syncAndRefresh).not.toHaveBeenCalled()
expect(readBranchWorkspaces).not.toHaveBeenCalled()
```

For a member repository with `workspaceRootId = '/workspace'`, additionally assert:

```ts
expect(readBranchWorkspaces).toHaveBeenCalledWith('/workspace')
```

Use a deferred `refreshCoreData` promise to verify the button is disabled during the request and ignores a second click.

- [x] **Step 2: Verify RED**

Run:

```sh
bun run test -- src/web/components/StatusBar.test.tsx
```

Expected: FAIL because the branch summary is not a button.

### Task 2: Implement the status-bar refresh control

**Files:**

- Modify: `src/web/components/StatusBar.tsx`

**Interfaces:**

- Consumes: `refreshCoreData`, `refreshBranchWorkspaceQuery`, `mainWindowQueryClient`.
- Produces: one accessible, single-flight status-bar refresh button.

- [x] **Step 1: Implement the minimal interaction**

Replace the decorative branch summary with an `AsyncButton`. At click time capture the current repo and run:

```ts
const refreshes: Promise<unknown>[] = [state.refreshCoreData(current.id, { token: current.instanceToken })]
if (current.workspaceRootId) {
  refreshes.push(refreshBranchWorkspaceQuery(mainWindowQueryClient, current.workspaceRootId))
}
await Promise.allSettled(refreshes)
```

Keep the existing `GitBranch` icon and truncated branch text. Use `action.fetch-local-title` as `aria-label` and tooltip.

- [x] **Step 2: Verify GREEN**

Run:

```sh
bun run test -- src/web/components/StatusBar.test.tsx
```

Expected: PASS.

- [x] **Step 3: Refactor while green**

Keep the refresh callback local to `StatusBar`; do not add a one-caller service or new state abstraction. Re-run the targeted tests after formatting the touched files.

### Task 3: Repository verification

**Files:**

- Verify all modified source, tests, and documentation.

**Interfaces:**

- Consumes: completed Tasks 1–2.
- Produces: evidence that behavior and architecture remain valid.

- [x] **Step 1: Run type and architecture checks**

```sh
bun run typecheck
bun run check:architecture
```

Expected: both commands exit 0.

- [x] **Step 2: Run the full test suite**

```sh
bun run test
```

Expected: all tests pass without new warnings or unhandled rejections.

- [x] **Step 3: Review the diff**

Confirm no fetch, workspace rescan, backend API, unrelated refactor, or Git commit was introduced.
