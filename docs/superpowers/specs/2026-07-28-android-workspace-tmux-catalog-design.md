# Android 工作区 tmux 目录设计

**日期**：2026-07-28  
**状态**：已确认，自主 inline 实施

## 目标

让 Android 用户从一个已保存的 SSH Host 快速定位该主机上由 Hobgoblin Web/Electron 配置的工作区、子工作区及其既有 tmux 会话，并直接接入终端。工作区信息是只读导航上下文，终端恢复是主流程。

## 用户流程

1. 用户在 Hosts 页面点击一个 Host，进入现有的 Host 过滤 Projects 页面。
2. Android 通过该 Host 的受信任 SSH 连接读取远端 Hobgoblin 工作区注册表。
3. 页面在设备本地 Projects 之外显示独立的只读“工作区”分组。
4. 用户打开一个工作区，进入工作区概览。
5. Android 读取子工作区清单、检查相关路径并扫描关联的 Hobgoblin tmux 会话。
6. 用户展开一个子工作区，在同一页面查看根目录终端和各仓库成员终端。
7. 用户点击具体终端；Android 恢复对应 retained terminal，立即连接到精确的既有 tmux 会话。
8. 从终端返回时，恢复原工作区概览和展开的子工作区。以后从 Terminals 页打开该 retained terminal 时，返回 Terminals 页。

## 范围

- 自动列出当前直接 SSH Host 上、根 ID 为绝对路径的已配置工作区。
- 按服务端持久化顺序显示工作区仓库和子工作区。
- 显示子工作区根路径及成员仓库工作树路径。
- 扫描并严格验证子工作区根目录和成员工作树目录关联的既有 Hobgoblin tmux 会话。
- 将选中的既有 tmux 会话恢复为 Android retained terminal 并连接。
- 在页面进入、从终端返回和手动下拉刷新时重读。
- 覆盖 Android 已支持的四种界面语言。

## 非目标

- 不创建、删除或配置工作区。
- 不增加、删除、重排工作区仓库成员。
- 不创建、修复、缩减、删除或重排子工作区。
- 不创建新终端，不结束远端 tmux 会话。
- 不进入现有 Repository 详情页，不提供 Git、工作树或文件操作。
- 不显示通过远端 Host 自身 SSH 配置访问的二跳工作区。
- 不依赖运行中的 Hobgoblin Server/Web API。
- 不持久化远端工作区快照，不轮询或后台监听。
- 不复制 Web 完整的 Git 分支、工作树和辅助依赖漂移计算；Android 只投影持久化生命周期意图与当前路径可用性。

## 方案选择

### 采用：版本化注册表 + 终端优先的独立概览

Android 直接通过 SSH 读取服务端唯一写入的版本化注册表；Host 过滤 Projects 页面只展示顶层工作区，工作区详情使用独立概览，并在一个子工作区下同屏展开终端。该方案在远端进程未运行时仍可用，保留 Web 的身份和成员语义，也让终端定位保持两次点击以内。

### 未采用：文件系统推断

目录扫描无法恢复配置成员顺序、子工作区 ID、基准分支、成员来源和未完成操作意图，也可能误认普通目录。

### 未采用：远端 Server API

该方案可以直接复用 Web read model，但会要求远端 Hobgoblin Server 始终运行，并引入 HTTP 地址、认证和端口转发配置，与 Android 当前直接 SSH 边界不一致。

### 未采用：项目列表内无限树形展开

该方案少一次导航，但会把设备本地 Project、远端工作区、子工作区和终端混入一个长列表，加载失败也难以按 Host/工作区隔离。

## 领域与只读契约

领域词汇使用 `CONTEXT.md` 中的 **Android workspace catalog** 和 **Android branch workspace tmux catalog**。跨端持久化决策见 `docs/adr/0002-version-workspace-registries-as-read-contracts.md`。

Android 读取：

- `workspace-configs.json`：工作区根 ID 与有序仓库成员名称。
- `branch-workspaces.json`：有序子工作区 manifest、成员工作树、生命周期操作和辅助条目。

契约规则：

