# Batch Git Progress and SSH Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让批量 Git 进度跨窗口同步不再触发仓库 SSH 重扫，并让批量写入结束后再统一刷新触及仓库。

**Architecture:** 共享实时协议增加携带权威活动操作的轻量事件，Renderer 将其投影到既有 branch-workspaces query。仓库写函数保留默认立即失效行为，但允许批量服务暂缓；批量服务在 `finally` 中清除进度并统一发布触及仓库失效。

**Tech Stack:** TypeScript 6（Node.js strip-only）、Hono、React 19、TanStack Query、Vitest、现有 WebSocket invalidation bridge。

## Global Constraints

- 不新增依赖，不增加轮询、持久状态或 Electron 专用通道。
- 不使用 enum、runtime namespace、parameter property 或 TypeScript import alias。
- 使用 repo alias 和显式 `.ts` / `.tsx` 后缀。
- 保持现有 Git 语义、失败结果、取消和重试行为。
- 当前会话 inline 执行，不启用子代理，不执行 `git commit`。

---

### Task 1: 增加轻量活动操作事件和 Renderer 投影

**Files:**

- Modify: `src/shared/server-invalidation.ts`
- Test: `src/shared/server-invalidation.test.ts`
- Modify: `src/server/modules/invalidation-broker.ts`
- Test: `src/server/modules/invalidation-broker.test.ts`
- Modify: `src/web/branch-workspace-invalidation.ts`
- Test: `src/web/branch-workspace-invalidation.test.ts`

**Interfaces:**

- Produces: `BranchWorkspaceOperationUpdatedEvent`
- Produces: `publishBranchWorkspaceOperationUpdate(rootId, branchWorkspaceId, operation)`
- Preserves: ordinary `workspace-invalidated` refetch behavior.

- [x] **Step 1: 写共享协议和 Renderer 失败测试**

协议测试要求合法活动操作和 `null` 被接受，非法事件被拒绝。Renderer 测试构造完整 `BranchWorkspaceReadResult`，断言事件只更新匹配条目的 `activeOperation`，清除事件删除该字段，并且 `invalidateQueries` 未调用。

- [x] **Step 2: 运行测试确认 RED**

Run:

```text
bun run test -- src/shared/server-invalidation.test.ts src/server/modules/invalidation-broker.test.ts src/web/branch-workspace-invalidation.test.ts
```

Expected: FAIL，因为新事件类型、publisher 和缓存投影不存在。

- [x] **Step 3: 实现最小协议、publisher 与缓存 patch**

在 shared 中定义严格 type guard；broker 通过现有 socket 集合广播 JSON。Web subscriber 对新事件调用 `setQueryData(branchWorkspaceQueryKey(rootId), updater)`，只修改成功快照中的匹配 item；普通 workspace event 继续调用 `invalidateQueries`。

- [x] **Step 4: 运行测试确认 GREEN**

运行 Step 2 相同命令，Expected: PASS。

---

### Task 2: 允许仓库写入延迟快照失效

**Files:**

- Modify: `src/server/modules/repo-write-paths.ts`
- Test: `src/server/modules/repo.test.ts`

**Interfaces:**

- Produces: `RepoMutationInvalidationOptions { publishInvalidation?: boolean }`
- Produces: `publishRepositorySnapshotInvalidation(repoId, sourceToken?)`
- Extends: commit/pull/push/merge/create-worktree/remove-worktree with a final optional options parameter.

- [x] **Step 1: 写失败测试**

对一个网络写入和一个非网络写入分别断言 `{ publishInvalidation: false }` 时不广播；直接调用公开 publisher 时广播标准 `repo-query-invalidated`。保留现有默认广播断言。

- [x] **Step 2: 运行测试确认 RED**

Run: `bun run test -- src/server/modules/repo.test.ts`

Expected: FAIL，因为选项和公开 publisher 不存在。

- [x] **Step 3: 实现最小失效策略**

让内部 publish helpers 在选项关闭时直接返回原结果；默认值保持发布。公开 publisher 复用既有 `repoSnapshotInvalidationEvent()`，不复制协议构造。

- [x] **Step 4: 运行测试确认 GREEN**

Run: `bun run test -- src/server/modules/repo.test.ts`

Expected: PASS。

---

