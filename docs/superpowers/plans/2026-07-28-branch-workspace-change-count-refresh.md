# Branch Workspace Change-Count Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在子工作区 More 菜单中增加一个定向刷新成员仓库 Git status 的动作，使根项和成员改动数量 badge 可按需更新。

**Architecture:** `WorkspaceRepositoryRail` 负责把子工作区成员名称解析为仓库 ID、协调 `refreshStatus` 并维护每个子工作区的瞬时 pending 集合；`BranchWorkspaceList` 只把回调和 pending 状态投影为行级菜单动作。继续复用现有 repo status store 投影和 badge 派生逻辑，不修改服务端、协议或持久状态。

**Tech Stack:** React 19、Zustand、Radix/shadcn dropdown menu、Vitest、TypeScript 6 strip-only mode

## Global Constraints

- 使用仓库别名导入并显式保留 `.ts` / `.tsx` 扩展名。
- 不新增依赖，不引入轮询、文件 watcher、后台任务或 realtime 协议。
- 不调用 fetch、pull、`rescanWorkspace` 或 `useBranchWorkspaceQuery.refresh()`。
- 仅刷新目标子工作区中未移除且当前可用成员仓库的 status，并传递点击时的实例 token。
- 中文界面使用“子工作区”和“刷新改动”，不使用“子仓库”。
- 保留现有 badge 计数、路径匹配、零值隐藏和错误时旧数据保留语义。
- 按用户要求内联执行；实现阶段不执行 `git commit`、`git push` 或分支写操作，最终验证后统一请求确认。

---

### Task 1: 刷新动作四语言文案

**Files:**

- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Test: `src/shared/i18n/dictionaries.test.ts`

**Interfaces:**

- Consumes: 现有 `useT()` 字典查找。
- Produces: `workspace.branch-workspace.refresh-changes` 四语言键。

- [x] **Step 1: 写入失败的字典契约测试**

在现有子工作区 reload 文案测试之后加入：

```ts
test('localizes branch workspace change refresh in every locale', () => {
  const key = 'workspace.branch-workspace.refresh-changes' as const
  for (const [lang, dict] of Object.entries(dicts)) {
    expect(dict[key as keyof typeof dict], `${lang}.${key}`).toBeTruthy()
  }
  expect(zh[key]).toBe('刷新改动')
})
```

- [x] **Step 2: 运行测试并确认因缺键失败**

Run: `bun run test src/shared/i18n/dictionaries.test.ts`

Expected: FAIL，`workspace.branch-workspace.refresh-changes` 在字典中为 `undefined`。

- [x] **Step 3: 添加最小四语言文案**

在四份字典的 `workspace.branch-workspace.reload` 附近分别加入：

```ts
// en.ts
'workspace.branch-workspace.refresh-changes': 'Refresh changes',

// zh.ts
'workspace.branch-workspace.refresh-changes': '刷新改动',

// ja.ts
'workspace.branch-workspace.refresh-changes': '変更を更新',

// ko.ts
'workspace.branch-workspace.refresh-changes': '변경 사항 새로 고침',
```

- [x] **Step 4: 运行字典测试并确认通过**

Run: `bun run test src/shared/i18n/dictionaries.test.ts`

Expected: PASS。

---

### Task 2: 子工作区 More 菜单动作

**Files:**

- Modify: `src/web/components/repo-workspace/BranchWorkspaceItemMenu.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceList.tsx`
- Test: `src/web/components/repo-workspace/BranchWorkspaceList.test.tsx`

**Interfaces:**

- Consumes: `refreshingChangeIds?: ReadonlySet<string>`、`onRefreshChanges?: (item: BranchWorkspaceSnapshot) => void | Promise<void>`。
- Produces: ready 和可用 drift 子工作区的 `workspace.branch-workspace.refresh-changes` More 菜单动作。

- [x] **Step 1: 写入失败的菜单行为测试**

