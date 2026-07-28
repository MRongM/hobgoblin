# Repository Branch Merge Directions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan must be executed inline; do not dispatch subagents.

**Goal:** Rename the existing repository worktree merge action to “merge-in” and add a safe “merge-out” action that merges the initiating worktree branch into an explicitly selected local destination branch.

**Architecture:** Keep the existing merge-in primitive and compatibility identity intact. Add an independent server-owned merge-out plan/execute slice that validates the clean source, projects local destination readiness, resolves the destination worktree, and owns temporary worktree cleanup; Renderer state remains dialog-local. Reuse stable repository Git primitives and a generic temporary-path ownership helper without refactoring the concurrently evolving branch-workspace merge protocol.

**Tech Stack:** TypeScript 6 strip-only mode, React 19, Zustand, Hono, Radix/shadcn UI, Vitest, Bun, local/SSH `RepoBackend` implementations.

**Spec:** `docs/superpowers/specs/2026-07-28-repository-branch-merge-directions-design.md`

## Global Constraints

- Do not use enums, runtime namespaces, parameter properties, or import aliases.
- Use repo-alias imports with explicit `.ts`/`.tsx` extensions and import canonical modules directly.
- Keep `src/main/**`, `src/web/**`, `src/server/**`, and `src/shared/**` architecture boundaries green.
- Preserve `/api/repo/merge`, `mergeRepositoryBranch()`, event `kind: 'merge'`, and quick-action ID `merge` as merge-in compatibility identities.
- Never infer a merge-out destination from the default branch, upstream, base branch, or creation provenance.
- Never accept a destination worktree path from the client; resolve and revalidate it on the server.
- Never remove an ordinary user worktree. Force cleanup is limited to a path proven to be an application-owned `.hobgoblin-merge-out-` or existing `.hobgoblin-batch-merge-` temporary worktree.
- Merge-out consumes committed source history only and requires a clean source worktree both in Renderer affordances and server execution.
- Do not persist merge-out destination selection or add dependencies.
- Do not execute AI commands; fill command text without a trailing carriage return or newline.
- Do not create commits, branches, or subagents while executing this plan. Git commits require a separate explicit user request.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/shared/repository-branch-merge.ts` | Merge-out plan/execute transport types, result shape, modes, and strict input normalization |
| `src/server/modules/repository-temporary-worktree.ts` | Generic deterministic repository-sibling temporary path construction and ownership proof |
| `src/server/modules/branch-workspace-batch-merge-worktree.ts` | Batch-merge namespace wrapper over the generic temporary path helper |
| `src/server/modules/repository-branch-merge-plan.ts` | Authoritative source validation, destination projection, and plan fingerprinting |
| `src/server/modules/repository-branch-merge-write-paths.ts` | Merge-out prepare/pull/merge/push/cleanup orchestration |
| `src/server/routes/repo.ts` | Thin `/merge-out-plan` and `/merge-out` HTTP boundaries |
| `src/web/repo-client.ts` | Typed plan and execute clients |
| `src/web/components/branch-list/BranchWriteDialogs.tsx` | Direction-specific merge-in and merge-out dialogs |
| `src/web/hooks/useBranchWriteActions.tsx` | Menu items, source readiness, callbacks, result events, and dialog ownership |
| `src/web/ai-terminal-handoff.ts` | Select only an open terminal or create one before filling text |
| `src/shared/i18n/{en,zh,ja,ko}.ts` | Direction-specific copy and readiness/error messages |

---

### Task 1: Define the repository merge-out protocol

**Files:**

- Create: `src/shared/repository-branch-merge.test.ts`
- Create: `src/shared/repository-branch-merge.ts`

**Interfaces:**

- Produce `RepositoryBranchMergeMode = 'merge' | 'pull-merge-push'`.
- Produce `RepositoryBranchMergeOutPlanRequest`, `RepositoryBranchMergeOutExecuteInput`, `RepositoryBranchMergeOutPlan`, and `RepositoryBranchMergeOutResult`.
- Produce strict `normalizeRepositoryBranchMergeOutPlanRequest()` and `normalizeRepositoryBranchMergeOutExecuteInput()` functions.

- [ ] **Step 1: Add failing normalization tests**

Cover these exact cases in `src/shared/repository-branch-merge.test.ts`:

```ts
test('normalizes an explicit merge-out execution', () => {
  expect(
    normalizeRepositoryBranchMergeOutExecuteInput({
      repoId: '/workspace/repo',
      planToken: 'sha256:plan',
      sourceBranch: 'feature/source',
      sourceWorktreePath: '/workspace/source',
      destinationBranch: 'main',
      mode: 'pull-merge-push',
    }),
  ).toEqual({
    ok: true,
    input: {
      repoId: '/workspace/repo',
      planToken: 'sha256:plan',
      sourceBranch: 'feature/source',
      sourceWorktreePath: '/workspace/source',
      destinationBranch: 'main',
      mode: 'pull-merge-push',
    },
  })
})

