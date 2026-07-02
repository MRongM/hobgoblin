# 终端 composition guard 使用 term.textarea 设计

## 背景

`TerminalSessionView.installTextInputCompositionGuard()` 当前通过 `term.element?.querySelector('textarea')` 查找 xterm 的隐藏输入框，并在该元素上监听 `compositionstart`、`compositionend`、`compositioncancel`。这个方式依赖 xterm 的 DOM 结构和选择器。

当前安装的 `@xterm/xterm` 类型定义公开了 `Terminal.textarea`：

```ts
readonly textarea: HTMLTextAreaElement | undefined
```

xterm 源码文档也将该属性作为公开 API 暴露。生产代码可以直接使用 `term.textarea`，减少对 DOM 查询细节的依赖。

## 目标

- 将 composition guard 的输入框来源从 `term.element?.querySelector('textarea')` 改为 `term.textarea`。
- 保留 `undefined` 保护：如果 textarea 不可用，则不安装 guard。
- 保留现有 composition 期间延迟 terminal output write 的行为。
- 更新测试 mock 和测试断言，使测试覆盖 `term.textarea` 路径。

## 非目标

- 不改变 IME composition 期间 defer output 的语义。
- 不改变 composition event handler 的实现。
- 不改变 xterm 初始化、focus、keyboard 或 paste 逻辑。
- 不增加 DOM fallback，除非后续验证发现当前 xterm 类型/API 不可用。

## 推荐方案

在 `TerminalSessionView.installTextInputCompositionGuard(term)` 中直接读取 `term.textarea`：

```ts
private installTextInputCompositionGuard(term: XTermTerminal): void {
  this.disconnectTextInputCompositionGuard()
  const input = term.textarea ?? null
  if (!input) return
  this.textInputElement = input
  input.addEventListener('compositionstart', this.handleTextInputCompositionStart)
  input.addEventListener('compositionend', this.handleTextInputCompositionEnd)
  input.addEventListener('compositioncancel', this.handleTextInputCompositionEnd)
}
```

测试里的 `MockTerminal` 暴露 public `textarea` 字段，并在 `open(host)` 中赋值。现有 composition 测试通过 `term.textarea` 触发事件，而不是从 host DOM 中查询 textarea。

## 替代方案

### 方案 A：使用 `term.textarea`，DOM query 作为 fallback

优点是兼容未知旧版本 xterm 或异常状态。缺点是继续保留对 DOM 结构的依赖，测试也无法明确约束新契约。当前本地类型已经暴露 `textarea`，因此不采用。

### 方案 B：提取 helper

例如新增 `terminalTextInputElement(term)`。优点是集中处理取值逻辑。缺点是当前只有一个调用点，新增抽象没有实际收益，不符合 YAGNI。

## 数据流

1. `openTerminal()` 调用 `term.open(this.xtermHost)`。
2. `installTextInputCompositionGuard(term)` 在 `term.open(...)` 之后执行。
3. guard 读取 `term.textarea`。
4. 如果 textarea 存在，安装 composition event listeners。
5. composition 期间，`writeOutput()` 继续将 output 暂存到 `deferredOutput`。
6. composition 结束后，现有逻辑 flush deferred output。

## 错误处理

如果 `term.textarea` 为 `undefined`，guard 保持当前模式：直接返回，不安装监听器，不抛错。这保留终端打开路径的容错行为。

`disconnectTextInputCompositionGuard()` 继续只依赖已保存的 `textInputElement`，不需要知道该元素来自 `term.textarea` 还是 DOM 查询。

## 测试计划

- 更新 `src/web/components/terminal/ManagedTerminalSession.test.ts` 中的 `MockTerminal`：
  - 暴露 `textarea: HTMLTextAreaElement | null = null`。
  - `focus()` 使用 public `textarea`。
  - `open(host)` 创建 textarea 后赋给 public 字段。
- 更新 composition defer output 测试：
  - 使用 `const input = term.textarea`。
  - 断言 `input` 是 `HTMLTextAreaElement`。
  - 用该 input 派发 `compositionstart` 和 `compositionend`。
- 运行：
  - `bun run test "src/web/components/terminal/ManagedTerminalSession.test.ts"`
  - `bun run typecheck`

## 验收标准

- `installTextInputCompositionGuard()` 不再使用 `querySelector('textarea')`。
- composition guard 使用 `term.textarea`。
- composition 期间 deferred output 测试通过。
- typecheck 通过。

## 原则应用

- KISS：直接使用 xterm 公开属性，删除 DOM 查询。
- YAGNI：不新增 fallback 或 helper。
- DRY：继续复用现有 listener install/disconnect 逻辑。
- SOLID：`TerminalSessionView` 依赖 xterm 公开接口，而不是内部 DOM 结构。
