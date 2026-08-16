# 子工作区批量更换上游 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在一个子工作区父项中按成员仓库选择远程跟踪分支，并安全地批量更新每个目标本地分支的 Git upstream。

**Architecture:** 在既有 `BranchWorkspaceGitAction` 判别协议中加入 `batch-set-upstream`。计划层投影每个成员的当前上游和本仓库远程候选，写路径复用已有仓库后端设置上游能力并保留现有顺序、取消、失败与失效机制；Web 只维护内联面板的选择状态。

**Tech Stack:** TypeScript、React、Vitest、Hono、Git 本地/SSH 后端、Bun。

## Global Constraints

- 使用仓库别名导入且显式 `.ts`/`.tsx` 扩展名；不得使用 enum、namespace 运行时代码、参数属性或 import alias。
- `src/main/**` 不导入 `src/web/**`/`src/server/**`，`src/web/**` 不导入 `src/main/**`，`src/server/**`/`src/shared/**` 不导入 `electron`。
- 子工作区成员始终是独立 Git 边界；远程引用只能来自同一成员仓库的服务端计划候选。
- 执行按清单顺序；失败不回滚，重试绑定首次成员/远程引用映射并跳过已完成成员。
- 不添加包、不发起 Git 提交；用户未授权提交。
- 所有新增文案同时维护 en、zh、ja、ko；中文使用“子工作区”和“成员工作树”。

---

### Task 1: 共享批量上游协议与领域词汇

**Files:**
- Modify: `CONTEXT.md`
- Modify: `src/shared/branch-workspace-git-actions.ts`
- Test: `src/shared/branch-workspace-git-actions.test.ts`

**Interfaces:**
- Produces `BranchWorkspaceBatchSetUpstreamMemberPlan`，其中包含 `repositoryName`、`repoId`、`targetBranch`、`targetWorktreePath`、`targetHead`、`currentUpstream`、`trackingGone`、`remoteBranches`、`ready`、`message` 与 `fingerprint`。
- Produces `BranchWorkspaceBatchSetUpstreamInput { repositoryName: string; remoteRef: string }` 和执行变体 `{ kind: 'batch-set-upstream'; planToken: string; upstreams: BranchWorkspaceBatchSetUpstreamInput[] }`。
- Extends `BranchWorkspaceGitActionKind` with `'batch-set-upstream'` and `BranchWorkspaceGitActionStep` with `'upstream'`.

- [x] **Step 1: Write the failing shared-input tests**

```ts
test('normalizes ordered batch upstream mappings', () => {
  expect(normalizeBranchWorkspaceGitActionExecuteInput({
    kind: 'batch-set-upstream',
    planToken: ' sha256:plan ',
    upstreams: [
      { repositoryName: ' api ', remoteRef: ' origin/release ' },
      { repositoryName: 'web', remoteRef: 'upstream/feature/web' },
    ],
  })).toEqual({
    ok: true,
    input: {
      kind: 'batch-set-upstream',
      planToken: 'sha256:plan',
      upstreams: [
        { repositoryName: 'api', remoteRef: 'origin/release' },
        { repositoryName: 'web', remoteRef: 'upstream/feature/web' },
      ],
    },
  })
})

test.each([
  { kind: 'batch-set-upstream', planToken: 'sha256:plan', upstreams: [] },
  { kind: 'batch-set-upstream', planToken: 'sha256:plan', upstreams: [{ repositoryName: 'api', remoteRef: 'origin/HEAD' }] },
  { kind: 'batch-set-upstream', planToken: 'sha256:plan', upstreams: [
    { repositoryName: 'api', remoteRef: 'origin/main' },
    { repositoryName: 'api', remoteRef: 'origin/release' },
  ] },
])('rejects invalid batch upstream input: %j', (value) => {
  expect(normalizeBranchWorkspaceGitActionExecuteInput(value)).toEqual({ ok: false, message: 'error.invalid-arguments' })
})
```

- [x] **Step 2: Run the focused shared test and verify it fails because the action kind and input do not exist**

Run: `bun run test "src/shared/branch-workspace-git-actions.test.ts"`

Expected: failure identifying the missing `batch-set-upstream` contract or rejected input.

- [x] **Step 3: Implement the minimal discriminated protocol**

```ts
export type BranchWorkspaceGitActionKind =
  | 'batch-commit'
  | 'batch-discard'
  | 'batch-merge-in'
  | 'batch-merge-out'
  | 'batch-set-upstream'
  | 'pull'
  | 'push'

export interface BranchWorkspaceBatchSetUpstreamInput {
  repositoryName: string
  remoteRef: string
}
```

