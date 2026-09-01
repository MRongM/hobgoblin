# Force Complete Remote Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make confirmed complete remote alignment ignore discardable local-state changes for ordinary worktrees, member worktrees, and complete branch workspaces while retaining stable target and upstream safety.

**Architecture:** Ordinary and member worktrees already share the force-alignment write path, so the implementation changes only the branch-workspace plan fingerprint that gates batch execution. The batch alignment member fingerprint will identify the stable repository/branch/worktree/upstream target, while HEAD, ahead count, status, and worktree content remain preview-only impact data. Existing write orchestration, Git commands, one-confirmation UI, invalidation, cancellation, and failure isolation remain unchanged.

**Tech Stack:** TypeScript 6 in Node.js strip-only mode, Bun 1.3, Vitest 4, React 19 for existing confirmation coverage, local/SSH Git command adapters.

---

## File Structure

- Create `src/server/modules/branch-workspace-git-action-remote-alignment.test.ts` as a platform-portable, focused regression suite for force-alignment plan validation.
- Modify `src/server/modules/branch-workspace-git-action-plan.ts` so batch-alignment member fingerprints contain only stable destructive-target facts and no longer read worktree content solely for execution gating.
- Modify `src/server/modules/branch-workspace-git-action-plan.test.ts` to replace the superseded content-change rejection expectation with force-alignment acceptance.
- Do not change renderer, route, shared transport, local Git, or SSH Git production files; their existing behavior already satisfies ordinary/member alignment and reset/clean semantics.

## Architecture and Safety Grill

- Server ownership remains correct: destructive plan policy stays in `src/server/modules`, not in the route or renderer.
- Layering remains correct: routes remain transport-only, the write service remains orchestration-only, and Git process execution remains in `src/system`.
- Runtime-coherent state remains server-owned; no new persisted, restorable, or renderer-local state is introduced.
- Stable target changes still fail closed because the member fingerprint retains repository ID, target branch, exact worktree path, upstream, and readiness.
- Dirty state, ahead commits, staged changes, unstaged changes, untracked content, HEAD, index hash, and worktree tree are intentionally excluded because the confirmed action promises to discard them.
- Ignored content remains preserved because the existing local and SSH commands use `git clean -fd`, never `git clean -fdx`.
- A missing or gone upstream remains a fundamental unavailable target; the implementation does not guess `origin` or create upstreams.

### Task 1: Add a platform-portable force-alignment regression

**Files:**
- Create: `src/server/modules/branch-workspace-git-action-remote-alignment.test.ts`

- [ ] **Step 1: Write the failing regression test**

Create a focused test fixture using `path.resolve` and `path.join` so it works on Windows and POSIX. The first test changes HEAD, status entries, and complete worktree content after preview while preserving the target identity and upstream. The second test proves a changed upstream still fails closed.

