# Branch Workspace Repository Dependency Source Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fall back from an empty selected base-branch dependency source to the repository primary worktree, identify the active source, and allow another non-base worktree source to be selected.

**Architecture:** Keep source choice and request lifecycle as local `BranchWorkspaceDialog` state. Derive eligible sources with a pure renderer model helper, send the exact selected source path in the existing bootstrap decision, and let the server plan builder validate that path against the authoritative repository snapshot before validating candidates.

**Tech Stack:** TypeScript 6 strip-only mode, React 19, Vitest, existing repository HTTP client and branch-workspace planning modules.

## Global Constraints

- Do not read, generate, or restore `goblin.toml` behavior.
- Do not persist or synchronize repository dependency source selection.
- Do not merge candidates from multiple source worktrees.
- Do not fall back after a source read error; fall back only after a successful empty result.
- Source alternatives exclude the selected base branch and duplicate worktree paths.
- Use repo-alias imports with explicit `.ts` / `.tsx` extensions.
- Do not use TypeScript enums, runtime namespaces, parameter properties, or import aliases.
- Add no package dependencies.
- Do not create a Git branch, commit, push, merge, or remove a worktree.

---

### Task 1: Model eligible repository dependency sources

**Files:**

- Create: `src/web/components/repo-workspace/branch-workspace-repository-dependency-source.ts`
- Create: `src/web/components/repo-workspace/branch-workspace-repository-dependency-source.test.ts`

**Interfaces:**

- Consumes: `primaryWorktreePath`, `sourceWorktreeByBranch`, and selected `baseBranch` from `BranchWorkspaceRepositoryOption`.
- Produces: `repositoryDependencySources(input): RepositoryDependencySourceSet` with `initial`, `primary`, and deduplicated `alternatives`.

- [ ] **Step 1: Write failing pure-model tests**

Cover these exact cases:

```ts
expect(
  repositoryDependencySources({
    baseBranch: 'develop',
    primaryWorktreePath: '/repo',
    sourceWorktreeByBranch: {
      main: '/repo',
      develop: '/repo-develop',
      feature: '/repo-feature',
    },
  }),
).toEqual({
  initial: { id: 'branch:develop', kind: 'branch', branch: 'develop', worktreePath: '/repo-develop' },
  primary: { id: 'primary', kind: 'primary' },
  alternatives: [
    { id: 'primary', kind: 'primary' },
    { id: 'branch:feature', kind: 'branch', branch: 'feature', worktreePath: '/repo-feature' },
  ],
})
```

Also assert that a base branch without a worktree starts at `primary`, and that a branch path equal to `primaryWorktreePath` is not emitted as a duplicate alternative.

- [ ] **Step 2: Run the model test and verify RED**

Run:

```sh
bun run test -- src/web/components/repo-workspace/branch-workspace-repository-dependency-source.test.ts
```

Expected: failure because the module does not exist.

- [ ] **Step 3: Implement the minimal source model**

Use this public shape:

```ts
export type RepositoryDependencySource =
  | { id: 'primary'; kind: 'primary' }
  | { id: `branch:${string}`; kind: 'branch'; branch: string; worktreePath: string }

export interface RepositoryDependencySourceSet {
  initial: RepositoryDependencySource
  primary: Extract<RepositoryDependencySource, { kind: 'primary' }>
  alternatives: RepositoryDependencySource[]
}

export function repositoryDependencySources(input: {
  baseBranch: string
  primaryWorktreePath?: string
  sourceWorktreeByBranch?: Readonly<Record<string, string>>
}): RepositoryDependencySourceSet
```

Build alternatives in primary-first, branch-order order. Exclude `baseBranch`; use `primaryWorktreePath` only to deduplicate branch paths that represent the primary worktree.

- [ ] **Step 4: Run the model test and verify GREEN**

Run the command from Step 2. Expected: all tests in the file pass.

---

### Task 2: Add fallback and source selection to the dialog

**Files:**

- Modify: `src/web/components/repo-workspace/BranchWorkspaceDialog.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/shared/i18n/dictionaries.test.ts`

**Interfaces:**

- Consumes: `repositoryDependencySources` from Task 1 and existing `getRepositoryWorktreeBootstrapPreflight`.
- Produces: a `worktreeBootstrap` decision whose `sourceWorktreePath` is present for a branch worktree and absent for the primary worktree.

- [ ] **Step 1: Write failing dialog tests for primary fallback**

Mock the selected base source to return an empty candidate list and the following primary-source request to return `node_modules`. Assert two calls in order:

```ts
expect(mocks.getRepositoryWorktreeBootstrapPreflight.mock.calls).toEqual([
  ['/workspace/api', expect.any(AbortSignal), 'all-untracked', '/workspace/api-develop'],
  ['/workspace/api', expect.any(AbortSignal), 'all-untracked', undefined],
])
```

Assert that the dialog renders `workspace.branch-workspace.repository-dependencies-source-primary` and the primary candidates.

- [ ] **Step 2: Write failing dialog tests for alternatives and submission**

Assert that:

- the source selector excludes the selected base branch;
- it offers other existing branch worktrees without duplicating the primary worktree;
- selecting another source clears prior candidate choices and loads its path;
- preview submits the selected alternative path:

```ts
worktreeBootstrap: {
  kind: 'materialize',
  candidateScope: 'all-untracked',
  selections: [{ path: '.env', mode: 'copy' }],
  sourceWorktreePath: '/workspace/api-feature',
}
```

- [ ] **Step 3: Run the dialog tests and verify RED**

Run:

```sh
bun run test -- src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx
```

