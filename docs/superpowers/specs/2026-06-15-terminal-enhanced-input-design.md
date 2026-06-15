# 终端当前输入行增强设计

## 背景

Hobgoblin 当前内置终端基于 `@xterm/xterm`，已有搜索、链接识别、文件路径拖入、移动端快捷按钮和自定义按钮栏。终端输入仍主要依赖 xterm 原生隐藏 textarea 和 shell 自身行编辑能力。桌面端用户在当前命令行里编辑复杂命令时，缺少普通输入框常见能力：选择、复制、剪切、局部替换、选区删除、撤销/重做、按词移动和按词选择。

本设计只增强“正在输入的当前 shell 单行命令”。终端历史输出的选择/复制、命令历史搜索、多行编辑、粘贴预览、自动补全 UI 和完整代码编辑器能力不属于第一版范围。

## 目标

- 桌面端普通 shell 单行输入支持鼠标和键盘选区。
- 支持选区复制、剪切、删除、替换。
- 支持 Backspace/Delete、按词删除、行首/行尾移动、按词移动。
- 支持 `Shift+Arrow`、`Shift+Option+Arrow` / `Shift+Alt+Arrow`、`Shift+Home/End` 选择。
- 支持 `Cmd+A` / `Ctrl+A` 选择当前输入行。
- 支持当前输入行内撤销/重做。
- Enter 只发送最终命令一次，不重复提交。
- 本地终端和远程终端走同一实现，尽量不依赖具体 shell。
- 无法安全增强时回退 xterm 原生输入。

## 非目标

- 不增强终端历史输出区的选择、复制或结构化复制。
- 不实现命令历史搜索、补全弹层、多行命令编辑或粘贴预览。
- 不支持 REPL、TUI、全屏程序或程序自有输入框内的增强编辑。
- 不新增 server、PTY 或 terminal worker 协议。
- 不要求远程主机安装 shell 插件或注入 shell 配置。
- 不保存、记录或持久化用户输入内容。

## 现有上下文

终端渲染和输入边界主要在 `src/web/components/terminal/terminal-session-view.ts`、`src/web/components/terminal/ManagedTerminalSession.ts` 和 `src/web/components/terminal/TerminalSlot.tsx`。

`TerminalSessionView` 拥有 xterm 实例、addon、焦点、搜索、链接和尺寸适配。它通过 `term.onData()` 和 `term.onBinary()` 把输入交给 `ManagedTerminalSession.writeInput()`，最终由 `terminalBridge.write()` 写入 PTY。`TerminalSlot` 负责当前 session 的挂载、搜索浮层、拖拽文件路径写入、viewer overlay、移动端工具栏和自定义按钮栏。

这个边界适合在 renderer 层加入一个小型输入控制器：它只接管当前输入行的编辑状态，不改变服务端会话生命周期、输出回放、tmux/remote 行为或已有终端 tabs 机制。

## 方案比较

### 方案 A：前端轻量 line editor

renderer 维护当前输入行的文本缓冲、光标、选区和撤销栈。普通字符可以继续实时发送给 PTY；选区删除、剪切、替换、撤销/重做等 shell 原生无法理解的操作，通过重绘当前 shell 输入行同步到 PTY。

优点：

- 能覆盖鼠标和键盘选区。
- 不要求远程环境安装组件。
- 能实现普通输入框的核心编辑能力。
- 不改变 server/PTY 协议。

代价：

- 必须保守判断启用范围。
- 当前端缓冲和真实 shell 行不同步时只能回退原生输入。
- 对 shell prompt、补全、history expansion、程序输入模式的准确识别有限。

### 方案 B：只发送增强快捷键序列

不维护本地选区，只把部分快捷键翻译成 readline/zle 常见控制序列。

优点是实现简单、侵入小。缺点是无法可靠支持鼠标选区、复制/剪切选区和可视化高亮，体验仍不像普通输入框。

### 方案 C：Shell 协议集成

通过 zsh/bash 集成脚本让 shell 主动上报输入缓冲、光标和模式。

优点是状态更准确，能做更深的输入增强。缺点是需要本地和远程 shell 安装或注入脚本，不符合第一版“本地和远程尽量 shell 无关”的约束。

## 推荐方案

第一版采用方案 A：前端轻量 line editor。

这是唯一同时满足“原地编辑”“鼠标和键盘都支持选择”“本地和远程同一路径”“不依赖远程 shell 安装组件”的方案。它的风险通过保守启用、快速回退和不持久化输入内容来控制。

## 组件设计

