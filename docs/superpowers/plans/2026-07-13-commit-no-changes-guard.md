# Commit No-Changes Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 点击 Commit 时，若当前 worktree status 为空，用 toast 通知用户而非打开提交框。

**Architecture:** 在 `useBranchWriteActions` 的 `commit` item `onSelect` 中前置检查 `repo.data.status`，找到对应 worktree 的条目，entries 为空时调用 `toast.info` 并 return。新增 i18n 键 `action.commit-no-changes` 覆盖四种语言。

**Tech Stack:** React, Zustand, sonner (toast), Vitest + jsdom

---

## File Map

| 文件 | 操作 |
|------|------|
| `src/web/hooks/useBranchWriteActions.tsx` | 修改：添加 `toast` import，`commit` onSelect 加检查 |
| `src/shared/i18n/en.ts` | 修改：新增 `action.commit-no-changes` |
| `src/shared/i18n/zh.ts` | 修改：新增 `action.commit-no-changes` |
| `src/shared/i18n/ja.ts` | 修改：新增 `action.commit-no-changes` |
| `src/shared/i18n/ko.ts` | 修改：新增 `action.commit-no-changes` |
| `src/web/hooks/useBranchWriteActions.test.tsx` | 修改：新增 2 个测试用例 |

---

### Task 1: 新增 i18n 键

**Files:**
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`

- [ ] **Step 1: 在 en.ts 中添加键**

找到 `'action.commit-title': 'Commit all changes',` 这一行，在其后插入：

```ts
  'action.commit-no-changes': 'No changes to commit.',
```

- [ ] **Step 2: 在 zh.ts 中添加键**

找到 `'action.commit-title': '提交所有更改',` 这一行，在其后插入：

```ts
  'action.commit-no-changes': '没有待提交的改动。',
```

- [ ] **Step 3: 在 ja.ts 中添加键**

找到 `'action.commit-title': '全変更をコミット',` 这一行，在其后插入：

```ts
  'action.commit-no-changes': 'コミットすべき変更はありません。',
```

- [ ] **Step 4: 在 ko.ts 中添加键**

找到 `'action.commit-title': '모든 변경사항 커밋',` 这一行，在其后插入：

```ts
  'action.commit-no-changes': '커밋할 변경 사항이 없습니다.',
