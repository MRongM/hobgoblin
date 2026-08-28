# 子工作区仓库依赖折叠摘要 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为新增子工作区和增加成员工作树的仓库依赖选择增加手动折叠与已选摘要，同时保持选择、读取和自动规划语义不变。

**Architecture:** 新增一个子工作区专用组合组件，复用 `WorktreeBootstrapSourcePicker` 和 `WorktreeDependencyTree`，只拥有 `collapsed` 本地展示状态。`BranchWorkspaceDialog` 继续拥有来源、受控 selections 和读取 pending；折叠时让依赖树保持挂载但使用 `hidden` 隐藏，避免重复读取和重规划。

**Tech Stack:** React 19、TypeScript strip-only、Tailwind CSS、Vitest、Bun。

## Global Constraints

- 只覆盖新增子工作区和增加成员工作树中的仓库依赖；不改变 `CreateWorktreeDialog` 和工作区根目录级依赖维护弹窗。
- 默认展开；至少选择一项后才显示手动收起动作；不自动收起。
- 收起摘要只显示已选相对路径和复制/软链接方式；来源选择器继续可见。
- 来源变化、依赖开关关闭或 selections 变空时恢复展开。
- 候选树收起时保持挂载，不重复读取目录，不改变 pending，不触发自动规划。
- 不增加共享协议、服务端字段、持久化状态、全局 Store 或依赖。
- 使用 repo alias 与显式 `.ts`/`.tsx` 扩展名；不使用 Node strip-only 不支持的 TypeScript 语法。
- 不执行 `git commit`、`git push`、分支合并或 worktree 清理。

---

### Task 1: 新增仓库依赖折叠组合组件

**Files:**

- Create: `src/web/components/repo-workspace/BranchWorkspaceRepositoryDependencySelection.tsx`
- Create: `src/web/components/repo-workspace/BranchWorkspaceRepositoryDependencySelection.test.tsx`

**Interfaces:**

- Consumes: `RepositoryDependencySource`、`WorktreeBootstrapSelection`、`WorktreeBootstrapSourcePicker`、`WorktreeDependencyTree`。
- Produces: `BranchWorkspaceRepositoryDependencySelection(props)`，只管理折叠投影，所有业务输入保持受控。

- [x] **Step 1: 写入折叠与摘要的失败测试**

测试文件使用受控 harness，根目录返回 `node_modules`、`.env.local` 和一个未选候选 `coverage`：

