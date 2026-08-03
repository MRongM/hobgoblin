# 菜单主题化滚动条实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Web/Desktop 的共享下拉菜单和右键菜单使用当前有效主题的原生滚动条样式。

**Architecture:** 复用 `contract.css` 已有的三态 scrollbar 语义 token，并用菜单原语现有的稳定 `data-slot` 选择器加入原生滚动条规则。菜单选择器与项目区域选择器共享声明，React 原语和 Portal 结构保持不变。

**Tech Stack:** Tailwind CSS 4、CSS custom properties、Radix UI data slots、Vitest。

## Global Constraints

- 只覆盖 `[data-slot='dropdown-menu-content']` 与 `[data-slot='context-menu-content']`。
- 不修改 React 组件、Portal、overflow、菜单尺寸、依赖或主题设置。
- 复用 `--color-scrollbar-thumb`、`--color-scrollbar-thumb-hover`、`--color-scrollbar-thumb-active`。
- Firefox 使用 `scrollbar-color` 与 `scrollbar-width: thin`；Electron/WebKit 使用现有 10px 胶囊纵向样式。
- 不改变终端、导航/文件区或其他滚动容器的现有行为。
- 保留工作区内所有无关未提交改动。
- 用户未授权 Git 提交，本计划不包含提交步骤。

---

### Task 1: 为共享菜单增加主题化原生滚动条

**Files:**

- Modify: `src/web/theme/theme-contract.test.ts`
- Modify: `src/web/theme/contract.css`

**Interfaces:**

- Consumes: 菜单原语的 `data-slot="dropdown-menu-content"`、`data-slot="context-menu-content"`，以及现有三态 scrollbar token。
- Produces: 两类菜单在 Firefox 与 Electron/WebKit 中一致的主题化原生滚动条。

- [x] **Step 1: 写失败的菜单滚动条契约测试**

在 `PROJECT_AREA_NATIVE_SCROLLBAR_SELECTOR` 后增加：

```ts
const MENU_NATIVE_SCROLLBAR_SELECTOR = ":is([data-slot='dropdown-menu-content'], [data-slot='context-menu-content'])"
```

在现有项目区域滚动条测试后增加：

```ts
test('themes native scrollbars inside dropdown and context menus', () => {
  const contract = readText(new URL('contract.css', THEME_ROOT))
  const normalizedContract = contract.replace(/\s+/g, ' ')
  const normalizedMenuSelector = MENU_NATIVE_SCROLLBAR_SELECTOR.replace(/\s+/g, ' ')
  const firefoxRule = cssRule(normalizedContract, normalizedMenuSelector)
  const scrollbar = cssRule(normalizedContract, `${normalizedMenuSelector}::-webkit-scrollbar`)
  const track = cssRule(normalizedContract, `${normalizedMenuSelector}::-webkit-scrollbar-track`)
  const corner = cssRule(normalizedContract, `${normalizedMenuSelector}::-webkit-scrollbar-corner`)
  const thumb = cssRule(normalizedContract, `${normalizedMenuSelector}::-webkit-scrollbar-thumb`)
  const thumbHover = cssRule(normalizedContract, `${normalizedMenuSelector}::-webkit-scrollbar-thumb:hover`)
  const thumbActive = cssRule(normalizedContract, `${normalizedMenuSelector}::-webkit-scrollbar-thumb:active`)

  expect(firefoxRule).toContain('scrollbar-color: var(--color-scrollbar-thumb) transparent;')
  expect(firefoxRule).toContain('scrollbar-width: thin;')
  expect(scrollbar).toContain('width: 10px;')
  expect(scrollbar).toContain('height: 10px;')
  expect(track).toContain('background-color: transparent;')
  expect(corner).toContain('background-color: transparent;')
  expect(thumb).toContain('border: 3px solid transparent;')
  expect(thumb).toContain('border-radius: 999px;')
  expect(thumb).toContain('background-color: var(--color-scrollbar-thumb);')
  expect(thumb).toContain('background-clip: content-box;')
  expect(thumbHover).toContain('background-color: var(--color-scrollbar-thumb-hover);')
  expect(thumbActive).toContain('background-color: var(--color-scrollbar-thumb-active);')
})
```

- [x] **Step 2: 运行聚焦测试并确认 RED**

Run: `bun run test src/web/theme/theme-contract.test.ts`

Expected: FAIL，错误指出 `MENU_NATIVE_SCROLLBAR_SELECTOR` 在 `contract.css` 中不存在。

