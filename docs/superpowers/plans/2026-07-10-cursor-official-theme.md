# Cursor Official Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repaint the existing Cursor preset as a Cursor 3-style grayscale agent workspace that is structurally distinct from the warm Claude preset.

**Architecture:** Keep the existing CSS-token architecture unchanged. Lock the design with focused preset and real-CSS terminal tests, then replace only the light and dark token values in `cursor.css`; classic terminal tokens remain byte-for-byte unchanged.

**Tech Stack:** CSS custom properties, TypeScript, Vitest, Bun

---

## File Structure

- Modify `src/web/theme/theme-presets.test.ts`: own exact Cursor foundation/region expectations and Cursor-versus-Claude distinction checks.
- Modify `src/web/components/terminal/terminal-theme.test.ts`: verify xterm reads the real Cursor light and dark synchronized terminal palettes.
- Modify `src/web/theme/themes/cursor.css`: own all Cursor light/dark foundation, semantic, region, and terminal token values.
- Do not modify `src/web/theme/themes/claude.css`, React components, the theme registry, or persistence code.

### Task 1: Lock The Cursor 3 Design Contract

**Files:**
- Modify: `src/web/theme/theme-presets.test.ts:300`
- Modify: `src/web/theme/theme-presets.test.ts:1312`
- Modify: `src/web/components/terminal/terminal-theme.test.ts:90`

- [ ] **Step 1: Replace Cursor topbar tint expectations**

In `TOPBAR_BRAND_TINT_EXPECTATIONS.cursor`, replace the existing warm values with:

```ts
cursor: {
  light: {
    topbar: '#f1f1ef',
    border: '#d8d8d4',
    toolbar: '#f7f7f5',
    tabHover: '#f5f5f3',
    tabActive: '#ffffff',
  },
  dark: {
    topbar: '#1d1d1d',
    border: '#343434',
    toolbar: '#242424',
    tabHover: '#292929',
    tabActive: '#303030',
  },
},
```

- [ ] **Step 2: Replace the narrow Cursor brief test with exact light/dark expectations**

Replace `keeps cursor aligned with the Cursor design brief` with:

```ts
test('keeps cursor aligned with the Cursor 3 Agents Window design', () => {
  const cursorCss = readThemeCss('cursor')
  const claudeCss = readThemeCss('claude')
  const light = selectorBlock(cursorCss, 'cursor', 'light')
  const dark = selectorBlock(cursorCss, 'cursor', 'dark')
  const claudeLight = selectorBlock(claudeCss, 'claude', 'light')
  const claudeDark = selectorBlock(claudeCss, 'claude', 'dark')

  expectTokenValues(light, {
    '--goblin-surface-canvas': '#f7f7f5',
    '--goblin-surface-base': '#ececea',
    '--goblin-surface-raised': '#ffffff',
    '--goblin-surface-hover': '#e6e6e3',
    '--goblin-text-primary': '#1b1b1b',
    '--goblin-text-secondary': '#73736f',
    '--goblin-border-default': '#d8d8d4',
    '--goblin-action-primary': '#1b1b1b',
    '--goblin-accent': '#1b1b1b',
    '--goblin-topbar-bg': '#f1f1ef',
    '--goblin-toolbar-bg': '#f7f7f5',
    '--goblin-sidebar-bg': '#ececea',
    '--goblin-control-radius': '0.375rem',
    '--color-terminal-background': '#ffffff',
    '--color-terminal-foreground': '#1b1b1b',
  })
  expectTokenValues(dark, {
    '--goblin-surface-canvas': '#181818',
    '--goblin-surface-base': '#202020',
    '--goblin-surface-raised': '#242424',
    '--goblin-surface-hover': '#292929',
    '--goblin-text-primary': '#ededed',
    '--goblin-text-secondary': '#949494',
    '--goblin-border-default': '#343434',
    '--goblin-action-primary': '#ededed',
    '--goblin-accent': '#ededed',
    '--goblin-topbar-bg': '#1d1d1d',
    '--goblin-toolbar-bg': '#242424',
    '--goblin-sidebar-bg': '#202020',
    '--goblin-control-radius': '0.375rem',
    '--color-terminal-background': '#181818',
    '--color-terminal-foreground': '#ededed',
  })

  expect(light).not.toContain('#f54e00')
  expect(dark).not.toContain('#f54e00')
  expect(cssTokenValue(light, '--goblin-surface-canvas')).not.toBe(
    cssTokenValue(claudeLight, '--goblin-surface-canvas'),
  )
  expect(cssTokenValue(dark, '--goblin-surface-canvas')).not.toBe(
    cssTokenValue(claudeDark, '--goblin-surface-canvas'),
  )
})
```

