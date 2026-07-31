# 批量 Git 进度与 SSH 读取隔离设计

**日期**：2026-07-30
**状态**：已实施并验证

## 背景

子工作区的批量提交、批量拉取、批量推送、批量合入和批量合出通过服务端串行执行。当前进度变化使用 `workspace-invalidated` 广播；每次广播都会让活动 Renderer 重新读取完整子工作区快照，并为所有成员仓库发起远程 Git 快照命令。

这使纯进度变化与仓库事实刷新耦合。执行期校验、pull 后计划重建和后续 Git 写入可能与 Renderer 的 SSH refetch 重叠，造成瞬时超时并被折叠成“仓库不可用”。独立的“拉取全部仓库”计划还读取了不需要的 worktree 状态和远端信息。

## 目标

1. 五类子工作区 Git 批量动作继续实时投影跨窗口进度，但进度变化不触发仓库 SSH 读取。
2. 批量动作执行期间暂缓其内部 Git 写入产生的仓库失效广播，避免 pull 后重校验与 Renderer refetch 竞态。
3. 批次结束或失败后，为本次实际触及的仓库统一发布快照失效，使所有 Renderer 最终收敛。
4. “拉取全部仓库”的计划只读取定位主 worktree 所需的轻量快照。
5. 保持取消、重试、合并冲突现场和多窗口进度语义不变；成员失败隔离与汇总由 2026-07-31 的批量错误设计接管。

## 非目标

- 不增加全局 SSH 主机限流器、自动重试或延长 SSH 超时。
- 不改变 Git 命令、分支选择、合并模式或错误文案。
- 不增加持久状态、轮询、Electron 专用通道或新依赖。
- 不重构普通仓库写入路径的默认失效行为。

## 方案比较

### 方案 A：携带权威进度的轻量事件（采用）

服务端发布 `branch-workspace-operation-updated`，携带根目录、子工作区 ID 和当前 `BranchWorkspaceActiveOperation | null`。Renderer 只更新已有 TanStack Query 快照中对应条目的 `activeOperation` 字段，不发网络读取。

优点是消息有序、无额外 HTTP 往返、不会形成请求乱序，且保持服务端拥有运行时事实。批量动作结束时再发布触及仓库的定向快照失效，仓库数据最终收敛。

### 方案 B：进度失效事件加轻量查询接口

事件只携带身份，Renderer 再请求活动操作。它保持纯 invalidation/refetch 模型，但每个步骤增加 HTTP 请求，还需要合并并发请求和防止旧响应覆盖新状态。

### 方案 C：SSH 限流或失效防抖

可降低峰值，但仍让进度更新触发不相关的仓库读取，只掩盖职责错误，不采用为主修复。

## 协议与状态所有权

新增共享事件：

```ts
interface BranchWorkspaceOperationUpdatedEvent {
  type: 'branch-workspace-operation-updated'
  rootId: string
  branchWorkspaceId: string
  operation: BranchWorkspaceActiveOperation | null
}
```

- 服务端 Git 动作写路径拥有活动操作 Map，是唯一权威来源。
- 事件是运行时一致状态的投影更新，不是持久事实。
- `operation: null` 明确清除活动状态。
- Renderer 只修改匹配 `rootId` 与 `branchWorkspaceId` 的现有成功快照；没有缓存或条目不存在时忽略，下一次普通读取仍会从服务端得到权威状态。
- 普通 `workspace-invalidated` 继续用于子工作区清单、目录或成员事实发生变化的写路径。

## 批量写入失效边界

仓库级写函数增加可选失效策略，默认仍立即发布。子工作区 Git 批量服务调用时关闭立即发布，并记录触及的 `repoId`：

```ts
interface RepoMutationInvalidationOptions {
  publishInvalidation?: boolean
}
```

批量执行顺序：

1. 重建并校验计划。
2. 发布初始活动操作事件。
3. 每个步骤只发布活动操作事件，然后执行 Git。
4. pull 成功后直接从服务端权威仓库重建计划；此时不存在 Renderer 触发的仓库 refetch。
5. 成功、失败或取消退出 `finally` 时，先清除活动操作并发布 `operation: null`，再为触及仓库各发布一次 `repo-snapshot` 失效。

Git 动作不再使用完整 `workspace-invalidated` 表示进度或结束，因为这些动作不修改子工作区清单。仓库快照失效负责 Git 状态收敛，操作事件负责进度收敛。

## “拉取全部仓库”计划

计划只使用分支列表和 worktree 路径定位主 worktree，不读取 worktree dirty summary 或远端列表。因此调用：

```ts
getRepositorySnapshot(repoId, signal, {
  includeWorktreeStatus: false,
  includeRemote: false,
})
```

仓库仍按配置顺序规划和拉取，token、取消和重试语义不变。

## 错误与边界场景

- 执行期校验失败：不发布进度事件，不触发仓库失效。
- Git 调用抛错或返回失败：`finally` 仍清除进度，并刷新已经尝试过的仓库。
- 合并冲突：冲突仓库被标记为触及，结束后刷新以显示冲突状态；原有 `conflictWorktree` 结果保持不变。
- 未执行任何 Git 的参数错误或计划过期：不发布仓库刷新。
- Renderer 在事件到达时没有对应缓存：忽略事件，不创建不完整快照。
- 多个 Renderer：同一 WebSocket 事件顺序投影；批次结束后的仓库失效让每个 Renderer 读取最终 Git 状态。

## 测试策略

1. 共享协议接受完整进度和 `null`，拒绝非法根目录、ID、kind、计数和步骤。
2. Broker 序列化进度事件；无 socket 时安全返回。
3. Renderer 收到进度事件只 patch 对应条目，不调用 `invalidateQueries`，并能清除状态。
4. 服务端写路径在校验后发布进度，步骤更新不发布 workspace invalidation，退出后每个触及仓库只失效一次。
5. pull 后计划重建发生在任何触及仓库失效之前。
6. 仓库写函数在显式关闭时不广播，默认调用保持原行为。
7. “拉取全部仓库”断言轻量快照选项。
8. 最终运行 `bun run typecheck`、`bun run test`、`bun run check:architecture` 和 `git diff --check`。

## 架构压力检查

- **状态所有权**：进度仍由服务端拥有，Renderer 只维护可丢弃投影。
- **分层**：协议在 shared，发布在 server write path，缓存投影在 web invalidation ingress；不跨 Electron 边界。
- **实时语义**：这是 UX 需要的离散进度投影；Git 数据仍通过 targeted invalidation + refetch 收敛。
- **KISS**：不新增查询接口、轮询、全局限流或持久化。
- **DRY**：所有 Git 批量种类共用同一发布器和同一触及仓库集合。
- **YAGNI**：仓库写函数只增加一个默认不改变行为的选项，不推广成通用事务框架。

不创建 ADR：事件和失效策略是现有实时桥与写路径的可逆扩展，没有引入新的平台或持久化决策。

## 实施结果

- 五类子工作区 Git 动作均通过轻量事件投影进度，不再用工作区失效事件表示运行时进度。
- 批量 Git 写入在执行期间延迟仓库快照失效，并在退出时按仓库去重发布。
- 执行期校验和 pull 后计划重建期间不会被本批次触发的 Renderer refetch 干扰。
- “拉取全部仓库”计划关闭 worktree 状态和远端信息读取。
- 定向集成测试 182/182、完整测试 3604/3604、类型检查和架构检查均通过。
