# Branch Workspace Create Action Titlebar Implementation Plan

> **For agentic workers:** Execute this single task inline with test-driven development. Do not create a branch, commit, or dispatch subagents for this repository task.

**Goal:** Move the existing create-branch-workspace icon from the workspace-repository titlebar to the branch-workspace titlebar without changing its behavior.

**Architecture:** Keep action ownership in `WorkspaceRepositoryRail`. Render one existing create action in the branch-workspace header for both visible and hidden repository-list states; leave repository rescan and repository visibility actions in their current repository-specific locations.

**Tech Stack:** React 19, TypeScript 6 strip-only mode, Vitest, Testing Library-compatible DOM assertions, Tailwind CSS 4.

## Global Constraints

- Preserve the existing `Button`, `FolderPlus`, translation key, disabled state, and click handler.
- Use repo-alias imports with explicit `.ts`/`.tsx` extensions; this change needs no new imports.
- Do not add state, APIs, dependencies, re-export shims, Git commits, or branches.
- Verify with the targeted Vitest file, `bun run typecheck`, `bun run check:architecture`, and `bun run test`.

---

### Task 1: Reassign the create action to the branch-workspace titlebar

**Files:**

- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.tsx`

**Interfaces:**

- Consumes: existing `branchWorkspacePrimaryActions`, `branchListRefreshAction`, and `repositoryListToggleAction` JSX values.
- Produces: exactly one `button[aria-label="workspace.branch-workspace.create"]`, owned by `section[aria-label="workspace.branch-workspace.list"]` whenever that section is rendered.

- [x] **Step 1: Write the failing ownership assertion**

Update the visible-repository assertions so `workspace.branch-workspace.create` is absent from the repository section and present in the branch-workspace section, while `workspace.rescan` remains in the repository section.

- [x] **Step 2: Run the target test to verify RED**

Run: `bun run test src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`

Expected: FAIL because the create action is still rendered in the repository titlebar.

- [x] **Step 3: Apply the minimal rendering change**

Remove `branchWorkspacePrimaryActions` from `repositoryHeaderActions`, remove it from the hidden-only action group, and render it before `branchListRefreshAction` in the branch-workspace titlebar. Keep the hidden-only group for `repositoryListToggleAction`.

- [x] **Step 4: Run the target test to verify GREEN**

Run: `bun run test src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`

Expected: all tests in the file pass.

- [x] **Step 5: Run repository verification**

Run `bun run typecheck`, `bun run check:architecture`, and `bun run test`; require exit code 0 for each command, then inspect `git diff --check` and the final diff.
