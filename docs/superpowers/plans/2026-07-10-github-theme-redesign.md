# GitHub Theme Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 GitHub 主题实现为已批准的 Enterprise Graphite 视觉系统，并让 Windows/Linux 原生标题栏与 Web topbar 保持一致。

**Architecture:** 继续以 `github.css` 作为 Web 主题 token 的唯一来源；共享层只保存 Electron 在 renderer CSS 加载前所需的窗口背景与 topbar 背景。主进程通过共享映射解析 overlay 背景，并根据解析后的明暗模式选择图标颜色，避免在 Electron 层复制主题判断。

**Tech Stack:** TypeScript、CSS custom properties、Electron `TitleBarOverlayOptions`、Vitest、Bun

---

## 文件结构

- Modify: `src/web/theme/themes/github.css` — GitHub 浅色、深色主题 token。
- Modify: `src/web/theme/theme-presets.test.ts` — GitHub token 与对比度契约测试。
- Modify: `src/shared/theme-tokens.ts` — renderer 启动前可用的主题窗口与 topbar 背景映射。
- Modify: `src/main/window-chrome.ts` — Windows/Linux 原生标题栏 overlay 颜色解析。
- Modify: `src/main/window-chrome.test.ts` — overlay 在 GitHub 明暗模式下的行为测试。

## Task 1: 锁定 GitHub Web 主题视觉契约

**Files:**
- Modify: `src/web/theme/theme-presets.test.ts`
- Test: `src/web/theme/theme-presets.test.ts`

- [ ] **Step 1: 写入失败的 GitHub token 测试**

在现有 theme preset 测试组中增加一个专门测试，复用文件已有的 `readThemeCss`、`selectorBlock`、`expectTokenValues` 与 `expectContrastAtLeast` helpers：

```ts
test('keeps GitHub aligned with the Enterprise Graphite design', () => {
  const css = readThemeCss('github')
  const light = selectorBlock(css, 'github', 'light')
  const dark = selectorBlock(css, 'github', 'dark')

  expectTokenValues(light, {
    '--goblin-surface-canvas': '#ffffff',
    '--goblin-surface-base': '#f6f8fa',
    '--goblin-surface-raised': '#ffffff',
    '--goblin-surface-hover': '#f3f4f6',
    '--goblin-action-primary': '#1f883d',
    '--goblin-accent': '#1a7f37',
    '--goblin-accent-text': '#116329',
    '--goblin-accent-rgb': '26 127 55',
    '--goblin-topbar-bg': '#f6f8fa',
    '--goblin-topbar-border': '#d0d7de',
    '--goblin-topbar-fg': '#1f2328',
    '--goblin-topbar-muted-fg': '#59636e',
    '--goblin-topbar-control-bg': '#ffffff',
    '--goblin-topbar-control-hover-bg': '#f3f4f6',
    '--goblin-topbar-control-border': '#afb8c1',
    '--goblin-topbar-control-fg': '#1f2328',
    '--goblin-toolbar-bg': '#ffffff',
    '--goblin-sidebar-bg': '#f6f8fa',
    '--goblin-list-row-selected-bg': '#dafbe1',
    '--goblin-list-row-selected-fg': '#116329',
  })

  expectTokenValues(dark, {
    '--goblin-surface-canvas': '#0d1117',
    '--goblin-surface-base': '#161b22',
    '--goblin-surface-raised': '#161b22',
    '--goblin-surface-hover': '#21262d',
    '--goblin-action-primary': '#238636',
    '--goblin-accent': '#3fb950',
    '--goblin-accent-text': '#7ee787',
    '--goblin-accent-rgb': '63 185 80',
    '--goblin-topbar-bg': '#161b22',
    '--goblin-topbar-border': '#30363d',
    '--goblin-topbar-fg': '#e6edf3',
    '--goblin-topbar-muted-fg': '#8b949e',
    '--goblin-topbar-control-bg': '#21262d',
    '--goblin-topbar-control-hover-bg': '#30363d',
    '--goblin-topbar-control-border': '#484f58',
    '--goblin-topbar-control-fg': '#e6edf3',
    '--goblin-toolbar-bg': '#161b22',
    '--goblin-sidebar-bg': '#161b22',
    '--goblin-list-row-selected-bg': 'rgb(var(--goblin-accent-rgb) / 0.17)',
    '--goblin-list-row-selected-fg': '#7ee787',
  })

  for (const block of [light, dark]) {
    expectContrastAtLeast(block, '--goblin-topbar-fg', '--goblin-topbar-bg')
    expectContrastAtLeast(block, '--goblin-topbar-muted-fg', '--goblin-topbar-bg')
    expectContrastAtLeast(block, '--goblin-topbar-control-fg', '--goblin-topbar-control-bg')
    expectContrastAtLeast(block, '--goblin-action-primary-foreground', '--goblin-action-primary')
  }
})
```

