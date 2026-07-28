# Branch Workspace Batch Merge-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. This plan must be executed inline; do not dispatch subagents.

**Goal:** Add explicit branch-workspace batch merge-in while retaining and renaming the existing batch merge-out behavior.

**Architecture:** Use direction-specific shared contracts and plans: merge-in selects a local source per member and writes only to the member worktree, while merge-out retains explicit destinations and temporary-worktree ownership. Reuse the existing server-owned sequential batch execution, retry identity, invalidation, dialog shell, and progress projection without introducing persistent renderer state.

**Tech Stack:** TypeScript 6 strip-only mode, React 19, Radix/shadcn UI, TanStack Query, Hono, Vitest, Bun.

## Global Constraints

- Do not use enums, runtime namespaces, parameter properties, or import aliases.
- Use repo-alias imports with explicit `.ts`/`.tsx` extensions.
- Keep `src/main/**`, `src/web/**`, `src/server/**`, and `src/shared/**` architecture boundaries green.
- Do not infer merge-in sources or merge-out destinations from base branch, creation provenance, default branch, or upstream.
- Preserve manifest order, execute sequentially, stop at first failure, and never roll back completed Git or remote writes.
- Merge-in writes only to the member target worktree and leaves conflicts there.
- Merge-out alone may own and force-clean `.hobgoblin-batch-merge-` temporary worktrees.
- Keep dialog choices local and ephemeral; keep plans and activity server-owned.
- Add no dependencies, branches, commits, or subagents while executing this plan.

---

### Task 1: Split the shared merge protocol by direction

**Files:**

- Modify: `src/shared/branch-workspace-git-actions.test.ts`
- Modify: `src/shared/branch-workspace-git-actions.ts`

**Interfaces:**

- Produce `BranchWorkspaceGitActionKind` values `batch-merge-in` and `batch-merge-out`.
- Produce `BranchWorkspaceBatchMergeInSourceInput { repositoryName: string; sourceBranch: string }`.
- Rename the current target input to `BranchWorkspaceBatchMergeOutTargetInput`.
- Produce direction-specific plan/member types while retaining shared result and step types.

- [x] **Step 1: Write failing normalization tests**

Add cases that accept:

```ts
{ kind: 'batch-merge-in', planToken: 'sha256:plan', mode: 'merge', sources: [
  { repositoryName: 'api', sourceBranch: 'main' },
] }
{ kind: 'batch-merge-out', planToken: 'sha256:plan', mode: 'pull-merge-push', targets: [
  { repositoryName: 'api', destinationBranch: 'release' },
] }
```

Reject empty mappings, duplicate repositories, control characters, `sources` on merge-out, and `targets` on merge-in.

- [x] **Step 2: Verify RED**

Run: `bun run test src/shared/branch-workspace-git-actions.test.ts`  
Expected: FAIL because `batch-merge-in` and `batch-merge-out` are not recognized.

- [x] **Step 3: Implement direction-specific discriminated unions and normalizers**

Replace the ambiguous `batch-merge` execute member with:

```ts
| { kind: 'batch-merge-in'; planToken: string; mode: BranchWorkspaceMergeMode; sources: BranchWorkspaceBatchMergeInSourceInput[] }
| { kind: 'batch-merge-out'; planToken: string; mode: BranchWorkspaceMergeMode; targets: BranchWorkspaceBatchMergeOutTargetInput[] }
```

Use one private mapping normalizer only if it keeps the public field names explicit.

- [x] **Step 4: Verify GREEN**

Run: `bun run test src/shared/branch-workspace-git-actions.test.ts`  
Expected: PASS.

### Task 2: Build direction-specific server plans

**Files:**

- Modify: `src/server/modules/branch-workspace-git-action-plan.test.ts`
- Modify: `src/server/modules/branch-workspace-git-action-plan.ts`

**Interfaces:**

- Produce `BranchWorkspaceBatchMergeInMemberPlan` with `sourceBranches: Array<{ branch: string; head: string }>` and `pullMergePushReady` for the target.
- Preserve the current merge-out destination projection under `BranchWorkspaceBatchMergeOutMemberPlan`.

- [x] **Step 1: Write failing merge-in planner tests**

Cover a clean member with local branches `feature/a`, `main`, and `release`; assert `feature/a` is excluded, source heads are returned, target upstream controls `pullMergePushReady`, and a dirty target disables the member. Prove a dirty worktree on `main` does not disable `main` as a source ref.

- [x] **Step 2: Verify RED**

Run: `bun run test src/server/modules/branch-workspace-git-action-plan.test.ts`  
Expected: FAIL because no merge-in plan exists.

- [x] **Step 3: Implement the minimal merge-in plan projection**

Dispatch by direction in `buildBranchWorkspaceGitActionPlan`. Keep the current merge-out builder behavior unchanged apart from names. Fingerprint merge-in members with target head/status plus ordered `{ branch, head }` source identities.

- [x] **Step 4: Verify GREEN**

Run: `bun run test src/server/modules/branch-workspace-git-action-plan.test.ts`  
Expected: PASS.

### Task 3: Execute merge-in with target-owned remote steps and retry identity

**Files:**

- Modify: `src/server/modules/branch-workspace-git-action-write-paths.test.ts`
- Modify: `src/server/modules/branch-workspace-git-action-write-paths.ts`

**Interfaces:**

- Consume `{ kind: 'batch-merge-in', mode, sources }` in manifest order.
- Execute `merge(repoId, targetWorktreePath, sourceBranch)` for merge-only.
- Execute `pull(repoId, targetBranch, targetWorktreePath)`, merge, then `push(repoId, targetBranch)` for remote mode.
- Bind direction, mode, ordered mapping, and per-member step progress for retries.

