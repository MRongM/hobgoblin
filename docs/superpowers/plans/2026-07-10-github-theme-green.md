# GitHub Theme Green Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace blue accent and topbar tokens in `github.css` with a light-green/dark-green scheme, then update the companion test expectations.

**Architecture:** Pure CSS token replacement in one file (`src/web/theme/themes/github.css`). No component logic changes, no new tokens, no new CSS files. Update the companion test expectations in `theme-presets.test.ts` to match new values. The "GitHub vs macOS distinction" test is updated to assert topbar luminance difference (light green vs macOS light gray) rather than the old dark-vs-light check.

**Tech Stack:** CSS custom properties, Vitest, Bun.

---

## File Map

- Modify: `src/web/theme/themes/github.css` — replace accent and topbar tokens in both light and dark selector blocks
- Modify: `src/web/theme/theme-presets.test.ts` — update three GitHub-specific assertion blocks

---

## Task 1: Update accent and topbar tokens — light mode

**Files:**
- Modify: `src/web/theme/themes/github.css`

- [ ] **Step 1: Replace `--goblin-focus-ring` in the light block**

In `html[data-color-theme='github'][data-theme='light']`:

Find:
```css
  --goblin-focus-ring: #0969da;
```
Replace with:
```css
  --goblin-focus-ring: #1a7f37;
```

- [ ] **Step 2: Replace the three accent tokens in the light block**

Find:
```css
  --goblin-accent: #0969da;
  --goblin-accent-text: #0969da;
  --goblin-accent-rgb: 9 105 218;
```
Replace with:
```css
  --goblin-accent: #1a7f37;
  --goblin-accent-text: #1a7f37;
  --goblin-accent-rgb: 26 127 55;
```

The derived tokens `--goblin-accent-selection`, `--goblin-accent-surface`, and `--goblin-accent-border` use `rgb(var(--goblin-accent-rgb) / alpha)` and update automatically — do not touch them.

- [ ] **Step 3: Replace the eight topbar tokens in the light block**

Find:
```css
  --goblin-topbar-bg: #24292f;
  --goblin-topbar-border: #30363d;
  --goblin-topbar-fg: #f0f6fc;
  --goblin-topbar-muted-fg: #b1bac4;
  --goblin-topbar-control-bg: #30363d;
  --goblin-topbar-control-hover-bg: #3d444d;
  --goblin-topbar-control-border: #57606a;
  --goblin-topbar-control-fg: #f0f6fc;
```
Replace with:
```css
  --goblin-topbar-bg: #dcfce7;
  --goblin-topbar-border: #bbf7d0;
  --goblin-topbar-fg: #1f2328;
  --goblin-topbar-muted-fg: #59636e;
  --goblin-topbar-control-bg: #bbf7d0;
  --goblin-topbar-control-hover-bg: #a7f3d0;
  --goblin-topbar-control-border: #6ee7b7;
  --goblin-topbar-control-fg: #1f2328;
```

- [ ] **Step 4: Replace terminal selection background in the light block**

Find:
```css
  --color-terminal-selection-background: rgba(9, 105, 218, 0.18);
```
Replace with:
```css
  --color-terminal-selection-background: rgba(26, 127, 55, 0.18);
```

---

## Task 2: Update accent and topbar tokens — dark mode

**Files:**
- Modify: `src/web/theme/themes/github.css`

- [ ] **Step 1: Replace `--goblin-focus-ring` in the dark block**

In `html[data-color-theme='github'][data-theme='dark']`:

Find:
```css
  --goblin-focus-ring: #58a6ff;
```
Replace with:
```css
  --goblin-focus-ring: #3fb950;
```

- [ ] **Step 2: Replace the three accent tokens in the dark block**

Find:
```css
  --goblin-accent: #58a6ff;
  --goblin-accent-text: #58a6ff;
  --goblin-accent-rgb: 88 166 255;
```
Replace with:
```css
  --goblin-accent: #3fb950;
  --goblin-accent-text: #3fb950;
  --goblin-accent-rgb: 63 185 80;
```

- [ ] **Step 3: Replace the eight topbar tokens in the dark block**

Find:
```css
  --goblin-topbar-bg: #010409;
  --goblin-topbar-border: #30363d;
  --goblin-topbar-fg: #f0f6fc;
  --goblin-topbar-muted-fg: #8b949e;
  --goblin-topbar-control-bg: #161b22;
  --goblin-topbar-control-hover-bg: #21262d;
  --goblin-topbar-control-border: #30363d;
  --goblin-topbar-control-fg: #f0f6fc;
```
Replace with:
```css
  --goblin-topbar-bg: #0d2818;
  --goblin-topbar-border: #1a4028;
  --goblin-topbar-fg: #e6edf3;
  --goblin-topbar-muted-fg: #8b949e;
  --goblin-topbar-control-bg: #112210;
  --goblin-topbar-control-hover-bg: #1a3520;
  --goblin-topbar-control-border: #2d5a3d;
  --goblin-topbar-control-fg: #e6edf3;
```

