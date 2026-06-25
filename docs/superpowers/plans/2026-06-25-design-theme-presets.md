# Design Theme Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Claude, Cursor, and Apple color theme presets to Settings, with complete light/dark token coverage for file area, branch area, and terminal area.

**Architecture:** Extend the existing `data-theme` plus `data-color-theme` token system. Keep theme IDs centralized in `src/shared/color-theme.ts`, render CSS tokens through `src/web/theme/themes/*.css`, and keep native window background colors in `src/shared/theme-tokens.ts` aligned with renderer canvas tokens. Do not add component-level theme branches.

**Tech Stack:** TypeScript strip-only mode, React renderer, Tailwind v4 token CSS, Electron main process, Valibot schemas, Vitest, Bun.

---

## Project Constraints

- Do not use TypeScript enums, namespaces with runtime code, parameter properties, or import aliases.
- Use repo-alias imports with explicit `.ts` / `.tsx` extensions.
- Keep font family unchanged: `Maple Mono NF CN` remains the app and terminal font.
- Do not add git commit steps. Project instructions say not to plan or execute git commits unless the user explicitly requests them.

## File Map

- Modify: `src/shared/color-theme.ts`
  - Owns the allowed `ColorTheme` IDs and runtime validation.
- Create: `src/shared/color-theme.test.ts`
  - Verifies the shared preset allowlist and validation behavior.
- Modify: `src/web/public/boot.js`
  - Keeps pre-React first paint in sync with `COLOR_THEMES`.
- Create: `src/web/public/boot.test.ts`
  - Verifies `boot.js` allowlist stays in sync with `COLOR_THEMES`.
- Modify: `src/shared/theme-tokens.ts`
  - Adds native window background colors for the new presets.
- Create: `src/shared/theme-tokens.test.ts`
  - Verifies native window background coverage for every design preset.
- Modify: `src/server/modules/settings-source.test.ts`
  - Verifies server settings accept new presets and normalize unknown values.
- Modify: `src/shared/native-shell-projection.test.ts`
  - Verifies native projection schema accepts new preset IDs.
- Modify: `src/main/theme.test.ts`
  - Widens the mocked settings type to the shared `ColorTheme` type.
- Create: `src/web/theme/theme-presets.test.ts`
  - Verifies every preset CSS file defines light/dark selectors and terminal tokens.
- Create: `src/web/theme/themes/claude.css`
  - Claude-derived light/dark token sets.
- Create: `src/web/theme/themes/cursor.css`
  - Cursor-derived light/dark token sets.
- Create: `src/web/theme/themes/apple.css`
  - Apple-derived light/dark token sets.
- Modify: `src/web/theme/theme.css`
  - Imports the three new CSS files.
- Modify: `src/shared/i18n/en.ts`
  - Adds Settings labels for new presets.
- Modify: `src/shared/i18n/zh.ts`
  - Adds Settings labels for new presets.
- Modify: `src/shared/i18n/ko.ts`
  - Adds Settings labels for new presets.
- Modify: `src/shared/i18n/ja.ts`
  - Adds Settings labels for new presets.

---

### Task 1: Add Failing Tests for Shared Theme IDs and Boot Allowlist

**Files:**
- Create: `src/shared/color-theme.test.ts`
- Create: `src/web/public/boot.test.ts`

- [ ] **Step 1: Create the shared color theme test**

Create `src/shared/color-theme.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { COLOR_THEMES, DEFAULT_COLOR_THEME, isColorTheme } from '#/shared/color-theme.ts'

const DESIGN_COLOR_THEMES = ['claude', 'cursor', 'apple'] as const

describe('color theme presets', () => {
  test('includes design-derived theme presets after existing presets', () => {
    expect(COLOR_THEMES).toEqual(['macos', 'mono', 'github', 'claude', 'cursor', 'apple'])
    expect(DEFAULT_COLOR_THEME).toBe('macos')
  })

  test('validates design-derived theme presets', () => {
    for (const theme of DESIGN_COLOR_THEMES) {
      expect(isColorTheme(theme)).toBe(true)
    }

    expect(isColorTheme('default')).toBe(false)
    expect(isColorTheme('claude-dark')).toBe(false)
    expect(isColorTheme(null)).toBe(false)
  })
})
```

- [ ] **Step 2: Create the boot allowlist sync test**

Create `src/web/public/boot.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { COLOR_THEMES, DEFAULT_COLOR_THEME } from '#/shared/color-theme.ts'

function readBootColorThemes(): string[] {
  const boot = readFileSync(new URL('./boot.js', import.meta.url), 'utf8')
  const match = boot.match(/var colorThemes = \[([^\]]+)\]/)
  expect(match, 'boot.js color theme allowlist').not.toBeNull()
  return match![1]!
    .split(',')
    .map((part) => part.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
}

describe('boot color theme allowlist', () => {
  test('stays in sync with shared color themes', () => {
    expect(readBootColorThemes()).toEqual([...COLOR_THEMES])
  })

  test('falls back to the shared default color theme', () => {
    const boot = readFileSync(new URL('./boot.js', import.meta.url), 'utf8')
    expect(boot).toContain(`colorTheme = '${DEFAULT_COLOR_THEME}'`)
  })
})
```

- [ ] **Step 3: Run the failing tests**

Run:

```bash
bun run test src/shared/color-theme.test.ts src/web/public/boot.test.ts
```

Expected before implementation:

- `src/shared/color-theme.test.ts` fails because `COLOR_THEMES` does not include `claude`, `cursor`, or `apple`.
- `src/web/public/boot.test.ts` may still pass against the old list until `COLOR_THEMES` changes in Task 4.

---

### Task 2: Add Failing Tests for Settings, Native Projection, and Native Window Background Coverage

**Files:**
- Modify: `src/server/modules/settings-source.test.ts`
- Modify: `src/shared/native-shell-projection.test.ts`
- Create: `src/shared/theme-tokens.test.ts`

- [ ] **Step 1: Add server settings normalization coverage**

Append this test to `src/server/modules/settings-source.test.ts`:

```ts
test('accepts design color theme presets and normalizes unknown presets', async () => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'gbl-server-settings-'))
  previousDataDir = process.env.GOBLIN_SERVER_DATA_DIR
  process.env.GOBLIN_SERVER_DATA_DIR = tmp

  const mod = await import('#/server/modules/settings-source.ts')
  for (const colorTheme of ['claude', 'cursor', 'apple'] as const) {
    await mod.updateServerSettingsPrefs({ colorTheme })
    expect(await mod.getServerSettingsPrefs()).toMatchObject({ colorTheme })
  }

  await mod.updateServerSettingsPrefs({ colorTheme: 'not-a-theme' as never })
  expect(await mod.getServerSettingsPrefs()).toMatchObject({ colorTheme: 'macos' })
})
```

- [ ] **Step 2: Add native shell projection schema coverage**

Append this test to `src/shared/native-shell-projection.test.ts`:

```ts
  test('accepts design color theme presets in native projection payloads', () => {
    for (const colorTheme of ['claude', 'cursor', 'apple'] as const) {
      expect(
        v.safeParse(NativeShellProjectionSchema, {
          prefs: {
            patch: { colorTheme },
            settings: {
              lang: 'auto',
              theme: 'auto',
              colorTheme,
              shortcutsDisabled: false,
              globalShortcutDisabled: false,
              swapCloseShortcuts: false,
              globalShortcut: 'Alt+G',
            },
          },
        }).success,
      ).toBe(true)
    }
  })
```

Place it inside the existing `describe('native shell projection helpers', () => { ... })` block.

- [ ] **Step 3: Add native window background token coverage**

Create `src/shared/theme-tokens.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { COLOR_THEMES } from '#/shared/color-theme.ts'
import { WINDOW_BACKGROUND_BY_COLOR_THEME } from '#/shared/theme-tokens.ts'

const DESIGN_COLOR_THEMES = ['claude', 'cursor', 'apple'] as const

describe('native theme tokens', () => {
  test('defines native window backgrounds for every shared color theme', () => {
    expect(Object.keys(WINDOW_BACKGROUND_BY_COLOR_THEME)).toEqual([...COLOR_THEMES])
  })

  test('defines light and dark native window backgrounds for design presets', () => {
    for (const colorTheme of DESIGN_COLOR_THEMES) {
      expect(WINDOW_BACKGROUND_BY_COLOR_THEME[colorTheme]).toMatchObject({
        light: expect.stringMatching(/^#[0-9a-f]{6}$/i),
        dark: expect.stringMatching(/^#[0-9a-f]{6}$/i),
      })
    }
  })
})
```

- [ ] **Step 4: Run the failing tests**

Run:

```bash
bun run test src/server/modules/settings-source.test.ts src/shared/native-shell-projection.test.ts src/shared/theme-tokens.test.ts
```

Expected before implementation:

- Settings normalization rejects the new IDs and falls back to `macos`.
- Native projection schema rejects the new IDs.
- Native theme token coverage fails because new IDs are missing.

---

### Task 3: Add Failing CSS Token Contract Tests

**Files:**
- Create: `src/web/theme/theme-presets.test.ts`

- [ ] **Step 1: Create the CSS preset contract test**

Create `src/web/theme/theme-presets.test.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { COLOR_THEMES } from '#/shared/color-theme.ts'

const TERMINAL_TOKENS = [
  '--color-terminal-background',
  '--color-terminal-foreground',
  '--color-terminal-cursor',
  '--color-terminal-selection-background',
  '--color-terminal-ansi-black',
  '--color-terminal-ansi-red',
  '--color-terminal-ansi-green',
  '--color-terminal-ansi-yellow',
  '--color-terminal-ansi-blue',
  '--color-terminal-ansi-magenta',
  '--color-terminal-ansi-cyan',
  '--color-terminal-ansi-white',
  '--color-terminal-ansi-bright-black',
  '--color-terminal-ansi-bright-red',
  '--color-terminal-ansi-bright-green',
  '--color-terminal-ansi-bright-yellow',
  '--color-terminal-ansi-bright-blue',
  '--color-terminal-ansi-bright-magenta',
  '--color-terminal-ansi-bright-cyan',
  '--color-terminal-ansi-bright-white',
  '--color-terminal-search-match',
  '--color-terminal-search-active-match',
  '--color-terminal-search-active-border',
] as const

const FOUNDATION_TOKENS = [
  '--goblin-surface-canvas',
  '--goblin-surface-base',
  '--goblin-surface-raised',
  '--goblin-surface-overlay',
  '--goblin-surface-muted',
  '--goblin-surface-hover',
  '--goblin-text-primary',
  '--goblin-text-secondary-strong',
  '--goblin-text-secondary',
  '--goblin-border-subtle',
  '--goblin-border-default',
  '--goblin-border-strong',
  '--goblin-focus-ring',
  '--goblin-action-primary',
  '--goblin-action-primary-foreground',
  '--goblin-action-danger',
  '--goblin-action-danger-foreground',
  '--goblin-accent',
  '--goblin-accent-text',
  '--goblin-accent-rgb',
  '--goblin-status-warning-text',
  '--goblin-status-success-text',
  '--goblin-status-danger-text',
  '--radius',
] as const

function themeCssPath(colorTheme: string): URL {
  return new URL(`./themes/${colorTheme}.css`, import.meta.url)
}

function readThemeCss(colorTheme: string): string {
  return readFileSync(themeCssPath(colorTheme), 'utf8')
}

describe('theme preset css contracts', () => {
  test('has a css file for every shared color theme', () => {
    for (const colorTheme of COLOR_THEMES) {
      expect(existsSync(themeCssPath(colorTheme)), `${colorTheme}.css exists`).toBe(true)
    }
  })

  test('defines light and dark selectors for every color theme', () => {
    for (const colorTheme of COLOR_THEMES) {
      const css = readThemeCss(colorTheme)
      expect(css).toContain(`html[data-color-theme='${colorTheme}'][data-theme='light']`)
      expect(css).toContain(`html[data-color-theme='${colorTheme}'][data-theme='dark']`)
    }
  })

  test('defines foundation and terminal tokens for design presets', () => {
    for (const colorTheme of ['claude', 'cursor', 'apple'] as const) {
      const css = readThemeCss(colorTheme)
      for (const token of [...FOUNDATION_TOKENS, ...TERMINAL_TOKENS]) {
        expect(css, `${colorTheme} defines ${token}`).toContain(token)
      }
    }
  })
})
```

- [ ] **Step 2: Run the failing CSS contract test**

Run:

```bash
bun run test src/web/theme/theme-presets.test.ts
```

Expected before implementation:

- The test fails once `COLOR_THEMES` includes the new IDs and their CSS files do not exist yet.

---

### Task 4: Add Shared Theme IDs, Native Background Tokens, Boot Allowlist, and Labels

**Files:**
- Modify: `src/shared/color-theme.ts`
- Modify: `src/shared/theme-tokens.ts`
- Modify: `src/web/public/boot.js`
- Modify: `src/main/theme.test.ts`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/shared/i18n/ja.ts`

- [ ] **Step 1: Update shared color theme IDs**

Replace `src/shared/color-theme.ts` with:

```ts
// Keep this in sync with the pre-React allowlist in `src/web/public/boot.js`.
export const COLOR_THEMES = ['macos', 'mono', 'github', 'claude', 'cursor', 'apple'] as const

export type ColorTheme = (typeof COLOR_THEMES)[number]

export const DEFAULT_COLOR_THEME: ColorTheme = 'macos'

export function isColorTheme(value: unknown): value is ColorTheme {
  return typeof value === 'string' && COLOR_THEMES.includes(value as ColorTheme)
}
```

- [ ] **Step 2: Update native window background tokens**

Replace `src/shared/theme-tokens.ts` with:

```ts
import type { ResolvedTheme } from '#/shared/rpc.ts'
import type { ColorTheme } from '#/shared/color-theme.ts'

// Main needs a window background before renderer CSS loads. Keep these
// values in sync with each theme's `--goblin-surface-canvas` until themes
// become data-driven and main can read the persisted canvas token.
export const WINDOW_BACKGROUND_BY_COLOR_THEME: Record<ColorTheme, Record<ResolvedTheme, string>> = {
  macos: {
    light: '#fbfbfd',
    dark: '#1c1c1e',
  },
  mono: {
    light: '#ffffff',
    dark: '#09090b',
  },
  github: {
    light: '#ffffff',
    dark: '#0d1117',
  },
  claude: {
    light: '#faf9f5',
    dark: '#181715',
  },
  cursor: {
    light: '#f7f7f4',
    dark: '#1f1f1c',
  },
  apple: {
    light: '#ffffff',
    dark: '#000000',
  },
}
```

- [ ] **Step 3: Update pre-React boot allowlist**

In `src/web/public/boot.js`, replace:

```js
  var colorThemes = ['macos', 'mono', 'github']
```

with:

```js
  var colorThemes = ['macos', 'mono', 'github', 'claude', 'cursor', 'apple']
```

- [ ] **Step 4: Widen the main theme test mock type**

In `src/main/theme.test.ts`, add this import after the existing imports:

```ts
import type { ColorTheme } from '#/shared/color-theme.ts'
```

Then replace the mocked settings type:

```ts
  getSettingsPrefs: vi.fn<
    () => Promise<{ theme?: 'auto' | 'light' | 'dark'; colorTheme?: 'macos' | 'mono' | 'github' }>
  >(async () => ({ theme: 'auto', colorTheme: 'macos' })),
```

with:

```ts
  getSettingsPrefs: vi.fn<
    () => Promise<{ theme?: 'auto' | 'light' | 'dark'; colorTheme?: ColorTheme }>
  >(async () => ({ theme: 'auto', colorTheme: 'macos' })),
```

- [ ] **Step 5: Add English labels**

In `src/shared/i18n/en.ts`, near existing `settings.theme-preset.*` entries, add:

```ts
  'settings.theme-preset.claude': 'Claude',
  'settings.theme-preset.cursor': 'Cursor',
  'settings.theme-preset.apple': 'Apple',
```

- [ ] **Step 6: Add Chinese labels**

In `src/shared/i18n/zh.ts`, near existing `settings.theme-preset.*` entries, add:

```ts
  'settings.theme-preset.claude': 'Claude',
  'settings.theme-preset.cursor': 'Cursor',
  'settings.theme-preset.apple': 'Apple',
```

- [ ] **Step 7: Add Korean labels**

In `src/shared/i18n/ko.ts`, near existing `settings.theme-preset.*` entries, add:

```ts
  'settings.theme-preset.claude': 'Claude',
  'settings.theme-preset.cursor': 'Cursor',
  'settings.theme-preset.apple': 'Apple',
```

- [ ] **Step 8: Add Japanese labels**

In `src/shared/i18n/ja.ts`, near existing `settings.theme-preset.*` entries, add:

```ts
  'settings.theme-preset.claude': 'Claude',
  'settings.theme-preset.cursor': 'Cursor',
  'settings.theme-preset.apple': 'Apple',
