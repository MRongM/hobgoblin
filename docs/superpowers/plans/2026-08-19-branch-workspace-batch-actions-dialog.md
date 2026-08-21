# Branch Workspace 批量操作对话框化 & 统一进度实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 branch workspace 五个批量 Git 操作(batch-commit / batch-discard / batch-set-upstream / pull / push)从"在 workspace 项下方内联展开"改造为对话框(Dialog),并为所有 7 个 kind 提供统一的"总进度条 + 逐成员分步骤"进度视图,参照现有 batch-merge-in / batch-merge-out 弹窗的形态。

**Architecture:**
- 保留单一入口组件 `BranchWorkspaceGitActionPanel`(名字继续沿用,尽管现在全走 Dialog)。它现在已经为 merge-in / merge-out 渲染 `<Dialog>`,只需把剩余 5 个 kind 也套进同一个通用 `<Dialog>` 外壳。
- 抽出**共享进度投影** `projectBranchWorkspaceBatchProgress`(shared 层):把 `plan + activeOperation + result + selectedRepositoryNames + kind` 投影成 `{ members: { repositoryName, selected, status, steps[] }, completedCount, totalCount }`,与现有 `projectBranchWorkspaceBatchMerge*Progress` 结构对齐。
- 抽出**共享进度视图** `BranchWorkspaceBatchProgress` 组件:总进度条 + 逐成员胶囊 step 行(复用现有 `MergeStepIcon` 图标)。合并 in/out 弹窗改为渲染同一组件。
- Rail 层将 `<BranchWorkspaceGitActionPanel>` 从 `BranchWorkspaceList` 的 `expandedContent` 挂载迁到 `WorkspaceRepositoryRail` 顶层渲染 —— Dialog 不再需要挂在被操作的 workspace 项下方。`BranchWorkspaceList` 移除 `gitActionPanel` prop。
- 已有 `data-testid="branch-workspace-git-action-panel"` 挪到弹窗的 `DialogContent`,保持既有测试查询不失效。

**Tech Stack:** React 18, TypeScript, shadcn Dialog、Vitest + jsdom、i18n via `useT()`, Tailwind。

---

## 目录

- Task 1:整理 i18n key,让"进度"文案与 kind 解耦
- Task 2:抽取通用进度投影 `projectBranchWorkspaceBatchProgress`
- Task 3:抽取共享进度视图组件 `BranchWorkspaceBatchProgress`
- Task 4:把非 merge 的 5 个 kind 迁到统一 Dialog 外壳(TDD 每 kind 一步)
- Task 5:Rail 侧挂载点迁移,`BranchWorkspaceList` 移除 `gitActionPanel` prop
- Task 6:更新周边测试(Pane / Rail)引用位置
- Task 7:最终 verification

---

## 文件结构预览

- Modify:`src/shared/i18n/en.ts`、`zh.ts`、`ja.ts`、`ko.ts` — key `git-action.progress` 通用化,新增 `git-action.progress-title`
- Create:`src/web/components/repo-workspace/branch-workspace-batch-progress.ts` — 通用进度投影
- Create:`src/web/components/repo-workspace/branch-workspace-batch-progress.test.ts` — 单元测试
- Create:`src/web/components/repo-workspace/BranchWorkspaceBatchProgress.tsx` — 共享进度视图组件
- Modify:`src/web/components/repo-workspace/branch-workspace-batch-merge-progress.ts` — 复用新通用投影或保持兼容包装
- Modify:`src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.tsx` — 全部 kind 都渲染 `<Dialog>`;删除内联 `<div>`;`BatchCommitContent` / `BatchDiscardContent` / `BatchSetUpstreamContent` / `SyncContent` 现在被 `<Dialog>` 包裹;两个 Merge Dialog 内部复用新的 `BranchWorkspaceBatchProgress`
- Modify:`src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.test.tsx` — 断言从内联 `<div>` 改为 Dialog 存在;新增每个 kind 的进度显示测试
- Modify:`src/web/components/repo-workspace/WorkspaceRepositoryRail.tsx` — 顶层渲染 Panel,`gitActionPanel` prop 不再传给 List
- Modify:`src/web/components/repo-workspace/BranchWorkspaceList.tsx` — 移除 `gitActionPanel` prop,`expandedContent` 只保留 `memberList + tmuxCleanup.dialog`
- Modify:`src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx` — 挂载点变更断言
- Modify:`src/web/components/repo-workspace/BranchWorkspacePane.test.tsx` — 挂载点变更断言

---

### Task 1: 通用化 i18n 进度文案

