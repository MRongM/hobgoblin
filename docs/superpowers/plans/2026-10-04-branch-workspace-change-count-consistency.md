# Branch Workspace Change Count Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, inline in the existing worktree. The user explicitly selected inline execution and delegated routine decisions. Steps use checkbox tracking.

**Goal:** 修复 Windows 子工作区成员及汇总变更数量不一致，并在上下文导航或返回窗口时刷新过期状态。

**Architecture:** 复用共享路径身份比较、现有 renderer worktree 状态投影和 `refreshStatus` 读取动作。
计数不持久化。上下文 hook 只触发过期读取，保留现有定时刷新设置及服务端请求协调。

**Tech Stack:** React 19、Zustand、TanStack Query 既有快照、TypeScript strip-only、Vitest、Bun。

**Design:** `docs/superpowers/specs/2026-10-04-branch-workspace-change-count-consistency-design.md`

## 执行约束与基线

- 当前已在命名分支的 linked worktree，无需创建新工作树；开始时工作区 clean。
- 前一轮相关 5 文件、80 个测试通过；architecture baseline 通过。
- 先添加行为回归测试并确认失败，再实现。完成后执行完整检查。
- 所有步骤在当前会话内执行，不分派子代理。
- 仅准备和验证本地修复。合并、推送、发布、删除工作树等操作放到最后按用户授权范围处理。

## Task 1: 统一 Windows 路径身份与计数投影

**Files:**

