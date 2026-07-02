# 终端滚动和输出 settle repaint 移除设计

## 背景

当前工作树中，`TerminalSessionView` 包含一套终端渲染稳定逻辑：输出写入后检测 scrollback 增长、延迟执行 output-settle repaint、滚动时触发 viewport repaint，并在部分路径调用 xterm 私有渲染缓存清理接口 `clearTextureAtlas()` 和 `_core._renderService.clear()`。

这些逻辑来自终端渲染稳定化方案，但现在需要移除。目标是让终端渲染回到 xterm 默认行为，减少私有 API 依赖和额外 repaint 调度，同时不影响本分支正在进行的“移除终端外部输入框”和“保留自定义按钮”工作。

## 已确认决策

- 采用方案 B：同时移除“滚动时 repaint”和“输出 settle repaint”整套逻辑。
- 移除 `clearTextureAtlas()` 和 `_core._renderService.clear()` 调用路径。
- 保留 theme、resize、font fit 等既有 `term.refresh(...)` 路径。
- 保留 `TERMINAL_SCROLLBACK_LINES` 和 scrollback 容量策略。
- 保留 IME composition 期间延迟输出写入的能力。
- 不改 server/headless terminal。
- 不执行 git commit，除非用户明确要求。

## 目标

- 删除 `TerminalSessionView` 中用于 output-settle repaint 的状态、timer 和调度函数。
- 删除滚动触发 visible-row repaint 的监听和调度。
- 删除 renderer cache invalidation 私有 API 调用链。
- 清理对应测试，避免测试继续约束已移除行为。
- 保持终端输出、输入、滚动命令、生命周期、主题刷新、resize 刷新和 font fit 刷新行为不变。

## 非目标

- 不降低或修改 scrollback 行数。
- 不移除 `term.refresh(...)` 的所有调用。
- 不重做终端渲染恢复架构。
- 不改 xterm 初始化参数、server session 协议或 headless render model。
- 不修改外部输入框移除范围之外的终端按钮行为。

## 推荐方案

执行外科移除。

在 `TerminalSessionView` 内删除以下职责：

- `scrollbackRenderDirty`
- `outputSettleTimer`
- `viewportRefreshFrame`
- `viewportRefreshNeeded`
- viewport DOM scroll listener
- xterm `onScroll` repaint 订阅
- `scheduleOutputSettleRepaint()`
- `cancelOutputSettleRepaint()`
- `scheduleViewportRefresh()`
- `cancelViewportRefresh()`
- `repaintVisibleRowsPreservingViewport()`
- `safeRefreshVisibleRows()`
- `refreshVisibleRows()`
- `clearTerminalRendererCache()`
- `TerminalWithPrivateRenderService`

输出路径保留 `writeOutput()` 和 `term.write(...)` 回调，但不再比较 `baseY` 或安排 settle repaint。滚动路径保留显式 `scrollToBottom()` / `scrollLines()`，不再因 xterm scroll event 或 viewport DOM scroll event 自动 repaint。

## 替代方案

### 方案 A：保留结构但 no-op

让滚动和 settle 调度函数保留但不执行 repaint。

优点是改动少，短期风险低。缺点是留下死代码和误导性测试，后续维护者仍会以为存在主动 repaint 能力，不符合“移除了”的要求。

### 方案 C：回滚整个历史渲染稳定提交

按历史提交回滚相关改动。

优点是理论上能回到稳定化之前的状态。缺点是当前工作树包含外部输入框移除和其它未提交改动，机械回滚容易误伤无关文件，也可能恢复已删除路径。

## 数据流

移除后，终端输出数据流为：

1. server 发送 terminal output event。
2. session 调用 `TerminalSessionView.writeOutput(data, callback)`。
3. 如果正在 IME composition，输出暂存到 `deferredOutput`。
4. composition 结束后 flush deferred output。
5. xterm 自身处理 `term.write(...)` 和默认渲染。

不再有输出 settle timer，也不再在输出后主动刷新 visible rows。

滚动数据流为：

1. 用户通过 xterm 自身交互、移动端 toolbar 或 tab 操作滚动。
2. `scrollLines()` / `scrollToBottom()` 仍调用 xterm API。
3. 不再注册 DOM viewport scroll listener 或 xterm `onScroll` repaint 订阅。

## 错误处理

移除后没有额外 repaint try/catch，因此也不再通过 repaint 失败触发 render recovery。保留终端生命周期中已有的 rebuild/recovery 行为，不新增错误路径。

这意味着 xterm 私有渲染缓存 API 不可用、行为变化或抛错时不再影响应用，因为代码不再调用它们。

## 测试计划

删除或改写 `src/web/components/terminal/ManagedTerminalSession.test.ts` 中专门覆盖以下行为的测试：

- 滚动历史时刷新 visible rows。
- 滚动历史时清 renderer cache。
- 快速滚动时合并 repaint。
- 无 DOM scroll 时通过 xterm scroll event 刷新 visible rows。
- 高频输出增长 scrollback 后 settle repaint。
- IME composition 期间 defer output-settle repaint。
- settle repaint 清 renderer cache。
- settle repaint 保持 scrolled viewport。

保留并运行以下测试面：

- `ManagedTerminalSession.test.ts` 中终端生命周期、theme/resize/font fit、scrollback 常量、IME deferred output、render recovery 非 repaint 路径。
- 外部输入框移除相关测试。
- `bun run typecheck`
- `bun run test`
- `bun run check:architecture`

## 验收标准

- `src/web/components/terminal/terminal-session-view.ts` 不再包含 `clearTextureAtlas`、`_renderService.clear`、`scrollbackRenderDirty`、`scheduleOutputSettleRepaint`、`scheduleViewportRefresh`。
- `ManagedTerminalSession.test.ts` 不再断言滚动 repaint、output-settle repaint 或 renderer cache invalidation。
- `bun run typecheck` 通过。
- `bun run test` 通过。
- `bun run check:architecture` 通过。

## 原则应用

- KISS：删除额外 repaint 调度和私有 xterm 缓存清理路径。
- YAGNI：不保留 no-op 或隐藏的渲染稳定逻辑。
- DRY：移除第二套主动刷新策略，保留 xterm 默认渲染和现有 theme/resize refresh。
- SOLID：`TerminalSessionView` 继续负责终端实例生命周期和 I/O，不再承担私有渲染缓存管理。
