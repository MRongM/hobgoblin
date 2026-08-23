# 子工作区批量推送创建上游 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让主应用的子工作区批量推送在成员没有可用 upstream 时选择仓库远端、创建同名远程分支并设置 upstream。

**Architecture:** 扩展现有 server-owned 批量推送计划，使计划投影每个成员是否需要创建 upstream 以及允许的远端名；Renderer 只维护当前弹窗的远端选择，执行输入使用判别映射。服务端重建计划、锁定第一次执行映射并顺序调用现有推送写路径；本地和 SSH source 接受一个可选、已校验的创建远端并复用既有非 force `push -u` 命令。

**Tech Stack:** TypeScript 6（Node strip-only）、React 19、Vitest、Hono、Git CLI、SSH command model、Bun 1.3。

## Global Constraints

- 只修改主应用根目录 `src/`；独立 `windows/` 包是独立产品，本次不做隐式同步。
- 不新增路由、持久化、全局 store、后台任务、Electron 依赖、第三方包或 force push。
- 新 import 使用 `#/` alias 和显式 `.ts` / `.tsx` 扩展名。
- 不使用 enum、运行时 namespace、参数属性或 import alias。
- Renderer 不提交路径、任意远程分支名或 refspec；远程分支固定等于服务端计划中的目标本地分支。
- upstream 可用时禁止创建动作覆盖既有映射；gone upstream 的远端仍存在时沿用原映射并重建远程分支。
- 首次执行锁定成员/远端映射；失败重试不得改变目标，成功推送不回滚。
- 交互选择是 component-local state，不持久化、不跨窗口同步。
- 代码注释沿用现有英文；新增 UI 文案同步英文、简体中文、日文、韩文。
- 按项目安全约束不执行 `git commit`、`git push` 或分支操作。

---

### Task 1: 共享推送计划事实与严格执行输入

**Files:**
- Modify: `src/shared/branch-workspace-git-actions.ts`
- Test: `src/shared/branch-workspace-git-actions.test.ts`

**Interfaces:**
- Produces: `BranchWorkspaceBatchPushTargetInput`
- Produces: `BranchWorkspaceSyncSelection`
- Extends: `BranchWorkspaceSyncMemberPlan.requiresUpstreamCreation: boolean`
- Extends: `BranchWorkspaceSyncMemberPlan.pushRemotes: string[]`
- Changes push execute input from `repositoryNames` to `targets`

- [x] **Step 1: Write failing protocol tests**

Add tests that accept and trim these push targets:

```ts
expect(
  normalizeBranchWorkspaceGitActionExecuteInput({
    kind: 'push',
    planToken: ' sha256:push ',
    targets: [
      { repositoryName: ' api ', action: 'push' },
      { repositoryName: 'web', action: 'create-upstream', remote: ' origin ' },
    ],
  }),
).toEqual({
  ok: true,
  input: {
    kind: 'push',
    planToken: 'sha256:push',
    targets: [
      { repositoryName: 'api', action: 'push' },
      { repositoryName: 'web', action: 'create-upstream', remote: 'origin' },
    ],
  },
})
```

Add table cases rejecting an empty target array, duplicate members, `../api`, an unknown action, missing/blank remote for `create-upstream`, a remote beginning with `-`, a remote containing `/`, and the legacy push shape `{ repositoryNames: ['api'] }`. Keep pull normalization on `repositoryNames` unchanged.

- [x] **Step 2: Run the shared tests and verify RED**

Run:

```bash
bun run test src/shared/branch-workspace-git-actions.test.ts
```

Expected: FAIL because push still accepts `repositoryNames` and the new plan/input types do not exist.

- [x] **Step 3: Add discriminated push inputs and normalization**

Add:

```ts
export type BranchWorkspaceBatchPushTargetInput =
  | { repositoryName: string; action: 'push' }
  | { repositoryName: string; action: 'create-upstream'; remote: string }

export type BranchWorkspaceSyncSelection =
  | { kind: 'pull'; repositoryNames: string[] }
  | { kind: 'push'; targets: BranchWorkspaceBatchPushTargetInput[] }
```

Extend `BranchWorkspaceSyncMemberPlan` with:

```ts
requiresUpstreamCreation: boolean
pushRemotes: string[]
```

