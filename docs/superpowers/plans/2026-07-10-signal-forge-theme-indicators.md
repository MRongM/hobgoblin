# Signal Forge Theme Indicators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `signal` and `forge` theme presets and make terminal output activity plus unread bell indicators use theme-aware colors.

**Architecture:** Extend the existing `data-theme` plus `data-color-theme` CSS token system. Keep theme IDs centralized in `src/shared/color-theme.ts`, render preset palettes through `src/web/theme/themes/*.css`, and expose indicator colors through semantic Tailwind v4 tokens in `src/web/theme/contract.css`. React components must stay theme-ID agnostic.

**Tech Stack:** TypeScript strip-only mode, React renderer, Tailwind v4 token CSS, Electron main process, Valibot schemas, Vitest, Bun.

---

## Project Constraints

- Do not use TypeScript enums, namespaces with runtime code, parameter properties, or import aliases.
- Use repo-alias imports with explicit `.ts` / `.tsx` extensions.
- Keep palette values in CSS files; do not introduce TypeScript palette tables.
- Do not add package dependencies.
- Do not add git commit steps. Project instructions say not to plan or execute git commits unless the user explicitly requests them.
- Use `bun run typecheck` and focused `bun run test ...` commands for verification.

## Scope Check

The spec touches one subsystem: the theme token system and the small terminal indicator components that consume theme tokens. This is appropriate for one implementation plan because the new theme IDs, CSS presets, window background mappings, i18n labels, and indicator tokens must ship together to keep settings, first paint, and runtime rendering consistent.

## File Map

- Modify: `src/shared/color-theme.ts`
  - Add `signal` and `forge` to the shared allowlist.
- Modify: `src/shared/color-theme.test.ts`
  - Assert the new allowlist order and validation behavior.
- Modify: `src/web/public/boot.js`
  - Add `signal` and `forge` to the pre-React allowlist.
- Modify: `src/web/public/boot.test.ts`
  - Existing sync test should fail before `boot.js` is updated and pass after.
- Modify: `src/shared/theme-tokens.ts`
  - Add native window backgrounds for `signal` and `forge`.
- Modify: `src/shared/theme-tokens.test.ts`
  - Existing coverage test should fail before backgrounds are added and pass after.
- Modify: `src/web/theme/contract.css`
  - Add Tailwind v4 semantic color aliases for terminal activity and terminal bell.
- Modify: `src/web/theme/theme-contract.test.ts`
  - Assert terminal activity and bell aliases exist.
- Modify: `src/web/theme/theme-presets.test.ts`
  - Add required goblin indicator tokens and topbar expectations for the two new presets.
- Create: `src/web/theme/themes/signal.css`
  - Signal light/dark CSS token preset.
- Create: `src/web/theme/themes/forge.css`
  - Forge light/dark CSS token preset.
- Modify: `src/web/theme/theme.css`
  - Import the two new preset CSS files.
- Modify: `src/shared/i18n/en.ts`
  - Add English theme labels.
- Modify: `src/shared/i18n/zh.ts`
  - Add Chinese theme labels.
- Modify: `src/shared/i18n/ko.ts`
  - Add Korean theme labels.
- Modify: `src/shared/i18n/ja.ts`
  - Add Japanese theme labels.
- Modify: `src/web/components/terminal/TerminalOutputActivityIndicator.tsx`
  - Replace fixed success colors with terminal activity tokens.
- Modify: `src/web/components/terminal/TerminalOutputActivityIndicator.test.tsx`
  - Assert activity token classes/styles instead of success classes.
- Modify: `src/web/components/terminal/TerminalBellDot.tsx`
  - Replace fixed attention colors with terminal bell tokens.
- Create: `src/web/components/terminal/TerminalBellDot.test.tsx`
  - Cover ping on/off behavior and token classes.

---

### Task 1: Add Failing Theme ID Tests

**Files:**

- Modify: `src/shared/color-theme.test.ts`
- Existing implementation target: `src/shared/color-theme.ts`

- [ ] **Step 1: Update the shared color theme test**

Edit `src/shared/color-theme.test.ts` so the top constant and first two tests read:

```ts
const CURRENT_BRAND_THEMES = ['claude', 'cursor', 'airbnb', 'bmw'] as const
const ORIGINAL_HOBGOBLIN_THEMES = ['signal', 'forge'] as const

describe('color theme presets', () => {
  test('lists current theme presets in settings order', () => {
    expect(COLOR_THEMES).toEqual(['macos', 'mono', 'github', 'claude', 'cursor', 'airbnb', 'bmw', 'signal', 'forge'])
    expect(DEFAULT_COLOR_THEME).toBe('macos')
  })

  test('validates current theme presets only', () => {
    for (const theme of [...CURRENT_BRAND_THEMES, ...ORIGINAL_HOBGOBLIN_THEMES]) {
      expect(isColorTheme(theme)).toBe(true)
    }

    expect(isColorTheme('apple')).toBe(false)
    expect(isColorTheme('default')).toBe(false)
    expect(isColorTheme('claude-dark')).toBe(false)
    expect(isColorTheme(null)).toBe(false)
  })
```

Keep the existing `normalizes legacy apple to macos` test unchanged.

- [ ] **Step 2: Run the failing shared test**

Run:

```bash
bun run test src/shared/color-theme.test.ts
```

Expected: FAIL. The list currently ends at `bmw`, and `isColorTheme('signal')` / `isColorTheme('forge')` return false.

- [ ] **Step 3: Add the shared theme IDs**

Edit `src/shared/color-theme.ts`:

```ts
export const COLOR_THEMES = ['macos', 'mono', 'github', 'claude', 'cursor', 'airbnb', 'bmw', 'signal', 'forge'] as const
```

Do not change `DEFAULT_COLOR_THEME`.

- [ ] **Step 4: Re-run the shared test**

Run:

```bash
bun run test src/shared/color-theme.test.ts
```

Expected: PASS.

---

### Task 2: Add Failing Boot And Native Background Coverage

**Files:**

- Existing test: `src/web/public/boot.test.ts`
- Modify: `src/web/public/boot.js`
- Existing test: `src/shared/theme-tokens.test.ts`
- Modify: `src/shared/theme-tokens.ts`

- [ ] **Step 1: Run existing boot and native token tests**

Run:

```bash
bun run test src/web/public/boot.test.ts src/shared/theme-tokens.test.ts
```

