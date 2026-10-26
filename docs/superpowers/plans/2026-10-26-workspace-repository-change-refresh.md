# 工作区仓库改动状态刷新 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 在多仓库工作区的仓库行和子工作区 More 菜单中增加“刷新改动”，定向读取相关 Git status 并立即更新改动徽标。

**Architecture:** `WorkspaceRepositoryRail` 负责从最新 repo store 投影编排工作区仓库和子工作区成员的 status 刷新及瞬时 busy 集合；`WorkspaceRepositoryList`、`BranchWorkspaceList` 及其行组件只负责把回调投影为操作菜单动作。复用 `refreshStatus(repoId, { token })`，不新增服务端 API、失效消息或持久状态。

**Tech Stack:** React 19、Zustand、Radix/shadcn DropdownMenu、Vitest、TypeScript 6 strip-only mode

**Spec:** `docs/superpowers/specs/2026-10-26-workspace-repository-change-refresh-design.md`

## Global Constraints

- 只刷新 Git status，不执行 fetch、pull、push、snapshot 或 workspace rescan。
- 使用最新仓库实例 token 调用 `refreshStatus(repoId, { token })`。
- 不新增 realtime 协议；status 结果通过现有 runtime-coherent repo store 投影驱动 UI 更新。
- 保留不可用仓库的菜单项并禁用；刷新期间阻止重复触发。
- 新增文案时同步维护 en、zh、ja、ko 四份字典，使用仓库别名导入和显式扩展名。
- 不引入依赖，不提交 Git commit 或 push。

## Scope Extension: 子工作区 More 菜单

用户确认将同一“刷新改动”动作扩展到子工作区根项 More 菜单。`BranchWorkspaceList` 接收 `onRefreshChanges` 与 `refreshingChangeIds`，只呈现菜单项；`WorkspaceRepositoryRail` 按成员仓库 ID 去重，排除已移除、不可用和非 Git 成员，并以最新实例 token 并行调用 `refreshStatus`。四语言字典使用 `workspace.branch-workspace.refresh-changes`。

- [x] 为子工作区菜单和四语言字典增加失败测试与文案。
- [x] 为 BranchWorkspaceList 增加菜单动作、busy 投影和回调测试。
- [x] 为 Rail 增加成员 status 刷新协调、重复保护和 token 测试。
- [x] 重新运行相关测试、类型检查、架构检查和完整测试套件。

## Review Focus

- 不可用仓库仍显示稳定菜单项且不可点击；由 WorkspaceRepositoryList 菜单测试覆盖。
- 点击仓库刷新使用点击时的实例 token，仓库关闭并重开后旧请求不应覆盖；由 Rail 回调测试和现有 store token 语义覆盖。
- 同一仓库的快速重复点击只产生一个 status 请求；由 Rail pending guard 与菜单 busy 测试覆盖。
- 一个仓库 status 失败不能阻止 busy 清理或再次刷新；由 Rail settle 测试覆盖。
- status 返回后工作区徽标读取新的 `repo.data.status`，不依赖新的 query 或 realtime 消息；由列表投影测试和现有 store refresh 测试覆盖。

### Task 1: 四语言菜单文案与契约测试

**Files:**
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/shared/i18n/dictionaries.test.ts`

**Interfaces:**
- Produces `workspace.repository.refresh-changes` for `useT()`.
- English value is `Refresh changes`; Chinese value is `刷新改动`; Japanese value is `変更を更新`; Korean value is `변경 사항 새로 고침`.

- [x] **Step 1: Write the failing dictionary assertion**

Add a test beside the existing workspace dictionary assertions that checks the key is truthy in all four dictionaries and exactly equals `刷新改动` in `zh`.

- [x] **Step 2: Run the dictionary test to verify it fails**

Run: `bun run test src/shared/i18n/dictionaries.test.ts`

Expected: FAIL because the new key is absent from at least one dictionary.

- [x] **Step 3: Add the four localized values**

Add the same key to each dictionary near the existing workspace repository labels.

- [x] **Step 4: Run the dictionary test to verify it passes**

Run: `bun run test src/shared/i18n/dictionaries.test.ts`

Expected: PASS.

### Task 2: Workspace repository operation-menu action

**Files:**
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryList.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryList.test.tsx`

