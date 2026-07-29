# Terminal Mixed-Width Clipping Design

## 背景

终端在中英文混排长行发生换行时，最右侧约两列可能不可见。该问题在普通 shell 历史行和全屏 TUI 中都可能出现，拖动左右布局中的终端/分支分隔线后仍会持续复现。

已确认的诊断证据：

- `stty size` 报告终端为 160 列。
- 184 列的混排回归文本应在第一行末尾显示“空格 + `w`”，第二行从 `orktree` 开始。
- 实际视觉上第一行末尾的“空格 + `w`”不可见，但复制结果包含完整字符。
- 纯中文、纯 ASCII 以及简单边界测试正常。
- 把回归文本中每个双宽字符替换为两个 ASCII 字符、保持总列数和换行边界不变后，最右侧内容完整可见。

因此问题不是 PTY 数据丢失、Unicode 标点列宽错误或固定的容器裁切。当前实现使用 xterm 6 的 DOM renderer；终端字体栈由系统等宽字体渲染 ASCII，并由系统回退字体渲染中文。结合代码路径和对照结果，根因判断为混合字体 glyph 度量与 DOM renderer 的 letter-spacing/span 布局产生累计误差，最终内容被 xterm 行容器裁切。

## 目标

- 中英文、Markdown 标记、反引号和中文标点混排时，终端最右侧内容完整可见。
- 普通 shell 与 alternate-screen TUI 使用相同的准确列数。
- 拖动左右布局分隔线后，终端重新 fit 不引入裁切或提前换行。
- 保持 PTY、scrollback、输入、输出和 session 生命周期不变。

## 非目标

- 不修改终端传输协议或服务端 PTY 实现。
- 不引入 WebGL/Canvas renderer 或新的 xterm 依赖。
- 不增加终端字体设置或字体扫描能力。
- 不修改应用普通 UI 的全局字体选择行为。
- 不通过额外 refresh、重建 session 或清空历史缓解问题。

## 方案比较

### 方案 A：终端固定使用 Maple Mono NF CN（采用）

仓库已经内置并注册 `Maple Mono NF CN` 的常规、斜体、粗体和粗斜体资源。终端内容统一使用这套同时覆盖拉丁字符与中文的等宽字体，可避免系统字体回退造成的混合度量，不新增运行时依赖。

代价是终端 ASCII 字形不再跟随应用全局字体选择。终端 cell 几何正确性优先于普通 UI 字体偏好，该取舍已确认。

### 方案 B：引入 WebGL/Canvas renderer

图形 renderer 可以避开当前 DOM span 布局路径，但需要新增精确版本依赖、处理 context loss 和 renderer 回退，并扩大测试面。当前问题可以由已有字体资源解决，因此不采用。

### 方案 C：固定减少终端列数

通过预留一到两列可隐藏部分边界症状，但会让 PTY 列数与真实可用宽度不一致，导致 TUI 提前换行。它也无法证明混合字体布局不再溢出，因此不采用。

## 设计

### 终端字体所有权

终端使用一个明确、稳定的字体常量：

```ts
"'Maple Mono NF CN', monospace"
```

该常量继续由终端几何模块提供，`TerminalSessionRegistry`、`ManagedTerminalSession` 和 `TerminalSessionView` 的既有构造路径继续复用它。初始 cell 测量和 xterm `fontFamily` 必须使用同一个值，避免测量字体与渲染字体分离。

终端字体不再投影应用全局字体偏好。现有字号设置、字体加载完成后的 refit，以及 `setFontFamily` 内部能力可以保留，避免扩大本次变更；运行时默认与产品行为固定为 Maple Mono NF CN。

### 删除 alternate-screen 列数补偿

删除 `ALTERNATE_SCREEN_SAFE_COLUMNS`、`fittedColumns()` 以及 buffer 切换时为 alternate screen 单独减两列的行为。

`fitSoon()` 直接比较 `FitAddon.proposeDimensions()` 返回的列数和行数。`fitNow()` 对普通 buffer 和 alternate buffer 都调用 `fitAddon.fit()`。xterm resize 事件继续通过现有 debounce 同步给 PTY。

这样普通 shell 和全屏 TUI 在同一容器尺寸下具有相同列数，分栏拖动只产生一套尺寸语义。

### 数据流与错误处理

数据流保持不变：

1. `ResizeObserver` 发现终端宿主尺寸变化。
2. `fitSoon()` 合并重复变化。
3. `fitNow()` 通过 `FitAddon` 计算并应用完整尺寸。
4. xterm `onResize` 把新列数和行数同步给现有 PTY session。

字体资源继续使用现有 `@font-face` 和 `document.fonts` 观察逻辑。字体尚未完成加载时，xterm 可以先创建；字体 ready/loadingdone 后沿用现有 debounce refit。加载失败时保留 `monospace` fallback，不新增阻塞错误或 session 重启。

## 测试

按 TDD 添加或调整以下测试：

- 默认终端字体常量以 `Maple Mono NF CN` 开头，不再以 `ui-monospace` 开头。
- 新建 xterm 时 `fontFamily` 使用固定 Maple 字体常量。
- 初始终端几何测量使用同一个固定字体常量。
- alternate screen 激活后仍采用 `FitAddon` 提议的完整列数，不再从 100 减到 98。
- 从 alternate screen 返回普通 buffer 不产生第二套列数规则。
- 保留 160 列人工回归文本：

```text
- **worktree 依赖选择：** 创建 worktree 前，选择源 worktree 根目录下未跟踪的文件或目录，并复制或符号链接到新 worktree。
```

DOM 单元测试不能可靠复现浏览器字体 glyph 裁切，因此不伪造像素断言。人工 UAT 在 160 列下确认第一行末尾的“空格 + `w`”可见，并在拖动左右分隔线后重复验证普通 shell 和全屏 TUI。

完整验证命令：

```sh
bun run typecheck
bun run test
bun run check:architecture
```

## 验收标准

- 160 列回归文本第一行末尾完整显示“空格 + `w`”。
- 复制内容与可见内容一致，不再有右侧不可见字符。
- 普通 shell 和 alternate-screen TUI 的列数均等于 `FitAddon` 提议值。
- 左右布局拖动后上述行为保持不变。
- 未新增依赖，未修改 PTY 或 session 协议。
- 定向测试、类型检查、完整测试和架构检查通过。

## 原则应用

- KISS：使用已有完整字形字体，删除补偿分支。
- YAGNI：不引入新的 renderer、设置或协议字段。
- DRY：字体测量和 xterm 渲染继续共享同一常量。
- SOLID：字体与 fit 行为保持在终端 view/geometry 边界内，不污染 session 与服务端职责。
