# Branch Created-From Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. This plan is explicitly selected for inline execution; do not dispatch subagents.

**Goal:** Replace default-branch merge status with stable, repository-local provenance showing the branch/ref selected when Hobgoblin created each local branch.

**Architecture:** Store provenance in `branch.<name>.hobgoblin-created-from` within local Git configuration. Project it into the shared branch snapshot for both local and SSH repositories, and render the optional `createdFrom` value without inferring history.

**Tech Stack:** TypeScript 6 strip-only mode, Bun, Vitest, Git CLI, React 19, Valibot, typed SSH commands.

## Global Constraints

- Do not infer provenance from reflog, merge-base, default-branch membership, or action history.
- Record every Hobgoblin-created local branch: direct, new-worktree, branch-workspace member, and remote-tracking flows.
- Metadata failure must not roll back or fail an otherwise successful branch/worktree creation.
- Use repo-alias imports with explicit `.ts`/`.tsx` extensions.
- Keep `src/main/**`, `src/web/**`, `src/server/**`, and Electron architecture boundaries green.
- Do not add dependencies or unsupported TypeScript runtime syntax.
- Do not create Git commits because the user did not request them.

---

### Task 1: Shared contract and local provenance read projection

**Files:**
- Modify: `src/shared/git-types.ts`
- Modify: `src/system/git/branches.test.ts`
- Modify: `src/system/git/branches.ts`

**Interfaces:**
- Produces: `BranchSnapshotInfo.createdFrom?: string`
- Produces: `branchCreatedFromConfigKey(branch: string): string`
- Produces: `parseBranchCreatedFromConfig(output: string): Map<string, string>`
- Produces: `markBranchCreatedFrom(branches, sources): BranchSnapshotInfo[]`

- [ ] **Step 1: Write failing parser and projection tests**

Add tests proving valid branch-scoped keys become a source map, malformed/unsafe/empty/unrelated entries are ignored, and projection adds only known values:

```ts
test('parses and projects validated branch creation sources', () => {
  const sources = parseBranchCreatedFromConfig([
    'branch.feature/a.hobgoblin-created-from main',
    'branch.feature/b.hobgoblin-created-from origin/develop',
    'branch.-bad.hobgoblin-created-from main',
    'remote.origin.url example.invalid',
  ].join('\n'))

  expect([...sources]).toEqual([
    ['feature/a', 'main'],
    ['feature/b', 'origin/develop'],
  ])
  expect(markBranchCreatedFrom([branch('feature/a'), branch('feature/c')], sources)).toMatchObject([
    { name: 'feature/a', createdFrom: 'main' },
    { name: 'feature/c' },
  ])
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun run test src/system/git/branches.test.ts`

Expected: FAIL because the new functions and `createdFrom` contract do not exist.

- [ ] **Step 3: Implement the minimal contract, parser, and local snapshot read**

Replace `mergedToDefault?: boolean` with `createdFrom?: string`. In `branches.ts`, define the config suffix and parse each `git config --local --get-regexp` line by its first space:

```ts
const BRANCH_CREATED_FROM_SUFFIX = '.hobgoblin-created-from'
const BRANCH_CREATED_FROM_PATTERN = '^branch\\..*\\.hobgoblin-created-from$'

export function branchCreatedFromConfigKey(branch: string): string {
  return `branch.${branch}${BRANCH_CREATED_FROM_SUFFIX}`
}

export function parseBranchCreatedFromConfig(output: string): Map<string, string> {
  const result = new Map<string, string>()
  for (const line of output.split('\n')) {
    const separator = line.indexOf(' ')
    if (separator <= 0) continue
    const key = line.slice(0, separator)
    const createdFrom = line.slice(separator + 1).trim()
    if (!key.startsWith('branch.') || !key.endsWith(BRANCH_CREATED_FROM_SUFFIX)) continue
    const branch = key.slice('branch.'.length, -BRANCH_CREATED_FROM_SUFFIX.length)
    if (isSafeBranchName(branch) && isSafeBranchName(createdFrom)) result.set(branch, createdFrom)
  }
  return result
}
```

Read the config in a failure-tolerant helper, project it with `markBranchCreatedFrom`, and remove `getMergedBranchNames`/`markMergedToDefault` from `getBranches`. Preserve default marking and prioritization.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `bun run test src/system/git/branches.test.ts`

Expected: PASS.

---

### Task 2: Record provenance through all local branch creation paths

**Files:**
- Modify: `src/system/git/branches.test.ts`
- Modify: `src/system/git/branches.ts`
- Modify: `src/system/git/worktrees.test.ts`
- Modify: `src/system/git/worktrees.ts`