新增 `TerminalEnhancedInputController`，放在终端 renderer 边界内。它只做当前输入行模型，不直接关心 React、终端 tabs 或后端 session。

职责：

- 维护当前输入行文本、光标位置、选区锚点和选区范围。
- 处理字符插入、选区替换、删除、剪切、复制、粘贴纯文本、撤销、重做。
- 把键盘事件映射为编辑操作或 xterm passthrough。
- 根据鼠标命中位置计算当前输入行内的字符 index。
- 生成需要发送给 PTY 的同步序列。
- 在不安全或不同步时停用并丢弃本地缓冲。

`TerminalSessionView` 集成 controller：

- 创建 xterm 时安装增强输入控制器。
- 在 `attachCustomKeyEventHandler()` 中先让增强输入判断是否接管。
- 对当前输入行范围内的 mouse down / drag / up 建立或更新选区。
- 暴露必要的 xterm 查询能力，例如当前 buffer、cursor 坐标、alt screen 状态、鼠标模式状态。
- 继续保留现有 Safari Shift symbol 和 macOS Option Arrow 处理；增强输入与这些已知兼容逻辑按明确优先级组合。

`ManagedTerminalSession` 保持最终输入发送入口：

- controller 生成的输入仍调用现有 `writeInput(data)`。
- 不绕过 `pendingWriteBuffer` 和 `terminalBridge.write()`。
- 不新增 server API。

`TerminalSlot` 只需要按 session 状态决定是否允许增强：

- 当前 session phase 为 `open`。
- attachment role 为 `controller`。
- 非 viewer、非 unowned。
- 搜索输入框未聚焦。
- 当前终端 host 可见并有焦点。

## 输入模型

controller 的输入状态是短生命周期状态：

```ts
interface TerminalInputBuffer {
  text: string
  cursor: number
  selectionAnchor: number | null
  selectionFocus: number | null
  undoStack: TerminalInputEditSnapshot[]
  redoStack: TerminalInputEditSnapshot[]
}
```

光标和选区 index 均以 JavaScript 字符串 offset 表示。第一版不尝试实现完整 grapheme cluster 编辑器，但必须避免把字符串切到无效 surrogate pair 中间。已有终端 Unicode 宽度渲染仍由 xterm 负责。

提交规则：

- Enter 发送当前缓冲加 `\r`，然后清空本地输入状态。
- 纯字符输入更新本地缓冲，并在无选区时直接发送字符。
- 有选区时输入字符或粘贴纯文本会替换选区，然后重绘当前行。
- 含换行的粘贴交给 xterm 原生路径，不由增强输入半截处理。

## 同步策略

第一版采用“输入镜像 + 标准控制序列重绘”：

1. 普通字符输入：更新本地缓冲，同时发送字符给 PTY。
2. 选区删除、剪切、替换、撤销/重做：更新本地缓冲，然后重绘 shell 当前输入行。
3. 重绘序列：
   - 发送 `Ctrl+U` 清空当前行。
   - 发送新的完整缓冲内容。
   - 按需要发送左箭头序列把 shell 光标移动回目标位置。

这种策略不依赖 zsh/bash/readline 私有协议，但要求当前程序处在普通 shell 单行输入状态。它优先保证跨本地/远程的一致实现，牺牲对复杂 shell 行编辑场景的完全准确性。

## 启用与回退

增强输入只在以下条件全部成立时启用：

- 当前终端 session phase 为 `open`。
- 当前窗口持有 controller role。
- 当前 xterm 处于主屏幕，不在 alt screen。
- 未检测到应用鼠标报告模式。
- 未处于 bracketed paste 处理中。
- 当前焦点在 xterm 输入区域内。
- 当前本地缓冲与最近输入事件可归因。

以下情况立即回退 xterm 原生输入，并丢弃本地缓冲：

- 进入 alt screen 或全屏 TUI。
- 检测到鼠标报告模式。
- 收到无法归因的输出刷新、清屏、换行或光标大幅移动。
- shell 补全、history expansion 或 prompt hook 改写当前行后导致缓冲不可信。
- viewer/unowned 会话。
- 搜索框或其他终端浮层控件获得焦点。

回退后不尝试自动修复 shell 行。用户仍可继续用原生终端输入。

## 交互细节

鼠标：

- 仅当前输入行内支持拖拽选择。
- 拖出当前输入行范围时 clamp 到输入行首尾。
- 单击移动光标并清除选区。
- 拖拽建立选区并渲染高亮。

键盘：