- 服务端是唯一写入者，Android 永不修改这两个文件。
- Android 只接受 `version: 1`，忽略未知的附加字段。
- 每个文件独立解析：工作区配置非法时整个目录失败；子工作区文件非法时仍可显示工作区及仓库，但子工作区区域显示错误。
- 文件不存在表示对应数据为空，不是损坏。
- 每个文件读取上限为 4 MiB；超限按非法远端数据处理，不把内容写入日志。
- 根路径和成员路径使用与现有 tmux 协议相同的词法绝对路径规范化，拒绝控制字符、相对路径和关系不一致的记录。
- `ssh-config://` 等非绝对路径根 ID 被安全忽略，不显示为当前 Host 的工作区。

远端数据目录按服务端已有规则解析：

1. SSH 登录环境可见的 `GOBLIN_SERVER_DATA_DIR`。
2. macOS：`$HOME/Library/Application Support/Hobgoblin`。
3. 其他 POSIX Host：`$XDG_STATE_HOME/hobgoblin`，否则 `$HOME/.local/state/hobgoblin`。

解析出的数据目录必须存在且可读；否则 Android 显示“无法定位 Hobgoblin 工作区数据”的可操作错误。目录存在但注册表文件不存在时才投影为空数据。若远端服务只在其私有进程环境中覆盖数据目录，Android 不新增 Host 设置字段，也不搜索其他目录。

## Android 读模型

新增的纯 Kotlin 读模型不复用 `RemoteRepositoryProfile`，避免把远端只读目录项伪装成设备本地 Project：

```kotlin
data class RemoteWorkspaceCatalogSnapshot(
    val hostId: String,
    val workspaces: List<RemoteConfiguredWorkspaceSnapshot>,
)

data class RemoteConfiguredWorkspaceSnapshot(
    val rootPath: String,
    val repositories: List<RemoteWorkspaceRepositorySnapshot>,
    val branchWorkspaces: List<RemoteBranchWorkspaceSnapshot>,
    val branchWorkspaceError: String? = null,
    val tmuxDiscoveryError: String? = null,
)

data class RemoteWorkspaceRepositorySnapshot(
    val name: String,
    val path: String,
    val availability: RemotePathAvailability,
)

data class RemoteBranchWorkspaceSnapshot(
    val id: String,
    val branch: String,
    val path: String,
    val operation: RemoteBranchWorkspaceOperation?,
    val rootAvailability: RemotePathAvailability,
    val members: List<RemoteBranchWorkspaceMemberSnapshot>,
    val terminalGroups: List<RemoteWorkspaceTmuxGroup>,
)

data class RemoteBranchWorkspaceMemberSnapshot(
    val repositoryName: String,
    val repositoryRootPath: String,
    val worktreePath: String,
    val progress: String,
    val availability: RemotePathAvailability,
)

enum class RemotePathAvailability { Unknown, Available, Unavailable }

enum class RemoteBranchWorkspaceOperation { Create, Extend, Reduce, Repair, Remove }

sealed interface RemoteWorkspaceTmuxLocation {
    data object Root : RemoteWorkspaceTmuxLocation
    data class Repository(val repositoryName: String) : RemoteWorkspaceTmuxLocation
}

data class RemoteWorkspaceTmuxGroup(
    val location: RemoteWorkspaceTmuxLocation,
    val terminals: List<RemoteWorkspaceTmuxTerminal>,
)

data class RemoteWorkspaceTmuxTerminal(
    val projectRoot: String,
    val workingDirectory: String,
    val terminalNumber: Int,
    val identity: TmuxSessionIdentity,
)
```

工作区展示名取根路径最后一个片段；子工作区始终使用 manifest 的公共分支名，而不是管理目录名。仓库路径固定为 `rootPath/repositoryName`，成员工作树路径必须与 manifest 中的 `branchWorkspacePath/repositoryName` 一致。

路径可用性检查只回答“该绝对路径当前是否为目录”。持久化 `operation` 或不可用根/成员会产生“需要注意”呈现，但不会阻止仍通过协议验证的 tmux 会话出现和连接。

## tmux 发现与恢复

一个工作区的发现范围按 project-scoped tmux server 分组：

- 工作区根 scope：`projectRoot = workspace.rootPath`，允许路径为所有子工作区根路径。
- 仓库 scope：`projectRoot = workspace.rootPath/repositoryName`，允许路径为该仓库在所有子工作区中的成员工作树路径。
- manifest 中仍存在但已不在当前配置中的成员也保留仓库 scope，以便恢复漂移或未完成操作留下的精确会话。

`RemoteTmuxSessionService` 增加批量发现边界，单次受信任 SSH 操作列出全部相关 project-scoped server，并只扫描一次 legacy default server。现有单 scope API 委托给批量实现，避免两套验证逻辑。