Add the plan interface and execution union. Reuse `normalizedRepositoryNames`-style duplicate protection in a dedicated `normalizedBatchUpstreams` helper, validating every `remoteRef` with `isRemoteTrackingRef`; accept no unset/remove sentinel because this feature changes to an explicit remote upstream only. Add the canonical `Branch workspace batch upstream change` glossary entry to `CONTEXT.md`, with no implementation detail.

- [x] **Step 4: Re-run the focused shared test and verify it passes**

Run: `bun run test "src/shared/branch-workspace-git-actions.test.ts"`

Expected: PASS.

### Task 2: 服务端计划投影与失效校验

**Files:**
- Modify: `src/server/modules/branch-workspace-git-action-plan.ts`
- Test: `src/server/modules/branch-workspace-git-action-plan.test.ts`

**Interfaces:**
- Consumes Task 1 的 `BranchWorkspaceBatchSetUpstreamMemberPlan` 和 action kind。
- Produces `{ kind: 'batch-set-upstream'; members: BranchWorkspaceBatchSetUpstreamMemberPlan[] }` 计划。

- [x] **Step 1: Write the failing plan tests**

```ts
test('projects current upstream and same-repository remote candidates for each batch upstream member', async () => {
  const result = await buildBranchWorkspaceGitActionPlan(
    ROOT,
    { kind: 'batch-set-upstream', branchWorkspaceId: WORKSPACE_ID },
    dependencies({
      getSnapshot: vi.fn(async (repoId: string) => snapshot(repoId.endsWith('/api') ? 'api' : 'web', {
        targetTracking: repoId.endsWith('/api') ? 'origin/feature/a' : undefined,
      })),
      getRemoteBranchInfo: vi.fn(async (repoId: string) => [
        { remoteRef: repoId.endsWith('/api') ? 'origin/release' : 'upstream/release', head: 'a'.repeat(40) },
      ]),
    }),
  )

  expect(result).toMatchObject({
    ok: true,
    plan: {
      kind: 'batch-set-upstream',
      members: [
        { repositoryName: 'api', currentUpstream: 'origin/feature/a', remoteBranches: [{ remoteRef: 'origin/release' }], ready: true },
        { repositoryName: 'web', currentUpstream: null, remoteBranches: [{ remoteRef: 'upstream/release' }], ready: true },
      ],
    },
  })
})

test('keeps members with no remote candidates visible but unselectable', async () => {
  const result = await buildBranchWorkspaceGitActionPlan(
    ROOT,
    { kind: 'batch-set-upstream', branchWorkspaceId: WORKSPACE_ID },
    dependencies({ getRemoteBranchInfo: vi.fn(async () => []) }),
  )
  expect(result).toMatchObject({ ok: true, plan: { members: [
    { ready: false, message: 'workspace.branch-workspace.git-action.remote-branch-required' },
    { ready: false, message: 'workspace.branch-workspace.git-action.remote-branch-required' },
  ] } })
})
```

- [x] **Step 2: Run the focused plan test and verify it fails because no upstream plan is built**

Run: `bun run test "src/server/modules/branch-workspace-git-action-plan.test.ts"`

Expected: failure from unsupported plan kind.

- [x] **Step 3: Implement `buildBatchSetUpstreamPlan`**

```ts
async function buildBatchSetUpstreamPlan(
  rootId: string,
  manifest: BranchWorkspaceManifest,
  dependencies: BranchWorkspaceGitActionPlanDependencies,
  signal?: AbortSignal,
): Promise<BranchWorkspaceGitActionPlanResult> {
  // readMemberFacts(rootId, ..., dependencies, signal, true)
  // project branch.tracking, branch.trackingGone and remoteBranches
  // mark ready only when remoteBranches.length > 0
}
```

Route the new kind before `buildSyncPlan`. Include target head, current upstream, gone flag, and `{ remoteRef, head }` candidates in each fingerprint, and preserve manifest order. The existing `validateBranchWorkspaceGitActionPlan` will then reject changed selectable facts before writes.

- [x] **Step 4: Add and run the stale-plan test**

```ts
test('rejects a batch upstream plan when a selected member upstream or candidate ref changes', async () => {
  const original = await buildBranchWorkspaceGitActionPlan(ROOT, { kind: 'batch-set-upstream', branchWorkspaceId: WORKSPACE_ID }, dependencies({
    getRemoteBranchInfo: vi.fn(async () => [{ remoteRef: 'origin/release', head: 'a'.repeat(40) }]),
  }))
  expect(original.ok).toBe(true)
  if (!original.ok) return
  await expect(validateBranchWorkspaceGitActionPlan(original.plan, new Set(), dependencies({
    getRemoteBranchInfo: vi.fn(async () => [{ remoteRef: 'origin/next', head: 'b'.repeat(40) }]),
  }))).resolves.toMatchObject({ ok: false, repositoryName: 'api' })
})
```

