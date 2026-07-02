# Terminal Pointer Focus Removal Design

## 背景

`TerminalSessionView` 当前在构造函数中给 terminal frame 注册 `pointerdown` listener。该 listener 会在用户点击 xterm host 内部时调用 `term.focus()`。旧 Goblin 没有这层应用自定义点击聚焦逻辑；它通常只影响点击路径，但在排查 TUI 输出和 IME 输入互相打断时，应先移除这类额外焦点干预。

本设计只移除应用层自定义的 `pointerdown -> term.focus()` 语义。保留代码中明确调用 `view.focus()` 的路径，例如非移动端 attach 后自动 focus、会话恢复后的显式 focus、以及测试或业务代码主动调用的 focus。

## 目标

- 删除 `TerminalSessionView` 内部 wrapper-level `pointerdown` focus handler。
- 删除构造函数中的 `frame.addEventListener('pointerdown', ...)` 注册。
- 删除 `disposeFrame()` 中对应的 `removeEventListener` 清理。
- 保留 `TerminalSessionView.focus()` 方法和所有显式调用方。
- 保留 `blurIfFocused()` 和 `isTerminalFocusTarget()`，因为它们负责焦点状态判断与 detach 清理，不负责点击触发 focus。
- 更新测试，明确移动端点击 terminal DOM 不再由应用层主动调用 `term.focus()`。

## 非目标

- 不修改 xterm 自身内部的点击、textarea 或浏览器原生 focus 行为。
- 不移除 `ManagedTerminalSession.autoFocusView()` 的非移动端显式 focus。
- 不改变终端按钮、键盘输入、paste、link provider、resize、theme、font、scrollback 或 session attach 流程。
- 不新增设置项或兼容开关。

## 方案

采用负向测试保护的删除方案。

在 `src/web/components/terminal/terminal-session-view.ts` 中删除 `handleTerminalPointerDown` 字段。构造函数不再对 `this.frame` 注册 `pointerdown` 监听，`disposeFrame()` 也不再移除该监听。删除后，`TerminalSessionView` 不再在点击 terminal 区域时主动调用 `term.focus()`。

在 `src/web/components/terminal/ManagedTerminalSession.test.ts` 中，将当前“移动端点击 terminal 会 focus xterm”的测试替换为负向语义：移动端点击 `.xterm` 后，mock `term.focus()` 不应被调用。这样后续若重新引入 wrapper-level 点击聚焦，测试会失败。

## 数据流与行为

移除前：

1. 用户 pointerdown 命中 xterm host。
2. `TerminalSessionView.handleTerminalPointerDown()` 过滤目标和鼠标按钮。
3. handler 调用 `this.term?.focus()`。

移除后：

1. 用户 pointerdown 命中 xterm host。
2. Hobgoblin 应用层不处理该事件。
3. 若 xterm 或浏览器自身有内部点击聚焦行为，则由它们自行处理；Hobgoblin 不再额外调用 `term.focus()`。

显式 focus 路径保持不变：

- `TerminalSessionView.focus()` 仍调用 `term?.focus()`。
- `ManagedTerminalSession.autoFocusView()` 仍可在非移动端 attach 完成后调用 `view.focus()`。
- 移动端 attach 后仍不自动 focus。

## 错误处理

该改动删除事件监听和回调，没有新增异步状态、计时器或错误分支。删除 `removeEventListener` 不会留下未清理资源，因为对应 listener 不再注册。

## 测试与验证

需要执行：

1. `bun run test "src/web/components/terminal/ManagedTerminalSession.test.ts"`
2. `rg -n "handleTerminalPointerDown|frame\\.addEventListener\\('pointerdown'|frame\\.removeEventListener\\('pointerdown'|pointerdown.*term\\.focus|focuses xterm when the mobile user taps the terminal" "src/web/components/terminal"`
3. `bun run test`
4. `bun run typecheck`
5. `bun run check:architecture`

预期结果：

- 单文件测试通过。
- 残留搜索无命中。
- 全量测试、typecheck 和 architecture guard 均通过。

## 自审

- 无未完成标记或悬而未决的要求。
- 范围只覆盖 wrapper-level pointerdown focus，不触碰显式 focus 生命周期。
- 测试策略覆盖回归风险：点击 terminal DOM 不应再触发应用层 `term.focus()`。
- 与前序移除 external input、repaint、IME composition guard 的工作兼容；本设计不恢复任何已删除逻辑。
