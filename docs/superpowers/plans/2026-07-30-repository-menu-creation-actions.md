# Repository Menu Creation Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the existing remote-tracking-branch and generic worktree creation flows to standalone Git project menus and workspace repository menus.

**Architecture:** Extract the existing repository-scoped creation actions and retained dialogs into a focused renderer hook module. Existing branch action surfaces and the two repository-row surfaces consume those shared hooks, while all Git writes continue through the existing repository store and server contracts.

**Tech Stack:** React 19, Zustand, TypeScript 6 strip-only mode, Radix/shadcn menu primitives, Vitest, Bun.

## Global Constraints

- Work inline in the current linked worktree; do not dispatch subagents.
- Do not run `git commit`, `git push`, create branches, or modify Git history.
- Use repo-alias imports with explicit `.ts` / `.tsx` extensions.
- Do not add enum declarations, runtime namespaces, parameter properties, or TypeScript import aliases.
- Reuse existing translations, dialogs, mutation APIs, and menu primitives; add no dependencies.
- Keep the new actions out of right-click context menus and plain workspace project menus.
- Preserve the existing four-mode `CreateWorktreeDialog` interaction and selected-branch behavior on branch rows.
- Verify with `bun run typecheck`, `bun run test`, and `bun run check:architecture`.

---

### Task 1: Specify the standalone Git project menu behavior

**Files:**

- Modify: `src/web/components/repo-workspace/SidebarProjectList.test.tsx`

**Interfaces:**

- Consumes: `SidebarProjectList`, `useReposStore`, `seedRepoState`, existing `WorkspaceListItemMenu` DOM contract (`data-action`, `role="menuitem"`).
- Produces: failing behavioral coverage for `pullRemoteBranch` and `createWorktree` on Git project rows, including the plain-workspace exclusion and no-activation rule.

- [ ] **Step 1: Seed one available Git repository projection in test setup**

Import `createRepoBranch`, `resetReposStore`, and `seedRepoState` from `#/web/stores/repos/test-utils.ts`. Reset the repository store in `beforeEach`, then seed `/repo-a` with a current `main` branch and `remote.hasRemotes: true`. Reset the store again in `afterEach`.

Add a partial `#/web/repo-client.ts` mock that keeps the real module except for `getRepositoryRemoteBranches` and `getRepositoryWorktreeBootstrapPreflight`; resolve them with `['origin/feature/menu']` and `{ ok: true, preflight: { kind: 'candidates', candidates: [] } }` so opening the existing dialogs stays deterministic.

- [ ] **Step 2: Write the failing menu projection test**

Update the existing `closes a project from More without activating it` expectation so the Git repository menu begins with:

```ts
expect(items.map((item) => item.textContent?.trim())).toEqual([
  'action.pull-remote-branch',
  'action.create-worktree',
  'terminal.new-with-tmux',
  'terminal.external',
  'Close Repo A',
  'tmux.cleanup.action',
])
```

Add an assertion that `/repo-b`, whose `ProjectSummary.isGitRepo` is `false`, does not contain either creation action.

- [ ] **Step 3: Write the failing interaction test**

Select `action.pull-remote-branch` from `/repo-a` and assert the existing `action.pull-remote-branch-title` dialog appears while `onActivate` and `onClose` remain untouched. Close it through its cancel button, then select `action.create-worktree` and assert the existing `action.create-worktree-title` plus all four mode labels appear, again without activating or closing the project.

- [ ] **Step 4: Run the focused test and verify RED**

Run:

```text
bun run test src/web/components/repo-workspace/SidebarProjectList.test.tsx
```

Expected: FAIL because the project menu does not yet contain `action.pull-remote-branch` or `action.create-worktree`.

---

### Task 2: Share repository creation ownership and make the project menu green

**Files:**

- Create: `src/web/hooks/useRepositoryCreationActions.tsx`
- Modify: `src/web/hooks/useBranchWriteActions.tsx`
- Modify: `src/web/hooks/useBranchActionItems.tsx`
- Modify: `src/web/components/repo-workspace/SidebarProjectList.tsx`
- Test: `src/web/hooks/useBranchActionItems.test.tsx`
- Test: `src/web/components/repo-workspace/SidebarProjectList.test.tsx`

**Interfaces:**

