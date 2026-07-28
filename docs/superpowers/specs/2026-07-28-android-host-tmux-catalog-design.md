# Android 主机 tmux 目录设计

**日期**：2026-07-28  
**状态**：已确认，自主 inline 实施  
**取代**：`2026-07-28-android-workspace-tmux-catalog-design.md`

## 目标

Android 在用户打开一个已保存 SSH Host 后显示“项目 / tmux”两个 Tab。tmux Tab 直接枚举该主机当前用户可访问的 Hobgoblin tmux server，读取每个 server 内 session 自带的 Hobgoblin 元数据并构建可恢复终端列表，不读取、不推断也不依赖 Hobgoblin 工作区配置。

## 用户流程

1. 用户在 Hosts 页面打开一个主机，进入主机详情。
2. 默认显示“项目”Tab，仅列出设备本地保存且属于该主机的项目。
3. 用户切换到“tmux”Tab；Android 通过受信任 SSH 连接扫描一次主机级 tmux 目录。
4. 页面按 `@hobgoblin_init_path` 分组显示每个可识别 session 的 terminal slot、附着状态和实际 server 来源。
5. 用户点击 session；Android 创建或复用一个设备本地 retained terminal，并严格附着扫描到的原 server/session。
6. 从终端返回时回到同一主机的 tmux Tab；从全局 Terminals 页再次打开时仍返回 Terminals。
7. 用户可在已留存的 session 卡片上重连、关闭或删除 Android 终端记录；删除时可额外勾选关闭精确远端 tmux session，默认不勾选。

## 范围

- 主机详情包含“项目”和“tmux”两个 Tab。
- tmux Tab 扫描远端当前用户的默认 tmux server 与所有严格命名的 Hobgoblin project-scoped server。
- 读取 session name、`@hobgoblin_init_path`、`@hobgoblin_terminal_number`、`session_attached`。
- 恢复默认 server 和 project-scoped server 中已有的 Hobgoblin session。
- 对已有 retained terminal 提供打开、重连、关闭和删除操作。
- 删除确认框提供默认关闭的“同时关闭远程 tmux 会话”选项；勾选后重新校验精确 server/session 元数据，再执行远端 `kill-session`。
- 首次进入或重新进入 tmux Tab、终端返回、手动刷新和下拉刷新时重新扫描。
- 刷新失败且已有结果时保留陈旧快照。

## 非目标

- 不读取 `workspace-configs.json` 或 `branch-workspaces.json`。
- 不扫描工作区、Git 仓库、worktree 或普通目录来推断 tmux session。
- 不创建、重命名或迁移远端 tmux server/session；未显式勾选删除确认框时绝不结束远端 session。
- 不显示缺少 Hobgoblin 名称或必要元数据的任意 tmux session。
- 不轮询，不持久化远端扫描快照，不要求远端 Hobgoblin 进程运行。
- 不改变桌面/Web 创建新 tmux session 的 v1 名称算法。

## 方案选择

### 采用：server socket 枚举 + session 元数据投影

SSH 脚本解析远端 uid 与 tmux socket 目录，枚举 `default` 和 `hobgoblin-project-v1-<24 hex>` socket，再对每个实际 socket 执行一次只读 `list-sessions`。该方案直接以 tmux 运行时状态为权威来源，覆盖旧默认 server 和当前 project-scoped server，不需要知道项目根或工作区关系。

### 未采用：只扫描默认 server

无法发现当前协议创建在 project-scoped server 中的 session。

### 未采用：从项目或工作区反推 server

会漏掉未保存到 Android 的项目，并重新引入用户明确移除的工作区/文件系统扫描依赖。

## 领域模型