```tsx
// @vitest-environment jsdom

import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { WorktreeBootstrapSelection } from '#/shared/worktree-bootstrap-summary.ts'
import { BranchWorkspaceRepositoryDependencySelection } from '#/web/components/repo-workspace/BranchWorkspaceRepositoryDependencySelection.tsx'
import type { RepositoryDependencySource } from '#/web/components/repo-workspace/branch-workspace-repository-dependency-source.ts'

const mocks = vi.hoisted(() => ({ getRepositoryFileTree: vi.fn() }))

vi.mock('#/web/repo-client.ts', () => ({ getRepositoryFileTree: mocks.getRepositoryFileTree }))
vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  mocks.getRepositoryFileTree.mockResolvedValue({
    ok: true,
    worktreePath: '/repo-a',
    dirPath: '/repo-a',
    entries: [
      { name: 'node_modules', absolutePath: '/repo-a/node_modules', relativePath: 'node_modules', kind: 'directory' },
      { name: '.env.local', absolutePath: '/repo-a/.env.local', relativePath: '.env.local', kind: 'file' },
      { name: 'coverage', absolutePath: '/repo-a/coverage', relativePath: 'coverage', kind: 'directory' },
    ],
  })
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
})

test('collapses to a selected-only summary without remounting the dependency tree', async () => {
  renderHarness()
  await flush()
  expect(document.querySelector('[data-action="collapse-repository-dependencies"]')).toBeNull()

  click('[data-worktree-dependency-path="node_modules"]')
  click('[data-worktree-dependency-path=".env.local"]')
  changeSelect('[data-worktree-dependency-mode=".env.local"]', 'symlink')
  expect(document.querySelector('[data-action="collapse-repository-dependencies"]')).not.toBeNull()

  click('[data-action="collapse-repository-dependencies"]')
  expect(document.querySelector<HTMLElement>('[data-branch-workspace-repository-dependency-tree]')?.hidden).toBe(true)
  expect(summaryText('node_modules')).toContain('worktree-dependency-tree.copy')
  expect(summaryText('.env.local')).toContain('worktree-dependency-tree.symlink')
  expect(document.querySelector('[data-repository-dependency-summary="coverage"]')).toBeNull()
  expect(mocks.getRepositoryFileTree).toHaveBeenCalledTimes(1)

  click('[data-action="expand-repository-dependencies"]')
  expect(document.querySelector<HTMLElement>('[data-branch-workspace-repository-dependency-tree]')?.hidden).toBe(false)
  expect(document.querySelector<HTMLInputElement>('[data-worktree-dependency-path="node_modules"]')?.checked).toBe(true)
  expect(mocks.getRepositoryFileTree).toHaveBeenCalledTimes(1)
})

test('expands and clears the summary when the source changes', async () => {
  renderHarness()
  await flush()
  click('[data-worktree-dependency-path="node_modules"]')
  click('[data-action="collapse-repository-dependencies"]')

  changeSelect('[data-worktree-bootstrap-source-select]', 'worktree:/repo-b')

  expect(document.querySelector<HTMLElement>('[data-branch-workspace-repository-dependency-tree]')?.hidden).toBe(false)
  expect(document.querySelector('[data-branch-workspace-repository-dependency-summary]')).toBeNull()
  expect(document.querySelector('[data-action="collapse-repository-dependencies"]')).toBeNull()
})

test('keeps collapse state independent between repository instances', async () => {
  act(() =>
    root.render(
      <>
        <StaticSelection repoId="repo-1" path="node_modules" />
        <StaticSelection repoId="repo-2" path=".env.local" />
      </>,
    ),
  )
  await flush()

  const first = dependencySelection('repo-1')
  const second = dependencySelection('repo-2')
  act(() => first.querySelector<HTMLButtonElement>('[data-action="collapse-repository-dependencies"]')?.click())

  expect(first.querySelector<HTMLElement>('[data-branch-workspace-repository-dependency-tree]')?.hidden).toBe(true)
  expect(second.querySelector<HTMLElement>('[data-branch-workspace-repository-dependency-tree]')?.hidden).toBe(false)
})

test('keeps the display toggle available while dependency inputs are disabled', async () => {
  act(() => root.render(<StaticSelection repoId="repo-1" path="node_modules" disabled />))
  await flush()

  expect(document.querySelector<HTMLSelectElement>('[data-worktree-bootstrap-source-select]')?.disabled).toBe(true)
  expect(document.querySelector<HTMLInputElement>('[data-worktree-dependency-path="node_modules"]')?.disabled).toBe(
    true,
  )
  const collapse = document.querySelector<HTMLButtonElement>('[data-action="collapse-repository-dependencies"]')
  expect(collapse?.disabled).toBe(false)
  act(() => collapse?.click())
  expect(document.querySelector('[data-repository-dependency-summary="node_modules"]')).not.toBeNull()
})
```

Harness 使用两个来源，并在来源回调中清空 selections：