- Modify: `src/web/stores/repos/worktree-state.ts`
- Modify: `src/shared/local-file-path-bridge.ts`
- Test: `src/shared/local-file-path-bridge.test.ts`
- Modify: `src/web/components/repo-workspace/branch-workspace-member-target.ts`
- Modify: `src/web/components/repo-workspace/branch-workspace-file-area-members.ts`
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspacePane.tsx`
- Modify: `src/web/branch-workspace-repository-projection.ts`
- Test: `src/web/components/repo-workspace/branch-workspace-file-area-members.test.ts`
- Test: `src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`
- Test: `src/web/components/repo-workspace/BranchWorkspacePane.test.tsx`
- Test: `src/web/branch-workspace-repository-projection.test.ts`

- [x] **Step 1: 添加计数回归用例。**

在既有 fixture 中生成两个仓库，member worktree path 使用
`C:\\workspace\\hob-feature\\api` / `web`，Git branch/status 使用
`c:/workspace/hob-feature/api` / `web`，分别添加 2、3 个 `StatusEntry`。
断言行为：

```ts
expect(members.map(branchWorkspaceFileAreaMemberChangeCount)).toEqual([2, 3])
expect(branchWorkspaceFileAreaTotalChangeCount(members)).toBe(5)
expect(branchWorkspaceListState.props?.changeCountById?.['branch-1']).toBe(5)
```

另设权威 `repositoryId` 指向另一个已打开投影，配置投影为空，仍断言根总数为 5。
覆盖 status 尚未加载时的 snapshot 已知数量、成功空 entries 优先、已移除/不可用成员排除、
UNC 等价路径、POSIX 大小写不同及其他工作树排除。
Pane 用例检查选中成员的 ordinary explorer 接收到正确 `changeCount`。

- [x] **Step 2: 添加发现投影回归。**

预置已打开仓库和 Git 正斜杠分支路径，清单使用 Windows 反斜杠等价路径：

```ts
expect(projectDiscoveredBranchWorkspaceRepositories(state, rootId, items).refreshIds).toEqual([])
```

- [x] **Step 3: 运行新回归，确认漏计与重复刷新导致失败。**

```text
bun run test src/web/components/repo-workspace/branch-workspace-file-area-members.test.ts src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx src/web/components/repo-workspace/BranchWorkspacePane.test.tsx src/web/branch-workspace-repository-projection.test.ts
```

Expected: 新的 Windows 计数用例得到 0，发现投影错误地包含 refresh ID；原有用例继续通过。

- [x] **Step 4: 实现规范 worktree 计数选择器。**

在 `worktree-state.ts` 直接导入共享 `sameLocalFilePath` 并加入：

```ts
export function getWorktreeChangeCount(repo: BranchWorktreeRepo, worktreePath: string): number {
  const status = repo.data.status.find((entry) => sameLocalFilePath(entry.path, worktreePath))
  if (status) return status.entries.length
  const worktree =
    repo.data.worktreesByPath[worktreePath] ??
    Object.values(repo.data.worktreesByPath).find((entry) => sameLocalFilePath(entry.path, worktreePath))
  return worktree?.changeCount ?? 0
}
```

- [x] **Step 5: 统一成员仓库解析和调用点。**

在 canonical member-target 模块导出 ID 解析函数并供现有 target 解析调用：

```ts
export function branchWorkspaceMemberRepositoryId(
  member: BranchWorkspaceRepositorySnapshot,
  repositoryIds: readonly string[],
  candidates: readonly WorkspaceRepositoryCandidate[],
): string | null {
  return (
    member.repositoryId ??
    candidates.find((entry) => entry.name === member.repositoryName && repositoryIds.includes(entry.id))?.id ??
    null
  )
}
```

Rail 对每个未移除成员解析 ID、检查 availability，再累加 `getWorktreeChangeCount`。
File-area helper 和 Pane 调用同一计数选择器；file-area 解析排除 removed。
发现投影的 branch worktree 比较使用 `sameLocalFilePath`。

- [x] **Step 6: 重跑 Task 1 命令，确认新回归与原有行为通过。**

## Task 2: 补齐子工作区上下文的过期状态刷新

**Files:**

- Create: `src/web/hooks/useBranchWorkspaceStatusRefresh.ts`
- Create: `src/web/hooks/useBranchWorkspaceStatusRefresh.test.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspacePane.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceFileArea.tsx`
- Test: `src/web/components/repo-workspace/BranchWorkspacePane.test.tsx`
- Test: `src/web/components/repo-workspace/BranchWorkspaceAggregatePanel.test.tsx`

- [x] **Step 1: 添加 hook 行为回归。**

使用 jsdom 与 fake time；mock 只位于 status 读取边界。断言进入子工作区时，
过期 api/web 各触发一次 `refreshStatus(id, { token })`，不触发后台仓库。
覆盖：新鲜数据不读取；缺少初次成功数据需读取；busy/不可用/非 Git/removed 排除；
重复成员 ID 去重；成员选择改变及 focus/visibility 事件在过期后触发；隐藏时不读取；
最新 token；失败隔离；卸载后不触发。

```ts
expect(refreshStatus).toHaveBeenCalledWith(api.id, { token: api.instanceToken })
expect(refreshStatus).toHaveBeenCalledWith(web.id, { token: web.instanceToken })
expect(refreshStatus).not.toHaveBeenCalledWith(background.id, expect.anything())
```

- [x] **Step 2: 新文件先建立空 hook 入口，运行测试确认行为断言失败。**

空入口仅用于 RED 阶段，使失败来自未执行刷新而非 import 错误：

```ts
export function useBranchWorkspaceStatusRefresh(_workspace: BranchWorkspaceSnapshot, _selectionKey = ''): void {}
```

```text
bun run test src/web/hooks/useBranchWorkspaceStatusRefresh.test.tsx
```

Expected: 缺少进入/选择/focus/visibility 刷新调用。

- [x] **Step 3: 实现上下文 hook。**

selector 解析清单成员 ID，过滤 unavailable/non-Git/removed，按 ID 去重。
订阅目标 ID 与 instance token 形成的稳定 key。每次触发重新从 `useReposStore.getState()`
解析最新实例并复用已有 `shouldHeuristicallyRefreshRepoStatus`：

```ts
const shouldRefresh = shouldHeuristicallyRefreshRepoStatus({
  availability: repo.availability.phase,
  statusLoaded: repo.data.statusLoaded,
  statusPhase: repo.resources.status.phase,
  statusLoadedAt: repo.resources.status.loadedAt,
  statusStale: repo.resources.status.stale || !repo.data.statusLoaded || repo.resources.status.loadedAt === null,
})
```

effect 对 workspace/selection/目标实例变化执行检查，注册 `focus`、`visibilitychange`，
仅在文档可见时处理可见事件。通过 `Promise.allSettled` 独立等待读取并在 cleanup 移除监听。
不添加 timer，不改变 active ID，不写入计数。

- [x] **Step 4: 接入真实上下文并补集成断言。**

```ts
// BranchWorkspacePane: 根或成员终端上下文。
useBranchWorkspaceStatusRefresh(workspace, memberTarget ? `${memberTarget.worktreePath}\0${memberActiveTab}` : '')

