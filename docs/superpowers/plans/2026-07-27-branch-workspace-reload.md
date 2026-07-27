# Branch Workspace Reload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在配置工作区的子工作区读取错误行中增加安全的定向重载，并把远程读取错误显示为本地化文案。

**Architecture:** 复用 `useBranchWorkspaceQuery.refresh()` 现有读路径和 TanStack Query 成功快照更新逻辑。`WorkspaceRepositoryRail` 只维护一次点击期间的本地 pending 状态；服务端 API、注册表写入和 realtime 协议保持不变。

**Tech Stack:** React 19、TanStack Query、Vitest、react-i18next、TypeScript 6 strip-only mode

## Global Constraints

- 使用仓库别名和显式 `.ts` / `.tsx` 扩展名。
- 不新增依赖，不修改服务端 API，不引入轮询或自动无限重试。
- 不清除 `localStorage` / `sessionStorage`，不刷新页面，不修改注册表清理语义。
- 中文界面使用“子工作区”，不使用“子仓库”。
- 保留工作树中已有且与本功能无关的用户改动。
- 不执行 `git commit`、`git push`、分支创建或其他 Git 写操作。

---

### Task 1: 子工作区远程错误与重载文案

**Files:**

- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/shared/i18n/ja.ts`
- Test: `src/shared/i18n/dictionaries.test.ts`

**Interfaces:**

- Consumes: `useT()` 对无分隔符 i18n 键的现有翻译行为。
- Produces: `workspace.branch-workspace.reload`、`workspace.branch-workspace.remote-operation-failed`、`workspace.branch-workspace.remote-invalid-response` 三个四语言键。

- [x] **Step 1: 写入失败的字典契约测试**

在 `dictionaries.test.ts` 的子工作区文案测试附近增加：

```ts
test('localizes branch workspace reload and remote read failures in every locale', () => {
  const keys = [
    'workspace.branch-workspace.reload',
    'workspace.branch-workspace.remote-operation-failed',
    'workspace.branch-workspace.remote-invalid-response',
  ] as const

  for (const [lang, dict] of Object.entries(dicts)) {
    for (const key of keys) expect(dict[key as keyof typeof dict], `${lang}.${key}`).toBeTruthy()
  }
  expect(zh['workspace.branch-workspace.reload']).toBe('重新加载子工作区')
})
```

- [x] **Step 2: 运行测试并确认因缺键失败**

Run: `bun run test src/shared/i18n/dictionaries.test.ts`

Expected: FAIL，三个新键至少一个在每个字典中为 `undefined`。

- [x] **Step 3: 添加四语言文案**

在四份字典的 `workspace.branch-workspace.read-failed` 附近加入等价文案。中文精确值：

```ts
'workspace.branch-workspace.reload': '重新加载子工作区',
'workspace.branch-workspace.remote-operation-failed': '远程读取子工作区失败。',
'workspace.branch-workspace.remote-invalid-response': '远程主机返回了无效的子工作区数据。',
```

英文使用 `Reload branch workspaces`、`Could not read branch workspaces from the remote host.`、
`The remote host returned invalid branch workspace data.`；韩文和日文使用语义等价翻译。

- [x] **Step 4: 运行字典测试并确认通过**

Run: `bun run test src/shared/i18n/dictionaries.test.ts`

Expected: PASS。

### Task 2: 错误行内重新加载交互

**Files:**

- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.tsx`
- Test: `src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`

**Interfaces:**

- Consumes: `branchQuery.refresh(): Promise<BranchWorkspaceReadResult>`。
- Produces: 子工作区读取失败时的 `workspace.branch-workspace.reload` 按钮；一次请求期间禁止重复触发。

- [x] **Step 1: 写入失败的交互测试**

在现有注册表清理测试之前增加一个延迟 Promise 测试：把查询结果设为
`workspace.branch-workspace.remote-operation-failed`，点击
`button[aria-label="workspace.branch-workspace.reload"]`，断言 `refresh` 被调用一次、pending
期间按钮 disabled、第二次点击不会重复调用；解析 Promise 后按钮恢复可用，并断言不会出现注册表清理按钮。

