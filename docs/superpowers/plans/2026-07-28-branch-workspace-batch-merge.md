# Branch Workspace Batch Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This repository explicitly requires inline execution for this task; do not dispatch subagents.

**Goal:** Replace the branch-workspace “merge back” action with a selectable batch-merge dialog that executes chosen members sequentially and shows member/step progress.

**Architecture:** Extend the existing shared execute contract with selected repository names, then filter and bind that selection inside the existing server write path. Keep selection local to the dialog, keep authoritative activity in the existing server snapshot, and add one pure Renderer projection for deterministic progress rendering.

**Tech Stack:** TypeScript 6 strip-only mode, React 19, Radix/shadcn UI primitives, TanStack Query, Hono, Vitest, Bun.

## Global Constraints

- Do not use enums, runtime namespaces, parameter properties, or import aliases.
- Use repo-alias imports with explicit `.ts`/`.tsx` extensions.
- Preserve repository member order; never trust client-provided order.
- Execute selected members sequentially, stop at first failure, and never roll back completed Git or remote writes.
- Keep dialog selection and selected mode local and ephemeral; keep plans and active operation state server-owned.
- Reuse WebSocket invalidation plus targeted refetch; add no polling or streaming protocol.
- Use “成员工作树” in Chinese UI copy and sentence case for actions/headings.
- Do not create branches, commits, or use subagents for this task.

---

### Task 1: Add the selected-member execute contract

**Files:**

- Modify: `src/shared/branch-workspace-git-actions.test.ts`
- Modify: `src/shared/branch-workspace-git-actions.ts`

**Interfaces:**

- Produces: `Extract<BranchWorkspaceGitActionExecuteInput, { kind: 'merge-back' }>` with `repositoryNames: string[]`.
- Consumes: existing `isWorkspaceRepositoryName()` validation.

- [ ] **Step 1: Write failing normalization tests**

