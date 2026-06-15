# 终端外部输入框与按钮动作设计

## 背景

上一版尝试在 xterm 原生终端内部增强当前输入行的字符操作能力，包括选择、复制、编辑、删除和撤销。这条路径没有在原生终端内稳定生效，也容易和 shell、REPL、TUI、xterm 隐藏 textarea 以及终端鼠标模式互相干扰。

本设计放弃“原生终端内部字符操作接管”，改为在终端外部提供一个浏览器原生单行输入框。普通 input 已内建选择、复制、剪切、编辑、删除、撤销和重做能力；终端本体仍保留原生 xterm 输入，不影响 vim、less、REPL 等交互程序。

需要保留的范围是终端显示与辅助 UI 优化，例如搜索浮层、viewer overlay、进度条、拖拽文件路径、自定义按钮底部浮层和终端内容底部预留空间。本次只替换输入增强路径，不回退这些显示功能。

## 已确认决策

- 外部输入框通过 `设置 -> 终端` 开关启用，默认关闭。
- 开启外部输入框后，原生终端仍可点击聚焦和直接输入。
- 外部输入框为单行 input，Enter 发送 `内容 + \r` 到当前终端并清空。
- 自定义按钮栏悬浮在输入框上方，不包裹在 input 内。
- 自定义按钮支持统一显示/隐藏开关，默认显示。
- 每个按钮单独配置动作模式：
  - `execute`：直接发送到终端并执行，默认模式。
  - `input`：填入外部输入框，用户编辑后再 Enter 发送。
- 旧按钮没有动作字段时按 `execute` 处理。

## 目标

- 在终端底部提供可开关的外部单行输入框。
- 利用浏览器 input 原生能力提供选择、复制、编辑、删除、撤销等输入体验。
- 不接管 xterm 内部当前输入行字符处理。
- 保留 xterm 原生输入能力，避免破坏 TUI/REPL/全屏程序。
- 在设置页增加外部输入框开关和自定义按钮显示开关。
- 扩展自定义按钮，使单个按钮可选择“直接执行”或“填入输入框”。
- 保持旧设置数据兼容，已有按钮默认直接执行。

## 非目标

- 不实现多行编辑器、命令历史搜索、自动补全、粘贴预览或脚本编辑器。
- 不增强终端历史输出区选择/复制。
- 不新增 PTY/server 协议。
- 不持久化外部输入框草稿。
- 不为按钮实现分组、拖拽排序、图标、快捷键绑定或变量模板。
- 不在外部输入框关闭时弹出临时输入框。

## 方案比较

### 方案 A：底部外部命令栏 + 上方悬浮按钮

终端底部显示单行 input，自定义按钮栏独立悬浮在 input 上方。按钮可直接执行，也可填入 input。原生终端输入保持可用。

优点：

- 满足输入增强需求，不依赖 xterm 内部字符处理。
- 按钮与 input 空间关系清晰，不把按钮塞进 input。
- 对 TUI/REPL 风险最低。
- 与当前 `TerminalSlot` 底部浮层模式一致。

代价：

- 终端底部需要为 input 和按钮统一预留空间。
- 页面高度较小时会占用一部分终端显示区域。

### 方案 B：底部统一 dock

input 和按钮放在一个底部容器内上下排列。布局稳定，但按钮视觉上不是“悬浮在输入框上方”，与确认方向不一致。

### 方案 C：快捷键弹出输入框

平时不占底部空间，快捷键打开输入框。占用空间少，但不是常驻输入框，和用户要求的设置开关启用方式不一致。

## 推荐方案

采用方案 A。

这是最小风险路径：外部 input 负责字符编辑，xterm 继续负责终端交互。实现上只需要扩展 settings、`TerminalSlot` 布局和按钮行为，不再维护 xterm 当前行输入模型、字符坐标映射、鼠标选区 overlay 或本地撤销栈。

## 数据模型

`SettingsPrefs` 增加两个布尔字段：

```ts
terminalExternalInputEnabled: boolean
terminalCustomButtonsVisible: boolean
```

默认值：

```ts
terminalExternalInputEnabled: false
terminalCustomButtonsVisible: true
```

`TerminalCustomButton` 扩展为：

