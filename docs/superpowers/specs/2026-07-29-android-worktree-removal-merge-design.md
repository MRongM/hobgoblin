# Android 工作树移除与双向合并设计

**日期**：2026-07-29
**状态**：已实现并验证

## 背景

Android 早期工作树 MVP 同时阻止主工作树、脏工作树、锁定工作树、缺失工作树，以及固定名称为 `main`、`master`、`develop` 或 `release/*` 的分支工作树。固定名称保护把分支身份与工作树身份混在了一起：一个检出 `main` 的普通 linked worktree 会被错误显示为“受保护分支”，而仓库的 primary worktree 实际可能检出任意分支。

Android 当前只能创建、打开终端和移除工作树，没有合并入口。项目已经定义 **Branch merge-in** 与 **Branch merge-out**，Android 应复用相同方向术语，但保持远程应急客户端的较小能力边界。

## 目标

1. 只把经过项目目录路径与 Git worktree 元数据共同确认的 repository primary worktree 视为不可移除身份。
2. 删除基于固定分支名的工作树保护；普通 linked worktree 即使检出 `main` 也可进入移除流程。
3. 保留脏、锁定、缺失工作树的独立 Git 安全限制，不再把它们描述为分支保护。
4. 为 Android 工作树提供方向明确的合并入与合并出。
5. 合并冲突保留在实际目标工作树中，刷新后可直接打开该工作树终端处理。

## 非目标

- 不删除本地或远端分支；工作树移除仍只执行 `git worktree remove`。
- 不在本次支持强制移除脏工作树、自动解锁或 prune 缺失工作树。
- 不自动 pull、push、fetch、commit、stash、rebase、squash 或解决冲突。
- 不为没有现有工作树的 merge-out 目标创建隐藏临时工作树。
- 不复用桌面 TypeScript 服务；Android 继续通过自己的 Kotlin SSH 边界执行远端 Git。

## 工作树移除身份

### 术语

Repository primary worktree 是 Git 的原始工作树，不是名为 `main` 的分支。Android 保存的 Git Project 路径在项目检查时已经解析到 primary worktree；快照中的 `isPrimary` 来自 `git worktree list --porcelain` 的 primary 记录。

### 判定规则

删除资格函数同时接收项目路径和工作树快照，并对远端绝对路径做稳定的词法规范化：折叠重复 `/`、移除非根路径尾部 `/`。

| 项目路径匹配 | Git `isPrimary` | 结果 |
|---:|---:|---|
| 是 | 是 | 主工作树，不可移除 |
| 否 | 否 | linked worktree，继续检查 Git 操作状态 |
| 是 | 否 | 身份不一致，要求刷新，不执行删除 |
| 否 | 是 | 身份不一致，要求刷新，不执行删除 |

身份一致后继续检查：脏、锁定和缺失工作树仍不可直接移除。分支名称、默认分支和 `origin/HEAD` 不参与工作树移除身份。

UI 使用当前快照投影按钮与说明；写服务使用同一纯策略再次检查。最终 `git worktree remove` 仍是 Git 的权威安全边界，不使用 `--force`。

## 合并方向

### 合并入

用户在一个带本地分支的工作树上选择“合并入”，再选择另一个本地分支作为来源：

```text
所选来源分支 ──merge──> 操作工作树分支
```

- 目标是操作工作树，必须存在、非 bare、非 missing、带分支且干净。
- 来源候选是除目标分支外的所有本地分支；来源是否被其他工作树检出不影响合并。
- SSH 在目标工作树路径执行 `git merge -- <sourceBranch>`。
- 冲突保留在目标工作树，并作为普通 Git 错误显示。

### 合并出

用户在一个带本地分支的干净工作树上选择“合并出”，再选择另一个现有工作树作为目标：

```text
操作工作树分支已提交历史 ──merge──> 所选目标工作树分支
```

