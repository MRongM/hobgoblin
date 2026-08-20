# Worktree Switch Remote Branch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the existing worktree Switch branch dialog select a remote-tracking ref, choose a unique local tracking branch name, and atomically create and switch to that branch.

**Architecture:** Carry a discriminated local-or-remote switch target from the dialog through the existing checkout-in-worktree HTTP boundary. Dispatch locally or over SSH in the repository backend; remote targets use one `git switch --track -c` operation and the existing best-effort branch-creation provenance metadata.

**Tech Stack:** TypeScript 6 in Node.js strip-only mode, React 19, Hono, Vitest, Bun, Git, SSH command rendering.

## Global Constraints

- Execute inline in this session; do not dispatch subagents.
- Do not run `git commit`, create branches, or modify worktrees during implementation.
- Do not add dependencies.
- Use repo-alias imports with explicit `.ts`/`.tsx` extensions.
- Do not use enums, runtime namespaces, parameter properties, or TypeScript import aliases.
- Preserve local/SSH behavior parity and existing repository snapshot invalidation.
- Keep examples and tests privacy-safe with generic paths and identities.
- Verify with `bun run typecheck`, `bun run test`, and `bun run check:architecture`.

---

### Task 1: Shared target model and atomic Git primitives

**Files:**

- Create: `src/shared/worktree-branch-switch.ts`
- Create: `src/shared/worktree-branch-switch.test.ts`
- Modify: `src/system/git/branches.ts`
- Modify: `src/system/git/branches.test.ts`
- Modify: `src/system/ssh/commands.ts`
- Modify: `src/system/ssh/commands.test.ts`
- Modify: `src/system/ssh/git.ts`
- Modify: `src/system/ssh/git.test.ts`

**Interfaces:**

- Produces: `WorktreeBranchSwitchTarget`, `normalizeWorktreeBranchSwitchTarget(value)`, `worktreeBranchSwitchTargetKey(target)`.
- Produces: `checkoutTrackingBranch(cwd, localBranch, remoteRef, signal?)`.
- Produces: `checkoutRemoteTrackingBranch(target, { worktreePath, localBranch, remoteRef, signal?, run? })`.

- [ ] **Step 1: Write failing shared-model tests**

Cover valid local and remote targets, trimming, unsafe local names, invalid/HEAD remote refs, missing fields, and distinct `local:`/`remote:` keys.

```ts
expect(
  normalizeWorktreeBranchSwitchTarget({
    kind: 'remoteBranch',
    remoteRef: ' origin/feature/a ',
    localBranch: ' feature/a ',
  }),
).toEqual({ kind: 'remoteBranch', remoteRef: 'origin/feature/a', localBranch: 'feature/a' })
expect(worktreeBranchSwitchTargetKey({ kind: 'localBranch', branch: 'origin/main' })).toBe('local:origin/main')
expect(worktreeBranchSwitchTargetKey({ kind: 'remoteBranch', remoteRef: 'origin/main', localBranch: 'main' })).toBe(
  'remote:origin/main',
)
```

- [ ] **Step 2: Run the shared-model test and verify it fails**

Run: `bun run test -- src/shared/worktree-branch-switch.test.ts`

Expected: FAIL because `#/shared/worktree-branch-switch.ts` does not exist.

- [ ] **Step 3: Implement the minimal shared model**

```ts
export type WorktreeBranchSwitchTarget =
  | { kind: 'localBranch'; branch: string }
  | { kind: 'remoteBranch'; remoteRef: string; localBranch: string }

export function normalizeWorktreeBranchSwitchTarget(value: unknown): WorktreeBranchSwitchTarget | null
export function worktreeBranchSwitchTargetKey(target: WorktreeBranchSwitchTarget): string
```

Use `isSafeBranchName` for local names and `isRemoteTrackingRef` for remote refs. Do not infer or mutate names in the transport normalizer.

- [ ] **Step 4: Write failing local and SSH Git tests**

Assert that the local primitive calls:

```ts
gitResultWithOptions(cwd, { signal }, 'switch', '--track', '-c', localBranch, '--', remoteRef)
```

and records `branch.<local>.hobgoblin-created-from=<remoteRef>` only after success. Assert invalid inputs run no Git command.

Add a `gitCheckoutTracking` SSH command kind and assert exact quoting for:

```sh
git -C '<worktree>' switch --track -c '<local>' -- '<remote>'
```

followed by the existing best-effort provenance config command. Assert the SSH Git wrapper validates inputs and delegates with the worktree path.

- [ ] **Step 5: Run the focused Git tests and verify they fail**

Run: `bun run test -- src/system/git/branches.test.ts src/system/ssh/commands.test.ts src/system/ssh/git.test.ts`

Expected: FAIL because the new local function, SSH command kind, and SSH wrapper are absent.

- [ ] **Step 6: Implement the local and SSH primitives**

Add `checkoutTrackingBranch` beside `checkoutBranch`. Add `gitCheckoutTracking` beside `gitCheckout`, render it through `remoteBranchCreationScript`, and add `checkoutRemoteTrackingBranch` beside `checkoutRemoteBranch`.

- [ ] **Step 7: Run Task 1 tests**

Run: `bun run test -- src/shared/worktree-branch-switch.test.ts src/system/git/branches.test.ts src/system/ssh/commands.test.ts src/system/ssh/git.test.ts`

Expected: PASS.

### Task 2: Repository backend, route, and web client

**Files:**

- Modify: `src/server/modules/repo-backend.ts`
- Modify: `src/server/modules/repo-write-paths.ts`
- Modify: `src/server/modules/repo.test.ts`
- Modify: `src/server/routes/repo.ts`
- Modify: `src/server/routes/repo.test.ts`
- Modify: `src/web/repo-client.ts`
- Modify: `src/web/repo-client.test.ts`

**Interfaces:**

- Consumes: `WorktreeBranchSwitchTarget`, `normalizeWorktreeBranchSwitchTarget`, `checkoutTrackingBranch`, `checkoutRemoteTrackingBranch`.
- Changes: `RepoBackend.checkoutWorktree(worktreePath, target, signal?)` accepts the discriminated target.
- Changes: `checkoutWorktreeBranch(repoId, worktreePath, target, signal?, sourceToken?)` accepts the discriminated target.
- Changes: `checkoutBranchInWorktree(repoId, worktreePath, target)` posts the discriminated target.

- [ ] **Step 1: Write failing server and client boundary tests**

Cover local backend dispatch, remote backend dispatch, successful snapshot invalidation, invalid route target rejection, and client JSON payload:

```ts
{
  repoId: '/repo',
  worktreePath: '/repo-feature',
  target: { kind: 'remoteBranch', remoteRef: 'origin/feature/a', localBranch: 'feature/a' },
}
```

Assert local targets continue to call the existing checkout primitive and remote targets call the new tracking-checkout primitive exactly once.

- [ ] **Step 2: Run focused boundary tests and verify they fail**

Run: `bun run test -- src/server/modules/repo.test.ts src/server/routes/repo.test.ts src/web/repo-client.test.ts`

Expected: FAIL because checkout-in-worktree still accepts only `branch: string`.

- [ ] **Step 3: Update the repository backend and write path**

Change the backend method to dispatch by `target.kind`:

```ts
async checkoutWorktree(worktreePath, target, signal) {
  return target.kind === 'localBranch'
    ? checkoutBranch(worktreePath, target.branch, signal)
    : checkoutTrackingBranch(worktreePath, target.localBranch, target.remoteRef, signal)
}
```

Use the SSH equivalents in the remote backend. Keep `publishSnapshotInvalidationAfterMutation` as the single success invalidation point.

- [ ] **Step 4: Update route normalization and client payload**

Normalize `body.target` in `/checkout-in-worktree`. Return `error.invalid-arguments` without backend execution when normalization fails. Update the web client signature and body to send `target`.

