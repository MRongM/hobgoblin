# 终端 Tab Bell 动画颜色与宽度设计

## 摘要

仅调整终端 Tab title 内的未读 bell 展示：让外层扩散动画在起始阶段使用与内层常驻圆点一致的主题 bell 颜色，并将终端 Tab 固定宽度从 112px 增加到 144px，以显示更多 `#number` 后的进程标题。

## 已确认决策

- 正确修改位置是终端 Tab title 内，不是分支列表。
- 外层 bell 扩散动画使用完整不透明度起始色，与内层圆点保持一致。
- 动画自身仍按现有 `animate-ping` 时序逐渐淡出。
- 仅终端 Tab 调用覆盖 ping 透明度。
- 终端下拉菜单和分支摘要保持现状。
- 终端 Tab 宽度采用推荐档：从 `w-28`（112px）调整为 `w-36`（144px）。
- 仓库 Tab 的宽度与行为不变。
- 不新增依赖、主题色值、状态或设置项。

## 当前结构

`TerminalTabs.tsx` 的 `TerminalTabChrome` 在 title 后渲染 `TerminalBellDot`。title 由 session display title 产生，通常以 `#number` 开头，例如 `#1 zsh`。

`TerminalBellDot` 包含两个视觉层：

- 外层 `data-terminal-bell-ping` 使用 `bg-terminal-bell opacity-75 animate-ping`；
- 内层 `data-terminal-bell-core` 使用 `bg-terminal-bell`。

两层已读取同一语义颜色，但外层额外的 `opacity-75` 使起始观感与内层圆点不同。

终端 Tab 的固定宽度由 `tab-variants.ts` 的 terminal variant 使用 `w-28` 控制。标题已有 `truncate`，Tab strip 已提供横向滚动与拖拽能力。

## 组件设计

为 `TerminalBellDot` 增加可选参数：

```ts
pingClassName?: string
```

该参数只追加到外层 ping 节点，并通过现有 `cn()` 合并 class。默认不传时，`opacity-75` 保持不变。

终端 Tab title 的调用传入：

```tsx
<TerminalBellDot label={t('terminal.bell-unread')} pingClassName="opacity-100" />
```

这会让终端 Tab 的外层动画以完整 bell 色开始，然后继续由 `animate-ping` 淡出。下拉菜单仍使用 `ping={false}`，分支摘要仍使用默认 `opacity-75`。

不为单一透明度差异增加专用 appearance variant，也不通过父容器 CSS 选择器覆盖内部节点。

## 宽度设计

在 `toolbarTabChromeClassName()` 中仅修改 terminal variant：

```text
w-28 → w-36
```

结果：

- 固定宽度从 112px 增至 144px；
- `#number` 后的进程标题获得额外 32px；
- 标题过长时继续使用现有省略号；
- 关闭按钮、拖拽、键盘导航和横向滚动不变；
- repo variant 的 `min-w-36 max-w-56` 保持不变。

## 数据流与主题响应

1. terminal session 继续产生 display title 与 `hasBell` 状态。
2. `TerminalTabChrome` 渲染 title 和 `TerminalBellDot`。
3. terminal Tab 调用通过 `pingClassName` 覆盖 ping 静态透明度。
4. ping 和 core 均读取 `bg-terminal-bell`。
5. 当前颜色主题或 Light/Dark 模式变化时，现有 CSS token 自动更新两层颜色。

不新增 React 状态、effect、持久化数据或主题条件分支。

## 容错与兼容性

- `pingClassName` 可选，现有调用默认行为不变。
- `ping={false}` 时不渲染外层节点，`pingClassName` 不产生副作用。
- 主题 bell token 缺失时继续使用现有 contract fallback。
- 宽度变更只影响 CSS class，不改变 Tab 数据或交互模型。
- 实现遵守 Node.js strip-only TypeScript 限制。

## 测试设计

### TerminalBellDot

- 默认 ping 保留 `opacity-75`。
- `pingClassName="opacity-100"` 时，合并结果包含 `opacity-100` 且不再包含 `opacity-75`。
- core 继续使用 `bg-terminal-bell`。
- `ping={false}` 行为保持不变。

### TerminalTabs

- 有未读 bell 的终端 Tab title 调用呈现 `opacity-100` ping。
- 下拉菜单的 `ping={false}` 行为不变。
- aria-label、title 文本、关闭按钮和 session 选择行为不变。

### Tab variants

- terminal variant 包含 `w-36` 且不包含 `w-28`。
- repo variant 继续包含现有宽度约束。

完整验证：

```bash
bun run typecheck
bun run test
bun run check:architecture
```

基线全量测试曾出现 `src/web/main-router.test.tsx` 的 15 秒超时；该问题发生在本需求实现之前。最终验证必须重新运行并如实区分是否复现。

## 验收标准

- 终端 Tab title 内 `#number` 后方的 bell 外层动画起始颜色与内层圆点一致。
- 动画继续扩散并淡出，尺寸与时序不变。
- 终端下拉菜单和分支摘要的 bell 展示不变。
- 终端 Tab 宽度为 144px，能显示更多 title 内容。
- 仓库 Tab 宽度及所有 Tab 交互行为不变。
- 聚焦测试、类型检查与架构检查通过；全量测试结果被完整记录。

## 预计改动文件

- `src/web/components/terminal/TerminalBellDot.tsx`
- `src/web/components/terminal/TerminalBellDot.test.tsx`
- `src/web/components/terminal/TerminalTabs.tsx`
- `src/web/components/terminal/TerminalTabs.test.tsx`
- `src/web/components/tab-strip/tab-variants.ts`