Add cases proving that merge-back accepts `repositoryNames: ['web', 'api']` without reordering, and rejects an empty array, duplicate names, control characters, and non-workspace repository names.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun run test src/shared/branch-workspace-git-actions.test.ts`

Expected: the accepted result lacks `repositoryNames`, and invalid-selection cases are not rejected for the intended reason.

- [ ] **Step 3: Implement the minimal shared contract**

Change the merge input to:

```ts
{
  kind: 'merge-back'
  planToken: string
  mode: BranchWorkspaceMergeMode
  repositoryNames: string[]
}
```

Normalize with a focused helper that requires a non-empty array, validates every trimmed name with `isWorkspaceRepositoryName`, and rejects duplicates while preserving request order.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `bun run test src/shared/branch-workspace-git-actions.test.ts`

Expected: all shared action contract tests pass.

### Task 2: Scope and bind server batch-merge execution

**Files:**

- Modify: `src/server/modules/branch-workspace-git-action-write-paths.test.ts`
- Modify: `src/server/modules/branch-workspace-git-action-write-paths.ts`

**Interfaces:**

- Consumes: merge execute input `{ mode, repositoryNames }` from Task 1.
- Produces: selected-member execution in manifest order, selected `totalCount/currentStep`, and retry binding to the first selection/mode.

- [ ] **Step 1: Write a failing selected-order test**

Submit `repositoryNames: ['web', 'api']` and assert Git calls occur as `api`, then `web`, because plan order is authoritative. Assert `activeOperation.totalCount === 2`; add a third unselected plan member and assert it is never written.

- [ ] **Step 2: Run the focused server test and verify RED**

Run: `bun run test src/server/modules/branch-workspace-git-action-write-paths.test.ts`

Expected: TypeScript/test failures show that merge input has no selection and all members execute.

- [ ] **Step 3: Implement selection validation and filtering**

Add a pending merge binding:

```ts
interface MergeExecutionBinding {
  mode: BranchWorkspaceMergeMode
  repositoryNames: string[]
}
```

Before creating the active operation:

- map requested names to plan members;
- reject unknown names and selections containing only `mergeSatisfied` members;
- reject `pull-merge-push` only when a selected member lacks a usable base upstream;
- bind the first selection/mode and require exact equality on retry;
- derive active `totalCount` from the selected list.

Filter plan members by the selected set while preserving plan order. Pass unselected names into the existing fingerprint-validation ignore set, and calculate `currentStep` from the filtered index.

- [ ] **Step 4: Run the selected-order test and verify GREEN**

Run: `bun run test src/server/modules/branch-workspace-git-action-write-paths.test.ts`

Expected: the selected subset executes once in plan order.

- [ ] **Step 5: Write failing safety/retry tests**

Cover these independent cases:

- unknown name rejects before Git writes;
- selected no-upstream member blocks only `pull-merge-push`, while an unselected no-upstream member does not;
- a changed unselected member fingerprint is ignored by validation;
- retry with the original selection/mode skips completed work;
- retry with another selection or mode rejects before new writes.

- [ ] **Step 6: Run the focused server test and verify RED**

Run: `bun run test src/server/modules/branch-workspace-git-action-write-paths.test.ts`

Expected: at least the binding and selected-readiness assertions fail before implementation completion.

- [ ] **Step 7: Complete the minimal server safeguards**

Use exact array comparison against the plan-ordered selected names. Keep the existing `completed` and `mergeProgress` maps as the only retry progress state. Return `error.invalid-arguments` for malformed/changed batches and the existing base-upstream message for selected readiness failures.

- [ ] **Step 8: Run the server module tests and verify GREEN**

Run: `bun run test src/server/modules/branch-workspace-git-action-write-paths.test.ts src/server/modules/branch-workspace-git-action-plan.test.ts`

Expected: both suites pass.

### Task 3: Project selected member and step progress

**Files:**

- Create: `src/web/components/repo-workspace/branch-workspace-batch-merge-progress.test.ts`
- Create: `src/web/components/repo-workspace/branch-workspace-batch-merge-progress.ts`

**Interfaces:**

- Consumes: `BranchWorkspaceMergeBackPlan`, selected names, started mode, `BranchWorkspaceActiveOperation | null`, and `BranchWorkspaceGitActionResult | null`.
- Produces: `{ members, completedCount, totalCount }`, where each member has ordered step statuses of `pending | active | complete | failed`.

- [ ] **Step 1: Write failing pure projection tests**

Test local merge and pull/merge/push separately. Prove that:

- unselected members are marked unselected and excluded from totals;
- `completedCount` marks earlier selected members complete;
- active `merge` implies pull complete and merge active;
- active `push` implies pull and merge complete;
- a final failed result marks its exact step failed and keeps later steps pending.

- [ ] **Step 2: Run the focused projection test and verify RED**

Run: `bun run test src/web/components/repo-workspace/branch-workspace-batch-merge-progress.test.ts`

Expected: FAIL because the projection module does not exist.

- [ ] **Step 3: Implement the pure projection**

Define narrow output types and derive all states from plan order plus existing server facts. Do not store progress or mutate inputs. For remote mode use `['pull', 'merge', 'push']`; for local mode use `['merge']`.

- [ ] **Step 4: Run the focused projection test and verify GREEN**

Run: `bun run test src/web/components/repo-workspace/branch-workspace-batch-merge-progress.test.ts`

Expected: all projection cases pass.

### Task 4: Build the batch-merge dialog and submit selection

**Files:**

- Modify: `src/web/hooks/useBranchWorkspaceGitActions.ts`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.test.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`

**Interfaces:**

- Changes: `executeMergeBack(mode, repositoryNames)`.
- Consumes: progress projection from Task 3.
- Produces: Radix `Dialog` for merge-back; all other action kinds retain the current inline panel.

- [ ] **Step 1: Write failing hook/component tests**

