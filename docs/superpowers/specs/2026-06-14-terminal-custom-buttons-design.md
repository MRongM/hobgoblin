# 终端自定义按钮栏设计

## 背景

用户需要在终端底部增加一个自定义按钮栏。每个按钮由设置里的 `label` 和 `value` 配置。点击按钮后直接向当前终端会话发送对应 `value`，不经过额外输入框，也不把内容预填到输入控件。没有有效自定义按钮时，终端底部不显示按钮栏。

## 目标

- 在设置中配置终端自定义按钮列表。
- 每个按钮包含显示文本 `label` 和发送内容 `value`。
- 终端底部只在存在有效按钮时显示按钮栏。
- 点击按钮时调用当前终端会话的输入写入能力，发送 `value` 原文。
- 不自动追加回车；需要自动执行时由用户在 `value` 中显式配置换行。

## 非目标

- 不实现命令历史、按钮分组、排序拖拽、图标、快捷键绑定或变量模板。
- 不改变 xterm 内部输入模型。
- 不改变移动端现有终端工具栏行为，只在可控制终端上附加自定义按钮。

## 数据模型

在 `SettingsPrefs` 中增加：

```ts
terminalCustomButtons: TerminalCustomButton[]

interface TerminalCustomButton {
  label: string
  value: string
}
```

默认值为 `[]`。

服务端 settings source 负责规范化持久化数据：

- 仅接受数组。
- 仅保留 `label` 和 `value` 都是非空字符串的条目。
- 对 `label` 做 `trim` 后保存。
- `value` 按用户配置原样保存；仅用 `value.trim().length > 0` 判断是否有效，避免破坏前后空格或显式换行。
- 固定最多保存 20 个按钮，避免异常配置影响 UI。

## 设置 UI

在设置界面增加独立的“终端”设置页，并在其中提供“自定义按钮”分组。这样可以避免把内置终端按钮配置混入“应用”页的外部 Terminal.app/Ghostty 偏好。优先复用现有 Settings primitives 和写入路径：

- 每一行包含 `label` 输入框、`value` 文本控件和删除按钮。
- `value` 控件必须允许输入或粘贴换行，以支持用户显式配置自动执行内容。
- 提供“添加”按钮新增空行。
- 空行在本地编辑时可存在，但持久化时只保存有效条目。
- 修改后通过 settings 写入路径保存，并更新 runtime settings cache。

## 终端 UI

`TerminalSlot` 读取运行时设置里的 `terminalCustomButtons`。

按钮栏显示条件：

- 当前 worktree 有终端会话。
- 当前会话 phase 为 `open`。
- 当前 attachment role 为 `controller`。
- 有至少一个有效按钮。

按钮栏行为：

- 渲染在终端槽底部，作为独立底部浮层。
- 横向排列，宽度不足时横向滚动。
- 按钮栏显示时为终端内容预留底部间距，避免遮挡最后一行输入或输出。
- 每个按钮显示 `label`，`title` 或 tooltip 使用 `value`，便于查看实际发送内容。
- 点击按钮时调用 `writeInput(key, button.value)`。
- 不修改搜索浮层、只读覆盖层、拖拽文件路径写入逻辑。

## 错误处理

- 设置保存失败时沿用现有 settings controller 的失败日志路径，不新增全局错误系统。
- 终端不可写、无 key 或只读会话时不显示按钮栏，避免点击后静默失败。
- 服务端规范化过滤非法配置，保证运行时只消费安全形态的数据。

## 测试与验证

- 更新 settings 默认值和 snapshot 测试，确认 `terminalCustomButtons` 进入 runtime settings。
- 为服务端 settings source 增加规范化测试，覆盖非数组、空 label/value、过多条目。
- 为 web settings 写入路径增加 cache 更新测试。
- 为 `TerminalSlot` 增加组件测试，确认：
  - 无按钮时不渲染按钮栏。
  - 有按钮且会话可控制时渲染按钮。
  - 点击按钮调用 `writeInput(key, value)`。
  - 只读会话不渲染按钮栏。
- 验证命令：`bun run typecheck`、相关测试；必要时运行 `bun run test`。
