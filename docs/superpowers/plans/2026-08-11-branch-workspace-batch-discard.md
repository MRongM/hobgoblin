# Branch Workspace Batch Discard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reviewed, sequential batch action that discards every uncommitted change in all dirty member worktrees of one ready branch workspace.

**Architecture:** Extend the existing branch-workspace Git action contract rather than adding a new endpoint. The server owns exact path selection, full-content plan fingerprints, sequential execution, cancellation, failure aggregation, and invalidation; the renderer only requests a plan and renders the existing inline action surface.

**Tech Stack:** TypeScript 6 in Node.js strip-only mode, React 19, Hono, Vitest, Bun.

## Global Constraints

- Use repo-alias imports with explicit `.ts`/`.tsx` extensions.
- Do not use enums, runtime namespaces, parameter properties, or import aliases.
- Use Chinese “子工作区/成员工作树” and English “branch workspace/member worktree”.
- Preserve the existing selected-change `restore --staged --worktree --source=HEAD` plus `clean -fd` semantics.
- Do not use `reset --hard`, add dependencies, add endpoints, or add re-export shims.
- Do not create commits or branches; project instructions require explicit user authorization.

---

### Task 1: Define and plan `batch-discard`

**Files:**

- Modify: `src/shared/branch-workspace-git-actions.ts`
- Modify: `src/shared/branch-workspace-git-actions.test.ts`
- Modify: `src/server/modules/branch-workspace-git-action-plan.ts`
- Modify: `src/server/modules/branch-workspace-git-action-plan.test.ts`

**Interfaces:**

- Produces `BranchWorkspaceGitActionKind` member `'batch-discard'`.
- Produces `BranchWorkspaceBatchDiscardMemberPlan` with `repositoryName`, `repoId`, `targetBranch`, `targetWorktreePath`, `paths`, `changeCount`, and `fingerprint`.
- Produces execute input `{ kind: 'batch-discard'; planToken: string }`.

- [ ] **Step 1: Write failing shared-contract tests**

Add expectations that plan requests normalize `{ kind: 'batch-discard', branchWorkspaceId: ' branch-1 ' }`, execute inputs normalize only `{ kind: 'batch-discard', planToken: ' sha256:plan ' }`, and invalid empty tokens remain rejected.

- [ ] **Step 2: Run the shared-contract test and verify RED**

Run: `bun run test -- src/shared/branch-workspace-git-actions.test.ts`

Expected: FAIL because `batch-discard` is not a valid action kind.

- [ ] **Step 3: Add the minimal shared types and normalization branches**

Extend the discriminated unions without a generic catch-all. The execute branch must return only `kind` and `planToken`; it must not accept a client-provided path list.

- [ ] **Step 4: Run the shared-contract test and verify GREEN**

Run: `bun run test -- src/shared/branch-workspace-git-actions.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing plan tests**

Build a two-member manifest where one member contains tracked and untracked status entries and the other is clean. Assert that the plan preserves manifest order, emits the exact sorted paths, reports counts `2` and `0`, and calls `getPatch` for both members. Change only the returned patch while preserving status and assert `validateBranchWorkspaceGitActionPlan` returns `workspace.branch-workspace.git-action.repository-changed`.

- [ ] **Step 6: Run the plan test and verify RED**

Run: `bun run test -- src/server/modules/branch-workspace-git-action-plan.test.ts`

Expected: FAIL because no batch-discard plan builder exists.

- [ ] **Step 7: Implement `buildBatchDiscardPlan`**

For each manifest member, call `readMemberFacts`, normalize its status entries, call `getPatch`, derive `paths` from the normalized entries, and fingerprint `{ head, status: entries, patch: patch.message }`. Dispatch to this builder before merge/sync planning.

- [ ] **Step 8: Run plan and shared tests and verify GREEN**

Run: `bun run test -- src/shared/branch-workspace-git-actions.test.ts src/server/modules/branch-workspace-git-action-plan.test.ts`

Expected: PASS.

### Task 2: Execute exact-path discards through the server batch writer

**Files:**

- Modify: `src/server/modules/repo-write-paths.ts`
- Modify: `src/server/modules/repo.test.ts`
- Modify: `src/server/modules/branch-workspace-git-action-write-paths.ts`
- Modify: `src/server/modules/branch-workspace-git-action-write-paths.test.ts`
- Modify: `src/shared/server-invalidation.ts`
- Modify: `src/shared/server-invalidation.test.ts`

**Interfaces:**

- Extends `discardRepositoryChanges(..., options?: RepoMutationInvalidationOptions)` so batch orchestration can suppress per-member invalidation.
- Adds batch execution step `'discard'`.

- [ ] **Step 1: Write a failing repo-write invalidation test**

Call `discardRepositoryChanges('/tmp/repo', '/tmp/worktree', ['src/app.ts'], undefined, undefined, { publishInvalidation: false })`; assert the existing discard backend receives the exact path and no invalidation publishes.

- [ ] **Step 2: Run the repo module test and verify RED**

Run: `bun run test -- src/server/modules/repo.test.ts`

Expected: FAIL because discard does not accept or honor the options argument.

- [ ] **Step 3: Thread the existing invalidation option through discard**

Add the optional sixth argument and pass it to `publishSnapshotInvalidationAfterGitAttempt`. Do not alter the public route call shape.

- [ ] **Step 4: Run the repo module test and verify GREEN**

Run: `bun run test -- src/server/modules/repo.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing batch-writer tests**

