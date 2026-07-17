# 主题专属 Unread Bell 圆点颜色设计

## 摘要

为全部九个内置颜色主题显式配置 Light/Dark unread terminal bell 圆点颜色。采用“主题次色谱”方向：每个主题从自身现有 ANSI、状态或辅助色板中选择与 terminal output activity 主色明显不同的次色，使九个主题覆盖洋红、青、绿、蓝、紫、蓝绿、红、金和翡翠色。

实现继续使用现有 CSS token 架构。React 组件、bell 状态、通知流程和主题状态均保持不变。

## 已确认决策

- 每个内置主题分别设置 Light/Dark bell 颜色。
- 采用“主题次色谱”，不再让大多数主题统一落在 warning 琥珀色域。
- bell 必须与 terminal output activity 使用不同的视觉色相。
- 每个主题 CSS 自己拥有完整的 `--goblin-terminal-bell*` token。
- `TerminalBellDot` API、尺寸、ping 动画和状态语义保持不变。
- 8px 常驻 core 圆点在实际承载表面上的最低非文本对比度为 3:1。
- ping 是装饰动画，不承担状态识别或对比度合规责任。
- 不新增依赖、TypeScript 色板、React 主题分支或运行时状态。
- 未获得用户明确确认前，不执行 git commit。

## 当前状态

`TerminalBellDot` 已让 ping 和 core 使用 `bg-terminal-bell`。`src/web/theme/contract.css` 已提供以下语义映射：

```css
--color-terminal-bell: var(--goblin-terminal-bell, var(--goblin-status-warning-text));
--color-terminal-bell-rgb: var(--goblin-terminal-bell-rgb, var(--goblin-status-warning-rgb));
--color-terminal-bell-surface: var(--goblin-terminal-bell-surface, var(--goblin-status-warning-surface));
--color-terminal-bell-border: var(--goblin-terminal-bell-border, var(--goblin-status-warning-border));
```

目前只有 Signal 和 Forge 在 Light/Dark 块中显式定义完整 bell token family。macOS、Mono、GitHub、Claude、Cursor、Airbnb 和 BMW 依赖 warning fallback，因此虽然颜色会随主题变化，但整体集中在相似的黄/琥珀色域，也没有逐主题的显式契约。

同一个 `TerminalBellDot` 被复用于 repo tab、terminal tab、terminal 下拉菜单和 branch/worktree summary。所有调用点应继续共享一个语义 token，不增加局部颜色分支。

## 目标

- 为 `macos`、`mono`、`github`、`claude`、`cursor`、`airbnb`、`bmw`、`signal`、`forge` 显式设置 Light/Dark bell token。
- 让不同主题的 unread bell 具有明显不同的综合色相。
- 保持 bell 与 output activity 在同一主题内可快速区分。
- 保持全局主题和项目级主题切换时的纯 CSS 自动更新。
- 通过测试锁定 token 完整性、精确色值、RGB 一致性和最低对比度。

## 非目标

- 不修改 bell 事件产生、记录、清除或聚合逻辑。
- 不修改系统通知、声音、Dock/taskbar 提示或通知权限。
- 不修改 `TerminalBellDot` 的尺寸、布局、ping 动画或无障碍文案。
- 不修改 terminal output activity 的颜色或时序。
- 不添加用户自定义颜色、主题编辑器或新的设置项。
- 不重构现有主题系统，不生成 CSS，不建立生产环境 palette table。
- 不修改 main、server、shared settings 或持久化数据结构。

## 色板

