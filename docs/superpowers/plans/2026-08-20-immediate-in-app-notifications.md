# 应用内通知即时显示实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让子工作区成员仓库及其他已打开仓库产生的应用内通知在当前渲染器立即显示，不再等待对应 `RepoView` 挂载。

**Architecture:** 将仓库事件消费从当前仓库页面移动到应用壳层的常驻监听器。监听器遍历渲染器本地 `useReposStore.repos` 中的事件，复用现有格式化和精确清除逻辑；`RepoView` 不再承担通知交付。

**Tech Stack:** React 19、Zustand、Sonner、Vitest、Bun、TypeScript 6 strip-only mode

## Global Constraints

- 应用内通知必须在当前渲染器即时显示，不受当前导航上下文影响。
- 保留现有逐仓库/逐成员通知粒度、文案、级别、ID、描述和持续时间。
- 不修改服务端、实时协议、仓库写路径或批量 Git 协议。
- 使用 repo-alias 和显式 `.ts`/`.tsx` 扩展名；不得使用 Node strip-only mode 不支持的 TypeScript 语法。
- 测试数据仅使用通用占位路径和名称。
- 不执行 `git commit`、`git push`、分支或其他 Git 写操作。

---

## File Responsibilities

- `src/web/hooks/useRepoToasts.tsx`：当前渲染器内所有仓库事件的唯一通知消费与格式化入口；导出常驻监听组件。
- `src/web/hooks/useRepoToasts.test.tsx`：验证活动子工作区父级之外的成员仓库事件也即时显示、精确清除，并保留既有 bootstrap 描述。
- `src/web/App.tsx`：在应用覆盖层常驻挂载仓库通知监听器。
- `src/web/App.test.tsx`：验证没有可见仓库页面时监听器仍挂载。
- `src/web/components/RepoView.tsx`：移除页面级通知消费职责。

### Task 1: 将仓库通知消费扩展为当前渲染器全局消费

**Files:**

- Modify: `src/web/hooks/useRepoToasts.test.tsx`
- Modify: `src/web/hooks/useRepoToasts.tsx`

**Interfaces:**

- Consumes: `useReposStore.repos`, `ReposStore.clearEvents(repoId, eventIds)`, `sonner.toast`
- Produces: `useRepoToasts(): void`, `RepoToastListener(): null`

- [x] **Step 1: 写入失败回归测试**

在 `useRepoToasts.test.tsx` 中增加通用父工作区与成员仓库 ID，令测试 Harness 无参数调用全局 hook：

```tsx
const WORKSPACE_ID = '/workspace'
const MEMBER_REPO_ID = '/workspace/api'

test('shows and clears member repository events while the parent workspace is active', () => {
  const workspace = emptyRepo(WORKSPACE_ID, 'workspace')
  workspace.isGitRepo = false
  const member = emptyRepo(MEMBER_REPO_ID, 'api')
  member.workspaceRootId = WORKSPACE_ID
  useReposStore.setState({
    repos: { [WORKSPACE_ID]: workspace, [MEMBER_REPO_ID]: member },
    order: [WORKSPACE_ID],
    activeId: WORKSPACE_ID,
    activeProjectId: WORKSPACE_ID,
    workspaceProjects: {
      [WORKSPACE_ID]: {
        rootId: WORKSPACE_ID,
        repositoryIds: [MEMBER_REPO_ID],
        candidates: [],
        configured: true,
        configurationError: null,
        phase: 'ready',
        skipped: [],
        error: null,
      },
    },
    workspaceActiveContextByRoot: {
      [WORKSPACE_ID]: { kind: 'branch-workspace', branchWorkspaceId: 'branch-workspace-1' },
    },
  })
  useReposStore.getState().setLastResult(
    MEMBER_REPO_ID,
    { ok: true, message: 'member updated' },
    member.instanceToken,
  )
  const eventId = useReposStore.getState().repos[MEMBER_REPO_ID]!.events[0]!.id

  render(<Harness />)

  expect(toastMocks.success).toHaveBeenCalledWith(
    'action.result-ok',
    expect.objectContaining({ id: `${MEMBER_REPO_ID}:result:ok:${eventId}` }),
  )
  expect(useReposStore.getState().repos[MEMBER_REPO_ID]!.events).toEqual([])
})

function Harness() {
  useRepoToasts()
  return null
}
```

将既有 bootstrap 测试改为 `render(<Harness />)`，确保兼容场景也通过新的全局入口。