```ts
import path from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import {
  buildBranchWorkspaceGitActionPlan,
  validateBranchWorkspaceGitActionPlan,
  type BranchWorkspaceGitActionPlanDependencies,
} from '#/server/modules/branch-workspace-git-action-plan.ts'
import type { BranchWorkspaceManifest } from '#/shared/branch-workspaces.ts'
import type { StatusEntry } from '#/shared/git-types.ts'
import type { RepoSnapshot } from '#/shared/rpc.ts'

const ROOT = path.resolve('fixtures', 'branch-workspace-plan')
const REPOSITORY_NAME = 'api'
const WORKSPACE_ID = 'branch-workspace-1'
const TARGET_BRANCH = 'feature/a'
const TARGET_WORKTREE = path.join(ROOT, 'goblin-feature-a', REPOSITORY_NAME)
const INITIAL_HEAD = '1'.repeat(40)
const CHANGED_HEAD = '2'.repeat(40)
const UPSTREAM = 'origin/feature/a'

function manifest(): BranchWorkspaceManifest {
  return {
    id: WORKSPACE_ID,
    rootId: ROOT,
    branch: TARGET_BRANCH,
    directoryName: 'goblin-feature-a',
    path: path.join(ROOT, 'goblin-feature-a'),
    repositories: [
      {
        repositoryName: REPOSITORY_NAME,
        targetBranch: TARGET_BRANCH,
        creationBase: { kind: 'localBranch', branch: 'main' },
        syncBeforeCreate: false,
        branchOrigin: 'created',
        worktreePath: TARGET_WORKTREE,
        progress: 'complete',
      },
    ],
    auxiliaryEntries: [],
  }
}

function snapshot(head: string, upstream = UPSTREAM): RepoSnapshot {
  return {
    current: 'main',
    branches: [
      {
        name: TARGET_BRANCH,
        isCurrent: false,
        tracking: upstream,
        ahead: 1,
        behind: 0,
        lastCommitHash: head,
        lastCommitMessage: 'target',
        lastCommitDate: '2026-08-30T00:00:00Z',
        lastCommitAuthor: 'developer',
        worktree: { path: TARGET_WORKTREE, head },
      },
    ],
  }
}

function dependencies(options: {
  head?: string
  upstream?: string
  entries?: StatusEntry[]
  indexHash?: string
  worktreeTree?: string
} = {}): BranchWorkspaceGitActionPlanDependencies {
  return {
    readManifests: vi.fn(async () => ({ kind: 'ready', manifests: [manifest()] })),
    getSnapshot: vi.fn(async () => snapshot(options.head ?? INITIAL_HEAD, options.upstream)),
    getWorktreeStatusEntries: vi.fn(async () => options.entries ?? []),
    getWorktreeContentState: vi.fn(async () => ({
      indexHash: options.indexHash ?? '3'.repeat(40),
      worktreeTree: options.worktreeTree ?? '4'.repeat(40),
    })),
  }
}

async function buildPlan(planDependencies = dependencies()) {
  return await buildBranchWorkspaceGitActionPlan(
    ROOT,
    { kind: 'batch-align-remote', branchWorkspaceId: WORKSPACE_ID },
    planDependencies,
  )
}

describe('branch workspace force remote alignment plan', () => {
  test('accepts discardable local state created after confirmation', async () => {
    const original = await buildPlan()
    expect(original.ok).toBe(true)
    if (!original.ok) return

    const result = await validateBranchWorkspaceGitActionPlan(
      original.plan,
      new Set(),
      dependencies({
        head: CHANGED_HEAD,
        entries: [
          { x: 'M', y: ' ', path: 'src/changed.ts' },
          { x: '?', y: '?', path: 'scratch/new.txt' },
        ],
        indexHash: '5'.repeat(40),
        worktreeTree: '6'.repeat(40),
      }),
    )

    expect(result).toMatchObject({ ok: true, plan: { kind: 'batch-align-remote' } })
  })

  test('rejects an upstream target changed after confirmation', async () => {
    const original = await buildPlan()
    expect(original.ok).toBe(true)
    if (!original.ok) return

    const result = await validateBranchWorkspaceGitActionPlan(
      original.plan,
      new Set(),
      dependencies({ upstream: 'upstream/feature/a' }),
    )

    expect(result).toEqual({
      ok: false,
      message: 'workspace.branch-workspace.git-action.repository-changed',
      repositoryName: REPOSITORY_NAME,
    })
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
bun run test src/server/modules/branch-workspace-git-action-remote-alignment.test.ts
```

Expected: the local-state test fails with `workspace.branch-workspace.git-action.repository-changed`; the changed-upstream test passes.

### Task 2: Make the batch guard identify only the stable alignment target

**Files:**
- Modify: `src/server/modules/branch-workspace-git-action-plan.ts:7-17`
- Modify: `src/server/modules/branch-workspace-git-action-plan.ts:254-326`
- Modify: `src/server/modules/branch-workspace-git-action-plan.test.ts:439-471`
- Test: `src/server/modules/branch-workspace-git-action-remote-alignment.test.ts`

- [ ] **Step 1: Remove the unnecessary content-state source read**

Remove `getRepositoryWorktreeContentState` from the `repo-read-paths.ts` import. Keep the injectable `getWorktreeContentState` dependency type temporarily compatible with existing callers/tests, but stop invoking it in `buildBatchAlignRemotePlan`.

Delete this block:

```ts
const contentState = await (dependencies.getWorktreeContentState ?? getRepositoryWorktreeContentState)(
  facts.repoId,
  member.worktreePath,
  memberSignal,
)
if (!contentState) {
  return {
    ok: false as const,
    message: 'workspace.branch-workspace.git-action.read-failed',
    repositoryName: member.repositoryName,
  }
}
```

- [ ] **Step 2: Replace the mutable member fingerprint with a stable-target fingerprint**

Replace the alignment member fingerprint with:

```ts
fingerprint: repositoryPlanFingerprint({
  repositoryName: member.repositoryName,
  repoId: facts.repoId,
  targetBranch: member.targetBranch,
  targetWorktreePath: member.worktreePath,
  upstream,
  ready,
}),
```

Do not remove `targetHead`, `ahead`, or `changeCount` from the member plan. They remain part of the reviewed preview and outer plan token, but not the execution-time member guard.

- [ ] **Step 3: Update the superseded legacy expectation**

Rename the existing test to `allows batch remote alignment when discardable worktree content changes` and replace its final rejection assertion with:

```ts
expect(result).toMatchObject({
  ok: true,
  plan: { kind: 'batch-align-remote' },
})
```

Keep the changed content-state fixture so the test documents that this value no longer blocks alignment.

- [ ] **Step 4: Run the focused regression and verify GREEN**

Run:

```powershell
bun run test src/server/modules/branch-workspace-git-action-remote-alignment.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 5: Run the batch execution regression**

Run:

```powershell
bun run test src/server/modules/branch-workspace-git-action-write-paths.test.ts -t "fully aligns every member in order while isolating failures"
```

Expected: 1 test passes, proving the existing write service still attempts every member and isolates failures.

- [ ] **Step 6: Commit the tested implementation**

```powershell
git add -- src/server/modules/branch-workspace-git-action-remote-alignment.test.ts src/server/modules/branch-workspace-git-action-plan.ts src/server/modules/branch-workspace-git-action-plan.test.ts
git commit -m "fix(repo): force branch workspace remote alignment"
```

### Task 3: Verify ordinary, member, local Git, SSH Git, and repository-wide contracts

**Files:**
- Verify: `src/web/hooks/useBranchWriteActions.test.tsx`
- Verify: `src/web/components/repo-workspace/BranchWorkspaceMemberRow.test.tsx`
- Verify: `src/system/git/reset.test.ts`
- Verify: `src/system/ssh/commands.test.ts`
- Verify: `src/server/modules/branch-workspace-git-action-write-paths.test.ts`

- [ ] **Step 1: Verify the single ordinary-worktree confirmation**

```powershell
bun run test src/web/hooks/useBranchWriteActions.test.tsx -t "requires a second confirmation before fully aligning a checked-out branch to its upstream"
```

Expected: 1 test passes and the action submits only after the single confirmation dialog.

- [ ] **Step 2: Verify member worktrees reuse ordinary scoped actions**

```powershell
bun run test src/web/components/repo-workspace/BranchWorkspaceMemberRow.test.tsx -t "reuses the member worktree target for scoped context actions"
```

Expected: 1 test passes.

- [ ] **Step 3: Verify local and SSH reset/clean semantics**

```powershell
bun run test src/system/git/reset.test.ts -t "resets directly to the confirmed remote oid and removes non-ignored files"
bun run test src/system/ssh/commands.test.ts -t "renders remote alignment as reset followed by non-ignored clean"
```

Expected: both focused tests pass; commands contain `reset --hard` followed by `clean -fd` and do not contain `-x`.

- [ ] **Step 4: Run type and architecture checks**

```powershell
bun run typecheck
bun run check:architecture
```

Expected: both commands exit 0.

- [ ] **Step 5: Run the complete test suite**

```powershell
bun run test
```

Expected: the suite exits 0. If the repository's pre-existing POSIX-only branch-workspace fixtures still fail on Windows, record the exact failures and confirm the new platform-portable regression and all touched-area tests pass; do not broaden this fix into unrelated fixture portability work.

- [ ] **Step 6: Inspect the final diff and worktree**

```powershell
git diff --check HEAD~1..HEAD
git status --short --branch
```

Expected: no whitespace errors; the implementation commit contains only the three planned source/test files, with the design and plan documentation in their preceding documentation commits.