扩展 `separates root selection, expansion, reordering, and more actions`：传入 `onRefreshChanges`，把
`workspace.branch-workspace.refresh-changes` 插入预期菜单标签，并点击该 menuitem 后断言：

```ts
expect(onRefreshChanges).toHaveBeenCalledWith(item)
```

另加一个 focused test，传入 `refreshingChangeIds={new Set([item.id])}` 后重新打开菜单并断言对应
menuitem 具有 `data-disabled`。同步更新 ready/drift 的精确菜单数组，使 refresh 动作只出现在这两类可用项，
不出现在 active、creation-interrupted、reduce-incomplete 或 delete-incomplete 项。

- [x] **Step 2: 运行测试并确认因缺少 props/菜单项失败**

Run: `bun run test src/web/components/repo-workspace/BranchWorkspaceList.test.tsx`

Expected: FAIL，刷新动作缺失且回调未调用。

- [x] **Step 3: 添加最小 props 和行级动作投影**

在 `BranchWorkspaceListProps` 增加：

```ts
refreshingChangeIds?: ReadonlySet<string>
onRefreshChanges?: (item: BranchWorkspaceSnapshot) => void | Promise<void>
```

默认 `refreshingChangeIds = new Set()`，并把两个值传入 `BranchWorkspaceRow`。导入 `RefreshCw`，在
`rootUsable && onRefreshChanges` 时构造一个菜单动作：

```tsx
const refreshChangesActions: BranchWorkspaceItemAction[] =
  rootUsable && onRefreshChanges
    ? [
        {
          label: 'workspace.branch-workspace.refresh-changes',
          icon: <RefreshCw aria-hidden="true" />,
          disabled,
          busy: refreshingChangeIds?.has(item.id),
          separated: true,
          onSelect: () => onRefreshChanges(item),
        },
      ]
    : []
```

把该数组放在 `rootOpenMenuActions` 后、成员/依赖/Git 写动作之前；保持 context menu 不变。

- [x] **Step 4: 运行菜单测试并确认通过**

Run: `bun run test src/web/components/repo-workspace/BranchWorkspaceList.test.tsx`

Expected: PASS。

---

### Task 3: 定向成员 status 刷新编排

**Files:**

- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.tsx`
- Test: `src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`

**Interfaces:**

- Consumes: `BranchWorkspaceSnapshot.repositories`、现有 `repositoryIdByName`、
  `useReposStore.getState().refreshStatus(id, { token })`。
- Produces: Task 2 的 `refreshingChangeIds` 和 `onRefreshChanges` props。

- [x] **Step 1: 写入失败的编排测试**

扩展 mock `BranchWorkspaceList` 捕获 props，并在 store 测试动作中安装 `refreshStatus` mock。让 `web`
仓库可用，调用 `branchWorkspaceListState.props.onRefreshChanges(branchWorkspaceState.items[0])`，断言：

```ts
expect(refreshStatus).toHaveBeenCalledTimes(2)
expect(refreshStatus).toHaveBeenCalledWith(API, { token: api.instanceToken })
expect(refreshStatus).toHaveBeenCalledWith(WEB, { token: web.instanceToken })
expect(rescanWorkspace).not.toHaveBeenCalled()
expect(branchWorkspaceState.refresh).not.toHaveBeenCalled()
```

使用延迟 Promise 断言请求期间 `refreshingChangeIds` 含 `branch-1`；在 settle 前第二次调用同一回调，
`refreshStatus` 调用次数不增加；全部 settle 后集合移除该 ID。把一个 member 标记为 `removed`、另一个仓库
标记 unavailable，断言两者均不触发读取。

- [x] **Step 2: 运行 Rail 测试并确认因回调缺失失败**

Run: `bun run test src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`

Expected: FAIL，mock props 中没有 `onRefreshChanges`。

- [x] **Step 3: 实现最小刷新协调器**

在 Rail 中维护同步 guard 和渲染集合：

```ts
const refreshingBranchChangesRef = useRef<Set<string>>(new Set())
const [refreshingBranchChanges, setRefreshingBranchChanges] = useState<ReadonlySet<string>>(() => new Set())
```

实现：

```ts
const refreshBranchWorkspaceChanges = async (item: BranchWorkspaceSnapshot) => {
  const inFlight = refreshingBranchChangesRef.current
  if (inFlight.has(item.id)) return
  inFlight.add(item.id)
  setRefreshingBranchChanges(new Set(inFlight))
  try {
    const repositoryIds = Array.from(
      new Set(
        item.repositories.flatMap((member) => {
          if (member.progress === 'removed') return []
          const repositoryId = repositoryIdByName.get(member.repositoryName)
          return repositoryId ? [repositoryId] : []
        }),
      ),
    )
    await Promise.allSettled(
      repositoryIds.map(async (repositoryId) => {
        const state = useReposStore.getState()
        const repository = state.repos[repositoryId]
        if (!repository || repository.availability.phase !== 'available') return
        await state.refreshStatus(repositoryId, { token: repository.instanceToken })
      }),
    )
  } finally {
    inFlight.delete(item.id)
    setRefreshingBranchChanges(new Set(inFlight))
  }
}
```

传给 `BranchWorkspaceList`：

```tsx
refreshingChangeIds = { refreshingBranchChanges }
onRefreshChanges = { refreshBranchWorkspaceChanges }
```

- [x] **Step 4: 运行 Rail 测试并确认通过**

Run: `bun run test src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`

Expected: PASS。

---

### Task 4: 完整验证与最终确认门

**Files:**

- Verify: `docs/superpowers/specs/2026-07-28-branch-workspace-change-count-refresh-design.md`
- Verify: `docs/superpowers/plans/2026-07-28-branch-workspace-change-count-refresh.md`
- Verify: Tasks 1–3 修改的源文件和测试文件

**Interfaces:**

- Consumes: 四语言键、菜单动作、Rail 刷新协调器。
- Produces: 可交付但未提交的已验证工作树。

- [x] **Step 1: 运行针对性测试**

Run:

```sh
bun run test src/shared/i18n/dictionaries.test.ts src/web/components/repo-workspace/BranchWorkspaceList.test.tsx src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx
```

Expected: PASS。

- [x] **Step 2: 运行架构与类型检查**

Run: `bun run check:architecture`

Expected: PASS。

Run: `bun run typecheck`

Expected: PASS。

- [x] **Step 3: 运行完整测试**

Run: `bun run test`

Expected: PASS；若有既有或环境性失败，记录完整失败名称并单独复跑，不修改无关代码。

- [x] **Step 4: 检查差异范围和规划一致性**

Run:

```sh
git diff --check
git status --short
git diff -- docs/superpowers/specs/2026-07-28-branch-workspace-change-count-refresh-design.md docs/superpowers/plans/2026-07-28-branch-workspace-change-count-refresh.md src/shared/i18n/en.ts src/shared/i18n/zh.ts src/shared/i18n/ja.ts src/shared/i18n/ko.ts src/shared/i18n/dictionaries.test.ts src/web/components/repo-workspace/BranchWorkspaceItemMenu.tsx src/web/components/repo-workspace/BranchWorkspaceList.tsx src/web/components/repo-workspace/BranchWorkspaceList.test.tsx src/web/components/repo-workspace/WorkspaceRepositoryRail.tsx src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx
```

Expected: 本任务相关差异只包含设计、计划、刷新文案、菜单 busy 投影、status 编排及其测试；并发任务的差异保持原样且不纳入本任务范围。

- [ ] **Step 5: 最终统一请求危险操作确认**

实现与验证完成后，报告结果并按 AGENTS.md 格式询问是否执行 `git commit`；未经明确“确认”不提交，
不执行 push。