- [x] **Step 2: 运行测试并确认按预期失败**

Run: `bun run test src/web/hooks/useRepoToasts.test.tsx`

Expected: FAIL；成员仓库事件没有触发 `toast.success`，证明当前 hook 仍只消费传入的单仓库事件。

- [x] **Step 3: 实现最小全局消费者**

将 `useRepoToasts(repoId)` 改为无参数 hook，订阅 `useReposStore.repos` 并在 effect 中逐仓库消费事件。把现有单仓库格式化主体原样放入仓库循环，继续使用 `${repoId}:...:${event.id}` ID，并在每个仓库显示完成后执行：

```tsx
useReposStore.getState().clearEvents(
  repoId,
  events.map((event) => event.id),
)
```

新增应用壳层可挂载的薄组件：

```tsx
export function RepoToastListener() {
  useRepoToasts()
  return null
}
```

依赖保持为仓库投影引用；`t` 继续通过 render-time ref 读取，避免语言切换重复触发现有事件。

- [x] **Step 4: 运行定向测试并确认通过**

Run: `bun run test src/web/hooks/useRepoToasts.test.tsx`

Expected: PASS；成员仓库事件立即显示并清空，bootstrap 多行描述测试继续通过。

- [x] **Step 5: 检查任务差异，不提交**

Run: `git diff --check -- src/web/hooks/useRepoToasts.tsx src/web/hooks/useRepoToasts.test.tsx`

Expected: exit 0。按照项目约束保留未提交改动。

### Task 2: 将唯一通知监听器挂载到应用覆盖层

**Files:**

- Modify: `src/web/App.test.tsx`
- Modify: `src/web/App.tsx`
- Modify: `src/web/components/RepoView.tsx`

**Interfaces:**

- Consumes: `RepoToastListener(): null`（Task 1）
- Produces: 与 `Toaster` 同生命周期的唯一应用级仓库通知监听器

- [x] **Step 1: 写入失败的应用壳层挂载测试**

在 `App.test.tsx` 中 mock 常驻监听器：

```tsx
vi.mock('#/web/hooks/useRepoToasts.tsx', () => ({
  RepoToastListener: () => <div data-testid="repo-toast-listener" />,
}))
```

增加测试，覆盖不存在可见 `RepoView` 的导航状态：

```tsx
test('keeps the repository toast listener mounted without a visible repository', async () => {
  await renderApp({ runtime: 'web', workspaceMode: 'split', visibleRepoId: null })

  expect(container?.querySelector('[data-testid="repo-toast-listener"]')).not.toBeNull()
  expect(container?.querySelector('[data-testid="repo-view"]')).toBeNull()
})
```

- [x] **Step 2: 运行应用测试并确认按预期失败**

Run: `bun run test src/web/App.test.tsx`

Expected: FAIL；应用覆盖层尚未渲染 `repo-toast-listener`。

- [x] **Step 3: 移动通知所有权**

在 `App.tsx` 导入 `RepoToastListener`，并在 `MainWindowOverlays` 中与 `Toaster` 同级常驻挂载：

```tsx
<RepoToastListener />
<Toaster position="bottom-right" closeButton />
```

在 `RepoView.tsx` 删除 `useRepoToasts` import 和 `useRepoToasts(repoId)` 调用，确保只有应用级消费者。

- [x] **Step 4: 运行相关测试并确认通过**

Run: `bun run test src/web/App.test.tsx src/web/hooks/useRepoToasts.test.tsx src/web/components/RepoView.test.tsx`

Expected: PASS；监听器在空导航状态常驻，通知行为和仓库页面回归测试均通过。

- [x] **Step 5: 执行完整验证**

Run: `bun run typecheck`

Expected: exit 0。

Run: `bun run test`

Expected: 全部 Vitest 测试通过。

Run: `bun run check:architecture`

Expected: exit 0，架构边界保持绿色。

- [x] **Step 6: 检查最终差异，不提交**

Run: `git diff --check -- CONTEXT.md docs/superpowers/specs/2026-08-20-immediate-in-app-notifications-design.md docs/superpowers/plans/2026-08-20-immediate-in-app-notifications.md src/web/hooks/useRepoToasts.tsx src/web/hooks/useRepoToasts.test.tsx src/web/App.tsx src/web/App.test.tsx src/web/components/RepoView.tsx`

Expected: exit 0。只报告本功能文件，保留工作区其他既有改动，不执行 Git 写操作。
