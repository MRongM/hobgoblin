# 刷新后移除不可用工作区仓库 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 工作区仓库列表刷新后不再显示本次扫描确认不可用的成员，同时保留服务端配置以便后续恢复。

**Architecture:** 在现有 `rescanWorkspace` → `reconcileWorkspaceProject` → `applyWorkspaceDiscoveryResult` 链路中增加仅限手动刷新的清理选项。配置扫描和首次恢复继续保留不可用候选；手动刷新将不可用候选排除出当前 `repositoryIds`，复用现有成员解绑与活动选择修正逻辑。

**Tech Stack:** TypeScript, Zustand, React, Vitest, Bun.

## Global Constraints

- 遵守 Node.js strip-only TypeScript 约束，不使用 enum、namespace、参数属性或 import alias。
- 新增导入使用仓库别名并带显式 `.ts`/`.tsx` 扩展名。
- 不新增依赖，不执行 git commit。
- 验证 `bun run typecheck`、相关 Vitest 测试和 `bun run check:architecture`。

### Task 1: 增加手动刷新清理选项

**Files:**

- Modify: `src/web/stores/repos/lifecycle-write-paths.ts`
- Test: `src/web/stores/repos/lifecycle.test.ts`

**Interfaces:**

- `rescanWorkspace(rootId)` 调用 `reconcileWorkspaceProject` 时传递 `{ pruneUnavailable: true }`。
- `reconcileWorkspaceProject` 和 `applyWorkspaceDiscoveryResult` 接受可选清理选项；默认保持现有恢复/自动导入行为。

- [x] **Step 1: 写回归测试**

在生命周期测试中构造一次配置工作区：第一次扫描返回 `api` 与 `web`，第二次扫描让 `web` 变为不可用；调用 `rescanWorkspace` 后断言 `workspaceProjects[root].repositoryIds` 只含 `api`，不可用 `web` 不再具备 `workspaceRootId`，且当前选中仓库回退到工作区根目录。另加断言首次 `ensureWorkspaceOpen` 仍保留不可用成员。

- [x] **Step 2: 运行测试确认当前行为失败**

运行：`bun run test src/web/stores/repos/lifecycle.test.ts`

预期：新增刷新清理断言失败，当前实现仍保留不可用成员。

- [x] **Step 3: 实现最小改动**

为 `reconcileWorkspaceProject` 增加 `options?: { pruneUnavailable?: boolean }`，`rescanWorkspace` 传入该选项；向 `applyWorkspaceDiscoveryResult` 传递同一选项。配置为 `ready` 且启用清理时，使用 `effectiveCandidates.filter((candidate) => candidate.available)` 生成 `repositoryIds`；候选快照和服务端配置不变，后续既有解绑循环负责清除成员工作区关联，活动选择逻辑负责回退到根目录。其他调用保持默认 `false`。

- [x] **Step 4: 运行生命周期测试确认通过**

运行：`bun run test src/web/stores/repos/lifecycle.test.ts`

预期：新增断言和现有生命周期测试全部通过；首次恢复不可用成员的断言保持通过。

### Task 2: 全量验证

**Files:**

- No additional files.

- [x] **Step 1: 运行类型检查**

运行：`bun run typecheck`

预期：退出码 0。

- [x] **Step 2: 运行完整测试**

运行：`bun run test`

预期：退出码 0，所有测试通过。

- [x] **Step 3: 检查架构边界**

运行：`bun run check:architecture`

预期：退出码 0。
