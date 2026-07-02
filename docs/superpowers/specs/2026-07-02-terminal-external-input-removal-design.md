# 终端外部输入框移除设计

## 背景

当前终端底部存在可选外部输入框，相关实现包括设置开关、`TerminalExternalInput` 组件、外部输入填充桥接、底部 dock 布局、专用粘贴/拖拽处理和测试。该输入框已经从最初的单行 input 演进成可调整高度的 textarea，并绑定了二进制粘贴、文件路径拖入、自定义按钮填入和合并冲突 AI 命令预填等行为。

本次目标是彻底移除终端外部输入框，降低终端输入路径复杂度。自定义终端按钮不属于移除范围，必须继续可用。

## 已确认决策

- 采用彻底移除方案，而不是仅隐藏输入框。
- 自定义按钮不受影响，按钮栏、显示开关、尺寸设置、按钮列表和按钮动作字段继续保留。
- `execute` 按钮行为不变：发送 `value + "\r"`。
- `input` 按钮不再填入外部输入框，改为向当前 xterm 输入流写入 `value`，不追加回车。
- 合并冲突 AI 命令不再依赖外部输入框；打开或选择终端后写入命令文本但不执行。
- 移除 button dock 的额外顶部间距。按钮 dock 只为按钮栏自身高度和底部偏移预留空间，不再使用 `dock-height + 24px` 形式的额外留白。
- 不执行 git commit，除非用户明确要求。

## 目标

- 删除终端外部输入框 UI 和运行时能力。
- 删除设置页中的外部输入框开关。
- 删除 `terminalExternalInputEnabled` 的运行时投影、写入路径和测试断言。
- 删除外部输入框填充桥接能力。
- 保留终端自定义按钮，且保留按钮 `action` 字段兼容旧配置。
- 调整按钮 dock 布局，去掉按钮栏上方额外预留空间。
- 保留终端搜索、viewer overlay、进度条、文件路径拖入终端、二进制粘贴到终端、移动端工具栏、终端 tab 和会话管理。

## 非目标

- 不重新设计终端输入模型。
- 不恢复 xterm 当前输入行增强 controller。
- 不移除或重做自定义按钮功能。
- 不修改 PTY/server 协议。
- 不新增命令历史、补全、多行编辑器或脚本编辑器。
- 不迁移旧设置文件，只忽略已废弃的 `terminalExternalInputEnabled` 字段。

## 方案比较

### 方案 A：移除外部输入框，保留按钮能力

删除外部输入框组件、设置、桥接和样式。保留按钮栏。`input` 按钮改为直接向 xterm 写入文本但不执行。

优点：

- 满足彻底移除外部输入框的要求。
- 自定义按钮继续可用，旧 `input` 按钮仍有可理解的行为。
- 删除不可见或低价值的维护面，符合 KISS/YAGNI。

代价：

- `input` 模式依赖 shell 当前行编辑能力，不再享有浏览器 textarea 的选择和撤销能力。

### 方案 B：移除外部输入框并移除按钮 action

按钮全部变成直接执行。实现最简单，但会影响已有 `input` 按钮配置。

### 方案 C：隐藏外部输入框但保留数据和桥接

改动少，但保留死代码和设置复杂度，不符合彻底移除目标。

## 推荐方案

采用方案 A。

该方案清除外部输入框维护面，同时保留用户确认不应受影响的自定义按钮功能。`input` 动作的语义从“填入外部输入框”调整为“写入终端当前输入行但不执行”，是最小兼容降级。

## 数据模型

移除：

```ts
terminalExternalInputEnabled: boolean
```

保留：

```ts
terminalCustomButtonsVisible: boolean
terminalCustomButtonSize: TerminalCustomButtonSize
terminalCustomButtons: TerminalCustomButton[]
```

保留按钮动作类型：

```ts
type TerminalCustomButtonAction = 'execute' | 'input'
```

`settings-source` 继续规范化 `TerminalCustomButton.action`。旧设置文件中的 `terminalExternalInputEnabled` 字段读取时忽略，保存后自然不再写回。

## 终端 UI 行为

`TerminalSlot` 不再渲染 `TerminalExternalInput`，也不维护外部输入框本地状态。

按钮显示条件保持：