Assert that:

- merge-back renders a `dialog-portal`, while batch commit stays inline;
- every unmerged member starts checked and every merged member is disabled;
- clearing all eligible checks disables both actions;
- remote readiness is computed from selected members only;
- clicking an action submits its mode and selected repository names;
- pending/result states lock selection and retain only the started mode for retry;
- active snapshots render `completed/total` and pull/merge/push step states.

- [ ] **Step 2: Run the focused Renderer tests and verify RED**

Run: `bun run test src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.test.tsx src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`

Expected: dialog, checkbox, selection payload, and progress assertions fail.

- [ ] **Step 3: Extend the hook execute signature**

Implement:

```ts
const executeMergeBack = useCallback(
  async (mode: BranchWorkspaceMergeMode, repositoryNames: string[]) => {
    if (!plan || plan.kind !== 'merge-back') return null
    return await execute({ kind: 'merge-back', planToken: plan.token, mode, repositoryNames })
  },
  [execute, plan],
)
```

- [ ] **Step 4: Implement the dedicated merge dialog**

At the top-level component, route `kind === 'merge-back'` or `plan?.kind === 'merge-back'` to a controlled Radix `Dialog`; leave the existing inline JSX unchanged for other kinds.

Inside the merge dialog:

- initialize local selection from `!member.mergeSatisfied` whenever the plan token changes;
- render `Checkbox` rows and disable satisfied members;
- capture `startedMode` before execution and lock checkboxes while pending or after a result;
- use the Task 3 projection for summary and step chips;
- call the existing abort path whenever an executing dialog closes;
- close only after a successful response;
- after failure, show only a same-mode retry action.

- [ ] **Step 5: Run focused Renderer tests and verify GREEN**

Run: `bun run test src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.test.tsx src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`

Expected: all focused Renderer tests pass without React act warnings.

### Task 5: Update product copy, domain docs, and full verification

**Files:**

- Modify: `src/shared/i18n/dictionaries.test.ts`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `CONTEXT.md`
- Update: `docs/superpowers/specs/2026-07-28-branch-workspace-batch-merge-design.md`

**Interfaces:**

- Produces: complete localized batch-merge labels, selection copy, progress copy, and finalized domain terminology.

- [ ] **Step 1: Write failing dictionary assertions**

Require the batch-merge keys in every locale and assert:

```ts
expect(zh['workspace.branch-workspace.git-action.merge-back']).toBe('批量合并')
expect(en['workspace.branch-workspace.git-action.merge-back']).toBe('Batch merge')
```

Include keys for selected count, unselected state, member checkbox accessible label, and progress step status.

- [ ] **Step 2: Run dictionary tests and verify RED**

Run: `bun run test src/shared/i18n/dictionaries.test.ts`

Expected: old merge-back label and missing batch-merge copy fail assertions.

- [ ] **Step 3: Add concise localized copy**

Update all four dictionaries with aligned placeholders. Preserve raw branch names and use existing phase/step copy where possible instead of duplicating translations.

- [ ] **Step 4: Run dictionary tests and verify GREEN**

Run: `bun run test src/shared/i18n/dictionaries.test.ts`

Expected: dictionaries remain structurally aligned and new label assertions pass.

- [ ] **Step 5: Run formatting and inspect only task-owned changes**

Run: `bun run format`

Then inspect `git diff --check` and `git diff --` for every file listed in this plan. Preserve the user's pre-existing change-count-refresh edits in overlapping dictionary/list files.

- [ ] **Step 6: Run full verification**

Run in this order:

```text
bun run typecheck
bun run test
bun run check:architecture
```

Expected: all commands exit 0 with no failed tests or architecture violations.

- [ ] **Step 7: Final requirements audit**

Re-read the design and verify each goal/non-goal against the diff and fresh test output. Change the design status to `已实施` only after all checks pass. Do not commit or create a branch.
