# Branch Workspace Repair Usability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in the current session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep drifted branch workspaces usable, reduce read/repair-plan latency, and display a short commit hash after each resolved member worktree name.

**Architecture:** Preserve the server-owned branch-workspace read and repair-plan boundaries. Make both paths request only the repository structure they consume, parallelize pure repair inspections, and split renderer policy into root usability versus complete-workspace readiness. Reuse one renderer hash formatter for ordinary branches and member worktrees.

**Tech Stack:** TypeScript 6 strip-only mode, React 19, TanStack Query, Vitest, Bun.

## Global Constraints

- Use repo-alias imports with explicit `.ts`/`.tsx` extensions.
- Do not add enums, runtime namespaces, parameter properties, or TypeScript import aliases.
- Do not add packages or realtime state.
- Preserve server ownership of branch-workspace truth and existing plan-token execution revalidation.
- Keep creation-interrupted, reduce-incomplete, and delete-incomplete lifecycle restrictions unchanged.
- Do not run `git commit`, create branches, or push changes.

---

### Task 1: Make branch-workspace reads member-scoped and lightweight

**Files:**

- Modify: `src/server/modules/branch-workspace-read.ts`
- Test: `src/server/modules/branch-workspace-read.test.ts`

**Interfaces:**

- Consumes: `getRepositorySnapshot(cwd, signal, options)` and persisted `BranchWorkspaceManifest.repositories`.
- Produces: the unchanged `readBranchWorkspaceSnapshot(rootId, signal, dependencies)` contract.

- [x] **Step 1: Write the failing read-scope test**

Add tests proving that two manifests sharing `api` trigger one snapshot, that unused configured repository `web` and an unconfigured stale manifest reference are not read, and that the snapshot receives lightweight options:

```ts
test('reads only referenced repositories once with lightweight snapshot options', async () => {
  const manifests = [manifest('feature/first'), manifest('feature/second')]
  const deps = dependencies(manifests)

  const result = await readBranchWorkspaceSnapshot(ROOT, undefined, deps)

  expect(result.ok).toBe(true)
  expect(deps.readRepositorySnapshot).toHaveBeenCalledTimes(1)
  expect(deps.readRepositorySnapshot).toHaveBeenCalledWith(path.join(ROOT, 'api'), undefined, {
    includeWorktreeStatus: false,
    includeRemote: false,
  })
})
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
bun run test -- src/server/modules/branch-workspace-read.test.ts
```

Expected: FAIL because the current cache starts snapshots for both configured repositories and supplies no options.

- [x] **Step 3: Restrict and lighten repository snapshot creation**

After manifests are available, derive unique referenced names in first-seen order and pass them to `repositorySnapshotCache`:

```ts
const manifests = manifestSnapshot.kind === 'ready' ? manifestSnapshot.manifests : []
const repositoryNames = new Set(configSnapshot.config.repo)
const referencedRepositoryNames = Array.from(
  new Set(
    manifests.flatMap((manifest) =>
      manifest.repositories
        .map((member) => member.repositoryName)
        .filter((repositoryName) => repositoryNames.has(repositoryName)),
    ),
  ),
)
const repositorySnapshots = repositorySnapshotCache(
  rootId,
  referencedRepositoryNames,
  dependencies.readRepositorySnapshot ?? getRepositorySnapshot,
  signal,
)
```

Construct this promise cache before awaiting `listBranchWorkspaceAuxiliaryCandidates`, so filesystem candidate discovery and Git structure reads overlap without changing either result.

Inside `repositorySnapshotCache`, call:

```ts
readRepositorySnapshot(repoId, signal, {
  includeWorktreeStatus: false,
  includeRemote: false,
})
```

Keep the existing promise map so the same repository snapshot is shared across branch workspaces.

- [x] **Step 4: Run the focused read tests and verify GREEN**

Run:

```bash
bun run test -- src/server/modules/branch-workspace-read.test.ts
```

