# 新增与删除子工作区弹窗 UI 优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不扩大弹窗页面占用、不改变业务流程的前提下，把新增与删除子工作区弹窗优化为可快速扫描的操作控制台。

**Architecture:** 为现有 `OneStepPlanningLayout` 增加默认关闭的 operation-console 呈现，只负责紧凑双栏、编号栏头和语义 tone。`BranchWorkspaceDialog` 仅在 create/remove 模式启用该呈现，并用局部无状态组件表达模式头部、删除范围、计划占位和步骤序号；服务端计划、表单状态与执行 hooks 保持不变。

**Tech Stack:** React 19、TypeScript strip-only、Tailwind CSS、Lucide React、Vitest、Bun、现有主题 contract。

## Global Constraints

- 只优化 `BranchWorkspaceDialog` 的 create/remove；extend/reduce/repair 和依赖维护弹窗保持 plain 呈现。
- 保持 `sm:max-w-5xl`、`max-h-[85vh]`、桌面约 3:2 双栏和右栏 18rem 最小宽度。
- 短内容自然收缩；长内容只滚动主体；头部和底部操作栏保持可见；窄屏无横向滚动。
- 只使用现有 success/danger/warning/background/card/muted/separator 语义变量，不硬编码 hex，不增加字体、依赖或动画系统。
- 不改变请求、自动规划、计划令牌、审批、执行、重试或强制删除安全规则。
- 普通删除使用 destructive，强制删除使用 destructive-soft；两者继续使用同一 readiness 与 approval 门。
- 使用 repo alias 和显式 `.ts`/`.tsx` 扩展名，不使用 Node strip-only 不支持的 TypeScript 语法。
- 不执行 `git commit`、`git push`、分支合并或 worktree 清理。

---

### Task 1: 增加可选的操作控制台布局

**Files:**

- Create: `src/web/components/repo-workspace/OneStepPlanningLayout.test.tsx`
- Modify: `src/web/components/repo-workspace/OneStepPlanningLayout.tsx`

**Interfaces:**

- Consumes: 现有 `enabled`、`testIdPrefix`、`title` 和 children。
- Produces: `OneStepPlanningPresentation = 'plain' | 'operation-console'`、`OneStepPlanningTone = 'constructive' | 'destructive'`，以及可选 `presentation`、`tone`、`step`、`description`；默认 plain 保持现状。

- [x] **Step 1: 写入布局视觉契约失败测试**

创建 jsdom 测试，验证 operation-console 的紧凑边界、响应式双栏、编号标题和 plain 回归：

```tsx
// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  OneStepPlanningLayout,
  OneStepPlanningPlanPane,
  OneStepPlanningSelectionPane,
} from '#/web/components/repo-workspace/OneStepPlanningLayout.tsx'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

test('renders the constructive operation console without increasing its viewport footprint', () => {
  act(() =>
    root.render(
      <OneStepPlanningLayout enabled testIdPrefix="workspace" presentation="operation-console" tone="constructive">
        <OneStepPlanningSelectionPane
          enabled
          testIdPrefix="workspace"
          title="Configure"
          description="Choose repositories"
          presentation="operation-console"
          tone="constructive"
          step="01"
        >
          selection
        </OneStepPlanningSelectionPane>
        <OneStepPlanningPlanPane
          enabled
          testIdPrefix="workspace"
          title="Plan"
          description="Review operations"
          presentation="operation-console"
          tone="constructive"
          step="02"
        >
          plan
        </OneStepPlanningPlanPane>
      </OneStepPlanningLayout>,
    ),
  )

  const layout = document.querySelector<HTMLElement>('[data-testid="workspace-one-step-layout"]')
  expect(layout?.dataset.presentation).toBe('operation-console')
  expect(layout?.dataset.tone).toBe('constructive')
  expect(layout?.className).toContain('gap-0')
  expect(layout?.className).toContain('overflow-x-hidden')
  expect(layout?.className).toContain('lg:grid-cols-[minmax(0,3fr)_minmax(18rem,2fr)]')
  expect(document.querySelector('[data-one-step-planning-step="01"]')?.textContent).toBe('01')
  expect(document.querySelector('[data-one-step-planning-step="02"]')?.textContent).toBe('02')
  expect(document.body.textContent).toContain('Choose repositories')
  expect(document.body.textContent).toContain('Review operations')
  expect(document.querySelector<HTMLElement>('[data-testid="workspace-plan-pane"]')?.className).toContain('lg:border-l')
})

test('keeps the default presentation plain', () => {
  act(() =>
    root.render(
      <OneStepPlanningLayout enabled testIdPrefix="workspace">
        plain
      </OneStepPlanningLayout>,
    ),
  )

  const layout = document.querySelector<HTMLElement>('[data-testid="workspace-one-step-layout"]')
  expect(layout?.dataset.presentation).toBe('plain')
  expect(layout?.className).toContain('gap-4')
  expect(layout?.className).not.toContain('rounded-lg')
})
```