- [ ] **Step 2: 运行定向测试并确认 RED**

Run:

```bash
bun run test src/web/theme/theme-presets.test.ts
```

Expected: FAIL。浅色 `--goblin-topbar-bg` 当前为 `#86efac`，深色为 `#061410`，选中行 token 也不符合新契约。

## Task 2: 实现 GitHub Enterprise Graphite Web token

**Files:**
- Modify: `src/web/theme/themes/github.css`
- Test: `src/web/theme/theme-presets.test.ts`

- [ ] **Step 1: 修改浅色 GitHub chrome 与选择 token**

将浅色 selector 中对应 token 更新为：

```css
--goblin-accent-text: #116329;

--goblin-topbar-bg: #f6f8fa;
--goblin-topbar-border: #d0d7de;
--goblin-topbar-fg: #1f2328;
--goblin-topbar-muted-fg: #59636e;
--goblin-topbar-control-bg: #ffffff;
--goblin-topbar-control-hover-bg: #f3f4f6;
--goblin-topbar-control-border: #afb8c1;
--goblin-topbar-control-fg: #1f2328;
--goblin-toolbar-bg: #ffffff;
--goblin-list-row-selected-bg: #dafbe1;
--goblin-list-row-selected-fg: #116329;
```

- [ ] **Step 2: 修改深色 GitHub chrome 与选择 token**

将深色 selector 中对应 token 更新为：

```css
--goblin-accent-text: #7ee787;

--goblin-topbar-bg: #161b22;
--goblin-topbar-border: #30363d;
--goblin-topbar-fg: #e6edf3;
--goblin-topbar-muted-fg: #8b949e;
--goblin-topbar-control-bg: #21262d;
--goblin-topbar-control-hover-bg: #30363d;
--goblin-topbar-control-border: #484f58;
--goblin-topbar-control-fg: #e6edf3;
--goblin-toolbar-bg: #161b22;
--goblin-list-row-selected-bg: rgb(var(--goblin-accent-rgb) / 0.17);
--goblin-list-row-selected-fg: #7ee787;
```

- [ ] **Step 3: 运行定向测试并确认 GREEN**

Run:

```bash
bun run test src/web/theme/theme-presets.test.ts
```

Expected: PASS，且现有所有主题的 token 完整性和对比度检查保持通过。

- [ ] **Step 4: 经用户危险操作确认后提交 Web 主题变更**

```bash
git add "src/web/theme/themes/github.css" "src/web/theme/theme-presets.test.ts"
git commit -m "feat(theme): redesign GitHub color preset"
```

## Task 3: 锁定原生 GitHub topbar 映射行为

**Files:**
- Modify: `src/main/window-chrome.test.ts`
- Test: `src/main/window-chrome.test.ts`

- [ ] **Step 1: 写入失败的 GitHub overlay 测试**

在 Windows overlay 测试附近增加：

