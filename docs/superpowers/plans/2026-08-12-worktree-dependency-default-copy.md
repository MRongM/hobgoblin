# Worktree Dependency Default Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every newly checked worktree dependency default to copy in both ordinary Git worktree creation and branch-workspace repository member creation, while preserving explicit symlink selection.

**Architecture:** Change the default once in the shared renderer selection model used by `WorktreeDependencyTree`. Keep the controlled component, request contract, and server materialization unchanged; prove the behavior through the focused model and component tests before running repository-wide quality gates.

**Tech Stack:** TypeScript in Node.js strip-only mode, React, Vitest, Bun.

## Global Constraints

- A newly checked worktree dependency selection uses `mode: 'copy'`.
- Explicit mode changes between `copy` and `symlink` remain supported.
- Unchecking and rechecking creates a new selection and therefore defaults to `copy` again.
- Ordinary Git worktree creation and branch-workspace repository member creation keep sharing the same behavior.
- Do not change server protocols, materialization logic, persistence, source selection, or UI copy.
- Do not add packages or unsupported TypeScript syntax.
- Do not create a Git commit unless the user explicitly requests one.

---

### Task 1: Change the shared worktree dependency default

**Files:**
- Modify: `src/web/components/worktree-dependency-tree-selection.test.ts`
- Modify: `src/web/components/WorktreeDependencyTree.test.tsx`
- Modify: `src/web/components/CreateWorktreeDialog.test.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx`
- Modify: `src/web/components/worktree-dependency-tree-selection.ts`

**Interfaces:**
- Consumes: `selectWorktreeDependency(selections, path, selected)` from the existing renderer selection model.
- Produces: a new `WorktreeBootstrapSelection` with `{ path, mode: 'copy' }` whenever a previously unselected path is checked.
- Guarantees: `setWorktreeDependencyMode()` continues to preserve explicit `copy | symlink` changes; ancestor and descendant rules are unchanged.

- [x] **Step 1: Write the failing model and component expectations**

In `src/web/components/worktree-dependency-tree-selection.test.ts`, replace the default test and update the newly created ancestor expectation:

```ts
test('selects new paths as copies by default', () => {
  expect(selectWorktreeDependency([], 'backend/.venv', true)).toEqual([
    { path: 'backend/.venv', mode: 'copy' },
  ])
})
```

```ts
expect(
  selectWorktreeDependency(
    [
      { path: 'backend/.venv/bin', mode: 'copy' },
      { path: 'frontend/node_modules', mode: 'symlink' },
    ],
    'backend/.venv',
    true,
  ),
).toEqual([
  { path: 'frontend/node_modules', mode: 'symlink' },
  { path: 'backend/.venv', mode: 'copy' },
])
```

In `src/web/components/WorktreeDependencyTree.test.tsx`, make the interaction assertions prove both the default and the retained explicit switch:

```ts
click(dependencyCheckbox('backend/.venv')!)
expect(selectedPaths()).toEqual([{ path: 'backend/.venv', mode: 'copy' }])
changeSelect(modeSelect('backend/.venv'), 'symlink')
expect(selectedPaths()).toEqual([{ path: 'backend/.venv', mode: 'symlink' }])

click(dependencyCheckbox('backend')!)
expect(selectedPaths()).toEqual([{ path: 'backend', mode: 'copy' }])
expect(dependencyCheckbox('backend/.venv')?.disabled).toBe(true)
```

In `src/web/components/CreateWorktreeDialog.test.tsx`, remove the redundant explicit change to `copy`, rename the nested-dependency submission test to state that it verifies the default copy mode, and keep its submitted selection expectation as:

```ts
selections: [{ path: 'backend/.venv', mode: 'copy' }],
```

Remove the now-unused `changeNativeSelect()` test helper. In `src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx`, rename the selected-base-worktree submission test to state that it verifies the default copy mode and update its request expectation to:

```ts
selections: [{ path: 'node_modules', mode: 'copy' }],
```

- [x] **Step 2: Run the focused tests and verify RED**

Run:

```bash
bun run test src/web/components/worktree-dependency-tree-selection.test.ts src/web/components/WorktreeDependencyTree.test.tsx src/web/components/CreateWorktreeDialog.test.tsx src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx
```

Expected: FAIL because the current shared model returns `mode: 'symlink'` for newly selected paths, while the new expectations require `mode: 'copy'`.

- [x] **Step 3: Implement the minimal shared default change**

In `src/web/components/worktree-dependency-tree-selection.ts`, change only the new-selection literal:

```ts
return [
  ...selections.filter((selection) => !isWorktreeDependencyDescendant(selection.path, path)),
  { path, mode: 'copy' },
]
```

- [x] **Step 4: Run the focused tests and verify GREEN**

Run:

```bash
bun run test src/web/components/worktree-dependency-tree-selection.test.ts src/web/components/WorktreeDependencyTree.test.tsx src/web/components/CreateWorktreeDialog.test.tsx src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx
```

Expected: all four test files pass, including default-copy behavior in both creation entry points, ancestor replacement, and explicit switch-to-symlink coverage.

- [x] **Step 5: Run repository verification**

Run:

```bash
bun run typecheck
bun run test
bun run check:architecture
git diff --check
```

Expected: every command exits with status 0; the full Vitest suite has no failing tests; architecture boundaries remain green; the diff has no whitespace errors.

- [x] **Step 6: Review the final diff without committing**

Run:

```bash
git diff -- src/web/components/worktree-dependency-tree-selection.ts src/web/components/worktree-dependency-tree-selection.test.ts src/web/components/WorktreeDependencyTree.test.tsx src/web/components/CreateWorktreeDialog.test.tsx src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx docs/superpowers/specs/2026-08-12-worktree-dependency-default-copy-design.md docs/superpowers/plans/2026-08-12-worktree-dependency-default-copy.md
git status --short
```

Expected: the source change is limited to the shared default; tests cover the requested behavior; the design and plan documents are the only new files; no commit is created.