Run: `bun run test "src/server/modules/branch-workspace-git-action-plan.test.ts"`

Expected: PASS.

### Task 3: 服务端顺序执行、失败与重试绑定

**Files:**
- Modify: `src/server/modules/branch-workspace-git-action-write-paths.ts`
- Test: `src/server/modules/branch-workspace-git-action-write-paths.test.ts`

**Interfaces:**
- Consumes Task 1 的上游输入和 Task 2 的计划。
- Adds optional `setUpstream` dependency with the same signature as `setRepositoryBranchUpstream`.
- Produces 使用既有 `succeeded`/`failed` 阶段的 `BranchWorkspaceGitActionResult`；`step: 'upstream'` 只表示活动或失败位置。

- [x] **Step 1: Write failing execution tests**

```ts
test('sets selected member upstreams in manifest order and invalidates only touched repositories', async () => {
  const setUpstream = vi.fn(async () => ({ ok: true, message: '' }))
  const service = createBranchWorkspaceGitActionWriteService({ setUpstream, ...dependenciesForUpstreamPlan() })
  const plan = await service.plan(ROOT, { kind: 'batch-set-upstream', branchWorkspaceId: WORKSPACE_ID })
  expect(plan.ok).toBe(true)
  if (!plan.ok) return

  await expect(service.execute(ROOT, {
    kind: 'batch-set-upstream',
    planToken: plan.plan.token,
    upstreams: [
      { repositoryName: 'web', remoteRef: 'upstream/release' },
      { repositoryName: 'api', remoteRef: 'origin/release' },
    ],
  })).resolves.toMatchObject({ ok: true, members: [
    { repositoryName: 'api', phase: 'succeeded' },
    { repositoryName: 'web', phase: 'succeeded' },
  ] })

  expect(setUpstream.mock.calls.map(([repoId, branch, remoteRef]) => [repoId, branch, remoteRef])).toEqual([
    ['/workspace/api', 'feature/a', 'origin/release'],
    ['/workspace/web', 'feature/a', 'upstream/release'],
  ])
})

test('stops on an upstream failure and retries only the same remaining mappings', async () => {
  setUpstream.mockResolvedValueOnce({ ok: true, message: '' }).mockResolvedValueOnce({ ok: false, message: 'failed' })
  const failed = await service.execute(ROOT, { kind: 'batch-set-upstream', planToken: plan.plan.token, upstreams })
  expect(failed).toMatchObject({ ok: false, members: [
    { repositoryName: 'api', phase: 'succeeded' },
    { repositoryName: 'web', phase: 'failed', step: 'upstream' },
  ] })
  await expect(service.execute(ROOT, { kind: 'batch-set-upstream', planToken: plan.plan.token, upstreams: [
    { repositoryName: 'api', remoteRef: 'origin/other' },
    { repositoryName: 'web', remoteRef: 'upstream/release' },
  ] })).resolves.toEqual({ ok: false, message: 'error.invalid-arguments' })
})
```

- [x] **Step 2: Run the focused write-path test and verify it fails because the action is unsupported**

Run: `bun run test "src/server/modules/branch-workspace-git-action-write-paths.test.ts"`

Expected: failure from plan/input rejection or missing `setUpstream` dependency.

- [x] **Step 3: Implement minimal write execution**

```ts
interface PendingAction {
  // existing fields
  upstreamExecution?: { kind: 'batch-set-upstream'; upstreams: BranchWorkspaceBatchSetUpstreamInput[] }
}

async function executeBatchSetUpstream(
  state: PendingAction,
  members: BranchWorkspaceBatchSetUpstreamExecutionMember[],
  signal: AbortSignal,
  setUpstream: typeof setRepositoryBranchUpstream,
  context: ActionExecutionContext,
): Promise<BranchWorkspaceGitActionResult> {
  for (let index = 0; index < members.length; index += 1) {
    const member = members[index]!
    updateActive(context.active.get(context.rootId), index + 1, state.completed.size, member.repositoryName, 'upstream')
    const result = await setUpstream(member.repoId, member.targetBranch, member.remoteRef, signal, undefined, DEFER_REPOSITORY_INVALIDATION)
    if (!result.ok) return memberFailure(member.repositoryName, 'upstream', result)
    state.completed.add(member.repositoryName)
    context.touchedRepoIds.add(member.repoId)
  }
  return successResult(state.plan, state.completed)
}
```

