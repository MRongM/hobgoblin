# GitHub 主题重设计

**日期：** 2026-07-10  
**状态：** 已批准，待实施

## 目标

将 Hobgoblin 的 GitHub 主题重设计为克制、工程化的 Enterprise Graphite 风格。主题应保留 GitHub Primer 的信息层级和辨识度，同时通过贯穿导航、分支选择、主操作与运行状态的绿色活动轨迹形成 Hobgoblin 自身的视觉身份。

## 设计原则

- 浅色与深色模式分别使用标准 GitHub 明暗表面，不依赖大面积品牌色建立主题身份。
- 绿色表达活动、成功、选择和主要操作；蓝色继续表达链接、提交哈希等可导航内容。
- 常规面板依靠背景明度和 1px 边框建立层级，阴影仅用于浮层。
- 不改变现有组件结构、信息密度、字体体系或交互模型。
- 仅修改 GitHub 主题，不影响其他颜色主题。

## 主题签名：绿色活动轨迹

绿色活动轨迹是本次重设计唯一的强视觉签名：

- active tab 使用绿色下划线和活动文字色。
- 当前分支或当前列表项使用淡绿色选中表面。
- 主操作使用实心绿色按钮。
- 成功状态、终端活动和活动指示点共享同一绿色语义家族。
- 普通链接与提交哈希保持 GitHub 蓝，避免绿色语义过载。

## 核心色板

| 角色 | 浅色模式 | 深色模式 |
| --- | --- | --- |
| 主操作 | `#1f883d` | `#238636` |
| 导航活动 | `#1a7f37` | `#3fb950` |
| 活动强调文字 | `#116329` | `#7ee787` |
| 链接 | `#0969da` | `#58a6ff` |
| Canvas | `#ffffff` | `#0d1117` |
| Chrome / Raised surface | `#f6f8fa` | `#161b22` |
| Hover surface | `#f3f4f6` | `#21262d` |
| 默认边框 | `#d0d7de` | `#30363d` |

## 浅色模式

- topbar 使用 `#f6f8fa`，文字使用 `#1f2328`，弱化文字使用 `#59636e`。
- topbar 控件使用白色背景、`#afb8c1` 边框和深色前景；hover 使用 `#f3f4f6`。
- toolbar 与主要内容使用白色，sidebar 使用 `#f6f8fa`。
- active tab 使用 `#1a7f37`；选中行使用 `#dafbe1`，选中文字使用 `#116329`。
- 主操作使用 `#1f883d`，前景为白色。
- Windows/Linux 原生标题栏 overlay 与 topbar 的 `#f6f8fa` 同步，原生图标使用深色。

## 深色模式

- canvas 使用标准 GitHub Dark 的 `#0d1117`。
- topbar、toolbar、sidebar 与 raised surface 使用 `#161b22`。
- hover surface 使用 `#21262d`，默认边框使用 `#30363d`，强边框使用 `#484f58`。
- active tab 使用 `#3fb950`；选中行使用绿色半透明表面，选中文字使用 `#7ee787`。
- 主操作使用 `#238636`，前景为白色。
- Windows/Linux 原生标题栏 overlay 与 topbar 的 `#161b22` 同步，原生图标使用浅色。

## 字体与形态

- 继续使用现有等宽字体栈：`SF Mono`、Menlo、Consolas 及兼容 fallback。
- 分支、提交哈希、路径和终端内容保持等宽表达。
- 控件圆角保持 Primer 风格的 6px 基准，不引入新的形态体系。
- 常规面板不增加阴影；浮层沿用现有主题阴影 token。

## 实现边界

实施仅涉及以下职责：

- 更新 `src/web/theme/themes/github.css` 中浅色和深色 GitHub token。
- 在共享主题 token 中声明各主题的原生 topbar 颜色，使 Electron 主进程不重复硬编码 GitHub 颜色。
- 调整 Windows/Linux 标题栏 overlay，使其使用对应主题和模式的 topbar 背景及正确的图标前景色。
- 更新 GitHub 主题 token 测试与原生标题栏 overlay 测试。

明确不包含：

- 组件结构、布局、信息密度或交互行为变更。
- 其他颜色主题调整。
- 终端 ANSI 色板调整。
- 新字体、图片、图标或第三方依赖。
- macOS 交通灯布局或行为变更。

## 验收标准

- GitHub 浅色主题使用自适应浅色 topbar，而非绿色 topbar。
- GitHub 深色主题使用标准 `#0d1117` canvas 和 `#161b22` chrome。
- active tab、选中行、主操作及活动状态形成一致的绿色语义链。
- 链接和提交哈希在两种模式中保持 GitHub 蓝色语义。
- Windows/Linux 原生标题栏与 Web topbar 无颜色断层，图标在两种模式中均具有清晰对比度。
- GitHub 主题关键文字、控件和状态满足现有主题测试的对比度约束。
- 其他主题及 macOS 原生 chrome 行为不变。

## 验证

实施完成后运行：

```bash
bun run typecheck
bun run test
bun run check:architecture
```