- [x] **Step 2: 运行测试并确认 RED**

Run: `bun run test src/web/components/repo-workspace/OneStepPlanningLayout.test.tsx`

Expected: FAIL，因为新 props、data attributes 和 operation-console 样式尚不存在。

- [x] **Step 3: 实现最小布局 API**

在布局文件中加入导出类型和 pane header：

```tsx
export type OneStepPlanningPresentation = 'plain' | 'operation-console'
export type OneStepPlanningTone = 'constructive' | 'destructive'

interface OneStepPlanningLayoutProps {
  enabled: boolean
  testIdPrefix: string
  children: ReactNode
  presentation?: OneStepPlanningPresentation
  tone?: OneStepPlanningTone
}

interface OneStepPlanningPaneProps extends OneStepPlanningLayoutProps {
  title: string
  description?: string
  step?: string
}

function OneStepPlanningPaneHeader({
  title,
  description,
  step,
  tone,
}: Pick<OneStepPlanningPaneProps, 'title' | 'description' | 'step' | 'tone'>) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      {step ? (
        <span
          data-one-step-planning-step={step}
          aria-hidden="true"
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-md border font-mono text-[9px] font-semibold',
            tone === 'constructive' && 'border-success-border bg-success-surface text-success',
            tone === 'destructive' && 'border-danger-border bg-danger-surface text-danger',
          )}
        >
          {step}
        </span>
      ) : null}
      <div className="grid min-w-0 gap-0.5">
        <h3 className="text-xs font-semibold">{title}</h3>
        {description ? <p className="text-[10px] leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
    </div>
  )
}
```

`OneStepPlanningLayout` 在 console 模式使用：

```tsx
className={cn(
  !enabled && 'contents',
  enabled &&
    presentation === 'plain' &&
    'grid min-h-0 gap-4 overflow-x-hidden overflow-y-auto lg:grid-cols-[minmax(0,3fr)_minmax(18rem,2fr)] lg:overflow-visible',
  enabled &&
    presentation === 'operation-console' &&
    'grid min-h-0 gap-0 overflow-x-hidden overflow-y-auto rounded-lg border bg-card lg:grid-cols-[minmax(0,3fr)_minmax(18rem,2fr)] lg:overflow-visible',
  enabled && presentation === 'operation-console' && tone === 'constructive' && 'border-success-border/70',
  enabled && presentation === 'operation-console' && tone === 'destructive' && 'border-danger-border/70',
)}
```

selection pane 在 console 模式使用 `p-3 sm:p-4`，plan pane使用 `border-t bg-muted/10 p-3 sm:p-4 lg:border-t-0 lg:border-l`；两者继续保留 `lg:max-h-[65vh] lg:overflow-y-auto`。plain 模式保留现有 class。`data-presentation` 默认输出 `plain`，console 时同时输出 `data-tone`。

- [x] **Step 4: 运行布局测试并确认 GREEN**

Run: `bun run test src/web/components/repo-workspace/OneStepPlanningLayout.test.tsx`

Expected: 2 tests PASS。

---

### Task 2: 为新增与删除接入模式化操作控制台

**Files:**

- Modify: `src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceDialog.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/shared/i18n/dictionaries.test.ts`

**Interfaces:**

- Consumes: Task 1 的 operation-console props、现有 mode、`autoPlan.status`、`displayedPlan` 和提交 readiness。
- Produces: create/remove 模式头部、删除范围面板、计划状态卡、计划序号轨道、模式化目标摘要和主次删除按钮；不产生新状态。

- [x] **Step 1: 写入 create/remove 视觉契约失败测试**

在 `BranchWorkspaceDialog.test.tsx` 增加以下断言：