test.each([
  { sourceBranch: 'feature/a', destinationBranch: 'feature/a', mode: 'merge' },
  { sourceBranch: '', destinationBranch: 'main', mode: 'merge' },
  { sourceBranch: 'feature/a', destinationBranch: 'main\0bad', mode: 'merge' },
  { sourceBranch: 'feature/a', destinationBranch: 'main', mode: 'squash' },
])('rejects invalid execute input %#', (overrides) => {
  expect(
    normalizeRepositoryBranchMergeOutExecuteInput({
      repoId: '/workspace/repo',
      planToken: 'sha256:plan',
      sourceWorktreePath: '/workspace/source',
      ...overrides,
    }),
  ).toEqual({ ok: false, message: 'error.invalid-arguments' })
})
```

Also assert that plan requests reject missing repository IDs, source branches, source paths, NUL bytes, and control characters.

- [ ] **Step 2: Run the shared tests and verify RED**

Run:

```bash
bun run test -- src/shared/repository-branch-merge.test.ts
```

Expected: FAIL because the new module does not exist.

- [ ] **Step 3: Implement the exact transport model**

Use these public shapes in `src/shared/repository-branch-merge.ts`:

```ts
import type { ExecResult } from '#/shared/git-types.ts'

export type RepositoryBranchMergeMode = 'merge' | 'pull-merge-push'

export type RepositoryBranchMergeDestinationBlockReason = 'dirty-worktree' | 'unavailable-worktree'

export interface RepositoryBranchMergeDestinationPlan {
  branch: string
  head: string
  ready: boolean
  worktreePath?: string
  requiresTemporaryWorktree: boolean
  pullMergePushReady: boolean
  blockReason?: RepositoryBranchMergeDestinationBlockReason
}

export interface RepositoryBranchMergeOutPlanRequest {
  repoId: string
  sourceBranch: string
  sourceWorktreePath: string
}

export interface RepositoryBranchMergeOutPlan {
  token: string
  repoId: string
  sourceBranch: string
  sourceWorktreePath: string
  sourceHead: string
  ready: boolean
  message?: string
  destinations: RepositoryBranchMergeDestinationPlan[]
}

export type RepositoryBranchMergeOutPlanResult =
  | { ok: true; plan: RepositoryBranchMergeOutPlan }
  | { ok: false; message: string }

export interface RepositoryBranchMergeOutExecuteInput extends RepositoryBranchMergeOutPlanRequest {
  planToken: string
  destinationBranch: string
  mode: RepositoryBranchMergeMode
}

export interface RepositoryBranchMergeOutConflictWorktree {
  branch: string
  path: string
}

