# Desktop default tmux sessions design

**日期**：2026-08-03  
**状态**：已授权自主决策并 inline 实施  
**扩展**：`2026-07-28-host-tmux-session-inventory-design.md`

## 目标

Desktop 的 **Host tmux session inventory** 在保留现有 Hobgoblin 会话管理能力的同时，也显示当前操作系统用户 default tmux server 中的普通用户会话。用户既可沿用现有显式选择、确认和关闭流程，也可从单个扫描结果在外部终端中精确附着既有会话，以查看与 Hobgoblin 失联但仍存活的会话内容。

Android 已具备该行为，本次只复用其领域边界；不修改 Android 代码、持久化或终端生命周期。

## 范围

### 包含

- 本地主机与 SSH 主机扫描继续枚举严格命名的 project-scoped servers，并额外读取 default server。
- project-scoped servers 仍只接受当前协议的 Hobgoblin 会话。
- default server 同时接受：
  - 具有有效当前协议操作元数据的 Hobgoblin 会话；
  - 安全名称、规范绝对 live `session_path` 和合法 attached-client 计数的普通会话。
- 普通会话在现有 Desktop inventory 对话框中展示、选择并关闭。
- 关闭前重新扫描，并按 session kind、exact server origin 和 exact session name 复核。
- 每个扫描结果提供“在外部终端中打开”入口；打开前同样重新扫描和复核，只执行 exact attach，不创建或替换会话。
- 外部打开覆盖本地与 SSH 主机，以及 default server 和严格 project-scoped server 上的可管理行。

### 不包含

- 不在 Hobgoblin 内部终端中打开、导入、重命名或持久化扫描结果。
- 不创建缺失的 tmux 会话，不回退到同名但不同 kind/origin 的会话，也不修改会话元数据。
- 不显示 project-scoped servers 中的普通或无效会话。
- 不扫描任意命名 tmux server。
- 不修改 Android。

## 领域模型

**Default tmux session** 从 Android 专属发现结果提升为共享主机概念：它是当前操作系统用户 default server 中未被识别为当前协议 Hobgoblin 会话的普通会话。其远端目标由 default server 与原始 session name 组成；live `session_path` 只用于展示和分组。

**Host tmux session inventory** 返回两类互斥记录：

- `hobgoblin`：固定初始目录、正 terminal number、attached-client 计数，以及 default 或严格 project-scoped server origin；
- `default`：原始安全名称、live 初始目录和 attached-client 计数，且 server origin 必须是 default。

共享 TypeScript 契约使用判别联合，避免用可选 terminal number 表达非法组合：

```ts
export type TmuxHostSessionRecord =
  | {
      kind: 'hobgoblin'
      sessionName: string
      initialPath: string
      terminalNumber: number
      attachedClients: number
      serverName?: string
    }
  | {
      kind: 'default'
      sessionName: string
      initialPath: string
      attachedClients: number
      terminalNumber?: never
      serverName?: never
    }
```

关闭审批使用同样带 `kind` 的 `TmuxHostSessionIdentity`。这保证 default server 上某个会话在预览后从 Hobgoblin 分类变成普通分类时，不会继承旧审批。

## 扫描与解析

Desktop host-list 格式增加 tmux `session_path`：

```text
@hobgoblin_init_path<TAB>@hobgoblin_terminal_number<TAB>session_attached<TAB>session_name<TAB>session_path[<TAB>server_origin]
```

本地扫描由调用方固定 server origin；SSH 扫描在每行附加 origin。解析逐行执行：

1. origin 必须是 `legacy-default` 或严格的 `hobgoblin-project-v1-<24 hex>`。
2. attached-client 计数必须是规范非负安全整数。
3. 名称、固定路径和 terminal number 满足当前 Host-manageable Hobgoblin 规则时，生成 `hobgoblin` 记录。
4. 否则，仅当 origin 是 `legacy-default`、名称非空且不超过 256 字符并且没有控制字符、`session_path` 是规范绝对路径时，生成 `default` 记录。
5. project-scoped server 的非 Hobgoblin 行以及任意 malformed 行被忽略；整行字段结构损坏仍使内部协议解析失败。

普通会话名称保持不透明。shell 命令继续使用单引号转义和 tmux exact `=<name>` target；不从名称推导目录或身份。

## 服务端复核、关闭与外部打开

Server preview 对两类记录分别验证，不接受缺少或未知 `kind` 的数据。身份键包含 `kind + server origin + session name`；同一 default server/name 只保留第一条 live 记录。

Close 请求仍限制最多 256 个唯一选择。Server 重新扫描主机，构建 live identity map，只关闭 exact kind/origin/name 仍存在的选择。普通名称只允许在 default origin；named origin 始终要求当前 Hobgoblin 名称。消失或分类变化返回 `missing`，单个 kill 失败不阻断后续选择。