```kotlin
sealed interface TmuxServerTarget {
    data object Default : TmuxServerTarget
    data class Named(val serverName: String) : TmuxServerTarget
}

data class HostDiscoveredTmuxSession(
    val server: TmuxServerTarget,
    val identity: TmuxSessionIdentity,
    val terminalNumber: Int,
    val attachedClients: Int,
)

data class HostTmuxPathGroup(
    val initialPath: String,
    val sessions: List<HostDiscoveredTmuxSession>,
)
```

`TmuxServerTarget` 是恢复身份的一部分。`Default` 与同名的 `Named` session 是两个不同终端；Android retained session 的确定性 ID 必须包含 SSH authority、server target 和 session name。

## 远端扫描协议

单次 SSH 命令完成以下操作：

1. 使用现有登录 shell 回退规则解析绝对路径 tmux executable。
2. 使用 `id -u` 得到当前远端 uid。
3. socket 根目录使用 `${TMUX_TMPDIR}/tmux-<uid>`；未设置时使用 `/tmp/tmux-<uid>`。
4. 若 `default` 是 socket，则作为 `TmuxServerTarget.Default` 扫描。
5. 遍历同目录条目，只接受 basename 严格匹配 `hobgoblin-project-v1-[a-f0-9]{24}` 且实际为 socket 的条目。
6. 对每个候选使用精确 `-S <socket path> list-sessions`，输出 server marker、session name、初始路径、终端编号和 attached client 数。

socket 目录不存在、候选在扫描期间消失、server 没有 session 都是成功空结果。tmux 不可用、uid 非法、目录不可读、权限错误或无法解析的整体输出是扫描失败。单个 malformed session 行被忽略，不影响同 server 的其他合法行。

扫描结果只接受：

- server marker 是 `legacy-default` 或严格 project-scoped server name；
- session name 匹配 `hobgoblin-v1-[a-f0-9]{24}`；
- `@hobgoblin_init_path` 是已规范化绝对路径且不含控制字符；
- `@hobgoblin_terminal_number` 是正整数；
- `session_attached` 是非负整数。

主机级扫描无法从 hash 反推出 project root，因此不再重算 session name。安全边界是“实际受限 server socket + 当前协议名称 + session 自带元数据”；这些元数据本来就不是认证凭据。Android 不使用候选路径执行文件操作，只把它作为 SSH 终端工作目录并在附着前重新检查精确 session。

## 恢复与附着

`TerminalSessionRecord` 增加可选 `tmuxServerTarget`：

- `null`：旧设备记录，仍沿用 project root 推导并回退默认 server 的兼容逻辑；
- `Default`：只检查并附着默认 server；
- `Named(name)`：只检查并附着该精确 project-scoped server。

主机扫描恢复的记录不要求 `repositoryId` 或 `repositoryRemotePath`。它必须包含 terminal number、tmux identity 和已解析的 server target。启动策略固定为 `AttachExisting`；会话在点击后消失时显示失败，绝不创建替代 session。

持久化 codec 新增向后兼容字段。旧记录继续可读；新记录的确定性 ID 加入 server target，避免默认 server 与命名 server 中同名 session 冲突。

## 终端操作与删除安全

目录卡片把远端扫描结果与可选的设备本地 retained terminal 投影关联起来，不为展示操作而创建或持久化记录：

- 未留存：仅提供“打开”；打开会创建 retained terminal 并附着精确远端 session。
- `Starting` / `Running`：提供“关闭 / 删除 / 打开”；关闭只停止 Android controller，远端 tmux 继续运行。
- `Exited` / `Failed` / `Disconnected`：提供“重连 / 删除 / 打开”；重连复用原记录与精确 server target。

删除始终先显示确认框。确认框说明默认行为只删除 Android 本地记录，并提供默认不勾选的“同时关闭远程 tmux 会话”。勾选后，Android 必须重新列出扫描到的精确 server，确认 session name、初始路径与 terminal number 仍一致，再对该 server 执行精确 `kill-session`；校验或关闭失败时保留本地记录并显示错误。成功或远端 session 已不存在时才删除本地记录并刷新目录。attached client 数变化不阻止关闭。

