# Branch Workspace Create Completion Close Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the branch-workspace creation dialog when a ready live snapshot proves every planned step completed despite a final remote read failure.

**Architecture:** Keep server execution success semantics unchanged. Add one derived completion guard to `BranchWorkspaceDialog` using its existing execute result, ready progress snapshot, and operation-progress projection, then close through the existing `onOpenChange(false)` boundary.

**Tech Stack:** React 19, TypeScript 6 strip-only mode, Vitest, Bun.

## Global Constraints

- Ignore only `workspace.branch-workspace.remote-operation-failed` and `workspace.branch-workspace.remote-invalid-response` after ready state and full progress are independently observed.
- Preserve all Git, filesystem, approval, stale-plan, cancellation, and repair errors.
- Do not modify server APIs, execution result types, query ownership, or realtime transport.
- Use repo-alias imports with explicit `.ts` / `.tsx` extensions and no unsupported TypeScript runtime syntax.
- Do not create a Git commit or perform any network Git operation.

---

### Task 1: Close completed creation after a final remote read failure

**Files:**

- Modify: `src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceDialog.tsx`
- Modify: `CONTEXT.md`

**Interfaces:**

- Consumes: `BranchWorkspaceExecuteResult`, `BranchWorkspaceSnapshot.state`, and `projectBranchWorkspaceOperationProgress(...)`.
- Produces: an effect that calls the existing `onOpenChange(false)` only when the guarded completion condition is true.

- [x] **Step 1: Write the failing completion regression test**

Render a create dialog with a ready `progressWorkspace`, a two-step fully completed create plan, and this settled result:

```tsx
result={{
  ok: false,
  message: 'workspace.branch-workspace.remote-operation-failed',
  branchWorkspaceId: 'branch-1',
}}
```

Assert that `onOpenChange` is called with `false`.

- [x] **Step 2: Add the non-read-error safety test**

Render the same completed plan with `workspace.branch-workspace.execute-failed` and assert that `onOpenChange` is not called.

- [x] **Step 3: Run the focused suite and verify RED**

Run:

```sh
bun run test src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx
```

Expected: the remote-read completion test fails because the dialog never closes; the safety test passes.

- [x] **Step 4: Implement the minimal completion guard**

After deriving `operationProgress`, add:

```tsx
const creationCompletedDespiteRemoteReadFailure =
  mode === 'create' &&
  !pending &&
  result?.ok === false &&
  (result.message === 'workspace.branch-workspace.remote-operation-failed' ||
    result.message === 'workspace.branch-workspace.remote-invalid-response') &&
  progressWorkspace?.state.kind === 'ready' &&
  operationProgress !== null &&
  operationProgress.totalCount > 0 &&
  operationProgress.completedCount === operationProgress.totalCount

useEffect(() => {
  if (open && creationCompletedDespiteRemoteReadFailure) onOpenChange(false)
}, [creationCompletedDespiteRemoteReadFailure, onOpenChange, open])
```

Do not change `run`, execute results, or progress projection.

- [x] **Step 5: Run the focused suite and verify GREEN**

Run the Step 3 command. Expected: every `BranchWorkspaceDialog` test passes.

- [x] **Step 6: Record the resolved domain boundary**

Extend the existing Branch workspace operation glossary entry with the rule that a foreground creation modal may close after a final remote read error only when an independent live observation proves ready state and every planned step complete.

### Task 2: Complete regression verification

**Files:** No additional production files.

- [x] **Step 1: Run formatting and diff checks**

```sh
bunx prettier --check src/web/components/repo-workspace/BranchWorkspaceDialog.tsx src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx CONTEXT.md docs/superpowers/specs/2026-07-30-branch-workspace-create-completion-close-design.md docs/superpowers/plans/2026-07-30-branch-workspace-create-completion-close.md
git diff --check
```

- [x] **Step 2: Run project quality gates**

```sh
bun run typecheck
bun run check:architecture
bun run test
```

Expected: every command exits successfully. Any unrelated concurrent-worktree failure must be reported exactly and must not be hidden by modifying unrelated code.