```ts
type TerminalCustomButtonAction = 'execute' | 'input'

interface TerminalCustomButton {
  label: string
  value: string
  action?: TerminalCustomButtonAction
}
```

`action` 可选是为了兼容旧数据。运行时和服务端归一化都必须把缺省或非法 `action` 当作 `'execute'`。

服务端 settings source 负责规范化：

- 仅接受数组。
- 仅保留 `label` 和 `value` 都是字符串，且 `label.trim()` 与 `value.trim()` 非空的条目。
- `label` trim 后保存。
- `value` 原样保存，不裁剪前后空格或换行。
- `action` 仅接受 `'execute'` 或 `'input'`；其他值规范化为显式 `'execute'`。
- 最多保存 20 个按钮。

## 设置 UI

`TerminalSettings` 调整为两个分组。

### 终端输入

包含 `外部输入框` 开关：

- 开启：终端 controller/open 状态下显示底部 input。
- 关闭：不显示 input，终端维持原生输入。

### 自定义按钮

包含：

- `显示自定义按钮` 开关。
- 按钮列表。
- 每个按钮的 `label` 输入框。
- 每个按钮的 `value` 多行文本控件，继续允许粘贴换行。
- 每个按钮的动作模式选择：
  - `直接执行`
  - `填入输入框`
- 添加、删除、保存按钮沿用现有设置页行为。

显示开关只控制终端里按钮栏是否渲染，不删除按钮配置。

## 终端 UI

`TerminalSlot` 读取运行时设置：

- `terminalExternalInputEnabled`
- `terminalCustomButtonsVisible`
- `terminalCustomButtons`

显示条件：

- 只有当前 session phase 为 `open` 且 attachment role 为 `controller` 时显示输入能力。
- viewer/unowned 状态不显示外部 input 和按钮栏。
- 没有有效按钮时不显示按钮栏。
- `terminalCustomButtonsVisible === false` 时不显示按钮栏。

外部输入框行为：

- 单行 input 固定在终端底部。
- input 草稿只存在于 React 本地状态，不写入 settings 或 session snapshot。
- Enter：
  - `draft.trim().length === 0` 时不发送。
  - 非空内容发送 `${draft}\r`，保留用户输入的原始前后空格。
  - 发送后清空草稿。
- 第一版不为 Escape 增加自定义行为，保持浏览器默认行为。
- input 聚焦时不影响 xterm 搜索快捷键以外的全局终端输入；用户点击 xterm 主体后仍可直接在终端内输入。

按钮栏行为：

- 按钮栏是独立浮层，位于 input 上方。
- 外部 input 关闭但按钮栏开启时，按钮栏仍在终端底部显示，保持现有用法。
- 外部 input 开启且按钮栏开启时，按钮栏上移，不遮挡 input。
- `execute` 按钮点击后发送 `${button.value}\r`。
- `input` 按钮点击后：
  - 若外部 input 开启，把 `button.value` 写入 input 并聚焦 input。
  - 若外部 input 关闭，按钮禁用，并通过 `title` 或 tooltip 提示需要开启外部输入框。
- 按钮 `title` 显示实际内容，便于查看会发送或填入的文本。

底部布局：

- 用一个统一 bottom dock/zone 管理 input 和按钮栏。
- 终端 xterm frame 根据 dock 内容预留底部 padding，避免最后一行被遮挡。
- 不再只依赖 `.goblin-terminal-slot:has(.goblin-terminal-custom-buttons)` 这一个条件；要覆盖 input-only、buttons-only、input+buttons 三种状态。
- 移动端宽度不足时按钮横向滚动，input 保持单行。

## 实现边界

保留：

- 搜索浮层。
- viewer/unowned overlay。
- 进度条。
- 拖拽路径写入。
- 移动端工具栏。
- 自定义按钮浮层显示能力。
- 终端内容底部预留空间。

移除或停用：

- xterm 当前输入行字符操作 controller。
- xterm 内鼠标选区到字符 index 的映射。
- xterm 当前行输入 overlay。
- 用本地缓冲重绘 shell 当前输入行的逻辑。
- `TerminalSessionView` 中只为原生字符操作接管服务的 attach handler 或 keyboard hook。

可以复用的部分：