export interface RepositoryBranchMergeOutResult extends ExecResult {
  conflictWorktree?: RepositoryBranchMergeOutConflictWorktree
}
```

Normalization must trim scalar text, reject empty/control-character/NUL values, accept only the two modes, and reject identical source/destination branch names. Do not validate absolute paths in shared code; the server backend owns local versus SSH path validation.

- [ ] **Step 4: Re-run the shared tests and verify GREEN**

Run the Step 2 command. Expected: the repository merge protocol tests pass. Do not modify or normalize the concurrently changing branch-workspace direction protocol as part of this task.

---

### Task 2: Generalize application-owned repository temporary paths

**Files:**

- Create: `src/server/modules/repository-temporary-worktree.test.ts`
- Create: `src/server/modules/repository-temporary-worktree.ts`
- Modify: `src/server/modules/branch-workspace-batch-merge-worktree.ts`
- Modify: `src/server/modules/branch-workspace-batch-merge-worktree.test.ts`

**Interfaces:**

- Produce `repositoryTemporaryWorktreePath(repoId, namespace, token, branch)`.
- Produce `isRepositoryTemporaryWorktreePath(repoId, namespace, candidatePath)`.
- Preserve the exact existing `.hobgoblin-batch-merge-<repo>-<16-hex>` format through the batch wrapper.
- Add the exact `.hobgoblin-merge-out-<repo>-<16-hex>` format for ordinary merge-out.

- [ ] **Step 1: Add failing local, SSH, and ownership tests**

Test both namespaces and assert:

```ts
expect(repositoryTemporaryWorktreePath('/workspace/api', 'merge-out', 'sha256:plan', 'main')).toMatch(
  /^\/workspace\/\.hobgoblin-merge-out-api-[0-9a-f]{16}$/,
)
expect(
  repositoryTemporaryWorktreePath('ssh-config://host/srv/workspace/api', 'merge-out', 'sha256:plan', 'main'),
).toMatch(/^\/srv\/workspace\/\.hobgoblin-merge-out-api-[0-9a-f]{16}$/)
```

Ownership tests must reject a lookalike in another parent directory, a different repository basename, uppercase/non-hex suffixes, truncated suffixes, and ordinary user worktrees.

- [ ] **Step 2: Run the path suites and verify RED**

```bash
bun run test -- src/server/modules/repository-temporary-worktree.test.ts src/server/modules/branch-workspace-batch-merge-worktree.test.ts
```

Expected: FAIL because the generic helper does not exist.

- [ ] **Step 3: Implement the generic helper and retain the batch wrapper**

Use a closed namespace union:

```ts
export type RepositoryTemporaryWorktreeNamespace = 'batch-merge' | 'merge-out'
```

Build the hash from `repoId + "\0" + namespace + "\0" + token + "\0" + branch`, keep the existing 16-character lowercase hexadecimal suffix, and select `path.posix` for SSH repository IDs.

Make `branch-workspace-batch-merge-worktree.ts` a namespace-specific adapter rather than a re-export shim:

```ts
export function branchWorkspaceBatchMergeTemporaryWorktreePath(
  repoId: string,
  planToken: string,
  destinationBranch: string,
): string | null {
  return repositoryTemporaryWorktreePath(repoId, 'batch-merge', planToken, destinationBranch)
}

