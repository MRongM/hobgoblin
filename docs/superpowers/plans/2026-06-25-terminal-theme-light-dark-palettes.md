# Terminal Theme Light Dark Palettes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every terminal color theme provide a brand-matched light palette and dark palette through existing CSS terminal tokens.

**Architecture:** Keep the current `data-color-theme` plus `data-theme` token pipeline. Strengthen tests so each theme must expose distinct light/dark terminal backgrounds, then update only CSS terminal tokens for themes whose light terminal palette is currently dark.

**Tech Stack:** CSS custom properties, TypeScript strip-only mode, Vitest, jsdom, xterm.js theme adapter, Bun.

---

## Project Constraints

- Do not use TypeScript enums, runtime namespaces, parameter properties, or import aliases.
- Use repo-alias imports with explicit `.ts` / `.tsx` extensions.
- Keep theme palette values in `src/web/theme/themes/*.css`; do not add TypeScript palette tables.
- Do not add React branches based on theme IDs.
- Do not change `terminalThemeSyncEnabled` behavior.
- Do not add git commit steps. Project instructions say not to plan or execute git commits unless the user explicitly requests them.

## File Map

- Modify: `src/web/theme/theme-presets.test.ts`
  - Responsibility: enforce complete terminal token coverage and distinct light/dark terminal backgrounds for every theme.
- Modify: `src/web/components/terminal/terminal-theme.test.ts`
  - Responsibility: verify real preset CSS resolves through `terminalThemeForCurrentDocument()` for corrected light and dark palettes.
- Modify: `src/web/theme/themes/claude.css`
  - Responsibility: provide a warm light terminal palette and keep a warm dark terminal palette.
- Modify: `src/web/theme/themes/airbnb.css`
  - Responsibility: provide a clean light terminal palette with Airbnb red accents and keep a dark charcoal palette.
- Modify: `src/web/theme/themes/bmw.css`
  - Responsibility: provide a sharp high-contrast light terminal palette and keep a black dark palette.
- Modify: `src/web/theme/themes/macos.css`
  - Responsibility: provide an Apple-style light terminal palette and keep a black dark palette.

Existing working palettes in `cursor.css`, `github.css`, and `mono.css` are used as references and should not be changed unless a test exposes a real coverage issue.

---

### Task 1: Add Failing Theme Contract Coverage

**Files:**
- Modify: `src/web/theme/theme-presets.test.ts`

- [ ] **Step 1: Add terminal background parsing helpers**

In `src/web/theme/theme-presets.test.ts`, add these helpers after `selectorBlock()`:

```ts
function cssTokenValue(block: string, token: string): string {
  const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = block.match(new RegExp(`${escapedToken}:\\s*([^;]+);`))
  expect(match, `${token} is defined`).not.toBeNull()
  return match![1]!.trim()
}

function hexLuminance(hex: string): number {
  const match = hex.match(/^#([0-9a-f]{6})$/i)
  expect(match, `expected six-digit hex color, got ${hex}`).not.toBeNull()
  const value = match![1]!
  const red = Number.parseInt(value.slice(0, 2), 16) / 255
  const green = Number.parseInt(value.slice(2, 4), 16) / 255
  const blue = Number.parseInt(value.slice(4, 6), 16) / 255
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}
```

- [ ] **Step 2: Add distinct light/dark terminal background contract**

In `src/web/theme/theme-presets.test.ts`, add this test inside `describe('theme preset css contracts', () => { ... })`, after `defines complete light and dark token blocks for every color theme`:

```ts
test('uses distinct light and dark terminal backgrounds for every color theme', () => {
  for (const colorTheme of COLOR_THEMES) {
    const css = readThemeCss(colorTheme)
    const light = selectorBlock(css, colorTheme, 'light')
    const dark = selectorBlock(css, colorTheme, 'dark')
    const lightBackground = cssTokenValue(light, '--color-terminal-background')
    const darkBackground = cssTokenValue(dark, '--color-terminal-background')

    expect(lightBackground, `${colorTheme} terminal light/dark backgrounds differ`).not.toBe(darkBackground)
    expect(hexLuminance(lightBackground), `${colorTheme} light terminal background is light`).toBeGreaterThan(0.72)
    expect(hexLuminance(darkBackground), `${colorTheme} dark terminal background is dark`).toBeLessThan(0.28)
  }
})
```