```

- [ ] **Step 9: Run focused tests**

Run:

```bash
bun run test src/shared/color-theme.test.ts src/web/public/boot.test.ts src/server/modules/settings-source.test.ts src/shared/native-shell-projection.test.ts src/shared/theme-tokens.test.ts src/main/theme.test.ts
```

Expected:

- These tests pass.
- `src/web/theme/theme-presets.test.ts` still fails until Task 5 creates CSS files and imports them.

---

### Task 5: Add Claude, Cursor, and Apple CSS Token Files

**Files:**
- Create: `src/web/theme/themes/claude.css`
- Create: `src/web/theme/themes/cursor.css`
- Create: `src/web/theme/themes/apple.css`
- Modify: `src/web/theme/theme.css`

- [ ] **Step 1: Create Claude theme CSS**

Create `src/web/theme/themes/claude.css`:

```css
html[data-color-theme='claude'][data-theme='light'] {
  color-scheme: light;

  --goblin-surface-canvas: #faf9f5;
  --goblin-surface-base: #f5f0e8;
  --goblin-surface-raised: #ffffff;
  --goblin-surface-overlay: #ffffff;
  --goblin-surface-muted: #efe9de;
  --goblin-surface-hover: #ebe6df;
  --goblin-surface-control: #ffffff;
  --goblin-surface-control-hover: #f5f0e8;
  --goblin-text-primary: #141413;
  --goblin-text-secondary-strong: #252523;
  --goblin-text-secondary: #6c6a64;
  --goblin-text-selected-secondary: #3d3d3a;
  --goblin-border-subtle: #ebe6df;
  --goblin-border-default: #e6dfd8;
  --goblin-border-strong: #d4cabd;
  --goblin-focus-ring: #cc785c;
  --goblin-action-primary: #cc785c;
  --goblin-action-primary-foreground: #ffffff;
  --goblin-action-danger: #c64545;
  --goblin-action-danger-foreground: #ffffff;

  --goblin-accent: #cc785c;
  --goblin-accent-text: #a9583e;
  --goblin-accent-rgb: 204 120 92;
  --goblin-accent-selection: rgb(var(--goblin-accent-rgb) / 0.14);
  --goblin-accent-surface: rgb(var(--goblin-accent-rgb) / 0.1);
  --goblin-accent-border: rgb(var(--goblin-accent-rgb) / 0.34);

  --goblin-status-warning-text: #9f6a00;
  --goblin-status-warning-rgb: 212 160 23;
  --goblin-status-warning-surface: rgb(var(--goblin-status-warning-rgb) / 0.14);
  --goblin-status-warning-border: rgb(var(--goblin-status-warning-rgb) / 0.42);
  --goblin-status-success-text: #237244;
  --goblin-status-success-rgb: 93 184 114;
  --goblin-status-success-surface: rgb(var(--goblin-status-success-rgb) / 0.12);
  --goblin-status-success-border: rgb(var(--goblin-status-success-rgb) / 0.36);
  --goblin-status-danger-text: #c64545;
  --goblin-status-danger-rgb: 198 69 69;
  --goblin-status-danger-surface: rgb(var(--goblin-status-danger-rgb) / 0.1);
  --goblin-status-danger-border: rgb(var(--goblin-status-danger-rgb) / 0.36);

  --color-overlay-scrim: rgb(20 20 19 / 0.42);
  --goblin-shadow-xs: 0 1px 1px rgb(20 20 19 / 0.04);
  --goblin-shadow-sm: 0 1px 2px rgb(20 20 19 / 0.06);
  --goblin-shadow-md: 0 8px 24px rgb(20 20 19 / 0.11);
  --goblin-shadow-lg: 0 18px 48px rgb(20 20 19 / 0.16);
  --shadow-inset-highlight: inset 0 1px 0 rgb(255 255 255 / 0.38);
  --shadow-control-inset-highlight: inset 0 1px 0 rgb(255 255 255 / 0.44);
  --radius: 0.5rem;

  --color-terminal-background: #181715;
  --color-terminal-foreground: #faf9f5;
  --color-terminal-cursor: #faf9f5;
  --color-terminal-selection-background: rgba(204, 120, 92, 0.28);
  --color-terminal-ansi-black: #181715;
  --color-terminal-ansi-red: #c64545;
  --color-terminal-ansi-green: #5db872;
  --color-terminal-ansi-yellow: #d4a017;
  --color-terminal-ansi-blue: #6f9fd8;
  --color-terminal-ansi-magenta: #b58ad7;
  --color-terminal-ansi-cyan: #5db8a6;
  --color-terminal-ansi-white: #d8d2c8;
  --color-terminal-ansi-bright-black: #6c6a64;
  --color-terminal-ansi-bright-red: #e06a5f;
  --color-terminal-ansi-bright-green: #7ed08f;
  --color-terminal-ansi-bright-yellow: #e8a55a;
  --color-terminal-ansi-bright-blue: #8bb8f0;
  --color-terminal-ansi-bright-magenta: #d1a4ef;
  --color-terminal-ansi-bright-cyan: #74d2c0;
  --color-terminal-ansi-bright-white: #faf9f5;
  --color-terminal-search-match: #d4a017;
  --color-terminal-search-active-match: #cc785c;
  --color-terminal-search-active-border: #faf9f5;
}

