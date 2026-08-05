# Android tmux 双模式项目导入设计

**日期**：2026-08-03  
**状态**：已确认，自主 inline 实施

## 目标

Android tmux Tab 扫描到一个 Git worktree 目录时，允许用户以两种彼此独立的方式导入：

1. **Git 仓库**：以 Git repository primary worktree 作为项目路径。
2. **普通工作区**：以扫描目录所属的当前 Git worktree 根目录作为项目路径。

两种项目可以同时存在。每种导入方式分别按“SSH 主机 + 项目类型 + 对应规范路径”判断是否已导入。

## 术语与身份

- **Git 仓库导入身份**：`hostProfileId + GitRepository + primaryWorktreePath`。
- **普通工作区导入身份**：`hostProfileId + PlainWorkspace + currentWorktreePath`。
- **当前 worktree 路径**：对 Git 目录执行 `git rev-parse --show-toplevel` 得到的 worktree 根目录；不是任意 tmux 子目录。
- **Primary worktree 路径**：`git worktree list --porcelain` 返回的首个 worktree 路径；与 `main` 分支无关。

例如扫描路径属于 `/srv/app-feature`，对应 primary worktree 为 `/srv/app`：

- “作为 Git 仓库导入”使用 `/srv/app`。
- “作为普通工作区导入”使用 `/srv/app-feature`。
- 已存在 Git 项目 `/srv/app` 时，只禁用 Git 导入；普通工作区导入仍可用。
- 已存在普通工作区 `/srv/app-feature` 时，只禁用普通工作区导入。

## 方案选择

采用“tmux 扫描后批量解析项目路径身份”。

1. 远端 tmux 扫描保持现有协议，只负责发现会话与 `initialPath`。
2. 扫描成功后，以一个额外的轻量 SSH 命令批量解析所有扫描路径及当前主机已保存项目路径。
3. 每个成功解析的路径得到：目录类型、当前 worktree 路径、项目路径。Git 项目的项目路径是 primary worktree；普通目录的两个路径相同。
4. tmux UI 使用解析结果投影两种导入选项及各自的已导入状态。

没有选择以下方案：

- **点击导入后才解析**：扫描更快，但进入菜单前无法准确显示两种已导入状态。
- **根据 project-scoped tmux server 哈希推断**：无需额外 SSH，但无法覆盖 default tmux 会话，也不能从哈希恢复未导入仓库的 primary worktree。

## 数据模型

新增轻量路径解析结果 `RemoteProjectPathResolution`：

```kotlin
data class RemoteProjectPathResolution(
    val requestedPath: String,
    val kind: RemoteProjectKind,
    val projectPath: String,
    val worktreePath: String,
)
```

- Git：`projectPath` 是 primary worktree，`worktreePath` 是当前 worktree。
- 普通目录：两者均为物理规范目录。

`RemoteProjectInspection` 增加 `worktreePath`。现有 `resolvedPath` 继续表示最终 Git 项目路径，因此原有自动导入行为保持不变。

tmux 运行态快照同时持有会话分组和按请求路径索引的解析结果。该状态只在当前运行期间有效，不持久化。

## 交互

Git 路径的目录标题行保留一个“导入项目”按钮。点击后以 inline 下拉菜单展示：

- “作为 Git 仓库导入”
- “作为普通工作区导入”

每项独立判断：已导入项禁用并显示“已导入”；仍可导入的另一项保持可用。两项都已导入时，目录按钮整体显示“已导入”并禁用。

普通非 Git 目录只有“作为普通工作区导入”，直接进入现有项目设置页。

选择某个方式后仍复用 `RepositorySetupScreen`：预填主机、对应路径和显式项目类型，用户可修改别名或路径。保存前重新执行权威远端检查：

- 显式 Git 模式要求最终路径属于 Git worktree，并保存 primary worktree。
- 显式普通工作区模式保存最终路径所属的当前 worktree 根目录；非 Git 路径保存自身。
- 普通“添加项目”入口不带显式类型，继续沿用自动识别行为。

## 已导入判断

候选项与已保存项目均按类型解释路径：

- `GitRepository` 使用批量解析结果的 `projectPath`。
- `PlainWorkspace` 使用批量解析结果的 `worktreePath`。
- 无解析结果时退回已保存路径本身的词法规范化比较。

因此，即使历史 Git 项目记录仍保存 linked worktree 路径，只要该路径仍可解析，也会以 primary worktree 参与判断；本次不修改或迁移持久化记录。

## 失败与降级

- tmux 扫描失败：保持现有错误状态。
- 批量 Git 路径解析整体失败：tmux 列表仍可用，回退现有精确路径判断和自动检查式导入。
- 单个路径不可读或已消失：只缺失该路径的解析结果，不影响其他目录。
- 用户进入设置页后路径状态变化：保存前的单路径检查重新确认，不信任扫描缓存。
- 显式 Git 模式最终指向非 Git 目录：拒绝保存并显示校验错误。

## 测试策略

- SSH 路径解析：Git linked worktree 同时返回 primary/current 路径；普通目录返回同一路径；不可读路径不阻断其他结果。
- 项目检查：`RemoteProjectInspection` 保留当前 worktree 路径，现有 primary worktree 保存行为不回归。
- tmux 导入策略：Git 生成两个选项；普通目录生成一个选项；两种类型独立判断；历史 linked-worktree Git 记录按 primary 路径判断。
- 导航与设置：显式类型随路由传递；Git 模式保存 primary；普通模式保存 current worktree；无显式类型保持现状。
- UI 合同：Git 下拉菜单、禁用状态、回退入口和四种语言资源完整。
- 回归：Android unit tests、debug APK、根项目 typecheck/test/architecture guard。

## 非目标

- 不自动保存扫描目录。
- 不改变 tmux discovery、恢复、关闭或删除协议。
- 不迁移或重写已有项目记录。
- 不新增依赖、数据库或持久化映射。
- 不改变非 tmux 的普通项目添加入口默认行为。

## 原则检查

- **KISS**：一个批量解析边界、一个共享导入选项投影、一个既有设置页写入入口。
- **YAGNI**：不增加自动导入、持久化扫描身份或项目记录迁移。
- **DRY**：扫描态和保存态共享同一 primary/current worktree 语义。
- **SOLID**：tmux 服务发现会话，Git 服务解析目录身份，UI 投影选项，设置页负责最终检查与保存。