## 导航与状态

新增 `AppRoute.HostDetail(hostId, selectedTab)`，Tab 选择是路由返回上下文，不写入长期设置。Hosts 卡片不再直接跳到全局 Projects 过滤页。

- 项目 Tab：复用设备本地项目读模型，仅显示 `hostProfileId == hostId` 的项目；保留打开项目和终端入口。
- tmux Tab：持有 `ResourceState<List<HostTmuxPathGroup>>` 页面快照。
- 首次进入 tmux Tab 或显式刷新时扫描；不在项目 Tab 后台轮询。
- 首次失败显示错误；刷新失败保留旧列表并标记陈旧。
- 从 tmux Tab 打开的 Terminal route 保存 HostDetail 返回描述。

移除 `AppRoute.WorkspaceCatalog`、工作区返回描述、工作区加载状态、工作区注册表 service/codec/read model、共享 fixtures 和 Android 工作区界面。全局 Projects 页恢复为只展示设备本地保存项目。

## 界面

主机详情使用与其他详情页相同的实色 `Scaffold` 和 `TopAppBar`：

```text
返回          开发服务器                         刷新
──────────────────────────────────────────────────
          项目                 tmux
──────────────────────────────────────────────────

tmux Tab

hobgoblin-tmux
/srv/projects/hobgoblin-tmux
┌ terminal-1                         1 个客户端
│ project server · …fa3b3
└───────────────────────────────────────────────

feature-auth
/srv/projects/hobgoblin-feature-auth
┌ terminal-2                                空闲
│ default server
└───────────────────────────────────────────────
```

- 路径是主要分组依据，basename 是组标题，完整路径是次文本。
- 每个 session 使用实色 Card；整行可点击。
- 卡片底部按 retained terminal 状态显示适用的“重连 / 关闭 / 删除 / 打开”文字操作；未留存时只显示“打开”。
- 显示 `terminal-N`、attached client 状态、server 来源及 server/session hash 后缀；accessibility description 保留完整 server/session 值。
- 删除使用 Material 确认框；远程关闭勾选项默认关闭，并用危险色提示会结束进程及断开其他客户端。
- 空状态明确说明“未发现带 Hobgoblin 元数据的 tmux 会话”，不提供创建按钮。
- 不显示工作区、仓库成员或子工作区术语。

## 测试策略

- 协议：socket 候选过滤、`TMUX_TMPDIR`、默认/命名 server、消失 socket、macOS missing-socket 文案、malformed 行和稳定排序。
- 服务：一次 host trust、一次 SSH 命令、空/失败/成功/陈旧结果。
- 恢复：server target 参与去重、默认与命名 server 精确附着、旧 record codec 兼容、缺失 session 不创建。
- 操作投影：远端 session 与 retained terminal 精确匹配、未留存仅打开、活动状态关闭、非活动状态重连、删除确认默认不关闭远端。
- 远端删除：精确 server/session 元数据复核、默认/命名 socket、session 消失幂等、元数据不匹配失败关闭、kill 失败保留本地记录。
- 导航：Hosts → HostDetail、两个 Tab、项目过滤、tmux 终端返回 HostDetail tmux、通知返回 Terminals。
- UI：加载、空、错误、陈旧、按路径分组、attached 状态、状态感知操作、安全删除确认、四语言资源完整。
- 全量验证：Android unit/assemble、root typecheck/test、architecture check、diff check。

## 原则检查

- **KISS**：复用 retained terminal 生命周期与现有删除确认模式，只新增一个精确远端关闭边界。
- **YAGNI**：删除工作区契约、路径检查、工作区层级和 Git 推断。
- **DRY**：复用 tmux executable 解析、session name/path 校验、retained terminal 与 SSH trust。
- **SOLID**：socket 扫描协议、SSH 边界、恢复持久化、导航状态和 Compose 展示各自单一职责。