Add a server-side selector that rejects absent members, unavailable rows and remote refs not present in that member's refreshed plan. Lock the first normalized mapping and reject later changed mappings. Add the action branch before the existing sync fallback. Record touched repository IDs and reuse the existing final invalidation loop; on an operation result failure return `memberFailure(member.repositoryName, 'upstream', result)` and do not process later members.

- [x] **Step 4: Re-run the focused write-path test and verify it passes**

Run: `bun run test "src/server/modules/branch-workspace-git-action-write-paths.test.ts"`

Expected: PASS, including order, failure, retry and invalidation assertions.

### Task 4: Renderer contract、内联选择面板与菜单入口

**Files:**
- Modify: `src/web/hooks/useBranchWorkspaceGitActions.ts`
- Test: `src/web/hooks/useBranchWorkspaceGitActions.test.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.tsx`
- Test: `src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.test.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceList.tsx`
- Test: `src/web/components/repo-workspace/BranchWorkspaceList.test.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.tsx`

**Interfaces:**
- Produces hook method `executeBatchSetUpstream(upstreams: BranchWorkspaceBatchSetUpstreamInput[])`.
- Adds `onBatchSetUpstream` panel prop and an inline `BatchSetUpstreamContent` branch.

- [x] **Step 1: Write the failing hook and component tests**

```tsx
test('executes the batch upstream mappings from the loaded plan', async () => {
  mocks.plan.mockResolvedValue({ ok: true, plan: upstreamPlan })
  await act(async () => state!.requestPlan('batch-set-upstream', 'ws-1'))
  await act(async () => state!.executeBatchSetUpstream([{ repositoryName: 'api', remoteRef: 'origin/release' }]))
  expect(mocks.execute).toHaveBeenCalledWith('/workspace', {
    kind: 'batch-set-upstream',
    planToken: 'sha256:upstream',
    upstreams: [{ repositoryName: 'api', remoteRef: 'origin/release' }],
  })
})

test('requires each selected member to choose a remote ref before enabling batch upstream update', async () => {
  renderUpstreamPanel(upstreamPlan)
  expect(button('workspace.branch-workspace.git-action.batch-set-upstream').disabled).toBe(true)
  chooseRemote('api', 'origin/release')
  expect(button('workspace.branch-workspace.git-action.batch-set-upstream').disabled).toBe(false)
})

test('exposes the batch upstream action in a ready branch workspace menu', async () => {
  const menuItems = await openMenuItems(branchWorkspaceItem)
  expect(menuItems.map((entry) => entry.textContent?.trim())).toContain(
    'workspace.branch-workspace.git-action.batch-set-upstream',
  )
})
```

- [x] **Step 2: Run renderer tests and verify they fail for missing hook method, panel branch and menu action**

Run: `bun run test "src/web/hooks/useBranchWorkspaceGitActions.test.tsx" "src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.test.tsx" "src/web/components/repo-workspace/BranchWorkspaceList.test.tsx"`

Expected: failure from absent batch-upstream API or UI.

- [x] **Step 3: Implement the minimal local UI state and wiring**

```tsx
const [selectedUpstreamRepositories, setSelectedUpstreamRepositories] = useState<string[]>([])
const [upstreams, setUpstreams] = useState<Record<string, string>>({})
const [upstreamQueries, setUpstreamQueries] = useState<Record<string, string>>({})

const selections = selectedMembers.flatMap((member) => {
  const remoteRef = upstreams[member.repositoryName]
  return member.remoteBranches.some((candidate) => candidate.remoteRef === remoteRef)
    ? [{ repositoryName: member.repositoryName, remoteRef }]
    : []
})
```

Initialize selectable members on plan changes, clear selections and queries on close, and use the existing `BatchMergeSelectionSummary`, `Select`, `RemoteBranchSearchInput`, `Checkbox`, status rendering and `DialogError` patterns. Render each current upstream as muted metadata, append the existing gone copy when applicable, and filter choices with `remoteBranchRefMatchesQuery`. Disable the action while pending, with no selected members, or while a selected member lacks a valid chosen ref. Add the new action immediately after batch discard in the parent menu, using `GitFork`; wire the rail's panel invocation to `executeBatchSetUpstream`.

- [x] **Step 4: Re-run renderer tests and verify they pass**

Run: `bun run test "src/web/hooks/useBranchWorkspaceGitActions.test.tsx" "src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.test.tsx" "src/web/components/repo-workspace/BranchWorkspaceList.test.tsx"`

Expected: PASS.

### Task 5: 国际化、文档收尾与完整验证