- [ ] **Step 4: Replace terminal selection background in the dark block**

Find:
```css
  --color-terminal-selection-background: rgba(47, 129, 247, 0.28);
```
Replace with:
```css
  --color-terminal-selection-background: rgba(63, 185, 80, 0.28);
```

---

## Task 3: Update test expectations — TOPBAR_CHROME map

**Files:**
- Modify: `src/web/theme/theme-presets.test.ts`

- [ ] **Step 1: Update the `github` entry in the `TOPBAR_CHROME` constant**

Find:
```ts
  github: {
    light: {
      topbar: '#24292f',
      border: '#30363d',
      toolbar: '#eaeef2',
      tabHover: '#f6f8fa',
      tabActive: '#ffffff',
    },
    dark: {
      topbar: '#010409',
      border: '#30363d',
      toolbar: '#161b22',
      tabHover: '#161b22',
      tabActive: '#21262d',
    },
  },
```
Replace with:
```ts
  github: {
    light: {
      topbar: '#dcfce7',
      border: '#bbf7d0',
      toolbar: '#eaeef2',
      tabHover: '#f6f8fa',
      tabActive: '#ffffff',
    },
    dark: {
      topbar: '#0d2818',
      border: '#1a4028',
      toolbar: '#161b22',
      tabHover: '#161b22',
      tabActive: '#21262d',
    },
  },
```

---

## Task 4: Update test expectations — "approved GitHub Primer Header palette" test

**Files:**
- Modify: `src/web/theme/theme-presets.test.ts`

- [ ] **Step 1: Update the light topbar assertions**

Find:
```ts
    expect(cssTokenValue(light, '--goblin-topbar-bg')).toBe('#24292f')
    expect(cssTokenValue(light, '--goblin-topbar-fg')).toBe('#f0f6fc')
    expect(cssTokenValue(light, '--goblin-topbar-muted-fg')).toBe('#b1bac4')
    expect(cssTokenValue(light, '--goblin-topbar-control-bg')).toBe('#30363d')
    expect(cssTokenValue(light, '--goblin-topbar-control-hover-bg')).toBe('#3d444d')
    expect(cssTokenValue(light, '--goblin-topbar-control-border')).toBe('#57606a')
    expect(cssTokenValue(light, '--goblin-topbar-control-fg')).toBe('#f0f6fc')
```
Replace with:
```ts
    expect(cssTokenValue(light, '--goblin-topbar-bg')).toBe('#dcfce7')
    expect(cssTokenValue(light, '--goblin-topbar-fg')).toBe('#1f2328')
    expect(cssTokenValue(light, '--goblin-topbar-muted-fg')).toBe('#59636e')
    expect(cssTokenValue(light, '--goblin-topbar-control-bg')).toBe('#bbf7d0')
    expect(cssTokenValue(light, '--goblin-topbar-control-hover-bg')).toBe('#a7f3d0')
    expect(cssTokenValue(light, '--goblin-topbar-control-border')).toBe('#6ee7b7')
    expect(cssTokenValue(light, '--goblin-topbar-control-fg')).toBe('#1f2328')
```

- [ ] **Step 2: Update the light accent assertion**

Find:
```ts
    expect(cssTokenValue(light, '--goblin-accent')).toBe('#0969da')
```
Replace with:
```ts
    expect(cssTokenValue(light, '--goblin-accent')).toBe('#1a7f37')
```

- [ ] **Step 3: Update the dark topbar assertions**

Find:
```ts
    expect(cssTokenValue(dark, '--goblin-topbar-bg')).toBe('#010409')
    expect(cssTokenValue(dark, '--goblin-topbar-fg')).toBe('#f0f6fc')
    expect(cssTokenValue(dark, '--goblin-topbar-muted-fg')).toBe('#8b949e')
    expect(cssTokenValue(dark, '--goblin-topbar-control-bg')).toBe('#161b22')
    expect(cssTokenValue(dark, '--goblin-topbar-control-hover-bg')).toBe('#21262d')
    expect(cssTokenValue(dark, '--goblin-topbar-control-border')).toBe('#30363d')
    expect(cssTokenValue(dark, '--goblin-topbar-control-fg')).toBe('#f0f6fc')
```
Replace with:
```ts
    expect(cssTokenValue(dark, '--goblin-topbar-bg')).toBe('#0d2818')
    expect(cssTokenValue(dark, '--goblin-topbar-fg')).toBe('#e6edf3')
    expect(cssTokenValue(dark, '--goblin-topbar-muted-fg')).toBe('#8b949e')
    expect(cssTokenValue(dark, '--goblin-topbar-control-bg')).toBe('#112210')
    expect(cssTokenValue(dark, '--goblin-topbar-control-hover-bg')).toBe('#1a3520')
    expect(cssTokenValue(dark, '--goblin-topbar-control-border')).toBe('#2d5a3d')
    expect(cssTokenValue(dark, '--goblin-topbar-control-fg')).toBe('#e6edf3')
```