```

- [ ] **Step 5: Commit**

```bash
git add src/shared/i18n/en.ts src/shared/i18n/zh.ts src/shared/i18n/ja.ts src/shared/i18n/ko.ts
git commit -m "feat(i18n): add action.commit-no-changes key for all languages"
```

---

### Task 2: 为 commit no-changes 写失败测试

**Files:**
- Modify: `src/web/hooks/useBranchWriteActions.test.tsx`

背景：测试文件已有 `vi.mock` 覆盖 `InlineCommitDraftProvider` 和 `repo-client`，使用 jsdom 环境，通过 `BranchWriteActionsHarness` 渲染 hook。

需要 mock `sonner` 以便断言 `toast.info` 被调用。

- [ ] **Step 1: 在测试文件顶部添加 sonner mock**

在现有 `vi.mock('#/web/repo-client.ts', ...)` 块之后添加：

```ts
const toastMock = vi.hoisted(() => ({ info: vi.fn() }))
vi.mock('sonner', () => ({ toast: toastMock }))
```

- [ ] **Step 2: 将 openDraft mock 提升为可访问的 spy**

将现有的 `vi.mock('#/web/components/branch-list/InlineCommitDraftProvider.tsx', ...)` 替换为：

```ts
const draftMocks = vi.hoisted(() => ({ openDraft: vi.fn() }))
vi.mock('#/web/components/branch-list/InlineCommitDraftProvider.tsx', () => ({
  useInlineCommitDraft: () => null,
  useInlineCommitDraftActions: () => ({
    openDraft: draftMocks.openDraft,
    clearDraft: vi.fn(),
    setMessage: vi.fn(),
    setError: vi.fn(),
    generateMessage: vi.fn(),
    applyPendingGeneratedMessage: vi.fn(),
    clearPendingGeneratedMessage: vi.fn(),
  }),
  useInlineCommitMessageProviders: () => [],
}))
```

- [ ] **Step 3: 添加"无变更时不打开提交框，触发 toast"测试**

在 `describe('useBranchWriteActions', () => {` 内、现有测试之后添加：

```ts
test('commit action shows toast and does not open draft when worktree has no changes', async () => {
  const repo = seedRepoState({
    id: REPO_ID,
    branches: [createRepoBranch('feature/current', { worktree: { path: '/tmp/repo-feature' } })],
    currentBranch: 'feature/current',
    status: [{ path: '/tmp/repo-feature', entries: [] }],
  })
  let actions: ReturnType<typeof useBranchWriteActions> | null = null

  root = createRoot(container)
  await act(async () => {
    root!.render(
      <BranchWriteActionsHarness repo={repo} onPush={vi.fn()} onReady={(value) => (actions = value)} />,
    )
  })

  await act(async () => {
    actions?.mainItems.find((item) => item.id === 'commit')?.onSelect()
  })

  expect(toastMock.info).toHaveBeenCalledWith('action.commit-no-changes')
  expect(draftMocks.openDraft).not.toHaveBeenCalled()
})
```

- [ ] **Step 4: 添加"有变更时正常打开提交框"测试**

```ts
test('commit action opens draft when worktree has changes', async () => {
  const repo = seedRepoState({
    id: REPO_ID,
    branches: [createRepoBranch('feature/current', { worktree: { path: '/tmp/repo-feature' } })],
    currentBranch: 'feature/current',
    status: [{ path: '/tmp/repo-feature', entries: [{ path: 'README.md', status: 'M' as const, staged: false }] }],
  })
  let actions: ReturnType<typeof useBranchWriteActions> | null = null

  root = createRoot(container)
  await act(async () => {
    root!.render(
      <BranchWriteActionsHarness repo={repo} onPush={vi.fn()} onReady={(value) => (actions = value)} />,
    )
  })

  await act(async () => {
    actions?.mainItems.find((item) => item.id === 'commit')?.onSelect()
  })

  expect(toastMock.info).not.toHaveBeenCalled()
  expect(draftMocks.openDraft).toHaveBeenCalledWith(REPO_ID, '/tmp/repo-feature')
})
```

- [ ] **Step 5: 运行测试，确认新增测试失败**

```bash
npx vitest run src/web/hooks/useBranchWriteActions.test.tsx
```

期望输出：2 个新增测试 **FAIL**（功能尚未实现），已有测试 **PASS**。

---

### Task 3: 实现 commit 无变更检查

**Files:**
- Modify: `src/web/hooks/useBranchWriteActions.tsx`

- [ ] **Step 1: 添加 sonner 和 toast import**

在文件顶部现有 import 列表末尾添加（紧接 `import { useT }` 之后）：

```ts
import { toast } from 'sonner'
```

- [ ] **Step 2: 修改 commit item 的 onSelect**

找到 `useBranchWriteActions` 函数体内的 `mainItems` 数组中 `commit` 项：

```ts
    {
      id: 'commit',
      label: t('action.commit'),
      title: t('action.commit-title'),
      disabled: !hasWorktree || branchActionBusy,
      visible: true,
      icon: createElement(SendHorizontal),
      onSelect: () => {
        if (worktreePath) inlineCommitDraftActions.openDraft(repo.id, worktreePath)
      },
    },
```

替换为：

```ts
    {
      id: 'commit',
      label: t('action.commit'),
      title: t('action.commit-title'),
      disabled: !hasWorktree || branchActionBusy,
      visible: true,
      icon: createElement(SendHorizontal),
      onSelect: () => {
        if (!worktreePath) return
        const worktreeStatus = repo.data.status.find((s) => s.path === worktreePath)
        if (!worktreeStatus || worktreeStatus.entries.length === 0) {
          toast.info(t('action.commit-no-changes'))
          return
        }
        inlineCommitDraftActions.openDraft(repo.id, worktreePath)
      },
    },
```

- [ ] **Step 3: 运行测试，确认全部通过**

```bash
npx vitest run src/web/hooks/useBranchWriteActions.test.tsx
```

期望输出：**所有测试 PASS**。

- [ ] **Step 4: Commit**

```bash
git add src/web/hooks/useBranchWriteActions.tsx src/web/hooks/useBranchWriteActions.test.tsx
git commit -m "feat(branch-area): guard commit action when worktree has no changes"
```

---

## Self-Review

**Spec coverage:**
- ✅ 无变更时不触发提交框 → Task 3 Step 2
- ✅ 无变更时发送 toast 通知 → Task 3 Step 2
- ✅ 有变更时正常打开提交框 → Task 3 Step 2（保留原有逻辑）
- ✅ i18n 四语言 → Task 1
- ✅ 测试覆盖两条路径 → Task 2

**Placeholder scan:** 无 TBD/TODO，所有步骤含完整代码。

**Type consistency:**
- `repo.data.status` 类型为 `WorktreeStatus[]`，`WorktreeStatus.path: string`，`WorktreeStatus.entries: StatusEntry[]`，与 Task 2 测试中 `{ path, entries }` 构造一致。
- `draftMocks.openDraft` 签名 `(repoId: string, worktreePath: string) => void`，与 Task 3 调用 `openDraft(repo.id, worktreePath)` 一致。
- `StatusEntry.status` 枚举值：`'M'`，来自 `src/shared/git-types.ts:87`，Task 2 测试中 `status: 'M' as const` 正确。