Expected before implementation: FAIL. The tests compare `boot.js` and `WINDOW_BACKGROUND_BY_COLOR_THEME` to `COLOR_THEMES`, which now includes `signal` and `forge`.

- [ ] **Step 2: Update `boot.js` allowlist**

In `src/web/public/boot.js`, replace the allowlist with:

```js
var colorThemes = ['macos', 'mono', 'github', 'claude', 'cursor', 'airbnb', 'bmw', 'signal', 'forge']
```

Keep this existing legacy mapping intact:

```js
if (colorTheme === 'apple') colorTheme = 'macos'
```

- [ ] **Step 3: Add native window backgrounds**

In `src/shared/theme-tokens.ts`, add these entries after `bmw`:

```ts
  signal: {
    light: '#f8fbfb',
    dark: '#0f1b1a',
  },
  forge: {
    light: '#f6f3ec',
    dark: '#18110d',
  },
```

- [ ] **Step 4: Re-run boot and native token tests**

Run:

```bash
bun run test src/web/public/boot.test.ts src/shared/theme-tokens.test.ts
```

Expected: PASS.

---

### Task 3: Add Failing CSS Contract And Theme Preset Tests

**Files:**

- Modify: `src/web/theme/theme-contract.test.ts`
- Modify: `src/web/theme/theme-presets.test.ts`
- Existing implementation targets:
  - `src/web/theme/contract.css`
  - `src/web/theme/theme.css`
  - `src/web/theme/themes/signal.css`
  - `src/web/theme/themes/forge.css`

- [ ] **Step 1: Extend the contract token test**

In `src/web/theme/theme-contract.test.ts`, append these strings to `CONTRACT_TOKENS`:

```ts
  '--color-terminal-activity:',
  '--color-terminal-activity-rgb:',
  '--color-terminal-activity-surface:',
  '--color-terminal-activity-border:',
  '--color-terminal-bell:',
  '--color-terminal-bell-rgb:',
  '--color-terminal-bell-surface:',
  '--color-terminal-bell-border:',
```

- [ ] **Step 2: Add terminal indicator tokens to the preset contract**

In `src/web/theme/theme-presets.test.ts`, add this constant after `APP_REGION_TOKENS`:

```ts
const TERMINAL_INDICATOR_TOKENS = [
  '--goblin-terminal-activity',
  '--goblin-terminal-activity-rgb',
  '--goblin-terminal-activity-surface',
  '--goblin-terminal-activity-border',
  '--goblin-terminal-bell',
  '--goblin-terminal-bell-rgb',
  '--goblin-terminal-bell-surface',
  '--goblin-terminal-bell-border',
] as const
```

Then update the complete-token loop:

```ts
for (const token of [...FOUNDATION_TOKENS, ...APP_REGION_TOKENS, ...TERMINAL_TOKENS]) {
  expect(block, `${colorTheme}/${theme} defines ${token}`).toContain(token)
}
```

to:

```ts
for (const token of [...FOUNDATION_TOKENS, ...APP_REGION_TOKENS, ...TERMINAL_TOKENS, ...TERMINAL_INDICATOR_TOKENS]) {
  expect(block, `${colorTheme}/${theme} defines ${token}`).toContain(token)
}
```

- [ ] **Step 3: Add topbar expectations for Signal and Forge**

In `TOPBAR_BRAND_TINT_EXPECTATIONS`, add these entries after `bmw`:

```ts
  signal: {
    light: {
      topbar: '#c8e4df',
      border: '#95c7bf',
      toolbar: '#ddf0ec',
      tabHover: '#f1f8f6',
      tabActive: '#ffffff',
    },
    dark: {
      topbar: '#102522',
      border: '#2a5a53',
      toolbar: '#1b3934',
      tabHover: '#182d2a',
      tabActive: '#203c38',
    },
  },
  forge: {
    light: {
      topbar: '#ded0ba',
      border: '#c4ad8d',
      toolbar: '#eadfcd',
      tabHover: '#f4eee3',
      tabActive: '#fffdf8',
    },
    dark: {
      topbar: '#211813',
      border: '#63442d',
      toolbar: '#37261b',
      tabHover: '#2b2019',
      tabActive: '#3a2a20',
    },
  },
```

- [ ] **Step 4: Add explicit original-theme identity tests**

Replace the test named `keeps new brand presets aligned with their source design briefs` with:

```ts
test('keeps new brand presets aligned with their source design briefs', () => {
  const airbnbLight = selectorBlock(readThemeCss('airbnb'), 'airbnb', 'light')
  const bmwDark = selectorBlock(readThemeCss('bmw'), 'bmw', 'dark')

  expect(airbnbLight).toContain('--goblin-surface-canvas: #ffffff;')
  expect(airbnbLight).toContain('--goblin-action-primary: #ff385c;')
  expect(airbnbLight).toContain('--goblin-control-radius: 1.25rem;')

  expect(bmwDark).toContain('--goblin-surface-canvas: #000000;')
  expect(bmwDark).toContain('--goblin-action-primary: #ffffff;')
  expect(bmwDark).toContain('--goblin-control-radius: 0rem;')
})

test('keeps original Hobgoblin presets aligned with their design briefs', () => {
  const signalLight = selectorBlock(readThemeCss('signal'), 'signal', 'light')
  const signalDark = selectorBlock(readThemeCss('signal'), 'signal', 'dark')
  const forgeLight = selectorBlock(readThemeCss('forge'), 'forge', 'light')
  const forgeDark = selectorBlock(readThemeCss('forge'), 'forge', 'dark')

  expect(signalLight).toContain('--goblin-surface-canvas: #f8fbfb;')
  expect(signalLight).toContain('--goblin-action-primary: #009b8f;')
  expect(signalLight).toContain('--goblin-terminal-bell: #c78b00;')
  expect(signalDark).toContain('--goblin-surface-canvas: #0f1b1a;')
  expect(signalDark).toContain('--color-terminal-background: #0f2423;')

  expect(forgeLight).toContain('--goblin-surface-canvas: #f6f3ec;')
  expect(forgeLight).toContain('--goblin-action-primary: #b6531c;')
  expect(forgeLight).toContain('--goblin-terminal-bell: #c98a12;')
  expect(forgeDark).toContain('--goblin-surface-canvas: #18110d;')
  expect(forgeDark).toContain('--color-terminal-background: #201813;')
})
```