Expected: assertions fail because fallback, source copy, and source selection are absent.

- [ ] **Step 4: Extend dialog-local bootstrap state and loading**

Change the ready state to carry the active source and whether source alternatives are enabled:

```ts
type RepositoryBootstrapState =
  | { status: 'loading' }
  | {
      status: 'ready'
      preflight: WorktreeBootstrapPreflight
      source: RepositoryDependencySource
      sourceAlternatives: RepositoryDependencySource[]
      sourceSelectionEnabled: boolean
    }
  | { status: 'error' }
```

On an initial load, request the selected base source. If it succeeds empty and differs from primary, request primary. A source read failure sets `error` without fallback. An explicit alternative request never recursively falls back.

- [ ] **Step 5: Render source status and alternative selector**

Add sentence-case localized copy for:

```text
workspace.branch-workspace.repository-dependencies-source-primary
workspace.branch-workspace.repository-dependencies-source-branch
workspace.branch-workspace.repository-dependencies-source-select
workspace.branch-workspace.repository-dependencies-source-primary-option
```

Render the active source status above the existing candidate list. Render an action selector only when source selection is enabled and another eligible source exists. Keep raw branch names unchanged.

- [ ] **Step 6: Submit the active source with selected candidates**

When `state.source.kind === 'branch'`, include `sourceWorktreePath: state.source.worktreePath`. Omit the field for `primary` so the existing API continues to represent the repository primary worktree without encoding local/remote path details in the renderer request.

- [ ] **Step 7: Supply primary-worktree identity from the repository projection**

Add `primaryWorktreePath?: string` to `BranchWorkspaceRepositoryOption`. In `WorkspaceRepositoryRail`, derive it from `repo.data.worktreesByPath` where `isMain === true`. Update the rail test to verify the dialog receives the path.

- [ ] **Step 8: Run focused renderer tests and verify GREEN**

Run:

```sh
bun run test -- src/web/components/repo-workspace/branch-workspace-repository-dependency-source.test.ts src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx src/shared/i18n/dictionaries.test.ts
```

Expected: all focused renderer tests pass.

---

### Task 3: Validate the selected source in the server plan

**Files:**

- Modify: `src/server/modules/branch-workspace-plan.ts`
- Modify: `src/server/modules/branch-workspace-plan.test.ts`

**Interfaces:**

- Consumes: `WorktreeBootstrapDecision.sourceWorktreePath` and the authoritative `RepoSnapshot`.
- Produces: a plan whose `worktreeBootstrap.sourceWorktreePath` matches the validated source, or `error.invalid-arguments` for an unknown source.

- [ ] **Step 1: Write a failing test for a known alternative source**

Build a snapshot with `main` at the repository primary path, `develop` at `/workspace/api-develop`, and `feature/source` at `/workspace/api-feature`. Request `sourceWorktreePath: '/workspace/api-feature'`. Assert that preflight receives `/workspace/api-feature` and the resulting plan preserves it.

- [ ] **Step 2: Write a failing test for an unknown source**

Request `sourceWorktreePath: '/outside/not-a-repository-worktree'`. Assert:

```ts
expect(result).toEqual({ ok: false, message: 'error.invalid-arguments' })
expect(deps.getBootstrapPreflight).not.toHaveBeenCalled()
```

- [ ] **Step 3: Run the plan tests and verify RED**

Run:

```sh
bun run test -- src/server/modules/branch-workspace-plan.test.ts
```

Expected: the alternative-source test shows preflight still uses the base source, and the unknown source is not rejected.

- [ ] **Step 4: Resolve and validate the authoritative source**

Before bootstrap preflight:

```ts
const requestedSourceWorktreePath = decision.kind === 'materialize' ? decision.sourceWorktreePath : undefined
const knownSourceWorktreePaths = [
  workspaceRepositoryPath(repoId),
  ...snapshot.branches.flatMap((candidate) => (candidate.worktree?.path ? [candidate.worktree.path] : [])),
].filter((candidate): candidate is string => !!candidate)
```

Reject an explicit requested path unless it matches a known path under `sameHostPath`. Use the validated explicit source for preflight; otherwise use the base-branch worktree for an unselected/skip decision and the repository primary worktree for a materialize decision without a source path.

- [ ] **Step 5: Preserve the validated source in the plan**

For a branch-worktree source, copy the normalized known path into `worktreeBootstrap.sourceWorktreePath`. For primary-source materialization, omit the field so `RepoBackend.createWorktree` uses its primary repository target.

- [ ] **Step 6: Run the plan tests and verify GREEN**

Run the command from Step 3. Expected: all branch-workspace plan tests pass.

---

### Task 4: Documentation and full verification

**Files:**

- Modify: `CONTEXT.md`
- Create: `docs/superpowers/specs/2026-07-29-branch-workspace-repository-dependency-source-fallback-design.md`

- [ ] **Step 1: Confirm domain documentation**

Verify `Worktree bootstrap source` states empty-source primary fallback, explicit alternative selection, exclusion of the selected branch, and source stability through execution.

- [ ] **Step 2: Run formatting checks on touched files**

Run the repository formatter for the exact touched TypeScript, Markdown, and dictionary files. Review the diff to ensure unrelated user changes are preserved.

- [ ] **Step 3: Run complete verification**

Run:

```sh
bun run typecheck
bun run check:architecture
bun run test
```

Expected: all commands exit 0; Vitest reports no failing files or tests.

- [ ] **Step 4: Review the final working-tree diff**

Confirm that the change contains no persistence, realtime, package, branch, or Git-operation additions and that all unresolved product questions are listed in the final handoff.
