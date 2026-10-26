# 工作区与子工作区改动状态刷新设计

**日期**：2026-10-26  
**状态**：已确认，允许内联实施

## 意图

多仓库工作区上方的“工作区仓库”列表，以及其下方的子工作区根项，直接显示仓库 worktree 的改动数量。终端或外部编辑器改变文件后，列表中的 `repo.data.status` 可能仍是旧投影。用户需要从对应仓库行或子工作区 More 菜单手动刷新改动状态，而不必执行远程同步或重新扫描工作区。

## 目标

- 在工作区仓库行的操作菜单中增加“刷新改动”。
- 在子工作区根项的 More 菜单中增加“刷新改动”，并刷新该子工作区的可用成员仓库。
- 点击后只读取该仓库的 Git status，并让改动数量徽标立即使用最新状态重渲染。
- 同一仓库刷新期间显示忙碌并阻止重复点击；请求结束后恢复操作。
- 复用现有仓库状态读取协调、实例 token 校验、错误和旧数据保留语义。
- 保持本地仓库、SSH 仓库和包含多个 worktree 的仓库行为一致。

## 非目标

- 不执行 fetch、pull、push 或其他 Git 写操作。
- 不刷新分支 snapshot、提交历史或工作区目录发现。
- 不改变工作区仓库成员关系、排序、选中状态或持久化布局。
- 不新增服务端 API、WebSocket 消息、轮询或文件 watcher。
- 不广播一次只读 status 请求；跨窗口的既有仓库失效事件仍只由实际 Git 写入或同步操作触发。

## 方案

### 采用：仓库行菜单定向 status 刷新

`WorkspaceRepositoryRail` 将每个仓库的 `refreshStatus(repoId, { token })` 回调传给 `WorkspaceRepositoryList`，并将子工作区刷新回调与 pending 集合传给 `BranchWorkspaceList`。两个列表组件只负责菜单呈现；Rail 从最新 Zustand 仓库状态取得实例 token，按仓库去重后并行调用现有 status 读取。状态成功后 `repo.data.status` 更新，工作区仓库、子工作区根项和成员改动数量从现有投影自然重算。pending 集合只负责 UI 防重复，不进入共享状态。

### 不采用：完整仓库同步

`syncAndRefresh` 可能执行远程 fetch、更新分支 snapshot 并触发已有仓库失效广播，动作范围超过“刷新改动状态”，也会给本地和无远程仓库带来不必要的网络/读取开销。

### 不采用：重新扫描工作区

`rescanWorkspace` 会重新发现目录、协调成员可用性并启动更多刷新，无法表达单个仓库状态刷新完成，且会改变用户不想改变的工作区发现边界。

## 数据流与实时边界

1. 用户从工作区仓库行或子工作区 More 菜单选择“刷新改动”。
2. `WorkspaceRepositoryList` 和 `BranchWorkspaceList` 只负责菜单呈现与 busy 状态，不读取 store 或决定刷新范围。
3. `WorkspaceRepositoryRail` 从最新 store 状态取仓库实例 token，调用 `refreshStatus`；子工作区动作按成员映射去重并行读取。
4. `refreshStatus` 的结果更新 renderer 内 runtime-coherent 仓库投影；工作区仓库、子工作区根项和成员改动数量直接从该投影派生并重渲染。
5. 本功能不新增 realtime 协议。其他窗口仍通过已有 server invalidation 处理实际 Git 写入/同步；只读 status 不改变服务端事实，因此不会人为发布失效事件。

## 交互与错误处理

- 菜单使用 feature-scoped key `workspace.repository.refresh-changes`，中文为“刷新改动”，英文为“Refresh changes”。
- 仓库不可用或非 Git 时保留菜单项但禁用。
- 刷新失败沿用 `refreshStatus` 的资源错误和旧数据保留语义，不显示虚假的成功 toast。
- 请求结束后无论成功或失败都清除 busy 状态，允许再次刷新。

## 测试

- 工作区仓库菜单显示“刷新改动”，不可用仓库的菜单项禁用。
- 子工作区 More 菜单显示“刷新改动”，点击后只刷新可用且未移除的成员仓库，重复点击被阻止。
- 点击目标仓库只调用 `refreshStatus(id, { token })`，不调用 `syncAndRefresh`、`rescanWorkspace` 或分支工作区查询刷新。
- 刷新进行中菜单项 busy/disabled，重复点击不会增加请求；settle 后恢复。
- status 结果改变后工作区仓库改动数量徽标使用最新值。
- 运行字典测试、工作区仓库列表/rail 测试、`bun run typecheck`、`bun run check:architecture` 和完整 `bun run test`。

## 确认

已确认采用“只刷新改动状态”的方案；工作区仓库和子工作区菜单文案均为“刷新改动”（英文 `Refresh changes`）。