export function isBranchWorkspaceBatchMergeTemporaryWorktreePath(repoId: string, candidatePath: string): boolean {
  return isRepositoryTemporaryWorktreePath(repoId, 'batch-merge', candidatePath)
}
```

- [ ] **Step 4: Re-run both path suites and verify GREEN**

Run the Step 2 command. Expected: existing batch paths remain byte-for-byte compatible and merge-out paths pass.

---

### Task 3: Build an authoritative merge-out plan

**Files:**

- Create: `src/server/modules/repository-branch-merge-plan.test.ts`
- Create: `src/server/modules/repository-branch-merge-plan.ts`

**Interfaces:**

- Produce `buildRepositoryBranchMergeOutPlan(request, dependencies?, signal?)`.
- Produce a pure `projectRepositoryMergeDestinations()` helper used by the ordinary repository plan and its tests.
- Return transport-neutral `blockReason` facts; do not import branch-workspace types or messages.

- [ ] **Step 1: Add failing planner tests for every source and destination state**

Create fixtures with generic paths such as `/workspace/repo`, `/workspace/feature`, and `/workspace/main`. Cover:

- source branch missing or not attached to `sourceWorktreePath` → `error.merge-out-source-worktree-required`;
- source status missing → `error.merge-out-source-worktree-unavailable`;
- source dirty → successful plan with `ready: false` and `error.merge-out-source-dirty`;
- clean existing destination → ready, path retained, `requiresTemporaryWorktree: false`;
- unchecked destination → ready, no path, `requiresTemporaryWorktree: true`;
- dirty existing destination → disabled with `blockReason: 'dirty-worktree'`;
- unreadable existing destination → disabled with `blockReason: 'unavailable-worktree'`;
- target upstream controls `pullMergePushReady` independently of source upstream;
- source branch is excluded;
- an unlocked owned merge-out temporary worktree remains a temporary candidate, while a locked one is unavailable;
- source HEAD/status or destination identity-set changes alter the token, but destination HEAD/upstream-only changes do not.

- [ ] **Step 2: Run the planner suites and verify RED**

```bash
bun run test -- src/server/modules/repository-branch-merge-plan.test.ts
```

Expected: FAIL because the repository planner/projection does not exist.

- [ ] **Step 3: Implement normalized path/status lookup and destination projection**

Use this dependency boundary:

```ts
export interface RepositoryBranchMergePlanDependencies {
  getSnapshot?: (repoId: string, signal?: AbortSignal) => Promise<RepoSnapshot | null>
  getStatus?: (repoId: string, signal?: AbortSignal) => Promise<WorktreeStatus[]>
}