- 当前 session 为 `open`。
- 当前 attachment role 为 `controller`。
- `terminalCustomButtonsVisible === true`。
- 至少存在一个有效按钮。

按钮行为：

- `execute`：`writeInput(key, button.value + "\r")`。
- `input`：`writeInput(key, button.value)`。

按钮 `title` 继续显示按钮值，便于用户确认会写入或执行的文本。

## 命令桥接

`TerminalSessionCommandBridge` 删除 `fillExternalInput`。跨组件命令只通过以下能力组合完成：

- `worktreeSnapshot`
- `createTerminal`
- `selectTerminal`
- `writeInput`

合并冲突 AI 动作流程：

1. 打开当前 worktree 的 terminal tab。
2. 展开 detail 区域。
3. 选择已有终端，或创建一个新终端。
4. 调用 `writeInput(key, command)`，不追加 `\r`。

这样用户仍能在 shell 当前行检查、编辑并手动执行命令。

## 文件和样式

删除文件：

- `src/web/components/terminal/terminal-external-input.tsx`
- `src/web/components/terminal/terminal-external-input-fill.ts`

删除或调整 CSS：

- 删除 `.goblin-terminal-external-input*` 样式。
- 保留 `.goblin-terminal-bottom-dock` 给按钮栏使用。
- 调整 `.goblin-terminal-slot:has(.goblin-terminal-bottom-dock) .goblin-managed-terminal-frame`，只按按钮 dock 实际高度和底部偏移预留空间，不再额外增加 24px 顶部留白。

## 设置 UI

`TerminalSettings` 删除“外部输入框”开关。`settings.terminal-input` 分组如果只剩远程 tmux 设置，应改名或合并到更合适的终端设置分组，避免留下空泛分组。

自定义按钮设置继续保留：

- 显示自定义按钮。
- 按钮尺寸。
- 按钮 label。
- 按钮 value。
- 按钮 action：直接执行 / 填入输入行。

按钮 action 文案需要从“填入输入框”调整为“填入终端输入行”或同等含义，避免引用已移除的外部输入框。

## 错误处理

- 没有可写终端 key 时，按钮栏本身不会渲染。
- 合并冲突 AI 创建终端失败或命令桥接不可用时，沿用现有失败路径显示错误。
- 写入 `input` 模式按钮时不自动追加回车，避免无意执行命令。

## 测试计划

更新或删除以下测试覆盖：

- `TerminalSlot.test.tsx`
  - 删除外部输入框渲染、填充、textarea 粘贴/拖拽、resize、空输入提交等测试。
  - 保留按钮栏渲染测试。
  - 断言 `execute` 按钮发送 `value + "\r"`。
  - 断言 `input` 按钮发送 `value` 且不包含 `"\r"`。
- `useMergeConflictAiActions.test.tsx`
  - 删除 `fillExternalInput` 断言。
  - 断言命令写入终端且不包含 `"\r"`。
- settings 相关测试
  - 删除 `terminalExternalInputEnabled` 默认值、快照、写入路径、设置页开关断言。
  - 保留自定义按钮可见性、尺寸、按钮 action 断言。
- i18n 快照测试
  - 删除外部输入框文案 key。
  - 调整按钮 `input` 动作文案。
- `terminal-session-css.test.ts`
  - 删除 external input 样式断言。
  - 增加或调整按钮 dock padding 断言，确保不再包含额外顶部留白。

验证命令：

```bash
bun run test src/web/components/terminal/TerminalSlot.test.tsx
bun run test src/web/hooks/useMergeConflictAiActions.test.tsx
bun run test src/web/settings-write-paths.test.ts
bun run test src/server/modules/settings-source.test.ts
bun run test src/shared/settings-snapshot.test.ts
bun run typecheck
```

必要时再运行：

```bash
bun run test
```

## 原则应用

- KISS：删除外部输入框专用状态、组件和桥接，终端输入回到 xterm 原生路径。
- YAGNI：不保留隐藏输入框能力，不新增替代编辑器。
- DRY：跨组件命令统一通过 `writeInput`，不再维护 `fillExternalInput` 第二路径。
- SOLID：设置、终端 UI、命令桥接职责保持分离；按钮 action 的行为由 `TerminalSlot` 在单一位置编排。