- [ ] **Step 5: Run failing CSS contract tests**

Run:

```bash
bun run test src/web/theme/theme-contract.test.ts src/web/theme/theme-presets.test.ts
```

Expected: FAIL. The contract aliases do not exist, and `signal.css` / `forge.css` do not exist.

---

### Task 4: Add Failing Terminal Indicator Tests

**Files:**

- Modify: `src/web/components/terminal/TerminalOutputActivityIndicator.test.tsx`
- Create: `src/web/components/terminal/TerminalBellDot.test.tsx`
- Existing implementation targets:
  - `src/web/components/terminal/TerminalOutputActivityIndicator.tsx`
  - `src/web/components/terminal/TerminalBellDot.tsx`

- [ ] **Step 1: Update output activity indicator assertions**

In `src/web/components/terminal/TerminalOutputActivityIndicator.test.tsx`, replace the `border-success` assertion with:

```ts
const ping = indicator?.querySelector('[data-terminal-output-activity-ping]')
const glow = indicator?.querySelector('[data-terminal-output-activity-glow]')
const icon = indicator?.querySelector('svg')

expect(ping?.classList.contains('border-terminal-activity-border')).toBe(true)
expect(ping?.classList.contains('bg-terminal-activity')).toBe(true)
expect(glow?.classList.contains('bg-terminal-activity-surface')).toBe(true)
expect(icon?.classList.contains('text-terminal-activity')).toBe(true)
expect(icon?.classList.contains('text-success')).toBe(false)
```

Keep the existing `animate-pulse` assertion.

- [ ] **Step 2: Add TerminalBellDot tests**

Create `src/web/components/terminal/TerminalBellDot.test.tsx`:

```tsx
// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { TerminalBellDot } from '#/web/components/terminal/TerminalBellDot.tsx'

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  container = null
  root = null
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('TerminalBellDot', () => {
  test('renders a themed unread bell dot with ping by default', () => {
    act(() => {
      root!.render(<TerminalBellDot label="Unread terminal bell" />)
    })

    const dot = document.body.querySelector('[data-terminal-bell-dot]')
    const ping = document.body.querySelector('[data-terminal-bell-ping]')
    const core = document.body.querySelector('[data-terminal-bell-core]')

    expect(dot?.getAttribute('aria-label')).toBe('Unread terminal bell')
    expect(ping).not.toBeNull()
    expect(ping?.classList.contains('bg-terminal-bell')).toBe(true)
    expect(ping?.classList.contains('bg-attention')).toBe(false)
    expect(core?.classList.contains('bg-terminal-bell')).toBe(true)
    expect(core?.classList.contains('bg-attention')).toBe(false)
  })

  test('renders the themed unread bell dot without ping when requested', () => {
    act(() => {
      root!.render(<TerminalBellDot label="Unread terminal bell" ping={false} />)
    })

    expect(document.body.querySelector('[data-terminal-bell-ping]')).toBeNull()
    expect(document.body.querySelector('[data-terminal-bell-core]')?.classList.contains('bg-terminal-bell')).toBe(true)
  })
})
```

- [ ] **Step 3: Run failing indicator tests**

Run:

```bash
bun run test src/web/components/terminal/TerminalOutputActivityIndicator.test.tsx src/web/components/terminal/TerminalBellDot.test.tsx
```

Expected: FAIL. The activity indicator still uses success classes, and `TerminalBellDot` has no data attributes or terminal bell token class.

---

### Task 5: Implement Theme Contract Aliases

**Files:**

- Modify: `src/web/theme/contract.css`

- [ ] **Step 1: Add terminal indicator aliases**

In `src/web/theme/contract.css`, inside the `@theme` block after the existing danger tokens, add:

```css
--color-terminal-activity: var(--goblin-terminal-activity, var(--goblin-accent));
--color-terminal-activity-rgb: var(--goblin-terminal-activity-rgb, var(--goblin-accent-rgb));
--color-terminal-activity-surface: var(--goblin-terminal-activity-surface, var(--goblin-accent-surface));
--color-terminal-activity-border: var(--goblin-terminal-activity-border, var(--goblin-accent-border));
--color-terminal-bell: var(--goblin-terminal-bell, var(--goblin-status-warning-text));
--color-terminal-bell-rgb: var(--goblin-terminal-bell-rgb, var(--goblin-status-warning-rgb));
--color-terminal-bell-surface: var(--goblin-terminal-bell-surface, var(--goblin-status-warning-surface));
--color-terminal-bell-border: var(--goblin-terminal-bell-border, var(--goblin-status-warning-border));
```

- [ ] **Step 2: Run the contract test**

Run:

```bash
bun run test src/web/theme/theme-contract.test.ts
```

Expected: PASS.

---

### Task 6: Implement Terminal Indicator Components

**Files:**

- Modify: `src/web/components/terminal/TerminalOutputActivityIndicator.tsx`
- Modify: `src/web/components/terminal/TerminalBellDot.tsx`

- [ ] **Step 1: Replace activity indicator shadow variables**

In `src/web/components/terminal/TerminalOutputActivityIndicator.tsx`, replace all `--color-success-rgb` references:

```ts
const activeGlowStyle = {
  boxShadow: '0 0 10px rgb(var(--color-terminal-activity-rgb) / 0.82)',
}

const activeIconStyle = {
  filter: 'drop-shadow(0 0 4px rgb(var(--color-terminal-activity-rgb) / 0.9))',
}

const compactGlowStyle = {
  boxShadow: '0 0 5px rgb(var(--color-terminal-activity-rgb) / 0.72)',
}

const compactIconStyle = {
  filter: 'drop-shadow(0 0 2px rgb(var(--color-terminal-activity-rgb) / 0.82))',
}
```

- [ ] **Step 2: Replace activity indicator classes**

In the same file, update the active glow class:

```tsx
'absolute inline-flex animate-pulse rounded-full bg-terminal-activity-surface opacity-100',
```

Update the active ping class:

```tsx
'absolute inline-flex animate-ping rounded-full border border-terminal-activity-border bg-terminal-activity opacity-60',
```

Update the icon class expression:

```tsx
className={cn('relative shrink-0', active ? 'animate-pulse text-terminal-activity' : 'text-current', iconClassName)}
```

- [ ] **Step 3: Replace bell dot classes and add test selectors**