export async function buildRepositoryBranchMergeOutPlan(
  request: RepositoryBranchMergeOutPlanRequest,
  dependencies: RepositoryBranchMergePlanDependencies = {},
  signal?: AbortSignal,
): Promise<RepositoryBranchMergeOutPlanResult>
```

The pure projection input must include repository ID, source branch, snapshot branches, statuses, and a temporary-ownership predicate. Normalize local paths with `path.resolve` and SSH paths with `path.posix.normalize`. Compute `head` from worktree head, matching status head, or branch `lastCommitHash` in that order.

Fingerprint only:

```ts
{
  repoId,
  sourceBranch,
  sourceWorktreePath: normalizedSourcePath,
  sourceHead,
  sourceStatus: normalizedEntries,
  destinationBranches: destinations.map(({ branch }) => branch),
}
```

Return `token` as `sha256:<hex>`.

- [ ] **Step 4: Keep branch-workspace direction code untouched**

Verify `repository-branch-merge-plan.ts` imports no `branch-workspace-*` module. The ordinary planner may follow the confirmed same readiness table, but it must not rewrite the concurrently changing `batch-merge-in` / `batch-merge-out` plan, fingerprint, retry, or message types.

- [ ] **Step 5: Re-run the repository planner suite and verify GREEN**

Run the Step 2 command. Expected: all new repository-plan cases pass.

---

### Task 4: Execute merge-out with destination-owned Git writes

**Files:**

- Create: `src/server/modules/repository-branch-merge-write-paths.test.ts`
- Create: `src/server/modules/repository-branch-merge-write-paths.ts`

**Interfaces:**

- Produce `executeRepositoryBranchMergeOut(rawInput, dependencies?, signal?, sourceToken?)`.
- Return `RepositoryBranchMergeOutResult` with `conflictWorktree` only when a conflict remains in an ordinary destination worktree.
- Reuse `createRepositoryWorktree`, `removeRepositoryWorktree`, `pullRepositoryBranch`, `mergeRepositoryBranch`, and `pushRepositoryBranch` through injectable dependencies.

- [ ] **Step 1: Add failing execution tests before implementation**

Use mocked dependencies and assert exact call order for:

```text
existing + merge             merge
temporary + merge            create → merge → cleanup
existing + pull-merge-push   pull → source revalidate → merge → push
temporary + pull-merge-push  create → pull → source revalidate → merge → push → cleanup
```

Also cover:

- invalid/expired token rejects before every Git write;
- dirty/missing source rejects before every Git write;
- deleted, dirty, or unavailable selected destination rejects before every Git write;
- remote mode without target upstream rejects before pull;
- source HEAD/status change after pull stops before merge;
- existing-target merge conflict returns `{ reason: 'merge-conflict', conflictWorktree: { branch, path } }` and never removes that worktree;
- temporary-target merge conflict removes the temporary worktree and returns no `conflictWorktree`;
- pull, merge, push, cancellation, and success all attempt temporary cleanup;
- cleanup uses `alsoDeleteBranch: false` and `forceRemoveWorktree: true`;
- push failure retains the already-created local merge commit and reports the push error without rollback;
- an ordinary worktree path never reaches forced removal.

- [ ] **Step 2: Run the write-path suite and verify RED**

```bash
bun run test -- src/server/modules/repository-branch-merge-write-paths.test.ts
```

Expected: FAIL because the write path does not exist.

- [ ] **Step 3: Implement strict preflight and target preparation**

Use this dependency shape:

```ts
export interface RepositoryBranchMergeWriteDependencies {
  buildPlan?: typeof buildRepositoryBranchMergeOutPlan
  pull?: typeof pullRepositoryBranch
  merge?: typeof mergeRepositoryBranch
  push?: typeof pushRepositoryBranch
  createWorktree?: typeof createRepositoryWorktree
  removeWorktree?: typeof removeRepositoryWorktree
}
```

Execution must:

1. Normalize input.
2. Rebuild the current plan.
3. Require exact plan-token equality and a ready source.
4. Resolve the selected destination from that plan.
5. Recheck destination readiness and remote-mode upstream eligibility.
6. For an owned stale temporary path, force-remove it first.
7. Create an unchecked destination using `{ mode: { kind: 'existingBranch', branch } }` and `{ kind: 'skip' }` bootstrap.

- [ ] **Step 4: Implement the pipeline and one cleanup funnel**

Keep one `cleanupTemporaryDestination()` helper used by every return path after temporary creation. The merge call must always be:

```ts
await merge(repoId, destinationWorktreePath, sourceBranch, signal, sourceToken)
```

For remote mode, call pull with the destination branch/path, rebuild the source plan after pull, and require unchanged `sourceHead`, source worktree identity, and clean source status before merge. Push only the destination branch.

When merge returns `reason: 'merge-conflict'`, attach `conflictWorktree` only if `requiresTemporaryWorktree` is false. If temporary cleanup itself fails, return the cleanup failure because hidden application state still requires attention.

- [ ] **Step 5: Re-run the write-path and batch suites and verify GREEN**

```bash
bun run test -- src/server/modules/repository-branch-merge-write-paths.test.ts src/server/modules/branch-workspace-git-action-write-paths.test.ts
```

Expected: new pipeline passes and existing batch execution remains unchanged.

---

### Task 5: Add thin HTTP and typed client boundaries

**Files:**

- Modify: `src/server/routes/repo.test.ts`
- Modify: `src/server/routes/repo.ts`
- Modify: `src/web/repo-client.test.ts`
- Modify: `src/web/repo-client.ts`

**Interfaces:**

- Produce `POST /api/repo/merge-out-plan`.
- Produce `POST /api/repo/merge-out`.
- Produce `getRepositoryBranchMergeOutPlan(request, signal?)`.
- Produce `mergeRepositoryBranchOut(input, signal?, sourceToken?)`.

- [ ] **Step 1: Add failing route tests**

Mock the plan and write modules separately from `repo-write-paths.ts`. Assert that routes pass the raw request object to the authoritative normalizer/module and pass `c.req.raw.signal`. Fallbacks must be:

```ts
{ ok: false, message: 'error.failed-read-repo' }
```

Do not put Git orchestration in the route.

- [ ] **Step 2: Add failing client serialization tests**

Assert exact JSON bodies for both endpoints, including `sourceToken` only on execute when supplied, and assert the provided AbortSignal reaches `postServerJson`.

- [ ] **Step 3: Run route/client tests and verify RED**

```bash
bun run test -- src/server/routes/repo.test.ts src/web/repo-client.test.ts
```

Expected: FAIL because the endpoints and clients do not exist.

- [ ] **Step 4: Implement the thin boundaries**

Use these client signatures:

```ts
export async function getRepositoryBranchMergeOutPlan(
  request: RepositoryBranchMergeOutPlanRequest,
  signal?: AbortSignal,
): Promise<RepositoryBranchMergeOutPlanResult>

