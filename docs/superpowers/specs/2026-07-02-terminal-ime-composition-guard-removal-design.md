# 终端 IME composition guard 移除设计

## 背景

当前 `TerminalSessionView` 仍包含 IME composition guard：打开 xterm 后查询 textarea，监听 `compositionstart`、`compositionend`、`compositioncancel`，并在 composition 期间将 terminal output 暂存到 `deferredOutput`，composition 结束后再写入 xterm。

前面的终端清理已经移除了外部输入框、滚动 repaint、输出 settle repaint 和私有 renderer cache 清理路径。现在继续收敛终端输出路径，移除 IME composition guard 和 deferred-output 分支，让输出始终走 xterm 默认写入行为。

## 已确认决策

- 采用方案 B：移除整个 IME composition guard。
- 删除 textarea 查询逻辑，不替换为 `term.textarea`。
- 删除 composition event listeners。
- 删除 `textInputComposing` 状态。
- 删除 `deferredOutput` / `deferredOutputCallbacks` 队列和相关 flush/clear 方法。
- 不保留未使用的 no-op guard 代码。
- 不修改 keyboard、paste、focus、theme、resize、font fit、scrollback、server/headless terminal。
- 不执行 git commit，除非用户明确要求。

## 目标

- `TerminalSessionView.writeOutput()` 始终直接调用 `term.write(data, callback)`。
- `TerminalSessionView` 不再读取 xterm textarea 或监听 composition 事件。
- 销毁 terminal 时不再断开 composition listener，也不再清空 deferred output。
- 删除专门覆盖 composition defer output 的测试。
- 保持普通 output batching、input write depth、terminal lifecycle 和现有验证通过。

## 非目标

- 不改变 xterm 输入法自身行为。
- 不新增替代 IME 处理逻辑。
- 不改 renderer recovery、scrollback 容量或终端 tab 行为。
- 不修改外部输入框移除和自定义按钮逻辑。
- 不改 server terminal output 协议。

## 推荐方案

执行彻底移除。

在 `src/web/components/terminal/terminal-session-view.ts` 中删除：

- `deferredOutput`
- `deferredOutputCallbacks`
- `textInputElement`
- `textInputComposing`
- `handleTextInputCompositionStart`
- `handleTextInputCompositionEnd`
- `installTextInputCompositionGuard()`
- `disconnectTextInputCompositionGuard()`
- `deferOutput()`
- `flushDeferredOutput()`
- `clearDeferredOutput()`

同时从 `openTerminal()` 中删除 `this.installTextInputCompositionGuard(term)`，从 `destroyTerminal()` 中删除 `this.disconnectTextInputCompositionGuard()`、`this.clearDeferredOutput(true)` 和 `this.textInputComposing = false`。

`writeOutput()` 保留为单一路径：

```ts
writeOutput(data: string, callback?: () => void): void {
  const term = this.term
  if (!term) {
    callback?.()
    return
  }
  this.outputWriteDepth += 1
  term.write(data, () => {
    this.outputWriteDepth = Math.max(0, this.outputWriteDepth - 1)
    callback?.()
  })
}
```

## 替代方案

### 方案 A：使用 `term.textarea`

只把 `term.element?.querySelector('textarea')` 改成 `term.textarea`。优点是减少 DOM 结构依赖。缺点是仍保留 IME guard 和 deferred-output 分支，不符合本次“移除这个逻辑”的目标。

### 方案 C：只移除 listener 安装

删除 `installTextInputCompositionGuard()` 调用，但保留 deferred-output 状态和方法。优点是改动较小。缺点是留下不可达死代码，后续维护者仍需要理解一条不会触发的输出路径，不符合 KISS/YAGNI。

## 数据流

移除后，terminal output 数据流为：

1. server 发送 terminal output event。
2. session 聚合或调度 output。
3. `TerminalSessionView.writeOutput(data, callback)` 被调用。
4. 如果 xterm 实例存在，直接 `term.write(data, callback)`。
5. 如果 xterm 实例不存在，直接执行 callback。

composition event 不再影响 output 写入。用户正在 IME composition 时，应用层不暂停 terminal output。

## 错误处理

移除后没有 textarea 查询失败、listener 安装失败或 deferred queue 清理失败的状态。terminal 销毁时仍保留现有资源清理：resize observer、fit timer、font observer、pin-to-bottom frame、disposables、theme observer 和 xterm dispose。

## 测试计划

更新 `src/web/components/terminal/ManagedTerminalSession.test.ts`：

- 删除 `defers terminal output writes while xterm text input is composing` 测试。
- 删除 `MockTerminal` 中仅为 composition guard 测试服务的 query-selector-only textarea。
- 保留 `textarea` 字段，如果其它测试或 `focus()` mock 仍需要它。

验证：

```bash
rg -n "compositionstart|compositionend|compositioncancel|textInputComposing|deferredOutput|installTextInputCompositionGuard|disconnectTextInputCompositionGuard|flushDeferredOutput|deferOutput" "src/web/components/terminal"
bun run test "src/web/components/terminal/ManagedTerminalSession.test.ts"
bun run test
bun run typecheck
bun run check:architecture
```

预期：

- 搜索无命中。
- 所有测试和类型检查通过。

## 验收标准

- `terminal-session-view.ts` 不再包含 textarea query 或 composition listener。
- `terminal-session-view.ts` 不再包含 deferred-output 分支。
- `ManagedTerminalSession.test.ts` 不再包含 composition defer-output 测试。
- `bun run test` 通过。
- `bun run typecheck` 通过。
- `bun run check:architecture` 通过。

## 原则应用

- KISS：终端输出路径回到单一路径。
- YAGNI：不保留 no-op guard 或未使用 deferred queue。
- DRY：删除第二条 output 暂存/flush 路径。
- SOLID：`TerminalSessionView` 继续负责终端实例和 I/O，不再承担 IME composition 状态管理。
