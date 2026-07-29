# Branch Workspace Drift Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. This plan is explicitly selected for inline execution; do not dispatch subagents.

**Goal:** Allow a drifted member worktree to be removed from its branch workspace and allow an entire branch workspace to be force-removed even when a member path no longer checks out the manifest branch.

**Architecture:** Make lifecycle planning resolve the actual registered worktree by the managed member path, while keeping the manifest branch as the separate branch-cleanup target. Expose the existing reduce lifecycle as a member-scoped destructive action, and retain existing plan tokens, approval gates, terminal shutdown, operation persistence, and Git safety checks.

**Tech Stack:** TypeScript 6 strip-only mode, Bun, Vitest, React 19, Git worktree lifecycle services, typed renderer/server contracts.

## Global Constraints

- The member path is the identity of the managed worktree; the manifest branch is not used to infer which worktree occupies that path.
- Removing a drifted worktree must not delete its currently checked-out branch or an intended branch checked out elsewhere.
- Optional branch cleanup continues to target only the manifest branch and must skip it while it is checked out elsewhere.
- A member-scoped removal rejects arbitrary non-worktree content at the member path.
- A valid worktree at the member path remains navigable and actionable through its actual branch, with a weak repair hint.
- Whole-workspace removal treats arbitrary content under a declared member path as unmanaged content and requires the existing unmanaged-content approval.
- Primary and locked worktrees remain non-removable, including when they are on an unexpected branch.
- Keep the final-member rule: it cannot be reduced; the whole workspace must be removed instead.
- Do not add dependencies or unsupported TypeScript runtime syntax.
- Do not create Git commits because the user did not request them.

---

### Task 1: Represent the actual checked-out branch separately from the target branch

**Files:**
- Modify: `src/shared/branch-workspaces.ts`
- Modify: `src/server/modules/branch-workspace-plan.test.ts`
- Modify: `src/server/modules/branch-workspace-plan.ts`

**Interfaces:**
- Produces: `BranchWorkspaceRepositoryPlan.checkedOutBranch?: string`
- Produces: path-based registered-worktree resolution shared by reduce and remove planning
- Preserves: `targetBranch` as the manifest branch and optional cleanup target

- [ ] **Step 1: Write failing reduce-planner tests**

Add fixtures with a target branch lacking a worktree and another branch registered at the manifest member path. Assert that reducing the selected member succeeds, records the unexpected branch as `checkedOutBranch`, preserves `targetBranch`, and schedules `remove-worktree`.

Also assert:

- a selected member whose path is absent is already satisfied even if the target branch is checked out elsewhere;
- a selected member path containing non-worktree content is rejected;
- a primary or locked worktree registered at the managed path remains blocked.

- [ ] **Step 2: Run the focused planner tests and verify RED**

Run: `bun run test src/server/modules/branch-workspace-plan.test.ts`

Expected: FAIL because reduce planning still locates worktrees through `targetBranch` and the plan has no `checkedOutBranch` field.

- [ ] **Step 3: Add the minimal path-based resolution model**

Extend the repository plan with optional `checkedOutBranch`. Add a focused helper that scans snapshot branches for a worktree whose path matches the declared member path with `sameHostPath` and returns both the branch and worktree.

For selected reduce members:

- registered worktree at the exact path: validate primary/locked/dirty and plan its removal;
- no registered worktree and no path: mark satisfied;
- no registered worktree but path exists: return a dedicated unsafe-member-path planning error;
- target branch checked out elsewhere: leave it untouched.

Continue enforcing exact manifest branch/path health for members not selected for reduction.

- [ ] **Step 4: Run the focused planner tests and verify GREEN**

Run: `bun run test src/server/modules/branch-workspace-plan.test.ts`

Expected: PASS for the new reduce cases and existing lifecycle cases.

---

### Task 2: Make whole-workspace removal path-aware and approval-safe

**Files:**
- Modify: `src/server/modules/branch-workspace-plan.test.ts`
- Modify: `src/server/modules/branch-workspace-plan.ts`

**Interfaces:**
- Consumes: path-based registered-worktree resolution from Task 1
- Preserves: existing `dirty-worktree`, `active-terminals`, `unmanaged-content`, root-path, auxiliary-path, and plan-token safety behavior

- [ ] **Step 1: Write failing whole-removal planner tests**

Add cases proving:

- an unexpected branch registered at the declared member path is removable and captured as `checkedOutBranch`;
- a target branch checked out elsewhere does not block removal and is not selected for branch deletion;
- a missing member path is satisfied;
- arbitrary content at a declared member path is included in unmanaged entries and requires `unmanaged-content` approval;
- primary/locked worktrees still block the plan.

- [ ] **Step 2: Run the focused planner tests and verify RED**

Run: `bun run test src/server/modules/branch-workspace-plan.test.ts`

Expected: FAIL with the current `target-exists` or `worktree-elsewhere` behavior.

- [ ] **Step 3: Implement path-aware whole removal**

Change per-repository removal planning to inspect the exact member path first. If it is a registered worktree, plan removal using its actual branch. If it is absent, mark it satisfied. If it contains unregistered content, add that member path to the existing unmanaged-entry approval flow instead of reporting `target-exists`.

Set `deleteBranch` only when the manifest branch was created by the workspace and is not currently checked out in another worktree. Do not infer branch deletion from `checkedOutBranch`.

- [ ] **Step 4: Run the focused planner tests and verify GREEN**

Run: `bun run test src/server/modules/branch-workspace-plan.test.ts`

Expected: PASS.

---

### Task 3: Execute worktree removal against the actual branch