### Task 3: 批量 Git 服务改用轻量进度并统一刷新触及仓库

**Files:**

- Modify: `src/server/modules/branch-workspace-git-action-write-paths.ts`
- Test: `src/server/modules/branch-workspace-git-action-write-paths.test.ts`

**Interfaces:**

- Consumes: Task 1 operation publisher。
- Consumes: Task 2 deferred invalidation options and explicit repo publisher。
- Preserves: `activeOperation()` read API and all result contracts。

- [x] **Step 1: 写执行顺序失败测试**

测试记录 `validate`、operation update、Git mutation、plan refresh、repo invalidation 和 workspace invalidation。要求：校验前无事件；所有步骤进度使用 operation update；Git 调用收到 `{ publishInvalidation: false }`；pull 后 refresh 完成前无 repo invalidation；退出后 operation 为 `null`；每个触及 repo 只失效一次；workspace invalidation 不调用。

- [x] **Step 2: 运行测试确认 RED**

Run: `bun run test -- src/server/modules/branch-workspace-git-action-write-paths.test.ts`

Expected: FAIL，因为现有步骤仍发布 workspace invalidation，且 Git mutation 未延迟失效。

- [x] **Step 3: 实现触及仓库集合和 operation publisher**

在单次 `execute()` 创建 `Set<string>`；每次即将执行 Git mutation 时加入 repoId。校验成功后以及每次 `updateActive()` 后发布活动操作快照。所有内部 Git 调用传入 `{ publishInvalidation: false }`。`finally` 删除 active、发布 `operation: null`，再逐个调用显式 repo publisher；不发布 workspace invalidation。

- [x] **Step 4: 覆盖失败、取消和重试**

确认抛错、返回失败、合并冲突和取消均经过同一 `finally`；没有 Git 调用的校验失败不发布 operation 或 repo invalidation。重试只刷新本次实际触及的仓库。

- [x] **Step 5: 运行测试确认 GREEN**

Run: `bun run test -- src/server/modules/branch-workspace-git-action-write-paths.test.ts`

Expected: PASS。

---

### Task 4: “拉取全部仓库”使用轻量快照

**Files:**

- Modify: `src/server/modules/workspace-pull-plan.ts`
- Test: `src/server/modules/workspace-pull-plan.test.ts`

- [x] **Step 1: 写失败测试**

断言每个 `getSnapshot` 调用收到：

```ts
{ includeWorktreeStatus: false, includeRemote: false }
```

- [x] **Step 2: 运行测试确认 RED**

Run: `bun run test -- src/server/modules/workspace-pull-plan.test.ts`

Expected: FAIL，因为当前只传递 repoId 和 signal。

- [x] **Step 3: 实现并确认 GREEN**

扩展依赖签名为 `typeof getRepositorySnapshot`，传入轻量选项，再运行 Step 2 命令，Expected: PASS。

---

### Task 5: 集成验证和文档收尾

**Files:**

- Modify: `docs/superpowers/specs/2026-07-30-batch-git-progress-ssh-isolation-design.md`
- Modify: `docs/superpowers/plans/2026-07-30-batch-git-progress-ssh-isolation.md`

- [x] **Step 1: 运行定向集成测试**

```text
bun run test -- src/shared/server-invalidation.test.ts src/server/modules/invalidation-broker.test.ts src/web/branch-workspace-invalidation.test.ts src/server/modules/repo.test.ts src/server/modules/branch-workspace-git-action-plan.test.ts src/server/modules/branch-workspace-git-action-write-paths.test.ts src/server/modules/workspace-pull-plan.test.ts src/server/modules/workspace-pull-write-paths.test.ts
```

- [x] **Step 2: 运行项目验证**

```text
bun run typecheck
bun run test
bun run check:architecture
git diff --check
```

- [x] **Step 3: 复核差异和更新状态**

确认没有覆盖无关改动、没有真实标识进入测试/文档、没有新增依赖或提交；将 spec 与 plan 状态更新为已实施并记录真实测试计数。

## Verification Record

- 定向集成：10 个测试文件，182 个测试通过。
- 完整测试：380 个测试文件，3604 个测试通过。
- `bun run typecheck`：通过。
- `bun run check:architecture`：通过。
- `git diff --check`：通过。
- 未新增依赖，未执行 Git 提交、推送或分支操作。