html[data-color-theme='claude'][data-theme='dark'] {
  color-scheme: dark;

  --goblin-surface-canvas: #181715;
  --goblin-surface-base: #1f1e1b;
  --goblin-surface-raised: #252320;
  --goblin-surface-overlay: #2b2925;
  --goblin-surface-muted: #252320;
  --goblin-surface-hover: #33302b;
  --goblin-surface-control: #252320;
  --goblin-surface-control-hover: #33302b;
  --goblin-text-primary: #faf9f5;
  --goblin-text-secondary-strong: #e6dfd8;
  --goblin-text-secondary: #a09d96;
  --goblin-text-selected-secondary: #d6cec3;
  --goblin-border-subtle: rgb(230 223 216 / 0.12);
  --goblin-border-default: rgb(230 223 216 / 0.18);
  --goblin-border-strong: rgb(230 223 216 / 0.28);
  --goblin-focus-ring: #cc785c;
  --goblin-action-primary: #cc785c;
  --goblin-action-primary-foreground: #1f120d;
  --goblin-action-danger: #ff7b72;
  --goblin-action-danger-foreground: #2a0707;

  --goblin-accent: #cc785c;
  --goblin-accent-text: #e6a58e;
  --goblin-accent-rgb: 204 120 92;
  --goblin-accent-selection: rgb(var(--goblin-accent-rgb) / 0.22);
  --goblin-accent-surface: rgb(var(--goblin-accent-rgb) / 0.16);
  --goblin-accent-border: rgb(var(--goblin-accent-rgb) / 0.42);

  --goblin-status-warning-text: #e8a55a;
  --goblin-status-warning-rgb: 232 165 90;
  --goblin-status-warning-surface: rgb(var(--goblin-status-warning-rgb) / 0.14);
  --goblin-status-warning-border: rgb(var(--goblin-status-warning-rgb) / 0.36);
  --goblin-status-success-text: #7ed08f;
  --goblin-status-success-rgb: 126 208 143;
  --goblin-status-success-surface: rgb(var(--goblin-status-success-rgb) / 0.12);
  --goblin-status-success-border: rgb(var(--goblin-status-success-rgb) / 0.32);
  --goblin-status-danger-text: #ff7b72;
  --goblin-status-danger-rgb: 255 123 114;
  --goblin-status-danger-surface: rgb(var(--goblin-status-danger-rgb) / 0.12);
  --goblin-status-danger-border: rgb(var(--goblin-status-danger-rgb) / 0.36);

  --color-overlay-scrim: rgb(0 0 0 / 0.55);
  --goblin-shadow-xs: 0 1px 1px rgb(0 0 0 / 0.22);
  --goblin-shadow-sm: 0 1px 2px rgb(0 0 0 / 0.3);
  --goblin-shadow-md: 0 8px 24px rgb(0 0 0 / 0.38);
  --goblin-shadow-lg: 0 18px 48px rgb(0 0 0 / 0.48);
  --shadow-inset-highlight: inset 0 1px 0 rgb(255 255 255 / 0.08);
  --shadow-control-inset-highlight: inset 0 1px 0 rgb(255 255 255 / 0.1);
  --radius: 0.5rem;

  --color-terminal-background: #181715;
  --color-terminal-foreground: #faf9f5;
  --color-terminal-cursor: #faf9f5;
  --color-terminal-selection-background: rgba(204, 120, 92, 0.32);
  --color-terminal-ansi-black: #181715;
  --color-terminal-ansi-red: #ff7b72;
  --color-terminal-ansi-green: #7ed08f;
  --color-terminal-ansi-yellow: #e8a55a;
  --color-terminal-ansi-blue: #8bb8f0;
  --color-terminal-ansi-magenta: #d1a4ef;
  --color-terminal-ansi-cyan: #74d2c0;
  --color-terminal-ansi-white: #d8d2c8;
  --color-terminal-ansi-bright-black: #8e8b82;
  --color-terminal-ansi-bright-red: #ffa198;
  --color-terminal-ansi-bright-green: #a2e6ae;
  --color-terminal-ansi-bright-yellow: #f2c073;
  --color-terminal-ansi-bright-blue: #a8ccff;
  --color-terminal-ansi-bright-magenta: #e2bdff;
  --color-terminal-ansi-bright-cyan: #95e4d5;
  --color-terminal-ansi-bright-white: #ffffff;
  --color-terminal-search-match: #e8a55a;
  --color-terminal-search-active-match: #cc785c;
  --color-terminal-search-active-border: #ffffff;
}
```

- [ ] **Step 2: Create Cursor theme CSS**

Create `src/web/theme/themes/cursor.css`:

```css
html[data-color-theme='cursor'][data-theme='light'] {
  color-scheme: light;

  --goblin-surface-canvas: #f7f7f4;
  --goblin-surface-base: #fafaf7;
  --goblin-surface-raised: #ffffff;
  --goblin-surface-overlay: #ffffff;
  --goblin-surface-muted: #efeee8;
  --goblin-surface-hover: #e6e5e0;
  --goblin-surface-control: #ffffff;
  --goblin-surface-control-hover: #fafaf7;
  --goblin-text-primary: #26251e;
  --goblin-text-secondary-strong: #3f3d35;
  --goblin-text-secondary: #5a5852;
  --goblin-text-selected-secondary: #4d4a43;
  --goblin-border-subtle: #efeee8;
  --goblin-border-default: #e6e5e0;
  --goblin-border-strong: #cfcdc4;
  --goblin-focus-ring: #f54e00;
  --goblin-action-primary: #f54e00;
  --goblin-action-primary-foreground: #ffffff;
  --goblin-action-danger: #cf2d56;
  --goblin-action-danger-foreground: #ffffff;

  --goblin-accent: #f54e00;
  --goblin-accent-text: #d04200;
  --goblin-accent-rgb: 245 78 0;
  --goblin-accent-selection: rgb(var(--goblin-accent-rgb) / 0.12);
  --goblin-accent-surface: rgb(var(--goblin-accent-rgb) / 0.08);
  --goblin-accent-border: rgb(var(--goblin-accent-rgb) / 0.28);

  --goblin-status-warning-text: #8a5d13;
  --goblin-status-warning-rgb: 192 133 50;
  --goblin-status-warning-surface: rgb(var(--goblin-status-warning-rgb) / 0.14);
  --goblin-status-warning-border: rgb(var(--goblin-status-warning-rgb) / 0.38);
  --goblin-status-success-text: #1f8a65;
  --goblin-status-success-rgb: 31 138 101;
  --goblin-status-success-surface: rgb(var(--goblin-status-success-rgb) / 0.1);
  --goblin-status-success-border: rgb(var(--goblin-status-success-rgb) / 0.3);
  --goblin-status-danger-text: #cf2d56;
  --goblin-status-danger-rgb: 207 45 86;
  --goblin-status-danger-surface: rgb(var(--goblin-status-danger-rgb) / 0.09);
  --goblin-status-danger-border: rgb(var(--goblin-status-danger-rgb) / 0.32);

  --color-overlay-scrim: rgb(38 37 30 / 0.4);
  --goblin-shadow-xs: 0 1px 1px rgb(38 37 30 / 0.03);
  --goblin-shadow-sm: 0 1px 2px rgb(38 37 30 / 0.05);
  --goblin-shadow-md: 0 8px 24px rgb(38 37 30 / 0.09);
  --goblin-shadow-lg: 0 18px 48px rgb(38 37 30 / 0.13);
  --shadow-inset-highlight: inset 0 1px 0 rgb(255 255 255 / 0.36);
  --shadow-control-inset-highlight: inset 0 1px 0 rgb(255 255 255 / 0.42);
  --radius: 0.5rem;

  --color-terminal-background: #ffffff;
  --color-terminal-foreground: #26251e;
  --color-terminal-cursor: #26251e;
  --color-terminal-selection-background: rgba(245, 78, 0, 0.18);
  --color-terminal-ansi-black: #26251e;
  --color-terminal-ansi-red: #cf2d56;
  --color-terminal-ansi-green: #1f8a65;
  --color-terminal-ansi-yellow: #a06b19;
  --color-terminal-ansi-blue: #396fbd;
  --color-terminal-ansi-magenta: #7c4ab0;
  --color-terminal-ansi-cyan: #317f8f;
  --color-terminal-ansi-white: #807d72;
  --color-terminal-ansi-bright-black: #a09c92;
  --color-terminal-ansi-bright-red: #e54870;
  --color-terminal-ansi-bright-green: #2aa876;
  --color-terminal-ansi-bright-yellow: #c08532;
  --color-terminal-ansi-bright-blue: #5c8fdc;
  --color-terminal-ansi-bright-magenta: #9a6bd0;
  --color-terminal-ansi-bright-cyan: #4c9aaa;
  --color-terminal-ansi-bright-white: #26251e;
  --color-terminal-search-match: #c08532;
  --color-terminal-search-active-match: #f54e00;
  --color-terminal-search-active-border: #26251e;
}

