# Create Worktree Dependency Source Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add selectable worktree-bootstrap sources, primary-worktree fallback, and source provenance to the single-repository create-worktree dialog.

**Architecture:** Keep transport and request cancellation in `CreateWorktreeDialogConnected`, keep form state in `CreateWorktreeDialog`, reuse the existing pure repository dependency source model, and share one presentational source picker with the branch-workspace dialog. Submit the active branch source through the existing `WorktreeBootstrapDecision.sourceWorktreePath` contract.

**Tech Stack:** TypeScript 6 strip-only mode, React 19, Zustand, Vitest, existing repository HTTP/RPC client, existing worktree-bootstrap candidate and materialization modules.

## Global Constraints

- Source state remains renderer-local for one open dialog; do not persist or synchronize it.
- Fall back only after a successful empty read, never after an error.
- Exclude the source context branch and duplicate worktree paths from source options.
- Clear candidate choices whenever the active source changes.
- Omit `sourceWorktreePath` for the primary worktree; preserve the exact path for another branch worktree.
- Use repo-alias imports with explicit `.ts` / `.tsx` extensions.
- Do not use TypeScript enums, runtime namespaces, parameter properties, or import aliases.
- Add no package dependencies.
- Do not create a Git branch, commit, push, merge, or remove a worktree.

---

### Task 1: Extract the shared source picker

**Files:**

- Create: `src/web/components/WorktreeBootstrapSourcePicker.tsx`
- Create: `src/web/components/WorktreeBootstrapSourcePicker.test.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceDialog.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/shared/i18n/dictionaries.test.ts`

**Interfaces:**

- Consumes: `RepositoryDependencySource`, eligible source options, pending state, and a source-selection callback.
- Produces: `WorktreeBootstrapSourcePicker` with shared provenance copy and an action-style source selector.

- [ ] **Step 1: Write failing component tests**

Assert that a primary source renders the generic primary-source key, a branch source renders its raw branch name, the current source is omitted from the action options, and selecting an alternative invokes `onSourceChange` with that source.

- [ ] **Step 2: Run the component test and verify RED**

Run:

```sh
bun run test -- src/web/components/WorktreeBootstrapSourcePicker.test.tsx
```

Expected: failure because `WorktreeBootstrapSourcePicker.tsx` does not exist.

- [ ] **Step 3: Implement the minimal picker and generic translations**

Use this public contract:

```ts
interface WorktreeBootstrapSourcePickerProps {
  source: RepositoryDependencySource
  options: readonly RepositoryDependencySource[]
  pending?: boolean
  onSourceChange: (source: RepositoryDependencySource) => void
}
```

Use generic `worktree-bootstrap.source-*` translation keys, and replace the branch-workspace dialog's inline source panel with the shared component.

- [ ] **Step 4: Run picker, branch-workspace, and dictionary tests and verify GREEN**

Run:

```sh
bun run test -- src/web/components/WorktreeBootstrapSourcePicker.test.tsx src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx src/shared/i18n/dictionaries.test.ts
```

Expected: all selected tests pass.

---

### Task 2: Make create-worktree submissions source-aware

**Files:**

- Modify: `src/web/components/CreateWorktreeDialog.tsx`
- Modify: `src/web/components/CreateWorktreeDialog.test.tsx`

**Interfaces:**

- Consumes: ready bootstrap source/options from the connected wrapper and `onBootstrapContextBranchChange` / `onBootstrapSourceChange` callbacks.
- Produces: `CreateWorktreeRequest.sourceWorktreePath?: string` fixed to the candidates shown at submission time.

- [ ] **Step 1: Write failing dialog tests**

Cover these exact behaviors:

- changing the `newBranch` base reports that branch as the source context;
- changing `existingBranch` reports the selected local branch;
- switching to remote/detached reports the dialog's originating branch context;
- a bootstrap source change clears candidate choices;
- selecting a dependency from a branch source submits `sourceWorktreePath`, while primary-source submission omits it.

- [ ] **Step 2: Run the dialog test and verify RED**

Run:

```sh
bun run test -- src/web/components/CreateWorktreeDialog.test.tsx
```

Expected: assertions fail because the dialog has no source callbacks, picker, or source-path request field.

- [ ] **Step 3: Implement source-context notification and submission**

Extend `WorktreeBootstrapPromptState` with the active source and options. Render `WorktreeBootstrapSourcePicker` above the candidate list. Notify the connected wrapper when the mode-derived source context changes, reset choices when the active source id changes, and include a branch source path in `CreateWorktreeRequest` only when selections exist.

- [ ] **Step 4: Run the dialog test and verify GREEN**

Run the command from Step 2. Expected: all dialog tests pass.

---

### Task 3: Add fallback and source loading to the connected wrapper

**Files:**

- Modify: `src/web/hooks/useBranchActionItems.tsx`
- Modify: `src/web/hooks/useBranchActionItems.test.tsx`

**Interfaces:**

- Consumes: repository branches/worktree projection, `repositoryDependencySources`, and `getRepositoryWorktreeBootstrapPreflight`.
- Produces: cancellable bootstrap state for the dialog and a `WorktreeBootstrapDecision` carrying the exact selected branch worktree source.

- [ ] **Step 1: Write failing connected-hook tests**

Add tests that assert:

```ts
expect(repoClientMocks.getRepositoryWorktreeBootstrapPreflight.mock.calls).toEqual([
  ['/tmp/repo', expect.any(AbortSignal), undefined, '/tmp/repo-base'],
  ['/tmp/repo', expect.any(AbortSignal), undefined, undefined],
])
```

for an empty base source followed by primary candidates. Also assert the source status is primary, the source selector excludes `feature/base`, selecting `feature/other` loads `/tmp/repo-other`, and submission preserves `/tmp/repo-other`.

- [ ] **Step 2: Run the hook test and verify RED**

Run:

```sh
bun run test -- src/web/hooks/useBranchActionItems.test.tsx
```

Expected: failures because the connected wrapper performs one fixed-source preflight and exposes no source selection.

- [ ] **Step 3: Implement cancellable source resolution**

Track source-context branch and explicitly requested source locally. Derive `primaryWorktreePath` from `worktreesByPath[...].isMain`, and derive branch paths from `repo.data.branches`. On each context/source change, abort the previous request, clear visible preflight, read the selected source, and fall back to primary only after a successful empty initial branch result.

- [ ] **Step 4: Build and submit an exact source decision**

Use `request.sourceWorktreePath` rather than a separately derived branch path when building the materialize decision. Keep `{ kind: 'skip' }` when no candidates are selected.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```sh
bun run test -- src/web/hooks/useBranchActionItems.test.tsx src/web/components/CreateWorktreeDialog.test.tsx src/web/components/WorktreeBootstrapSourcePicker.test.tsx src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx src/shared/i18n/dictionaries.test.ts
```

Expected: all focused tests pass.

---

### Task 4: Verify the complete repository

**Files:**

- Verify only; format the files modified by Tasks 1–3.

**Interfaces:**

- Consumes: all implementation changes.
- Produces: verified renderer behavior without architecture or type regressions.

- [ ] **Step 1: Format touched files**

Run Prettier only for the files changed by this plan.

- [ ] **Step 2: Run static checks**

```sh
bun run typecheck
bun run check:architecture
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 3: Run the full test suite**

```sh
bun run test
```

Expected: all Vitest test files and tests pass.