```tsx
const sources: RepositoryDependencySource[] = [
  { id: 'worktree:/repo-a', kind: 'primary', worktreePath: '/repo-a', branch: 'main' },
  { id: 'worktree:/repo-b', kind: 'branch', worktreePath: '/repo-b', branch: 'develop' },
]

function Harness() {
  const [source, setSource] = useState(sources[0]!)
  const [selections, setSelections] = useState<WorktreeBootstrapSelection[]>([])
  return (
    <BranchWorkspaceRepositoryDependencySelection
      repoId="repo-1"
      source={source}
      sourceOptions={sources}
      selections={selections}
      disabled={false}
      onSourceChange={(nextSource) => {
        setSelections([])
        setSource(nextSource)
      }}
      onSelectionsChange={setSelections}
    />
  )
}

function StaticSelection({ repoId, path, disabled = false }: { repoId: string; path: string; disabled?: boolean }) {
  return (
    <BranchWorkspaceRepositoryDependencySelection
      repoId={repoId}
      source={sources[0]!}
      sourceOptions={sources}
      selections={[{ path, mode: 'copy' }]}
      disabled={disabled}
      onSourceChange={() => {}}
      onSelectionsChange={() => {}}
    />
  )
}

function renderHarness() {
  act(() => root.render(<Harness />))
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function click(selector: string) {
  const element = document.querySelector<HTMLElement>(selector)
  if (!element) throw new Error(`Missing element: ${selector}`)
  act(() => element.click())
}

function changeSelect(selector: string, value: string) {
  const element = document.querySelector<HTMLSelectElement>(selector)
  if (!element) throw new Error(`Missing select: ${selector}`)
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(element, value)
    element.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

function summaryText(path: string): string {
  return document.querySelector(`[data-repository-dependency-summary="${path}"]`)?.textContent ?? ''
}

function dependencySelection(repoId: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(
    `[data-branch-workspace-repository-dependency-selection="${repoId}"]`,
  )
  if (!element) throw new Error(`Missing dependency selection: ${repoId}`)
  return element
}
```

- [x] **Step 2: 运行测试并确认 RED**

Run: `bun run test src/web/components/repo-workspace/BranchWorkspaceRepositoryDependencySelection.test.tsx`

Expected: FAIL，因为组件模块尚不存在。

- [x] **Step 3: 实现窄职责组合组件**

```tsx
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import type { WorktreeBootstrapSelection } from '#/shared/worktree-bootstrap-summary.ts'
import { WorktreeBootstrapSourcePicker } from '#/web/components/WorktreeBootstrapSourcePicker.tsx'
import { WorktreeDependencyTree } from '#/web/components/WorktreeDependencyTree.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import type { RepositoryDependencySource } from '#/web/components/repo-workspace/branch-workspace-repository-dependency-source.ts'
import { useT } from '#/web/stores/i18n.ts'

interface BranchWorkspaceRepositoryDependencySelectionProps {
  repoId: string
  source: RepositoryDependencySource
  sourceOptions: readonly RepositoryDependencySource[]
  selections: readonly WorktreeBootstrapSelection[]
  disabled?: boolean
  onSourceChange: (source: RepositoryDependencySource) => void
  onSelectionsChange: (selections: WorktreeBootstrapSelection[]) => void
  onPendingChange?: (pending: boolean) => void
}

export function BranchWorkspaceRepositoryDependencySelection({
  repoId,
  source,
  sourceOptions,
  selections,
  disabled = false,
  onSourceChange,
  onSelectionsChange,
  onPendingChange,
}: BranchWorkspaceRepositoryDependencySelectionProps) {
  const t = useT()
  const treeId = useId()
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => setCollapsed(false), [source.id])
  useEffect(() => {
    if (selections.length === 0) setCollapsed(false)
  }, [selections.length])

  const toggleKey = collapsed
    ? 'workspace.branch-workspace.repository-dependencies-expand'
    : 'workspace.branch-workspace.repository-dependencies-collapse'

  return (
    <div data-branch-workspace-repository-dependency-selection={repoId} className="grid gap-2">
      <WorktreeBootstrapSourcePicker
        source={source}
        options={sourceOptions}
        pending={disabled}
        onSourceChange={(nextSource) => {
          setCollapsed(false)
          onSourceChange(nextSource)
        }}
      />
      {selections.length > 0 ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-action={collapsed ? 'expand-repository-dependencies' : 'collapse-repository-dependencies'}
            aria-expanded={!collapsed}
            aria-controls={treeId}
            onClick={() => setCollapsed((current) => !current)}
          >
            {collapsed ? <ChevronRight aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
            {t(toggleKey)}
          </Button>
        </div>
      ) : null}
      {collapsed ? (
        <ul
          data-branch-workspace-repository-dependency-summary
          aria-label={t('workspace.branch-workspace.repository-dependencies')}
          className="grid gap-1 rounded-md border border-separator bg-muted/20 p-2"
        >
          {selections.map((selection) => (
            <li
              key={selection.path}
              data-repository-dependency-summary={selection.path}
              className="flex min-w-0 items-center justify-between gap-2 text-xs"
            >
              <span className="min-w-0 truncate font-mono" title={selection.path}>
                {selection.path}
              </span>
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {t(`worktree-dependency-tree.${selection.mode}`)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <div id={treeId} hidden={collapsed} data-branch-workspace-repository-dependency-tree>
        <WorktreeDependencyTree
          repoId={repoId}
          sourceWorktreePath={source.worktreePath}
          selections={selections}
          disabled={disabled}
          onSelectionsChange={onSelectionsChange}
          onPendingChange={onPendingChange}
        />
      </div>
    </div>
  )
}
```

