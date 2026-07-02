# Terminal Button Dock Click Focus Design

## 背景

终端 tab 点击后已经通过显式 `focusTerminal(key)` / `ManagedTerminalSession.focus()` 路径聚焦 xterm 输入区。现在需要补齐另一条用户操作：用户点击终端底部 button dock 后，应把焦点还给 xterm 输入区一次。

当前输入路径主要有两类：

- xterm 用户手动输入通过 `TerminalSessionView` 转成 `TerminalInput`，再进入 `ManagedTerminalSession.writeInput()`。
- `TerminalSlot` custom buttons 直接调用 `writeInput(key, string)`；`execute` action 写入 `${value}\r`，`input` action 只写入原始 value。

最新需求明确：手动输入不需要再次 focus；button dock 点击需要 focus 一次。因此本设计只处理 dock button click，不处理 xterm 内手动按 Enter。

## 目标

- 用户点击终端 button dock 中任意 custom button 后，对应 xterm 输入区 focus 一次。
- `execute` action 保持写入 `${value}\r`。
- `input` action 保持只写入原始 value。
- 复用现有 `focusTerminal(key)` / session-level `focus()` 和 pending focus 机制。

## 非目标

- 不恢复 terminal frame 或 xterm host 的 pointer focus 监听。
- 不让用户在 xterm 内手动输入或手动按 Enter 触发额外 focus。
- 不让 terminal-emulator/protocol reply、replay、resize、theme、search、paste 解析等内部路径触发 focus。
- 不改变搜索框 Enter 行为；搜索框 Enter 仍只执行搜索。
- 不新增设置项。

## 推荐方案

在 `TerminalSlot` 的 dock button 点击路径中显式调用 `focusTerminal(key)`。

`TerminalSlot` 已经拥有当前 selected terminal `key`，并通过 context 拿到 `writeInput`。当前 context 也已经暴露 `focusTerminal(key)`。设计上只需：

1. 在 `TerminalSlot` context destructuring 中取出 `focusTerminal`。
2. 在 custom button `onClick` 中保留现有写入逻辑。
3. 写入后调用 `focusTerminal(key)` 一次。
4. `focusTerminal` 继续由 `TerminalSessionRegistry` 转发到 `ManagedTerminalSession.focus()`，复用现有 pending focus 语义。

该方案比在 `ManagedTerminalSession.writeInput()` 识别 `\r` 更窄：手动 xterm Enter 仍然只是写入，不触发任何额外 focus。

## 数据流

### button dock execute click

1. 用户点击 dock 中的 execute button。
2. `TerminalSlot` 调用 `writeInput(key, `${button.value}\r`)`。
3. `TerminalSlot` 调用 `focusTerminal(key)`。
4. registry 找到 session 并调用 `ManagedTerminalSession.focus()`。
5. 如果 view 可见且 terminal 已打开，立即 `term.focus()`；否则记录 pending focus，并在 attach/open 后消费。

### button dock input click

1. 用户点击 dock 中的 input button。
2. `TerminalSlot` 调用 `writeInput(key, button.value)`。
3. `TerminalSlot` 调用 `focusTerminal(key)`。
4. 终端输入区重新获得焦点，用户可继续编辑或输入。

### 排除路径

- xterm 手动 Enter：继续只走 `TerminalSessionView -> ManagedTerminalSession.writeInput()`，不新增 focus。
- 搜索框 Enter：停留在 `TerminalSlot.handleSearchKeyDown()`，不调用终端 `writeInput`，不触发 focus。
- terminal emulator/protocol reply：`origin === 'terminal-emulator'`，不触发 focus。

## 错误处理

focus 是 best-effort UI 行为。未知 session、disposed session、未 attach view 或未打开 terminal 继续沿用已有 no-op/pending focus 语义，不展示 toast，不阻断 dock button 写入。

## 测试与验证

重点测试：

- `TerminalSlot.test.tsx`：custom execute button 先写入 `${value}\r`，再调用 `focusTerminal(key)`。
- `TerminalSlot.test.tsx`：custom input button 先写入 `value`，再调用 `focusTerminal(key)`。
- `ManagedTerminalSession.test.ts`：保留已有 session focus 和 pending focus 覆盖，不需要新增手动 Enter focus 测试。
- `ManagedTerminalSession.test.ts`：可增加负向测试，确认用户来源 `\r` 输入不会自动调用 `term.focus()`。

验证命令：

1. `bun run test "src/web/components/terminal/TerminalSlot.test.tsx"`
2. `bun run test "src/web/components/terminal/ManagedTerminalSession.test.ts" -t "focus"`
3. `bun run typecheck`
4. `bun run test`
5. `bun run check:architecture`

## 原则应用

- KISS：在 dock button 点击处理处补一行明确 focus，不新增 DOM 监听或输入解析。
- YAGNI：只覆盖 button dock click，不扩展到手动输入或所有写入。
- DRY：复用 `focusTerminal`、`ManagedTerminalSession.focus()` 与 pending focus。
- SOLID：`TerminalSlot` 负责 button dock 交互；session 层继续负责实际 focus 生命周期。

## 自审

- 无未完成要求或占位内容。
- 目标、非目标和数据流一致：只覆盖 button dock click 后的 focus。
- 范围足够小，可作为单个实施计划执行。
- 与 terminal tab click focus 设计兼容，继续避免 pointer focus 回归。
