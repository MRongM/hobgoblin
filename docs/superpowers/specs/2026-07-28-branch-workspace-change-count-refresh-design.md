# 子工作区改动数量手动刷新设计

**日期**：2026-07-28  
**状态**：已确认，允许内联实施

## 问题

子工作区根项和成员摘要中的改动数量 badge 来自 renderer 内 `useReposStore.repos` 的仓库
status 投影。应用内 Git 写操作会发布失效事件，切换活动仓库或打开 Status/Changes 也可能触发
启发式刷新；但终端命令和外部编辑器造成的文件变化不会主动发布失效事件。未激活成员仓库的 status
因此可能长期不更新，使子工作区 badge 显示旧值。

顶部“重新扫描仓库”会重新发现整个配置工作区，并异步刷新全部成员仓库。它的范围和文案都不是
“刷新一个子工作区的改动数量”，而且扫描结束不代表所有 status 请求已完成，不能作为该 badge 的明确
恢复入口。

## 目标

- 在每个可用子工作区的 More 菜单中提供“刷新改动”。
- 点击后只读取该子工作区当前成员仓库的 Git status。
- status 返回后，让现有根项汇总 badge 和展开成员 badge 通过 store 投影自然重渲染。
- 同一子工作区刷新期间阻止重复请求，并在请求结束后恢复菜单动作。
- 支持本地和 SSH 配置工作区，不引入持续轮询。

## 非目标

- 不增加定时器、文件系统 watcher、后台任务或新的 realtime 协议。
- 不执行 fetch、pull、Git 写操作或工作区重新扫描。
- 不重新读取子工作区注册表，不改变成员关系、漂移检测或生命周期状态。
- 不持久化刷新状态，不显示“最后刷新时间”，不新增设置项。
- 不改变现有 badge 的计数、路径匹配或零值隐藏规则。

## 方案比较

### 采用：子工作区 More 菜单手动刷新

动作范围与用户看到的 badge 一致。每次点击按配置工作区中的仓库 ID 去重，调用现有
`refreshStatus(repoId, { token })`。该读取会更新仓库内所有 worktree 的 status，因此同一仓库的其他
现有投影也会同步收敛，不需要复制状态。

### 不采用：renderer 定时轮询

轮询能自动发现外部改动，但会按“窗口数 × 配置仓库数”放大本地 Git 和 SSH 请求。它还会把运行时一致
策略分散到每个 renderer，不符合 server-first 状态模型。当前需求已有低成本的显式恢复方式，无需引入
持续负载。

### 不采用：复用顶部“重新扫描仓库”

该动作还会执行目录发现、成员可用性协调和 snapshot 刷新，明显大于 badge 的 status 读取边界；现有
pending 状态也不等待异步启动的成员刷新完成。复用它会让动作语义和完成反馈都不准确。

## 组件与数据流

`WorkspaceRepositoryRail` 继续拥有跨仓库数据投影和刷新编排：

1. 根据子工作区成员的 `repositoryName`，使用现有 `repositoryIdByName` 映射解析仓库 ID。
2. 排除 `progress === 'removed'`、不存在或当前不可用的仓库，并对 ID 去重。
3. 从 `useReposStore.getState()` 获取点击时的最新仓库实例 token。
4. 并行等待每个唯一成员仓库的 `refreshStatus(repoId, { token })`。
5. status 更新现有 `repos` 投影；`branchWorkspaceChangeCountById` 与
   `getMemberPresentation` 自动重新计算根项和成员 badge。

`BranchWorkspaceList` 只接收刷新回调及 pending 子工作区 ID，并在行级 More 菜单中投影动作。它不读取
store、不决定仓库映射，也不拥有网络或 Git 编排。

## 交互

- 文案使用 sentence case：英文 `Refresh changes`，中文 `刷新改动`，日文 `変更を更新`，韩文
  `변경 사항 새로 고침`。
- 动作使用 `RefreshCw` 图标，放在子工作区 More 菜单的 Git 批量动作之前。
- ready 子工作区和根目录仍可用的 drift 子工作区显示该动作；活动 operation 或全局禁用状态下不可用。
- 当前子工作区刷新中，动作显示 busy/disabled；同步 guard 阻止同一项的快速重复触发。
- 零成员或全部成员不可用时动作仍可安全完成，不改变现有值。

## 错误处理

`refreshStatus` 已拥有最新请求协调、实例 token 校验、错误记录和旧数据保留语义。本功能不重复包装这些
规则。单个成员读取失败时，其旧 status 保留；其他成功成员仍更新。所有请求 settle 后解除 pending，用户
可以再次刷新。由于底层动作没有结构化成功结果，本功能不显示可能误导的成功 toast。

## 测试

使用 TDD 完成以下行为：

1. 字典测试先证明四种语言缺少 `workspace.branch-workspace.refresh-changes`，再补齐文案。
2. `BranchWorkspaceList` 测试先证明 More 菜单没有刷新动作，再增加 ready/drift 可见性、pending 禁用和
   回调目标断言。
3. `WorkspaceRepositoryRail` 测试先证明刷新回调不存在，再验证它只刷新目标子工作区的可用、未移除成员，
   按仓库 ID 去重，传递当前实例 token，等待全部请求，并防止同一项重复执行。
4. 保留现有 badge 汇总、成员 badge、不可用仓库排除和零值隐藏测试作为重渲染契约。
5. 运行针对性 Vitest、`bun run typecheck`、`bun run check:architecture` 和 `bun run test`。

## 架构与工程原则

- **状态所有权**：Git status 仍是 server-backed 运行时一致数据；Zustand 只是 renderer 投影。
- **KISS / YAGNI**：一个显式读取动作，不增加轮询、设置、协议或缓存。
- **DRY**：复用 `refreshStatus` 的请求协调、错误语义和现有 badge 派生逻辑。
- **SOLID**：Rail 负责跨仓库编排，List 负责菜单呈现，各自保持单一职责。

本设计不新增领域术语；`CONTEXT.md` 无需修改。该决策局部、可逆且遵循既有状态模型，不需要 ADR。