每条候选仍必须满足现有协议：

- 当前协议的 `hobgoblin-v1-<digest>` 会话名。
- 精确、已规范化且位于对应 scope 白名单中的 `@hobgoblin_init_path`。
- 正整数 `@hobgoblin_terminal_number`。
- 使用 project root、initial path 和 terminal number 重算出的名称完全一致。
- project-scoped 与 legacy default server 中的同名会话只保留 project-scoped 结果。

目录不存在、子工作区漂移或操作未完成不改变上述身份判定。会话本身存在且验证通过时仍可连接。

点击终端后：

1. 构造只含既有 identity 的 recovery candidate。
2. `TerminalSessionManager` 使用确定性 recovered session ID 去重并创建 `Disconnected` retained record。
3. 若记录已存在则复用原记录和手工排序位置。
4. 通过 reconnect 流程的 attach-existing 策略附着精确 tmux identity；新建 tmux terminal 仍使用 attach-or-create 策略。
5. 绝不调用 `attachOrCreateCommand` 的创建分支来替代缺失会话；扫描后消失的会话按连接失败呈现。

目录恢复的 retained record 不归属于设备本地 `RemoteRepositoryProfile`；其 tmux project root 继续保存在 `repositoryRemotePath`，显示标签包含工作区、子工作区和根/成员名称。

## 状态所有权与刷新

工作区目录是远端权威数据的页面内 runtime snapshot：

- `HobgoblinAndroidApp` 只保存当前 Host 过滤与当前路由。
- Host 过滤 Projects 页面持有顶层工作区加载状态。
- Workspace screen 持有选中工作区快照、唯一展开的子工作区 ID、加载/陈旧/错误状态。
- 不写 `SharedPreferences`，不与设备本地 Project 排序合并。
- 顶层工作区和子工作区使用注册表顺序；刷新不改变展开项，只在该 ID 消失时收起。

刷新触发：

- 进入 Host 过滤 Projects 页面时读取注册表。
- 进入工作区概览时读取注册表、检查路径并扫描 tmux。
- 从该工作区打开的终端返回概览时重新扫描 tmux。
- 下拉刷新时重新执行完整读取。

刷新失败且已有快照时保留快照、显示“数据可能已过期”和重试入口；首次读取失败时显示完整错误状态。无定时轮询。

## 导航

新增 `AppRoute.WorkspaceCatalog(hostId, rootPath)`。从工作区概览直接打开终端时，Terminal route 持有页面内返回描述，Back 恢复同一工作区和展开项。

已恢复终端随后出现在全局 Terminals 页：

- 从 Terminals 页打开时，Back 返回 Terminals。
- 来自前台通知的目录终端也返回 Terminals。
- Terminal screen 的标题优先使用 retained record 的 `targetLabel`，不尝试查找不存在的设备本地 Project。

## 界面设计

### 视觉方向

沿用现有 `HobgoblinTheme`、Material 3 typography 和 `HobgoblinSpacing`，不新增颜色、字体或 UI 依赖。强调色继续使用 `#2563EB`，异常使用现有 warning/error 语义。终端编号和绝对路径复用已打包的 Hobgoblin terminal CJK 字体。

唯一新增的标志性元素是“路径脊线”：一条细竖线连接展开的子工作区、根目录/成员分组和终端节点。它编码真实目录作用域，而不是装饰；其他表面保持安静，避免多层嵌套 Card。

### Host 过滤 Projects 页面

```text
项目 · 开发服务器                         显示全部
────────────────────────────────────────────
工作区
┌ product                                  ›
│ /srv/product
│ 3 个仓库 · 4 个子工作区
└───────────────────────────────────────────

已保存项目
┌ api                                      ›
│ /srv/api
└───────────────────────────────────────────
```

- “工作区”只在 Host 过滤存在时加载和显示。
- 顶层工作区 Card 显示路径、仓库数和子工作区数，不显示新增、删除或拖动控件。
- 全局 Projects 页保持现状，不连接所有 Hosts。
- 无工作区时不显示整个分组；读取错误显示独立错误块，不遮蔽设备本地 Projects。

### 工作区概览