核心测试结构：

```tsx
let finishRefresh: (() => void) | undefined
branchWorkspaceState.queryResult = {
  ok: false,
  message: 'workspace.branch-workspace.remote-operation-failed',
}
branchWorkspaceState.refresh.mockReturnValue(
  new Promise((resolve) => {
    finishRefresh = () =>
      resolve({
        ok: true,
        rootId: ROOT,
        items: branchWorkspaceState.items,
        auxiliaryCandidates: [],
      })
  }),
)

renderRail({ currentRepoId: ROOT })
const reload = container?.querySelector<HTMLButtonElement>('button[aria-label="workspace.branch-workspace.reload"]')
act(() => reload?.click())
expect(branchWorkspaceState.refresh).toHaveBeenCalledTimes(1)
expect(reload?.disabled).toBe(true)
act(() => reload?.click())
expect(branchWorkspaceState.refresh).toHaveBeenCalledTimes(1)
await act(async () => finishRefresh?.())
expect(reload?.disabled).toBe(false)
```

- [x] **Step 2: 运行交互测试并确认因按钮缺失失败**

Run: `bun run test src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`

Expected: FAIL，无法找到 `workspace.branch-workspace.reload` 按钮。

- [x] **Step 3: 实现最小重载状态与动作**

在 `WorkspaceRepositoryRail` 中增加本地状态和只读动作：

```tsx
const [branchReloadPending, setBranchReloadPending] = useState(false)

const reloadBranchWorkspaces = async () => {
  if (branchReloadPending) return
  setBranchReloadPending(true)
  try {
    await branchQuery.refresh()
  } finally {
    setBranchReloadPending(false)
  }
}
```

在所有子工作区读取失败的错误文字右侧渲染 `variant="outline"`、`size="sm"` 的按钮。pending
期间显示已有的 `LoaderCircle` 旋转图标，否则显示已有的 `RefreshCw` 图标，并始终使用
`aria-label={t('workspace.branch-workspace.reload')}`。保留 `read-failed` 条件下现有的注册表清理按钮。

- [x] **Step 4: 运行交互测试并确认通过**

Run: `bun run test src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`

Expected: PASS。

### Task 3: 完整验证与范围检查

**Files:**

- Verify: `docs/superpowers/specs/2026-07-27-branch-workspace-reload-design.md`
- Verify: `docs/superpowers/plans/2026-07-27-branch-workspace-reload.md`
- Verify: Task 1 和 Task 2 修改的源文件与测试文件

**Interfaces:**

- Consumes: Task 1 的 i18n 键与 Task 2 的按钮实现。
- Produces: 通过项目架构、类型和完整回归验证的内联交付。

- [x] **Step 1: 运行针对性测试**

Run: `bun run test src/shared/i18n/dictionaries.test.ts src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx src/web/branch-workspace-queries.test.ts`

Expected: PASS。

- [x] **Step 2: 运行架构与类型检查**

Run: `bun run check:architecture`

Expected: PASS。

Run: `bun run typecheck`

Expected: PASS。

- [x] **Step 3: 运行完整测试**

Run: `bun run test`

Expected: PASS；若出现与本次改动无关的既有失败，记录完整失败名称和证据，不修改无关代码。

- [x] **Step 4: 检查最终差异范围**

Run: `git diff -- docs/superpowers/specs/2026-07-27-branch-workspace-reload-design.md docs/superpowers/plans/2026-07-27-branch-workspace-reload.md src/shared/i18n/en.ts src/shared/i18n/zh.ts src/shared/i18n/ko.ts src/shared/i18n/ja.ts src/shared/i18n/dictionaries.test.ts src/web/components/repo-workspace/WorkspaceRepositoryRail.tsx src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`

Expected: 仅包含设计、计划、三项新文案、错误行重载交互及其测试；不包含缓存清理、服务端写入或用户已有改动。