Split the execute union so pull retains `repositoryNames`, while push owns `targets`. Implement `normalizedBatchPushTargets()` using `isWorkspaceRepositoryName()` and `isSafeRemoteName()`; normalize in input order and reject duplicate repositories. Do not accept omitted actions or the legacy push shape.

- [x] **Step 4: Run the shared tests and verify GREEN**

Run:

```bash
bun run test src/shared/branch-workspace-git-actions.test.ts
```

Expected: PASS.

---

### Task 2: 推送计划投影 upstream 创建需求和远端候选

**Files:**
- Modify: `src/server/modules/branch-workspace-git-action-plan.ts`
- Test: `src/server/modules/branch-workspace-git-action-plan.test.ts`

**Interfaces:**
- Consumes: `BranchWorkspaceSyncMemberPlan.requiresUpstreamCreation`
- Consumes: `BranchWorkspaceSyncMemberPlan.pushRemotes`
- Produces: push plan facts used by service validation and Renderer defaults

- [x] **Step 1: Write failing plan tests for the complete state matrix**

Add one table-driven push-plan test covering:

```ts
[
  { tracking: 'origin/feature/a', remotes: ['origin', 'fork'], requires: false },
  { tracking: 'origin/feature/a', trackingGone: true, remotes: ['origin'], requires: false },
  { tracking: undefined, remotes: ['fork', 'origin'], requires: true },
  { tracking: 'deleted/feature/a', remotes: ['origin'], requires: true },
]
```

For each member assert `pushRemotes` is sorted, `requiresUpstreamCreation` matches the case, and `ready` is true. Retain the existing no-remotes case with `ready: false` and `remote-required`.

Extend the token test so changing only `['origin']` to `['fork']` changes the token while reordering `['fork', 'origin']` to `['origin', 'fork']` does not.

- [x] **Step 2: Run plan tests and verify RED**

Run:

```bash
bun run test src/server/modules/branch-workspace-git-action-plan.test.ts
```

Expected: FAIL because sync members do not project `requiresUpstreamCreation` or `pushRemotes`.

- [x] **Step 3: Implement plan projection from authoritative snapshot facts**

In `buildSyncPlan`, derive sorted remote names from `facts.snapshot.remote.remotes`. For push, parse `branch.tracking` with `parseRemoteBranchRef()` and set:

```ts
const upstreamRemote = branch.tracking ? parseRemoteBranchRef(branch.tracking)?.remote : undefined
const requiresUpstreamCreation =
  kind === 'push' && (!upstreamRemote || !pushRemotes.includes(upstreamRemote))
```

Set `pushRemotes` to the sorted names for push and `[]` for pull; set `requiresUpstreamCreation` to `false` for pull. Keep push readiness equal to `pushRemotes.length > 0`. Fingerprint the sorted remote names, not URLs or renderer defaults.

- [x] **Step 4: Run plan tests and verify GREEN**

Run:

```bash
bun run test src/server/modules/branch-workspace-git-action-plan.test.ts
```

Expected: PASS.

---

### Task 3: 本地与 SSH 推送支持显式创建远端

**Files:**
- Modify: `src/system/git/remote.ts`
- Test: `src/system/git/remote.test.ts`
- Modify: `src/system/ssh/git.ts`
- Test: `src/system/ssh/git.test.ts`
- Modify: `src/server/modules/repo-backend.ts`
- Modify: `src/server/modules/repo-write-paths.ts`
- Test: `src/server/modules/repo.test.ts`

**Interfaces:**
- Changes: `resolvePushTargetForRemotes(remotes, upstream, branch, createUpstreamRemote?)`
- Changes: `pushBranch(cwd, branch, signal?, networkOptions?, createUpstreamRemote?)`
- Changes: `pushRemoteBranch(target, branch, { signal?, run?, createUpstreamRemote? })`
- Adds: `RepoPushOptions extends RepoMutationInvalidationOptions`
- Changes: `RepoBackend.push(..., createUpstreamRemote?)`

- [x] **Step 1: Write failing local push-target tests**

Add assertions that an explicit `fork` resolves an otherwise ambiguous `[fork, backup]` set:

```ts
expect(resolvePushTargetForRemotes([fork, remote('backup')], null, 'feature/test', 'fork')).toEqual({
  remote: 'fork',
  branch: 'feature/test',
  setUpstream: true,
})
```