**Files:**
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Test: `src/shared/i18n/dictionaries.test.ts`
- Modify: `docs/superpowers/specs/2026-08-15-branch-workspace-batch-upstream-design.md`

**Interfaces:**
- Produces all `workspace.branch-workspace.git-action.batch-set-upstream*` labels, descriptions, row labels, missing-candidate reason and `step.upstream`/`failure-step.upstream` dictionary entries.

- [x] **Step 1: Write failing dictionary coverage**

```ts
test('localizes branch workspace batch upstream changes in every locale', () => {
  const keys = [
    'workspace.branch-workspace.git-action.batch-set-upstream',
    'workspace.branch-workspace.git-action.batch-set-upstream-description',
    'workspace.branch-workspace.git-action.current-upstream',
    'workspace.branch-workspace.git-action.select-upstream',
    'workspace.branch-workspace.git-action.remote-branch-required',
    'workspace.branch-workspace.git-action.step.upstream',
    'workspace.branch-workspace.git-action.failure-step.upstream',
  ] as const
  for (const [lang, dict] of Object.entries(dicts)) for (const key of keys) expect(dict[key], `${lang}.${key}`).toBeTruthy()
  expect(zh['workspace.branch-workspace.git-action.batch-set-upstream']).toBe('批量更换上游')
})
```

- [x] **Step 2: Run dictionary test and verify it fails for absent keys**

Run: `bun run test "src/shared/i18n/dictionaries.test.ts"`

Expected: failure for missing batch-upstream entries.

- [x] **Step 3: Add matching translations and complete the spec self-review**

Add concise equivalent copy in every locale, matching existing `DictKey` typing. Re-read the design for placeholders, ambiguity and consistency with the executed code; correct the design in place only if a verified implementation detail differs.

- [x] **Step 4: Run all required validation**

Run:

```sh
bun run test "src/shared/branch-workspace-git-actions.test.ts" "src/server/modules/branch-workspace-git-action-plan.test.ts" "src/server/modules/branch-workspace-git-action-write-paths.test.ts" "src/web/hooks/useBranchWorkspaceGitActions.test.tsx" "src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.test.tsx" "src/web/components/repo-workspace/BranchWorkspaceList.test.tsx" "src/shared/i18n/dictionaries.test.ts"
bun run typecheck
bun run check:architecture
bun run test
git diff --check
```

Expected: all commands exit 0. If a failure appears, first write or refine a test that demonstrates the mismatch, then apply the smallest fix and rerun the affected command plus the full suite.

### Task 6: 最终审阅修复——事件校验、成员身份、降级计划与无障碍

**Files:**
- Modify/Test: `src/shared/server-invalidation.ts`, `src/shared/server-invalidation.test.ts`
- Modify/Test: `src/web/branch-workspace-invalidation.test.ts`
- Modify/Test: `src/server/modules/branch-workspace-git-action-plan.ts`, `src/server/modules/branch-workspace-git-action-plan.test.ts`
- Modify/Test: `src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.tsx`, `src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.test.tsx`
- Modify/Test: four `src/shared/i18n/*.ts` dictionaries and `src/shared/i18n/dictionaries.test.ts` only if an accessible, localized label is introduced.

- [x] **Step 1: Write the failing review-regression tests**

Cover accepting/projecting an active `batch-set-upstream` operation with the `upstream` step; rejecting a stale plan when only the selected member's target branch or worktree path changes; keeping a recoverably unreadable upstream member visible/unready while a sibling remains selectable; and giving each remote selector a distinct accessible name that identifies its member.

- [x] **Step 2: Run the focused review-regression tests and verify they fail**

Run: `bun run test "src/shared/server-invalidation.test.ts" "src/web/branch-workspace-invalidation.test.ts" "src/server/modules/branch-workspace-git-action-plan.test.ts" "src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.test.tsx"`

Expected: failure before the fixes.

- [x] **Step 3: Implement the smallest cross-layer repairs**

Add the new action/step to the shared event validation allowlists. Bind batch-upstream fingerprints to `repoId`, target branch and target worktree path in addition to existing facts. For a non-abort `readMemberFacts` failure, project an unready batch-upstream member with manifest identity, a stable fallback fingerprint and the failure message, while keeping aborts fatal. Give each remote selector a member-specific localized accessible label (or an equivalent labelled-by relationship) without changing the visible placeholder. Align the wording “member worktree” in the new action description; do not broaden the unrelated shared selection component refactor.

- [x] **Step 4: Re-run focused tests, typecheck and architecture guard**

Run the Step 2 test command plus `bun run typecheck`, `bun run check:architecture`, and `git diff --check`.

Expected: all commands exit 0.
