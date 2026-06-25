# Topbar Tab Depth Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every shipped theme render the topbar as a subtly deeper chrome layer than active repo and terminal tabs.

**Architecture:** Keep the existing `data-theme` plus `data-color-theme` token architecture. Add one regression test in the existing theme CSS contract test, then adjust only preset CSS token values for topbar and tab surfaces.

**Tech Stack:** Vitest, Bun, CSS custom properties, existing Hobgoblin theme preset files.

---

## Scope

This plan implements the confirmed design in `docs/superpowers/specs/2026-06-25-topbar-tab-depth-theme-design.md`.

The change is intentionally limited to:

- `src/web/theme/theme-presets.test.ts`
- `src/web/theme/themes/macos.css`
- `src/web/theme/themes/mono.css`
- `src/web/theme/themes/github.css`
- `src/web/theme/themes/claude.css`
- `src/web/theme/themes/cursor.css`
- `src/web/theme/themes/airbnb.css`
- `src/web/theme/themes/bmw.css`

No React component, settings, terminal palette, or layout behavior changes are part of this plan.

## File Structure

- `src/web/theme/theme-presets.test.ts`: owns static CSS contract tests for theme preset files. Add the topbar/tab depth invariant here because it already reads CSS files and exposes `selectorBlock()`, `cssTokenValue()`, and `hexLuminance()`.
- `src/web/theme/themes/*.css`: each file owns one theme preset. Update only `--goblin-topbar-bg`, `--goblin-tab-hover-bg`, and `--goblin-tab-active-bg` where needed.

Git commits are intentionally omitted from the task steps because `AGENTS.md` says not to plan or execute git commit operations unless the user explicitly asks.

### Task 1: Add Topbar/Tab Depth Regression Test

**Files:**

- Modify: `src/web/theme/theme-presets.test.ts`

- [ ] **Step 1: Add the failing test**

Insert this test after the existing `defines complete light and dark token blocks for every color theme` test:

```ts
  test('keeps topbar visually deeper than tab states for every color theme', () => {
    for (const colorTheme of COLOR_THEMES) {
      const css = readThemeCss(colorTheme)

      for (const theme of ['light', 'dark'] as const) {
        const block = selectorBlock(css, colorTheme, theme)
        const topbar = hexLuminance(cssTokenValue(block, '--goblin-topbar-bg'))
        const tabHover = hexLuminance(cssTokenValue(block, '--goblin-tab-hover-bg'))
        const tabActive = hexLuminance(cssTokenValue(block, '--goblin-tab-active-bg'))

        expect(topbar, `${colorTheme}/${theme} topbar is deeper than tab hover`).toBeLessThan(tabHover)
        expect(tabHover, `${colorTheme}/${theme} tab hover is not brighter than active tab`).toBeLessThanOrEqual(tabActive)
      }
    }
  })
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
bun run test src/web/theme/theme-presets.test.ts
```

Expected: `FAIL` in `keeps topbar visually deeper than tab states for every color theme`, with at least one light preset failing because current light topbar tokens are equal to or brighter than tab tokens.

### Task 2: Adjust macOS, Mono, and GitHub Light Tokens

**Files:**

- Modify: `src/web/theme/themes/macos.css`
- Modify: `src/web/theme/themes/mono.css`
- Modify: `src/web/theme/themes/github.css`

- [ ] **Step 1: Update macOS light topbar and tab tokens**

In `src/web/theme/themes/macos.css`, inside `html[data-color-theme='macos'][data-theme='light']`, replace the topbar/tab token block with:

```css
  --goblin-topbar-bg: #f5f5f7;
  --goblin-topbar-border: #e0e0e0;
  --goblin-tab-bg: transparent;
  --goblin-tab-hover-bg: #fafafc;
  --goblin-tab-active-bg: #ffffff;
```

- [ ] **Step 2: Update Mono light topbar and tab tokens**

In `src/web/theme/themes/mono.css`, inside `html[data-color-theme='mono'][data-theme='light']`, replace the topbar/tab token block with:

```css
  --goblin-topbar-bg: #f4f4f5;
  --goblin-topbar-border: #e4e4e7;
  --goblin-tab-bg: transparent;
  --goblin-tab-hover-bg: #fafafa;
  --goblin-tab-active-bg: #ffffff;
```