html[data-color-theme='cursor'][data-theme='dark'] {
  color-scheme: dark;

  --goblin-surface-canvas: #1f1f1c;
  --goblin-surface-base: #26251e;
  --goblin-surface-raised: #2e2d26;
  --goblin-surface-overlay: #35342c;
  --goblin-surface-muted: #2e2d26;
  --goblin-surface-hover: #3d3b33;
  --goblin-surface-control: #2e2d26;
  --goblin-surface-control-hover: #3d3b33;
  --goblin-text-primary: #f7f7f4;
  --goblin-text-secondary-strong: #e6e5e0;
  --goblin-text-secondary: #a09c92;
  --goblin-text-selected-secondary: #d4d1c8;
  --goblin-border-subtle: rgb(230 229 224 / 0.1);
  --goblin-border-default: rgb(230 229 224 / 0.16);
  --goblin-border-strong: rgb(230 229 224 / 0.26);
  --goblin-focus-ring: #f54e00;
  --goblin-action-primary: #f54e00;
  --goblin-action-primary-foreground: #1f0a00;
  --goblin-action-danger: #ff6b8a;
  --goblin-action-danger-foreground: #2c0611;

  --goblin-accent: #f54e00;
  --goblin-accent-text: #ff8a4d;
  --goblin-accent-rgb: 245 78 0;
  --goblin-accent-selection: rgb(var(--goblin-accent-rgb) / 0.2);
  --goblin-accent-surface: rgb(var(--goblin-accent-rgb) / 0.14);
  --goblin-accent-border: rgb(var(--goblin-accent-rgb) / 0.4);

  --goblin-status-warning-text: #dfa85a;
  --goblin-status-warning-rgb: 223 168 90;
  --goblin-status-warning-surface: rgb(var(--goblin-status-warning-rgb) / 0.13);
  --goblin-status-warning-border: rgb(var(--goblin-status-warning-rgb) / 0.34);
  --goblin-status-success-text: #65c59c;
  --goblin-status-success-rgb: 101 197 156;
  --goblin-status-success-surface: rgb(var(--goblin-status-success-rgb) / 0.12);
  --goblin-status-success-border: rgb(var(--goblin-status-success-rgb) / 0.32);
  --goblin-status-danger-text: #ff6b8a;
  --goblin-status-danger-rgb: 255 107 138;
  --goblin-status-danger-surface: rgb(var(--goblin-status-danger-rgb) / 0.12);
  --goblin-status-danger-border: rgb(var(--goblin-status-danger-rgb) / 0.34);

  --color-overlay-scrim: rgb(0 0 0 / 0.54);
  --goblin-shadow-xs: 0 1px 1px rgb(0 0 0 / 0.2);
  --goblin-shadow-sm: 0 1px 2px rgb(0 0 0 / 0.28);
  --goblin-shadow-md: 0 8px 24px rgb(0 0 0 / 0.36);
  --goblin-shadow-lg: 0 18px 48px rgb(0 0 0 / 0.46);
  --shadow-inset-highlight: inset 0 1px 0 rgb(255 255 255 / 0.08);
  --shadow-control-inset-highlight: inset 0 1px 0 rgb(255 255 255 / 0.09);
  --radius: 0.5rem;

  --color-terminal-background: #1f1f1c;
  --color-terminal-foreground: #f7f7f4;
  --color-terminal-cursor: #f7f7f4;
  --color-terminal-selection-background: rgba(245, 78, 0, 0.3);
  --color-terminal-ansi-black: #1f1f1c;
  --color-terminal-ansi-red: #ff6b8a;
  --color-terminal-ansi-green: #65c59c;
  --color-terminal-ansi-yellow: #dfa85a;
  --color-terminal-ansi-blue: #7aa7ee;
  --color-terminal-ansi-magenta: #c59be8;
  --color-terminal-ansi-cyan: #77c8d5;
  --color-terminal-ansi-white: #d4d1c8;
  --color-terminal-ansi-bright-black: #807d72;
  --color-terminal-ansi-bright-red: #ff8aa3;
  --color-terminal-ansi-bright-green: #82ddb5;
  --color-terminal-ansi-bright-yellow: #f0c06f;
  --color-terminal-ansi-bright-blue: #9ec2ff;
  --color-terminal-ansi-bright-magenta: #d9b4ff;
  --color-terminal-ansi-bright-cyan: #98e1ea;
  --color-terminal-ansi-bright-white: #ffffff;
  --color-terminal-search-match: #dfa85a;
  --color-terminal-search-active-match: #f54e00;
  --color-terminal-search-active-border: #ffffff;
}
```

- [ ] **Step 3: Create Apple theme CSS**

Create `src/web/theme/themes/apple.css`:

```css
html[data-color-theme='apple'][data-theme='light'] {
  color-scheme: light;

  --goblin-surface-canvas: #ffffff;
  --goblin-surface-base: #f5f5f7;
  --goblin-surface-raised: #ffffff;
  --goblin-surface-overlay: #ffffff;
  --goblin-surface-muted: #fafafc;
  --goblin-surface-hover: #f0f0f0;
  --goblin-surface-control: #ffffff;
  --goblin-surface-control-hover: #f5f5f7;
  --goblin-text-primary: #1d1d1f;
  --goblin-text-secondary-strong: #333333;
  --goblin-text-secondary: #7a7a7a;
  --goblin-text-selected-secondary: #333333;
  --goblin-border-subtle: #f0f0f0;
  --goblin-border-default: #e0e0e0;
  --goblin-border-strong: #d2d2d7;
  --goblin-focus-ring: #0071e3;
  --goblin-action-primary: #0066cc;
  --goblin-action-primary-foreground: #ffffff;
  --goblin-action-danger: #d70015;
  --goblin-action-danger-foreground: #ffffff;

  --goblin-accent: #0066cc;
  --goblin-accent-text: #0066cc;
  --goblin-accent-rgb: 0 102 204;
  --goblin-accent-selection: rgb(var(--goblin-accent-rgb) / 0.12);
  --goblin-accent-surface: rgb(var(--goblin-accent-rgb) / 0.08);
  --goblin-accent-border: rgb(var(--goblin-accent-rgb) / 0.32);

  --goblin-status-warning-text: #946200;
  --goblin-status-warning-rgb: 255 149 0;
  --goblin-status-warning-surface: rgb(var(--goblin-status-warning-rgb) / 0.12);
  --goblin-status-warning-border: rgb(var(--goblin-status-warning-rgb) / 0.36);
  --goblin-status-success-text: #1f7f37;
  --goblin-status-success-rgb: 52 199 89;
  --goblin-status-success-surface: rgb(var(--goblin-status-success-rgb) / 0.1);
  --goblin-status-success-border: rgb(var(--goblin-status-success-rgb) / 0.34);
  --goblin-status-danger-text: #d70015;
  --goblin-status-danger-rgb: 215 0 21;
  --goblin-status-danger-surface: rgb(var(--goblin-status-danger-rgb) / 0.08);
  --goblin-status-danger-border: rgb(var(--goblin-status-danger-rgb) / 0.34);

  --color-overlay-scrim: rgb(0 0 0 / 0.38);
  --goblin-shadow-xs: 0 1px 1px rgb(0 0 0 / 0.03);
  --goblin-shadow-sm: 0 1px 2px rgb(0 0 0 / 0.05);
  --goblin-shadow-md: 0 10px 30px rgb(0 0 0 / 0.1);
  --goblin-shadow-lg: 0 20px 56px rgb(0 0 0 / 0.14);
  --shadow-inset-highlight: inset 0 1px 0 rgb(255 255 255 / 0.32);
  --shadow-control-inset-highlight: inset 0 1px 0 rgb(255 255 255 / 0.36);
  --radius: 0.6875rem;

  --color-terminal-background: #272729;
  --color-terminal-foreground: #ffffff;
  --color-terminal-cursor: #ffffff;
  --color-terminal-selection-background: rgba(0, 102, 204, 0.32);
  --color-terminal-ansi-black: #000000;
  --color-terminal-ansi-red: #ff453a;
  --color-terminal-ansi-green: #34c759;
  --color-terminal-ansi-yellow: #ff9500;
  --color-terminal-ansi-blue: #2997ff;
  --color-terminal-ansi-magenta: #bf5af2;
  --color-terminal-ansi-cyan: #32ade6;
  --color-terminal-ansi-white: #cccccc;
  --color-terminal-ansi-bright-black: #7a7a7a;
  --color-terminal-ansi-bright-red: #ff6961;
  --color-terminal-ansi-bright-green: #30d158;
  --color-terminal-ansi-bright-yellow: #ffd60a;
  --color-terminal-ansi-bright-blue: #0071e3;
  --color-terminal-ansi-bright-magenta: #da8fff;
  --color-terminal-ansi-bright-cyan: #64d2ff;
  --color-terminal-ansi-bright-white: #ffffff;
  --color-terminal-search-match: #ff9500;
  --color-terminal-search-active-match: #0066cc;
  --color-terminal-search-active-border: #ffffff;
}