- [x] **Step 4: 运行测试并确认 GREEN**

Run: `bun run test src/web/components/repo-workspace/BranchWorkspaceRepositoryDependencySelection.test.tsx`

Expected: PASS，折叠摘要、来源重置、树保持挂载和无重复根读取均有证据。

### Task 2: 接入子工作区弹窗并补齐四语言文案

**Files:**

- Modify: `src/web/components/repo-workspace/BranchWorkspaceDialog.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/shared/i18n/dictionaries.test.ts`

**Interfaces:**

- Consumes: Task 1 的 `BranchWorkspaceRepositoryDependencySelection`。
- Produces: 新增/扩展流程中每个仓库独立的折叠摘要；生命周期计划请求保持现有 `worktreeBootstrap` 结构。

- [x] **Step 1: 写入子工作区集成的失败断言**

扩展现有“loads and submits repository dependencies with default copy mode”测试：

```tsx
clickSelector('[data-worktree-dependency-path="node_modules"]')
await expectAutoPreview(onPreview, expectedCreateRequest)
onPreview.mockClear()

clickSelector('[data-action="collapse-repository-dependencies"]')
expect(document.querySelector<HTMLElement>('[data-branch-workspace-repository-dependency-tree]')?.hidden).toBe(true)
expect(document.querySelector('[data-repository-dependency-summary="node_modules"]')?.textContent).toContain(
  'worktree-dependency-tree.copy',
)
expect(document.querySelector('[data-worktree-bootstrap-source-select]')).not.toBeNull()
await flushAsyncWork()
expect(onPreview).not.toHaveBeenCalled()

clickSelector('[data-action="expand-repository-dependencies"]')
expect(document.querySelector<HTMLInputElement>('[data-worktree-dependency-path="node_modules"]')?.checked).toBe(true)
expect(mocks.getRepositoryFileTree).toHaveBeenCalledTimes(1)
```

在“clears repository dependency choices when disabled”测试中，先折叠再关闭开关；重新开启后断言树展开且没有摘要。

增加扩展流程覆盖，证明共用区域在增加成员工作树时同样提供折叠摘要：

