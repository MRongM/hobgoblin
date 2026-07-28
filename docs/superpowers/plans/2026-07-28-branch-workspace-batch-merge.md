# Branch Workspace User-Selected Batch Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This task must be executed inline; do not dispatch subagents.

**Goal:** Merge each selected branch-workspace member into a user-selected local branch, independently of member base or creation-source metadata.

**Architecture:** The plan exposes repository-local destination candidates while the execute contract carries an explicit member-to-destination mapping. The existing server write path validates that mapping, executes it in manifest order, and uses a narrowly owned temporary worktree only when the selected branch has no worktree. Renderer state remains ephemeral and progress remains a pure projection of server activity.

**Tech Stack:** TypeScript 6 strip-only mode, React 19, Radix/shadcn UI, TanStack Query, Hono, Vitest, Bun.

## Global Constraints

- Do not use enums, runtime namespaces, parameter properties, or import aliases.
- Use repo-alias imports with explicit `.ts`/`.tsx` extensions.
- Never infer a batch-merge destination from `baseBranch`, creation provenance, default branch, or upstream.
- Accept only existing local destination branches and reject the member target branch itself.
- Preserve manifest order, execute sequentially, stop at first failure, and do not roll back completed Git or remote writes.
- Never remove an ordinary user worktree; force cleanup is limited to a repository-scoped `.hobgoblin-batch-merge-` temporary path.
- Keep dialog choices local and ephemeral; keep plans and activity server-owned.
- Do not create Git branches, commits, or subagents while implementing this plan.

---

### Task 1: Replace merge-back protocol with explicit batch targets

**Files:**

- Modify: `src/shared/branch-workspace-git-actions.test.ts`
- Modify: `src/shared/branch-workspace-git-actions.ts`

**Interfaces:**

- Produce `BranchWorkspaceBatchMergeTargetInput { repositoryName: string; destinationBranch: string }`.
- Produce batch-merge member plans with `ready`, optional `message`, and `destinationBranches`.
- Change the action kind from `merge-back` to `batch-merge`.

- [x] Add failing tests accepting a non-empty target mapping and rejecting empty arrays, duplicate repositories, invalid repository names, empty destinations, and control characters.
- [x] Run `bun run test src/shared/branch-workspace-git-actions.test.ts` and verify RED because the old contract only accepts repository names.
- [x] Implement the minimal types and normalizer, preserving client target order at the boundary.
- [x] Re-run the focused test and verify GREEN.

### Task 2: Plan selectable local destinations without base-branch coupling

**Files:**

- Create: `src/server/modules/branch-workspace-batch-merge-worktree.test.ts`
- Create: `src/server/modules/branch-workspace-batch-merge-worktree.ts`
- Modify: `src/server/modules/branch-workspace-git-action-plan.test.ts`
- Modify: `src/server/modules/branch-workspace-git-action-plan.ts`

**Interfaces:**

- Produce deterministic repository-sibling temporary worktree paths under `.hobgoblin-batch-merge-`.
- Project every local branch except the member target as a candidate with readiness, worktree path, temporary ownership, and upstream readiness.

- [x] Add failing pure path tests proving local/SSH path handling and rejecting lookalike paths outside the repository parent.
- [x] Add failing planner tests proving an unchecked-out `baseBranch` no longer blocks planning, candidates exclude the source branch, unchecked-out branches are ready, and dirty ordinary worktrees are disabled.
- [x] Run both focused suites and verify RED against the old fixed-base plan.
- [x] Implement the path helper and candidate projection. Keep source dirtiness as member readiness instead of failing the whole plan.
- [x] Re-run both suites and verify GREEN.

### Task 3: Execute and retry the selected destinations safely

**Files:**

- Modify: `src/server/modules/branch-workspace-git-action-write-paths.test.ts`
- Modify: `src/server/modules/branch-workspace-git-action-write-paths.ts`

**Interfaces:**

- Consume `{ mode, targets }`, reorder by the plan, and bind the full mapping for retry.
- Use existing `createRepositoryWorktree` / `removeRepositoryWorktree` with bootstrap skipped.
- Publish `prepare | pull | merge | push | cleanup` activity steps.

