# 左侧区域主题化滚动条实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让左侧导航和文件区的横向、纵向滚动条通过现有主题 token 自动更新颜色。

**Architecture:** 在 `contract.css` 派生 scrollbar 的默认、hover、active 语义色，并由 `.project-navigation-tone` 与 `.project-file-area-tone` 作用域覆盖原生 scrollbar 和 Radix thumb。共享 ScrollArea 只增加稳定的 `data-slot`，不读取主题状态。

**Tech Stack:** React 19、Radix UI、Tailwind CSS 4、CSS custom properties、Vitest。

## Global Constraints

- 不增加 React 主题分支、依赖、设置项或逐主题 scrollbar 色板。
- 不修改终端与右侧详情区滚动条。
- 保持现有滚动尺寸、显隐、拖拽和触控行为。
- 使用 repo alias 和显式 `.ts`/`.tsx` 后缀；不使用 Node strip-only 不支持的 TypeScript 语法。
- 用户未授权 git commit，本计划不包含提交步骤。

---

### Task 1: 主题化左侧与文件区滚动条

**Files:**

- Modify: `src/web/theme/theme-contract.test.ts`
- Modify: `src/web/components/ui/scroll-area.tsx`
- Modify: `src/web/theme/contract.css`

**Interfaces:**

- Consumes: 主题 preset 的 `--goblin-text-secondary`、`--goblin-accent`；现有 `.project-navigation-tone` 与 `.project-file-area-tone`。
- Produces: `--color-scrollbar-thumb`、`--color-scrollbar-thumb-hover`、`--color-scrollbar-thumb-active`；`data-slot="scroll-area-thumb"`。

- [x] **Step 1: 写失败的主题契约测试**

在 `CONTRACT_TOKENS` 中增加：

```ts
'--color-scrollbar-thumb:',
'--color-scrollbar-thumb-hover:',
'--color-scrollbar-thumb-active:',
```

增加一个测试，读取真实 `contract.css`，断言两个 tone class 共用原生 scrollbar 规则、透明 track/corner、三种 thumb 状态色，以及 Radix `data-slot="scroll-area-thumb"` 状态规则；同时读取 `scroll-area.tsx`，断言生产组件暴露该 slot。

- [x] **Step 2: 运行聚焦测试并确认 RED**

Run: `bun run test src/web/theme/theme-contract.test.ts`

Expected: FAIL，原因是 scrollbar token、作用域规则或 `data-slot` 尚不存在。

- [x] **Step 3: 增加最小生产实现**

在 `contract.css` 的 `@theme` 中增加：

```css
--color-scrollbar-thumb: color-mix(in srgb, var(--goblin-text-secondary) 72%, transparent);
--color-scrollbar-thumb-hover: color-mix(in srgb, var(--goblin-text-secondary) 58%, var(--goblin-accent) 42%);
--color-scrollbar-thumb-active: color-mix(in srgb, var(--goblin-text-secondary) 30%, var(--goblin-accent) 70%);
```

为两个 tone class 增加 Firefox `scrollbar-color`/`scrollbar-width`，为作用域本身及其后代增加 WebKit 横纵 scrollbar、透明 track/corner、胶囊 thumb 和 hover/active 规则。为 Radix thumb 增加相同三态规则。

在 `ScrollAreaPrimitive.Thumb` 上增加：

```tsx
data-slot="scroll-area-thumb"
```

- [x] **Step 4: 运行聚焦测试并确认 GREEN**

Run: `bun run test src/web/theme/theme-contract.test.ts`

Expected: PASS，无 warning 或 error。

- [x] **Step 5: 运行完整验证**

Run: `bun run typecheck`

Expected: PASS。

Run: `bun run test`

Expected: PASS。

Run: `bun run check:architecture`

Expected: PASS。
