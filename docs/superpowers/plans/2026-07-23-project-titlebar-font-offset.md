# Project Titlebar Font Offset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Execute inline without subagents.

**Goal:** Change the shared project titlebar font offset from 1px to 2px while retaining the 10px minimum.

**Architecture:** Keep every titlebar consumer unchanged and modify only the root CSS custom property. The existing static font contract test protects the exact formula and all five consumer references.

**Tech Stack:** Tailwind CSS 4, Vitest 4.

## Global Constraints

- Formula must be exactly `max(10px, calc(var(--goblin-app-font-size) - 2px))`.
- Do not change body typography, titlebar layout, `icon-sm` controls, or shortcut behavior.
- Do not create a Git commit, branch, merge, or push.

---

### Task 1: Revise the shared titlebar font offset

**Files:**
- Modify: `src/web/theme/font-contract.test.ts`
- Modify: `src/web/styles.css`

**Interfaces:**
- Preserves: `--goblin-project-titlebar-font-size` and all existing consumers.
- Produces: a 2px application-font offset with a 10px lower bound.

- [ ] **Step 1: Change the test expectation to `- 2px`**

```ts
expect(stylesCss).toContain(
  '--goblin-project-titlebar-font-size: max(10px, calc(var(--goblin-app-font-size) - 2px))',
)
```

- [ ] **Step 2: Run `bun run test src/web/theme/font-contract.test.ts` and verify RED**

Expected: FAIL because production CSS still uses `- 1px`.

- [ ] **Step 3: Change the root CSS variable to `- 2px`**

```css
--goblin-project-titlebar-font-size: max(10px, calc(var(--goblin-app-font-size) - 2px));
```

- [ ] **Step 4: Re-run the font contract test and verify GREEN**

Expected: all tests in `font-contract.test.ts` PASS.

- [ ] **Step 5: Run integrated verification**

Run `bun run typecheck`, `bun run test --maxWorkers=1`, `bun run check:architecture`, and `git diff --check`.