Also assert an unknown/unsafe explicit remote returns `error.invalid-arguments`, and an explicit remote cannot override an existing usable `origin/topic` upstream. Add a `pushBranch` test expecting `git push -u -- fork feature/test:feature/test`.

- [x] **Step 2: Write failing SSH and backend propagation tests**

Add a `pushRemoteBranch` test whose remotes are `fork` and `backup`, upstream lookup fails, and `createUpstreamRemote: 'fork'`; assert emitted `gitPush` has `remote: 'fork'`, `targetBranch: 'feature/test'`, `setUpstream: true`.

Extend `pushRepositoryBranch` test to call:

```ts
pushRepositoryBranch('/tmp/repo', 'feature/a', undefined, undefined, {
  publishInvalidation: false,
  createUpstreamRemote: 'fork',
})
```

Assert `backend.push` receives `fork` after the signal/network arguments.

- [x] **Step 3: Run source/backend tests and verify RED**

Run:

```bash
bun run test src/system/git/remote.test.ts src/system/ssh/git.test.ts src/server/modules/repo.test.ts
```

Expected: FAIL because explicit remote parameters are not accepted or propagated.

- [x] **Step 4: Implement safe explicit-target resolution**

Update `resolvePushTargetForRemotes` in this order:

```ts
if (upstreamRemoteExists) {
  if (createUpstreamRemote) return { ok: false, message: 'error.invalid-arguments' }
  return { remote: upstream.remote, branch: upstream.branch, setUpstream: false }
}
if (createUpstreamRemote) {
  if (!isSafeRemoteName(createUpstreamRemote) || !remoteNames.has(createUpstreamRemote)) {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  return { remote: createUpstreamRemote, branch, setUpstream: true }
}
```

Keep existing `origin`/single-remote fallback when the optional value is absent. Thread the optional value through local `pushBranch` and SSH `resolveRemotePushTarget`/`pushRemoteBranch` without changing `gitPush` command construction.

Add:

```ts
export interface RepoPushOptions extends RepoMutationInvalidationOptions {
  createUpstreamRemote?: string
}
```

Validate `createUpstreamRemote` with `isSafeRemoteName()` in `pushRepositoryBranch`, then pass it through `RepoBackend.push` to the local or remote source. The public `/api/repo/push` route continues calling the function without this option.

- [x] **Step 5: Run source/backend tests and verify GREEN**

Run:

```bash
bun run test src/system/git/remote.test.ts src/system/ssh/git.test.ts src/server/modules/repo.test.ts
```

Expected: PASS.

---

### Task 4: 服务端批量推送校验、映射锁定和顺序执行

**Files:**
- Modify: `src/server/modules/branch-workspace-git-action-write-paths.ts`
- Test: `src/server/modules/branch-workspace-git-action-write-paths.test.ts`

**Interfaces:**
- Consumes: `BranchWorkspaceBatchPushTargetInput[]`
- Consumes: `RepoPushOptions.createUpstreamRemote`
- Adds: `PendingAction.pushExecution`
- Adds: `selectedBatchPushMembers()` and `sameBatchPushTargets()`

- [x] **Step 1: Update sync-plan fixtures and write failing selection tests**

Extend every `syncPlan()` member fixture with:

```ts
requiresUpstreamCreation: kind === 'push' && upstream === null
pushRemotes: kind === 'push' ? ['origin', 'fork'] : []
```

Add table tests rejecting before Git writes:

- `action: 'push'` for a member requiring creation;
- `action: 'create-upstream'` for a member with usable upstream;
- a create remote not in `pushRemotes`;
- a selected unready member.

- [x] **Step 2: Write failing execution and retry-lock tests**

Execute a three-member push with:

```ts
targets: [
  { repositoryName: 'api', action: 'create-upstream', remote: 'fork' },
  { repositoryName: 'web', action: 'push' },
  { repositoryName: 'docs', action: 'create-upstream', remote: 'origin' },
]
```

Assert plan order, failure aggregation, and calls:

```ts
expect(push).toHaveBeenNthCalledWith(1, '/workspace/api', 'feature/a', expect.any(AbortSignal), undefined, {
  publishInvalidation: false,
  createUpstreamRemote: 'fork',
})
expect(push).toHaveBeenNthCalledWith(2, '/workspace/web', 'feature/a', expect.any(AbortSignal), undefined, {
  publishInvalidation: false,
})
```

