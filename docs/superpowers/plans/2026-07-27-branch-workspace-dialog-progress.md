# Branch Workspace Dialog Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. This plan is explicitly selected for inline execution; do not dispatch subagents.

**Goal:** Show truthful step-by-step progress and a completed-step count inside the existing create and remove branch-workspace dialogs.

**Architecture:** Reuse the lifecycle manifest's persisted member and auxiliary progress plus the existing workspace invalidation/refetch path. Let lifecycle execution invalidations reach their originating renderer, pass the query's live operation snapshot separately from stable dialog input, and project plan steps to UI states in a pure renderer module.

**Tech Stack:** TypeScript 6 strip-only mode, React 19, TanStack Query, Vitest, Tailwind CSS 4, Lucide React.

## Global Constraints

- Progress states are `pending`, `active`, `complete`, and `failed`; the UI copy is “等待 / 进行中 / 完成 / 失败”.
- The summary is “已完成 X/Y”; X counts only complete plan steps and Y is `plan.steps.length`.
- Do not present percentages, remaining time, or byte-level progress.
- Apply the progress UI only to branch-workspace `create` and `remove` modes.
- Keep existing plan, approval, cancellation, retry, success-close, and failure-recovery behavior.
- Reuse existing theme tokens, Lucide icons, components, and i18n dictionaries.
- Keep Web and Electron on the shared renderer/server path.
- Do not add dependencies or unsupported TypeScript runtime syntax.
- Do not create Git commits because the user did not request them.

---

### Task 1: Project durable lifecycle state into plan-step progress

**Files:**

- Create: `src/web/components/repo-workspace/branch-workspace-operation-progress.ts`
- Create: `src/web/components/repo-workspace/branch-workspace-operation-progress.test.ts`

**Interfaces:**

- Produces: `BranchWorkspaceStepProgressStatus = 'pending' | 'active' | 'complete' | 'failed'`
- Produces: `projectBranchWorkspaceOperationProgress(plan, snapshot, options)` returning ordered step states, `completedCount`, and `totalCount`
- Consumes: existing `BranchWorkspacePlan`, `BranchWorkspacePlanStep`, and `BranchWorkspaceSnapshot`

- [x] **Step 1: Write failing projection tests**

Cover creation without a snapshot, partial repository creation, completed auxiliary materialization, partial removal, cleanup failure, sequential inference for unobservable removal steps, and final fallback failure.

- [x] **Step 2: Run focused tests and verify RED**

Run: `bun run test src/web/components/repo-workspace/branch-workspace-operation-progress.test.ts`

Expected: FAIL because the projection module does not exist.

- [x] **Step 3: Implement the minimal pure projection**

Implement a feature-local pure function that maps durable fields to step states, promotes steps before the latest settled step to complete, marks the first unresolved step active while executing, and marks it failed after a final unsuccessful result.

- [x] **Step 4: Run focused tests and verify GREEN**

Run: `bun run test src/web/components/repo-workspace/branch-workspace-operation-progress.test.ts`

Expected: PASS.

---

### Task 2: Deliver the live operation snapshot to the dialog

**Files:**

- Modify: `src/web/hooks/useBranchWorkspaceActions.test.tsx`
- Modify: `src/web/hooks/useBranchWorkspaceActions.ts`
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.tsx`

**Interfaces:**

- Changes: lifecycle `executeBranchWorkspace` calls omit `sourceToken`
- Produces: `BranchWorkspaceDialog.progressWorkspace: BranchWorkspaceSnapshot | null`
- Preserves: successful snapshot cache writes and final invalidation fallback

- [x] **Step 1: Write failing Hook and Rail tests**

Assert lifecycle execution omits `sourceToken`, and assert the Rail passes the latest query item matching `plan.branchWorkspaceId` through `progressWorkspace` without replacing the dialog's stable `workspace` input.

- [x] **Step 2: Run focused tests and verify RED**

Run: `bun run test src/web/hooks/useBranchWorkspaceActions.test.tsx src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`

Expected: FAIL because execution currently uses a self-suppressed source token and the dialog has no progress snapshot prop.

- [x] **Step 3: Implement the scoped live path**

Call `executeBranchWorkspace` directly from the lifecycle Hook, leaving other mutation suppression paths unchanged. Resolve the operation snapshot from `branchItems` by the current plan ID and pass it separately into the dialog.

- [x] **Step 4: Run focused tests and verify GREEN**

Run: `bun run test src/web/hooks/useBranchWorkspaceActions.test.tsx src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`

Expected: PASS.

---

### Task 3: Render accessible inline progress in create and remove dialogs

**Files:**

- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/shared/i18n/dictionaries.test.ts`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceDialog.tsx`

**Interfaces:**

- Consumes: `projectBranchWorkspaceOperationProgress`
- Adds i18n keys for create/remove activity, summary, and four step states
- Preserves: existing branch-cleanup grouping, plan preview, approvals, retry, and cancellation

- [x] **Step 1: Write failing dialog and dictionary tests**

Assert create and remove execution render `role="status"`, translated activity copy, completed count, visible per-step states, and an executing confirmation spinner. Assert preview-only and non-target modes do not show progress.

- [x] **Step 2: Run focused tests and verify RED**

Run: `bun run test src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx src/shared/i18n/dictionaries.test.ts`

Expected: FAIL because the progress UI and translation keys do not exist.

- [x] **Step 3: Implement the progress presentation**

Render a compact progress header above the plan list, add a status indicator to each ordinary and grouped cleanup step, and show a spinner in the disabled confirmation button while executing. Reuse existing semantic colors and `aria-live="polite"`; do not add global CSS.

- [x] **Step 4: Run focused tests and verify GREEN**

Run: `bun run test src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx src/shared/i18n/dictionaries.test.ts`

Expected: PASS.

---

### Task 4: Regression and architecture verification

**Files:**

- Verify only

- [x] **Step 1: Run focused lifecycle UI regression tests**

Run: `bun run test src/web/components/repo-workspace/branch-workspace-operation-progress.test.ts src/web/hooks/useBranchWorkspaceActions.test.tsx src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx src/shared/i18n/dictionaries.test.ts`

Expected: PASS.

- [x] **Step 2: Run full repository verification**

Run:

```sh
bun run typecheck
bun run test
bun run check:architecture
```

Expected: all commands exit successfully.

- [x] **Step 3: Inspect the final diff and requirements**

Confirm there are no unrelated edits, no dependency changes, no polling or progress protocol, no global invalidation suppression change, and no progress UI in extend/reduce/repair modes.