```tsx
test('presents create as a compact constructive operation console', () => {
  renderDialog({})

  const content = document.querySelector<HTMLElement>('[data-slot="dialog-content"]')
  const header = document.querySelector<HTMLElement>('[data-branch-workspace-operation-header]')
  const layout = document.querySelector<HTMLElement>('[data-testid="branch-workspace-one-step-layout"]')

  expect(content?.className).toContain('max-h-[85vh]')
  expect(content?.className).toContain('sm:max-w-5xl')
  expect(header?.dataset.tone).toBe('constructive')
  expect(header?.querySelector('.lucide-folder-plus')).not.toBeNull()
  expect(layout?.dataset.presentation).toBe('operation-console')
  expect(layout?.dataset.tone).toBe('constructive')
  expect(document.querySelector('[data-one-step-planning-step="01"]')).not.toBeNull()
  expect(document.querySelector('[data-one-step-planning-step="02"]')).not.toBeNull()
  expect(document.body.textContent).toContain('workspace.branch-workspace.one-step.selection-description.create')
  expect(document.body.textContent).toContain('workspace.branch-workspace.one-step.plan-description.create')
})

test('presents removal as a destructive operation console with one primary destructive action', () => {
  renderDialog({ mode: 'remove', workspace: existingWorkspace(), plan: removalPlan() })

  const header = document.querySelector<HTMLElement>('[data-branch-workspace-operation-header]')
  expect(header?.dataset.tone).toBe('destructive')
  expect(header?.querySelector('.lucide-trash-2')).not.toBeNull()
  expect(document.querySelector('[data-branch-workspace-delete-scope]')).not.toBeNull()
  expect(document.querySelector('[data-branch-workspace-delete-scope] .lucide-shield-alert')).not.toBeNull()
  expect(document.querySelector('[data-branch-workspace-target-summary]')?.className).toContain('border-danger-border')
  expect(document.querySelector('[data-action="force-confirm"]')?.getAttribute('data-variant')).toBe('destructive-soft')
  expect(document.querySelector('[data-action="confirm"]')?.getAttribute('data-variant')).toBe('destructive')
})

test.each([
  ['create', 'constructive'],
  ['remove', 'destructive'],
] as const)('renders a mode-aware plan placeholder for %s', (mode, tone) => {
  renderDialog({ mode, workspace: mode === 'remove' ? existingWorkspace() : null })

  const placeholder = document.querySelector<HTMLElement>('[data-plan-status]')
  expect(placeholder?.dataset.operationTone).toBe(tone)
  expect(placeholder?.querySelector('.lucide-clipboard-list')).not.toBeNull()
})

test('keeps extend and reduce on the plain presentation', () => {
  renderDialog({ mode: 'extend', workspace: existingWorkspace() })
  expect(
    document.querySelector<HTMLElement>('[data-testid="branch-workspace-one-step-layout"]')?.dataset.presentation,
  ).toBe('plain')
  expect(document.querySelector('[data-branch-workspace-operation-header]')).toBeNull()
})
```

在已有计划步骤测试中断言执行序号存在并按两位格式递增：

```tsx
expect(
  Array.from(document.querySelectorAll('[data-branch-workspace-plan-sequence]')).map((item) => item.textContent),
).toEqual(['01', '02'])
```

- [x] **Step 2: 写入四语言失败断言**

在字典测试中校验新增键及中文文案：

```ts
expect(zh['workspace.branch-workspace.one-step.selection-description.create']).toBe(
  '命名子工作区并选择要创建的成员工作树。',
)
expect(zh['workspace.branch-workspace.one-step.selection-description.remove']).toBe(
  '选择是否一并删除符合条件的本地和上游分支。',
)
expect(zh['workspace.branch-workspace.one-step.plan-description.create']).toBe('此清单将随配置自动更新。')
expect(zh['workspace.branch-workspace.one-step.plan-description.remove']).toBe('确认后将按此清单执行删除。')
```

四语言都增加同名键，继续由现有键集合测试保证一致。

- [x] **Step 3: 运行目标测试并确认 RED**

Run: `bun run test src/web/components/repo-workspace/OneStepPlanningLayout.test.tsx src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx src/shared/i18n/dictionaries.test.ts`

Expected: 新增 dialog 和字典断言 FAIL，因为模式 chrome、状态组件、序号和文案尚不存在。

- [x] **Step 4: 增加模式文案**

四语言字典新增：

```ts
'workspace.branch-workspace.one-step.selection-description.create': 'Name the branch workspace and choose its member worktrees.',
'workspace.branch-workspace.one-step.selection-description.remove':
  'Choose whether eligible local and upstream branches are deleted too.',
'workspace.branch-workspace.one-step.plan-description.create':
  'This list updates automatically with the configuration.',
'workspace.branch-workspace.one-step.plan-description.remove':
  'Confirmation deletes the workspace using this exact list.',
```

中文使用 Step 2 的精确文案。日文新增：

```ts
'workspace.branch-workspace.one-step.selection-description.create':
  '子ワークスペースに名前を付け、作成するメンバーワークツリーを選択します。',
'workspace.branch-workspace.one-step.selection-description.remove':
  '対象となるローカルブランチとアップストリームブランチも削除するか選択します。',
'workspace.branch-workspace.one-step.plan-description.create': 'この一覧は設定に合わせて自動更新されます。',
'workspace.branch-workspace.one-step.plan-description.remove': '確認すると、この一覧に従って削除します。',
```

