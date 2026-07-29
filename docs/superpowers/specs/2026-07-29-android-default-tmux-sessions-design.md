# Android 默认 tmux session 支持设计

**日期**：2026-07-29  
**状态**：已授权自主决策并 inline 实施  
**扩展**：`2026-07-28-android-host-tmux-catalog-design.md`

## 目标

Android tmux Tab 在保留现有 Hobgoblin session 恢复能力的同时，显示并打开所选 SSH Host 默认 tmux server 中由用户自行创建的普通 session。普通 session 进入现有 Android 留存终端生命周期，但不被改写成 Hobgoblin session。

## 领域边界

- **Hobgoblin tmux session**：名称及 `@hobgoblin_init_path`、`@hobgoblin_terminal_number` 满足当前协议；可以位于 project-scoped server 或兼容默认 server。
- **Default tmux session**：位于默认 server、没有有效当前 Hobgoblin 身份的普通用户 session；保留原始名称。
- project-scoped server 中无效或普通 session 继续忽略。Android 不把命名 server 变成任意 tmux socket 浏览器。
- 默认 session 的稳定目标由 SSH authority、`Default` server target 和原始 session name 组成。扫描时的 `session_path` 是展示和初次启动路径，不属于远端 session 身份。

## 扫描协议

主机扫描输出升级为版本化 V2 行，包含：server marker、session name、Hobgoblin init path、Hobgoblin terminal number、tmux `session_path` 和 attached client 数。

解析规则：

1. 所有 server 都先尝试严格识别当前 Hobgoblin session。
2. 默认 server 中未通过 Hobgoblin 身份识别的行，只要 session name 安全、`session_path` 是规范绝对路径、attached client 数合法，就投影为 Default tmux session。
3. project-scoped server 中未通过 Hobgoblin身份识别的行丢弃。
4. 同一 server/name 只保留第一条；结果按路径、类型、terminal number 或 session name稳定排序。
5. session name 作为不透明 tmux 名称处理，只要求非空、长度受限且不含控制字符。所有命令仍使用 shell quoting 和 tmux 精确 `=<name>` target。

## 模型与持久化

保留严格的 `TmuxSessionIdentity`，不放宽其 v1 校验。新增通用 `TmuxSessionTarget(server, sessionName)`，表达“精确附着哪个现有 session”。

`HostDiscoveredTmuxSession` 直接携带：

- `server`
- `sessionName`
- `initialPath`
- 可选 `hobgoblinIdentity`
- 可选 `terminalNumber`
- `attachedClients`

构造约束保证 Hobgoblin 类型必须同时具有 identity 与正 terminal number；Default 类型必须位于默认 server 且两者都为空。

`TerminalSessionRecord` 增加可选 `tmuxSessionTarget`，同时保留既有 `tmuxServerTarget` 作为 Hobgoblin Host 记录的兼容表示：

- project 恢复旧路径仍可只有 `tmuxIdentity`，通过 project root 推导 server；
- Host 级 Hobgoblin 记录继续保存 `tmuxIdentity` 与 `tmuxServerTarget`；
- Default 记录只保存精确 target，不伪造 `tmuxIdentity` 或 terminal number。

codec 新增向后兼容字段保存通用 target 名称。旧的 18 字段记录继续按既有 `tmuxIdentity + server marker` 解码；普通 session 使用 server marker 加新增名称字段 round-trip。确定性 Android session id 继续包含 authority、server marker 与 session name。

## 附着与生命周期

- Hobgoblin session 沿用现有 `AttachExisting`，继续校验协议身份并按精确 server 附着。
- Default session 使用单独的 attach-existing 命令：解析 tmux executable，确认 default server 中精确名称存在，然后执行 `attach-session -t '=<name>'`。
- Default 附着绝不执行 `new-session`、`set-option mouse` 或写入 `@hobgoblin_*`。
- 打开后创建或复用一个 retained Host terminal；显示名使用原始 session name，terminal number 保持空。
- 关闭只停止 Android controller；重连复用同一个精确 target；删除本地记录不影响远端。
- 删除时选择“同时关闭远程 tmux 会话”后，服务重新扫描 default server，并仅以精确 server/name 复核。session 已消失视为幂等成功；名称不再存在时不创建替代对象。

## 界面

目录仍按 live `initialPath` 分组。Hobgoblin 卡片维持 `terminal-N` 标题和协议名称后缀；Default 卡片使用原始 session name 作为标题，显示“default tmux session”，不显示伪 terminal number 或 Hobgoblin hash。attached 状态、打开/关闭/重连/删除动作与现有卡片一致。

空状态和扫描进度改为描述 tmux sessions，而不是只描述 Hobgoblin sessions。终端详情和关闭/删除确认通过 `tmuxSessionTarget` 判断 tmux-backed 状态，保证普通 session 不被标成 native shell。

## 错误与安全

- malformed 行逐行忽略，不影响合法结果。
- 普通 session 仅能来自默认 server。
- session name 不进入未转义 shell；tmux target 总是使用精确名称语义。
- 普通 session 在附着前消失时明确失败，绝不创建同名 session。
- 远端 kill 仍是独立、默认关闭且明确确认的破坏性操作。

## 测试策略

- 协议：V2 command、普通默认行、Hobgoblin 默认行、project 普通行过滤、非法名称/路径/计数、排序和精确附着命令无写操作。
- 服务：混合扫描结果、普通 session 精确复核与关闭、消失幂等。
- 留存：普通 target 的 deterministic id、打开/复用/重连、无 terminal number、codec 新旧兼容。
- UI：两类标题和辅助文案、普通 session 仍判定为 tmux、动作投影与无伪造 terminal number。
- 回归：Android 单测与 assemble、根级 typecheck/test、architecture guard。

## 原则检查

- **KISS**：新增一个精确 target 抽象，复用扫描页和 retained terminal 生命周期。
- **YAGNI**：只支持默认 server 的普通 session；不枚举任意 socket、不导入元数据、不创建或重命名 session。
- **DRY**：复用 SSH trust、controller、终端持久化、操作投影及远端关闭确认。
- **SOLID**：协议身份与附着目标分离；扫描解析、生命周期、持久化和 Compose 展示各守边界。
