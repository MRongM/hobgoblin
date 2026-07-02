# Terminal Scroll On Erase Removal Design

## 背景

当前 Hobgoblin 通过 `TERMINAL_SCROLL_ON_ERASE_IN_DISPLAY = true` 显式启用 xterm.js 的 `scrollOnEraseInDisplay`。该配置同时传给 web xterm 和 server-side headless xterm render model。

旧 Goblin 路径 `/Users/longjiang/src/tries/2026-05-25-goblin/goblin` 中没有 `scrollOnEraseInDisplay` 配置：

- web 端 `TerminalSlotView` 的 `new Terminal({...})` 不传该 option。
- server 端 `terminal-render-state.ts` 的 headless `new HeadlessTerminal({...})` 也不传该 option。

本次目标是让 Hobgoblin 与旧 Goblin 对齐，不再显式启用 PuTTY 风格的 ED2 清屏进入 scrollback 行为。

## 目标

- 删除 `src/shared/terminal.ts` 中的 `TERMINAL_SCROLL_ON_ERASE_IN_DISPLAY` 常量。
- 删除 `src/web/components/terminal/terminal-session-view.ts` 对该常量的 import。
- 删除 web xterm constructor options 中的 `scrollOnEraseInDisplay` 字段。
- 删除 `src/server/terminal/terminal-render-state.ts` 对该常量的 import。
- 删除 server headless xterm constructor options 中的 `scrollOnEraseInDisplay` 字段。
- 删除 server headless terminal 本地 constructor option type 中的 `scrollOnEraseInDisplay?: boolean`。
- 更新 `ManagedTerminalSession.test.ts` 的 mock option 类型和断言，确保测试不再要求该 option 为 `true`。

## 非目标

- 不修改 `scrollback` 行数。
- 不修改 `scrollOnUserInput`。
- 不修改终端 replay、serialize、resize、theme、focus、IME、custom buttons 或 toolbar 行为。
- 不新增设置项、兼容开关或迁移逻辑。
- 不改 xterm.js 版本或依赖。

## 方案

采用同步删除方案。web xterm 与 server headless xterm 都不再显式传入 `scrollOnEraseInDisplay`，避免前端显示模型和 server replay/headless 模型语义不一致。

`src/shared/terminal.ts` 保留 `TERMINAL_SCROLLBACK_LINES` 与其他终端共享常量，只删除不再被引用的 `TERMINAL_SCROLL_ON_ERASE_IN_DISPLAY`。

`src/web/components/terminal/terminal-session-view.ts` 的 Terminal constructor 保留现有选项：

- `allowProposedApi`
- `cols`
- `rows`
- `cursorBlink`
- `cursorStyle`
- `fontFamily`
- `fontSize`
- `lineHeight`
- `minimumContrastRatio`
- `scrollback`
- `macOptionIsMeta`
- `rescaleOverlappingGlyphs`
- `scrollOnUserInput`
- `theme`

`src/server/terminal/terminal-render-state.ts` 的 headless Terminal constructor 保留现有选项：

- `cols`
- `rows`
- `scrollback`
- `allowProposedApi`

## 行为

移除前：

1. 终端程序输出 ED2 清屏序列，例如 `\x1b[2J`。
2. xterm.js 根据 `scrollOnEraseInDisplay: true` 将被清掉的可视文本推入 scrollback。

移除后：

1. 终端程序输出 ED2 清屏序列。
2. Hobgoblin 不覆盖 xterm.js 默认行为。
3. web xterm 和 server headless xterm 在该 option 上保持一致：都不显式启用。

## 错误处理

该改动只删除 constructor option 和共享常量，没有新增运行时分支、异步状态或错误路径。删除后如果有遗漏引用，TypeScript 会在 typecheck 阶段报错。

## 测试与验证

需要执行：

1. `bun run test "src/web/components/terminal/ManagedTerminalSession.test.ts"`
2. `rg -n "scrollOnEraseInDisplay|TERMINAL_SCROLL_ON_ERASE_IN_DISPLAY" "src"`
3. `bun run test`
4. `bun run typecheck`
5. `bun run check:architecture`

预期结果：

- 单文件测试通过。
- 残留搜索无命中。
- 全量测试、typecheck 和 architecture guard 均通过。

## 自审

- 范围与确认的 A 方案一致：web 和 server headless 同步移除。
- 没有引入设置项或兼容开关。
- 不触碰 scrollback 行数、用户输入滚动、IME、focus 或 repaint 逻辑。
- 与旧 Goblin 对照一致：不传 `scrollOnEraseInDisplay`。