After one member fails, retry with the same mapping and assert completed members are skipped. Retry with `fork` changed to `backup` and assert `error.invalid-arguments` before another push call.

- [x] **Step 3: Run write-path tests and verify RED**

Run:

```bash
bun run test src/server/modules/branch-workspace-git-action-write-paths.test.ts
```

Expected: FAIL because push still accepts names and has no mapping validation/lock.

- [x] **Step 4: Implement mapping selection and first-execution lock**

Add an execution member intersection and pending state:

```ts
type BranchWorkspaceBatchPushExecutionMember = BranchWorkspaceSyncMemberPlan & BranchWorkspaceBatchPushTargetInput

pushExecution?: {
  kind: 'push'
  targets: BranchWorkspaceBatchPushTargetInput[]
}
```

`selectedBatchPushMembers()` must iterate plan order, require exact selected cardinality, validate `ready`, and enforce the action/`requiresUpstreamCreation`/`pushRemotes` matrix. Normalize the selected members back to canonical targets, compare with `sameBatchPushTargets()`, and lock them with `state.pushExecution ??=`.

After `validatePlan`, rebuild selected push members from `validation.plan` and the locked targets. Pass them to `executeSync`; ordinary push calls retain `{ publishInvalidation: false }`, while create actions add `createUpstreamRemote`.

Keep pull on `selectedSyncMembers(plan, repositoryNames)`. Preserve push member sequential order, continue-after-failure, cancellation, result ordering and touched-repository invalidation.

- [x] **Step 5: Run write-path tests and verify GREEN**

Run:

```bash
bun run test src/server/modules/branch-workspace-git-action-write-paths.test.ts
```

Expected: PASS.

---

### Task 5: Renderer 默认选择模型、自动提交推送和批量推送 UI

**Files:**
- Create: `src/web/branch-workspace-batch-push.ts`
- Create: `src/web/branch-workspace-batch-push.test.ts`
- Modify: `src/web/hooks/useBranchWorkspaceGitActions.ts`
- Test: `src/web/hooks/useBranchWorkspaceGitActions.test.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.tsx`
- Test: `src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.test.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`

**Interfaces:**
- Produces: `defaultBranchWorkspacePushRemote(member)`
- Produces: `initialBranchWorkspacePushRemotes(plan)`
- Produces: `branchWorkspacePushTargets(plan, repositoryNames, selections)`
- Changes: `executeSync(selection: BranchWorkspaceSyncSelection)`
- Changes: panel `onSync(selection: BranchWorkspaceSyncSelection)`

- [x] **Step 1: Write failing pure model tests**

Cover these cases:

```ts
defaultBranchWorkspacePushRemote(member(['fork', 'origin'])) === 'origin'
defaultBranchWorkspacePushRemote(member(['fork'])) === 'fork'
defaultBranchWorkspacePushRemote(member(['fork', 'backup'])) === null
```

Assert `branchWorkspacePushTargets()` preserves plan order, emits `{ action: 'push' }` for usable upstream, emits `{ action: 'create-upstream', remote }` for creation members, ignores unselected rows, and returns `null` when any selected creation member lacks a choice.

- [x] **Step 2: Write failing hook tests**

Change selected pull execution expectation to:

```ts
state.executeSync({ kind: 'pull', repositoryNames: ['api'] })
```

Add push expectation with explicit targets. For automatic AI commit-and-push, assert it builds defaults and sends push `targets`; add a multiple-non-origin case asserting it stops after planning, leaves the push plan visible, sets `workspace.branch-workspace.git-action.create-upstream-remote-required`, and does not execute push.

- [x] **Step 3: Write failing panel tests**

Add push-plan rows for:

- existing `origin/feature/a` upstream: no select, emits `action: 'push'`;
- missing upstream with `['fork', 'origin']`: select defaults to `origin`, row displays `origin/feature/a`;
- missing upstream with `['fork', 'backup']`: no default, action disabled until `fork` is selected;
- missing upstream with one remote on an unselected row: no selection required;
- pending execution: remote selector and checkbox disabled.

Assert `onSync` receives:

```ts
{
  kind: 'push',
  targets: [
    { repositoryName: 'api', action: 'push' },
    { repositoryName: 'web', action: 'create-upstream', remote: 'fork' },
  ],
}
```

- [x] **Step 4: Run Renderer tests and verify RED**

