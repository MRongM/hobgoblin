# 子工作区重新加载设计

**日期**：2026-07-27  
**状态**：已确认  
**范围**：配置工作区根节点的子工作区读取错误恢复

## 问题

SSH 配置工作区首次读取子工作区时，远程命令可能暂时失败。服务端会返回
`workspace.branch-workspace.remote-operation-failed`，但当前字典没有该键，界面因此直接显示原始键。
现有“清除缓存”会清空整个来源下的 `localStorage` 和 `sessionStorage` 并刷新页面，既不能修复 SSH
读取，也会丢弃与本次失败无关的可恢复客户端状态。

已有“清理子工作区记录”只修复损坏的服务端子工作区注册表。它不会重试远程读取，因此不应作为
SSH 暂时失败的默认恢复动作。

## 目标

在当前配置工作区根节点的子工作区错误行中提供“重新加载子工作区”。该动作只重新执行当前根节点的
子工作区读取；成功后显示最新快照，失败时保留当前错误或上一次成功快照，并允许再次重试。

## 方案比较

### 采用：错误行内重新加载

- 复用 `useBranchWorkspaceQuery` 已有的手动 `refresh()`。
- 仅在子工作区读取结果失败时显示按钮，操作目标与错误位置一致。
- 使用组件本地 pending 状态防止并发重复重载。
- 不增加服务端 API、持久状态或 realtime 事件。

### 不采用：清除浏览器缓存并刷新

该动作影响同一来源下的全部仓库、终端客户端标识和恢复状态，却不会改变 SSH 或远程命令环境，范围
明显大于故障边界。

### 不采用：自动无限重试

无限重试会在 SSH 配置、权限或远程环境持续错误时制造额外负载，并隐藏需要用户处理的真实故障。
已有查询生命周期可处理正常自动刷新；本功能只提供显式恢复入口。

## 交互

- 子工作区读取失败时，在错误文字右侧显示“重新加载子工作区”。
- 点击后按钮进入 disabled 状态，直到本次读取完成。
- 成功时，现有查询缓存接收成功快照，错误行自然替换为子工作区列表或空状态。
- 失败时，不清空已有数据、不刷新页面，按钮恢复可用，错误文字继续可见。
- 对注册表读取失败，保留现有“清理子工作区记录”入口；重新加载与清理记录是不同操作。

## 数据流与边界

```text
WorkspaceRepositoryRail error row
  -> useBranchWorkspaceQuery.refresh(rootId)
  -> workspace client read endpoint
  -> server branch-workspace read projection
  -> local or SSH authoritative inspection
  -> success: update TanStack Query snapshot
     failure: preserve existing snapshot/error
```

子工作区快照属于运行时一致状态，服务端继续作为权威来源；renderer 只发起定向 refetch 并投影结果。
该动作是读取，不发布失效事件，也不写入服务端注册表。

## 错误与安全

- 为 `remote-operation-failed` 和同一远程边界的 `remote-invalid-response` 补齐四种语言文案，避免原始键泄漏。
- 重载不删除文件夹、成员工作树、分支或子工作区记录。
- 重载不清理本地存储、不关闭终端、不改变工作区布局。
- 持续性 SSH 错误仍保持可见；本功能不把失败伪装成成员缺失或 drift。
- 取消和组件卸载继续使用现有请求信号语义。

## 测试

- `WorkspaceRepositoryRail`：远程操作失败时显示重新加载按钮。
- 点击按钮只调用当前根节点的 `refresh()`，pending 期间禁止重复调用。
- 重载完成后按钮恢复可用；现有注册表清理入口仍仅遵循原有条件。
- 四种语言字典保持键和占位符一致。
- 运行针对性 Vitest、`bun run typecheck`、`bun run check:architecture` 和 `bun run test`。

## 非目标

- 不修改全局“清除缓存”行为或位置。
- 不自动修复 SSH 配置、权限、远程 shell 或远程文件系统问题。
- 不新增定时轮询、无限重试、后台任务或新的缓存层。
- 不更改子工作区注册表清理的持久化语义。