In `src/web/components/terminal/TerminalBellDot.tsx`, replace the component body with:

```tsx
return (
  <span
    role="img"
    aria-label={label}
    title={label}
    data-terminal-bell-dot
    className={cn('relative flex h-2 w-2 shrink-0', className)}
  >
    {ping && (
      <span
        data-terminal-bell-ping
        className="absolute inline-flex h-full w-full animate-ping rounded-full bg-terminal-bell opacity-75"
        aria-hidden="true"
      />
    )}
    <span
      data-terminal-bell-core
      className="relative inline-flex h-2 w-2 rounded-full bg-terminal-bell"
      aria-hidden="true"
    />
  </span>
)
```

- [ ] **Step 4: Run focused indicator tests**

Run:

```bash
bun run test src/web/components/terminal/TerminalOutputActivityIndicator.test.tsx src/web/components/terminal/TerminalBellDot.test.tsx
```

Expected: PASS.

---

### Task 7: Implement Signal And Forge Theme CSS

**Files:**

- Create: `src/web/theme/themes/signal.css`
- Create: `src/web/theme/themes/forge.css`
- Modify: `src/web/theme/theme.css`

- [ ] **Step 1: Import the new theme files**

Append these imports to `src/web/theme/theme.css` after `bmw.css`:

```css
@import './themes/signal.css';
@import './themes/forge.css';
```

- [ ] **Step 2: Create `signal.css` with complete token blocks**

Create `src/web/theme/themes/signal.css` by copying the current `html[data-color-theme='macos']` classic terminal token block from `src/web/theme/themes/macos.css`, changing only the selector to `html[data-color-theme='signal']`. The new file must contain real `--color-terminal-classic-*` declarations, not a comment-only block.

Then add this light block after the classic block:

```css
html[data-color-theme='signal'][data-theme='light'] {
  color-scheme: light;

  --goblin-surface-canvas: #f8fbfb;
  --goblin-surface-base: #eef6f4;
  --goblin-surface-raised: #ffffff;
  --goblin-surface-overlay: #ffffff;
  --goblin-surface-muted: #e4f0ed;
  --goblin-surface-hover: #dbece8;
  --goblin-surface-control: #ffffff;
  --goblin-surface-control-hover: #eef6f4;
  --goblin-text-primary: #10201f;
  --goblin-text-secondary-strong: #273d3a;
  --goblin-text-secondary: #476461;
  --goblin-text-selected-secondary: #334f4b;
  --goblin-text-disabled: #7d9691;
  --goblin-border-subtle: #d7e9e5;
  --goblin-border-default: #b9d8d2;
  --goblin-border-strong: #8db9b1;
  --goblin-focus-ring: #009b8f;
  --goblin-action-primary: #009b8f;
  --goblin-action-primary-foreground: #ffffff;
  --goblin-action-danger: #c33a4a;
  --goblin-action-danger-foreground: #ffffff;

  --goblin-accent: #009b8f;
  --goblin-accent-text: #00776e;
  --goblin-accent-rgb: 0 155 143;
  --goblin-accent-selection: rgb(var(--goblin-accent-rgb) / 0.14);
  --goblin-accent-surface: rgb(var(--goblin-accent-rgb) / 0.09);
  --goblin-accent-border: rgb(var(--goblin-accent-rgb) / 0.34);

  --goblin-status-warning-text: #8a6400;
  --goblin-status-warning-rgb: 199 139 0;
  --goblin-status-warning-surface: rgb(var(--goblin-status-warning-rgb) / 0.13);
  --goblin-status-warning-border: rgb(var(--goblin-status-warning-rgb) / 0.38);
  --goblin-status-success-text: #167a61;
  --goblin-status-success-rgb: 22 122 97;
  --goblin-status-success-surface: rgb(var(--goblin-status-success-rgb) / 0.1);
  --goblin-status-success-border: rgb(var(--goblin-status-success-rgb) / 0.32);
  --goblin-status-danger-text: #c33a4a;
  --goblin-status-danger-rgb: 195 58 74;
  --goblin-status-danger-surface: rgb(var(--goblin-status-danger-rgb) / 0.09);
  --goblin-status-danger-border: rgb(var(--goblin-status-danger-rgb) / 0.34);

  --goblin-terminal-activity: #009b8f;
  --goblin-terminal-activity-rgb: 0 155 143;
  --goblin-terminal-activity-surface: rgb(var(--goblin-terminal-activity-rgb) / 0.11);
  --goblin-terminal-activity-border: rgb(var(--goblin-terminal-activity-rgb) / 0.36);
  --goblin-terminal-bell: #c78b00;
  --goblin-terminal-bell-rgb: 199 139 0;
  --goblin-terminal-bell-surface: rgb(var(--goblin-terminal-bell-rgb) / 0.13);
  --goblin-terminal-bell-border: rgb(var(--goblin-terminal-bell-rgb) / 0.38);

  --color-overlay-scrim: rgb(16 32 31 / 0.42);
  --goblin-shadow-xs: 0 1px 1px rgb(16 32 31 / 0.03);
  --goblin-shadow-sm: 0 1px 2px rgb(16 32 31 / 0.05);
  --goblin-shadow-md: 0 8px 24px rgb(16 32 31 / 0.1);
  --goblin-shadow-lg: 0 18px 48px rgb(16 32 31 / 0.14);
  --shadow-inset-highlight: inset 0 1px 0 rgb(255 255 255 / 0.38);
  --shadow-control-inset-highlight: inset 0 1px 0 rgb(255 255 255 / 0.44);
  --radius: 0.625rem;

  --goblin-app-bg: #f8fbfb;
  --goblin-topbar-bg: #c8e4df;
  --goblin-topbar-border: #95c7bf;
  --goblin-toolbar-bg: #ddf0ec;
  --goblin-toolbar-border: var(--goblin-topbar-border);
  --goblin-tab-bg: transparent;
  --goblin-tab-hover-bg: #f1f8f6;
  --goblin-tab-active-bg: #ffffff;
  --goblin-sidebar-bg: #eef6f4;
  --goblin-pane-bg: #f8fbfb;
  --goblin-pane-header-bg: #eef6f4;
  --goblin-detail-bg: #f8fbfb;
  --goblin-card-bg: #ffffff;
  --goblin-list-row-bg: transparent;
  --goblin-list-row-hover-bg: #dbece8;
  --goblin-list-row-selected-bg: rgb(var(--goblin-accent-rgb) / 0.14);
  --goblin-list-row-selected-fg: #10201f;
  --goblin-control-bg: #ffffff;
  --goblin-control-hover-bg: #eef6f4;
  --goblin-control-border: #8db9b1;
  --goblin-control-radius: 0.625rem;
  --goblin-control-height-sm: 2rem;
  --goblin-control-density: 1;
  --goblin-brand-radius-sm: 0.375rem;
  --goblin-brand-radius-md: 0.625rem;
  --goblin-brand-radius-lg: 0.875rem;
  --goblin-brand-divider-strength: 0.75;

  --color-terminal-background: #fbfefe;
  --color-terminal-foreground: #10201f;
  --color-terminal-cursor: #10201f;
  --color-terminal-selection-background: rgba(0, 155, 143, 0.18);
  --color-terminal-ansi-black: #10201f;
  --color-terminal-ansi-red: #c33a4a;
  --color-terminal-ansi-green: #167a61;
  --color-terminal-ansi-yellow: #8a6400;
  --color-terminal-ansi-blue: #246fbd;
  --color-terminal-ansi-magenta: #8260b6;
  --color-terminal-ansi-cyan: #00776e;
  --color-terminal-ansi-white: #476461;
  --color-terminal-ansi-bright-black: #7d9691;
  --color-terminal-ansi-bright-red: #e05262;
  --color-terminal-ansi-bright-green: #229b78;
  --color-terminal-ansi-bright-yellow: #c78b00;
  --color-terminal-ansi-bright-blue: #4d8fdb;
  --color-terminal-ansi-bright-magenta: #a182d5;
  --color-terminal-ansi-bright-cyan: #009b8f;
  --color-terminal-ansi-bright-white: #10201f;
  --color-terminal-search-match: #c78b00;
  --color-terminal-search-active-match: #009b8f;
  --color-terminal-search-active-border: #10201f;
}
```