```text
‹  product                                      ↻
   /srv/product
──────────────────────────────────────────────────

工作区仓库                                      3⌄
  api                 /srv/product/api
  web                 /srv/product/web
  tools               /srv/product/tools

子工作区
╭ feature/auth                          3 个终端
│
├─ 根目录
│    terminal-1
│    /srv/product/hobgoblin-feature-auth
│
├─ api
│    terminal-1
│    /srv/product/hobgoblin-feature-auth/api
│
└─ web
     terminal-2
     /srv/product/hobgoblin-feature-auth/web

  feature/search                        暂无终端
  feature/payment              需要注意 · 1 个终端
```

- 工作区仓库是独立折叠区，默认收起；用户展开后仅查看名称、路径和可用状态。
- 子工作区始终可见，同时只展开一个。
- 子工作区行显示公共分支名、精确终端数量和“需要注意”状态。
- 展开内容先显示根目录组，再按 manifest 顺序显示有终端或不可用状态的成员组。
- 终端行整个区域可点击；显示 terminal slot、绝对路径和连接图标，无 overflow menu。
- 空子工作区展开后显示“未发现关联的 Hobgoblin tmux 终端”，不提供创建按钮。
- 展开/收起使用一个短的 `AnimatedVisibility` 过渡；不增加持续动画。
- 所有点击目标至少采用 Material 3 默认可访问触控尺寸，并提供能读出分支、成员和 terminal slot 的 `contentDescription`。

## 错误与安全

- 读取注册表和 tmux 前复用现有 Host key trust；未知或变更的 key 失败关闭。
- SSH 命令只接受严格验证的绝对路径，并使用现有 shell quoting 规则。
- 工作区配置缺失：显示无工作区空状态。
- 子工作区注册表缺失：工作区仍显示，子工作区为空。
- 不支持的版本、超限或非法 JSON：标明无法读取对应 Hobgoblin 数据，不输出原始内容。
- tmux 不可用：工作区仍可浏览，终端区域显示 tmux 扫描失败与刷新入口。
- 单个路径不存在：标记该 root/member 不可用；精确验证通过的既有 tmux 仍显示。
- 会话在点击前消失：保留目录页面并显示连接失败，不创建替代会话。
- 刷新失败：保留页面内旧快照并标记陈旧。
- 删除 Android retained record 只删除设备本地记录，不结束远端 tmux。

## 测试策略

### 跨端契约

- 建立隐私安全的 v1 工作区与子工作区 JSON fixtures。
- TypeScript source tests 和 Kotlin parser tests 读取同一 fixtures。
- 覆盖未知附加字段、未知版本、非法路径、重复 ID/名称、错误成员路径、文件缺失和 4 MiB 上限。

### SSH 与目录投影

- 测试 POSIX/macOS/default/custom data directory 解析。
- 测试只保留绝对路径 root ID，并保持注册表顺序。
- 测试仓库、子工作区和成员路径投影及可用状态。
- 测试工作区文件与子工作区文件独立失败。

### tmux

- 测试 workspace root scope 和 repository scopes 的构建。
- 测试批量脚本只列一次 legacy server，并保留 project-scoped 优先级。
- 测试 name/path/slot/project root 精确校验、任意 tmux 排除和跨 scope 隔离。
- 测试异常或不可用子工作区仍保留精确会话。
- 测试点击恢复既有 retained record、确定性去重、重连和不创建缺失会话。

### UI 与导航

- Host 过滤页面显示工作区分组，全局 Projects 页面不触发加载。
- 工作区仓库默认折叠且无操作。
- 仅一个子工作区展开，终端分组和数量正确。
- 加载、空、陈旧、配置错误、tmux 错误及路径不可用状态。
- 终端直接打开、Back 返回原概览、Terminals 页再次打开后返回 Terminals。
- 四语言资源完整且不翻译路径、分支名、仓库名和 tmux 输出。

### 验证命令

```bash
./gradlew :app:testDebugUnitTest
./gradlew :app:lintDebug
./gradlew :app:assembleDebug
bun run typecheck
bun run test
bun run check:architecture
```

## 原则检查

- **KISS**：独立只读目录、单一概览页、一个展开项、显式刷新。
- **YAGNI**：不引入 Server API、离线缓存、轮询、完整 Git 漂移引擎或任何工作区写操作。
- **DRY**：单 scope tmux 发现委托给批量发现；现有 identity、retained terminal、SSH trust 和主题全部复用。
- **SOLID**：注册表读取/解析、目录投影、tmux 发现、retained terminal 恢复和 Compose 展示各自保持单一职责。