Host close API 将审批数组作为一个整体校验；任一 identity 非法时，整批请求在重新扫描或执行 kill 前失败，不允许静默过滤非法项后部分关闭。

Open 请求只接受一个带 `kind` 的 Host session identity。Server 使用所选项目作为本地或 SSH 主机定位器，重新扫描同一主机，并从 live identity map 解析完整记录；若会话消失、改变分类或改变 origin，则返回 `missing`，不会打开其他目标。只有 live 记录通过复核后，Server 才读取当前外部终端偏好并构造 attach-only 调用。

## 外部终端 exact attach

现有“打开项目终端”路径可创建 Hobgoblin 会话，不适合作为恢复查看入口。本功能仍复用 Terminal.app/Ghostty 的应用选择与启动适配器，但显式传入“既有 tmux 目标”：

- `workingDirectory` 携带复核后的 live `initialPath` 作为目标描述与结果上下文，但 attach-only 脚本不先 `cd`，因此原目录删除后仍可附着；
- `sessionName` 使用原始扫描名称，并通过 tmux exact `=<name>` target；
- `serverName` 缺省表示 default server，存在时必须是严格的 project-scoped server；
- 本地执行 `tmux -L <server-or-default> attach-session -t '=<name>'`，避免继承的 `TMUX` 环境改变目标 origin；
- SSH 执行同一远端 attach 命令，并保留 `ssh -tt` 交互 TTY；
- attach 命令不包含 `new-session`、元数据写入或同名回退。

普通名称仅可用于 default server；named server 仍要求当前 Hobgoblin session name。Terminal 单飞键包含主机、server origin 与 session name，避免同目录下不同会话的并发打开被错误合并。

## Desktop 界面

沿用现有 inventory 对话框、目录分组、unchecked 默认选择、attached/detached 状态和 destructive close 确认：

- `hobgoblin` 行继续显示 session name 与 `Terminal N`；
- `default` 行显示原始 session name 与 `default tmux session`，不显示伪 terminal number；
- 每行提供独立的外部终端按钮，不改变关闭复选框状态；打开期间禁用重复操作；成功静默，失败显示明确提示；
- 空状态与说明文案从“可管理的 Hobgoblin 会话”泛化为“可管理的 tmux 会话”。

本次没有新的布局或交互模式，因此不需要独立 UI 原型。

## 错误与安全

- default server 不存在仍是成功的空贡献。
- tmux 不可用、SSH 失败、不安全 socket directory 和意外命令错误仍 fail closed。
- 普通名称中的 tab、换行、NUL、DEL 等控制字符被拒绝；长度上限与 Android 保持 256。
- live `session_path` 只作为普通会话展示路径，不进入关闭身份。
- exact re-scan 防止新会话、不同 origin 会话或分类变化继承审批。
- 外部打开的启动成功仅表示外部终端已接收 attach 命令；tmux 在命令真正执行前退出时，错误保留在新终端中供用户查看。
- Server 重扫已发现会话不存在时返回专用 missing 状态，不启动空终端，也不创建替代会话。

## 测试策略

- 系统协议：安全普通名称、V2 host-list 字段、default 普通行、default Hobgoblin 行、project 普通行过滤、非法路径/计数、稳定排序。
- 本地/SSH 命令：default 扫描包含 `session_path`；普通 default exact kill 可用；named arbitrary name 和控制字符 fail closed。
- Server：两类 preview、kind-bound 去重与审批、重新扫描、分类变化、missing/partial failure。
- 外部终端：本地/default、named server、SSH 的 exact attach 命令；普通名称边界；无 `new-session`；单飞键包含 exact target。
- Server open：本地/SSH 主机定位、打开前重扫、kind/origin/name 变化返回 missing、只把复核后的 live 路径交给终端适配器。
- Renderer：普通行文案、无 terminal number、目录分组、选择与关闭 payload 带 kind、逐行外部打开 payload、按钮不切换关闭选择。
- 文案：英文、简体中文、日文、韩文 key 集一致。
- 全量：`bun run typecheck`、`bun run test`、`bun run check:architecture`。

## 原则检查

- **KISS**：扩展现有 host inventory 对话框，以一个逐行入口调用现有外部终端适配器。
- **YAGNI**：只做恢复查看所需的 attach-only，不引入内部终端导入、持久化或任意 server 浏览。
- **DRY**：本地与 SSH 共用同一解析和 Server live identity 复核逻辑，终端启动复用现有应用选择层。
- **SOLID**：判别联合负责身份约束，system 负责安全命令，server 负责主机定位与授权，renderer 只负责交互状态。