Run:

```bash
bun run test src/web/branch-workspace-batch-push.test.ts src/web/hooks/useBranchWorkspaceGitActions.test.tsx src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.test.tsx
```

Expected: FAIL because the selection model, push selectors and new callback shape do not exist.

- [x] **Step 5: Implement the pure push selection model**

Implement the three exported helpers without React state. `defaultBranchWorkspacePushRemote()` only returns a value when `requiresUpstreamCreation` is true. `branchWorkspacePushTargets()` returns `null` unless every selected ready member has a valid action/remote and emits targets in plan order.

- [x] **Step 6: Update the hook and automatic flow**

Change `executeSync` to accept `BranchWorkspaceSyncSelection` and add the loaded plan token before `execute()`. In `executeBatchCommitAndPush`, call `branchWorkspacePushTargets()` with all ready members and `initialBranchWorkspacePushRemotes()`; when it returns `null`, keep the push plan visible and set `workspace.branch-workspace.git-action.create-upstream-remote-required`.

- [x] **Step 7: Add panel-local remote choices and selectors**

Add `pushRemotes: Record<string, string>` state initialized from the pure helper on plan/open changes. For push rows requiring creation, render the existing `Select` primitive with items from `member.pushRemotes`; show the derived `<remote>/<targetBranch>` and lock the control while pending. Build the targets via the pure helper before invoking `onSync`; disable the action when it returns `null`.

Keep the existing `BranchUpstreamDisplay` for ordinary and gone-upstream members. Do not add remote search because candidates are remote names, not potentially large remote-branch lists.

- [x] **Step 8: Add four-language copy**

Add these keys near existing batch push strings:

```ts
'workspace.branch-workspace.git-action.create-upstream': 'Create upstream'
'workspace.branch-workspace.git-action.select-push-remote': 'Select remote'
'workspace.branch-workspace.git-action.creating-upstream': 'Will create {upstream}'
'workspace.branch-workspace.git-action.create-upstream-remote-required':
  'Select a remote for every chosen branch without an upstream.'
```

Use equivalent concise Simplified Chinese, Japanese and Korean strings. Update the existing push description in all four languages to mention creating missing upstreams.

- [x] **Step 9: Run Renderer tests and verify GREEN**

Run:

```bash
bun run test src/web/branch-workspace-batch-push.test.ts src/web/hooks/useBranchWorkspaceGitActions.test.tsx src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.test.tsx
```

Expected: PASS.

---

### Task 6: Cross-layer regression and full verification

**Files:**
- Verify: `CONTEXT.md`
- Verify: `docs/superpowers/specs/2026-08-23-branch-workspace-batch-push-create-upstream-design.md`
- Verify: all files changed in Tasks 1–5

**Interfaces:**
- Consumes: every task deliverable
- Produces: verified main-application feature with no architecture or formatting drift

- [x] **Step 1: Run all targeted feature tests together**

Run:

```bash
bun run test src/shared/branch-workspace-git-actions.test.ts src/server/modules/branch-workspace-git-action-plan.test.ts src/server/modules/branch-workspace-git-action-write-paths.test.ts src/system/git/remote.test.ts src/system/ssh/git.test.ts src/server/modules/repo.test.ts src/web/branch-workspace-batch-push.test.ts src/web/hooks/useBranchWorkspaceGitActions.test.tsx src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.test.tsx
```

Expected: PASS with zero failures.

- [x] **Step 2: Run project static gates**

Run separately:

```bash
bun run typecheck
bun run check:architecture
git diff --check
```

Expected: every command exits 0.

- [x] **Step 3: Build the production web renderer**

Run:

```bash
bun run build:web
```

Expected: Vite exits 0; existing chunk-size warnings are acceptable.

- [x] **Step 4: Run the complete main-application test suite**

Run:

```bash
bun run test
```

Expected: all main-application test files pass.

- [x] **Step 5: Review final scope and safety**

Inspect `git status --short` and `git diff`. Confirm:

- pre-existing Windows alignment changes remain intact;
- no `windows/`, route, package, lockfile or generated `dist/` file is newly tracked by this feature;
- no force push, deletion, arbitrary refspec, persistent selection or renderer-supplied path was added;
- design, `CONTEXT.md`, shared types, source behavior, write path and UI agree on same-name upstream creation;
- no Git commit or push was executed.