- [ ] **Step 5: Run Task 2 tests**

Run: `bun run test -- src/server/modules/repo.test.ts src/server/routes/repo.test.ts src/web/repo-client.test.ts`

Expected: PASS.

### Task 3: Combined local/remote Switch branch dialog

**Files:**

- Modify: `src/web/components/branch-list/BranchWriteDialogs.tsx`
- Modify: `src/web/components/branch-list/BranchWriteDialogs.test.tsx`
- Modify: `src/web/hooks/useBranchWriteActions.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`

**Interfaces:**

- Consumes: `WorktreeBranchSwitchTarget`, `worktreeBranchSwitchTargetKey`, `deriveLocalBranchFromRemoteRef`, `branchNameValidationKey`, `getRepositoryRemoteBranches`.
- Changes: `CheckoutToDialog` receives `repoId` and `onCheckout(target: WorktreeBranchSwitchTarget)`.

- [ ] **Step 1: Write failing dialog tests**

Import `CheckoutToDialog` and cover:

- local candidates still submit `{ kind: 'localBranch', branch }`;
- remote refs load when opened and are searchable with local branches;
- choosing `origin/feature/a` derives `feature/a` and submits a remote target;
- the derived local name can be edited;
- an existing/invalid local name blocks submit and renders the existing validation copy;
- remote load failure leaves local candidates usable and shows a non-blocking diagnostic;
- closing resets selection, search, remote refs, local name, and error state.

- [ ] **Step 2: Run the dialog test and verify it fails**

Run: `bun run test -- src/web/components/branch-list/BranchWriteDialogs.test.tsx`

Expected: FAIL because the dialog has no remote read or discriminated callback.

- [ ] **Step 3: Implement the combined picker**

Load remote refs with an `AbortController` on open. Build local and remote candidates with prefixed stable keys. Add the existing `RemoteBranchSearchInput` as the select header and label remote rows with `tab.remote-branches`.

For remote selection, show the local branch input, default it through `deriveLocalBranchFromRemoteRef`, and validate with `branchNameValidationKey`. Keep the confirm button disabled while loading only when no valid local selection exists; a remote-load failure must not disable local switching.

- [ ] **Step 4: Wire the action hook and localized status copy**

Pass `repo.id`, forward the discriminated target to `checkoutBranchInWorktree`, and record the resulting local branch name in `setLastResult`. Add matching remote-loading, empty, and load-failure strings in English, Chinese, Japanese, and Korean.

- [ ] **Step 5: Run Task 3 tests**

Run: `bun run test -- src/web/components/branch-list/BranchWriteDialogs.test.tsx src/web/hooks/useBranchActionItems.test.tsx`

Expected: PASS.

### Task 4: Full verification and documentation consistency

**Files:**

- Verify: `CONTEXT.md`
- Verify: `docs/superpowers/specs/2026-08-20-worktree-switch-remote-branch-design.md`
- Verify: all files modified in Tasks 1–3

**Interfaces:**

- Consumes: the complete implementation.
- Produces: a type-safe, architecture-compliant, tested feature with no new dependencies.

- [ ] **Step 1: Run formatting on changed source and test files**

Run the repository's Prettier command against the exact changed files, then inspect `git diff --check`.

Expected: no whitespace errors and no unrelated rewrites.

- [ ] **Step 2: Run type checking**

Run: `bun run typecheck`

Expected: PASS.

- [ ] **Step 3: Run the complete test suite**

Run: `bun run test`

Expected: PASS.

- [ ] **Step 4: Run the architecture guard**

Run: `bun run check:architecture`

Expected: PASS.

- [ ] **Step 5: Review the final diff**

Run: `git status --short`, `git diff --check`, and `git diff --stat`, then inspect the implementation diff for scope, privacy-safe fixtures, explicit `.ts`/`.tsx` imports, and accidental generated files.

Expected: only the glossary, design/plan docs, shared model, Git/SSH primitives, repo boundary/write path, dialog/hook, translations, and their tests are changed.