**Files:**
- Modify: `src/server/modules/branch-workspace-write-paths.test.ts`
- Modify: `src/server/modules/branch-workspace-write-paths.ts`

**Interfaces:**
- Consumes: `checkedOutBranch?: string`
- Preserves: `targetBranch` for optional local/upstream branch cleanup

- [ ] **Step 1: Write failing executor tests**

For both reduce and whole removal, provide a repository plan whose `targetBranch` and `checkedOutBranch` differ. Assert `removeWorktree` receives `checkedOutBranch`, while any later `deleteBranch` call still receives `targetBranch`.

- [ ] **Step 2: Run the focused executor tests and verify RED**

Run: `bun run test src/server/modules/branch-workspace-write-paths.test.ts`

Expected: FAIL because execution currently passes `targetBranch` to worktree removal.

- [ ] **Step 3: Implement the execution fallback**

Use `repository.checkedOutBranch ?? repository.targetBranch` only for the `removeWorktree` call. Keep branch and upstream deletion bound to `repository.targetBranch`.

If a reduce repository is already satisfied because its path is absent, skip the Git removal call and only persist member removal.

- [ ] **Step 4: Run the focused executor tests and verify GREEN**

Run: `bun run test src/server/modules/branch-workspace-write-paths.test.ts`

Expected: PASS.

---

### Task 4: Add a member-scoped removal action to the branch-workspace UI

**Files:**
- Modify: `src/web/i18n/dictionaries/en.ts`
- Modify: `src/web/i18n/dictionaries/ja.ts`
- Modify: `src/web/i18n/dictionaries/ko.ts`
- Modify: `src/web/i18n/dictionaries/zh-CN.ts`
- Modify: `src/web/i18n/dictionaries/zh-TW.ts`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceMemberRow.test.tsx` or `src/web/components/repo-workspace/BranchWorkspaceList.test.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceMemberRow.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceList.tsx`

**Interfaces:**
- Produces: `onReduceMember(item, member)` callback
- Produces: localized destructive menu action “移除成员工作树”
- Preserves: disabled normal member actions for non-navigable drifted members

- [ ] **Step 1: Write failing member-menu tests**

Render a branch workspace containing at least two members with one unresolved/drifted member. Open that member's overflow menu and assert the removal action is enabled and calls `onReduceMember` with the exact workspace and member.

Add a single-member case asserting that the action is absent, because the final member must be removed through whole-workspace deletion.

- [ ] **Step 2: Run the focused UI tests and verify RED**

Run: `bun run test src/web/components/repo-workspace/BranchWorkspaceList.test.tsx`

Expected: FAIL because unresolved members expose only disabled ordinary actions and tmux cleanup.

- [ ] **Step 3: Implement the dedicated destructive action**

Append a separate menu action that is not derived from the member's navigability projection. Expose it only for a problematic, non-removed member when the workspace has more than one member and no conflicting lifecycle operation is active.

Add the translation key to all dictionaries and reuse the existing reduce lifecycle callback instead of creating a parallel deletion API.

When the member path resolves to a registered worktree on another branch, project that actual branch as the action target, keep the row navigable, and render a low-emphasis repair hint. Leave members with no registered worktree at the path disabled.

- [ ] **Step 4: Run the focused UI and dictionary tests and verify GREEN**

Run: `bun run test src/web/components/repo-workspace/BranchWorkspaceList.test.tsx src/web/i18n/dictionaries.test.ts`

Expected: PASS.

---

### Task 5: Open the existing reduce dialog with one fixed member

**Files:**
- Modify: `src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceDialog.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.tsx`

**Interfaces:**
- Produces: `fixedReduceRepositoryName?: string | null`
- Preserves: ordinary multi-select reduce flow and resume flow

- [ ] **Step 1: Write failing dialog and rail tests**

Assert a member-scoped removal callback opens reduce mode with that repository preselected. In the dialog, assert the selected repository remains checked and all repository checkboxes are locked so the request cannot drift to another member.

Assert ordinary reduce mode still starts with no fixed selection and continuation mode retains its existing selection behavior.

- [ ] **Step 2: Run the focused renderer tests and verify RED**

Run: `bun run test src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`

Expected: FAIL because the dialog has no fixed-member input.

- [ ] **Step 3: Wire the fixed-member state through the rail and dialog**

Store the optional member repository name alongside the dialog mode/workspace. Initialize reduce selections from that value, disable all repository selection controls while it is present, and clear it whenever the dialog closes or another mode opens.

Pass `onReduceMember` from the rail through the list and member row. Keep confirmation, plan preview, approvals, and execution on the existing reduce endpoints.

- [ ] **Step 4: Run the focused renderer tests and verify GREEN**

Run: `bun run test src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx src/web/components/repo-workspace/BranchWorkspaceList.test.tsx src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`

Expected: PASS.

---

### Task 6: Regression and architecture verification

**Files:**
- Verify only

- [ ] **Step 1: Run lifecycle regression tests**

Run: `bun run test src/server/modules/branch-workspace-plan.test.ts src/server/modules/branch-workspace-write-paths.test.ts src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx src/web/components/repo-workspace/BranchWorkspaceList.test.tsx src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx src/web/i18n/dictionaries.test.ts`

Expected: PASS.

- [ ] **Step 2: Run full repository verification**

Run:

```sh
bun run typecheck
bun run test
bun run check:architecture
```

Expected: all commands exit successfully.

- [ ] **Step 3: Inspect the final diff and safety invariants**

Confirm there are no unrelated changes, no dependency changes, no branch deletion based on `checkedOutBranch`, and no code path bypassing the existing plan-token or approval model.
