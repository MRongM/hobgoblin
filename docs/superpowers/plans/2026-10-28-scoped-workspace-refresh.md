# 工作区定向刷新 Implementation Plan

**Goal:** 一级刷新入口、混合成员定向刷新、整体刷新避免 status 扇出、定时小批轮转。

**Architecture:** 共享菜单按操作身份提升入口；store 生命周期区分目录重扫的 snapshot 与完整 core 刷新；子工作区查询先投影仓库身份；定时 hook 持有当前项目的轮转游标与批次忙碌状态。

**Tech Stack:** React、Zustand、TanStack Query、Vitest、TypeScript strip-only。

在现有隔离 worktree 内内联执行，不提交或推送；复用现有 API，不引入依赖。

## Task 1：一级菜单

- [x] 在共享菜单测试中断言 refreshFolder 及其翻译 key 别名为一级首项，More 与右键均可调用，busy 时禁用。
- [x] 运行新增测试确认失败。
- [x] 修改 `workspace-menu-groups.ts` 与 `WorkspaceActionMenuItems.tsx`，统一提升文件夹刷新，其他分类顺序不变。
- [x] 运行新增菜单测试。

## Task 2：刷新范围

- [x] 在 `lifecycle.test.ts` 中证明重扫更新分支但不调用 status。
- [x] 在 `WorkspaceRepositoryRail.test.tsx` 中证明列表刷新不刷新成员数量，指定工作区只刷新其当前混合成员。
- [x] 在查询测试中证明新发现成员投影可立即使用，自动发现仅请求 snapshot。
- [x] 运行定向失败测试，然后调整 `lifecycle-write-paths.ts`、`branch-workspace-queries.ts`、`WorkspaceRepositoryRail.tsx`。
- [x] 保持实例 token、成员去重、失败保留、pending finally 清理语义，并验证上述测试。

## Task 3：定时分批

- [x] 在 `useScheduledRepoStatusRefresh.test.tsx` 增加超过一批的成员、独立仓库、轮转、防重叠和实时 token 覆盖。
- [x] 运行失败测试；修改 hook 为每批最多 5 个活动项目可用 Git 仓库，等待结算后继续轮转。
- [x] 验证关闭定时刷新、切换项目和卸载清理。

## Task 4：文档和验证

- [x] 更新 `docs/state-sync.md` 和 `docs/ui-conventions.md`。
- [x] 运行定向测试、`bun run typecheck`、`bun run check:architecture`、`bun run test`，与基线失败集合比较。
- [x] 检查格式和 diff，汇报结果及既有失败。

## 验证结果

- 18 项定向测试通过，覆盖菜单、目录重扫、自动发现、混合成员、定时轮转及跨项目/间隔变更的批次锁。
- `bun run typecheck`、`bun run check:architecture`、`bun run build:web` 通过。
- 完整 `bun run test`：4769 项通过、311 项失败、17 项跳过；311 项失败用例集合与改动前基线完全一致，无新增失败。
- 独立只读审查发现的成员归属和跨 effect 批次重叠问题已修正并复核：成员范围来自现有子工作区查询快照，批次锁跨 effect 保留。
- `git diff --check` 通过；未提交或推送。
