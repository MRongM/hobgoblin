# fitNow 不强制刷新设计

## 背景

`TerminalSessionView.fitNow()` 当前在 `fitAddon.fit()` 之后立即调用 `term.refresh(0, rows - 1)`。这个路径由 resize fit 触发，属于相对更容易随容器尺寸变化反复执行的路径。

主题刷新和字体加载刷新是不同职责：

- `applyTerminalTheme(..., { refresh: true })` 只在终端打开后、主题模式变化、主题 token 变化时刷新。
- `fitForFontLoad()` 只在字号变化或字体加载完成事件后刷新，并带有 80ms debounce。

本改动只收窄 `fitNow()` 的职责，让 resize fit 不再强制 repaint。

## 目标

- `fitNow()` 只执行 `fitAddon.fit()` 和既有的 `pinToBottomSoon()`。
- 保留 `fitSoon()` 的 80ms resize debounce。
- 保留主题和字体加载路径的 `term.refresh(...)`。
- 增加或调整测试，明确 `fitNow()` 不调用 `term.refresh(...)`。

## 非目标

- 不移除所有 `term.refresh(...)`。
- 不改变 xterm 初始化参数。
- 不改变字体加载后的 refit/repaint 行为。
- 不改变主题切换后的 repaint 行为。
- 不调整 scrollback、输出 settle repaint 或滚动 repaint 的更大范围逻辑。

## 推荐方案

采用外科式修改：

```ts
fitNow(): void {
  if (!this.term || !this.fitAddon || !hasMeasurableBox(this.xtermHost)) return
  this.fitAddon.fit()
  this.pinToBottomSoon()
}
```

这让 `fitNow()` 的职责保持在尺寸适配和底部跟随上，不再承担强制 repaint。

## 替代方案

### 方案 A：同时移除 `fitForFontLoad()` 的 refresh

优点是进一步减少 repaint。缺点是字体加载会影响字符尺寸和纹理状态，保留字体加载后的刷新更稳妥。该方案超出当前需求。

### 方案 B：`fitNow()` 仅在行列变化时 refresh

优点是减少部分刷新。缺点是仍保留 resize fit 路径的强制 repaint 语义，且需要额外记录/比较尺寸，不符合当前“只 fit、不 refresh”的目标。

## 行为边界

`fitNow()` 触发来源仍包括：

- `ResizeObserver` 经 `fitSoon()` debounce 后触发。
- session attach 后已有终端可用时触发 `fitSoon()`。
- 其它直接调用 `view.fitNow()` 的路径。

这些路径执行后只要求 xterm fit addon 重新计算尺寸，不再主动刷新全部可见行。

主题和字体路径保持原状：

- 主题路径按主题相关 DOM 属性或 token 事件触发，没有额外 debounce。
- 字体路径由 `document.fonts.ready` 或 `loadingdone` 触发，并通过 80ms debounce 合并。

## 测试计划

- 更新 `ManagedTerminalSession.test.ts` 中 resize fit 相关断言，确保 `fitAddon.fit()` 被调用但 `term.refresh()` 不因 `fitNow()` 调用而增加。
- 保留主题切换 refresh 测试。
- 保留字号/字体加载 refresh 测试。
- 运行：
  - `bun run test "src/web/components/terminal/ManagedTerminalSession.test.ts"`
  - `bun run typecheck`

## 验收标准

- `TerminalSessionView.fitNow()` 中没有 `term.refresh(...)` 调用。
- 主题路径仍可调用 `term.refresh(...)`。
- 字体加载路径仍可调用 `term.refresh(...)`。
- 相关测试通过。

## 原则应用

- KISS：只删除目标路径的一行强制刷新。
- YAGNI：不引入条件刷新、状态记录或新抽象。
- DRY：继续复用现有 fit 和 theme/font refresh 路径。
- SOLID：`fitNow()` 只负责尺寸适配，不再混入 repaint 职责。