- [x] Add failing tests for distinct per-member destinations, plan-order execution, target-specific upstream validation, retry binding, and rejection before Git writes.
- [x] Add failing tests for unchecked-out destination creation, successful cleanup, merge-conflict cleanup, cancellation cleanup, and preservation of ordinary destination worktrees.
- [x] Run the focused write-path suite and verify RED.
- [x] Implement selection resolution against the refreshed plan, temporary worktree preparation/cleanup, and step-aware retry state.
- [x] Re-run write-path and planner suites and verify GREEN.

### Task 4: Require destination selection in the batch dialog

**Files:**

- Modify: `src/web/hooks/useBranchWorkspaceGitActions.ts`
- Modify: `src/web/components/repo-workspace/branch-workspace-batch-merge-progress.test.ts`
- Modify: `src/web/components/repo-workspace/branch-workspace-batch-merge-progress.ts`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.test.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.tsx`
- Modify action-kind call sites and their tests under `src/web/components/repo-workspace/`.

**Interfaces:**

- Submit `BranchWorkspaceBatchMergeTargetInput[]` from the hook.
- Render one shadcn/Radix `Select` per selected member.
- Project steps from selected target worktree facts and mode.

- [x] Add failing projection and component tests for required targets, per-repository choices, dirty-option disabling, selected-target upstream readiness, submission, lock/retry, and prepare/cleanup progress.
- [x] Run focused Renderer suites and verify RED.
- [x] Implement the hook, pure projection, dialog controls, and `batch-merge` call sites without changing other Git action panels.
- [x] Re-run focused Renderer suites and verify GREEN without React warnings.

### Task 5: Align copy and domain documentation

**Files:**

- Modify: `src/shared/i18n/dictionaries.test.ts`
- Modify: `src/shared/i18n/{en,zh,ja,ko}.ts`
- Modify: `CONTEXT.md`
- Update: `docs/superpowers/specs/2026-07-28-branch-workspace-batch-merge-design.md`

- [x] Add failing dictionary assertions for batch-merge destination, preparation, cleanup, dirty/unavailable destination, and upstream copy.
- [x] Run `bun run test src/shared/i18n/dictionaries.test.ts` and verify RED.
- [x] Update all locales and redefine base branch plus batch merge in the glossary.
- [x] Re-run dictionary tests and verify GREEN.

### Task 6: Full verification and requirements audit

- [x] Run focused changed suites once more (9 files, 180 tests passed).
- [x] Run the three TypeScript projects used by `bun run typecheck` (all passed; the workspace's external `node_modules` symlink did not contain the required tool binaries).
- [x] Run the full test suite (368/370 files and 3465/3469 tests passed; the four remaining failures are unchanged tmux permission/SSH mock environment cases).
- [x] Run `bun run check:architecture`.
- [x] Run `git diff --check` and inspect the complete diff for accidental base/source coupling or unrelated edits.
- [x] Re-read the design goals and change its status to `已实施` only when every required behavior has fresh passing evidence.

### Task 7: Widen destination selection and hide internal worktree details

**Files:**

- Modify: `src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.test.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.tsx`

**Interfaces:**

- Keep the existing `BranchWorkspaceBatchMergeDestinationPlan` and submission payload unchanged.
- Render only `candidate.branch` in each target option.
- Use `sm:max-w-4xl`, a `minmax(16rem,2fr)` destination column, and content that can show the full branch name.

- [x] Add a failing component test that asserts the `4xl` dialog width, `16rem` destination column, and absence of the temporary-worktree label for the `staging` option.
- [x] Run `bun run test src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.test.tsx` and verify RED.
- [x] Apply the confirmed layout classes, remove the temporary-worktree suffix, and allow long option text to wrap without changing selection behavior.
- [x] Re-run the focused component test and verify GREEN.
- [x] Run `bun run typecheck`, `bun run check:architecture`, and `git diff --check` without starting Electron.
