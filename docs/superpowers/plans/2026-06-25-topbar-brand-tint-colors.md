# Topbar Brand Tint Colors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recolor the top application bar so every shipped theme uses a restrained, theme-native brand tint while active repo and terminal tabs remain visually elevated.

**Architecture:** Keep the current CSS token architecture. Add a focused preset contract test that records the approved topbar/tab/toolbar pairing, then update only theme preset CSS tokens. React components, settings state, terminal palettes, and Electron chrome behavior stay unchanged.

**Tech Stack:** TypeScript, Vitest, CSS custom properties, Tailwind v4 semantic utilities, Bun.

---

## Source Spec

This plan implements the confirmed design in `docs/superpowers/specs/2026-06-25-topbar-brand-tint-colors-design.md`.

## Source-Control Policy

The repository instructions say not to plan or execute source-control write operations unless the user explicitly asks. This plan intentionally has no source-control write steps.

## File Map

- Modify: `src/web/theme/theme-presets.test.ts`
  - Responsibility: static contract tests for theme preset CSS files.
  - Add exact expected topbar, border, toolbar, tab hover, and tab active values for every preset and appearance.
- Modify: `src/web/theme/themes/macos.css`
  - Responsibility: macOS-style preset token values.
  - Update only app-region tokens in light and dark selectors.
- Modify: `src/web/theme/themes/mono.css`
  - Responsibility: neutral monochrome preset token values.
  - Update only app-region tokens in light and dark selectors.
- Modify: `src/web/theme/themes/github.css`
  - Responsibility: GitHub-style preset token values.
  - Update only app-region tokens in light and dark selectors.
- Modify: `src/web/theme/themes/claude.css`
  - Responsibility: Claude-style warm preset token values.
  - Update only app-region tokens in light and dark selectors.
- Modify: `src/web/theme/themes/cursor.css`
  - Responsibility: Cursor-style warm editor preset token values.
  - Update only app-region tokens in light and dark selectors.
- Modify: `src/web/theme/themes/airbnb.css`
  - Responsibility: Airbnb-style red/pink preset token values.
  - Update only app-region tokens in light and dark selectors.
- Modify: `src/web/theme/themes/bmw.css`
  - Responsibility: BMW-style engineered preset token values.
  - Update only app-region tokens in light and dark selectors.

## Target Token Matrix

Use these exact values:

| Theme | Mode | Topbar | Border | Toolbar | Tab hover | Tab active |
| --- | --- | --- | --- | --- | --- | --- |
| macos | light | `#d8e7f8` | `#bfd0e4` | `#e4effc` | `#fafafc` | `#ffffff` |
| macos | dark | `#0d1622` | `#243247` | `#1f3044` | `#1d1d1f` | `#272729` |
| mono | light | `#d6d6d8` | `#c6c6ca` | `#e3e3e5` | `#f7f7f8` | `#ffffff` |
| mono | dark | `#151518` | `#2a2a2e` | `#303033` | `#1d1d20` | `#27272a` |
| github | light | `#d7e5f7` | `#b9c9dd` | `#e3eefc` | `#f6f8fa` | `#ffffff` |
| github | dark | `#0f1724` | `#303f55` | `#1d2f49` | `#182234` | `#222c3a` |
| claude | light | `#ead7c9` | `#d6bdad` | `#f1e2d6` | `#f5f0e8` | `#ffffff` |
| claude | dark | `#211a17` | `#4a3329` | `#372b24` | `#25201d` | `#2e2823` |
| cursor | light | `#f1dccd` | `#d6c8bd` | `#fae9dd` | `#fafaf7` | `#ffffff` |
| cursor | dark | `#2a2119` | `#50301e` | `#432b1a` | `#2d2820` | `#342f27` |
| airbnb | light | `#f8d7df` | `#eab8c3` | `#fde7eb` | `#fff7f8` | `#ffffff` |
| airbnb | dark | `#2a151a` | `#59313a` | `#43262d` | `#2f2024` | `#37282c` |
| bmw | light | `#d7e3f2` | `#a9b8cc` | `#e6f0fb` | `#f5f5f5` | `#ffffff` |
| bmw | dark | `#050b14` | `#2a3d56` | `#0f1a29` | `#121a25` | `#1f2a38` |

### Task 1: Add Failing Topbar Pairing Contract

**Files:**
- Modify: `src/web/theme/theme-presets.test.ts`

- [ ] **Step 1: Add the expected topbar pairing object**

Insert this constant after `APP_REGION_TOKENS`:

```ts
const TOPBAR_BRAND_TINT_EXPECTATIONS = {
  macos: {
    light: {
      topbar: '#d8e7f8',
      border: '#bfd0e4',
      toolbar: '#e4effc',
      tabHover: '#fafafc',
      tabActive: '#ffffff',
    },
    dark: {
      topbar: '#0d1622',
      border: '#243247',
      toolbar: '#1f3044',
      tabHover: '#1d1d1f',
      tabActive: '#272729',
    },
  },
  mono: {
    light: {
      topbar: '#d6d6d8',
      border: '#c6c6ca',
      toolbar: '#e3e3e5',
      tabHover: '#f7f7f8',
      tabActive: '#ffffff',
    },
    dark: {
      topbar: '#151518',
      border: '#2a2a2e',
      toolbar: '#303033',
      tabHover: '#1d1d20',
      tabActive: '#27272a',
    },
  },
  github: {
    light: {
      topbar: '#d7e5f7',
      border: '#b9c9dd',
      toolbar: '#e3eefc',
      tabHover: '#f6f8fa',
      tabActive: '#ffffff',
    },
    dark: {
      topbar: '#0f1724',
      border: '#303f55',
      toolbar: '#1d2f49',
      tabHover: '#182234',
      tabActive: '#222c3a',
    },
  },
  claude: {
    light: {
      topbar: '#ead7c9',
      border: '#d6bdad',
      toolbar: '#f1e2d6',
      tabHover: '#f5f0e8',
      tabActive: '#ffffff',
    },
    dark: {
      topbar: '#211a17',
      border: '#4a3329',
      toolbar: '#372b24',
      tabHover: '#25201d',
      tabActive: '#2e2823',
    },
  },
  cursor: {
    light: {
      topbar: '#f1dccd',
      border: '#d6c8bd',
      toolbar: '#fae9dd',
      tabHover: '#fafaf7',
      tabActive: '#ffffff',
    },
    dark: {
      topbar: '#2a2119',
      border: '#50301e',
      toolbar: '#432b1a',
      tabHover: '#2d2820',
      tabActive: '#342f27',
    },
  },
  airbnb: {
    light: {
      topbar: '#f8d7df',
      border: '#eab8c3',
      toolbar: '#fde7eb',
      tabHover: '#fff7f8',
      tabActive: '#ffffff',
    },
    dark: {
      topbar: '#2a151a',
      border: '#59313a',
      toolbar: '#43262d',
      tabHover: '#2f2024',
      tabActive: '#37282c',
    },
  },
  bmw: {
    light: {
      topbar: '#d7e3f2',
      border: '#a9b8cc',
      toolbar: '#e6f0fb',
      tabHover: '#f5f5f5',
      tabActive: '#ffffff',
    },
    dark: {
      topbar: '#050b14',
      border: '#2a3d56',
      toolbar: '#0f1a29',
      tabHover: '#121a25',
      tabActive: '#1f2a38',
    },
  },
} as const
```

- [ ] **Step 2: Add the exact pairing test**

Insert this test after `keeps topbar visually deeper than toolbar for every color theme`:

```ts
  test('uses the approved theme-native topbar brand tint pairings', () => {
    for (const colorTheme of COLOR_THEMES) {
      const css = readThemeCss(colorTheme)
      const expectedByTheme = TOPBAR_BRAND_TINT_EXPECTATIONS[colorTheme]

      for (const theme of ['light', 'dark'] as const) {
        const block = selectorBlock(css, colorTheme, theme)
        const expected = expectedByTheme[theme]

        expect(cssTokenValue(block, '--goblin-topbar-bg'), `${colorTheme}/${theme} topbar`).toBe(expected.topbar)
        expect(cssTokenValue(block, '--goblin-topbar-border'), `${colorTheme}/${theme} topbar border`).toBe(
          expected.border,
        )
        expect(cssTokenValue(block, '--goblin-toolbar-bg'), `${colorTheme}/${theme} toolbar`).toBe(expected.toolbar)
        expect(cssTokenValue(block, '--goblin-tab-hover-bg'), `${colorTheme}/${theme} tab hover`).toBe(
          expected.tabHover,
        )
        expect(cssTokenValue(block, '--goblin-tab-active-bg'), `${colorTheme}/${theme} tab active`).toBe(
          expected.tabActive,
        )
      }
    }
  })
```

- [ ] **Step 3: Run the focused test and verify failure**

Run:

```bash
bun run test -- src/web/theme/theme-presets.test.ts
```

Expected: the new `uses the approved theme-native topbar brand tint pairings` test fails with mismatches for current CSS token values.

### Task 2: Update Cool And Neutral Theme Tokens

**Files:**
- Modify: `src/web/theme/themes/macos.css`
- Modify: `src/web/theme/themes/mono.css`
- Modify: `src/web/theme/themes/github.css`

