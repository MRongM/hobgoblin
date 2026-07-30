# 子工作区创建完成后自动关闭弹窗设计

**日期**：2026-07-30  
**状态**：已实施

## 背景与根因

创建子工作区的服务端流程会先持久化目录、成员工作树和依赖步骤，再执行一次最终校验。远程环境中，这次最终读取可能瞬时失败并返回 `workspace.branch-workspace.remote-operation-failed` 或 `workspace.branch-workspace.remote-invalid-response`。与此同时，Renderer 的实时查询可能已经独立读到 ready 快照，因此弹窗会同时显示全部步骤完成和一次读取错误。

当前弹窗只在 execute 返回 `ok: true` 时关闭，导致“权威实时快照已确认 ready、计划步骤全部完成”仍被一次末尾远程读取错误阻塞。

## 交互契约

- 创建请求尚未结束时继续显示前台进度，不提前关闭。
- 创建请求结束后，如果实时快照为 ready、全部计划步骤为 complete，且 execute 仅因最终远程读取失败而返回错误，则自动关闭弹窗。
- Git、文件系统、审批、取消、计划过期以及 `needs-repair` 等错误继续留在弹窗中，并保留错误和重试行为。
- 删除、扩展、缩减和修复流程不变。

## 方案比较

### 方案 A：用 ready 实时快照补充弹窗收尾（采用）

在 `BranchWorkspaceDialog` 中组合既有 `pending`、`result`、`progressWorkspace` 和纯进度投影。只对两种远程读取错误启用收尾，并要求 ready 快照和 `completedCount === totalCount` 同时成立。

优点是复用现有权威状态、不修改服务端成功协议、范围局部且能严格区分可忽略读取错误和实际创建失败。

### 方案 B：服务端在最终读取失败时直接返回成功（不采用）

这会让成功结果缺少已校验的 ready 快照，放宽 `BranchWorkspaceExecuteResult` 的业务契约，并可能掩盖真实 drift。

### 方案 C：进度达到 X/X 后忽略所有错误（不采用）

该方案可能吞掉计划过期、取消或修复要求等重要错误；完成计数不能单独代替 ready 生命周期判断。

## 架构与数据流

状态所有权不变：服务端清单和仓库快照仍是事实来源，TanStack Query 仍拥有 Renderer 的运行时一致投影，弹窗只负责本地可见性。

1. execute 请求结束并返回远程读取错误。
2. `WorkspaceRepositoryRail` 继续把与当前计划 ID 匹配的最新快照传入弹窗。
3. 弹窗使用现有 `projectBranchWorkspaceOperationProgress` 计算完成数。
4. 当请求已结束、错误属于远程读取、快照 ready 且全部步骤完成时，通过现有 `onOpenChange(false)` 关闭弹窗。

不新增 Store、服务端字段、API、轮询、延时器或错误白名单之外的容错路径。

## 测试

- 回归测试证明：ready 快照和完整步骤进度可以覆盖最终远程读取错误并关闭弹窗。
- 安全边界测试证明：相同进度下的普通 execute 错误不会关闭弹窗。
- 运行 `BranchWorkspaceDialog` 聚焦测试、类型检查、架构检查和全量测试。

## 领域与决策记录

更新 `CONTEXT.md` 中既有 Branch workspace operation 定义，明确该收尾边界。该变化是局部且可逆的交互规则，没有引入新的架构边界，因此不创建 ADR。