- [x] **Step 3: 把菜单 slot 合并进现有原生滚动条声明**

在 `contract.css` 的项目区域滚动条规则前增加菜单选择器，并让菜单与原规则共享声明：

```css
@supports not selector(::-webkit-scrollbar) {
  :is([data-slot='dropdown-menu-content'], [data-slot='context-menu-content']),
  :is(.project-navigation-tone, .project-file-area-tone) {
    scrollbar-color: var(--color-scrollbar-thumb) transparent;
    scrollbar-width: thin;
  }
}

:is([data-slot='dropdown-menu-content'], [data-slot='context-menu-content'])::-webkit-scrollbar,
:is(
  .project-navigation-tone,
  .project-file-area-tone,
  .project-navigation-tone *,
  .project-file-area-tone *
)::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

:is([data-slot='dropdown-menu-content'], [data-slot='context-menu-content'])::-webkit-scrollbar-track,
:is([data-slot='dropdown-menu-content'], [data-slot='context-menu-content'])::-webkit-scrollbar-corner,
:is(
  .project-navigation-tone,
  .project-file-area-tone,
  .project-navigation-tone *,
  .project-file-area-tone *
)::-webkit-scrollbar-track,
:is(
  .project-navigation-tone,
  .project-file-area-tone,
  .project-navigation-tone *,
  .project-file-area-tone *
)::-webkit-scrollbar-corner {
  background-color: transparent;
}

:is([data-slot='dropdown-menu-content'], [data-slot='context-menu-content'])::-webkit-scrollbar-thumb,
:is(
  .project-navigation-tone,
  .project-file-area-tone,
  .project-navigation-tone *,
  .project-file-area-tone *
)::-webkit-scrollbar-thumb {
  border: 3px solid transparent;
  border-radius: 999px;
  background-color: var(--color-scrollbar-thumb);
  background-clip: content-box;
}

:is([data-slot='dropdown-menu-content'], [data-slot='context-menu-content'])::-webkit-scrollbar-thumb:hover,
:is(
    .project-navigation-tone,
    .project-file-area-tone,
    .project-navigation-tone *,
    .project-file-area-tone *
  )::-webkit-scrollbar-thumb:hover {
  background-color: var(--color-scrollbar-thumb-hover);
}

:is([data-slot='dropdown-menu-content'], [data-slot='context-menu-content'])::-webkit-scrollbar-thumb:active,
:is(
    .project-navigation-tone,
    .project-file-area-tone,
    .project-navigation-tone *,
    .project-file-area-tone *
  )::-webkit-scrollbar-thumb:active {
  background-color: var(--color-scrollbar-thumb-active);
}
```

保留后续横向滚动条和 Radix `ScrollArea` 规则原样；菜单已有 `overflow-x-hidden`，不需要横向交互扩展。

- [x] **Step 4: 运行聚焦测试并确认 GREEN**

Run: `bun run test src/web/theme/theme-contract.test.ts`

Expected: PASS，7 tests passed，无 warning 或 error。

- [x] **Step 5: 检查格式与变更范围**

Run: `bunx prettier --check src/web/theme/contract.css src/web/theme/theme-contract.test.ts docs/superpowers/specs/2026-08-03-themed-menu-scrollbars-design.md docs/superpowers/plans/2026-08-03-themed-menu-scrollbars.md`

Expected: PASS，所有目标文件符合格式规范。

Run: `git diff --check -- src/web/theme/contract.css src/web/theme/theme-contract.test.ts docs/superpowers/specs/2026-08-03-themed-menu-scrollbars-design.md docs/superpowers/plans/2026-08-03-themed-menu-scrollbars.md`

Expected: PASS，无空白错误。

- [x] **Step 6: 运行完整验证**

Run: `bun run typecheck`

Expected: PASS。

Run: `bun run test`

Expected: PASS。

Run: `bun run check:architecture`

Expected: PASS。

## 执行结果

- 聚焦主题契约测试：7/7 通过，并已观察到实现前的预期 RED 与实现后的 GREEN。
- Web 生产构建：通过。
- 架构边界检查：通过。
- 全局 typecheck：被工作区内并行进行的 branch-workspace/worktree 类型迁移错误阻断；错误未涉及本计划目标文件。
- 全量测试：3646/3663 通过；17 项失败均位于并行修改的 branch-workspace/worktree 与 `fetchRemote` 测试，主题契约测试通过。