- Consumes: `BranchActionRepo`, `BranchActionItemId`, `useRetainedDialogState`, `runBranchAction`, `submitBranchAction`, `PullRemoteBranchDialog`, `CreateWorktreeDialog`, repository bootstrap preflight/source helpers.
- Produces:
  - `RepositoryCreationAction`, structurally compatible with both `BranchActionItem` and `WorkspaceListItemAction`.
  - `useTrackRemoteBranchAction(repo, options?) -> { item, dialog }`.
  - `useCreateWorktreeAction(repo, options?) -> { item, dialog }`.
  - `useRepositoryCreationActions(repo, options?) -> { items, dialogs }` for repository-row menus.

- [ ] **Step 1: Extract the tracking-branch action**

Move the retained `PullRemoteBranchDialog` state, `handleTrackRemoteBranch`, action object, and dialog JSX from `useBranchWriteActions.tsx` into `useTrackRemoteBranchAction`.

The hook must preserve this write payload and failure behavior:

```ts
const result = await runBranchAction(
  repo.id,
  { kind: 'trackRemoteBranch', localBranch: input.localBranch, remoteRef: input.remoteRef },
  { token: repo.instanceToken },
)
if (result && !result.ok) throw new Error(result.message)
```

The item keeps `id: 'pullRemoteBranch'`, the existing label/title keys and `RadioTower` icon, and is disabled when the repo is absent, forced disabled, has no remotes, or has a non-idle branch action.

- [ ] **Step 2: Extract the worktree action and connected dialog**

Move `CreateWorktreeDialogConnected`, its bootstrap/source state, `uniqueRepositoryDependencySources`, the retained dialog state, and `handleCreateWorktree` out of `useBranchActionItems.tsx`.

Preserve the submission exactly:

```ts
submitBranchAction(
  repo.id,
  { kind: 'createWorktree', input: request.input, worktreeBootstrap },
  { token: repo.instanceToken, refreshOnError: false },
)
```

`useCreateWorktreeAction` accepts `defaultBranch?: string`, `busyTargetBranch?: string`, and `forceDisabled?: boolean`. When `busyTargetBranch` exists, retain the current branch-row busy-label calculation through `branchActionDisplayPhase`; when it is absent, use the repository branch-action phase so repository rows display their repository-wide busy state.

- [ ] **Step 3: Compose both actions without pulling in unrelated branch features**

Implement `useRepositoryCreationActions` by calling the two focused hooks and returning:

```ts
return {
  items: [trackRemoteBranch.item, createWorktree.item],
  dialogs: (
    <>
      {trackRemoteBranch.dialog}
      {createWorktree.dialog}
    </>
  ),
}
```

The hook accepts an optional repository projection so restored/missing rows can render disabled actions safely. It must not call terminal, merge, tag, editor, or external-application hooks.

- [ ] **Step 4: Migrate existing branch actions to the focused hooks**

In `useBranchWriteActions`, insert `trackRemoteBranch.item` immediately after `createBranch` and render `trackRemoteBranch.dialog` with the other write dialogs. Remove the old duplicated state, handler, imports, and item.

In `useBranchActionItems`, use `useCreateWorktreeAction(repo, { defaultBranch: branch.name, busyTargetBranch: branch.name, forceDisabled: blocked })`, place its item in the original `createWorktree` position, and render its dialog in the original dialog group. Remove the moved connector and bootstrap imports. Passing the existing `blocked` state preserves disabled behavior while another local branch action is pending.

- [ ] **Step 5: Add the creation group to standalone Git project menus**

In `SortableProjectRow`, select `state.repos[project.id]`, call `useRepositoryCreationActions(repo, { forceDisabled: project.unavailable })`, and prepend `project.isGitRepo ? creation.items : []` to the existing menu groups:

```tsx
groups={[
  project.isGitRepo ? creation.items : [],
  [tmuxTerminalAction, externalTerminalAction],
  [closeAction],
  ...(tmuxCleanup.visible ? [[tmuxCleanup.action]] : []),
]}
```

Render `creation.dialogs` beside the row only for a Git project. Do not add the actions to `WorkspaceItemContextMenu.additionalActions`.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```text
bun run test src/web/components/repo-workspace/SidebarProjectList.test.tsx src/web/hooks/useBranchActionItems.test.tsx
```

Expected: both files PASS, including the existing selected-branch worktree, bootstrap-source, tracking-branch, ordering, and busy-state tests.

---

### Task 3: Add the shared creation group to workspace repository menus

**Files:**

- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryList.test.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryList.tsx`

**Interfaces:**

- Consumes: `useRepositoryCreationActions` from Task 2 and the existing `WorkspaceRepositoryListItem.unavailable` projection.
- Produces: identical creation entry points for each workspace repository row without changing activation, reordering, terminal actions, or right-click context menus.

- [ ] **Step 1: Write the failing workspace repository menu test**

Seed `/workspace/api` as an available Git repository with current branch `main` and at least one remote. Update the stable-position expectation to:

```ts
expect(menuItems.map((entry) => entry.textContent?.trim())).toEqual([
  'action.pull-remote-branch',
  'action.create-worktree',
  'terminal.new-with-tmux',
  'terminal.external',
])
```

Assert both creation actions are disabled for the unavailable `/workspace/web` row. Select each available creation action and assert the existing dialog opens without calling `onActivate`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```text
bun run test src/web/components/repo-workspace/WorkspaceRepositoryList.test.tsx
```

Expected: FAIL because workspace repository menus still contain only terminal actions.

- [ ] **Step 3: Add the creation group**

In `SortableWorkspaceRepositoryRow`, select `state.repos[repository.id]`, call:

```ts
const creation = useRepositoryCreationActions(repo, { forceDisabled: repository.unavailable })
```

Use `repository.unavailable` as the forced-disabled input; the list-level `disabled` prop controls drag reordering only and must not disable repository operations. Prepend `creation.items` to the existing `WorkspaceListItemMenu` groups and render `creation.dialogs` beside the row. Preserve the existing context-menu props exactly.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```text
bun run test src/web/components/repo-workspace/WorkspaceRepositoryList.test.tsx
```

Expected: PASS with the creation group first, unavailable actions disabled, and no row activation.

---

### Task 4: Refactor, review, and verify the complete change

**Files:**

- Review: `src/web/hooks/useRepositoryCreationActions.tsx`
- Review: `src/web/hooks/useBranchWriteActions.tsx`
- Review: `src/web/hooks/useBranchActionItems.tsx`
- Review: `src/web/components/repo-workspace/SidebarProjectList.tsx`
- Review: `src/web/components/repo-workspace/WorkspaceRepositoryList.tsx`
- Review: all modified tests and design/plan documents.

**Interfaces:**

- Consumes: the completed renderer-only implementation.
- Produces: a verified change set with no duplicated creation orchestration, no backend changes, and no architecture violations.

- [ ] **Step 1: Run formatting on modified source and test files**

Run:

```text
bunx prettier --write "src/web/hooks/useRepositoryCreationActions.tsx" "src/web/hooks/useBranchWriteActions.tsx" "src/web/hooks/useBranchActionItems.tsx" "src/web/components/repo-workspace/SidebarProjectList.tsx" "src/web/components/repo-workspace/SidebarProjectList.test.tsx" "src/web/components/repo-workspace/WorkspaceRepositoryList.tsx" "src/web/components/repo-workspace/WorkspaceRepositoryList.test.tsx" "docs/superpowers/specs/2026-07-30-repository-menu-creation-actions-design.md" "docs/superpowers/plans/2026-07-30-repository-menu-creation-actions.md"
```

Expected: Prettier reports only these explicit files. Inspect the diff afterward to ensure formatting did not touch unrelated files.

- [ ] **Step 2: Run the focused renderer regression set**

Run:

```text
bun run test src/web/components/repo-workspace/SidebarProjectList.test.tsx src/web/components/repo-workspace/WorkspaceRepositoryList.test.tsx src/web/hooks/useBranchActionItems.test.tsx src/web/components/CreateWorktreeDialog.test.tsx src/web/components/branch-list/BranchWriteDialogs.test.tsx
```

Expected: all selected test files PASS.

- [ ] **Step 3: Run type checking**

Run:

```text
bun run typecheck
```

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 4: Run the full test suite**

Run:

```text
bun run test
```

Expected: all test files and tests PASS. Known dependency sourcemap and jsdom capability notices may remain, but there must be no failed tests.

- [ ] **Step 5: Run the architecture guard**

Run:

```text
bun run check:architecture
```

Expected: exit code 0 with all Electron/server/web/shared import boundaries green.

- [ ] **Step 6: Review the final diff and requirement checklist**

Confirm from `git diff --check`, `git diff --stat`, and the full diff that:

- Both eligible `…` menus contain the two requested actions.
- Plain project and right-click menu behavior did not change.
- The generic worktree dialog still exposes all four modes.
- Existing branch-row behavior uses the shared action ownership without copy drift.
- No server, system Git, dependency, package, or translation files changed.
- No privacy-sensitive fixtures were introduced.