- [ ] **Step 4: Update the dark accent assertion**

Find:
```ts
    expect(cssTokenValue(dark, '--goblin-accent')).toBe('#58a6ff')
```
Replace with:
```ts
    expect(cssTokenValue(dark, '--goblin-accent')).toBe('#3fb950')
```

---

## Task 5: Update test expectations — "GitHub vs macOS distinction" test

**Files:**
- Modify: `src/web/theme/theme-presets.test.ts`

The existing test asserts `githubTopbar <= 0.05` (very dark). After the change, GitHub light topbar is `#dcfce7` (luminance ~0.72), which is clearly distinguishable from macOS light topbar (`#f5f5f7`, luminance ~0.96) by color (green vs neutral), but not by luminance threshold alone.

The test should be updated to assert the **accent color** is green (not blue), which is the real distinguishing identity of the new design, plus a looser topbar luminance gap or a hue check.

- [ ] **Step 1: Update the GitHub vs macOS distinction test**

Find:
```ts
  test('keeps GitHub light chrome visibly separated from macOS', () => {
    const github = selectorBlock(readThemeCss('github'), 'github', 'light')
    const macos = selectorBlock(readThemeCss('macos'), 'macos', 'light')
    const githubTopbar = relativeLuminance(parseHexRgb(cssTokenValue(github, '--goblin-topbar-bg')))
    const macosTopbar = relativeLuminance(parseHexRgb(cssTokenValue(macos, '--goblin-topbar-bg')))

    expect(githubTopbar).toBeLessThanOrEqual(0.05)
    expect(macosTopbar).toBeGreaterThanOrEqual(0.7)
    expect(macosTopbar - githubTopbar).toBeGreaterThanOrEqual(0.65)
    expect(cssTokenValue(github, '--goblin-action-primary')).toBe('#1f883d')
    expect(cssTokenValue(macos, '--goblin-action-primary')).toBe('#0066cc')
  })
```
Replace with:
```ts
  test('keeps GitHub light chrome visibly separated from macOS', () => {
    const github = selectorBlock(readThemeCss('github'), 'github', 'light')
    const macos = selectorBlock(readThemeCss('macos'), 'macos', 'light')

    // GitHub topbar is green-tinted; macOS topbar is neutral light gray — different hues
    expect(cssTokenValue(github, '--goblin-topbar-bg')).toBe('#dcfce7')
    expect(cssTokenValue(macos, '--goblin-topbar-bg')).not.toBe('#dcfce7')

    // GitHub uses green accent; macOS uses blue accent
    expect(cssTokenValue(github, '--goblin-accent')).toBe('#1a7f37')
    expect(cssTokenValue(macos, '--goblin-accent')).not.toBe('#1a7f37')

    // Primary action colors remain distinct
    expect(cssTokenValue(github, '--goblin-action-primary')).toBe('#1f883d')
    expect(cssTokenValue(macos, '--goblin-action-primary')).toBe('#0066cc')
  })
```

---

## Task 6: Run tests and verify

- [ ] **Step 1: Run the GitHub-specific tests**

```bash
cd /Users/longjiang/src/tries/2026-06-13-hobgoblin/hobgoblin-opt-color
bun run test src/web/theme/theme-presets.test.ts
```

Expected: all tests pass. If any fail, check which assertion is wrong and trace back to the CSS token value that doesn't match.

- [ ] **Step 2: Run the full test suite**

```bash
bun run test
```

Expected: no regressions in other theme tests. The only changed tests should be the GitHub-specific ones updated in Tasks 3–5.

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck
```

Expected: no errors.

---

## Acceptance Criteria

1. GitHub light mode shows a soft green topbar (`#dcfce7`) with dark text — visually distinct from macOS's neutral topbar.
2. GitHub dark mode shows a deep forest green topbar (`#0d2818`) with light text.
3. Focus rings, selected rows, and active states use green (`#1a7f37` light / `#3fb950` dark).
4. Primary action buttons remain unchanged (`#1f883d` light / `#238636` dark).
5. Terminal ANSI colors are unchanged.
6. Terminal text selection highlight is green-tinted in both modes.
7. All tests pass. No other theme is affected.