- [ ] **Step 1: Update macOS app-region tokens**

In `src/web/theme/themes/macos.css`, replace only these token values in the light block:

```css
  --goblin-topbar-bg: #d8e7f8;
  --goblin-topbar-border: #bfd0e4;
  --goblin-toolbar-bg: #e4effc;
  --goblin-toolbar-border: var(--goblin-topbar-border);
  --goblin-tab-bg: transparent;
  --goblin-tab-hover-bg: #fafafc;
  --goblin-tab-active-bg: #ffffff;
```

In the dark block, replace only these token values:

```css
  --goblin-topbar-bg: #0d1622;
  --goblin-topbar-border: #243247;
  --goblin-toolbar-bg: #1f3044;
  --goblin-toolbar-border: var(--goblin-topbar-border);
  --goblin-tab-bg: transparent;
  --goblin-tab-hover-bg: #1d1d1f;
  --goblin-tab-active-bg: #272729;
```

- [ ] **Step 2: Update Mono app-region tokens**

In `src/web/theme/themes/mono.css`, replace only these token values in the light block:

```css
  --goblin-topbar-bg: #d6d6d8;
  --goblin-topbar-border: #c6c6ca;
  --goblin-toolbar-bg: #e3e3e5;
  --goblin-toolbar-border: var(--goblin-topbar-border);
  --goblin-tab-bg: transparent;
  --goblin-tab-hover-bg: #f7f7f8;
  --goblin-tab-active-bg: #ffffff;
```

In the dark block, replace only these token values:

```css
  --goblin-topbar-bg: #151518;
  --goblin-topbar-border: #2a2a2e;
  --goblin-toolbar-bg: #303033;
  --goblin-toolbar-border: var(--goblin-topbar-border);
  --goblin-tab-bg: transparent;
  --goblin-tab-hover-bg: #1d1d20;
  --goblin-tab-active-bg: #27272a;
```

- [ ] **Step 3: Update GitHub app-region tokens**

In `src/web/theme/themes/github.css`, replace only these token values in the light block:

```css
  --goblin-topbar-bg: #d7e5f7;
  --goblin-topbar-border: #b9c9dd;
  --goblin-toolbar-bg: #e3eefc;
  --goblin-toolbar-border: var(--goblin-topbar-border);
  --goblin-tab-bg: transparent;
  --goblin-tab-hover-bg: #f6f8fa;
  --goblin-tab-active-bg: #ffffff;
```

In the dark block, replace only these token values:

```css
  --goblin-topbar-bg: #0f1724;
  --goblin-topbar-border: #303f55;
  --goblin-toolbar-bg: #1d2f49;
  --goblin-toolbar-border: var(--goblin-topbar-border);
  --goblin-tab-bg: transparent;
  --goblin-tab-hover-bg: #182234;
  --goblin-tab-active-bg: #222c3a;
```

- [ ] **Step 4: Run the focused test and verify remaining failures**

Run:

```bash
bun run test -- src/web/theme/theme-presets.test.ts
```

Expected: exact-pairing failures remain for `claude`, `cursor`, `airbnb`, and `bmw`; `macos`, `mono`, and `github` no longer fail in the exact-pairing test.

### Task 3: Update Warm And High-Contrast Theme Tokens

**Files:**
- Modify: `src/web/theme/themes/claude.css`
- Modify: `src/web/theme/themes/cursor.css`
- Modify: `src/web/theme/themes/airbnb.css`
- Modify: `src/web/theme/themes/bmw.css`

- [ ] **Step 1: Update Claude app-region tokens**

In `src/web/theme/themes/claude.css`, replace only these token values in the light block:

```css
  --goblin-topbar-bg: #ead7c9;
  --goblin-topbar-border: #d6bdad;
  --goblin-toolbar-bg: #f1e2d6;
  --goblin-toolbar-border: var(--goblin-topbar-border);
  --goblin-tab-bg: transparent;
  --goblin-tab-hover-bg: #f5f0e8;
  --goblin-tab-active-bg: #ffffff;
```

In the dark block, replace only these token values:

```css
  --goblin-topbar-bg: #211a17;
  --goblin-topbar-border: #4a3329;
  --goblin-toolbar-bg: #372b24;
  --goblin-toolbar-border: var(--goblin-topbar-border);
  --goblin-tab-bg: transparent;
  --goblin-tab-hover-bg: #25201d;
  --goblin-tab-active-bg: #2e2823;
```

- [ ] **Step 2: Update Cursor app-region tokens**

In `src/web/theme/themes/cursor.css`, replace only these token values in the light block:

```css
  --goblin-topbar-bg: #f1dccd;
  --goblin-topbar-border: #d6c8bd;
  --goblin-toolbar-bg: #fae9dd;
  --goblin-toolbar-border: var(--goblin-topbar-border);
  --goblin-tab-bg: transparent;
  --goblin-tab-hover-bg: #fafaf7;
  --goblin-tab-active-bg: #ffffff;
```

In the dark block, replace only these token values:

```css
  --goblin-topbar-bg: #2a2119;
  --goblin-topbar-border: #50301e;
  --goblin-toolbar-bg: #432b1a;
  --goblin-toolbar-border: var(--goblin-topbar-border);
  --goblin-tab-bg: transparent;
  --goblin-tab-hover-bg: #2d2820;
  --goblin-tab-active-bg: #342f27;
```

- [ ] **Step 3: Update Airbnb app-region tokens**

In `src/web/theme/themes/airbnb.css`, replace only these token values in the light block:

```css
  --goblin-topbar-bg: #f8d7df;
  --goblin-topbar-border: #eab8c3;
  --goblin-toolbar-bg: #fde7eb;
  --goblin-toolbar-border: var(--goblin-topbar-border);
  --goblin-tab-bg: transparent;
  --goblin-tab-hover-bg: #fff7f8;
  --goblin-tab-active-bg: #ffffff;
```

In the dark block, replace only these token values:

```css
  --goblin-topbar-bg: #2a151a;
  --goblin-topbar-border: #59313a;
  --goblin-toolbar-bg: #43262d;
  --goblin-toolbar-border: var(--goblin-topbar-border);
  --goblin-tab-bg: transparent;
  --goblin-tab-hover-bg: #2f2024;
  --goblin-tab-active-bg: #37282c;
```

- [ ] **Step 4: Update BMW app-region tokens**

In `src/web/theme/themes/bmw.css`, replace only these token values in the light block:

```css
  --goblin-topbar-bg: #d7e3f2;
  --goblin-topbar-border: #a9b8cc;
  --goblin-toolbar-bg: #e6f0fb;
  --goblin-toolbar-border: var(--goblin-topbar-border);
  --goblin-tab-bg: transparent;
  --goblin-tab-hover-bg: #f5f5f5;
  --goblin-tab-active-bg: #ffffff;
```

In the dark block, replace only these token values:

```css
  --goblin-topbar-bg: #050b14;
  --goblin-topbar-border: #2a3d56;
  --goblin-toolbar-bg: #0f1a29;
  --goblin-toolbar-border: var(--goblin-topbar-border);
  --goblin-tab-bg: transparent;
  --goblin-tab-hover-bg: #121a25;
  --goblin-tab-active-bg: #1f2a38;
```

- [ ] **Step 5: Run the focused test and verify pass**

Run:

```bash
bun run test -- src/web/theme/theme-presets.test.ts
```

Expected: PASS. Existing luminance tests pass because every topbar value is darker than its tab hover, tab active, and toolbar values.

### Task 4: Verify Project Checks

**Files:**
- No source edits.

- [ ] **Step 1: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 2: Run full test suite**

Run:

```bash
bun run test
```

Expected: PASS with no failing Vitest tests.

- [ ] **Step 3: Run architecture guard**

Run:

```bash
bun run check:architecture
```

Expected: PASS. The change should not affect import boundaries because it only touches CSS and one CSS contract test.

### Task 5: Manual Visual Verification

**Files:**
- No source edits.

- [ ] **Step 1: Start the app**

Run:

```bash
bun run dev
```

Expected: the development app starts successfully and remains running.

- [ ] **Step 2: Check light themes**

In the running app, switch appearance to light and inspect each color theme:

```text
macos
mono
github
claude
cursor
airbnb
bmw
```

Expected for each light theme:

```text
Topbar has a restrained theme-native tint.
Active repo tabs read brighter than the topbar.
Toolbar surfaces remain lighter than the topbar.
The topbar does not read as a saturated banner.
Settings and repo action icons remain readable.
```

- [ ] **Step 3: Check dark themes**

In the running app, switch appearance to dark and inspect each color theme:

```text
macos
mono
github
claude
cursor
airbnb
bmw
```

Expected for each dark theme:

```text
Topbar is a deep theme-native shell color.
Active repo tabs and terminal tabs remain visibly elevated.
Text and icon contrast remain readable.
The topbar does not blend into the tab strip.
Toolbar surfaces remain distinguishable from the topbar.
```

- [ ] **Step 4: Stop the dev process**

Stop the `bun run dev` process with `Ctrl-C`.

Expected: the process exits cleanly.