**Interfaces:**
- Add optional `refreshingRepositoryIds?: ReadonlySet<string>` and `onRefreshRepository?: (repositoryId: string) => void | Promise<void>` to `WorkspaceRepositoryList` props.
- The row action uses id `refreshChanges`, label `t('workspace.repository.refresh-changes')`, `RefreshCw`, and disables when the row is unavailable, non-Git, or currently refreshing.

- [x] **Step 1: Extend the list test harness and add failing menu tests**

Pass a refresh callback through `renderList`, then assert the available repository menu contains `workspace.repository.refresh-changes`, invokes the callback with `/workspace/api`, keeps the unavailable repository action present and disabled, and marks an id in `refreshingRepositoryIds` disabled/busy.

- [x] **Step 2: Run the focused list test to verify it fails**

Run: `bun run test src/web/components/repo-workspace/WorkspaceRepositoryList.test.tsx`

Expected: FAIL because the list has no refresh props or menu item.

- [x] **Step 3: Project the action into the existing menu**

Import `RefreshCw`, accept the two props with an empty-set default, pass them into `SortableWorkspaceRepositoryRow`, create the `WorkspaceListItemAction`, and add it as its own menu group before terminal actions. Keep the existing creation dialogs and context menu unchanged.

- [x] **Step 4: Run the focused list test to verify it passes**

Run: `bun run test src/web/components/repo-workspace/WorkspaceRepositoryList.test.tsx`

Expected: PASS.

### Task 3: Rail-owned status refresh orchestration

**Files:**
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`

**Interfaces:**
- Produces `refreshingRepositoryIds` and `onRefreshRepository` props for `WorkspaceRepositoryList`.
- `refreshWorkspaceRepositoryChanges(repositoryId: string): Promise<void>` guards duplicate ids, reads the latest repo instance from `useReposStore.getState()`, skips unavailable/non-Git/missing repos, calls `refreshStatus(repositoryId, { token: repo.instanceToken })`, and always clears the pending id after settlement.

- [x] **Step 1: Capture the new list props and add failing Rail tests**

Extend the mocked list props type. Add a `refreshStatus` mock to the store fixture and assert the rail callback calls it once with the current token, exposes the id while the promise is pending, ignores a second invocation for the same id, skips the unavailable member, and removes the id after a rejected promise.

- [x] **Step 2: Run the focused Rail test to verify it fails**

Run: `bun run test src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`

Expected: FAIL because the callback and pending props are not exposed.

- [x] **Step 3: Implement the Rail coordinator**

Add a ref-backed Set and state-backed readonly Set. Resolve the latest repository at invocation time, guard duplicate calls, call `refreshStatus` with the latest token, use `finally` for cleanup, and pass both values to `WorkspaceRepositoryList`.

- [x] **Step 4: Run the focused Rail test to verify it passes**

Run: `bun run test src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`

Expected: PASS.

### Task 4: Full verification and diff review

**Files:**
- Verify: `docs/superpowers/specs/2026-10-26-workspace-repository-change-refresh-design.md`
- Verify: `docs/superpowers/plans/2026-10-26-workspace-repository-change-refresh.md`
- Verify: all source and test files modified by Tasks 1–3

- [x] **Step 1: Run focused tests**

Run: `bun run test src/shared/i18n/dictionaries.test.ts src/web/components/repo-workspace/WorkspaceRepositoryList.test.tsx src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`

Expected: PASS.

- [x] **Step 2: Run architecture and type checks**

Run: `bun run check:architecture` and `bun run typecheck`

Expected: both PASS.

- [x] **Step 3: Run the complete test suite**

Run: `bun run test`

Expected: PASS; any pre-existing failure must be reported with its exact test name rather than hidden.

- [x] **Step 4: Review formatting and scope**

Run `git diff --check`, inspect `git status --short`, and confirm only the design, plan, dictionaries, list action, rail coordinator, and their tests changed.