// BranchWorkspaceFileArea: 根 Git 面板/面板内成员切换。
useBranchWorkspaceStatusRefresh(workspace, `${activeTab}\0${selectedAggregateRepositoryName ?? ''}`)
```

调用均在组件顶层、条件 return 前。通过实际 Pane/file-area 渲染与成员/tab 切换，
证明旧 status 的刷新指向成员仓库，保持父导航上下文。

- [x] **Step 5: 运行相关测试，确认所有刷新与集成行为通过。**

```text
bun run test src/web/hooks/useBranchWorkspaceStatusRefresh.test.tsx src/web/hooks/useHeuristicRepoStatusRefresh.test.tsx src/web/hooks/useScheduledRepoStatusRefresh.test.tsx src/web/components/repo-workspace/BranchWorkspacePane.test.tsx src/web/components/repo-workspace/BranchWorkspaceAggregatePanel.test.tsx
```

## Task 3: Inline 审查与完整验证

- [x] **Step 1: 查看完整 diff，确认没有路径写入变化、额外持久状态、依赖或新定时器。**
- [x] **Step 2: 对本次修改文件执行 Prettier，修正格式并检查 plan/spec 无占位内容。**
- [x] **Step 3: 运行 `bun run typecheck`、`bun run check:architecture`、完整 `bun run test`。**

若 Windows 全套并发导致资源争用，使用 `bun run test --maxWorkers=4` 运行同一完整套件；
失败需分析真实原因，不能删除或放宽测试来掩盖回归。

- [x] **Step 4: 重新验证 Windows 2 + 3 = 5、零值覆盖与刷新时机，记录实际命令及结果。**
- [x] **Step 5: 更新执行记录和复核后的最终交付说明。**

## 最后处理

完成本地修复和验证后再处理集成决策；在没有合并/推送/发布任务时保留当前工作树供 review。

## 执行记录

- 基线 `bun run typecheck` 三个项目与 architecture 检查通过。
- Task 1 RED：4 文件中新增行为回归得到 8 个预期失败，其余 94 个测试通过。
- 初次修复后：120 个测试通过，仅 UNC 等价路径用例失败。
- 该失败定位到共享路径桥：仅显式反斜杠 UNC 被识别，Git 正斜杠 UNC 被当作 POSIX。
  已补充 2 个先失败的桥接回归；仅在明确 Windows 上下文或比较另一侧为显式 UNC 时识别
  正斜杠 UNC。无上下文的双正斜杠 POSIX 路径继续保持大小写语义，WSL UNC 保持 WSL 身份。
- Task 1 GREEN：共享桥、路径语义、计数、Rail、Pane、发现投影、成员解析和 worktree 状态
  共 8 文件、142 个测试通过。
- Task 2 RED：空 hook 得到 7 个预期失败、1 个通过；Pane 真实上下文集成回归也先失败。
- Task 2 GREEN：刷新 hook、已有启发式/定时刷新 hook、Pane 和聚合面板共 5 文件、54 个测试通过。
- 最终 `bun run typecheck` 的 main/web/test 三个项目通过；内置 architecture preflight 通过。
- Inline 审查确认无新依赖、计数持久化、定时器、路径写入或导航身份改变；`git diff --check` 通过。
- 单独 `bun run check:architecture` 通过；本次 17 个代码/文档文件的 Prettier check 通过。
- 最终联合回归：Task 1 的 8 文件加 Task 2 的刷新/集成文件去重后，共 12 文件、166 个测试通过
  （含后加入的 Pane 导航刷新集成用例），使用 `--maxWorkers=2`。
- 完整 `bun run test --maxWorkers=4` 已结束：451 文件中 410 通过、40 失败、1 跳过；
  4734 个测试中 4546 通过、165 失败、23 跳过，约 959 秒。失败文件未包含本次相关测试。
- 为核对回归，在 ignored `node_modules/.cache/branch-workspace-baseline-20261004/` 中读取
  HEAD 版本共享路径桥，并用专用 Vitest alias 替代该模块；未回滚或改写工作树源文件。
  终端与批量 Git 计划共 108 个测试中 94 个失败，与全套对应两个文件的 47 + 47 相同。
  其 POSIX fixture 在 Windows 原生路径处理后变成盘符/反斜杠路径，与固定 POSIX 断言不一致。
- 其余失败文件（排除耗时约 267 秒的 build-script 套件）共 37 文件，以同一 HEAD 桥接 alias
  重放：526 通过、68 失败、3 跳过。按失败用例完整标题比较，60 个与全套相同；8 个全套超时
  用例在重放中通过，另有 8 个重放失败来自未修改的 app/settings/bootstrap 用例，说明基线
  也存在不稳定的 IO/超时表现。Electron 缺少安装文件的 suite 加载失败也仍存在。
- 两轮基线共复现全套 154 个相同失败用例，另 8 个全套失败重跑通过。剩余 build-script 的
  3 个失败没有重跑：2 个要求 Unix executable mode bit，在 Windows 上得到 0；1 个为独立
  Vite 配置读取子进程的 5 秒超时。对应测试、脚本、Vite 配置和 launcher 文件均未被本次修改。
- 基线产物和日志留在 ignored cache/系统临时目录；本次代码和计划留在当前工作树供审查。

## 验收状态

- 设计验收 1–6 的行为修复及回归通过，Windows 2 + 3 = 5、成功零值、成员身份和过期刷新规则
  均在最终 166 个相关测试中验证；typecheck、architecture、格式及 diff 检查通过。
- 设计验收 7 的完整测试全绿条件尚未达到。完整套件已执行并按上述基线方法调查，未删除、
  放宽或修改与本任务无关的失败用例。交付不宣称完整测试通过或已具备发布门禁。

## 本地应用替换（2026-10-06）

用户后续明确要求构建并替换本地 app。本次使用主应用根包的 Windows x64 配置：

```text
bun run typecheck
bun run build:web
bun run build:electron -- --win nsis --x64 --config.npmRebuild=false
```

- 类型检查的三个项目与 architecture preflight 通过；前端构建及 NSIS 打包通过。
- 新 `app.asar` 中的共享路径桥、main/server 入口与当前源码逐文件哈希一致；全部 9 个前端
  产物也与本次生产构建一致。打包后的 Electron 42.3.3 / Node 24.15.0 / ABI 146 成功加载
  Windows x64 ConPTY 原生模块，核验进程退出码为 0。
- 既有安装已完整备份到相邻 `Hobgoblin.backup-<timestamp>` 目录，并核对原/备份 archive
  哈希一致；关闭既有实例后，使用新安装包静默更新原安装位置，安装程序退出码为 0。
- 安装后的 archive 与新构建哈希一致，应用版本仍为 2.3.2，包含当前工作树修复。
- 应用已重新打开。主窗口存在、renderer 加载完成、内置服务就绪，健康检查 HTTP 200；
  运行服务返回本次前端 bundle，重启后的 renderer error 日志为 0。