- `ArrowLeft` / `ArrowRight`：移动光标，清除选区。
- `Shift+ArrowLeft` / `Shift+ArrowRight`：扩展或收缩选区。
- `Option/Alt+ArrowLeft` / `Option/Alt+ArrowRight`：按词移动。
- `Shift+Option/Alt+ArrowLeft` / `Shift+Option/Alt+ArrowRight`：按词选择。
- `Home` / `End`：移动到行首/行尾。
- `Shift+Home` / `Shift+End`：选择到行首/行尾。
- `Backspace` / `Delete`：有选区则删除选区，否则删除相邻字符。
- `Option/Alt+Backspace` / `Option/Alt+Delete`：按词删除。
- `Cmd+A` / `Ctrl+A`：选择当前输入行。
- `Cmd+C` / `Ctrl+C`：有选区时复制选区；无选区时交给终端原生中断行为。
- `Cmd+X` / `Ctrl+X`：有选区时剪切选区；无选区时 passthrough。
- `Cmd+V` / `Ctrl+V`：粘贴纯文本替换选区；含换行时 passthrough。
- `Cmd+Z` / `Ctrl+Z`：撤销当前输入行编辑；没有可撤销编辑时 passthrough。
- `Shift+Cmd+Z` / `Shift+Ctrl+Z` / `Ctrl+Y`：重做。
- `Escape`：有选区时清除选区；无选区时 passthrough。

复制/剪切使用浏览器 Clipboard API。Clipboard API 不可用或失败时，对应操作失败但不影响普通终端输入。

## 可视化

选区高亮必须只覆盖当前输入行的输入文本，不覆盖 prompt 或终端历史输出。

实现可以优先使用 xterm decoration 或一个绝对定位 overlay。第一版选择应以稳定命中和低侵入为准：

- 如果 xterm decoration 能满足当前行局部高亮，优先复用 xterm 能力。
- 如果 decoration 对输入文本范围不够稳定，则在 `TerminalSessionView` 内维护一层只读 overlay。
- overlay 不参与布局，不影响 xterm 尺寸适配，不拦截非当前输入行的鼠标事件。

## 错误处理与隐私

- 不记录当前输入文本到日志。
- 不写入 settings、session persistence、测试 snapshot 或 terminal summary。
- 剪贴板读取失败时只取消当前 copy/cut/paste 操作。
- 重绘序列发送失败时回退原生输入。
- 不在 viewer/unowned session 上启用。
- 不对含换行粘贴做部分处理，避免意外提交多条命令。
- 所有失败模式都应退化为 xterm 原生终端，而不是继续维护可疑缓冲。

## 测试计划

模型测试：

- 插入字符、移动光标、选择、替换、删除。
- Backspace/Delete 删除选区和相邻字符。
- 按词移动、按词选择、按词删除。
- 行首/行尾移动和选择。
- 全选当前输入行。
- 撤销/重做编辑栈。
- Enter 提交后清空输入状态。
- 含换行粘贴 passthrough。

键盘映射测试：

- macOS `Cmd` 系列快捷键。
- Windows/Linux `Ctrl` 系列快捷键。
- `Shift+Arrow`、`Shift+Alt/Option+Arrow`、`Home/End`。
- 无选区时 `Ctrl+C`、`Ctrl+Z` 等终端语义 passthrough。
- 与现有 macOS Option Arrow 和 Safari Shift symbol workaround 的优先级。

集成测试：

- `TerminalSessionView` 在 controller/open 状态下启用增强输入。
- viewer/unowned 状态不启用。
- 搜索框聚焦时不接管。
- 选区删除/替换/撤销生成预期重绘序列。
- Enter 只发送一次最终命令。
- alt screen / 鼠标报告模式 / 不可信输出触发回退。

人工验收：

- 本地 macOS zsh 普通提示符。
- 至少一个远程 shell 普通提示符。
- 鼠标拖拽选择当前输入片段。
- 复制、剪切、删除、替换选区。
- 键盘扩展/收缩选区。
- 撤销/重做。
- 进入 `vim`、`less` 或类似 TUI 后增强输入不接管，xterm 原生输入可用。

验证命令：

```bash
bun run typecheck
bun run test src/web/components/terminal
bun run test
bun run check:architecture
```

## 范围检查

这是一个单一 renderer 交互增强。它复用现有终端 session、PTY 写入、readonly/viewer 状态和测试边界，不引入新后端协议，不改变远程 terminal/tmux 行为，不做输出区复制，也不尝试覆盖 REPL/TUI。

如果后续需要 REPL/TUI 或更准确的 shell 状态同步，应作为独立阶段设计 shell 集成协议，而不是扩展第一版轻量 line editor。
