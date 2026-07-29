# 定时仓库状态刷新设计

**日期**：2026-07-29  
**状态**：已确认

## 目标

1. 从子工作区 More 菜单移除“刷新改动”，同时删除只为该动作存在的行级 pending 与协调逻辑。
2. 在“设置 → 刷新”新增“状态刷新”设置组和“定时刷新改动”选项。
3. 定时刷新通过现有仓库 status 读取链路更新普通仓库、成员工作树和子工作区的改动数量。

## 用户界面

“设置 → 刷新”保留现有“同步 / 自动同步”，并在其后新增：

- 设置组：`状态刷新`
- 设置项：`定时刷新改动`
- 帮助文本：说明它会定时刷新当前项目的本地改动状态。
- 选项：关闭、30 秒、1 分钟、2 分钟、3 分钟、5 分钟、15 分钟；与自动同步完全一致。

新设置默认值为 2 分钟，与自动同步的默认值一致。它是独立设置：修改状态刷新间隔不会改变自动同步间隔，反之亦然。

## 状态所有权与持久化

`statusRefreshIntervalSec` 是 server-owned runtime-coherent 设置：

1. 服务端负责读取、规范化和持久化。
2. Settings snapshot 和 bootstrap snapshot 将其投影给 Renderer。
3. Renderer 通过现有 settings prefs 写路径更新服务端，并立即更新当前 Query 缓存。
4. 其他 Renderer 通过现有 settings invalidation + refetch 收敛，不新增实时协议。

间隔使用与 `fetchIntervalSec` 相同的数值规范化：有限数值、四舍五入、限制在 0–3600 秒；缺失或非法值回退到 120 秒。

## 定时刷新范围与执行

主应用挂载一个 Renderer hook。间隔大于 0 时，每次计时触发：

1. 解析当前顶层项目。
2. 普通项目选择当前仓库；多仓工作区选择该项目的全部成员仓库。
3. 过滤不存在、不可用或非 Git 的仓库。
4. 对每个目标调用现有 `refreshStatus(repoId, { token })`。

计时器首次挂载和切换项目时不立即刷新，完整等待一个配置间隔后才触发。目标项目或间隔变化时重建计时器；卸载时清理计时器。单个仓库失败不阻止其他仓库刷新，既有 `refreshStatus` 继续负责同仓库请求协调、旧实例 token 防护和错误状态投影。

该范围可以更新当前多仓项目中所有成员工作树的状态，因此 `WorkspaceRepositoryRail` 已有的成员和子工作区 change count 派生会自然重算。不刷新后台项目，避免不必要的 Git I/O。

## 子工作区菜单移除

删除 `BranchWorkspaceList` 的 `onRefreshChanges`、`refreshingChangeIds` props 和“刷新改动”动作；删除 `WorkspaceRepositoryRail` 中对应的本地 Set、ref、回调和 props 传递。标题栏的手动列表刷新仍只执行 `branchQuery.refresh()`，不与状态刷新合并。

删除不再使用的 `workspace.branch-workspace.refresh-changes` 四语言文案和专用字典断言。历史设计文档保留，作为已实现功能的演进记录。

## 分层与实时边界

- 设置读取沿用 settings read projection，设置写入沿用 settings client/write path/source。
- 定时调度属于 Renderer 生命周期副作用，不放入 UI 组件或服务端 scheduler。
- repo status 仍是服务端权威数据的 Renderer 投影，不新增 Zustand 持久状态。
- 轮询已是本功能明确需求，因此不新增 WebSocket 消息；设置变化继续使用既有 invalidation。
- 不新增依赖、不修改自动同步 scheduler、不修改子工作区查询协议。

## 测试

- 默认值、override、序列化投影、服务端读取和非法值回退覆盖 `statusRefreshIntervalSec`。
- Settings UI 渲染新增组/设置项/七个选项，并把选择写回服务端与 Query cache。
- 定时 hook 证明：等待配置间隔后刷新当前普通项目；多仓项目刷新所有可用 Git 成员；不刷新后台、不可用和非 Git 仓库；关闭后不调度；项目或间隔变化会重建计时器；卸载会清理。
- 子工作区菜单不再显示“刷新改动”，Rail 不再暴露行级刷新 props。
- 运行针对性 Vitest、`bun run typecheck`、`bun run check:architecture` 和完整 `bun run test`。

## 非目标

- 不改变标题栏“刷新子工作区列表”的语义。
- 不把定时状态刷新与自动同步合并成一个设置或一个动作。
- 不刷新所有已打开但处于后台的项目。
- 不新增手动状态刷新入口；改动页既有独立刷新按钮保持原样。
- 不改变 status 错误展示、重试或缓存语义。

## 决策记录

不创建 ADR：新增设置和 hook 都沿用现有 settings、repo projection 和 Renderer 生命周期边界，属于局部且可逆的功能扩展。