- [ ] **Step 3: Add real Cursor terminal coverage**

Add this table-driven test after the existing Claude real-preset test:

```ts
test.each([
  ['light', '#ffffff', '#1b1b1b', '#5b7fa3'],
  ['dark', '#181818', '#ededed', '#8fb4d8'],
] as const)('reads Cursor %s synchronized terminal tokens', (mode, background, foreground, blue) => {
  installRealTerminalPresetStyles('cursor')
  document.documentElement.dataset.theme = mode
  document.documentElement.dataset.colorTheme = 'cursor'

  expect(terminalThemeForCurrentDocument()).toMatchObject({
    background,
    foreground,
    cursor: foreground,
    blue,
  })
})
```

- [ ] **Step 4: Run focused tests and verify red state**

Run:

```bash
bun run test src/web/theme/theme-presets.test.ts src/web/components/terminal/terminal-theme.test.ts
```

Expected: FAIL only on the new Cursor values because `cursor.css` still contains warm surfaces and `#f54e00`.

### Task 2: Repaint Cursor Foundation And Semantic Tokens

**Files:**
- Modify: `src/web/theme/themes/cursor.css:27`

- [ ] **Step 1: Replace the light foundation and semantic values**

Keep every existing token declaration and declaration order. Replace values according to this complete mapping:

```text
surface: canvas #f7f7f5; base #ececea; raised/overlay/control #ffffff;
         muted #f1f1ef; hover/control-hover #e6e6e3
text: primary #1b1b1b; secondary-strong #3f3f3c; secondary #73736f;
      selected-secondary #50504d; disabled #a0a09b
border: subtle #e3e3df; default #d8d8d4; strong #bdbdb8
focus: #73736f
primary: background #1b1b1b; foreground #ffffff
danger: background #c73b3b; foreground #ffffff
accent: hex/text #1b1b1b; rgb 27 27 27; selection alpha .10;
        surface alpha .07; border alpha .22
warning: text #8a6518; rgb 138 101 24; surface .12; border .32
success: text #287a45; rgb 40 122 69; surface .10; border .30
danger status: text #b83232; rgb 184 50 50; surface .09; border .30
activity: hex #5b7fa3; rgb 91 127 163; surface .12; border .34
bell: keep #7c4ab0 and rgb 124 74 176; surface .13; border .38
overlay scrim: rgb(27 27 27 / 0.42)
shadows: xs 0 1px 1px rgb(27 27 27 / .03); sm 0 1px 2px rgb(27 27 27 / .05);
         md 0 8px 24px rgb(27 27 27 / .10); lg 0 18px 48px rgb(27 27 27 / .15)
radius: 0.375rem
```

- [ ] **Step 2: Replace the dark foundation and semantic values**

Keep every existing token declaration and declaration order. Replace values according to this complete mapping:

```text
surface: canvas #181818; base #202020; raised/control #242424; overlay #292929;
         muted #242424; hover/control-hover #292929
text: primary #ededed; secondary-strong #d6d6d6; secondary #949494;
      selected-secondary #c7c7c7; disabled #686868
border: subtle #2b2b2b; default #343434; strong #505050
focus: #949494
primary: background #ededed; foreground #181818
danger: background #e05a5a; foreground #250808
accent: hex/text #ededed; rgb 237 237 237; selection alpha .12;
        surface alpha .08; border alpha .20
warning: text #d3a64f; rgb 211 166 79; surface .13; border .34
success: text #62b47d; rgb 98 180 125; surface .12; border .32
danger status: text #e66b6b; rgb 230 107 107; surface .12; border .34
activity: hex #8fb4d8; rgb 143 180 216; surface .14; border .38
bell: keep #c59be8 and rgb 197 155 232; surface .14; border .38
overlay scrim: rgb(0 0 0 / 0.56)
shadows: xs 0 1px 1px rgb(0 0 0 / .22); sm 0 1px 2px rgb(0 0 0 / .30);
         md 0 8px 24px rgb(0 0 0 / .40); lg 0 18px 48px rgb(0 0 0 / .50)
radius: 0.375rem
```