韩文新增：

```ts
'workspace.branch-workspace.one-step.selection-description.create':
  '하위 작업 공간의 이름을 지정하고 만들 멤버 워크트리를 선택합니다.',
'workspace.branch-workspace.one-step.selection-description.remove':
  '해당하는 로컬 및 업스트림 브랜치도 삭제할지 선택합니다.',
'workspace.branch-workspace.one-step.plan-description.create': '이 목록은 설정에 따라 자동으로 업데이트됩니다.',
'workspace.branch-workspace.one-step.plan-description.remove': '확인하면 이 목록에 따라 삭제합니다.',
```

- [x] **Step 5: 接入模式头部和 operation-console**

导入 `AlertTriangle`、`ClipboardList`、`FolderPlus`、`ShieldAlert`、`Trash2`，并计算：

```tsx
const operationConsole = mode === 'create' || mode === 'remove'
const operationTone = mode === 'remove' ? 'destructive' : 'constructive'
```

create/remove 的 `DialogHeader` 增加 `data-branch-workspace-operation-header`、`data-tone`、模式图标和紧凑语义背景；保留现有标题、描述与同步按钮。`DialogContent` 仍保留 `max-h-[85vh] sm:max-w-5xl`，不得增加宽高。

布局和 pane 接入：

```tsx
<OneStepPlanningLayout
  enabled={oneStep}
  testIdPrefix="branch-workspace"
  presentation={operationConsole ? 'operation-console' : 'plain'}
  tone={operationTone}
>
  <OneStepPlanningSelectionPane
    enabled={oneStep}
    testIdPrefix="branch-workspace"
    title={t('workspace.branch-workspace.one-step.selection-title')}
    description={
      operationConsole
        ? t(`workspace.branch-workspace.one-step.selection-description.${mode as 'create' | 'remove'}`)
        : undefined
    }
    presentation={operationConsole ? 'operation-console' : 'plain'}
    tone={operationTone}
    step={operationConsole ? '01' : undefined}
  >
```

plan pane同样传 `step="02"` 和对应 plan description。避免类型断言扩散：可先计算仅 create/remove 分支使用的精确 translation key。

- [x] **Step 6: 重塑删除范围、状态和目标摘要**

删除范围使用一个面板：

```tsx
<div
  data-branch-workspace-delete-scope
  className="overflow-hidden rounded-md border border-danger-border bg-card text-xs"
>
  <div className="flex items-start gap-2 border-b border-danger-border/60 bg-danger-surface p-3">
    <ShieldAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
    <p className="leading-relaxed">{t('workspace.branch-workspace.delete-warning')}</p>
  </div>
  <div className="grid divide-y divide-danger-border/50">
    <label className="flex items-center gap-2 px-3 py-2.5">
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
    <label
      className={cn('flex items-center gap-2 px-3 py-2.5', (selectionLocked || !alsoDeleteBranch) && 'opacity-60')}
    >
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
</div>
```

增加 `BranchWorkspacePlanPlaceholder`：

```tsx
function BranchWorkspacePlanPlaceholder({
  status,
  tone,
}: {
  status: 'incomplete' | 'planning' | 'error'
  tone: 'constructive' | 'destructive'
}) {
  const t = useT()
  const icon =
    status === 'planning' ? (
      <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden="true" />
    ) : status === 'error' ? (
      <AlertTriangle className="size-4 shrink-0 text-danger" aria-hidden="true" />
    ) : (
      <ClipboardList className="size-4 shrink-0" aria-hidden="true" />
    )
  return (
    <div
      data-plan-status={status}
      data-operation-tone={tone}
      className={cn(
        'flex min-h-20 items-start gap-2 rounded-md border p-3 text-xs',
        status === 'error'
          ? 'border-danger-border bg-danger-surface text-danger'
          : 'border-separator bg-muted/20 text-muted-foreground',
      )}
      role="status"
    >
      {icon}
      <span className="leading-relaxed">
        {t(
          status === 'planning'
            ? 'workspace.branch-workspace.one-step.planning'
            : status === 'error'
              ? 'workspace.branch-workspace.one-step.plan-error'
              : 'workspace.branch-workspace.one-step.incomplete',
        )}
      </span>
    </div>
  )
}
```

`WorkspaceSummary` 增加可选 tone，并只在 remove operation-console 使用危险边界：