- 来源工作树必须存在、非 bare、非 missing、带分支且干净。
- 目标候选来自当前 Git 快照中的其他工作树；同分支、同路径和普通 detached 工作树不进入候选。
- 带分支的脏目标以及 Git 报告的 bare、missing 记录保持可见但禁用，并显示原因。
- SSH 在目标工作树路径执行 `git merge -- <sourceBranch>`。
- 冲突保留在目标工作树。因为 Android 不创建隐藏临时工作树，所以不会出现不可见冲突现场。

## 组件与职责

### `RemoteWorktreeService`

继续只负责工作树创建与移除。移除时调用共享的纯删除策略，传入 `RemoteTarget.remotePath` 与目标工作树。

### `RemoteWorktreeMergeService`

新增小型 Android SSH 写服务，负责：

- host key 信任校验；
- merge-in / merge-out 输入策略校验；
- 安全引用与路径引用；
- 在同一远端脚本中复核 common-dir、当前分支、clean 状态及来源本地 ref；
- 在目标工作树执行 Git merge；
- 原样保留可操作的 Git 错误信息。

服务不读取或持久化 UI 状态，不刷新快照。Repository workspace 继续在成功或失败后按交互需要刷新权威快照。

### Repository UI

工作树卡保留直接“终端”动作，新增紧凑的“操作”菜单，包含：

- 合并入；
- 合并出；
- 移除（仅删除策略允许时）。

合并动作打开前台选择对话框。分支/工作树选择属于 Compose 本地交互状态；执行期间禁用确认按钮。成功后关闭对话框并刷新快照；失败诊断保留在前台对话框中，刷新期间继续显示最近快照，刷新完成后按路径重投影请求对象，使冲突或脏状态立即禁用再次确认。

## 错误处理

- detached、bare、missing 或脏目标拒绝合并，并使用稳定的 Android 本地化文案。
- merge-out 的脏来源拒绝执行，因为未提交内容不属于要合出的提交历史。
- 来源或目标在确认后变化时，同一远端脚本在 merge 前按 Git common-dir、当前分支和 clean 状态拒绝执行并保留诊断；随后刷新快照供用户重新选择。
- Git merge 冲突不自动 abort；实际目标工作树保留为冲突现场。
- 删除身份不一致时不猜测、不 force，要求刷新。

## 测试策略

- 删除纯策略：primary 路径与 Git 标记双重确认、两类身份不一致、linked `main` 可移除、脏/锁定/缺失仍受限。
- 删除服务：允许 linked `main`，拒绝真实 primary，命令仍无 `--force`。
- 合并纯策略：merge-in 来源候选、merge-out 目标候选、detached/bare/missing/dirty 状态。
- 合并服务：host key 门禁、路径与分支安全引用、正确目标目录、同分支拒绝、Git 错误透传，以及 merge 前 repository/branch/clean/source-ref 复核。
- UI 状态：方向文案、候选标签、阻塞原因、本地化映射、失败诊断、快照重投影与源码契约。
- 验证：Android 聚焦单测、`:app:testDebugUnitTest`、`:app:lintDebug`、`:app:assembleDebug`，以及根级 typecheck、test、architecture check 和 `git diff --check`。

## 架构压力检查

- **领域边界**：primary worktree 与默认分支明确分离；合并方向沿用现有 glossary。
- **安全性**：删除需路径与 Git 身份一致；合并只写入显式、可见、已有的目标工作树。
- **KISS/YAGNI**：不引入临时工作树、远端管线、计划令牌或新依赖。
- **SOLID**：删除生命周期与合并写操作由两个服务分别负责；UI 只持有短期选择和错误状态。
- **DRY**：UI 与服务复用相同纯策略和候选投影，不复制分支名保护或状态判断。
- **恢复性**：冲突现场始终是用户可见工作树，终端入口已经存在。

不创建 ADR：这是 Android 功能边界内的可逆扩展，沿用既有合并方向和 Git 工作树模型，没有形成新的跨系统、难以逆转的架构决策。
