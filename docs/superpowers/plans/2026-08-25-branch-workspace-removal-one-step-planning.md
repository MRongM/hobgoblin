# 子工作区删除一步式规划 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将删除整个子工作区纳入现有“左侧配置、右侧计划、一次最终提交”的弹窗交互，同时保留全部删除安全语义。

**Architecture:** 复用 `BranchWorkspaceDialog` 已有 one-step 状态机、`useLatestPlanRequest` 和 `OneStepPlanningLayout`，仅把 `remove` 模式加入现有生命周期范围。删除配置继续由弹窗本地状态拥有，服务端请求、计划令牌、审批与强制删除协议保持不变。

**Tech Stack:** React 19、TypeScript strip-only、Vitest、Testing Library 风格 DOM 测试、Bun。

## Global Constraints

- 仅修改现有删除弹窗投影、对应测试和已确认设计文档；不增加协议字段、依赖或全局状态。
- 自动规划期间允许修改删除选项和关闭弹窗；只有删除执行期间锁定关闭。
- 保留默认删除本地分支、远端分支依赖本地分支、destructive 样式、强制删除、审批、执行进度和失败重试。
- 修复弹窗继续保留“下一步”；批量 Git 弹窗不变。
- 使用 repo alias 与显式 `.ts`/`.tsx` 扩展名，不使用 Node strip-only 不支持的 TypeScript 语法。
- 不执行 `git commit`、`git push` 或分支操作。

---

### Task 1: 用回归测试定义删除一步式交互

**Files:**

- Modify: `src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx`

**Interfaces:**

- Consumes: `BranchWorkspaceDialog` 的 `mode="remove"`、`onPreview(request, signal)`、`pending` 与 `executing` props。
- Produces: 删除模式的一步式布局、自动计划、配置持续可见和规划/执行锁定边界的回归契约。

- [x] **Step 1: 将排除范围测试改为只排除修复流程**

```tsx
test('keeps next-step planning only for the excluded repair flow', () => {
  renderDialog({ mode: 'repair', workspace: existingWorkspace() })
  expect(document.querySelector('[data-action="preview"]')).not.toBeNull()
  expect(document.querySelector('[data-testid="branch-workspace-one-step-layout"]')).toBeNull()
})
```

- [x] **Step 2: 增加删除模式同屏与自动规划断言**

```tsx
test('shows removal options beside the automatically planned deletion', async () => {
  const onPreview = vi.fn(async () => true)
  renderDialog({ mode: 'remove', workspace: existingWorkspace(), onPreview })

  expect(document.querySelector('[data-testid="branch-workspace-one-step-layout"]')).not.toBeNull()
  expect(document.querySelector('[data-action="preview"]')).toBeNull()
  expect(checked('workspace.branch-workspace.delete-local-branch')).toBe(true)
  await expectAutoPreview(onPreview, {
    operation: 'remove',
    branchWorkspaceId: 'branch-1',
    alsoDeleteBranch: true,
    alsoDeleteUpstream: false,
  })
  expect(onPreview).toHaveBeenCalledTimes(1)
})
```

- [x] **Step 3: 增加规划和执行锁定边界断言**

```tsx
test('keeps removal configuration editable while planning and locks it while executing', () => {
  renderDialog({ mode: 'remove', workspace: existingWorkspace(), pending: true, executing: false })
  expect(
    document.querySelector<HTMLInputElement>('[aria-label="workspace.branch-workspace.delete-local-branch"]')?.disabled,
  ).toBe(false)
  expect(document.querySelector('[data-slot="dialog-close"]')).not.toBeNull()

  renderDialog({
    mode: 'remove',
    workspace: existingWorkspace(),
    plan: removalPlan(),
    pending: true,
    executing: true,
  })
  expect(
    document.querySelector<HTMLInputElement>('[aria-label="workspace.branch-workspace.delete-local-branch"]')?.disabled,
  ).toBe(true)
  expect(document.querySelector('[data-slot="dialog-close"]')).toBeNull()
})
```

- [x] **Step 4: 验证过期删除计划同时禁用普通与强制删除**

```tsx
test('disables normal and force deletion when the visible plan no longer matches removal options', async () => {
  const onPreview = vi.fn(async () => true)
  const plannedRequest = {
    operation: 'remove' as const,
    branchWorkspaceId: 'branch-1',
    alsoDeleteBranch: true,
    alsoDeleteUpstream: false,
  }
  renderDialog({
    mode: 'remove',
    workspace: existingWorkspace(),
    plan: { ...removalPlan(), requiredApprovals: [] },
    plannedRequest,
    onPreview,
  })
  await expectAutoPreview(onPreview, plannedRequest)

  click('workspace.branch-workspace.delete-upstream-branch')

  expect(document.querySelector<HTMLButtonElement>('[data-action="confirm"]')?.disabled).toBe(true)
  expect(document.querySelector<HTMLButtonElement>('[data-action="force-confirm"]')?.disabled).toBe(true)
})
```

- [x] **Step 5: 运行目标测试并确认先失败**

