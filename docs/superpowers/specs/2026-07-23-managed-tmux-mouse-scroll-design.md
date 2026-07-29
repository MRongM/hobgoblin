# Managed tmux Mouse Scroll Design

## 背景

Hobgoblin 的 tmux-backed internal terminal 通过 `tmux new-session -A` 创建或连接确定性命名的
`hobgoblin-v1-*` session。tmux 的 `mouse` session option 默认关闭，而 tmux 客户端运行在外层
xterm.js 的 alternate screen 中。此时外层 xterm 没有可供本地滚动的 tmux 历史；xterm.js 会把
滚轮转换为方向键上、下并写入 PTY。

因此，在普通 shell 或未声明鼠标协议的 Node TUI 中滚动滚轮时，事件会表现为输入历史、输入框选项
或光标移动，而不是进入 tmux copy mode。现场检查确认问题 session 为 `mouse=off`；手工执行
`set-option mouse on` 后，用户已确认滚轮行为恢复正常。

## 目标

- 当 Hobgoblin 使用 tmux 创建或连接一个 `hobgoblin-v1-*` session 时，为该目标 session 启用
  tmux mouse support。
- 普通 shell 中向上滚轮由 tmux 的默认绑定进入 copy mode，不再作为方向键写入 pane。
- 本地与 SSH、internal 与 Hobgoblin 内置 external terminal attachment 使用相同语义。
- 只修改目标 session，不修改 tmux server 的全局默认值，也不写入用户的 `~/.tmux.conf`。
- 保持确定性 session identity、attach-or-create、缺失 tmux fallback 和多客户端连接语义不变。

## 非目标

- 不在 renderer/xterm.js 层拦截或重写 wheel 事件。
- 不修改 tmux 默认的 `WheelUpPane`、`WheelDownPane` 或 copy-mode bindings。
- 不强制覆盖前台 TUI 主动声明的 mouse protocol；这类滚轮仍由 tmux 默认规则转发给 TUI。
- 不增加设置项、迁移字段或新的运行时状态。
- 不修改 tmux `history-limit`。历史容量与本次滚轮路由问题独立。
- 不修改不使用 tmux 的终端和原生 Windows terminal 路径。
- 不清理、重命名、重启或 kill 任何 tmux session。

## 方案比较

### 方案 A：要求用户配置 `~/.tmux.conf`

用户添加 `set -g mouse on`。实现成本最低，但本地与每个 SSH host 都需单独配置，Hobgoblin 无法保证
功能可用，也无法让新用户获得一致行为。

### 方案 B：目标 session 级启用 mouse（采用）

Hobgoblin 在 attach-or-create command queue 中对精确的 `hobgoblin-v1-*` session 执行
`set-option mouse on`。该方案自动覆盖本地和 SSH，并把影响限制在目标 session。

### 方案 C：renderer 自定义 wheel handler

在 xterm.js 中拦截 wheel。alternate screen 没有 tmux history，renderer 无法通过
`term.scrollLines()` 访问 tmux 的 pane history；伪造 prefix/copy-mode 输入还会破坏用户自定义 prefix、
viewer authority 和前台 TUI mouse protocol。因此不采用。

## 命令语义

当前 tmux 启动命令为：

```sh
tmux new-session -A -s '<session-name>' -c '<working-directory>'
```

调整为同一个 tmux command queue：

```sh
tmux new-session -A -s '<session-name>' -c '<working-directory>' \;
  set-option -t '=<session-name>:' mouse on
```

关键约束：

- 保留 `new-session -A`，由 tmux 原子地决定创建或连接，避免 `has-session` 与 `new-session` 之间的
  TOCTOU 竞态。
- `new-session` 与 `set-option` 由同一个 tmux client command queue 顺序执行。
- `set-option -t` 按 target-pane 解析目标，因此使用 `-t '=<session-name>:'`：`=` 要求 session 名精确
  匹配，尾随 `:` 将目标限定到该 session 的当前 window；`mouse` 本身仍由 tmux 推断为 session option。
  这避免 session 名前缀或 glob 匹配到其他 session。
- 不传 `-g`。`mouse` 是 session option，只改变目标 Hobgoblin session。
- 保留前置 `exec`。tmux 成功后继续成为 PTY 的直接子进程；不新增常驻 wrapper shell。
- session 首次创建和连接既有 session 都执行 `set-option`。第三方客户端先创建 session 的场景也会在
  Hobgoblin 后续连接时收敛为 `mouse=on`。

## 架构与组件

### `src/system/local-terminal.ts`

本地 POSIX tmux invocation 在现有 `command -v tmux` 分支内生成 command queue。tmux disabled、
Windows 和缺失 tmux 的 fallback 行为保持不变。

### `src/system/remote-terminal.ts`

