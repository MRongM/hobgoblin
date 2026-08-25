# 子工作区操作计划仓库依赖预览 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在新增子工作区和增加成员工作树的一步式弹窗右侧，按仓库展示服务端计划中已勾选的仓库依赖及复制/软链接方式。

**Architecture:** 继续以 `displayedPlan` 为操作计划的唯一权威来源。在已有 `create-worktree` 步骤中查找 `BranchWorkspaceRepositoryPlan`，由同文件的无状态预览组件投影 `worktreeBootstrap.selections`；跳过或空选择不渲染。

**Tech Stack:** React 19、TypeScript strip-only、Tailwind CSS、Lucide React、Vitest、Bun。

## Global Constraints

- 只覆盖 `BranchWorkspaceDialog` 的 `create-worktree` 计划步骤。
- 只展示 `displayedPlan.repositories[*].worktreeBootstrap`，不得读取左侧实时 selections。
- 只读展示已选相对路径和复制/软链接方式；不提供编辑控件。
- `skip` 或空 selections 不渲染依赖区域。
- 不修改共享协议、服务端、计划令牌、审批、执行流程、翻译字典或依赖。
- 使用 repo alias 与显式 `.ts`/`.tsx` 扩展名；不使用 Node strip-only 不支持的 TypeScript 语法。
- 不执行 `git commit`、`git push`、分支合并或 worktree 清理。

---

### Task 1: 测试并实现权威计划中的仓库依赖预览

**Files:**

- Modify: `src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceDialog.tsx`

**Interfaces:**

- Consumes: `BranchWorkspaceRepositoryPlan.worktreeBootstrap: WorktreeBootstrapDecision`。
- Produces: `BranchWorkspaceRepositoryDependencyPreview({ repository })`，无状态、无回调，仅渲染当前计划中的 materialize selections。

- [x] **Step 1: 写入 materialize 与 skip 的失败测试**

扩展现有创建来源预览测试，把计划仓库设为两个已选依赖，并增加一个 skip 断言：

```tsx
test('shows selected repository dependencies and modes from the reviewed plan', () => {
  const plan = approvalPlan()
  plan.repositories = [
    {
      repositoryName: 'api',
      repoId: '/workspace/api',
      targetBranch: 'feature/auth',
      creationBase: { kind: 'localBranch', branch: 'main' },
      syncBeforeCreate: false,
      branchOrigin: 'created',
      worktreePath: '/workspace/goblin-feature-auth/api',
      mode: {
        kind: 'newBranch',
        newBranch: 'feature/auth',
        creationBase: { kind: 'localBranch', branch: 'main' },
      },
      worktreeBootstrap: {
        kind: 'materialize',
        sourceWorktreePath: '/workspace/api-main',
        selections: [
          { path: 'node_modules', mode: 'copy' },
          { path: '.env.local', mode: 'symlink' },
        ],
      },
      confirmationRequired: false,
      satisfied: false,
      action: 'create-worktree',
    },
  ]
  plan.steps = [{ id: 'repository:api', kind: 'create-worktree', label: 'api', repositoryName: 'api' }]

  renderDialog({ plan })

  const preview = document.querySelector<HTMLElement>('[data-branch-workspace-plan-repository-dependencies="api"]')
  expect(preview?.textContent).toContain('workspace.branch-workspace.repository-dependencies')
  expect(planDependencyText('node_modules')).toContain('worktree-dependency-tree.copy')
  expect(planDependencyText('.env.local')).toContain('worktree-dependency-tree.symlink')
})
```

在已有 `worktreeBootstrap: { kind: 'skip' }` 的来源预览测试中增加：

```tsx
expect(document.querySelector('[data-branch-workspace-plan-repository-dependencies]')).toBeNull()
```

并加入测试辅助函数：

```tsx
function planDependencyText(path: string): string {
  return document.querySelector(`[data-branch-workspace-plan-repository-dependency="${path}"]`)?.textContent ?? ''
}
```

- [x] **Step 2: 运行目标测试并确认 RED**

Run: `bun run test src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx`

Expected: 新测试 FAIL，因为计划依赖预览尚未渲染。

- [x] **Step 3: 实现最小只读预览**

把计划步骤的左侧包装元素改成可合法容纳分组和列表的 `div`，并在创建来源后渲染预览：

```tsx
<div className="grid min-w-0 gap-0.5">
  <span>{step.label}</span>
  {creationRepository ? (
    <>
      <BranchWorkspaceCreationSourcePreview repository={creationRepository} />
      <BranchWorkspaceRepositoryDependencyPreview repository={creationRepository} />
    </>
  ) : null}
</div>
```

在 `BranchWorkspaceCreationSourcePreview` 后增加：

```tsx
function BranchWorkspaceRepositoryDependencyPreview({ repository }: { repository: BranchWorkspaceRepositoryPlan }) {
  const t = useT()
  if (repository.worktreeBootstrap.kind !== 'materialize') return null
  const { selections } = repository.worktreeBootstrap
  if (selections.length === 0) return null

  return (
    <div
      data-branch-workspace-plan-repository-dependencies={repository.repositoryName}
      role="group"
      aria-label={t('workspace.branch-workspace.repository-dependencies')}
      className="mt-1 grid gap-1.5 rounded-md border border-separator/60 bg-muted/15 p-2 font-normal"
    >
      <span className="text-[10px] font-medium text-muted-foreground">
        {t('workspace.branch-workspace.repository-dependencies')}
      </span>
      <ul className="grid gap-1">
        {selections.map((selection) => (
          <li
            key={selection.path}
            data-branch-workspace-plan-repository-dependency={selection.path}
            className="flex min-w-0 items-center gap-1.5 text-[10px]"
          >
            <Check className="size-3 shrink-0 text-success" aria-hidden="true" />
            <code className="min-w-0 break-all font-mono" title={selection.path}>
              {selection.path}
            </code>
            <span className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">
              {t(`worktree-dependency-tree.${selection.mode}`)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [x] **Step 4: 运行目标测试并确认 GREEN**

Run: `bun run test src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx`

Expected: PASS，materialize 依赖可见且 skip 无空区域。

- [x] **Step 5: 运行格式和静态验证**

Run: `bunx prettier --check src/web/components/repo-workspace/BranchWorkspaceDialog.tsx src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx docs/superpowers/specs/2026-08-25-branch-workspace-plan-repository-dependency-preview-design.md docs/superpowers/plans/2026-08-25-branch-workspace-plan-repository-dependency-preview.md`

Expected: PASS。

Run: `bun run typecheck`

Expected: PASS。

Run: `bun run check:architecture`

Expected: PASS。

- [x] **Step 6: 运行完整回归测试**

Run: `bun run test`

Expected: PASS，现有一步式规划、依赖选择和执行测试无回归。

- [x] **Step 7: 更新文档状态**

把设计文档状态改为“已实施”，并把本计划所有步骤标记为 `[x]`。不创建 Git 提交。