**Files:**
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`

现有 `workspace.branch-workspace.git-action.progress` = "Batch merge progress"。改为通用"批量操作进度",避免其它 kind 复用时语义不对。

- [ ] **Step 1: 修改英文文案**

编辑 `src/shared/i18n/en.ts`,把 key `workspace.branch-workspace.git-action.progress` 的值从 `'Batch merge progress'` 改为 `'Batch operation progress'`。

- [ ] **Step 2: 修改中文文案**

编辑 `src/shared/i18n/zh.ts`,把该 key 的值从 `'批量合并进度'` 改为 `'批量操作进度'`。

- [ ] **Step 3: 修改日文文案**

编辑 `src/shared/i18n/ja.ts`,把该 key 的值从 `'一括マージの進行状況'` 改为 `'一括操作の進行状況'`。

- [ ] **Step 4: 修改韩文文案**

编辑 `src/shared/i18n/ko.ts`,把该 key 的值从 `'일괄 병합 진행률'` 改为 `'일괄 작업 진행률'`。

- [ ] **Step 5: 运行 typecheck 与相关 vitest 冒烟**

Run: `cd /Users/longjiang/src/tries/2026-06-13-hobgoblin/hobgoblin-feat-20260730-opt && bun run --silent tsc -p tsconfig.web.json --noEmit`
Expected: PASS,无 TS 错误。

- [ ] **Step 6: Commit**

```bash
git add src/shared/i18n/en.ts src/shared/i18n/zh.ts src/shared/i18n/ja.ts src/shared/i18n/ko.ts
git commit -m "i18n(branch-workspace): 通用化批量操作进度文案"
```

---

### Task 2: 抽取共享进度投影 `projectBranchWorkspaceBatchProgress`

**Files:**
- Create: `src/web/components/repo-workspace/branch-workspace-batch-progress.ts`
- Create: `src/web/components/repo-workspace/branch-workspace-batch-progress.test.ts`

将现有 `branch-workspace-batch-merge-progress.ts` 中的通用状态投影抽出到一个新文件。新文件只导出**平面 API**,不再耦合 merge-in / merge-out 特有的 step 计算 —— 每种 kind 由调用方传入 `stepsFor(member)`。

投影语义(保持与现有 merge 实现完全一致,原来是 merge-only,现在通用化):

```
member.status 判定规则(基于其 steps):
- 若任一 step 是 failed  → member.status = failed
- 否则若任一 step 是 active → member.status = active
- 否则若所有 step 是 complete → member.status = complete
- 否则 → member.status = pending
未被选中的成员 → member.status = 'unselected', steps = []

step.status 判定规则(与现有 projectStepStatus 相同):
- 若 result.member.phase === 'succeeded'  → complete
- 若 result.member.phase === 'failed' 且 result.member.step 存在:
    - stepIndex < currentIndex → complete
    - stepIndex === currentIndex → failed
    - stepIndex > currentIndex → pending
- 若已有 result 但该 member 无 result → pending
- 若 selectedIndex < completedCount → complete
- 若 activeOperation.repositoryName !== member.repositoryName → pending
- 否则以 activeOperation.step 为 currentIndex:
    - stepIndex < currentIndex → complete
    - stepIndex === currentIndex → active
    - stepIndex > currentIndex → pending
```

- [ ] **Step 1: 写失败测试**

Create `src/web/components/repo-workspace/branch-workspace-batch-progress.test.ts`:

```typescript
import { describe, expect, test } from 'vitest'
import { projectBranchWorkspaceBatchProgress } from './branch-workspace-batch-progress.ts'
import type { BranchWorkspaceActiveOperation } from '#/shared/branch-workspaces.ts'
import type { BranchWorkspaceGitActionResult } from '#/shared/branch-workspace-git-actions.ts'

const members = [{ repositoryName: 'api' }, { repositoryName: 'web' }]

test('marks unselected members as unselected with empty steps', () => {
  const progress = projectBranchWorkspaceBatchProgress({
    members,
    selectedRepositoryNames: ['api'],
    stepsFor: () => ['commit'],
    activeOperation: null,
    result: null,
  })
  const web = progress.members.find((m) => m.repositoryName === 'web')!
  expect(web.selected).toBe(false)
  expect(web.status).toBe('unselected')
  expect(web.steps).toEqual([])
})