- [ ] **Step 3: Update the macOS contract expectation**

In the existing `keeps macos aligned with the Apple-style preset role` test, replace this expectation:

```ts
expect(light).toContain('--color-terminal-background: #272729;')
```

with:

```ts
expect(light).toContain('--color-terminal-background: #fbfbfd;')
```

- [ ] **Step 4: Run the contract test and verify it fails before CSS changes**

Run:

```bash
bun run test -- src/web/theme/theme-presets.test.ts
```

Expected before CSS changes:

```text
FAIL src/web/theme/theme-presets.test.ts
```

At least `claude`, `airbnb`, `bmw`, or `macos` should fail because the current light terminal background is dark or equals the dark terminal background.

---

### Task 2: Add Real Preset Resolution Coverage

**Files:**
- Modify: `src/web/components/terminal/terminal-theme.test.ts`

- [ ] **Step 1: Update the Claude light preset expectation**

In `src/web/components/terminal/terminal-theme.test.ts`, replace the `reads real preset terminal tokens from selected color theme css` test body with:

```ts
test('reads real preset terminal tokens from selected color theme css', () => {
  installRealTerminalPresetStyles('claude')
  document.documentElement.setAttribute('data-theme', 'light')
  document.documentElement.setAttribute('data-color-theme', 'claude')

  expect(terminalThemeForCurrentDocument()).toMatchObject({
    background: '#faf9f5',
    foreground: '#141413',
    cursor: '#141413',
    blue: '#496f9f',
  })
})
```

- [ ] **Step 2: Add corrected light palette coverage for another brand theme**

Add this test after the Claude real preset test:

```ts
test('reads corrected BMW light terminal tokens from real preset css', () => {
  installRealTerminalPresetStyles('bmw')
  document.documentElement.setAttribute('data-theme', 'light')
  document.documentElement.setAttribute('data-color-theme', 'bmw')

  expect(terminalThemeForCurrentDocument()).toMatchObject({
    background: '#ffffff',
    foreground: '#0d0d0d',
    cursor: '#0d0d0d',
    blue: '#1c69d4',
  })
})
```

- [ ] **Step 3: Add dark palette coverage to prove mode selection still works**

Add this test after the BMW light test:

```ts
test('reads dark terminal tokens from real preset css when app theme is dark', () => {
  installRealTerminalPresetStyles('airbnb')
  document.documentElement.setAttribute('data-theme', 'dark')
  document.documentElement.setAttribute('data-color-theme', 'airbnb')

  expect(terminalThemeForCurrentDocument()).toMatchObject({
    background: '#111111',
    foreground: '#ffffff',
    cursor: '#ffffff',
    blue: '#76a9ff',
  })
})
```

- [ ] **Step 4: Run terminal theme tests and verify the new light expectations fail before CSS changes**

Run:

```bash
bun run test -- src/web/components/terminal/terminal-theme.test.ts
```

Expected before CSS changes:

```text
FAIL src/web/components/terminal/terminal-theme.test.ts
```

The Claude and BMW light expectations should fail until their CSS terminal tokens are corrected.

---

### Task 3: Update Light Terminal Palettes In Theme CSS

**Files:**
- Modify: `src/web/theme/themes/claude.css`
- Modify: `src/web/theme/themes/airbnb.css`
- Modify: `src/web/theme/themes/bmw.css`
- Modify: `src/web/theme/themes/macos.css`

- [ ] **Step 1: Replace Claude light terminal tokens**

