# 状态栏分支与状态刷新设计

**日期**：2026-07-30  
**状态**：已确认，允许内联实施

## 问题

普通 Git 项目底部状态栏右侧只展示当前选中分支的图标和名称，不能作为刷新入口。终端命令或外部工具修改分支、工作树后，renderer 中的仓库分支快照、Git status，以及配置工作区的子工作区状态快照可能仍是旧值。

## 目标

- 将状态栏右下角的分支图标与分支名作为一个可访问的刷新按钮。
- 点击后刷新当前仓库的分支快照和 Git status。
- 当前仓库属于配置工作区时，同时刷新父工作区的子工作区状态快照。
- 刷新期间阻止重复点击，并提供忙碌语义。
- 复用现有 `action.fetch-local-title` 文案；中文为“检测分支和状态”。

## 非目标

- 不执行远端 fetch、pull、push 或提交。
- 不刷新提交历史。
- 不重新扫描工作区目录或改变配置工作区成员关系。
- 不增加新的服务端 API、状态源、轮询或 realtime 协议。

## 方案比较

### 采用：组合现有仓库核心读取与子工作区查询刷新

状态栏点击调用现有 `refreshCoreData(repoId, { token })`，该流程按顺序读取仓库 snapshot 与 status。若仓库存在 `workspaceRootId`，同时调用现有 `refreshBranchWorkspaceQuery` 重读父工作区的子工作区快照。两个读取边界独立执行并等待全部 settle，使其中一个失败不会阻止另一个。

### 不采用：复用完整手动同步

`syncAndRefresh` 可能执行远端 fetch，超出“刷新分支和状态”的本地读取语义。

### 不采用：重新扫描配置工作区

`rescanWorkspace` 会重新发现目录和协调成员仓库，范围显著大于刷新子工作区状态快照。

## 组件与数据流

`StatusBar` 保持交互所有权：

1. 点击时从 `useReposStore.getState()` 获取最新仓库实例，避免使用过期 token。
2. 调用 `refreshCoreData(repo.id, { token: repo.instanceToken })`。
3. 若 `repo.workspaceRootId` 存在，调用 `refreshBranchWorkspaceQuery(mainWindowQueryClient, repo.workspaceRootId)`。
4. 使用状态栏按钮自己的单飞 pending 状态阻止重复触发。
5. 仓库资源状态与子工作区 Query cache 分别通过现有投影自然重渲染。

## 错误处理

- 仓库 snapshot/status 继续使用现有资源错误与旧数据保留语义。
- 子工作区读取失败不覆盖成功缓存；现有列表重新加载入口仍可重试。
- 状态栏不制造聚合成功 toast，也不让一个读取失败取消另一个读取。

## 测试

- 状态栏分支摘要呈现为带准确可访问名称的按钮。
- 普通仓库点击只调用 `refreshCoreData`，不调用 `syncAndRefresh` 或工作区读取。
- 配置工作区成员点击同时刷新当前仓库核心数据和父工作区子工作区快照。
- 未完成刷新期间重复点击被阻止，settle 后恢复。
- 验证 `bun run typecheck`、针对性 Vitest、`bun run check:architecture` 和 `bun run test`。

## 架构与工程原则

- **KISS / YAGNI**：复用两个现有读取入口，不新增后端能力。
- **DRY**：仓库 snapshot/status 继续由 `refreshCoreData` 协调，子工作区缓存继续由统一 query helper 更新。
- **SOLID**：状态栏只拥有交互编排；仓库 store 与 Query read layer 继续分别拥有各自状态。

本功能不新增领域术语；`CONTEXT.md` 无需修改。决策局部、可逆且遵循现有状态模型，不需要 ADR。
