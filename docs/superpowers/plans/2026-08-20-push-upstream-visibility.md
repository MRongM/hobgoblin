# Push Upstream Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display each configured branch upstream during single protected pushes, batch pulls, and batch pushes.

**Architecture:** Extend the existing branch-workspace sync read model with snapshot-owned upstream fields, then render those fields in existing confirmation and batch-list surfaces. Keep all Git execution and remote resolution unchanged.

**Tech Stack:** TypeScript 6 strip-only mode, React 19, Vitest, Bun

## Global Constraints

- Execute inline in the current worktree; do not dispatch subagents.
- Do not commit, stage, push, create branches, or modify worktrees.
- Do not add dependencies.
- Use repository aliases with explicit `.ts` and `.tsx` extensions.
- Preserve local and SSH Git behavior; this is a read-model and presentation change only.
- Keep examples and tests privacy-safe.

---

### Task 1: Project upstream into batch sync plans

**Files:**

- Modify: `src/shared/branch-workspace-git-actions.ts`
- Modify: `src/server/modules/branch-workspace-git-action-plan.ts`
- Test: `src/server/modules/branch-workspace-git-action-plan.test.ts`

**Interfaces:**

- Produces: `BranchWorkspaceSyncMemberPlan.upstream: string | null`
- Produces: `BranchWorkspaceSyncMemberPlan.trackingGone: boolean`

- [ ] Write a failing plan test asserting both fields for usable, missing, and gone upstream states.
- [ ] Run `bun run test -- src/server/modules/branch-workspace-git-action-plan.test.ts` and confirm the new assertion fails because the fields are absent.
- [ ] Add the two fields to the shared plan type and populate them from the target branch snapshot.
- [ ] Re-run the focused plan test and confirm it passes.

### Task 2: Render upstreams in push and batch-sync surfaces

**Files:**

- Modify: `src/web/components/BranchActionDialogs.tsx`
- Create: `src/web/components/branch-list/BranchUpstreamDisplay.tsx`
- Modify: `src/web/components/repo-workspace/ProjectLocalPanel.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.tsx`
- Modify: `src/web/stores/repos/branch-action-write-paths.ts`
- Modify: `src/web/hooks/useBranchActions.tsx`
- Modify: `src/web/hooks/useBranchActionItems.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.test.tsx`
- Modify: `src/web/hooks/useBranchActions.test.tsx`
- Modify: `src/web/hooks/useBranchActionItems.test.tsx`
- Modify: `src/web/components/repo-workspace/ProjectLocalPanel.test.tsx`

**Interfaces:**

- Consumes: `BranchWorkspaceSyncMemberPlan.upstream` and `trackingGone`
- Reuses: `action.branch-upstream-current`, `branches.no-upstream`, and `action.branch-upstream-gone`

- [ ] Write failing UI tests for single-push action/confirmation upstreams and pull/push batch rows containing upstream values.
- [ ] Run the focused UI tests and confirm they fail because the explicit upstream presentation is absent.
- [ ] Add a compact reusable upstream display, include upstream in ordinary push labels and Local-panel push hints, and render it in protected confirmations and batch rows without changing confirmation or execution behavior.
- [ ] Re-run the focused UI tests and confirm they pass.

### Task 3: Verify the complete change

**Files:**

- Review all files changed by Tasks 1 and 2 plus the design and plan documents.

- [ ] Run `bun run typecheck`.
- [ ] Run `bun run test`.
- [ ] Run `bun run check:architecture`.
- [ ] Run `git diff --check`.
- [ ] Review `git diff` to confirm no Git execution, push-target resolution, or unrelated user changes were modified.