test('marks active step for the running member and pending for later members', () => {
  const activeOperation: BranchWorkspaceActiveOperation = {
    kind: 'batch-commit',
    repositoryName: 'api',
    step: 'commit',
    completedCount: 0,
    totalCount: 2,
  }
  const progress = projectBranchWorkspaceBatchProgress({
    members,
    selectedRepositoryNames: ['api', 'web'],
    stepsFor: () => ['commit'],
    activeOperation,
    result: null,
  })
  const api = progress.members.find((m) => m.repositoryName === 'api')!
  const web = progress.members.find((m) => m.repositoryName === 'web')!
  expect(api.status).toBe('active')
  expect(api.steps[0].status).toBe('active')
  expect(web.status).toBe('pending')
  expect(web.steps[0].status).toBe('pending')
  expect(progress.completedCount).toBe(0)
  expect(progress.totalCount).toBe(2)
})

test('marks failed step from result with earlier steps complete and later pending', () => {
  const result: BranchWorkspaceGitActionResult = {
    ok: false,
    kind: 'push',
    planToken: 't',
    branchWorkspaceId: 'w',
    members: [{ repositoryName: 'api', phase: 'failed', step: 'push', message: 'boom' }],
  } as BranchWorkspaceGitActionResult
  const progress = projectBranchWorkspaceBatchProgress({
    members: [{ repositoryName: 'api' }],
    selectedRepositoryNames: ['api'],
    stepsFor: () => ['pull', 'push'],
    activeOperation: null,
    result,
  })
  const api = progress.members[0]!
  expect(api.steps.map((s) => s.status)).toEqual(['complete', 'failed'])
  expect(api.status).toBe('failed')
})