Then add this dark block:

```css
html[data-color-theme='signal'][data-theme='dark'] {
  color-scheme: dark;

  --goblin-surface-canvas: #0f1b1a;
  --goblin-surface-base: #162523;
  --goblin-surface-raised: #1d2f2c;
  --goblin-surface-overlay: #243a36;
  --goblin-surface-muted: #1d2f2c;
  --goblin-surface-hover: #2b4540;
  --goblin-surface-control: #1d2f2c;
  --goblin-surface-control-hover: #2b4540;
  --goblin-text-primary: #ecfffb;
  --goblin-text-secondary-strong: #d3eee9;
  --goblin-text-secondary: #9dbab4;
  --goblin-text-selected-secondary: #b8d1cc;
  --goblin-text-disabled: #6f8a85;
  --goblin-border-subtle: rgb(211 238 233 / 0.1);
  --goblin-border-default: rgb(211 238 233 / 0.16);
  --goblin-border-strong: rgb(211 238 233 / 0.28);
  --goblin-focus-ring: #22b8a8;
  --goblin-action-primary: #22b8a8;
  --goblin-action-primary-foreground: #031b18;
  --goblin-action-danger: #ff6f7d;
  --goblin-action-danger-foreground: #2a050a;
  --goblin-accent: #22b8a8;
  --goblin-accent-text: #6de2d5;
  --goblin-accent-rgb: 34 184 168;
  --goblin-accent-selection: rgb(var(--goblin-accent-rgb) / 0.24);
  --goblin-accent-surface: rgb(var(--goblin-accent-rgb) / 0.15);
  --goblin-accent-border: rgb(var(--goblin-accent-rgb) / 0.42);
  --goblin-status-warning-text: #f0b84a;
  --goblin-status-warning-rgb: 240 184 74;
  --goblin-status-warning-surface: rgb(var(--goblin-status-warning-rgb) / 0.14);
  --goblin-status-warning-border: rgb(var(--goblin-status-warning-rgb) / 0.36);
  --goblin-status-success-text: #68d9b7;
  --goblin-status-success-rgb: 104 217 183;
  --goblin-status-success-surface: rgb(var(--goblin-status-success-rgb) / 0.12);
  --goblin-status-success-border: rgb(var(--goblin-status-success-rgb) / 0.34);
  --goblin-status-danger-text: #ff8a96;
  --goblin-status-danger-rgb: 255 138 150;
  --goblin-status-danger-surface: rgb(var(--goblin-status-danger-rgb) / 0.12);
  --goblin-status-danger-border: rgb(var(--goblin-status-danger-rgb) / 0.36);
  --goblin-terminal-activity: #22b8a8;
  --goblin-terminal-activity-rgb: 34 184 168;
  --goblin-terminal-activity-surface: rgb(var(--goblin-terminal-activity-rgb) / 0.16);
  --goblin-terminal-activity-border: rgb(var(--goblin-terminal-activity-rgb) / 0.44);
  --goblin-terminal-bell: #f0b84a;
  --goblin-terminal-bell-rgb: 240 184 74;
  --goblin-terminal-bell-surface: rgb(var(--goblin-terminal-bell-rgb) / 0.14);
  --goblin-terminal-bell-border: rgb(var(--goblin-terminal-bell-rgb) / 0.38);
  --color-overlay-scrim: rgb(0 0 0 / 0.58);
  --goblin-shadow-xs: 0 1px 1px rgb(0 0 0 / 0.24);
  --goblin-shadow-sm: 0 1px 2px rgb(0 0 0 / 0.32);
  --goblin-shadow-md: 0 8px 24px rgb(0 0 0 / 0.42);
  --goblin-shadow-lg: 0 18px 48px rgb(0 0 0 / 0.52);
  --shadow-inset-highlight: inset 0 1px 0 rgb(255 255 255 / 0.08);
  --shadow-control-inset-highlight: inset 0 1px 0 rgb(255 255 255 / 0.1);
  --radius: 0.625rem;
  --goblin-app-bg: #0f1b1a;
  --goblin-topbar-bg: #102522;
  --goblin-topbar-border: #2a5a53;
  --goblin-toolbar-bg: #1b3934;
  --goblin-toolbar-border: var(--goblin-topbar-border);
  --goblin-tab-bg: transparent;
  --goblin-tab-hover-bg: #182d2a;
  --goblin-tab-active-bg: #203c38;
  --goblin-sidebar-bg: #162523;
  --goblin-pane-bg: #0f1b1a;
  --goblin-pane-header-bg: #162523;
  --goblin-detail-bg: #0f1b1a;
  --goblin-card-bg: #1d2f2c;
  --goblin-list-row-bg: transparent;
  --goblin-list-row-hover-bg: #2b4540;
  --goblin-list-row-selected-bg: rgb(var(--goblin-accent-rgb) / 0.24);
  --goblin-list-row-selected-fg: #ecfffb;
  --goblin-control-bg: #1d2f2c;
  --goblin-control-hover-bg: #2b4540;
  --goblin-control-border: rgb(211 238 233 / 0.28);
  --goblin-control-radius: 0.625rem;
  --goblin-control-height-sm: 2rem;
  --goblin-control-density: 1;
  --goblin-brand-radius-sm: 0.375rem;
  --goblin-brand-radius-md: 0.625rem;
  --goblin-brand-radius-lg: 0.875rem;
  --goblin-brand-divider-strength: 0.85;
  --color-terminal-background: #0f2423;
  --color-terminal-foreground: #dcfffa;
  --color-terminal-cursor: #dcfffa;
  --color-terminal-selection-background: rgba(34, 184, 168, 0.32);
  --color-terminal-ansi-black: #0f2423;
  --color-terminal-ansi-red: #ff8a96;
  --color-terminal-ansi-green: #68d9b7;
  --color-terminal-ansi-yellow: #f0b84a;
  --color-terminal-ansi-blue: #85b8ff;
  --color-terminal-ansi-magenta: #c4a0ef;
  --color-terminal-ansi-cyan: #6de2d5;
  --color-terminal-ansi-white: #c7e5df;
  --color-terminal-ansi-bright-black: #6f8a85;
  --color-terminal-ansi-bright-red: #ffb0b8;
  --color-terminal-ansi-bright-green: #92efcf;
  --color-terminal-ansi-bright-yellow: #ffd27a;
  --color-terminal-ansi-bright-blue: #a8ccff;
  --color-terminal-ansi-bright-magenta: #dcc0ff;
  --color-terminal-ansi-bright-cyan: #9af3e9;
  --color-terminal-ansi-bright-white: #ffffff;
  --color-terminal-search-match: #f0b84a;
  --color-terminal-search-active-match: #22b8a8;
  --color-terminal-search-active-border: #ffffff;
}
```

