# Terminal Tab Click Focus Design

## 背景

`TerminalSessionView` 已移除 wrapper-level `pointerdown -> term.focus()`，避免点击终端画布时由应用层额外干预焦点。这次需求更窄：用户点击终端会话 tab 后，应让对应 xterm 自动获得一次输入焦点。

当前 `TerminalTabs` 点击已选会话时会滚到底部，点击未选会话时会触发选择；`BranchDetailToolbar` 还会在需要时切到 terminal 面板并展开详情区。新行为必须保留这些语义，只在同一次 tab 点击链路末尾补充一次显式 focus。

## 目标

- 点击任意终端会话 tab 后，对应 xterm 获得一次输入焦点。
- 已选 tab 保留现有 `scrollToBottom` 行为，然后 focus。
- 未选 tab 保留现有 `selectTerminal` 行为，然后 focus。
- 从非 terminal 面板点击终端 tab 时，保留切换到 terminal 面板和展开详情区行为，然后 focus。
- 非 Git plain workspace 的终端 tab 使用相同行为。
- 保持 focus 逻辑为显式 session 操作，不恢复终端画布点击监听。

## 非目标

- 不恢复 `TerminalSessionView` 内部 `pointerdown -> term.focus()`。
- 不改变点击终端内容区域、IME、TUI 输出、搜索框、mobile toolbar、custom buttons、paste、drag/drop 或 link provider 行为。
- 不新增设置项或兼容开关。
- 不改变 terminal tab 的键盘导航语义；本设计只覆盖点击选择路径。

## 推荐方案

增加一个窄的终端焦点 command，并从 tab 点击路径调用。

接口链路：

1. `TerminalSessionContextValue` 增加 `focusTerminal(key: string): void`。
2. `TerminalSessionProvider` 将 registry 的 `focusTerminal` 暴露到 context。
3. `TerminalSessionRegistry.focusTerminal()` 根据 session key 定位 `ManagedTerminalSession` 并调用其 `focus()`。
4. `ManagedTerminalSession.focus()` 委托给 `TerminalSessionView.focus()`。
5. `TerminalTabs` 增加 `onFocusTerminal: (key: string) => void` prop。
6. `TerminalTabs.handleSelect(key)` 在现有选择或滚到底部逻辑之后调用 `onFocusTerminal(key)`。
7. `BranchDetailToolbar` 和 `PlainWorkspaceTerminalPanel` 将 context 中的 `focusTerminal` 传入 `TerminalTabs`。

该方案把焦点行为保持在终端 session command 层，不通过 DOM query 寻找 textarea，也不把 tab 与 terminal slot 通过临时 React token 耦合。

## 数据流

点击已选 tab 且 terminal 面板 active：

1. 用户点击当前 terminal tab。
2. `TerminalTabs.handleSelect(key)` 判断 session 已选且 panel active。
3. 调用 `onScrollToBottom(key)`。
4. 调用 `onFocusTerminal(key)`。
5. registry 找到 session，最终调用 `TerminalSessionView.focus()`。

点击未选 tab：

1. 用户点击其他 terminal tab。
2. `TerminalTabs.handleSelect(key)` 调用 `onSelect(worktreeTerminalKey, key)`。
3. 父组件保留现有行为：必要时切到 terminal 面板并展开详情区，然后选择 session。
4. `TerminalTabs.handleSelect(key)` 调用 `onFocusTerminal(key)`。
5. 如果 session 已 attach，xterm focus 生效；如果尚未 attach，调用安全无效。

## 错误处理

`focusTerminal(key)` 对未知 key 或未 attach 的 session 保持 no-op。该行为与现有 `writeInput`、`scrollToBottom` 等 session command 一致，不向 UI 抛错，也不展示 toast。

## 测试与验证

重点测试：

- `TerminalTabs.test.tsx`：点击已选且 active 的 tab 时，调用 `onScrollToBottom(key)` 和 `onFocusTerminal(key)`。
- `TerminalTabs.test.tsx`：点击未选 tab 时，调用 `onSelect(worktreeTerminalKey, key)` 和 `onFocusTerminal(key)`。
- `BranchDetailToolbar.test.tsx`：点击已选 tab 在 terminal 面板内仍只滚到底部，不触发导航，同时调用 focus command。
- `BranchDetailToolbar.test.tsx`：从非 terminal 面板点击 terminal tab 仍触发 terminal 面板导航、session 选择和 focus command。
- `PlainWorkspaceTerminalPanel` 相关测试或现有 coverage：plain workspace 传入并调用 `focusTerminal`。

验证命令：

1. `bun run test "src/web/components/terminal/TerminalTabs.test.tsx"`
2. `bun run test "src/web/components/branch-detail/BranchDetailToolbar.test.tsx"`
3. `bun run typecheck`
4. `bun run test`
5. `bun run check:architecture`

## 原则应用

- KISS：只新增一个明确的 `focusTerminal` command，不引入状态机或设置项。
- YAGNI：只覆盖用户明确要求的 tab 点击 focus，不扩展到键盘导航或终端画布点击。
- DRY：复用既有 `TerminalSessionView.focus()`，不复制 textarea focus 细节。
- SOLID：tab 组件只发出用户意图；registry/session/view 各自处理会话定位、生命周期和 xterm focus。

## 自审

- 无未完成标记或占位内容。
- 目标、非目标和数据流一致：只处理终端 tab 点击后的显式 focus。
- 范围足够小，可作为单个实施计划执行。
- 与已移除的 pointer focus 设计兼容，不恢复被删除的终端画布点击监听。
