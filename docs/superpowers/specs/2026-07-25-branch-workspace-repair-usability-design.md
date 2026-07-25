# 子工作区修复可用性与成员 Hash 设计

**日期**：2026-07-25  
**范围**：子工作区列表状态、修复规划性能、成员工作树摘要

## 目标

1. 将普通 drift 导致的“需要修复”改为弱提示，不阻断仍然可用的子工作区内容。
2. 缩短子工作区列表检查和修复弹窗生成计划的时间，尤其减少 SSH 工作区的远程往返。
3. 在成员工作树名称后显示与普通分支一致的七位 `#hash` 弱化文本。

## 状态语义

“需要修复”仅表示没有进行中的生命周期操作、但受管目录或成员工作树与持久清单存在 drift。它与创建中断、减少成员未完成、删除未完成不同：后三者仍是跨仓库顺序操作的中间态。

普通 drift 下，只要子工作区根目录仍可用：

- 允许选择子工作区、打开文件区、编辑器和终端。
- 允许展开成员并使用仍可导航的成员工作树。
- 允许调整子工作区显示顺序。
- 保留检查、修复和删除入口。
- 暂不开放依赖完整成员集合的批量 Git、增减成员和依赖维护操作。

创建中断、减少成员未完成和删除未完成继续使用现有受限操作集合。单个缺失或不可用的成员仍由成员自身的 `navigable` 投影控制，不因父项降级而误启用。

## UI 设计

- `needs-repair` 生命周期文字从 warning 色改为 muted 弱提示。
- 修复按钮继续位于状态操作位，不增加弹窗、Badge 或第二行说明。
- 成员工作树名称后增加 `#${lastCommitHash.slice(0, 7)}`。
- Hash 使用普通 `span`、等宽字体、tabular 数字和 muted 文字色；无边框、无独立 tooltip。
- 没有 commit hash 或成员无法解析时不渲染占位符。
- 为测试提供 `data-testid="branch-workspace-member-hash-tag"`。

## 读取与修复规划

### 列表读取

子工作区读取仍以服务端为权威，并继续通过现有 TanStack Query 快照投影到 renderer。仓库快照只请求清单实际引用且仍在工作区配置中的成员仓库，而不是工作区配置中的所有仓库或清单中的失效引用；读取时传入：

```ts
{
  includeWorktreeStatus: false,
  includeRemote: false,
}
```

状态投影只需要分支、工作树存在性及路径，不需要 Git status 或 remote 信息。不同子工作区共享同一成员仓库时继续复用一次 Promise 快照。

### 修复规划

修复规划仍在服务端重新读取权威配置和清单，不复用可能过期的 renderer 问题列表。规划阶段：

- 成员仓库快照使用同样的轻量选项。
- 成员修复检查并行执行，结构化错误与异常按清单顺序确定性归并。
- 辅助项修复检查并行执行，且只在成员结果无错误时按清单顺序归并。
- bootstrap target preflight 只在持久状态表明 bootstrap 未完成时运行。
- bootstrap preview 只在确实缺少成员工作树且没有持久 bootstrap 决策时运行。

计划令牌、执行前重建校验和既有审批机制保持不变，因此性能优化不削弱陈旧计划防护。

## 架构与数据流

```text
server read projection
  ├─ manifest/config
  ├─ lean member snapshots
  └─ drift state
       ↓ existing query snapshot
renderer BranchWorkspaceList
  ├─ usable drift root actions
  ├─ restricted whole-workspace actions
  └─ member row #hash from existing branch projection

repair click
  ↓ existing client/route
server repair planner
  ├─ authoritative manifest/config reread
  ├─ parallel lean member checks
  └─ unchanged token + execution revalidation
```

不新增缓存、持久状态、realtime 事件或 API 类型。UI 只消费既有运行时投影，业务检查继续由服务端拥有。

## 错误与安全

- 根目录缺失时不会把父项视为可用。
- 解析失败的成员保持 disabled，也不显示猜测出的 hash。
- 任一并行成员或辅助项检查失败时，规划仍按现有错误语义整体失败，不生成部分计划。
- 取消异常继续向上抛出，不转换为普通修复错误。
- 不跳过执行前的计划重建与 token 比较。
- 不改变删除、减少成员或其他破坏性操作的确认规则。

## 测试

- `BranchWorkspaceList`：普通 drift 可选择、可打开根目录操作、可排序；完整性相关操作仍隐藏或禁用；其他中间态保持受限。
- `BranchWorkspaceMemberRow`：显示七位 `#hash`，空 hash 不显示，样式与普通分支 hash 一致。
- `branch-workspace-read`：仅读取清单成员，并传入轻量快照选项；共享成员只读取一次。
- `branch-workspace-plan`：repair 成员使用轻量快照选项并在前一个成员未完成时启动后续成员检查。
- 运行 `bun run typecheck`、`bun run test`、`bun run check:architecture`。

## 非目标

- 不把创建中断、减少成员未完成或删除未完成改成普通 drift。
- 不缓存或信任 renderer 传入的修复诊断。
- 不改变修复执行步骤、审批语义或回滚策略。
- 不新增依赖或新的状态管理层。
