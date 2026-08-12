# Branch Workspace Batch Merge Select-All Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan inline. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为子工作区批量合入与批量合出成员列表增加可访问的三态全选复选框。

**Architecture:** 在现有 Renderer 弹窗文件内增加一个共享的选择摘要控件。批量合入与批量合出各自计算可选成员集合，控件只根据可选集合和当前选择计算三态并回传完整的新选择，不修改服务端计划或执行输入协议。

**Tech Stack:** React 19、TypeScript strip-only、Radix Checkbox、Vitest、React DOM jsdom、项目 i18n 字典。

## Global Constraints

- 仅覆盖 `batch-merge-in` 与 `batch-merge-out`，不扩展提交、丢弃、拉取或推送的成员选择模型。
- 不可用成员不参与全选状态或批量切换。
- 执行锁定时全选控件必须禁用。
- 不新增依赖；repo-alias import 保留显式 `.ts` / `.tsx` 扩展名。
- Node.js strip-only 模式下不使用 enum、运行时 namespace、参数属性或 import alias。
- 用户未要求 Git 提交，本计划不执行 `git commit`。

---

### Task 1: 批量合并成员三态全选

**Files:**
- Modify: `src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.test.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`

**Interfaces:**
- Consumes: `Checkbox` 的 `checked: boolean | 'indeterminate'`、`onCheckedChange` 与批量合并弹窗已有 `onSelectedRepositoriesChange(repositoryNames: string[])`。
- Produces: `BatchMergeSelectionSummary`，接收 `selectableRepositories`、`selectedRepositories`、`disabled` 和 `onSelectedRepositoriesChange`；新增 i18n key `workspace.branch-workspace.git-action.select-all-members`。

- [x] **Step 1: 写入失败的三态行为测试**

在 `BranchWorkspaceGitActionDialog.test.tsx` 的批量合并测试中加入表驱动用例，并添加查询 helper：

```tsx
test.each([
  ['batch-merge-in', mergeInPlan],
  ['batch-merge-out', mergeOutPlan],
] as const)('supports tri-state select-all for %s eligible members', async (kind, createPlan) => {
  render({ kind, plan: createPlan() })

  const selectAll = mergeSelectAllCheckbox()
  expect(selectAll?.dataset.state).toBe('checked')
  expect(mergeCheckbox('docs')?.disabled).toBe(true)

  await act(async () => mergeCheckbox('web')?.click())
  expect(selectAll?.dataset.state).toBe('indeterminate')

  await act(async () => selectAll?.click())
  expect(mergeCheckbox('api')?.dataset.state).toBe('checked')
  expect(mergeCheckbox('web')?.dataset.state).toBe('checked')
  expect(mergeCheckbox('docs')?.dataset.state).toBe('unchecked')

  await act(async () => selectAll?.click())
  expect(mergeCheckbox('api')?.dataset.state).toBe('unchecked')
  expect(mergeCheckbox('web')?.dataset.state).toBe('unchecked')
})

function mergeSelectAllCheckbox(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>('[data-merge-select-all]')
}
```

在现有“执行开始后锁定选择”测试中增加：

```tsx
expect(mergeSelectAllCheckbox()?.disabled).toBe(true)
```

- [x] **Step 2: 运行目标测试并确认红灯**

Run: `bun run test src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.test.tsx`

Expected: FAIL；页面中不存在 `[data-merge-select-all]`，三态断言失败。

- [x] **Step 3: 实现共享全选摘要控件**

在 `BranchWorkspaceGitActionDialog.tsx` 中加入：

```tsx
function BatchMergeSelectionSummary({
  selectableRepositories,
  selectedRepositories,
  disabled,
  onSelectedRepositoriesChange,
}: {
  selectableRepositories: string[]
  selectedRepositories: string[]
  disabled: boolean
  onSelectedRepositoriesChange: (repositoryNames: string[]) => void
}) {
  const t = useT()
  const selected = new Set(selectedRepositories)
  const selectedCount = selectableRepositories.filter((repositoryName) => selected.has(repositoryName)).length
  const allSelected = selectableRepositories.length > 0 && selectedCount === selectableRepositories.length
  const checked = selectedCount === 0 ? false : allSelected ? true : 'indeterminate'

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Checkbox
        data-merge-select-all
        checked={checked}
        disabled={disabled || selectableRepositories.length === 0}
        aria-label={t('workspace.branch-workspace.git-action.select-all-members')}
        onCheckedChange={() =>
          onSelectedRepositoriesChange(allSelected ? [] : selectableRepositories)
        }
      />
      <span>{t('workspace.branch-workspace.git-action.select-all-members')}</span>
      <span className="ml-auto">
        {t('workspace.branch-workspace.git-action.selected-count', {
          selected: selectedCount,
          total: selectableRepositories.length,
        })}
      </span>
    </div>
  )
}
```

批量合入计算：

```tsx
const selectableRepositories =
  plan?.members
    .filter((member) => member.ready && member.sourceBranches.length > 0)
    .map((member) => member.repositoryName) ?? []
```

批量合出计算：

```tsx
const selectableRepositories =
  plan?.members
    .filter((member) => member.ready && member.destinationBranches.some((destination) => destination.ready))
    .map((member) => member.repositoryName) ?? []
```

两个弹窗都在进度块与成员列表之间渲染：

```tsx
<BatchMergeSelectionSummary
  selectableRepositories={selectableRepositories}
  selectedRepositories={selectedRepositories}
  disabled={locked}
  onSelectedRepositoriesChange={onSelectedRepositoriesChange}
/>
```

原来的 `selected-count` 段落移入共享控件；进度块仅在 `progress` 存在时渲染。

- [x] **Step 4: 补齐四种语言文案**

在四个字典相邻的批量合并 key 中加入：

```ts
// en.ts
'workspace.branch-workspace.git-action.select-all-members': 'Select all available members',
// zh.ts
'workspace.branch-workspace.git-action.select-all-members': '选择全部可用成员',
// ja.ts
'workspace.branch-workspace.git-action.select-all-members': '利用可能なメンバーをすべて選択',
// ko.ts
'workspace.branch-workspace.git-action.select-all-members': '사용 가능한 모든 멤버 선택',
```

- [x] **Step 5: 运行目标测试并确认绿灯**

Run: `bun run test src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.test.tsx`

Expected: PASS；批量合入和批量合出均通过默认全选、半选、恢复全选、取消全选、不可用成员隔离及锁定断言。

- [x] **Step 6: 运行完整验证**

Run: `bun run typecheck`

Expected: PASS，无 TypeScript 错误。

Run: `bun run test`

Expected: PASS，全部测试通过。

Run: `bun run check:architecture`

Expected: PASS，Renderer 变更未突破架构边界。

- [x] **Step 7: 检查变更范围**

Run: `git diff --check && git status --short`

Expected: 无空白错误；仅出现本设计、计划、组件、组件测试及四个 i18n 字典的预期变更，用户原有未跟踪或已修改文件保持不变。