| 主题 | Light Hex | Light RGB | Light 最低对比度 | Dark Hex | Dark RGB | Dark 最低对比度 | 视觉关系 |
|---|---|---|---:|---|---|---:|---|
| macOS | `#AF52DE` | `175 82 222` | 3.21:1 | `#DA8FFF` | `218 143 255` | 4.47:1 | 蓝色 activity × 洋红 bell |
| Mono | `#0E7490` | `14 116 144` | 3.84:1 | `#22D3EE` | `34 211 238` | 5.64:1 | 黑白 activity × 青色 bell |
| GitHub | `#1A7F37` | `26 127 55` | 4.05:1 | `#3FB950` | `63 185 80` | 5.30:1 | 蓝色 activity × 绿色 bell |
| Claude | `#496F9F` | `73 111 159` | 3.99:1 | `#8BB8F0` | `139 184 240` | 5.17:1 | 陶土 activity × 蓝色 bell |
| Cursor | `#7C4AB0` | `124 74 176` | 4.73:1 | `#C59BE8` | `197 155 232` | 4.49:1 | 橙色 activity × 紫色 bell |
| Airbnb | `#007A87` | `0 122 135` | 3.95:1 | `#4BB7C5` | `75 183 197` | 4.23:1 | 粉红 activity × 蓝绿色 bell |
| BMW | `#C42116` | `196 33 22` | 4.70:1 | `#FF5A4D` | `255 90 77` | 3.80:1 | 蓝色 activity × 红色 bell |
| Signal | `#8A6400` | `138 100 0` | 4.20:1 | `#F0B84A` | `240 184 74` | 4.50:1 | 青绿 activity × 金色 bell |
| Forge | `#1F7A55` | `31 122 85` | 3.48:1 | `#79C79A` | `121 199 154` | 5.17:1 | 铜橙 activity × 翡翠 bell |

17/18 个主色直接复用各自主题现有的 ANSI、状态或辅助色。唯一新值是 Mono Light `#0E7490`：现有青色 `#0891B2` 在部分浅色承载表面上不足 3:1，因此压深后使用。

## Token 契约

每个 `src/web/theme/themes/<theme>.css` 的 Light/Dark selector block 都必须显式定义：

```css
--goblin-terminal-bell: <approved-hex>;
--goblin-terminal-bell-rgb: <approved-rgb>;
--goblin-terminal-bell-surface: rgb(var(--goblin-terminal-bell-rgb) / <surface-alpha>);
--goblin-terminal-bell-border: rgb(var(--goblin-terminal-bell-rgb) / 0.38);
```

派生规则：

- Light `surface-alpha` 为 `0.13`。
- Dark `surface-alpha` 为 `0.14`。
- Light/Dark border alpha 均为 `0.38`。
- Hex 与 RGB 必须表示同一颜色。

完整 token family 保证未来使用 bell surface 或 border 时不会意外回退到 warning 色。当前 `TerminalBellDot` 只消费主色，但 contract 的四个语义值必须保持内部一致。

`src/web/theme/contract.css` 保持不变。warning fallback 继续作为未知或不完整主题的运行时安全网；所有内置主题由测试保证不会依赖该 fallback。

## 架构与组件边界

主题 CSS 是 bell palette 的唯一生产环境来源：

- `src/web/theme/themes/macos.css`
- `src/web/theme/themes/mono.css`
- `src/web/theme/themes/github.css`
- `src/web/theme/themes/claude.css`
- `src/web/theme/themes/cursor.css`
- `src/web/theme/themes/airbnb.css`
- `src/web/theme/themes/bmw.css`
- `src/web/theme/themes/signal.css`
- `src/web/theme/themes/forge.css`

不新建集中式 indicator override stylesheet。这样主题颜色不会被拆分到第二个所有权位置，也不引入 import order 覆盖关系。

不修改 `TerminalBellDot.tsx`。组件继续用 `bg-terminal-bell` 同时渲染 ping 和 core，不导入或比较 `ColorTheme`。

## 数据流

1. 全局设置或项目级设置产生当前有效颜色主题。
2. `EffectiveProjectThemeBridge` 和现有主题 store 将 `data-color-theme`、`data-theme` 写入 document root。
3. 浏览器匹配对应主题的 Light/Dark CSS selector block。
4. `contract.css` 将 goblin foundation token 映射为 `--color-terminal-bell*`。
5. Tailwind `bg-terminal-bell` 读取语义主色。
6. 所有已渲染的 `TerminalBellDot` 通过 CSS 自动更新，不触发 bell 业务状态变化。