```ts
test('matches GitHub title bar overlays to the web topbar', () => {
  setPlatform('win32')

  expect(titleBarOverlayForTheme('light', 'github', WINDOW_TOPBAR_HEIGHT_PX)).toEqual({
    color: '#f6f8fa',
    symbolColor: '#000000',
    height: 34,
  })
  expect(titleBarOverlayForTheme('dark', 'github', WINDOW_TOPBAR_HEIGHT_PX)).toEqual({
    color: '#161b22',
    symbolColor: '#ffffff',
    height: 34,
  })
})
```

- [ ] **Step 2: 运行定向测试并确认 RED**

Run:

```bash
bun run test src/main/window-chrome.test.ts
```

Expected: FAIL。当前 overlay 从 `WINDOW_BACKGROUND_BY_COLOR_THEME` 读取 canvas，因此分别返回 `#ffffff` 与 `#0d1117`。

## Task 4: 实现共享 topbar token 与 Electron overlay

**Files:**
- Modify: `src/shared/theme-tokens.ts`
- Modify: `src/main/window-chrome.ts`
- Test: `src/main/window-chrome.test.ts`

- [ ] **Step 1: 添加共享 topbar 背景映射**

在 `src/shared/theme-tokens.ts` 中新增与现有窗口背景映射同类型的常量。所有主题先保持当前 canvas 映射值，GitHub 使用新 topbar 值：

```ts
export const TOPBAR_BACKGROUND_BY_COLOR_THEME: Record<ColorTheme, Record<ResolvedTheme, string>> = {
  ...WINDOW_BACKGROUND_BY_COLOR_THEME,
  github: {
    light: '#f6f8fa',
    dark: '#161b22',
  },
}
```

该浅拷贝只覆盖 GitHub 项，不引入按平台或组件维度的新抽象。

- [ ] **Step 2: 让原生 overlay 使用 topbar 映射**

更新 import 和颜色解析：

```ts
import { TOPBAR_BACKGROUND_BY_COLOR_THEME } from '#/shared/theme-tokens.ts'
```

```ts
const color = TOPBAR_BACKGROUND_BY_COLOR_THEME[colorTheme][theme]
```

保留现有 `theme === 'dark'` 图标色选择和 macOS early return。

- [ ] **Step 3: 运行原生 chrome 测试并确认 GREEN**

Run:

```bash
bun run test src/main/window-chrome.test.ts
```

Expected: PASS。GitHub overlay 与 Web topbar 对齐；macOS 仍返回 `undefined`；现有 macOS 交通灯测试不变。

- [ ] **Step 4: 经用户危险操作确认后提交原生 chrome 变更**

```bash
git add "src/shared/theme-tokens.ts" "src/main/window-chrome.ts" "src/main/window-chrome.test.ts"
git commit -m "feat(theme): sync GitHub native topbar colors"
```

## Task 5: 完整质量验证

**Files:**
- Verify: `src/web/theme/themes/github.css`
- Verify: `src/web/theme/theme-presets.test.ts`
- Verify: `src/shared/theme-tokens.ts`
- Verify: `src/main/window-chrome.ts`
- Verify: `src/main/window-chrome.test.ts`

- [ ] **Step 1: 类型检查**

Run:

```bash
bun run typecheck
```

Expected: PASS，无 TypeScript 错误。

- [ ] **Step 2: 完整测试**

Run:

```bash
bun run test
```

Expected: PASS，无失败测试。

- [ ] **Step 3: 架构边界检查**

Run:

```bash
bun run check:architecture
```

Expected: PASS。共享 token 不依赖 Electron，`src/main/**` 未导入 `src/web/**`。

- [ ] **Step 4: 视觉验收**

在应用中分别切换 GitHub 浅色和深色模式，确认：

- 浅色 topbar 为 `#f6f8fa`，深色 topbar 为 `#161b22`。
- Windows/Linux 原生窗口按钮区域与 Web topbar 无色带断层。
- active tab、当前分支、主操作和活动状态形成一致绿色语义链。
- 链接与提交哈希保持蓝色。
- 其他主题外观不变。