**Interfaces:**
- Consumes: `branchCreatedFromConfigKey(branch)` from Task 1
- Produces: `recordBranchCreatedFrom(cwd, branch, createdFrom, signal): Promise<void>`

- [ ] **Step 1: Write failing direct and tracking branch tests**

Assert successful creation performs a follow-up config write, failed creation performs none, and config failure preserves the original successful result:

```ts
expect(gitMock).toHaveBeenCalledWith(
  '/repo',
  ['config', '--local', 'branch.feature/new.hobgoblin-created-from', 'main'],
  { signal },
)
```

Repeat for `origin/feature/new` through `createTrackingBranch`.

- [ ] **Step 2: Run branch helper tests and verify RED**

Run: `bun run test src/system/git/branches.test.ts`

Expected: FAIL because successful creation does not record metadata.

- [ ] **Step 3: Implement failure-tolerant local recording**

```ts
export async function recordBranchCreatedFrom(
  cwd: string,
  branch: string,
  createdFrom: string,
  signal?: AbortSignal,
): Promise<void> {
  if (!isSafeBranchName(branch) || !isSafeBranchName(createdFrom) || signal?.aborted) return
  try {
    await git(cwd, ['config', '--local', branchCreatedFromConfigKey(branch), createdFrom], { signal })
  } catch {
    // Provenance is optional metadata; branch creation remains successful.
  }
}
```

Await this helper only after `gitResultWithOptions` returns `ok: true` in direct and tracking creation.

- [ ] **Step 4: Run branch helper tests and verify GREEN**

Run: `bun run test src/system/git/branches.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing worktree creation tests**

For successful `newBranch` and `trackRemoteBranch` modes, assert source recording uses `newBranch/baseRef` and `localBranch/remoteRef`. Assert existing and detached modes do not write configuration.

- [ ] **Step 6: Run worktree tests and verify RED**

Run: `bun run test src/system/git/worktrees.test.ts`

Expected: FAIL because `createWorktree` does not record provenance.

- [ ] **Step 7: Implement worktree source recording**

After successful `git worktree add`, switch on the mode:

```ts
if (result.ok && input.mode.kind === 'newBranch') {
  await recordBranchCreatedFrom(cwd, input.mode.newBranch, input.mode.baseRef, signal)
}
if (result.ok && input.mode.kind === 'trackRemoteBranch') {
  await recordBranchCreatedFrom(cwd, input.mode.localBranch, input.mode.remoteRef, signal)
}
```

Branch workspace creation needs no separate write because it already calls this `newBranch` path.

- [ ] **Step 8: Run local Git tests and verify GREEN**

Run: `bun run test src/system/git/branches.test.ts src/system/git/worktrees.test.ts src/server/modules/branch-workspace-write-paths.test.ts`

Expected: PASS.

---

### Task 3: Mirror provenance behavior over typed SSH Git boundaries

**Files:**
- Modify: `src/system/ssh/commands.test.ts`
- Modify: `src/system/ssh/commands.ts`
- Modify: `src/system/ssh/git.test.ts`
- Modify: `src/system/ssh/git.ts`

**Interfaces:**
- Consumes: config key, parser, and projection helpers from Task 1
- Produces: `REMOTE_SNAPSHOT_CREATED_FROM_MARKER`
- Preserves: existing `RemoteCommandKind` creation payloads

- [ ] **Step 1: Write failing SSH command tests**

Assert `gitSnapshot` emits a created-from marker and one failure-tolerant config query. Assert direct, tracking, and new-branch worktree scripts record the selected source after successful creation, while existing/detached worktree scripts do not.

Expected script shape:

```sh
git -C '/srv/repo' branch -- 'feature/new' 'main' && { git -C '/srv/repo' config --local 'branch.feature/new.hobgoblin-created-from' 'main' || true; }
```

- [ ] **Step 2: Run command tests and verify RED**

Run: `bun run test src/system/ssh/commands.test.ts`

Expected: FAIL because remote scripts do not read or write provenance.

- [ ] **Step 3: Implement safe remote scripts**

Add `REMOTE_SNAPSHOT_CREATED_FROM_MARKER`, append the config query to `gitSnapshot`, and use a focused helper to append best-effort config recording only after successful branch creation. Continue using `shellQuote` for repository path, config key, and source ref.

- [ ] **Step 4: Run command tests and verify GREEN**

Run: `bun run test src/system/ssh/commands.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing remote snapshot projection tests**

Extend a snapshot fixture with:

```text
__HOBGOBLIN_REMOTE_BRANCH_CREATED_FROM__
branch.feature/a.hobgoblin-created-from main
```

Assert `feature/a.createdFrom === 'main'`, invalid entries are ignored, and legacy marker-less snapshots still parse.

- [ ] **Step 6: Run SSH Git tests and verify RED**