bell 状态链保持不变：xterm bell event → bell controller → terminal session registry → existing hooks → repo/terminal/branch UI。

## 容错

- 非法 persisted theme 继续由现有 `normalizeColorTheme()` 归一化为 `macos`。
- boot 阶段的非法 query theme 继续回退到共享默认主题。
- CSS token 缺失不会导致组件崩溃；contract 会回退到 warning token。
- 内置主题缺少 bell token 属于开发时契约错误，由测试失败阻止合入。
- 颜色修改不引入异步流程、网络错误或用户可见错误状态。

## 测试设计

### Token 完整性

更新 `src/web/theme/theme-presets.test.ts`：

- 将现有 `TERMINAL_INDICATOR_TOKENS` 拆分为 activity 与 bell 两个聚焦常量。
- activity token 的显式完整性检查继续只覆盖 `signal`/`forge`，不扩大本需求范围。
- bell token 的显式完整性检查覆盖全部 `COLOR_THEMES`。
- 对每个主题的 Light/Dark selector block 检查四个 `--goblin-terminal-bell*` token。

### 精确色值与 RGB

在测试文件中维护仅供断言使用的 `BELL_COLOR_EXPECTATIONS`：

- 锁定本设计表中的 18 个 Hex 与 RGB。
- 从 selector block 读取 `--goblin-terminal-bell` 和 `--goblin-terminal-bell-rgb` 后精确比较。
- 校验 surface alpha 与 border alpha 的模式规则。
- 该 test fixture 不是生产环境 palette source，不参与运行时主题解析。

现有 Signal/Forge 设计简报断言必须同步到新色值，避免与全主题 expectation 冲突。

### 对比度

在 `theme-presets.test.ts` 中添加测试专用的标准 sRGB 线性化和 WCAG contrast ratio helper，不新增依赖。

对每个主题和模式：

- 读取 bell Hex。
- 读取 bell 实际承载路径会使用的直接主题表面，包括 topbar、toolbar、tab hover、tab active、sidebar、pane、pane header、card 和 overlay。
- 针对已有透明 selected/hover 表面，使用对应 RGB/alpha 与其基础表面进行测试内合成后再计算。
- 断言常驻 core 与每个承载表面的对比度均不低于 3:1。
- 不对 `opacity-75` ping 作合规断言，因为它是非必要装饰。

### 组件契约

保留 `src/web/components/terminal/TerminalBellDot.test.tsx` 的现有断言：

- 默认渲染 ping。
- `ping={false}` 时只渲染 core。
- ping 和 core 使用 `bg-terminal-bell`。
- 不回退到 `bg-attention`。

组件行为没有变化，因此不增加按主题渲染 React 的测试。

## 验收标准

- 九个内置主题在 Light/Dark 下均显式定义完整 bell token family。
- unread bell 在主题之间形成已批准的次色谱，不再整体集中在琥珀色域。
- 同一主题中的 bell 与 terminal output activity 可明显区分。
- 所有常驻 8px core 圆点在实际承载表面上满足最低 3:1 对比度。
- repo tab、terminal tab、terminal 下拉菜单和 branch/worktree summary 自动共享新颜色。
- 全局主题和项目级主题切换不需要组件重渲染分支或新的状态同步。
- bell 状态、通知、动画、尺寸和布局没有行为变化。
- 不新增依赖，不违反架构分层规则。

## 验证命令

```bash
bun run typecheck
bun run test
bun run check:architecture
```

## 预计改动文件

- `src/web/theme/themes/macos.css`
- `src/web/theme/themes/mono.css`
- `src/web/theme/themes/github.css`
- `src/web/theme/themes/claude.css`
- `src/web/theme/themes/cursor.css`
- `src/web/theme/themes/airbnb.css`
- `src/web/theme/themes/bmw.css`
- `src/web/theme/themes/signal.css`
- `src/web/theme/themes/forge.css`
- `src/web/theme/theme-presets.test.ts`

不预计修改 `TerminalBellDot.tsx`、`contract.css`、共享主题 ID、settings、main 或 server 文件。