- [ ] **Step 3: Create `forge.css` with complete token blocks**

Create `src/web/theme/themes/forge.css` by copying the current `html[data-color-theme='macos']` classic terminal token block from `src/web/theme/themes/macos.css`, changing only the selector to `html[data-color-theme='forge']`. The new file must contain real `--color-terminal-classic-*` declarations, not a comment-only block.

Then add this light block after the classic block:

```css
html[data-color-theme='forge'][data-theme='light'] {
  color-scheme: light;

  --goblin-surface-canvas: #f6f3ec;
  --goblin-surface-base: #ebe4d7;
  --goblin-surface-raised: #fffdf8;
  --goblin-surface-overlay: #fffdf8;
  --goblin-surface-muted: #e4d9c7;
  --goblin-surface-hover: #ddd3c2;
  --goblin-surface-control: #fffdf8;
  --goblin-surface-control-hover: #ebe4d7;
  --goblin-text-primary: #201b16;
  --goblin-text-secondary-strong: #3a3026;
  --goblin-text-secondary: #5f5242;
  --goblin-text-selected-secondary: #4e4335;
  --goblin-text-disabled: #8f806b;
  --goblin-border-subtle: #e1d3bd;
  --goblin-border-default: #cbb99e;
  --goblin-border-strong: #a9906c;
  --goblin-focus-ring: #b6531c;
  --goblin-action-primary: #b6531c;
  --goblin-action-primary-foreground: #fff8f0;
  --goblin-action-danger: #b73c2f;
  --goblin-action-danger-foreground: #ffffff;

  --goblin-accent: #b6531c;
  --goblin-accent-text: #934112;
  --goblin-accent-rgb: 182 83 28;
  --goblin-accent-selection: rgb(var(--goblin-accent-rgb) / 0.15);
  --goblin-accent-surface: rgb(var(--goblin-accent-rgb) / 0.1);
  --goblin-accent-border: rgb(var(--goblin-accent-rgb) / 0.36);

  --goblin-status-warning-text: #8c5d00;
  --goblin-status-warning-rgb: 201 138 18;
  --goblin-status-warning-surface: rgb(var(--goblin-status-warning-rgb) / 0.13);
  --goblin-status-warning-border: rgb(var(--goblin-status-warning-rgb) / 0.38);
  --goblin-status-success-text: #1f7a55;
  --goblin-status-success-rgb: 31 122 85;
  --goblin-status-success-surface: rgb(var(--goblin-status-success-rgb) / 0.1);
  --goblin-status-success-border: rgb(var(--goblin-status-success-rgb) / 0.32);
  --goblin-status-danger-text: #b73c2f;
  --goblin-status-danger-rgb: 183 60 47;
  --goblin-status-danger-surface: rgb(var(--goblin-status-danger-rgb) / 0.09);
  --goblin-status-danger-border: rgb(var(--goblin-status-danger-rgb) / 0.34);

  --goblin-terminal-activity: #b6531c;
  --goblin-terminal-activity-rgb: 182 83 28;
  --goblin-terminal-activity-surface: rgb(var(--goblin-terminal-activity-rgb) / 0.12);
  --goblin-terminal-activity-border: rgb(var(--goblin-terminal-activity-rgb) / 0.38);
  --goblin-terminal-bell: #c98a12;
  --goblin-terminal-bell-rgb: 201 138 18;
  --goblin-terminal-bell-surface: rgb(var(--goblin-terminal-bell-rgb) / 0.13);
  --goblin-terminal-bell-border: rgb(var(--goblin-terminal-bell-rgb) / 0.38);

  --color-overlay-scrim: rgb(32 27 22 / 0.42);
  --goblin-shadow-xs: 0 1px 1px rgb(32 27 22 / 0.03);
  --goblin-shadow-sm: 0 1px 2px rgb(32 27 22 / 0.05);
  --goblin-shadow-md: 0 8px 24px rgb(32 27 22 / 0.11);
  --goblin-shadow-lg: 0 18px 48px rgb(32 27 22 / 0.16);
  --shadow-inset-highlight: inset 0 1px 0 rgb(255 255 255 / 0.38);
  --shadow-control-inset-highlight: inset 0 1px 0 rgb(255 255 255 / 0.44);
  --radius: 0.375rem;

  --goblin-app-bg: #f6f3ec;
  --goblin-topbar-bg: #ded0ba;
  --goblin-topbar-border: #c4ad8d;
  --goblin-toolbar-bg: #eadfcd;
  --goblin-toolbar-border: var(--goblin-topbar-border);
  --goblin-tab-bg: transparent;
  --goblin-tab-hover-bg: #f4eee3;
  --goblin-tab-active-bg: #fffdf8;
  --goblin-sidebar-bg: #ebe4d7;
  --goblin-pane-bg: #f6f3ec;
  --goblin-pane-header-bg: #ebe4d7;
  --goblin-detail-bg: #f6f3ec;
  --goblin-card-bg: #fffdf8;
  --goblin-list-row-bg: transparent;
  --goblin-list-row-hover-bg: #ddd3c2;
  --goblin-list-row-selected-bg: rgb(var(--goblin-accent-rgb) / 0.15);
  --goblin-list-row-selected-fg: #201b16;
  --goblin-control-bg: #fffdf8;
  --goblin-control-hover-bg: #ebe4d7;
  --goblin-control-border: #a9906c;
  --goblin-control-radius: 0.375rem;
  --goblin-control-height-sm: 2rem;
  --goblin-control-density: 0.98;
  --goblin-brand-radius-sm: 0.25rem;
  --goblin-brand-radius-md: 0.375rem;
  --goblin-brand-radius-lg: 0.625rem;
  --goblin-brand-divider-strength: 0.85;

  --color-terminal-background: #fff9ed;
  --color-terminal-foreground: #201b16;
  --color-terminal-cursor: #201b16;
  --color-terminal-selection-background: rgba(182, 83, 28, 0.2);
  --color-terminal-ansi-black: #201b16;
  --color-terminal-ansi-red: #b73c2f;
  --color-terminal-ansi-green: #1f7a55;
  --color-terminal-ansi-yellow: #8c5d00;
  --color-terminal-ansi-blue: #3869a8;
  --color-terminal-ansi-magenta: #7d548f;
  --color-terminal-ansi-cyan: #327c77;
  --color-terminal-ansi-white: #5f5242;
  --color-terminal-ansi-bright-black: #8f806b;
  --color-terminal-ansi-bright-red: #d85b4e;
  --color-terminal-ansi-bright-green: #36966c;
  --color-terminal-ansi-bright-yellow: #c98a12;
  --color-terminal-ansi-bright-blue: #5c8dd1;
  --color-terminal-ansi-bright-magenta: #a071b2;
  --color-terminal-ansi-bright-cyan: #4aa09b;
  --color-terminal-ansi-bright-white: #201b16;
  --color-terminal-search-match: #c98a12;
  --color-terminal-search-active-match: #b6531c;
  --color-terminal-search-active-border: #201b16;
}
```