html[data-color-theme='apple'][data-theme='dark'] {
  color-scheme: dark;

  --goblin-surface-canvas: #000000;
  --goblin-surface-base: #1d1d1f;
  --goblin-surface-raised: #272729;
  --goblin-surface-overlay: #2a2a2c;
  --goblin-surface-muted: #252527;
  --goblin-surface-hover: #333336;
  --goblin-surface-control: #272729;
  --goblin-surface-control-hover: #333336;
  --goblin-text-primary: #ffffff;
  --goblin-text-secondary-strong: #f5f5f7;
  --goblin-text-secondary: #cccccc;
  --goblin-text-selected-secondary: #e6e6e8;
  --goblin-border-subtle: rgb(255 255 255 / 0.1);
  --goblin-border-default: rgb(255 255 255 / 0.16);
  --goblin-border-strong: rgb(255 255 255 / 0.26);
  --goblin-focus-ring: #2997ff;
  --goblin-action-primary: #2997ff;
  --goblin-action-primary-foreground: #001a33;
  --goblin-action-danger: #ff453a;
  --goblin-action-danger-foreground: #260605;

  --goblin-accent: #2997ff;
  --goblin-accent-text: #5eb0ff;
  --goblin-accent-rgb: 41 151 255;
  --goblin-accent-selection: rgb(var(--goblin-accent-rgb) / 0.24);
  --goblin-accent-surface: rgb(var(--goblin-accent-rgb) / 0.16);
  --goblin-accent-border: rgb(var(--goblin-accent-rgb) / 0.42);

  --goblin-status-warning-text: #ffd60a;
  --goblin-status-warning-rgb: 255 214 10;
  --goblin-status-warning-surface: rgb(var(--goblin-status-warning-rgb) / 0.13);
  --goblin-status-warning-border: rgb(var(--goblin-status-warning-rgb) / 0.34);
  --goblin-status-success-text: #30d158;
  --goblin-status-success-rgb: 48 209 88;
  --goblin-status-success-surface: rgb(var(--goblin-status-success-rgb) / 0.13);
  --goblin-status-success-border: rgb(var(--goblin-status-success-rgb) / 0.34);
  --goblin-status-danger-text: #ff453a;
  --goblin-status-danger-rgb: 255 69 58;
  --goblin-status-danger-surface: rgb(var(--goblin-status-danger-rgb) / 0.12);
  --goblin-status-danger-border: rgb(var(--goblin-status-danger-rgb) / 0.36);

  --color-overlay-scrim: rgb(0 0 0 / 0.58);
  --goblin-shadow-xs: 0 1px 1px rgb(0 0 0 / 0.24);
  --goblin-shadow-sm: 0 1px 2px rgb(0 0 0 / 0.32);
  --goblin-shadow-md: 0 10px 30px rgb(0 0 0 / 0.4);
  --goblin-shadow-lg: 0 20px 56px rgb(0 0 0 / 0.5);
  --shadow-inset-highlight: inset 0 1px 0 rgb(255 255 255 / 0.08);
  --shadow-control-inset-highlight: inset 0 1px 0 rgb(255 255 255 / 0.1);
  --radius: 0.6875rem;

  --color-terminal-background: #000000;
  --color-terminal-foreground: #ffffff;
  --color-terminal-cursor: #ffffff;
  --color-terminal-selection-background: rgba(41, 151, 255, 0.34);
  --color-terminal-ansi-black: #000000;
  --color-terminal-ansi-red: #ff453a;
  --color-terminal-ansi-green: #30d158;
  --color-terminal-ansi-yellow: #ffd60a;
  --color-terminal-ansi-blue: #2997ff;
  --color-terminal-ansi-magenta: #bf5af2;
  --color-terminal-ansi-cyan: #64d2ff;
  --color-terminal-ansi-white: #cccccc;
  --color-terminal-ansi-bright-black: #7a7a7a;
  --color-terminal-ansi-bright-red: #ff6961;
  --color-terminal-ansi-bright-green: #32d74b;
  --color-terminal-ansi-bright-yellow: #ffdf5d;
  --color-terminal-ansi-bright-blue: #5eb0ff;
  --color-terminal-ansi-bright-magenta: #da8fff;
  --color-terminal-ansi-bright-cyan: #70d7ff;
  --color-terminal-ansi-bright-white: #ffffff;
  --color-terminal-search-match: #ffd60a;
  --color-terminal-search-active-match: #2997ff;
  --color-terminal-search-active-border: #ffffff;
}
```

- [ ] **Step 4: Import new CSS files**

Modify `src/web/theme/theme.css` to:

```css
@import './contract.css';
@import './themes/macos.css';
@import './themes/mono.css';
@import './themes/github.css';
@import './themes/claude.css';
@import './themes/cursor.css';
@import './themes/apple.css';
```

- [ ] **Step 5: Run CSS contract tests**

Run:

```bash
bun run test src/web/theme/theme-presets.test.ts
```

Expected:

- PASS.

---

### Task 6: Audit Target Area Hard-Coded Colors

**Files:**
- No expected file changes unless the audit finds a real target-area hard-coded color outside theme CSS/test fixtures.

- [ ] **Step 1: Run target-area color audit**

Run:

```bash
rg -n "#[0-9a-fA-F]{3,8}|rgb\\(|rgba\\(|color-mix\\(" "src/web/components/file-tree" "src/web/components/branch-list" "src/web/components/BranchList.tsx" "src/web/components/branch-detail" "src/web/components/terminal"
```

Expected:

- `src/web/components/terminal/terminal-session.css` contains `color-mix(...)` using semantic tokens such as `var(--color-brand)`, `var(--color-popover)`, `var(--color-background)`, and `var(--color-ring)`.
- `src/web/components/terminal/terminal-theme-test-utils.ts` contains test CSS literals.
- `src/web/components/terminal/ManagedTerminalSession.test.ts` contains expected CSS literal assertions.
- No file tree, branch list, or branch detail React component should contain raw hex/rgb color literals.

- [ ] **Step 2: If the audit finds raw color literals in target React components, replace them with existing semantic tokens**

Only apply this exact mapping if such literals are found:

```txt
Raw selected-row color -> bg-selected / text-selected-foreground
Raw hover surface color -> bg-muted or hover:bg-muted
Raw border color -> border-separator or border-border
Raw warning color -> text-attention / bg-attention-surface / border-attention-border
Raw success color -> text-success / bg-success-surface / border-success-border
Raw danger color -> text-danger / bg-danger-surface / border-danger-border
Raw terminal surface color -> --color-terminal-* token in CSS
```

Do not add `colorTheme` checks to React components.

- [ ] **Step 3: Re-run related component tests if Step 2 changed files**

Run only if files changed in Step 2:

```bash
bun run test src/web/components/file-tree/ProjectFileTree.test.tsx src/web/components/BranchList.test.tsx src/web/components/branch-list/BranchRow.test.tsx src/web/components/terminal/TerminalSlot.test.tsx
```

Expected:

- PASS.

---

### Task 7: Run Focused and Full Verification

**Files:**
- No code changes.

- [ ] **Step 1: Run all focused tests added or touched by this plan**

Run:

```bash
bun run test src/shared/color-theme.test.ts src/web/public/boot.test.ts src/server/modules/settings-source.test.ts src/shared/native-shell-projection.test.ts src/shared/theme-tokens.test.ts src/main/theme.test.ts src/web/theme/theme-presets.test.ts
```

Expected:

- PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected:

- PASS.

- [ ] **Step 3: Run full test suite**

Run:

```bash
bun run test
```

Expected:

- PASS.

- [ ] **Step 4: Run architecture guard**

Run:

```bash
bun run check:architecture
```

Expected:

- PASS.

---

### Task 8: Manual UI Verification

**Files:**
- No code changes unless manual verification reveals a specific defect.

- [ ] **Step 1: Start the dev server**

Run:

```bash
bun run dev
```

Expected:

- The dev server starts and prints a local URL.

- [ ] **Step 2: Verify Settings options**

Open the app and go to Settings -> General.

Expected theme preset options:

```txt
macOS
Mono
GitHub
Claude
Cursor
Apple
```

- [ ] **Step 3: Verify light and dark coverage**

For each new theme preset:

```txt
Claude
Cursor
Apple
```

Select:

```txt
Appearance: Light
Appearance: Dark
```

Expected:

- File area changes canvas, selected row, muted text, borders, and status colors.
- Branch area changes selected branch row, hover surface, badges, muted metadata, and attention/success/danger colors.
- Terminal area changes background, foreground, cursor, selection, ANSI colors, search match colors, and floating terminal controls.

- [ ] **Step 4: Verify startup query behavior**

Open the dev URL with each query:

```txt
?theme=light&colorTheme=claude
?theme=dark&colorTheme=claude
?theme=light&colorTheme=cursor
?theme=dark&colorTheme=cursor
?theme=light&colorTheme=apple
?theme=dark&colorTheme=apple
```

Expected:

- The first paint uses the requested color theme.
- There is no visible fallback flash to `macos`.

- [ ] **Step 5: Verify existing presets still work**

Switch to:

```txt
macOS
Mono
GitHub
```

Expected:

- Existing presets still render as before.
- Default remains `macOS` for missing or invalid theme values.

---

## Self-Review Checklist

- Spec coverage:
  - New IDs: Task 1 and Task 4.
  - Settings selector: Task 4 labels plus existing `GeneralSettings` mapping.
  - First paint: Task 1 boot test and Task 4 boot update.
  - Native background: Task 2 and Task 4.
  - Renderer CSS token coverage: Task 3 and Task 5.
  - File/branch/terminal target coverage: Task 5 token files, Task 6 audit, Task 8 manual verification.
  - Font unchanged: no task modifies `src/web/theme/contract.css`, `src/web/styles.css`, or terminal geometry font constants.
- No placeholders:
  - Each code-producing step includes concrete file paths and code.
  - Placeholder keywords are absent from implementation steps.
- Type consistency:
  - `ColorTheme` remains derived from `COLOR_THEMES`.
  - Native token map is `Record<ColorTheme, Record<ResolvedTheme, string>>`.
  - `boot.js` allowlist is tested against `COLOR_THEMES`.