```tsx
test('offers the repository dependency summary while extending a branch workspace', async () => {
  mocks.getRepositoryFileTree.mockResolvedValue({
    ok: true,
    worktreePath: '/workspace/web-main',
    dirPath: '/workspace/web-main',
    entries: [
      {
        name: 'node_modules',
        absolutePath: '/workspace/web-main/node_modules',
        relativePath: 'node_modules',
        kind: 'directory',
      },
    ],
  })
  renderDialog({
    mode: 'extend',
    workspace: existingWorkspace(),
    repositories: [
      { id: '/workspace/api', name: 'api', available: true, branches: ['main'], defaultBranch: 'main' },
      {
        id: '/workspace/web',
        name: 'web',
        available: true,
        branches: ['trunk'],
        defaultBranch: 'trunk',
        worktrees: [{ path: '/workspace/web-main', branch: 'trunk', isMain: true }],
      },
    ],
  })

  click('workspace.branch-workspace.repository-named')
  click('workspace.branch-workspace.repository-dependencies-toggle-named')
  await flushAsyncWork()
  clickSelector('[data-worktree-dependency-path="node_modules"]')

  expect(document.querySelector('[data-action="collapse-repository-dependencies"]')).not.toBeNull()
})
```

- [x] **Step 2: 运行集成测试并确认 RED**

Run: `bun run test src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx -t "repository dependenc"`

Expected: FAIL，因为弹窗尚未渲染折叠组合组件。

- [x] **Step 3: 用组合组件替换来源选择器与依赖树 JSX**

移除 `BranchWorkspaceDialog.tsx` 对 `WorktreeBootstrapSourcePicker` 和 `WorktreeDependencyTree` 的直接 import，增加：

```tsx
import { BranchWorkspaceRepositoryDependencySelection } from '#/web/components/repo-workspace/BranchWorkspaceRepositoryDependencySelection.tsx'
```

把现有两个组件替换为：

```tsx
<BranchWorkspaceRepositoryDependencySelection
  repoId={repository.id}
  source={dependencySource}
  sourceOptions={dependencySources.options}
  selections={repositoryBootstrapSelections[repository.name] ?? []}
  disabled={selectionLocked}
  onSourceChange={(source) => {
    setRepositoryDependencyReadPending((current) => ({
      ...current,
      [repository.name]: true,
    }))
    setRepositoryBootstrapSources((current) => ({
      ...current,
      [repository.name]: source,
    }))
    setRepositoryBootstrapSelections((current) => ({
      ...current,
      [repository.name]: [],
    }))
  }}
  onPendingChange={(nextPending) =>
    setRepositoryDependencyReadPending((current) =>
      current[repository.name] === nextPending ? current : { ...current, [repository.name]: nextPending },
    )
  }
  onSelectionsChange={(selections) =>
    setRepositoryBootstrapSelections((current) => ({
      ...current,
      [repository.name]: selections,
    }))
  }
/>
```

- [x] **Step 4: 增加四语言文案与字典一致性断言**

新增键：

```ts
// en
'workspace.branch-workspace.repository-dependencies-collapse': 'Collapse selected dependencies',
'workspace.branch-workspace.repository-dependencies-expand': 'Expand to edit',

// zh
'workspace.branch-workspace.repository-dependencies-collapse': '收起已选依赖',
'workspace.branch-workspace.repository-dependencies-expand': '展开修改',

// ja
'workspace.branch-workspace.repository-dependencies-collapse': '選択した依存関係を折りたたむ',
'workspace.branch-workspace.repository-dependencies-expand': '展開して編集',

// ko
'workspace.branch-workspace.repository-dependencies-collapse': '선택한 종속성 접기',
'workspace.branch-workspace.repository-dependencies-expand': '펼쳐서 수정',
```

在 `dictionaries.test.ts` 增加精确断言，覆盖四个字典的两个键。

- [x] **Step 5: 运行组件、集成和字典测试并确认 GREEN**

Run: `bun run test src/web/components/repo-workspace/BranchWorkspaceRepositoryDependencySelection.test.tsx src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx src/web/components/WorktreeDependencyTree.test.tsx src/web/components/CreateWorktreeDialog.test.tsx src/shared/i18n/dictionaries.test.ts`