Then add this dark block:

```css
html[data-color-theme='forge'][data-theme='dark'] {
  color-scheme: dark;

  --goblin-surface-canvas: #18110d;
  --goblin-surface-base: #211813;
  --goblin-surface-raised: #2b2019;
  --goblin-surface-overlay: #35271e;
  --goblin-surface-muted: #2b2019;
  --goblin-surface-hover: #423124;
  --goblin-surface-control: #2b2019;
  --goblin-surface-control-hover: #423124;
  --goblin-text-primary: #fff3e0;
  --goblin-text-secondary-strong: #ead7bd;
  --goblin-text-secondary: #bda58b;
  --goblin-text-selected-secondary: #dac2a5;
  --goblin-text-disabled: #8a7460;
  --goblin-border-subtle: rgb(234 215 189 / 0.1);
  --goblin-border-default: rgb(234 215 189 / 0.16);
  --goblin-border-strong: rgb(234 215 189 / 0.28);
  --goblin-focus-ring: #d66a28;
  --goblin-action-primary: #d66a28;
  --goblin-action-primary-foreground: #230c03;
  --goblin-action-danger: #ff7668;
  --goblin-action-danger-foreground: #2b0704;
  --goblin-accent: #d66a28;
  --goblin-accent-text: #f0a36b;
  --goblin-accent-rgb: 214 106 40;
  --goblin-accent-selection: rgb(var(--goblin-accent-rgb) / 0.24);
  --goblin-accent-surface: rgb(var(--goblin-accent-rgb) / 0.16);
  --goblin-accent-border: rgb(var(--goblin-accent-rgb) / 0.42);
  --goblin-status-warning-text: #f2bc5e;
  --goblin-status-warning-rgb: 242 188 94;
  --goblin-status-warning-surface: rgb(var(--goblin-status-warning-rgb) / 0.14);
  --goblin-status-warning-border: rgb(var(--goblin-status-warning-rgb) / 0.38);
  --goblin-status-success-text: #79c79a;
  --goblin-status-success-rgb: 121 199 154;
  --goblin-status-success-surface: rgb(var(--goblin-status-success-rgb) / 0.12);
  --goblin-status-success-border: rgb(var(--goblin-status-success-rgb) / 0.34);
  --goblin-status-danger-text: #ff8f83;
  --goblin-status-danger-rgb: 255 143 131;
  --goblin-status-danger-surface: rgb(var(--goblin-status-danger-rgb) / 0.12);
  --goblin-status-danger-border: rgb(var(--goblin-status-danger-rgb) / 0.36);
  --goblin-terminal-activity: #d66a28;
  --goblin-terminal-activity-rgb: 214 106 40;
  --goblin-terminal-activity-surface: rgb(var(--goblin-terminal-activity-rgb) / 0.16);
  --goblin-terminal-activity-border: rgb(var(--goblin-terminal-activity-rgb) / 0.44);
  --goblin-terminal-bell: #f2bc5e;
  --goblin-terminal-bell-rgb: 242 188 94;
  --goblin-terminal-bell-surface: rgb(var(--goblin-terminal-bell-rgb) / 0.14);
  --goblin-terminal-bell-border: rgb(var(--goblin-terminal-bell-rgb) / 0.38);
  --color-overlay-scrim: rgb(0 0 0 / 0.6);
  --goblin-shadow-xs: 0 1px 1px rgb(0 0 0 / 0.24);
  --goblin-shadow-sm: 0 1px 2px rgb(0 0 0 / 0.32);
  --goblin-shadow-md: 0 8px 24px rgb(0 0 0 / 0.42);
  --goblin-shadow-lg: 0 18px 48px rgb(0 0 0 / 0.54);
  --shadow-inset-highlight: inset 0 1px 0 rgb(255 255 255 / 0.08);
  --shadow-control-inset-highlight: inset 0 1px 0 rgb(255 255 255 / 0.1);
  --radius: 0.375rem;

  --goblin-app-bg: #18110d;
  --goblin-topbar-bg: #211813;
  --goblin-topbar-border: #63442d;
  --goblin-toolbar-bg: #37261b;
  --goblin-toolbar-border: var(--goblin-topbar-border);
  --goblin-tab-bg: transparent;
  --goblin-tab-hover-bg: #2b2019;
  --goblin-tab-active-bg: #3a2a20;
  --goblin-sidebar-bg: #211813;
  --goblin-pane-bg: #18110d;
  --goblin-pane-header-bg: #211813;
  --goblin-detail-bg: #18110d;
  --goblin-card-bg: #2b2019;
  --goblin-list-row-bg: transparent;
  --goblin-list-row-hover-bg: #423124;
  --goblin-list-row-selected-bg: rgb(var(--goblin-accent-rgb) / 0.24);
  --goblin-list-row-selected-fg: #fff3e0;
  --goblin-control-bg: #2b2019;
  --goblin-control-hover-bg: #423124;
  --goblin-control-border: rgb(234 215 189 / 0.28);
  --goblin-control-radius: 0.375rem;
  --goblin-control-height-sm: 2rem;
  --goblin-control-density: 0.98;
  --goblin-brand-radius-sm: 0.25rem;
  --goblin-brand-radius-md: 0.375rem;
  --goblin-brand-radius-lg: 0.625rem;
  --goblin-brand-divider-strength: 0.9;
  --color-terminal-background: #201813;
  --color-terminal-foreground: #fff3e0;
  --color-terminal-cursor: #fff3e0;
  --color-terminal-selection-background: rgba(214, 106, 40, 0.34);
  --color-terminal-ansi-black: #201813;
  --color-terminal-ansi-red: #ff8f83;
  --color-terminal-ansi-green: #79c79a;
  --color-terminal-ansi-yellow: #f2bc5e;
  --color-terminal-ansi-blue: #91b9f2;
  --color-terminal-ansi-magenta: #d2a6e8;
  --color-terminal-ansi-cyan: #82d3c8;
  --color-terminal-ansi-white: #dac2a5;
  --color-terminal-ansi-bright-black: #8a7460;
  --color-terminal-ansi-bright-red: #ffb1a8;
  --color-terminal-ansi-bright-green: #9de0b8;
  --color-terminal-ansi-bright-yellow: #ffd58a;
  --color-terminal-ansi-bright-blue: #b2d0ff;
  --color-terminal-ansi-bright-magenta: #e4c1fb;
  --color-terminal-ansi-bright-cyan: #a2e6dd;
  --color-terminal-ansi-bright-white: #ffffff;
  --color-terminal-search-match: #f2bc5e;
  --color-terminal-search-active-match: #d66a28;
  --color-terminal-search-active-border: #ffffff;
}
```

