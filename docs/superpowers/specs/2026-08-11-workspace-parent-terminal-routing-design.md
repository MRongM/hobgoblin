# 工作区父级终端定位设计

## 目标

当用户单击已配置多仓工作区的项目行或工作区根目录行时，让父级行上汇总显示的既有终端可以直接定位到实际拥有该终端的范围。行为应与普通工作树点击后定位其已选终端一致，同时保留父级自身终端和显式 Overview 导航的既有边界。

## 交互语义

- 只改变两个明确的单击入口：侧栏项目行，以及“工作区仓库”中的 `./<根目录>` 行。
- 只在已配置多仓工作区内解析工作区根目录终端和子工作区根终端；不把成员工作树终端纳入本次自动定位。
- 目标优先级固定为：
  1. 工作区根目录自身存在可用终端时，保留 Overview，并定位该根目录终端。
  2. 上次选中的子工作区仍可用且存在可用根终端时，恢复该子工作区。
  3. 否则按照子工作区侧栏的持久化显示顺序，选择第一个存在可用根终端的子工作区。
- 同一范围内优先使用已选且可用的终端；没有可用的已选终端时，使用该范围会话顺序中的第一个可用终端。
- `opening`、`restarting` 和 `open` 属于可定位状态；`error` 与 `closed` 不作为目标。
- 没有可用目标、子工作区查询尚未成功，或终端上下文不可用时，保持现有行为并进入 Overview。
- 行内编辑器、内部终端快捷动作、More 菜单、拖动和双击文件区切换保持原有隔离行为。

## 方案比较

### 采用：共享纯解析器，点击入口负责执行

新增一个窄的 Renderer 模块，纯粹根据根路径、上次子工作区选择、有序子工作区快照和终端快照解析目标。项目行与根目录行复用同一个解析和执行函数，各自只提供 Overview 激活回调。

这一方案使优先级可以独立测试，避免两个组件复制规则，也不会让持久化选择 Store 依赖运行时终端投影。

### 不采用：两个组件分别内联规则

改动文件数量较少，但会重复阶段过滤、上次选择优先和会话选择逻辑；两个父级入口以后容易产生不同语义。

### 不采用：修改全局 Store 或 Terminal Provider

在 `activateProject`、`activateWorkspaceOverview` 或 `TerminalSessionProvider` 中自动重定向会影响恢复会话、键盘项目循环、隐藏仓库列表、配置恢复等非点击入口，也会把 restorable 导航动作和 runtime terminal projection 耦合在一起。

## 架构与数据流

1. 点击入口在事件发生时读取当前 `WorkspaceActiveContext`、成功的子工作区 Query 快照和 `TerminalSessionReadContext.worktreeSnapshot`。
2. 共享解析器先检查工作区根 key，再检查上次子工作区和有序回退候选，返回 Overview 或子工作区目标及具体 terminal key。
3. 共享执行函数先调用入口提供的 Overview 激活回调；若目标属于子工作区，再调用现有 `activateBranchWorkspace`。
4. 若命中终端，使用现有 `selectTerminal`、`focusTerminal` 和 `setDetailCollapsed(false)` 显示并聚焦该会话。`ManagedTerminalSession` 会在目标尚未挂载时保存 pending focus，并在挂载后完成聚焦。
5. 未命中目标时不执行任何额外终端动作。

该路径完全位于 `src/web/**`，不新增服务端请求、持久化字段、实时事件或跨窗口状态。子工作区顺序继续来自现有 Query 快照，终端状态继续来自现有 Renderer 终端 Registry 投影。

## 文件边界

- 新增 `src/web/components/repo-workspace/workspace-parent-terminal-navigation.ts`：目标解析和无状态执行。
- 修改 `SidebarProjectList.tsx`：为已配置工作区读取现有子工作区 Query，并在项目主行单击时调用共享逻辑。
- 修改 `WorkspaceRepositoryRail.tsx`：让 Manifest 根目录单击调用同一共享逻辑。
- 修改对应测试文件，覆盖纯优先级和两个真实组件入口。
- 更新 `docs/ui-conventions.md`，记录“默认 Overview”规则的终端汇总例外。

## 验证

- 纯解析器测试覆盖根目录优先、上次子工作区优先、侧栏顺序回退、已选会话优先、不可用阶段过滤和无目标。
- `WorkspaceRepositoryRail` 组件测试验证 Manifest 点击导航、选择、聚焦和无目标回退。
- `SidebarProjectList` 组件测试验证配置工作区项目点击定位子工作区，同时普通项目行为保持不变。
- 运行相关组件回归测试、`bun run typecheck`、`bun run test` 和 `bun run check:architecture`。

## 非目标

- 不改变子工作区行或成员工作树行本身的点击行为。
- 不引入项目级“最近使用终端”时间或新的持久化目标。
- 不按输出活跃、未读铃声、路径字典序或服务端返回顺序选择目标。
- 不改变项目终端 badge 的聚合范围。
- 不创建 ADR；本设计是现有 Renderer 导航规则内的可逆交互扩展。