In `src/web/theme/themes/claude.css`, inside `html[data-color-theme='claude'][data-theme='light']`, replace the existing `--color-terminal-*` declarations with:

```css
  --color-terminal-background: #faf9f5;
  --color-terminal-foreground: #141413;
  --color-terminal-cursor: #141413;
  --color-terminal-selection-background: rgba(204, 120, 92, 0.18);
  --color-terminal-ansi-black: #141413;
  --color-terminal-ansi-red: #c64545;
  --color-terminal-ansi-green: #237244;
  --color-terminal-ansi-yellow: #9f6a00;
  --color-terminal-ansi-blue: #496f9f;
  --color-terminal-ansi-magenta: #8c5fa8;
  --color-terminal-ansi-cyan: #2f7d72;
  --color-terminal-ansi-white: #6c6a64;
  --color-terminal-ansi-bright-black: #9a958d;
  --color-terminal-ansi-bright-red: #e06a5f;
  --color-terminal-ansi-bright-green: #3f9f64;
  --color-terminal-ansi-bright-yellow: #c47a2c;
  --color-terminal-ansi-bright-blue: #6f9fd8;
  --color-terminal-ansi-bright-magenta: #b58ad7;
  --color-terminal-ansi-bright-cyan: #4aa696;
  --color-terminal-ansi-bright-white: #141413;
  --color-terminal-search-match: #d4a017;
  --color-terminal-search-active-match: #cc785c;
  --color-terminal-search-active-border: #141413;
```

- [ ] **Step 2: Replace Airbnb light terminal tokens**

In `src/web/theme/themes/airbnb.css`, inside `html[data-color-theme='airbnb'][data-theme='light']`, replace the existing `--color-terminal-*` declarations with:

```css
  --color-terminal-background: #ffffff;
  --color-terminal-foreground: #222222;
  --color-terminal-cursor: #222222;
  --color-terminal-selection-background: rgba(255, 56, 92, 0.18);
  --color-terminal-ansi-black: #222222;
  --color-terminal-ansi-red: #e00b41;
  --color-terminal-ansi-green: #1f7f37;
  --color-terminal-ansi-yellow: #9a6700;
  --color-terminal-ansi-blue: #3973e6;
  --color-terminal-ansi-magenta: #a51550;
  --color-terminal-ansi-cyan: #007a87;
  --color-terminal-ansi-white: #6a6a6a;
  --color-terminal-ansi-bright-black: #929292;
  --color-terminal-ansi-bright-red: #ff385c;
  --color-terminal-ansi-bright-green: #0fa336;
  --color-terminal-ansi-bright-yellow: #f4b400;
  --color-terminal-ansi-bright-blue: #428bff;
  --color-terminal-ansi-bright-magenta: #b64f7b;
  --color-terminal-ansi-bright-cyan: #007a87;
  --color-terminal-ansi-bright-white: #222222;
  --color-terminal-search-match: #f4b400;
  --color-terminal-search-active-match: #ff385c;
  --color-terminal-search-active-border: #222222;
```

- [ ] **Step 3: Replace BMW light terminal tokens**

In `src/web/theme/themes/bmw.css`, inside `html[data-color-theme='bmw'][data-theme='light']`, replace the existing `--color-terminal-*` declarations with:

```css
  --color-terminal-background: #ffffff;
  --color-terminal-foreground: #0d0d0d;
  --color-terminal-cursor: #0d0d0d;
  --color-terminal-selection-background: rgba(28, 105, 212, 0.2);
  --color-terminal-ansi-black: #0d0d0d;
  --color-terminal-ansi-red: #c42116;
  --color-terminal-ansi-green: #0b7a2b;
  --color-terminal-ansi-yellow: #8a6400;
  --color-terminal-ansi-blue: #1c69d4;
  --color-terminal-ansi-magenta: #6a4bd8;
  --color-terminal-ansi-cyan: #0066b1;
  --color-terminal-ansi-white: #5a5a5a;
  --color-terminal-ansi-bright-black: #7e7e7e;
  --color-terminal-ansi-bright-red: #e22718;
  --color-terminal-ansi-bright-green: #0fa336;
  --color-terminal-ansi-bright-yellow: #f4b400;
  --color-terminal-ansi-bright-blue: #0653b6;
  --color-terminal-ansi-bright-magenta: #7a5cff;
  --color-terminal-ansi-bright-cyan: #0066b1;
  --color-terminal-ansi-bright-white: #0d0d0d;
  --color-terminal-search-match: #f4b400;
  --color-terminal-search-active-match: #1c69d4;
  --color-terminal-search-active-border: #0d0d0d;
```