Run: `bun run test src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx`

Expected: FAIL；删除模式仍渲染 `preview` 且没有 one-step layout，自动计划未调用。

### Task 2: 将删除模式并入生命周期一步式状态机

**Files:**

- Modify: `src/web/components/repo-workspace/BranchWorkspaceDialog.tsx`
- Modify: `docs/superpowers/specs/2026-08-25-branch-workspace-one-step-planning-dialog-design.md`
- Modify: `docs/superpowers/plans/2026-08-25-branch-workspace-removal-one-step-planning.md`

**Interfaces:**

- Consumes: `useLatestPlanRequest<BranchWorkspacePlanRequest>`、`OneStepPlanningLayout`、现有 remove request 与执行 handlers。
- Produces: `remove` 模式的自动计划和同屏删除配置；外部 props 与服务端协议不变。

- [x] **Step 1: 扩展 one-step 模式并修正锁定边界**

```tsx
const oneStep = mode === 'create' || mode === 'extend' || mode === 'reduce' || mode === 'remove'
const selectionLocked = oneStep ? executing || result !== null : pending
const removalExecutionLocked = mode === 'remove' && plan !== null && executing
```

以模式、目标子工作区和固定缩减目标组成初始化身份，在重置本地默认值完成前不给自动规划有效请求：

```tsx
const dialogStateKey = open ? JSON.stringify([mode, workspace?.id ?? null, fixedReduceRepositoryName]) : null
const [initializedDialogStateKey, setInitializedDialogStateKey] = useState<string | null>(null)

const currentRequest =
  open &&
  oneStep &&
  dialogStateKey !== null &&
  initializedDialogStateKey === dialogStateKey &&
  !executing &&
  result === null
    ? request()
    : null
```

- [x] **Step 2: 让删除配置在计划和执行阶段持续显示**

```tsx
{
  oneStep && mode === 'remove' ? (
    <div className="grid gap-2 rounded-md border border-danger-border bg-danger-surface p-3 text-xs">
      <p>{t('workspace.branch-workspace.delete-warning')}</p>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          aria-label={t('workspace.branch-workspace.delete-local-branch')}
          checked={alsoDeleteBranch}
          disabled={selectionLocked}
          onChange={(event) => {
            setAlsoDeleteBranch(event.target.checked)
            if (!event.target.checked) setAlsoDeleteUpstream(false)
          }}
        />
        {t('workspace.branch-workspace.delete-local-branch')}
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          aria-label={t('workspace.branch-workspace.delete-upstream-branch')}
          checked={alsoDeleteUpstream}
          disabled={selectionLocked || !alsoDeleteBranch}
          onChange={(event) => setAlsoDeleteUpstream(event.target.checked)}
        />
        {t('workspace.branch-workspace.delete-upstream-branch')}
      </label>
    </div>
  ) : null
}
```

同时让强制删除使用与普通提交一致的当前计划校验：

```tsx
disabled={operationPending || !currentPlanReady || !requiredApprovalsSatisfied}
```

- [x] **Step 3: 运行目标测试并确认通过**

Run: `bun run test src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx`

Expected: PASS；删除自动计划、双栏、审批、执行进度、强制删除及失败重试测试全部通过。

- [x] **Step 4: 格式、类型、架构和全量验证**

Run: `bunx prettier --check src/web/components/repo-workspace/BranchWorkspaceDialog.tsx src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx docs/superpowers/specs/2026-08-25-branch-workspace-one-step-planning-dialog-design.md docs/superpowers/plans/2026-08-25-branch-workspace-removal-one-step-planning.md`

Expected: PASS。

Run: `bun run typecheck`

Expected: PASS。

Run: `bun run check:architecture`

Expected: PASS。

Run: `bun run test`

Expected: PASS；允许仓库既有的显式 skip，不允许新增失败。

- [x] **Step 5: 完成自审并更新文档状态**

对照设计文档确认删除选项同屏、自动计划、当前请求匹配、执行锁定、破坏性确认、强制删除、失败重试和修复流程不变均有实现或回归测试证据；全部通过后把设计状态恢复为 `已实施`，并勾选本计划全部步骤。

## Self-Review

- Spec coverage: Task 1 锁定删除模式的布局、自动计划和锁定边界；Task 2 复用现有状态机实施，并验证原有删除安全路径和修复排除范围。
- Placeholder scan: 计划不含未定义的后续工作，所有代码步骤均给出准确实现内容。
- Type consistency: `mode`、`pending`、`executing`、`onPreview`、`selectionLocked` 和 `removalExecutionLocked` 均与当前组件接口一致。

## Verification Evidence

- `BranchWorkspaceDialog.test.tsx`: 72/72 passed。
- Related rail and action-hook regression: 69/69 passed。
- `bun run typecheck`: all projects passed。
- `bun run check:architecture`: import boundaries passed。
- `bun run test`: 424/424 test files passed；4,474 passed，1 skipped。
- Scoped Prettier check and `git diff --check`: passed。