- [x] **Step 1: Write failing merge-in execution tests**

Assert distinct sources execute in manifest order, unselected members are skipped, target branches are pulled/pushed, no worktree create/remove function is called, and the first merge failure stops later members while leaving the member worktree untouched.

- [x] **Step 2: Write failing validation and retry tests**

Assert source deletion/head change and target dirtiness fail before the member merge; changing direction, mode, membership, or source mapping on retry is rejected; completed members and completed remote steps are skipped.

- [x] **Step 3: Verify RED**

Run: `bun run test src/server/modules/branch-workspace-git-action-write-paths.test.ts`  
Expected: FAIL because merge-in execution is absent.

- [x] **Step 4: Implement merge-in selection and execution**

Keep direction-specific private selectors. Extract only small shared helpers for ordered mapping equality, active progress, and result construction; do not force both directions into one branch-role abstraction.

- [x] **Step 5: Verify GREEN**

Run: `bun run test src/server/modules/branch-workspace-git-action-write-paths.test.ts`  
Expected: PASS.

### Task 4: Add independent merge-in and merge-out UI flows

**Files:**

- Modify: `src/web/hooks/useBranchWorkspaceGitActions.ts`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceList.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceList.test.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.test.tsx`
- Rename: `src/web/components/repo-workspace/branch-workspace-batch-merge-progress.ts` to direction-neutral or split progress projections only if the shared function becomes ambiguous.

**Interfaces:**

- Produce hook actions `executeBatchMergeIn(mode, sources)` and `executeBatchMergeOut(mode, targets)`.
- Render separate menu items and separate dialog state keyed by plan kind.
- Render merge-in rows as `sourceBranch → targetBranch`.

- [x] **Step 1: Write failing menu and dialog tests**

Assert two menu entries, independent plan requests, required per-member source selection, disabled remote mode without target upstream, locked choices after start, `source → target` row order, and unchanged merge-out destination behavior.

- [x] **Step 2: Verify RED**

Run: `bun run test src/web/components/repo-workspace/BranchWorkspaceList.test.tsx src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.test.tsx`  
Expected: FAIL because only `batch-merge` exists.

- [x] **Step 3: Implement the two explicit flows**

Reuse the dialog shell and row primitives, but keep `sources` and `destinations` in separate component-local records. Do not add a direction toggle or global store.

- [x] **Step 4: Verify GREEN**

Run the three focused suites from Step 2.  
Expected: PASS without React warnings.

### Task 5: Project direction-correct progress

**Files:**

- Modify or split: `src/web/components/repo-workspace/branch-workspace-batch-merge-progress.ts`
- Modify or split: `src/web/components/repo-workspace/branch-workspace-batch-merge-progress.test.ts`

**Interfaces:**

- Merge-in steps: `merge` or `pull | merge | push`.
- Merge-out steps: existing `prepare`, optional `pull`, `merge`, optional `push`, optional `cleanup`.

- [x] **Step 1: Write failing merge-in projection tests**

Assert selected/unselected members, active and failed steps, completed counts, and the absence of `prepare`/`cleanup` for merge-in.

- [x] **Step 2: Verify RED**

Run: `bun run test src/web/components/repo-workspace/branch-workspace-batch-merge-progress.test.ts`  
Expected: FAIL because progress accepts only merge-out targets.

- [x] **Step 3: Implement direction-specific projection entrypoints**

Share only step-status calculation. Keep public functions direction-explicit so callers cannot pass a source mapping to an out plan.

- [x] **Step 4: Verify GREEN**

Run the focused progress suite.  
Expected: PASS.

### Task 6: Align localized copy and domain documentation

**Files:**

- Modify: `src/shared/i18n/dictionaries.test.ts`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `CONTEXT.md`
- Update: `docs/superpowers/specs/2026-07-28-branch-workspace-batch-merge-in-design.md`

**Interfaces:**

- User-facing English names: `Batch merge in`, `Batch merge out`.
- User-facing Chinese names: `批量合入`, `批量合出`.

- [x] **Step 1: Write failing dictionary assertions**

Assert all locales contain direction-specific titles, descriptions, source labels, source-required errors, target-upstream errors, and merge-in button copy.

- [x] **Step 2: Verify RED**

Run: `bun run test src/shared/i18n/dictionaries.test.ts`  
Expected: FAIL because direction-specific keys are absent.

- [x] **Step 3: Add concise direction-specific copy and finalize glossary**

Preserve raw branch names and repository identifiers. Use “子工作区” and “成员工作树” in Chinese, never “子仓库”.

- [x] **Step 4: Verify GREEN**

Run the focused dictionary suite.  
Expected: PASS.

### Task 7: Full verification and requirements audit

- [x] **Step 1: Run focused feature suites**

Run all changed shared, server, and Renderer test files.  
Expected: PASS.

- [x] **Step 2: Run static and architecture checks**

Run: `bun run typecheck`  
Run: `bun run check:architecture`  
Run: `git diff --check`  
Expected: all exit `0`.

- [x] **Step 3: Run the full suite**

Run: `bun run test`  
Expected: all test files and tests pass.

- [x] **Step 4: Audit the design line by line**

Confirm both menu directions, explicit source mapping, target-owned remote steps, manifest ordering, stop-on-failure, retry binding, visible conflict site, merge-out regression coverage, four locales, and no new persistent or Electron-specific state.

- [x] **Step 5: Update plan and design status**

Check completed steps and change the design status to `已实施` only after fresh verification evidence exists.