- [ ] **Step 4: Replace macOS light terminal tokens**

In `src/web/theme/themes/macos.css`, inside the light selector block that includes `html[data-color-theme='macos'][data-theme='light']`, replace the existing `--color-terminal-*` declarations with:

```css
  --color-terminal-background: #fbfbfd;
  --color-terminal-foreground: #1d1d1f;
  --color-terminal-cursor: #1d1d1f;
  --color-terminal-selection-background: rgba(0, 102, 204, 0.18);
  --color-terminal-ansi-black: #000000;
  --color-terminal-ansi-red: #d70015;
  --color-terminal-ansi-green: #1f7f37;
  --color-terminal-ansi-yellow: #946200;
  --color-terminal-ansi-blue: #0066cc;
  --color-terminal-ansi-magenta: #af52de;
  --color-terminal-ansi-cyan: #007c89;
  --color-terminal-ansi-white: #7a7a7a;
  --color-terminal-ansi-bright-black: #8f8f94;
  --color-terminal-ansi-bright-red: #ff3b30;
  --color-terminal-ansi-bright-green: #34c759;
  --color-terminal-ansi-bright-yellow: #ff9500;
  --color-terminal-ansi-bright-blue: #0071e3;
  --color-terminal-ansi-bright-magenta: #bf5af2;
  --color-terminal-ansi-bright-cyan: #32ade6;
  --color-terminal-ansi-bright-white: #1d1d1f;
  --color-terminal-search-match: #ff9500;
  --color-terminal-search-active-match: #0066cc;
  --color-terminal-search-active-border: #1d1d1f;
```

- [ ] **Step 5: Run the focused tests and verify they pass**

Run:

```bash
bun run test -- src/web/theme/theme-presets.test.ts src/web/components/terminal/terminal-theme.test.ts
```

Expected after CSS changes:

```text
PASS src/web/theme/theme-presets.test.ts
PASS src/web/components/terminal/terminal-theme.test.ts
```

---

### Task 4: Final Verification

**Files:**
- Verify only, no file modifications expected.

- [ ] **Step 1: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected:

```text
exit code 0
```

- [ ] **Step 2: Run the full test suite if focused tests changed shared behavior**

Run:

```bash
bun run test
```

Expected:

```text
exit code 0
```

- [ ] **Step 3: Inspect changed files**

Run:

```bash
git diff -- src/web/theme/theme-presets.test.ts src/web/components/terminal/terminal-theme.test.ts src/web/theme/themes/claude.css src/web/theme/themes/airbnb.css src/web/theme/themes/bmw.css src/web/theme/themes/macos.css docs/superpowers/plans/2026-06-25-terminal-theme-light-dark-palettes.md
```

Expected:

- Only the planned test, CSS token, and plan file changes are present.
- No TypeScript palette table was added.
- No React component branches on theme IDs were added.
- No classic terminal token values were changed.

---

## Self-Review Notes

- Spec coverage: the plan covers every requirement from `docs/superpowers/specs/2026-06-25-terminal-theme-light-dark-palettes-design.md`.
- Scope: changes are limited to CSS terminal tokens and tests.
- Ambiguity resolved: every app color theme must have a light terminal background in light mode and a dark terminal background in dark mode.
- Commit behavior: omitted by design to follow repository instructions.