Expected: PASS.

---

### Task 2: Parallelize lightweight repair planning

**Files:**

- Modify: `src/server/modules/branch-workspace-plan.ts`
- Test: `src/server/modules/branch-workspace-plan.test.ts`

**Interfaces:**

- Consumes: `planRepairRepository`, `planRepairAuxiliary`, and `RepoSnapshotOptions`.
- Produces: the unchanged `BranchWorkspacePlanResult` and deterministic manifest-order plan arrays.

- [x] **Step 1: Write failing repair snapshot and concurrency tests**

Extend a repair manifest to contain `api` and `web`. Use active-call counters like the existing create-planner concurrency test, then assert both maximum concurrency and options:

```ts
expect(maxActiveSnapshots).toBe(2)
expect(deps.getSnapshot).toHaveBeenCalledWith(path.join(ROOT, 'api'), undefined, {
  includeWorktreeStatus: false,
  includeRemote: false,
})
expect(deps.getSnapshot).toHaveBeenCalledWith(path.join(ROOT, 'web'), undefined, {
  includeWorktreeStatus: false,
  includeRemote: false,
})
expect(result.ok && result.plan.repositories.map((repository) => repository.repositoryName)).toEqual(['api', 'web'])
```

Use deferred or short timer promises so the test proves the second snapshot begins before the first resolves.

- [x] **Step 2: Run the focused repair-planner tests and verify RED**

Run:

```bash
bun run test -- src/server/modules/branch-workspace-plan.test.ts
```

Expected: FAIL because repair repositories are currently inspected serially and use the default full snapshot.

- [x] **Step 3: Request lightweight repair snapshots**

Change `planRepairRepository` to call:

```ts
const snapshot = await (dependencies.getSnapshot ?? getRepositorySnapshot)(repoId, signal, {
  includeWorktreeStatus: false,
  includeRemote: false,
}).catch(() => null)
```

No repair decision consumes worktree dirtiness or remote data.

- [x] **Step 4: Parallelize member and auxiliary inspection without changing result order**

Replace sequential accumulation with two `Promise.allSettled` groups, start both groups before awaiting them, then fold results in array order so repository errors retain precedence over auxiliary errors and later rejected checks cannot mask earlier structured failures:

```ts
const repositoryChecks = Promise.allSettled(
  manifest.repositories.map(async (member) => {
    signal?.throwIfAborted()
    if (!configuredRepositories.includes(member.repositoryName)) {
      return { ok: false as const, message: 'workspace.branch-workspace.repository-unavailable' }
    }
    return await planRepairRepository(manifest, member, dependencies, signal)
  }),
)
const auxiliaryChecks = Promise.allSettled(
  manifest.auxiliaryEntries.map(async (entry) => {
    signal?.throwIfAborted()
    return await planRepairAuxiliary(manifest, entry, dependencies, signal)
  }),
)
const [plannedRepositories, plannedAuxiliaryEntries] = await Promise.all([repositoryChecks, auxiliaryChecks])

const repositories: BranchWorkspaceRepositoryPlan[] = []
for (const settled of plannedRepositories) {
  if (settled.status === 'rejected') throw settled.reason
  const planned = settled.value
  if (!planned.ok) return planned
  repositories.push(planned.repository)
}
const auxiliaryEntries: BranchWorkspaceAuxiliaryPlan[] = []
for (const settled of plannedAuxiliaryEntries) {
  if (settled.status === 'rejected') throw settled.reason
  const planned = settled.value
  if (!planned.ok) return planned
  auxiliaryEntries.push(planned.entry)
}
```

- [x] **Step 5: Run focused planner tests and verify GREEN**

Run:

```bash
bun run test -- src/server/modules/branch-workspace-plan.test.ts
```

Expected: PASS.

---

### Task 3: Make ordinary drift a weak, usable renderer state

**Files:**