```tsx
function WorkspaceSummary({
  workspace,
  tone = 'neutral',
}: {
  workspace: BranchWorkspaceSnapshot
  tone?: 'neutral' | 'destructive'
}) {
  const t = useT()
  return (
    <div
      data-branch-workspace-target-summary
      className={cn(
        'grid gap-1 rounded-md border bg-muted/20 p-3 text-xs',
        tone === 'destructive' ? 'border-danger-border' : 'border-separator',
      )}
    >
      <div className="flex items-center gap-2 font-medium">
        <FolderKanban className="size-4" aria-hidden="true" />
        <span>{workspace.branch}</span>
      </div>
      <span className="break-all font-mono text-[10px] text-muted-foreground" title={workspace.path}>
        {workspace.path}
      </span>
      {workspace.issues.map((issue, index) => (
        <span key={`${issue.kind}-${index}`} className="text-warning">
          {t(issue.message ?? `workspace.branch-workspace.issue.${issue.kind}`)}
        </span>
      ))}
    </div>
  )
}
```

- [x] **Step 7: 增加计划序号轨道和底部主次动作**

`groupBranchCleanupSteps(displayedPlan.steps).map((item, index) => ...)` 中为每个展示项渲染：

```tsx
<span
  data-branch-workspace-plan-sequence={index + 1}
  aria-hidden="true"
  className="w-5 shrink-0 pt-0.5 font-mono text-[9px] font-medium tabular-nums text-muted-foreground"
>
  {String(index + 1).padStart(2, '0')}
</span>
```

序号位于行左侧，branch cleanup group 作为一个展示项只占一个序号。给计划列表增加 `overflow-hidden bg-card`，保持路径断行。

operation-console footer 使用 `-mx-4 -mb-4 border-t bg-muted/10 px-4 py-3`，窄屏按钮满宽。普通确认按钮在未显示执行 loader 时渲染 `FolderPlus` 或 `Trash2`；force-confirm 在 remove 使用 `destructive-soft`，普通 confirm 继续 `destructive`。

- [x] **Step 8: 运行目标测试并确认 GREEN**

Run: `bun run test src/web/components/repo-workspace/OneStepPlanningLayout.test.tsx src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx src/shared/i18n/dictionaries.test.ts`

Expected: 全部 PASS，且测试控制台无 React DOM nesting 或 act warning。

---

### Task 3: 视觉复核与完整验证

**Files:**

- Modify: `docs/superpowers/specs/2026-08-26-branch-workspace-create-remove-dialog-ui-design.md`
- Modify: `docs/superpowers/plans/2026-08-26-branch-workspace-create-remove-dialog-ui.md`

**Interfaces:**

- Consumes: Task 1-2 的最终 UI。
- Produces: 已实施设计状态、已勾选计划和完整验证证据。

- [x] **Step 1: 运行格式检查并修复本次文件**

Run: `bunx prettier --check src/web/components/repo-workspace/OneStepPlanningLayout.tsx src/web/components/repo-workspace/OneStepPlanningLayout.test.tsx src/web/components/repo-workspace/BranchWorkspaceDialog.tsx src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx src/shared/i18n/en.ts src/shared/i18n/zh.ts src/shared/i18n/ja.ts src/shared/i18n/ko.ts src/shared/i18n/dictionaries.test.ts docs/superpowers/specs/2026-08-26-branch-workspace-create-remove-dialog-ui-design.md docs/superpowers/plans/2026-08-26-branch-workspace-create-remove-dialog-ui.md`

Expected: PASS；若失败，只对列出的文件运行 `bunx prettier --write`，再重跑 check。

- [x] **Step 2: 检查桌面与窄屏占用**

在可用的本地渲染环境检查 create/remove：

```text
Desktop: width <= 5xl, height <= 85vh, 3:2 columns, independent body scroll
Compact: one column, no horizontal scroll, full-width footer buttons
Create: constructive header, neutral content, one primary create action
Remove: destructive header/target, readable neutral plan, soft force + solid delete
```

若无法启动带项目数据的渲染环境，记录限制，并用 DOM class 契约、路径断行 class 和响应式 class 作为可复现验证；不得宣称完成人工截图检查。

- [x] **Step 3: 运行静态验证**

Run: `bun run typecheck`

Expected: PASS。

Run: `bun run check:architecture`

Expected: PASS。

Run: `git diff --check`

Expected: PASS。

- [x] **Step 4: 运行完整回归测试**

Run: `bun run test`

Expected: PASS，既有一步式规划、依赖选择、删除安全和执行恢复无回归。

- [x] **Step 5: 更新规格与计划状态**

把设计规格状态从“已确认”改为“已实施”，并把本计划全部步骤改为 `[x]`。不创建 Git 提交。