Cover these behaviors with dependency-injected operations: dirty members execute in manifest order with exact plan paths; clean members become satisfied without a call; one failed member records step `discard` and later members still run; touched repositories publish one invalidation each after the batch; an aborted signal stops before the next member.

- [ ] **Step 6: Run the batch-writer test and verify RED**

Run: `bun run test -- src/server/modules/branch-workspace-git-action-write-paths.test.ts`

Expected: FAIL because the writer has no discard dependency or execution branch.

- [ ] **Step 7: Implement sequential batch discard**

Inject `discardRepositoryChanges`, add `executeBatchDiscard`, mark clean members satisfied, add dirty members to `touchedRepoIds`, call discard with deferred invalidation, record failures with exact worktree paths, and reuse the existing completion/failure result builders.

- [ ] **Step 8: Extend realtime validation and tests**

Allow action kind `batch-discard` and step `discard` in `isBranchWorkspaceActiveOperation`; add one accepted event test and preserve rejection of unknown values.

- [ ] **Step 9: Run server and realtime tests and verify GREEN**

Run: `bun run test -- src/server/modules/branch-workspace-git-action-write-paths.test.ts src/shared/server-invalidation.test.ts src/server/modules/repo.test.ts`

Expected: PASS.

### Task 3: Add the More-menu action and inline confirmation panel

**Files:**

- Modify: `src/web/components/repo-workspace/BranchWorkspaceList.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceList.test.tsx`
- Modify: `src/web/hooks/useBranchWorkspaceGitActions.ts`
- Modify: `src/web/hooks/useBranchWorkspaceGitActions.test.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.test.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/shared/i18n/dictionaries.test.ts`

**Interfaces:**

- Adds hook method `executeBatchDiscard(): Promise<BranchWorkspaceGitActionResult | null>`.
- Adds panel prop `onBatchDiscard` with the same return type.

- [ ] **Step 1: Write failing menu and hook tests**

Assert the ready-item More menu contains a destructive `workspace.branch-workspace.git-action.batch-discard` immediately after batch commit and dispatches `onGitAction(item, 'batch-discard')`. Assert the hook sends `{ kind: 'batch-discard', planToken }`.

- [ ] **Step 2: Run the menu and hook tests and verify RED**

Run: `bun run test -- src/web/components/repo-workspace/BranchWorkspaceList.test.tsx src/web/hooks/useBranchWorkspaceGitActions.test.tsx`

Expected: FAIL because the action and hook method do not exist.

- [ ] **Step 3: Implement the menu and hook**

Reuse `RotateCcw`; mark the menu action destructive. Add execute/retry callbacks guarded by `plan.kind === 'batch-discard'`.

- [ ] **Step 4: Run the menu and hook tests and verify GREEN**

Run: `bun run test -- src/web/components/repo-workspace/BranchWorkspaceList.test.tsx src/web/hooks/useBranchWorkspaceGitActions.test.tsx`

Expected: PASS.

- [ ] **Step 5: Write failing inline-panel tests**

Render a batch-discard plan with one dirty and one clean member. Assert both rows render, counts use existing `change-count`/`clean-skipped` copy, the action button is destructive, and clicking it calls `onBatchDiscard`. Add a clean-only plan case where the action button is disabled. Add a failed result case that retains the panel for retry and shows step `discard` in the shared failure summary.

- [ ] **Step 6: Run the panel test and verify RED**

Run: `bun run test -- src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.test.tsx`

Expected: FAIL because the panel renders no content or action for batch-discard.

- [ ] **Step 7: Implement `BatchDiscardContent` and wire the rail**

Render the existing compact member-row visual structure with repository, target branch, change state, active step, and result phase. Add a destructive button with the same action label, disable it when pending or no member has paths, and pass `branchGitActions.executeBatchDiscard` from `WorkspaceRepositoryRail`.

- [ ] **Step 8: Add four-locale copy and dictionary assertions**

Add action label, irreversible description, active `discard` step, and failure-step label to every locale. The Chinese action is `批量丢弃改动`; its description explicitly mentions 已暂存、未暂存、未跟踪、成员工作树 and Git 不可恢复.

- [ ] **Step 9: Run renderer and dictionary tests and verify GREEN**

Run: `bun run test -- src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.test.tsx src/web/components/repo-workspace/BranchWorkspaceList.test.tsx src/web/hooks/useBranchWorkspaceGitActions.test.tsx src/shared/i18n/dictionaries.test.ts`

Expected: PASS.

### Task 4: Verify the complete feature

**Files:**

- Review: `CONTEXT.md`
- Review: `docs/superpowers/specs/2026-08-11-branch-workspace-batch-discard-design.md`

- [ ] **Step 1: Run all focused feature tests**

Run: `bun run test -- src/shared/branch-workspace-git-actions.test.ts src/server/modules/branch-workspace-git-action-plan.test.ts src/server/modules/branch-workspace-git-action-write-paths.test.ts src/shared/server-invalidation.test.ts src/server/modules/repo.test.ts src/web/components/repo-workspace/BranchWorkspaceList.test.tsx src/web/hooks/useBranchWorkspaceGitActions.test.tsx src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.test.tsx src/shared/i18n/dictionaries.test.ts`

Expected: PASS.

- [ ] **Step 2: Run project verification**

Run: `bun run typecheck`

Run: `bun run check:architecture`

Run: `bun run test`

Expected: all commands exit 0; only pre-existing baseline environment warnings may remain.

- [ ] **Step 3: Review the final diff**

Run: `git diff --check`

Run: `git status --short`

Confirm that no package, lockfile, unrelated source, branch, or commit changes were introduced.