- [ ] **Step 3: Update GitHub light topbar and tab tokens**

In `src/web/theme/themes/github.css`, inside `html[data-color-theme='github'][data-theme='light']`, replace the topbar/tab token block with:

```css
  --goblin-topbar-bg: #f6f8fa;
  --goblin-topbar-border: #d0d7de;
  --goblin-tab-bg: transparent;
  --goblin-tab-hover-bg: #ffffff;
  --goblin-tab-active-bg: #ffffff;
```

- [ ] **Step 4: Run the focused test**

Run:

```bash
bun run test src/web/theme/theme-presets.test.ts
```

Expected: the new depth test still fails for the remaining unmodified light presets, and no existing theme contract test regresses.

### Task 3: Adjust Claude, Cursor, Airbnb, and BMW Light Tokens

**Files:**

- Modify: `src/web/theme/themes/claude.css`
- Modify: `src/web/theme/themes/cursor.css`
- Modify: `src/web/theme/themes/airbnb.css`
- Modify: `src/web/theme/themes/bmw.css`

- [ ] **Step 1: Update Claude light topbar and tab tokens**

In `src/web/theme/themes/claude.css`, inside `html[data-color-theme='claude'][data-theme='light']`, replace the topbar/tab token block with:

```css
  --goblin-topbar-bg: #efe9de;
  --goblin-topbar-border: #d4cabd;
  --goblin-tab-bg: transparent;
  --goblin-tab-hover-bg: #f5f0e8;
  --goblin-tab-active-bg: #ffffff;
```

- [ ] **Step 2: Update Cursor light topbar and tab tokens**

In `src/web/theme/themes/cursor.css`, inside `html[data-color-theme='cursor'][data-theme='light']`, replace the topbar/tab token block with:

```css
  --goblin-topbar-bg: #efeee8;
  --goblin-topbar-border: #cfcdc4;
  --goblin-tab-bg: transparent;
  --goblin-tab-hover-bg: #fafaf7;
  --goblin-tab-active-bg: #ffffff;
```

- [ ] **Step 3: Update Airbnb light topbar and tab tokens**

In `src/web/theme/themes/airbnb.css`, inside `html[data-color-theme='airbnb'][data-theme='light']`, replace the topbar/tab token block with:

```css
  --goblin-topbar-bg: #f7f7f7;
  --goblin-topbar-border: #dddddd;
  --goblin-tab-bg: transparent;
  --goblin-tab-hover-bg: #ffffff;
  --goblin-tab-active-bg: #ffffff;
```

- [ ] **Step 4: Update BMW light topbar and tab tokens**

In `src/web/theme/themes/bmw.css`, inside `html[data-color-theme='bmw'][data-theme='light']`, replace the topbar/tab token block with:

```css
  --goblin-topbar-bg: #e6e6e6;
  --goblin-topbar-border: #c8c8c8;
  --goblin-tab-bg: transparent;
  --goblin-tab-hover-bg: #f5f5f5;
  --goblin-tab-active-bg: #ffffff;
```

- [ ] **Step 5: Run the focused test**

Run:

```bash
bun run test src/web/theme/theme-presets.test.ts
```

Expected: `PASS` for `src/web/theme/theme-presets.test.ts`.

### Task 4: Final Verification

**Files:**

- Verify: `src/web/theme/theme-presets.test.ts`
- Verify: `src/web/theme/themes/*.css`

- [ ] **Step 1: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: command exits with code `0`.

- [ ] **Step 2: Run the full test suite**

Run:

```bash
bun run test
```

Expected: command exits with code `0`.

- [ ] **Step 3: Inspect final changed files**

Run:

```bash
git diff -- src/web/theme/theme-presets.test.ts src/web/theme/themes/macos.css src/web/theme/themes/mono.css src/web/theme/themes/github.css src/web/theme/themes/claude.css src/web/theme/themes/cursor.css src/web/theme/themes/airbnb.css src/web/theme/themes/bmw.css
```

Expected: diff contains only the new regression test and the planned topbar/tab token edits.

- [ ] **Step 4: Stop before commit**

Do not run `git add`, `git commit`, or `git push`. Report the verification results and leave the worktree ready for user review.