test('counts completedCount from succeeded members in result', () => {
  const result: BranchWorkspaceGitActionResult = {
    ok: true,
    kind: 'push',
    planToken: 't',
    branchWorkspaceId: 'w',
    members: [
      { repositoryName: 'api', phase: 'succeeded' },
      { repositoryName: 'web', phase: 'succeeded' },
    ],
  } as BranchWorkspaceGitActionResult
  const progress = projectBranchWorkspaceBatchProgress({
    members,
    selectedRepositoryNames: ['api', 'web'],
    stepsFor: () => ['push'],
    activeOperation: null,
    result,
  })
  expect(progress.completedCount).toBe(2)
  expect(progress.members.every((m) => m.status === 'complete')).toBe(true)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun x vitest run src/web/components/repo-workspace/branch-workspace-batch-progress.test.ts`
Expected: FAIL — module not found。

- [ ] **Step 3: 实现投影模块**

Create `src/web/components/repo-workspace/branch-workspace-batch-progress.ts`:

```typescript
import type {
  BranchWorkspaceGitActionResult,
  BranchWorkspaceGitActionStep,
} from '#/shared/branch-workspace-git-actions.ts'
import type { BranchWorkspaceActiveOperation } from '#/shared/branch-workspaces.ts'

export type BranchWorkspaceBatchStepStatus = 'pending' | 'active' | 'complete' | 'failed'
export type BranchWorkspaceBatchMemberStatus = 'unselected' | BranchWorkspaceBatchStepStatus

export interface BranchWorkspaceBatchStepProgress {
  step: BranchWorkspaceGitActionStep
  status: BranchWorkspaceBatchStepStatus
}

export interface BranchWorkspaceBatchMemberProgress {
  repositoryName: string
  selected: boolean
  status: BranchWorkspaceBatchMemberStatus
  steps: BranchWorkspaceBatchStepProgress[]
}

export interface BranchWorkspaceBatchProgress {
  members: BranchWorkspaceBatchMemberProgress[]
  completedCount: number
  totalCount: number
}

export interface ProjectBranchWorkspaceBatchProgressInput<TMember extends { repositoryName: string }> {
  members: readonly TMember[]
  selectedRepositoryNames: readonly string[]
  stepsFor: (member: TMember) => readonly BranchWorkspaceGitActionStep[]
  activeOperation: BranchWorkspaceActiveOperation | null
  result: BranchWorkspaceGitActionResult | null
}

export function projectBranchWorkspaceBatchProgress<TMember extends { repositoryName: string }>(
  input: ProjectBranchWorkspaceBatchProgressInput<TMember>,
): BranchWorkspaceBatchProgress {
  const selected = new Set(input.selectedRepositoryNames)
  const selectedMembers = input.members.filter((member) => selected.has(member.repositoryName))
  const completedCount = input.result
    ? selectedMembers.filter(
        (member) =>
          input.result!.members.find((candidate) => candidate.repositoryName === member.repositoryName)?.phase ===
          'succeeded',
      ).length
    : Math.min(input.activeOperation?.completedCount ?? 0, selectedMembers.length)

  const members = input.members.map<BranchWorkspaceBatchMemberProgress>((member) => {
    if (!selected.has(member.repositoryName)) {
      return { repositoryName: member.repositoryName, selected: false, status: 'unselected', steps: [] }
    }
    const selectedIndex = selectedMembers.findIndex((candidate) => candidate.repositoryName === member.repositoryName)
    const memberResult = input.result?.members.find((candidate) => candidate.repositoryName === member.repositoryName)
    const steps = input.stepsFor(member)
    const stepProgress = steps.map<BranchWorkspaceBatchStepProgress>((step) => ({
      step,
      status: projectStepStatus(step, steps, selectedIndex, completedCount, member.repositoryName, input.activeOperation, memberResult),
    }))
    return {
      repositoryName: member.repositoryName,
      selected: true,
      status: memberStatus(stepProgress),
      steps: stepProgress,
    }
  })

  return { members, completedCount, totalCount: selectedMembers.length }
}

function projectStepStatus(
  step: BranchWorkspaceGitActionStep,
  steps: readonly BranchWorkspaceGitActionStep[],
  selectedIndex: number,
  completedCount: number,
  repositoryName: string,
  activeOperation: BranchWorkspaceActiveOperation | null,
  memberResult: BranchWorkspaceGitActionResult['members'][number] | undefined,
): BranchWorkspaceBatchStepStatus {
  if (memberResult?.phase === 'succeeded') return 'complete'
  if (memberResult?.phase === 'failed' && memberResult.step) {
    const currentIndex = steps.indexOf(memberResult.step as BranchWorkspaceGitActionStep)
    const stepIndex = steps.indexOf(step)
    if (stepIndex < currentIndex) return 'complete'
    if (stepIndex === currentIndex) return 'failed'
    return 'pending'
  }
  if (memberResult) return 'pending'
  if (selectedIndex < completedCount) return 'complete'
  if (activeOperation?.repositoryName !== repositoryName || !activeOperation.step) return 'pending'
  const currentIndex = steps.indexOf(activeOperation.step as BranchWorkspaceGitActionStep)
  const stepIndex = steps.indexOf(step)
  if (stepIndex < currentIndex) return 'complete'
  if (stepIndex === currentIndex) return 'active'
  return 'pending'
}

function memberStatus(steps: readonly BranchWorkspaceBatchStepProgress[]): BranchWorkspaceBatchMemberStatus {
  if (steps.some((step) => step.status === 'failed')) return 'failed'
  if (steps.some((step) => step.status === 'active')) return 'active'
  if (steps.length > 0 && steps.every((step) => step.status === 'complete')) return 'complete'
  return 'pending'
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `bun x vitest run src/web/components/repo-workspace/branch-workspace-batch-progress.test.ts`
Expected: PASS(4 tests)。

- [ ] **Step 5: Commit**

```bash
git add src/web/components/repo-workspace/branch-workspace-batch-progress.ts \
        src/web/components/repo-workspace/branch-workspace-batch-progress.test.ts
git commit -m "feat(branch-workspace): 抽取通用批量操作进度投影"
```

---

### Task 3: 让 merge-in / merge-out 进度复用通用投影

**Files:**
- Modify: `src/web/components/repo-workspace/branch-workspace-batch-merge-progress.ts`

保留 `projectBranchWorkspaceBatchMergeInProgress` / `projectBranchWorkspaceBatchMergeOutProgress` 名字与外部签名不变(现有测试与 Merge Dialog 直接引用),内部实现改为委托通用投影。删除本文件内的私有 `projectSelectedBatchMergeProgress`、`projectStepStatus`、`memberStatus`。

- [ ] **Step 1: 修改文件**

Replace `src/web/components/repo-workspace/branch-workspace-batch-merge-progress.ts` 内容为:

```typescript
import type {
  BranchWorkspaceBatchMergeInPlan,
  BranchWorkspaceBatchMergeInSourceInput,
  BranchWorkspaceBatchMergeOutPlan,
  BranchWorkspaceBatchMergeOutTargetInput,
  BranchWorkspaceGitActionResult,
  BranchWorkspaceGitActionStep,
  BranchWorkspaceMergeMode,
} from '#/shared/branch-workspace-git-actions.ts'
import type { BranchWorkspaceActiveOperation } from '#/shared/branch-workspaces.ts'
import { repositoryMergeBranchSelectionKey } from '#/shared/repository-merge-branch.ts'
import {
  projectBranchWorkspaceBatchProgress,
  type BranchWorkspaceBatchProgress,
} from './branch-workspace-batch-progress.ts'

export type { BranchWorkspaceBatchProgress as BranchWorkspaceBatchMergeProgress } from './branch-workspace-batch-progress.ts'
export type { BranchWorkspaceBatchMemberProgress as BranchWorkspaceBatchMergeMemberProgress } from './branch-workspace-batch-progress.ts'
export type { BranchWorkspaceBatchStepProgress as BranchWorkspaceBatchMergeStepProgress } from './branch-workspace-batch-progress.ts'
export type { BranchWorkspaceBatchStepStatus as BranchWorkspaceBatchMergeStepStatus } from './branch-workspace-batch-progress.ts'
export type { BranchWorkspaceBatchMemberStatus as BranchWorkspaceBatchMergeMemberStatus } from './branch-workspace-batch-progress.ts'

export function projectBranchWorkspaceBatchMergeInProgress(
  plan: BranchWorkspaceBatchMergeInPlan,
  sources: BranchWorkspaceBatchMergeInSourceInput[],
  mode: BranchWorkspaceMergeMode,
  activeOperation: BranchWorkspaceActiveOperation | null,
  result: BranchWorkspaceGitActionResult | null,
): BranchWorkspaceBatchProgress {
  const selected = new Map(sources.map((source) => [source.repositoryName, source.source]))
  return projectBranchWorkspaceBatchProgress({
    members: plan.members,
    selectedRepositoryNames: [...selected.keys()],
    stepsFor: (member): readonly BranchWorkspaceGitActionStep[] => {
      const source = selected.get(member.repositoryName)
      const fetchSteps = source?.kind === 'remote' ? (['fetch'] as const) : []
      return mode === 'merge' ? [...fetchSteps, 'merge'] : ['pull', ...fetchSteps, 'merge', 'push']
    },
    activeOperation,
    result,
  })
}

export function projectBranchWorkspaceBatchMergeOutProgress(
  plan: BranchWorkspaceBatchMergeOutPlan,
  targets: BranchWorkspaceBatchMergeOutTargetInput[],
  mode: BranchWorkspaceMergeMode,
  activeOperation: BranchWorkspaceActiveOperation | null,
  result: BranchWorkspaceGitActionResult | null,
): BranchWorkspaceBatchProgress {
  const selected = new Map(targets.map((target) => [target.repositoryName, target.destination]))
  return projectBranchWorkspaceBatchProgress({
    members: plan.members,
    selectedRepositoryNames: [...selected.keys()],
    stepsFor: (member): readonly BranchWorkspaceGitActionStep[] => {
      const destination = member.destinationBranches.find((candidate) => {
        const selection = selected.get(member.repositoryName)
        return (
          selection !== undefined &&
          repositoryMergeBranchSelectionKey(candidate.destination) === repositoryMergeBranchSelectionKey(selection)
        )
      })
      if (destination?.destination.kind === 'remote') {
        return ['fetch', 'prepare', 'merge', 'push', 'cleanup']
      }
      return [
        'prepare',
        ...(mode === 'merge' ? (['merge'] as const) : (['pull', 'merge', 'push'] as const)),
        ...(destination?.requiresTemporaryWorktree ? (['cleanup'] as const) : []),
      ]
    },
    activeOperation,
    result,
  })
}
```

- [ ] **Step 2: 运行既有 merge 进度测试**

Run: `bun x vitest run src/web/components/repo-workspace/branch-workspace-batch-merge-progress.test.ts`
Expected: PASS(所有既有断言不变)。

- [ ] **Step 3: 运行整体 typecheck**

Run: `bun run --silent tsc -p tsconfig.web.json --noEmit`
Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add src/web/components/repo-workspace/branch-workspace-batch-merge-progress.ts
git commit -m "refactor(branch-workspace): 合并进度改为委托通用投影"
```

---

### Task 4: 抽取共享进度视图组件 `BranchWorkspaceBatchProgress`

**Files:**
- Create: `src/web/components/repo-workspace/BranchWorkspaceBatchProgress.tsx`

一个纯展示组件,接收 `BranchWorkspaceBatchProgress` 数据(来自 Task 2 的投影) + i18n step 映射,渲染:

1. 顶部一行"总进度 {completed}/{total}"文案
2. 逐成员一行:序号、repo 名、状态徽章(pending/active/complete/failed)、逐 step 胶囊 + `MergeStepIcon`
3. 空态(totalCount = 0)返回 null

关键 data-testid:`branch-workspace-batch-progress`(替代原 `branch-workspace-batch-merge-progress`,同时保留旧 testid 以维持既有断言)。

- [ ] **Step 1: 写组件**

```tsx
import { Circle, CircleCheck, CircleX, LoaderCircle } from 'lucide-react'
import type { BranchWorkspaceBatchProgress as Progress, BranchWorkspaceBatchStepStatus } from './branch-workspace-batch-progress.ts'
import type { BranchWorkspaceGitActionStep } from '#/shared/branch-workspace-git-actions.ts'
import { useT } from '#/web/stores/i18n.ts'
import { cn } from '#/web/lib/cn.ts'

export function BranchWorkspaceBatchProgress({ progress }: { progress: Progress }) {
  const t = useT()
  if (progress.totalCount === 0) return null
  return (
    <div
      data-testid="branch-workspace-batch-progress"
      className="grid gap-2 rounded-md border border-app-region-border bg-app-region/60 p-3 text-xs"
    >
      <div className="flex items-center justify-between">
        <span className="font-medium">{t('workspace.branch-workspace.git-action.progress')}</span>
        <span className="tabular-nums text-muted-foreground">
          {t('workspace.branch-workspace.progress.summary', { completed: progress.completedCount, total: progress.totalCount })}
        </span>
      </div>
      <ul className="grid gap-1.5">
        {progress.members.filter((m) => m.selected).map((member) => (
          <li key={member.repositoryName} className="flex flex-wrap items-center gap-1.5" data-merge-repository-progress={member.repositoryName}>
            <span className="truncate font-mono">{member.repositoryName}</span>
            <div className="flex flex-wrap items-center gap-1">
              {member.steps.map((step, index) => (
                <span
                  key={`${member.repositoryName}:${step.step}:${index}`}
                  data-merge-step={`${member.repositoryName}:${step.step}`}
                  data-status={step.status}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]',
                    step.status === 'active' && 'border-brand-border text-brand-foreground',
                    step.status === 'complete' && 'border-emerald-500/50 text-emerald-700 dark:text-emerald-300',
                    step.status === 'failed' && 'border-destructive/60 text-destructive',
                    step.status === 'pending' && 'border-app-region-border text-muted-foreground',
                  )}
                >
                  <StepIcon status={step.status} />
                  {t(`workspace.branch-workspace.git-action.failure-step.${step.step}`)}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function StepIcon({ status }: { status: BranchWorkspaceBatchStepStatus }) {
  if (status === 'active') return <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />
  if (status === 'complete') return <CircleCheck className="size-3" aria-hidden="true" />
  if (status === 'failed') return <CircleX className="size-3" aria-hidden="true" />
  return <Circle className="size-3" aria-hidden="true" />
}
```

- [ ] **Step 2: 快速冒烟测试组件挂载 typecheck**

Run: `bun run --silent tsc -p tsconfig.web.json --noEmit`
Expected: PASS。

- [ ] **Step 3: Commit**

```bash
git add src/web/components/repo-workspace/BranchWorkspaceBatchProgress.tsx
git commit -m "feat(branch-workspace): 抽取共享批量操作进度视图"
```

---

### Task 5: 5 个 kind 迁至统一 Dialog 外壳

**Files:**
- Modify: `src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.test.tsx`

`BranchWorkspaceGitActionPanel` 现有一段(L298-L469)以 `<div data-testid="branch-workspace-git-action-panel">` 内联渲染 batch-commit / batch-discard / batch-set-upstream / pull / push。把这一段包进 `<Dialog open onOpenChange={onOpenChange}>` + `<DialogContent data-testid="branch-workspace-git-action-panel" className="…">`(复用与 merge 弹窗一致的 sizing:`max-h-[85vh] w-[calc(100vw-1rem)] max-w-[42.667rem] overflow-y-auto sm:w-[66.667vw] sm:max-w-[42.667rem]`)。`stopPropagation` 的 div 移除。DialogHeader 承担 title/description。

在同一 Dialog 内容里,在原有各 kind 的选择/输入区域下方渲染 `<BranchWorkspaceBatchProgress progress={...} />`。progress 来源:

- batch-commit → `stepsFor: () => ['commit']`,selected = 所有 dirty 成员
- batch-discard → `stepsFor: () => ['discard']`,selected = 所有 paths.length > 0 成员
- batch-set-upstream → `stepsFor: () => ['upstream']`,selected = `selectedUpstreamRepositories`
- pull → `stepsFor: () => ['pull']`,selected = `selectedSyncRepositories`
- push → `stepsFor: () => ['push']`,selected = `selectedSyncRepositories`

Footer 保持原按钮布局,改用 `<DialogFooter>`。

- [ ] **Step 1: 更新测试断言,先让测试 fail**

在 `BranchWorkspaceGitActionDialog.test.tsx` 里,现有断言 `document.querySelector('[data-testid="branch-workspace-git-action-panel"]')` 保持不变(testid 沿用)。**新增**每 kind 一条进度显示测试(伪代码):

```typescript
test('renders unified batch progress for pull kind', () => {
  render({ kind: 'pull', plan: syncPlan('pull'), pending: false })
  expect(document.querySelector('[data-testid="branch-workspace-batch-progress"]')).not.toBeNull()
})
```

Run: `bun x vitest run src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.test.tsx`
Expected: 新用例 FAIL(尚未实现)。

- [ ] **Step 2: 修改 `BranchWorkspaceGitActionPanel` 主 render 分支**

用 `<Dialog open={open} onOpenChange={onOpenChange}>` 包裹全部 5 个 kind 的分支内容(merge-in / merge-out 保留原有 Dialog);把 `data-testid="branch-workspace-git-action-panel"` 挪到 `<DialogContent>`;把 title/description 放进 `<DialogHeader>`;插入 `<BranchWorkspaceBatchProgress>`;Footer 用 `<DialogFooter>`。

- [ ] **Step 3: 运行全量弹窗测试直到通过**

Run: `bun x vitest run src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.test.tsx`
Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.tsx \
        src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.test.tsx
git commit -m "feat(branch-workspace): 批量操作统一走 Dialog 与进度视图"
```

---

### Task 6: Rail 挂载点上移,List 去掉 `gitActionPanel` prop

**Files:**
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceList.tsx`

现在 `WorkspaceRepositoryRail` 通过 `gitActionPanel` prop 把 Panel 渲染到 `BranchWorkspaceList` 的每个项的 `expandedContent`。改造后 Panel 是 `<Dialog>`,可以脱离项的 DOM 挂载。

- [ ] **Step 1: Rail 顶层渲染**

在 `WorkspaceRepositoryRail.tsx` 的 JSX 顶层增加:

```tsx
{gitActionOpen && gitActionTarget ? (
  <BranchWorkspaceGitActionPanel
    open
    kind={gitActionKind}
    /* ...原有 props 保持不变... */
  />
) : null}
```

删除原 `const gitActionPanel = …` 分支与 `gitActionPanel` prop 传递给 `BranchWorkspaceList` 的地方。

- [ ] **Step 2: List 移除 prop**

在 `BranchWorkspaceList.tsx` 移除 `gitActionPanel`、`onGitAction` 之外的 `gitActionPanel` 相关代码:props 接口、参数解构、`expandedContent` 里的 `{gitActionPanel?.itemId === item.id ? gitActionPanel.content : null}`。保留 `onGitAction` 与菜单入口。

- [ ] **Step 3: typecheck + 相关测试**

Run: `bun run --silent tsc -p tsconfig.web.json --noEmit`
Expected: PASS。

Run: `bun x vitest run src/web/components/repo-workspace/BranchWorkspaceList.test.tsx src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx src/web/components/repo-workspace/BranchWorkspacePane.test.tsx`
Expected: 失败项来自 pane/rail 里对 gitActionPanel prop 的历史断言 → Task 7 中修复。

- [ ] **Step 4: Commit**

```bash
git add src/web/components/repo-workspace/WorkspaceRepositoryRail.tsx src/web/components/repo-workspace/BranchWorkspaceList.tsx
git commit -m "refactor(branch-workspace): 批量操作 Dialog 上移至 Rail 顶层"
```

---

### Task 7: 修复 Pane / Rail 周边测试

**Files:**
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspacePane.test.tsx`

- [ ] **Step 1: 更新断言**

Pane 里 `expect(container.querySelector('[data-testid="branch-workspace-git-action-panel"]')).toBeNull()` 仍然成立(未打开时不渲染),保留。
Rail 测试里 mock 的 `BranchWorkspaceGitActionPanel` 位置仍适用,只需确认 mock 组件不再依赖 List 的 `gitActionPanel` prop 传递路径 —— 直接读取 Rail 顶层 render 的 props 即可。

- [ ] **Step 2: 运行全项 pane/rail 测试**

Run: `bun x vitest run src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx src/web/components/repo-workspace/BranchWorkspacePane.test.tsx`
Expected: PASS。

- [ ] **Step 3: Commit**

```bash
git add src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx src/web/components/repo-workspace/BranchWorkspacePane.test.tsx
git commit -m "test(branch-workspace): 更新批量操作 Dialog 挂载断言"
```

---

### Task 8: 批量更换上游弹窗支持批量移除上游

**Files:**
- Modify: `src/shared/branch-workspace-git-actions.ts`
- Modify: `src/shared/i18n/en.ts`、`zh.ts`、`ja.ts`、`ko.ts`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.test.tsx`
- Modify: 服务端 batch-set-upstream 执行路径(位置待定)

**Domain:**

引入"移除上游"作为 batch-set-upstream 的第二个动作。类型演进:

```typescript
export type BranchWorkspaceBatchSetUpstreamInput =
  | { repositoryName: string; action: 'set'; remoteRef: string }
  | { repositoryName: string; action: 'unset' }
```

`normalizedBatchUpstreams` 相应放开 `remoteRef` 缺失的路径。服务端 batch-set-upstream 执行器分派到 `git branch --unset-upstream`(已有 `src/system/git/branches.ts:205`)。

**UI:**

在 `BatchSetUpstreamContent` 里每个成员一行:
- 左侧 checkbox(现有)
- 中间 remote 选择器(现有)
- 右侧新增"×"图标按钮(`data-testid="branch-workspace-batch-unset-upstream-{repositoryName}"`),点击后该成员进入 `action: 'unset'` 状态,选择器变灰、显示 "workspace.branch-workspace.git-action.remove-upstream-selected" 标签,再次点击恢复 `set` 模式。

Footer 主按钮语义:只要该 workspace 至少一个成员被选中(无论 set 还是 unset)就 enable。执行时按各成员的 action 分别序列化提交给后端。

- [ ] **Step 1: 类型演进 + 校验放开(TDD)**

在 `src/shared/branch-workspace-git-actions.test.ts`(若无则创建)新增:

```typescript
test('accepts unset action without remoteRef', () => {
  const result = validateExecuteInput({
    kind: 'batch-set-upstream',
    planToken: 't',
    upstreams: [{ repositoryName: 'api', action: 'unset' }],
  })
  expect(result.ok).toBe(true)
})
```

Run:`bun x vitest run src/shared/branch-workspace-git-actions.test.ts`
Expected: FAIL。

- [ ] **Step 2: 实现类型演进 + 校验**

`BranchWorkspaceBatchSetUpstreamInput` 改成上文的 discriminated union;`normalizedBatchUpstreams` 中,`action === 'unset'` 分支只要求 `repositoryName` 唯一且属于 workspace,不检查 `remoteRef`。

Run: `bun x vitest run src/shared/branch-workspace-git-actions.test.ts`
Expected: PASS。

- [ ] **Step 3: 服务端接线**

在服务端 batch-set-upstream 执行器中,对每个 input:`action === 'set'` 走原路径(`git branch --set-upstream-to`);`action === 'unset'` 调用 `unsetUpstream`(`src/system/git/branches.ts`)。step 复用 `'upstream'`。

Run: 与该执行器相关的 vitest。
Expected: PASS。

- [ ] **Step 4: i18n**

新增 keys(四语言):
- `workspace.branch-workspace.git-action.remove-upstream` = 移除上游 / Remove upstream / 上流を削除 / 업스트림 제거
- `workspace.branch-workspace.git-action.remove-upstream-selected` = 已标记为移除上游 / Marked to remove upstream / ...

- [ ] **Step 5: UI 与执行编排**

在 `BatchSetUpstreamContent`:每行右侧渲染一个 `<Button variant="ghost" size="icon" data-testid=…>×</Button>`。父组件维护 `upstreamActions: Record<string, 'set' | 'unset'>`。提交 handler(现有 `selectedUpstreams`)按 action 分派构造入参。

新增 UI 测试:

```typescript
test('toggles a member into unset upstream mode and submits it with action=unset', async () => {
  render({ kind: 'batch-set-upstream', plan: upstreamPlan(), pending: false })
  const button = document.querySelector<HTMLButtonElement>('[data-testid="branch-workspace-batch-unset-upstream-api"]')!
  await act(async () => button.click())
  // ... 触发主按钮 ...
  expect(onBatchSetUpstream).toHaveBeenCalledWith([{ repositoryName: 'api', action: 'unset' }])
})
```

- [ ] **Step 6: 运行 typecheck + 全项测试**

Run:
```
bun run --silent tsc -p tsconfig.web.json --noEmit
bun x vitest run src/shared/branch-workspace-git-actions.test.ts src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.test.tsx
```
Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(branch-workspace): 批量更换上游支持批量移除上游"
```

---

### Task 9: 最终 verification

- [ ] **Step 1: 全量 typecheck**

Run: `bun run --silent tsc -p tsconfig.web.json --noEmit && bun run --silent tsc -p tsconfig.main.json --noEmit`
Expected: PASS。

- [ ] **Step 2: 全量 vitest**

Run: `bun x vitest run`
Expected: PASS。

- [ ] **Step 3: 报告**

汇报每项操作现在都是 Dialog、进度视图统一、`gitActionPanel` prop 已从 List 移除、批量移除上游可用。

