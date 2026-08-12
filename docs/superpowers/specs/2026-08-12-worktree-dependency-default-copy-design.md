# 工作树依赖默认复制设计

**日期**：2026-08-12
**状态**：已实施

## 目标

普通 Git 工作树创建和子工作区仓库成员创建共用依赖文件树。用户新勾选一个依赖文件或目录时，初始物化模式改为“复制”，不再默认为“软链接”。用户仍可在提交前把任意已选项显式切换为软链接。

## 方案

修改共享选择模型 `selectWorktreeDependency()`：它添加新选择时写入 `mode: 'copy'`。两个创建入口继续复用 `WorktreeDependencyTree` 和同一选择模型，不增加弹窗参数或入口特例。

该方案让默认行为只存在于一个领域边界，符合 DRY 与 KISS；当前没有按入口配置不同默认值的需求，因此不引入可配置默认模式。

## 行为边界

- 新勾选文件或目录时默认选择复制。
- 用户可把已选项从复制切换为软链接，也可再切换回来。
- 取消选择后重新勾选时，按新选择处理并再次默认为复制。
- 选择父目录时，现有后代去重与祖先选择规则保持不变。
- 不修改已有请求中的显式 `copy | symlink` 模式。
- 不修改服务端协议、路径校验、复制/软链接物化、错误处理、来源选择或持久化。
- 不新增依赖，不修改 UI 文案。

## 组件与数据流

```text
CreateWorktreeDialog / BranchWorkspaceDialog
  -> WorktreeDependencyTree
  -> selectWorktreeDependency()
  -> WorktreeBootstrapSelection { path, mode: 'copy' }
  -> 现有请求与物化流程
```

变更限制在 renderer 的共享选择模型及其测试，不跨越现有架构边界。

## 测试与验证

1. 先把共享选择模型测试的期望值改为 `copy`，运行聚焦测试并确认旧实现因仍返回 `symlink` 而失败。
2. 将共享模型中新选项默认模式改为 `copy`，重新运行聚焦测试并确认通过。
3. 运行 `WorktreeDependencyTree` 组件测试，更新并验证用户勾选后的受控选择为 `copy`；保留显式切换模式的覆盖。
4. 运行普通工作树与子工作区仓库成员创建测试，验证两个入口提交的新选择均默认为 `copy`。
5. 运行 `bun run typecheck`、`bun run test`、`bun run check:architecture` 和 `git diff --check`。

## 非目标

- 不移除软链接选项。
- 不迁移或重写已存在的依赖选择数据。
- 不为不同创建入口提供不同默认值。
- 不重构依赖树或服务端物化流程。