Expected: PASS；新折叠交互通过，共享树和单仓库创建入口无回归。

### Task 3: 文档、自审和全量质量门

**Files:**

- Modify: `docs/superpowers/specs/2026-08-25-branch-workspace-repository-dependency-collapse-design.md`
- Modify: `docs/superpowers/plans/2026-08-25-branch-workspace-repository-dependency-collapse.md`

**Interfaces:**

- Consumes: Tasks 1–2 的最终实现和测试结果。
- Produces: 已实施规格、完成清单和完整验证证据。

- [x] **Step 1: 格式化并检查全部范围文件**

Run: `bunx prettier --write src/web/components/repo-workspace/BranchWorkspaceRepositoryDependencySelection.tsx src/web/components/repo-workspace/BranchWorkspaceRepositoryDependencySelection.test.tsx src/web/components/repo-workspace/BranchWorkspaceDialog.tsx src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx src/shared/i18n/en.ts src/shared/i18n/zh.ts src/shared/i18n/ja.ts src/shared/i18n/ko.ts src/shared/i18n/dictionaries.test.ts docs/superpowers/specs/2026-08-25-branch-workspace-repository-dependency-collapse-design.md docs/superpowers/plans/2026-08-25-branch-workspace-repository-dependency-collapse.md`

Expected: exit 0。

Run: `bunx prettier --check src/web/components/repo-workspace/BranchWorkspaceRepositoryDependencySelection.tsx src/web/components/repo-workspace/BranchWorkspaceRepositoryDependencySelection.test.tsx src/web/components/repo-workspace/BranchWorkspaceDialog.tsx src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx src/shared/i18n/en.ts src/shared/i18n/zh.ts src/shared/i18n/ja.ts src/shared/i18n/ko.ts src/shared/i18n/dictionaries.test.ts docs/superpowers/specs/2026-08-25-branch-workspace-repository-dependency-collapse-design.md docs/superpowers/plans/2026-08-25-branch-workspace-repository-dependency-collapse.md`

Expected: `All matched files use Prettier code style!`

- [x] **Step 2: 运行类型、架构和全量测试**

Run: `bun run typecheck`

Expected: `[typecheck] all projects passed`。

Run: `bun run check:architecture`

Expected: `[architecture] import boundaries passed`。

Run: `bun run test`

Expected: 所有测试文件通过；允许仓库既有显式 skip，不允许新增失败。

Run: `git diff --check`

Expected: exit 0，无输出。

- [x] **Step 3: 对照规格完成自审并更新状态**

逐项确认默认展开、手动收起、只显示已选摘要、来源保留、树保持挂载、来源/空选择重置、多仓库隔离、自动规划不受折叠影响、单仓库入口不变和四语言一致均有实现或测试证据。全部通过后把规格状态从 `已确认` 改为 `已实施`，勾选本计划全部步骤并记录最终测试计数。

## Self-Review

- Spec coverage: Task 1 覆盖组合组件的展开、摘要、保持挂载和来源重置；Task 2 覆盖子工作区集成、自动规划不变、关闭开关重置、单仓库回归和四语言；Task 3 覆盖完整质量门与状态收尾。
- Placeholder scan: 计划没有未定义后续工作；所有代码修改步骤给出实际类型、属性、选择器、文案和命令。
- Type consistency: `sourceOptions`、`selections`、`onSourceChange`、`onSelectionsChange`、`onPendingChange` 与现有来源类型、树组件及弹窗状态一致。

## Verification Evidence

- 新组合组件：4/4 passed。
- 聚焦组件、弹窗、共享树、单仓库创建和字典回归：145/145 passed。
- `bun run typecheck`：all projects passed。
- `bun run check:architecture`：import boundaries passed。
- `bun run test`：425/425 test files passed；4,480 passed，1 skipped。
- 范围文件 Prettier check 和 `git diff --check`：passed。