export async function mergeRepositoryBranchOut(
  input: RepositoryBranchMergeOutExecuteInput,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<RepositoryBranchMergeOutResult>
```

Keep existing `/merge` and `mergeRepositoryBranch()` untouched.

- [ ] **Step 5: Re-run route/client tests and verify GREEN**

Run the Step 3 command. Expected: both suites pass.

---

### Task 6: Present merge-in and merge-out as separate branch actions

**Files:**

- Modify: `src/web/hooks/branch-action-state.ts`
- Modify: `src/web/hooks/useBranchWriteActions.test.tsx`
- Modify: `src/web/hooks/useBranchWriteActions.tsx`
- Modify: `src/web/components/branch-list/BranchWriteDialogs.test.tsx`
- Modify: `src/web/components/branch-list/BranchWriteDialogs.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceMemberRow.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceMemberRow.test.tsx`
- Modify: `src/web/stores/repos/types.ts`
- Modify: `src/web/stores/repos/persistence.ts`
- Modify: `src/web/stores/repos/action-history.ts`
- Modify: their focused tests

**Interfaces:**

- Retain action item ID `merge` for merge-in.
- Add action item ID `mergeOut`.
- Rename `MergeDialog` to `MergeInDialog` and add `MergeOutDialog`.
- Add restorable event `{ kind: 'mergeOut'; branch; destinationBranch; worktreePath }` under the initiating source worktree history.

- [ ] **Step 1: Add failing action-item tests**

Assert:

- the old `merge` item renders the `action.merge-in` label and opens merge-in;
- `mergeOut` is adjacent, non-destructive, and independently selectable/rememberable;
- a clean source enables merge-out;
- dirty, missing-status, or missing-worktree sources keep merge-out visible but disabled with the source-readiness title;
- branch-workspace member fallback groups include both disabled direction-specific actions;
- existing remembered quick action ID `merge` resolves to merge-in without persistence migration.

- [ ] **Step 2: Add failing merge-out dialog tests**

Cover:

- plan loading and cancellation on close/unmount;
- source branch displayed read-only;
- source branch absent from targets;
- clean existing and unchecked targets enabled;
- dirty/unavailable targets visible but disabled with localized reasons;
- only-merge disabled until selection;
- remote mode disabled until the selected target has `pullMergePushReady`;
- exact execute input includes plan token, source identity, destination, and mode;
- expired plan refreshes candidates but never auto-executes;
- success closes; errors stay visible in the bounded error area;
- conflict AI is shown only when the result contains `conflictWorktree` and receives its destination branch/path.

- [ ] **Step 3: Run focused Renderer tests and verify RED**

```bash
bun run test -- src/web/hooks/useBranchWriteActions.test.tsx src/web/components/branch-list/BranchWriteDialogs.test.tsx src/web/components/repo-workspace/BranchWorkspaceMemberRow.test.tsx src/web/components/BranchActionsMenu.test.tsx
```

Expected: FAIL on missing merge-out UI and renamed copy.

- [ ] **Step 4: Implement source readiness and the two menu items**

Compute readiness from the exact source worktree status, not `selectedBranch` or repository `currentBranch`. Keep the existing item shape:

```ts
{
  id: 'merge',
  label: t('action.merge-in'),
  title: t('action.merge-in-title', { branch: branch.name }),
  disabled: !hasWorktree || branchActionBusy,
  visible: true,
  icon: createElement(GitMerge),
  onSelect: () => mergeInDialog.openWith(''),
},
{
  id: 'mergeOut',
  label: t('action.merge-out'),
  title: sourceReady
    ? t('action.merge-out-title', { branch: branch.name })
    : t('action.merge-out-source-dirty'),
  disabled: !hasWorktree || !sourceReady || branchActionBusy,
  visible: true,
  icon: createElement(GitMerge),
  onSelect: () => mergeOutDialog.openWith(''),
}
```

Do not rename the `merge` ID or persisted quick-action value.

- [ ] **Step 5: Keep merge-in behavior and add the server-planned merge-out dialog**

`MergeInDialog` keeps the current selector, merge call, target-owned pull/push, raw error display, and conflict AI behavior; only labels and component name change.

`MergeOutDialog` owns plan loading and selected destination locally. It calls the injected execute callback, not server modules directly. Render disabled reasons from `blockReason`, keep remote mode visible/disabled when unavailable, and use `result.conflictWorktree` as the only AI handoff target.

- [ ] **Step 6: Record merge-out history compatibly**

Extend `RepoEventAction`, its Valibot schema, and `extractWorktreePathFromAction()` with:

```ts
| { kind: 'mergeOut'; branch: string; destinationBranch: string; worktreePath: string }
```

Return no transient success label from `repoEventActionSuccessLabel`, matching merge-in. Do not rewrite legacy `kind: 'merge'` history entries.

- [ ] **Step 7: Re-run focused Renderer and persistence suites and verify GREEN**

```bash
bun run test -- src/web/hooks/useBranchWriteActions.test.tsx src/web/components/branch-list/BranchWriteDialogs.test.tsx src/web/components/repo-workspace/BranchWorkspaceMemberRow.test.tsx src/web/components/BranchActionsMenu.test.tsx src/web/stores/repos/action-history.test.ts src/web/stores/repos/persistence.test.ts
```

Expected: all direction, quick-action, dialog, and restore tests pass without React warnings.

---

### Task 7: Make AI handoff distinguish open from retained terminals

**Files:**

- Modify: `src/web/ai-terminal-handoff.test.ts`
- Modify: `src/web/ai-terminal-handoff.ts`
- Modify: `src/web/hooks/useMergeConflictAiActions.test.tsx`

**Interfaces:**

- Reuse only terminal summaries with `phase === 'open'`.
- Prefer the selected open session, then the first open session.
- Create a Native terminal when no open session exists.
- Fill text without executing it.

- [ ] **Step 1: Strengthen failing terminal-state tests**

Update existing open-session fixtures to include `phase: 'open'`. Add a table test for `opening`, `restarting`, `closed`, and `error` selected sessions asserting that each causes `createTerminal()` and never writes to the retained key.

Keep the exact no-execution assertion:

```ts
expect(mocks.bridge.writeInput.mock.calls[0]![1]).not.toMatch(/[\r\n]$/)
```

Add a mixed-session case proving a selected closed session is skipped in favor of another open session.

- [ ] **Step 2: Run AI handoff tests and verify RED**

```bash
bun run test -- src/web/ai-terminal-handoff.test.ts src/web/hooks/useMergeConflictAiActions.test.tsx
```

Expected: non-open sessions are currently reused, so the new cases fail.

- [ ] **Step 3: Implement the open-session selector**

Use session summaries rather than `selectedDescriptor` alone:

```ts
const openSessions = snapshot.sessions.filter((session) => session.phase === 'open')
const key = openSessions.find((session) => session.selected)?.key ?? openSessions[0]?.key ?? null
```

Select the resolved open key, or create a terminal with `{ repoRoot, branch, worktreePath }`. After the promise resolves, write exactly `input.command`; do not append Enter. Preserve navigation and detail expansion before terminal selection/creation.

- [ ] **Step 4: Re-run AI handoff tests and verify GREEN**

Run the Step 2 command. Expected: existing-open, mixed, absent, and non-open scenarios all pass.

---

### Task 8: Align copy, glossary, design status, and full verification

**Files:**

- Modify: `src/shared/i18n/dictionaries.test.ts`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Verify/update: `CONTEXT.md`
- Update: `docs/superpowers/specs/2026-07-28-repository-branch-merge-directions-design.md`

**Interfaces:**

- Chinese menu labels are exactly `合并入` and `合并出`.
- English labels communicate direction idiomatically rather than using bare `Merge out`.
- All target/source readiness, plan-expired, target-upstream, and temporary-cleanup messages exist in four locales.

- [ ] **Step 1: Add failing dictionary assertions**

Require the direction keys in all locales and assert:

```ts
expect(zh['action.merge-in']).toBe('合并入')
expect(zh['action.merge-out']).toBe('合并出')
expect(en['action.merge-in']).toContain('into this branch')
expect(en['action.merge-out']).toContain('this branch into')
```

Also require keys for source dirty/unavailable, destination dirty/unavailable, destination upstream required, plan expired, and merge-out pull/merge/push confirmation.

- [ ] **Step 2: Run dictionary tests and verify RED**

```bash
bun run test -- src/shared/i18n/dictionaries.test.ts
```

Expected: FAIL on missing direction-specific keys.

- [ ] **Step 3: Add four-locale copy and remove ambiguous ordinary merge copy**

Retain batch-merge keys under `workspace.branch-workspace.*`. Replace ordinary UI references to `action.merge`, `action.merge-title`, `action.merge-label`, and `action.merge-confirm` with direction-specific keys, but leave legacy keys only if another live call site still requires them.

- [ ] **Step 4: Re-run all focused suites**

```bash
bun run test -- \
  src/shared/repository-branch-merge.test.ts \
  src/server/modules/repository-temporary-worktree.test.ts \
  src/server/modules/repository-branch-merge-plan.test.ts \
  src/server/modules/repository-branch-merge-write-paths.test.ts \
  src/server/modules/branch-workspace-git-action-plan.test.ts \
  src/server/modules/branch-workspace-git-action-write-paths.test.ts \
  src/server/routes/repo.test.ts \
  src/web/repo-client.test.ts \
  src/web/hooks/useBranchWriteActions.test.tsx \
  src/web/components/branch-list/BranchWriteDialogs.test.tsx \
  src/web/ai-terminal-handoff.test.ts \
  src/web/hooks/useMergeConflictAiActions.test.tsx \
  src/shared/i18n/dictionaries.test.ts
```

Expected: all focused suites pass.

- [ ] **Step 5: Run project-wide verification**

```bash
bun run typecheck
bun run test
bun run check:architecture
git diff --check
```

Expected: typecheck, architecture, and diff checks pass; all tests pass. If unrelated pre-existing full-suite failures remain, record their exact test names and verify every changed focused suite is green before making any completion claim.

- [ ] **Step 6: Perform the requirements audit**

Inspect the complete diff and verify each invariant directly:

- merge-in still calls `/api/repo/merge` in the initiating worktree;
- merge-out never accepts a client destination path;
- source dirtiness is checked both before opening and before writing;
- only selected destination pull/push operations occur;
- every temporary path exit attempts cleanup without deleting the branch;
- only retained ordinary conflicts expose AI handoff;
- AI handoff creates a terminal when no `open` terminal exists and never appends Enter;
- no target/default/upstream preference was persisted;
- no unrelated branch-workspace behavior changed.

- [ ] **Step 7: Mark the design implemented only with fresh evidence**

Change the design status from `待最终确认` to `已实施` and append the exact verification results only after every required task is complete. Do not claim completion based on planned commands.