Run: `bun run test src/system/ssh/git.test.ts`

Expected: FAIL because the new section is not parsed or projected.

- [ ] **Step 7: Implement remote section parsing and projection**

Extend `SnapshotSections` with `createdFrom`, recognize the optional marker in `splitSnapshotSections`, parse it with `parseBranchCreatedFromConfig`, and apply `markBranchCreatedFrom` before default marking/prioritization.

- [ ] **Step 8: Run SSH tests and verify GREEN**

Run: `bun run test src/system/ssh/commands.test.ts src/system/ssh/git.test.ts`

Expected: PASS.

---

### Task 4: Persist and render the created-from signal

**Files:**
- Modify: `src/web/stores/repos/persistence.test.ts`
- Modify: `src/web/stores/repos/persistence.ts`
- Modify: `src/web/components/repo-workspace/ProjectStatusPanel.test.tsx`
- Modify: `src/web/components/branch-detail/BranchStatus.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `CONTEXT.md`

**Interfaces:**
- Consumes: `BranchSnapshotInfo.createdFrom?: string`
- Produces translations: `branch-status.signal.created-from`, `branch-status.created-from-unknown`

- [ ] **Step 1: Write failing persistence tests**

Normalize a cache containing `{ createdFrom: 'main', mergedToDefault: true }` and assert the resulting branch preserves `createdFrom` while discarding the legacy property.

- [ ] **Step 2: Run persistence tests and verify RED**

Run: `bun run test src/web/stores/repos/persistence.test.ts`

Expected: FAIL because the schema does not accept `createdFrom` and still projects `mergedToDefault`.

- [ ] **Step 3: Update the restorable branch schema**

Replace:

```ts
mergedToDefault: v.optional(v.boolean()),
```

with:

```ts
createdFrom: v.optional(v.string()),
```

- [ ] **Step 4: Run persistence tests and verify GREEN**

Run: `bun run test src/web/stores/repos/persistence.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing renderer tests**

Seed `createdFrom: 'develop'`, assert the panel contains the created-from label/value, and assert copy-all ends with:

```text
branch-status.signal.created-from: develop
```

Add an unknown case expecting `branch-status.created-from-unknown`. Confirm a default branch omits the row.

- [ ] **Step 6: Run renderer test and verify RED**

Run: `bun run test src/web/components/repo-workspace/ProjectStatusPanel.test.tsx`

Expected: FAIL because the component still renders merge status.

- [ ] **Step 7: Replace the renderer signal and translations**

Remove `mergeClipboardValue`, merge tones, merge icons, and merge labels. Render known `createdFrom` through `MonoValue`; render missing provenance through a neutral `StatusChip`. Replace obsolete i18n keys in all four locale files:

```ts
'branch-status.created-from-unknown': 'unknown',
'branch-status.signal.created-from': 'Created from',
```

Use `未知` / `创建来源分支` in Simplified Chinese and equivalent Japanese/Korean copy. Keep the row hidden for the default branch.

- [ ] **Step 8: Record the canonical domain term**

Ensure `CONTEXT.md` defines “Branch creation source” as immutable recorded creation provenance, distinct from upstream, commit ancestry, default branch, and branch workspace base branch. Do not add an ADR because the decision is local and reversible.

- [ ] **Step 9: Run renderer and persistence tests and verify GREEN**

Run: `bun run test src/web/stores/repos/persistence.test.ts src/web/components/repo-workspace/ProjectStatusPanel.test.tsx`

Expected: PASS.

---

### Task 5: Remove obsolete semantics and verify the repository

**Files:**
- Modify only files already listed if checks reveal missed references.

- [ ] **Step 1: Scan for obsolete merge-status references**

Run:

```sh
rg -n "mergedToDefault|markMergedToDefault|branch-status\.(merged|not-merged|merge-unknown)|branch-status\.signal\.merge" src
```

Expected: no matches.

- [ ] **Step 2: Run targeted feature tests**

Run:

```sh
bun run test src/system/git/branches.test.ts src/system/git/worktrees.test.ts src/system/ssh/commands.test.ts src/system/ssh/git.test.ts src/web/stores/repos/persistence.test.ts src/web/components/repo-workspace/ProjectStatusPanel.test.tsx src/server/modules/branch-workspace-write-paths.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run type and architecture checks**

Run: `bun run typecheck && bun run check:architecture`

Expected: both commands PASS.

- [ ] **Step 4: Run the complete test suite**

Run: `bun run test`

Expected: PASS with no new warnings or unhandled errors.

- [ ] **Step 5: Review the final diff**

Run: `git diff --check && git status --short && git diff --stat`

Expected: no whitespace errors; only the approved specification, plan, glossary, Git source/read paths, shared contract, persistence, translations, renderer, and tests are changed.