- Modify: `src/web/components/repo-workspace/BranchWorkspaceList.tsx`
- Test: `src/web/components/repo-workspace/BranchWorkspaceList.test.tsx`

**Interfaces:**

- Consumes: existing `BranchWorkspaceSnapshot.state`, `available`, and per-member `presentation.navigable`.
- Produces: renderer-only action policy; no shared/API type changes.

- [x] **Step 1: Write failing drift usability tests**

Add a test for an available `needs-repair` item asserting:

```ts
expect(row.querySelector<HTMLButtonElement>('[data-workspace-list-item-action="editor"]')?.disabled).toBe(false)
expect(row.querySelector<HTMLButtonElement>('[data-workspace-list-item-action="terminal"]')?.disabled).toBe(false)
expect(row.querySelector('[data-workspace-list-item-drag-handle]')).not.toBeNull()
expect(row.querySelector('[data-testid="branch-workspace-state-summary"]')?.className).toContain(
  'text-muted-foreground',
)
```

Also assert that batch Git, membership, and dependency actions are absent, while inspect, repair, and delete remain available. Keep parameterized coverage proving creation/reduce/delete incomplete states retain disabled root-open actions.

- [x] **Step 2: Run the focused list tests and verify RED**

Run:

```bash
bun run test -- src/web/components/repo-workspace/BranchWorkspaceList.test.tsx
```

Expected: FAIL because all non-ready states currently suppress the root action dock and drag handle, and use warning text.

- [x] **Step 3: Separate root usability from complete readiness**

Add a narrow predicate and derive two policies:

```ts
function isRepairableDrift(item: BranchWorkspaceSnapshot): boolean {
  return item.state.kind === 'needs-action' && item.state.action === 'repair' && item.state.reason === 'drift'
}

const busy = item.activeOperation !== undefined
const completeReady = item.state.kind === 'ready' && !busy
const rootUsable = (item.state.kind === 'ready' || isRepairableDrift(item)) && !busy
```

Use `rootUsable` for sorting, editor/terminal/root-open actions, restore tmux, and the quick-action dock. Continue using `completeReady` for batch Git, membership, and dependency actions. Preserve the existing recovery action set and deletion availability for drift.

- [x] **Step 4: Render drift lifecycle copy as muted text**

Give the summary a stable test id and conditional tone:

```tsx
<span
  data-testid="branch-workspace-state-summary"
  className={cn('ml-auto shrink-0 text-[9px]', isRepairableDrift(item) ? 'text-muted-foreground' : 'text-warning')}
>
  {t(`workspace.branch-workspace.lifecycle.${branchWorkspaceStateName(item)}`)}
</span>
```

Import the existing `cn` utility directly from `#/web/lib/cn.ts`.

- [x] **Step 5: Update exact menu expectations and verify GREEN**

Update only `needs-repair` expectations to include root terminal actions followed by inspect/delete; leave incomplete lifecycle expectations unchanged.

Run:

```bash
bun run test -- src/web/components/repo-workspace/BranchWorkspaceList.test.tsx
```

Expected: PASS.

---

### Task 4: Add the member worktree `#hash` and update domain language

**Files:**

- Create: `src/web/lib/commit-hash.ts`
- Modify: `src/web/components/repo-workspace/BranchSummaryInline.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceMemberRow.tsx`
- Test: `src/web/components/repo-workspace/BranchWorkspaceMemberRow.test.tsx`
- Modify: `CONTEXT.md`

**Interfaces:**

- Produces: `formatShortCommitHashTag(hash: string): string | null`.
- Consumes: `presentation.actionTarget?.branch.lastCommitHash`.

- [x] **Step 1: Write failing member hash tests**

In the actionable member-row test, provide `lastCommitHash: 'abc123456789'` and assert:

```ts
const hashTag = container.querySelector<HTMLElement>('[data-testid="branch-workspace-member-hash-tag"]')
expect(hashTag?.textContent).toBe('#abc1234')
expect(hashTag?.className).toContain('font-mono')
expect(hashTag?.className).toContain('text-selected-muted-foreground')
expect(hashTag?.hasAttribute('title')).toBe(false)
```

Add a second render with an empty `lastCommitHash` and assert the test id is absent.

- [x] **Step 2: Run the focused member tests and verify RED**

Run:

```bash
bun run test -- src/web/components/repo-workspace/BranchWorkspaceMemberRow.test.tsx
```

Expected: FAIL because member rows do not render a hash.

- [x] **Step 3: Extract the existing hash formatter**

Create `src/web/lib/commit-hash.ts`:

```ts
export function formatShortCommitHashTag(hash: string): string | null {
  const trimmed = hash.trim()
  return trimmed ? `#${trimmed.slice(0, 7)}` : null
}
```

Import it in `BranchSummaryInline.tsx` and remove the local `shortHashTag` function without changing ordinary branch rendering.

- [x] **Step 4: Render the member hash after the repository name**

In `BranchWorkspaceMemberRowFrame`, derive:

```ts
const commitHashTag = formatShortCommitHashTag(presentation.actionTarget?.branch.lastCommitHash ?? '')
```

Render it immediately after the member name:

```tsx
{
  commitHashTag ? (
    <span
      data-testid="branch-workspace-member-hash-tag"
      className={cn(
        'shrink-0 font-mono text-[11px] font-medium tabular-nums',
        selected ? 'text-selected-muted-foreground' : 'text-muted-foreground',
      )}
    >
      {commitHashTag}
    </span>
  ) : null
}
```

- [x] **Step 5: Update the glossary definition**

In `CONTEXT.md`, change the branch workspace member summary definition from “without a commit hash or Git tag” to explicitly state that it shows the resolved member target's abbreviated commit hash as a muted `#hash`, while remaining distinct from a Git tag.

- [x] **Step 6: Run focused UI tests and verify GREEN**

Run:

```bash
bun run test -- src/web/components/repo-workspace/BranchWorkspaceMemberRow.test.tsx src/web/components/branch-list/BranchRow.test.tsx
```

Expected: PASS, including unchanged ordinary branch hash behavior.

---

### Task 5: Full verification and diff review

**Files:**

- Review all files changed by Tasks 1–4.

**Interfaces:**

- Produces: verified implementation with no new architecture-boundary violations.

- [x] **Step 1: Format only the files owned by this plan**

Run:

```bash
bunx prettier --write \
  CONTEXT.md \
  src/server/modules/branch-workspace-read.ts \
  src/server/modules/branch-workspace-read.test.ts \
  src/server/modules/branch-workspace-plan.ts \
  src/server/modules/branch-workspace-plan.test.ts \
  src/web/lib/commit-hash.ts \
  src/web/components/repo-workspace/BranchSummaryInline.tsx \
  src/web/components/repo-workspace/BranchWorkspaceList.tsx \
  src/web/components/repo-workspace/BranchWorkspaceList.test.tsx \
  src/web/components/repo-workspace/BranchWorkspaceMemberRow.tsx \
  src/web/components/repo-workspace/BranchWorkspaceMemberRow.test.tsx \
  docs/superpowers/specs/2026-07-25-branch-workspace-repair-usability-design.md \
  docs/superpowers/plans/2026-07-25-branch-workspace-repair-usability.md
```

Expected: formatter completes successfully without touching unrelated files.

- [x] **Step 2: Run static and architecture validation**

Run:

```bash
bun run typecheck
bun run check:architecture
```

Expected: both commands exit 0.

- [x] **Step 3: Run the complete test suite**

Run:

```bash
bun run test
```

Expected: all Vitest suites pass.

- [x] **Step 4: Review the final diff**

Run:

```bash
git diff --check
git diff --stat
git status --short
```

Expected: no whitespace errors; only the approved source, test, glossary, specification, and plan files are changed.