- [ ] **Step 4: Run theme preset tests**

Run:

```bash
bun run test src/web/theme/theme-presets.test.ts
```

Expected: PASS. If a luminance assertion fails, adjust only the failing topbar/toolbar/tab colors while preserving the intended Signal teal and Forge metal directions.

---

### Task 8: Add Theme Labels

**Files:**

- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/shared/i18n/ja.ts`

- [ ] **Step 1: Add English labels**

In `src/shared/i18n/en.ts`, near the existing `settings.theme-preset.*` keys, add:

```ts
  'settings.theme-preset.signal': 'Signal',
  'settings.theme-preset.forge': 'Forge',
```

- [ ] **Step 2: Add Chinese labels**

In `src/shared/i18n/zh.ts`, near the existing `settings.theme-preset.*` keys, add:

```ts
  'settings.theme-preset.signal': 'Signal',
  'settings.theme-preset.forge': 'Forge',
```

- [ ] **Step 3: Add Korean labels**

In `src/shared/i18n/ko.ts`, near the existing `settings.theme-preset.*` keys, add:

```ts
  'settings.theme-preset.signal': 'Signal',
  'settings.theme-preset.forge': 'Forge',
```

- [ ] **Step 4: Add Japanese labels**

In `src/shared/i18n/ja.ts`, near the existing `settings.theme-preset.*` keys, add:

```ts
  'settings.theme-preset.signal': 'Signal',
  'settings.theme-preset.forge': 'Forge',
```

- [ ] **Step 5: Run dictionary tests**

Run:

```bash
bun run test src/shared/i18n/dictionaries.test.ts
```

Expected: PASS.

---

### Task 9: Run Focused Integration Verification

**Files:**

- All files modified by Tasks 1-8.

- [ ] **Step 1: Run focused theme and indicator tests**

Run:

```bash
bun run test src/shared/color-theme.test.ts src/web/public/boot.test.ts src/shared/theme-tokens.test.ts src/web/theme/theme-contract.test.ts src/web/theme/theme-presets.test.ts src/shared/i18n/dictionaries.test.ts src/web/components/terminal/TerminalOutputActivityIndicator.test.tsx src/web/components/terminal/TerminalBellDot.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run the full test suite**

Run:

```bash
bun run test
```

Expected: PASS.

- [ ] **Step 4: Inspect final diff**

Run:

```bash
git diff --stat
git diff -- src/shared/color-theme.ts src/web/public/boot.js src/shared/theme-tokens.ts src/web/theme/contract.css src/web/theme/theme.css src/web/components/terminal/TerminalOutputActivityIndicator.tsx src/web/components/terminal/TerminalBellDot.tsx
```

Expected: the diff contains only the planned theme allowlist, token, preset CSS, i18n, and indicator changes. It must not include component branches that compare against `signal` or `forge`.

## Execution Notes

- This plan intentionally omits commit steps because this repository's AGENTS instructions prohibit unrequested git commits.
- If the implementation is split across agents, complete Tasks 1-4 first to establish failing tests, then Tasks 5-8 to satisfy them, then Task 9 for verification.