- 如果上一版已有纯文本编辑模型测试，只有在它能直接服务外部 input 时才保留；否则删除，避免保留未使用抽象。
- 设置页和 runtime settings 的写入模式沿用现有 custom buttons 路径。

## 组件职责

### `TerminalExternalInput`

新增小组件，职责单一：

- 渲染单行 input。
- 作为受控组件接收 `value`、`onChange`、`onSubmit`。
- 接收 `inputRef`，由 `TerminalSlot` 在按钮填入 input 时聚焦。
- Enter 调用 `onSubmit(value)`。
- 不读取 xterm buffer，不关心 session lifecycle。

### `TerminalCustomButtonsBar`

可以从 `TerminalSlot` 内拆出，职责：

- 过滤有效按钮。
- 根据 action 渲染可点击或禁用状态。
- 点击后调用 `onExecute(value)` 或 `onFillInput(value)`。

若拆分会导致过度设计，可先在 `TerminalSlot` 内实现，测试复杂后再提取。第一版优先保持代码简单。

### `TerminalSlot`

负责状态编排：

- 判断当前 session 是否可输入。
- 读取 runtime settings。
- 维护外部 input draft 或填入回调。
- 调用 `writeInput(key, value)`。
- 控制 bottom dock 布局 class。

## 兼容与迁移

- 旧设置没有 `terminalExternalInputEnabled` 时按 `false`。
- 旧设置没有 `terminalCustomButtonsVisible` 时按 `true`。
- 旧按钮没有 `action` 时按 `execute`。
- 旧按钮在设置页打开后保存时写入显式 `action: 'execute'`；runtime 仍必须兼容省略字段。
- 不迁移或持久化外部输入框草稿。

## 错误处理

- 没有 terminal key、非 controller、viewer/unowned 时不显示输入能力，避免点击后静默失败。
- 设置保存失败沿用现有 settings controller 错误路径。
- input 模式按钮在外部 input 关闭时禁用，不尝试隐式发送或临时显示 input。
- `writeInput` 调用保持现有路径，不新增错误提示系统。

## 测试计划

Settings/server：

- 默认 settings 包含 `terminalExternalInputEnabled: false` 和 `terminalCustomButtonsVisible: true`。
- settings snapshot/read projection/write paths/runtime cache 覆盖两个新开关。
- server settings source 归一化按钮 `action`，非法值回落到 `execute`。
- 旧按钮 `{ label, value }` 仍被接受。
- 按钮数量仍限制为 20。

Settings UI：

- 终端设置页显示外部输入框开关。
- 终端设置页显示自定义按钮显示开关。
- 新增按钮默认 action 为 `execute`。
- 可把单个按钮切换为 `input` 并保存。

Terminal UI：

- 外部输入框开关关闭时不显示 input。
- 外部输入框开关开启且 session 可控制时显示 input。
- viewer/unowned 状态不显示 input 或按钮栏。
- Enter 发送 `${draft}\r` 并清空。
- 空 draft Enter 不发送。
- `execute` 按钮发送 `${value}\r`。
- `input` 按钮在外部 input 开启时填入 input 并聚焦。
- `input` 按钮在外部 input 关闭时禁用。
- 按钮显示开关关闭时隐藏按钮栏但不影响 input。
- input-only、buttons-only、input+buttons 三种布局都不会遮挡终端底部内容。

回归验证：

- 不再启用 xterm 原生字符操作接管。
- 终端搜索、拖拽文件路径写入、移动端工具栏、viewer overlay 仍可用。

验证命令：

```bash
bun run typecheck
bun run test src/web/components/terminal
bun run test src/web/components/SettingsSurface.test.tsx
bun run test src/server/modules/settings-source.test.ts
bun run test src/web/settings-write-paths.test.ts
bun run test
```

## 验收标准

- 用户在设置中开启外部输入框后，终端底部出现单行输入框。
- 用户可在外部输入框中正常选择、复制、编辑、删除和撤销文本。
- 按 Enter 后命令发送到当前终端并执行。
- 用户仍可点击终端主体并使用 xterm 原生输入。
- 自定义按钮可统一隐藏/显示。
- 单个按钮可设置为直接执行或填入输入框。
- 旧按钮配置不丢失，默认直接执行。
- 已有终端显示优化不被回退。