### Task 3: Repaint Cursor Regions And Terminal

**Files:**
- Modify: `src/web/theme/themes/cursor.css:83`

- [ ] **Step 1: Apply light app-region values**

```text
app/pane/detail #f7f7f5; topbar #f1f1ef; topbar border #d8d8d4;
toolbar #f7f7f5; tab transparent; tab hover #f5f5f3; tab active #ffffff;
sidebar #ececea; pane header #f1f1ef; card #ffffff;
row hover #e6e6e3; selected rgb(var(--goblin-accent-rgb) / .10); selected fg #1b1b1b;
control #ffffff; control hover #e6e6e3; control border #bdbdb8;
control/brand radii 0.375rem; divider strength .7
```

- [ ] **Step 2: Apply dark app-region values**

```text
app/pane/detail #181818; topbar #1d1d1d; topbar border #343434;
toolbar #242424; tab transparent; tab hover #292929; tab active #303030;
sidebar #202020; pane header #202020; card #242424;
row hover #292929; selected rgb(var(--goblin-accent-rgb) / .12); selected fg #ededed;
control #242424; control hover #292929; control border #505050;
control/brand radii 0.375rem; divider strength .8
```

- [ ] **Step 3: Apply synchronized terminal values**

Use these complete terminal palettes while leaving the classic block unchanged:

```text
light: background #ffffff; foreground/cursor #1b1b1b; selection rgba(27,27,27,.16);
black #1b1b1b; red #b83232; green #287a45; yellow #8a6518;
blue #5b7fa3; magenta #7c4ab0; cyan #397c7c; white #73736f;
bright-black #a0a09b; bright-red #d65353; bright-green #3f9960;
bright-yellow #b18735; bright-blue #7b9dbc; bright-magenta #9b6bc8;
bright-cyan #579898; bright-white #1b1b1b;
search #d3a64f; active #5b7fa3; border #1b1b1b

dark: background #181818; foreground/cursor #ededed; selection rgba(237,237,237,.18);
black #181818; red #e66b6b; green #62b47d; yellow #d3a64f;
blue #8fb4d8; magenta #c59be8; cyan #79b9b9; white #c7c7c7;
bright-black #686868; bright-red #f18b8b; bright-green #83cc99;
bright-yellow #e4bd70; bright-blue #acc9e4; bright-magenta #d8b7f1;
bright-cyan #9bd1d1; bright-white #ffffff;
search #d3a64f; active #8fb4d8; border #ededed
```

- [ ] **Step 4: Run focused tests and verify green state**

Run:

```bash
bun run test src/web/theme/theme-presets.test.ts src/web/components/terminal/terminal-theme.test.ts
```

Expected: both files PASS, including Cursor token, contrast, topbar, and real terminal assertions.

### Task 4: Full Verification

**Files:**
- Verify only; no planned source changes.

- [ ] **Step 1: Run theme contract tests**

```bash
bun run test src/web/theme/theme-contract.test.ts src/web/theme/theme-presets.test.ts src/web/components/terminal/terminal-theme.test.ts
```

Expected: all selected test files PASS.

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck
```

Expected: all projects pass with exit code 0.

- [ ] **Step 3: Run architecture guard**

```bash
bun run check:architecture
```

Expected: architecture check passes with exit code 0.

- [ ] **Step 4: Inspect the scoped diff**

```bash
git diff -- src/web/theme/themes/cursor.css src/web/theme/theme-presets.test.ts src/web/components/terminal/terminal-theme.test.ts
```

Expected: only Cursor expectations and Cursor theme values changed; `claude.css`, component code, and classic terminal tokens are untouched.

## Safety Constraint

Do not commit or stage changes unless the user separately gives explicit confirmation for that Git operation.