SSH login script 使用同一 command queue。internal remote terminal 和内置 external remote terminal
已经共享该 builder，因此不新增第二套行为。

### `src/system/tmux-session.ts`

继续只负责 descriptor normalization 与 deterministic identity。不把 shell quoting 或启动脚本拼装
放入 identity module，保持职责边界。

### Renderer 与 server terminal lifecycle

`TerminalSessionView`、xterm options、PTY worker、WebSocket 协议和 controller/viewer ownership 均不修改。
修复点位于 tmux invocation 边界，因为 pane history 与 mouse routing 的所有权属于 tmux。

## 数据流

1. 调用方以 `useTmux=true` 请求本地或远程 terminal invocation；internal terminal 对应显式的
   `tmux-if-available` launch mode。
2. server/native adapter 生成确定性 session name 与 tmux command queue。
3. tmux 创建或连接目标 session。
4. 同一 command queue 对该 session 设置 `mouse on`。
5. tmux client 向外层 xterm.js 声明 mouse protocol。
6. xterm.js 把 wheel event 编码为 mouse event 发送给 tmux，而不是转换为方向键。
7. 在普通 shell 中，tmux 默认 `WheelUpPane` binding 进入 copy mode 并滚动 pane history。
8. 若前台 TUI 主动启用 mouse protocol，tmux 继续按默认 binding 把事件转发给 TUI；Hobgoblin 不覆盖
   应用自身语义。

## 生命周期与配置边界

- 该行为应用于新建和重新连接的 Hobgoblin tmux session。
- 已经连接且尚未重新执行 invocation 的 session 不会被后台静默修改；用户可通过重启 internal terminal
  触发重新连接，或手工执行 `tmux set-option -t '=<session-name>:' mouse on`。
- session option 对连接该 session 的所有 tmux client 可见，包括外部 Terminal、Ghostty 或第三方 client。
- 外部 client 可再次修改该 option；Hobgoblin 下一次连接时重新设置为 `on`。
- 非 Hobgoblin session 不受影响。

## 错误处理

- tmux 不存在时，保持现有 native shell fallback。
- tmux 已检测到但 `new-session`、target resolution 或 `set-option` 失败时，错误直接显示在 terminal，
  不静默 fallback 到非持久 shell。
- descriptor 或路径无效时继续在 spawn 前失败。
- session 名与路径继续通过现有 shell quoting seam 处理；命令中不插入未引用的用户输入。
- 任何错误路径都不得 detach 其他 client、kill session 或修改全局 tmux options。

## 测试

### Invocation 单元测试

更新 `src/system/local-terminal.test.ts` 与 `src/system/remote-terminal.test.ts`：

- tmux-enabled invocation 包含 `new-session -A`，随后包含 session-level
  `set-option -t '=<session-name>:' mouse on`。
- 本地与 SSH 使用相同的确定性 session name。
- 不包含 `set-option -g`、`set -g mouse`、detach 或 kill 命令。
- 含单引号的路径继续正确 shell quote。
- tmux disabled invocation 不包含任何 tmux 或 mouse 命令。
- internal 与内置 external terminal 路径共享相同 mouse 语义。

### 手工验收

1. 打开一个启用 tmux 的新 terminal，运行产生多行输出的命令。
2. 在普通 shell prompt 向上滚动，确认进入 tmux copy mode，而不是切换输入历史。
3. 按 `q` 退出 copy mode，确认键盘输入正常。
4. 对本地与 SSH terminal 各执行一次。
5. 从外部终端连接同一 `hobgoblin-v1-*` session，确认 mouse option 与滚动行为一致。
6. 运行主动启用 mouse protocol 的 TUI，确认其滚轮行为仍由该 TUI/tmux 默认绑定决定。

### 自动验证

```sh
bun run test src/system/local-terminal.test.ts src/system/remote-terminal.test.ts src/server/terminal/terminal.test.ts
bun run typecheck
bun run test
bun run check:architecture
```

## 验收标准

- 新建或重新连接的 Hobgoblin tmux session 报告 `mouse=on`。
- 普通 shell 中 wheel 不再作为方向键输入当前 pane。
- 目标修改限定于精确的 `hobgoblin-v1-*` session，不修改全局 tmux 配置。
- 本地、SSH、internal 和内置 external attachment 保持一致。
- 不使用 tmux 的终端行为无变化。
- 所有相关测试、全量测试、typecheck 和 architecture guard 通过。

## 原则应用

- KISS：只扩展现有 tmux command queue，不引入 renderer wheel shim。
- YAGNI：不新增设置项、key binding 管理或 history-limit 配置。
- DRY：本地与远程继续复用各自现有 invocation builder，internal/external 共享既有路径。
- SOLID：tmux adapter 负责 tmux session 行为，renderer 继续只负责 terminal emulator 展示与输入输出。
