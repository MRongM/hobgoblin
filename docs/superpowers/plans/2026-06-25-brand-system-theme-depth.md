# Brand System Theme Depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make design-derived theme switching affect the whole application by replacing the standalone `apple` preset with a stronger `macos` preset, adding `airbnb` and `bmw`, and expanding theme tokens across app shell, primitives, feature panes, terminal, and native chrome.

**Architecture:** Keep the existing `data-theme` plus `data-color-theme` model. Centralize current theme IDs and legacy `apple` normalization in shared code, expand CSS token contracts, and connect shared UI primitives plus app shell containers to those tokens. Use CSS variables and semantic utilities only; do not add React component branches by brand.

**Tech Stack:** TypeScript strip-only mode, React, Tailwind v4 theme tokens, shadcn-style primitives, Electron shell projection, Vitest, Bun.

---

## Project Overrides

- Do not add git commit steps. Project instructions explicitly say not to plan or execute git commits unless the user asks.
- Keep app and terminal fonts unchanged. `Maple Mono NF CN` remains the runtime font stack.
- Do not use TypeScript enums, namespaces with runtime code, parameter properties, or import aliases.
- Use repo-alias imports with explicit `.ts` / `.tsx` extensions.

## File Map

- Modify: `src/shared/color-theme.ts`
  - Own current preset IDs and legacy `apple -> macos` normalization.
- Modify: `src/shared/color-theme.test.ts`
  - Assert current IDs, legacy normalization, and invalid `apple` validation.
- Modify: `src/server/modules/settings-source.ts`
  - Use shared color theme normalization for persisted and patched settings.
- Modify: `src/server/modules/settings-source.test.ts`
  - Cover `airbnb`, `bmw`, unknown values, and legacy `apple`.
- Modify: `src/web/public/boot.js`
  - Keep first paint allowlist current and normalize `apple` query values to `macos`.
- Modify: `src/web/public/boot.test.ts`
  - Assert allowlist sync and legacy boot normalization.
- Modify: `src/shared/native-shell-projection.test.ts`
  - Accept current presets and reject standalone `apple`.
- Modify: `src/shared/theme-tokens.ts`
  - Remove `apple`; add `airbnb` and `bmw`; align `macos` with Apple-style canvas.
- Modify: `src/shared/theme-tokens.test.ts`
  - Assert native window coverage for every current preset.
- Modify: `src/web/theme/theme-presets.test.ts`
  - Require foundation, app-region, and terminal tokens for every current preset.
- Modify: `src/web/theme/theme.css`
  - Remove `apple.css`; import `airbnb.css` and `bmw.css`.
- Modify: `src/web/theme/themes/macos.css`
  - Fold in Apple-style values and add app-region tokens.
- Modify: `src/web/theme/themes/mono.css`
  - Add app-region tokens.
- Modify: `src/web/theme/themes/github.css`
  - Add app-region tokens.
- Modify: `src/web/theme/themes/claude.css`
  - Add app-region tokens.
- Modify: `src/web/theme/themes/cursor.css`
  - Add app-region tokens.
- Create: `src/web/theme/themes/airbnb.css`
  - Define light/dark foundation, app-region, and terminal tokens.
- Create: `src/web/theme/themes/bmw.css`
  - Define light/dark foundation, app-region, and terminal tokens.
- Delete: `src/web/theme/themes/apple.css`
  - Standalone Apple preset is removed.
- Modify: `src/web/theme/contract.css`
  - Map app-region tokens to reusable semantic CSS aliases and keep font tokens unchanged.
- Modify: `src/web/theme/font-contract.test.ts`
  - Keep existing font contract green after contract changes.
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/shared/i18n/ja.ts`
  - Remove Apple label and add Airbnb/BMW labels.
- Create: `src/web/theme/hardcoded-colors.test.ts`
  - Enforce strict no-hard-coded-component-color policy.
- Modify shared UI and shell files listed by Tasks 8 and 9:
  - `src/web/components/ui/button.tsx`
  - `src/web/components/ui/input.tsx`
  - `src/web/components/ui/panel.tsx`
  - `src/web/components/Topbar.tsx`
  - `src/web/components/settings/SettingsContentFrame.tsx`
  - `src/web/components/settings/SettingsLayout.tsx`
  - `src/web/components/file-tree/ProjectFileTree.tsx`
  - `src/web/components/BranchList.tsx`
  - `src/web/components/BranchDetail.tsx`
  - `src/web/components/repo-tabs/RepoTabStrip.tsx`
  - `src/web/components/terminal/terminal-session.css`

---

### Task 1: Add Failing Tests For Theme IDs And Legacy Apple Migration

**Files:**
- Modify: `src/shared/color-theme.test.ts`
- Modify: `src/server/modules/settings-source.test.ts`
- Modify: `src/web/public/boot.test.ts`
- Modify: `src/shared/native-shell-projection.test.ts`

- [ ] **Step 1: Replace the shared color theme test**

Replace `src/shared/color-theme.test.ts` with:

```ts
import { describe, expect, test } from 'vitest'
import { COLOR_THEMES, DEFAULT_COLOR_THEME, isColorTheme, normalizeColorTheme } from '#/shared/color-theme.ts'

const CURRENT_BRAND_THEMES = ['claude', 'cursor', 'airbnb', 'bmw'] as const

describe('color theme presets', () => {
  test('lists current theme presets in settings order', () => {
    expect(COLOR_THEMES).toEqual(['macos', 'mono', 'github', 'claude', 'cursor', 'airbnb', 'bmw'])
    expect(DEFAULT_COLOR_THEME).toBe('macos')
  })

  test('validates current theme presets only', () => {
    for (const theme of CURRENT_BRAND_THEMES) {
      expect(isColorTheme(theme)).toBe(true)
    }

    expect(isColorTheme('apple')).toBe(false)
    expect(isColorTheme('default')).toBe(false)
    expect(isColorTheme('claude-dark')).toBe(false)
    expect(isColorTheme(null)).toBe(false)
  })

  test('normalizes legacy apple to macos', () => {
    expect(normalizeColorTheme('apple')).toBe('macos')
    expect(normalizeColorTheme('airbnb')).toBe('airbnb')
    expect(normalizeColorTheme('bmw')).toBe('bmw')
    expect(normalizeColorTheme('not-a-theme')).toBe(DEFAULT_COLOR_THEME)
    expect(normalizeColorTheme(null)).toBe(DEFAULT_COLOR_THEME)
  })
})
```

- [ ] **Step 2: Extend settings-source tests**

In `src/server/modules/settings-source.test.ts`, replace the existing design preset test with:

```ts
test('accepts current design color themes and normalizes legacy apple plus unknown presets', async () => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'gbl-server-settings-'))
  previousDataDir = process.env.GOBLIN_SERVER_DATA_DIR
  process.env.GOBLIN_SERVER_DATA_DIR = tmp

  const mod = await import('#/server/modules/settings-source.ts')
  for (const colorTheme of ['claude', 'cursor', 'airbnb', 'bmw'] as const) {
    await mod.updateServerSettingsPrefs({ colorTheme })
    expect(await mod.getServerSettingsPrefs()).toMatchObject({ colorTheme })
  }

  await mod.updateServerSettingsPrefs({ colorTheme: 'apple' as never })
  expect(await mod.getServerSettingsPrefs()).toMatchObject({ colorTheme: 'macos' })

  await mod.updateServerSettingsPrefs({ colorTheme: 'not-a-theme' as never })
  expect(await mod.getServerSettingsPrefs()).toMatchObject({ colorTheme: 'macos' })
})
```

- [ ] **Step 3: Replace the boot allowlist test**

Replace `src/web/public/boot.test.ts` with:

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

  test('maps legacy apple query values to macos before validation', () => {
    const boot = readFileSync(new URL('./boot.js', import.meta.url), 'utf8')
    expect(boot).toContain("if (colorTheme === 'apple') colorTheme = 'macos'")
  })
})
```

- [ ] **Step 4: Update native projection tests**

In `src/shared/native-shell-projection.test.ts`, update the design preset schema coverage to:

```ts
  test('accepts current design color theme presets in native projection payloads', () => {
    for (const colorTheme of ['claude', 'cursor', 'airbnb', 'bmw'] as const) {
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

  test('rejects legacy apple in current native projection payloads', () => {
    expect(
      v.safeParse(NativeShellProjectionSchema, {
        prefs: {
          patch: { colorTheme: 'apple' },
          settings: {
            lang: 'auto',
            theme: 'auto',
            colorTheme: 'apple',
            shortcutsDisabled: false,
            globalShortcutDisabled: false,
            swapCloseShortcuts: false,
            globalShortcut: 'Alt+G',
          },
        },
      }).success,
    ).toBe(false)
  })
```

- [ ] **Step 5: Run failing tests**

Run:

```bash
bun run test src/shared/color-theme.test.ts src/server/modules/settings-source.test.ts src/web/public/boot.test.ts src/shared/native-shell-projection.test.ts
```

Expected now: FAIL because `airbnb` and `bmw` are not in `COLOR_THEMES`, `apple` is still valid, and shared `normalizeColorTheme()` does not exist.

---

### Task 2: Implement Theme IDs, Legacy Normalization, Boot, And Labels

**Files:**
- Modify: `src/shared/color-theme.ts`
- Modify: `src/server/modules/settings-source.ts`
- Modify: `src/web/public/boot.js`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/shared/i18n/ja.ts`

- [ ] **Step 1: Replace shared color theme definitions**

Replace `src/shared/color-theme.ts` with:

```ts
// Keep this in sync with the pre-React allowlist in `src/web/public/boot.js`.
export const COLOR_THEMES = ['macos', 'mono', 'github', 'claude', 'cursor', 'airbnb', 'bmw'] as const

export type ColorTheme = (typeof COLOR_THEMES)[number]

export const DEFAULT_COLOR_THEME: ColorTheme = 'macos'

export function isColorTheme(value: unknown): value is ColorTheme {
  return typeof value === 'string' && COLOR_THEMES.includes(value as ColorTheme)
}

export function normalizeColorTheme(value: unknown): ColorTheme {
  if (value === 'apple') return 'macos'
  return isColorTheme(value) ? value : DEFAULT_COLOR_THEME
}
```

- [ ] **Step 2: Use shared normalization in server settings**

In `src/server/modules/settings-source.ts`, change the import:

```ts
import { normalizeColorTheme, type ColorTheme } from '#/shared/color-theme.ts'
```

Then delete the local function:

```ts
function normalizeColorTheme(value: unknown): ColorTheme {
  return isColorTheme(value) ? value : DEFAULT_COLOR_THEME
}
```

Also remove now-unused `isColorTheme` and `DEFAULT_COLOR_THEME` imports from this file.

- [ ] **Step 3: Update the boot script allowlist**

In `src/web/public/boot.js`, replace the color theme block with:

```js
  var colorTheme = qs.get('colorTheme')
  if (colorTheme === 'apple') colorTheme = 'macos'
  var colorThemes = ['macos', 'mono', 'github', 'claude', 'cursor', 'airbnb', 'bmw']
  if (colorThemes.indexOf(colorTheme) === -1) colorTheme = 'macos'
```

- [ ] **Step 4: Update i18n theme labels**

In `src/shared/i18n/en.ts`, replace:

```ts
  'settings.theme-preset.apple': 'Apple',
```

with:

```ts
  'settings.theme-preset.airbnb': 'Airbnb',
  'settings.theme-preset.bmw': 'BMW',
```

Apply the same key changes in `src/shared/i18n/zh.ts`, `src/shared/i18n/ko.ts`, and `src/shared/i18n/ja.ts`. The values can remain official brand names:

```ts
  'settings.theme-preset.airbnb': 'Airbnb',
  'settings.theme-preset.bmw': 'BMW',
```

- [ ] **Step 5: Run ID and label tests**

Run:

```bash
bun run test src/shared/color-theme.test.ts src/server/modules/settings-source.test.ts src/web/public/boot.test.ts src/shared/native-shell-projection.test.ts src/shared/i18n/dictionaries.test.ts
```

Expected: PASS for the files touched in this task, except failures that depend on missing theme CSS/native token files will be handled in later tasks.

---

### Task 3: Expand Theme Token Contract Tests

**Files:**
- Modify: `src/shared/theme-tokens.test.ts`
- Modify: `src/web/theme/theme-presets.test.ts`

- [ ] **Step 1: Replace native theme token test**

Replace `src/shared/theme-tokens.test.ts` with:

```ts
import { describe, expect, test } from 'vitest'
import { COLOR_THEMES } from '#/shared/color-theme.ts'
import { WINDOW_BACKGROUND_BY_COLOR_THEME } from '#/shared/theme-tokens.ts'

describe('native theme tokens', () => {
  test('defines native window backgrounds for every shared color theme', () => {
    expect(Object.keys(WINDOW_BACKGROUND_BY_COLOR_THEME)).toEqual([...COLOR_THEMES])
  })

  test('does not define removed apple native window backgrounds', () => {
    expect(WINDOW_BACKGROUND_BY_COLOR_THEME).not.toHaveProperty('apple')
  })

  test('defines light and dark native window backgrounds for current presets', () => {
    for (const colorTheme of COLOR_THEMES) {
      expect(WINDOW_BACKGROUND_BY_COLOR_THEME[colorTheme]).toMatchObject({
        light: expect.stringMatching(/^#[0-9a-f]{6}$/i),
        dark: expect.stringMatching(/^#[0-9a-f]{6}$/i),
      })
    }
  })
})
```

- [ ] **Step 2: Replace CSS contract test**

Replace `src/web/theme/theme-presets.test.ts` with:

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
  '--goblin-surface-control',
  '--goblin-surface-control-hover',
  '--goblin-text-primary',
  '--goblin-text-secondary-strong',
  '--goblin-text-secondary',
  '--goblin-text-selected-secondary',
  '--goblin-text-disabled',
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
  '--goblin-accent-selection',
  '--goblin-accent-surface',
  '--goblin-accent-border',
  '--goblin-status-warning-text',
  '--goblin-status-warning-rgb',
  '--goblin-status-warning-surface',
  '--goblin-status-warning-border',
  '--goblin-status-success-text',
  '--goblin-status-success-rgb',
  '--goblin-status-success-surface',
  '--goblin-status-success-border',
  '--goblin-status-danger-text',
  '--goblin-status-danger-rgb',
  '--goblin-status-danger-surface',
  '--goblin-status-danger-border',
  '--color-overlay-scrim',
  '--goblin-shadow-xs',
  '--goblin-shadow-sm',
  '--goblin-shadow-md',
  '--goblin-shadow-lg',
  '--shadow-inset-highlight',
  '--shadow-control-inset-highlight',
  '--radius',
] as const

const APP_REGION_TOKENS = [
  '--goblin-app-bg',
  '--goblin-topbar-bg',
  '--goblin-topbar-border',
  '--goblin-tab-bg',
  '--goblin-tab-hover-bg',
  '--goblin-tab-active-bg',
  '--goblin-sidebar-bg',
  '--goblin-pane-bg',
  '--goblin-pane-header-bg',
  '--goblin-detail-bg',
  '--goblin-card-bg',
  '--goblin-list-row-bg',
  '--goblin-list-row-hover-bg',
  '--goblin-list-row-selected-bg',
  '--goblin-list-row-selected-fg',
  '--goblin-control-bg',
  '--goblin-control-hover-bg',
  '--goblin-control-border',
  '--goblin-control-radius',
  '--goblin-control-height-sm',
  '--goblin-control-density',
  '--goblin-brand-radius-sm',
  '--goblin-brand-radius-md',
  '--goblin-brand-radius-lg',
  '--goblin-brand-divider-strength',
] as const

function themeCssPath(colorTheme: string): URL {
  return new URL(`./themes/${colorTheme}.css`, import.meta.url)
}

function readThemeCss(colorTheme: string): string {
  return readFileSync(themeCssPath(colorTheme), 'utf8')
}

function selectorBlock(css: string, colorTheme: string, theme: 'light' | 'dark'): string {
  const selector = `html[data-color-theme='${colorTheme}'][data-theme='${theme}']`
  const start = css.indexOf(selector)
  expect(start, `${selector} exists`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', start)
  expect(open, `${selector} opening brace`).toBeGreaterThanOrEqual(0)
  let depth = 0
  for (let index = open; index < css.length; index += 1) {
    const char = css[index]
    if (char === '{') depth += 1
    if (char === '}') depth -= 1
    if (depth === 0) return css.slice(open + 1, index)
  }
  throw new Error(`Missing closing brace for ${selector}`)
}

describe('theme preset css contracts', () => {
  test('has a css file for every shared color theme', () => {
    for (const colorTheme of COLOR_THEMES) {
      expect(existsSync(themeCssPath(colorTheme)), `${colorTheme}.css exists`).toBe(true)
    }
    expect(existsSync(themeCssPath('apple')), 'apple.css was removed').toBe(false)
  })

  test('defines complete light and dark token blocks for every color theme', () => {
    for (const colorTheme of COLOR_THEMES) {
      const css = readThemeCss(colorTheme)
      for (const theme of ['light', 'dark'] as const) {
        const block = selectorBlock(css, colorTheme, theme)
        for (const token of [...FOUNDATION_TOKENS, ...APP_REGION_TOKENS, ...TERMINAL_TOKENS]) {
          expect(block, `${colorTheme}/${theme} defines ${token}`).toContain(token)
        }
      }
    }
  })

  test('keeps macos aligned with the Apple-style preset role', () => {
    const css = readThemeCss('macos')
    const light = selectorBlock(css, 'macos', 'light')
    const dark = selectorBlock(css, 'macos', 'dark')

    expect(light).toContain('--goblin-surface-canvas: #ffffff;')
    expect(light).toContain('--goblin-action-primary: #0066cc;')
    expect(light).toContain('--color-terminal-background: #272729;')
    expect(dark).toContain('--goblin-surface-canvas: #000000;')
    expect(dark).toContain('--goblin-action-primary: #2997ff;')
  })

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
})
```

- [ ] **Step 3: Run failing token contract tests**

Run:

```bash
bun run test src/shared/theme-tokens.test.ts src/web/theme/theme-presets.test.ts
```

Expected now: FAIL because `airbnb.css`, `bmw.css`, native backgrounds, and app-region tokens are not implemented yet.

---

### Task 4: Implement Native Theme Tokens And CSS Imports

**Files:**
- Modify: `src/shared/theme-tokens.ts`
- Modify: `src/web/theme/theme.css`

- [ ] **Step 1: Replace native window backgrounds**

Replace `WINDOW_BACKGROUND_BY_COLOR_THEME` in `src/shared/theme-tokens.ts` with:

```ts
export const WINDOW_BACKGROUND_BY_COLOR_THEME: Record<ColorTheme, Record<ResolvedTheme, string>> = {
  macos: {
    light: '#ffffff',
    dark: '#000000',
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
  airbnb: {
    light: '#ffffff',
    dark: '#111111',
  },
  bmw: {
    light: '#f5f5f5',
    dark: '#000000',
  },
}
```

- [ ] **Step 2: Update theme imports**

Replace `src/web/theme/theme.css` with:

```css
@import './contract.css';
@import './themes/macos.css';
@import './themes/mono.css';
@import './themes/github.css';
@import './themes/claude.css';
@import './themes/cursor.css';
@import './themes/airbnb.css';
@import './themes/bmw.css';
```

- [ ] **Step 3: Run focused native token test**

Run:

```bash
bun run test src/shared/theme-tokens.test.ts
```

Expected: PASS after `COLOR_THEMES` and native backgrounds are current.

---

### Task 5: Add App-Region Token Aliases To The CSS Contract

**Files:**
- Modify: `src/web/theme/contract.css`
- Modify: `src/web/theme/font-contract.test.ts`

- [ ] **Step 1: Add semantic aliases without changing fonts**

In `src/web/theme/contract.css`, keep the existing font section unchanged and add these aliases inside the `@theme` block after the project semantic extras:

```css
  /* App-region surfaces */
  --color-app: var(--goblin-app-bg, var(--goblin-surface-canvas));
  --color-topbar: var(--goblin-topbar-bg, var(--goblin-surface-canvas));
  --color-topbar-border: var(--goblin-topbar-border, var(--goblin-border-subtle));
  --color-tab: var(--goblin-tab-bg, transparent);
  --color-tab-hover: var(--goblin-tab-hover-bg, var(--goblin-surface-hover));
  --color-tab-active: var(--goblin-tab-active-bg, var(--goblin-surface-raised));
  --color-sidebar: var(--goblin-sidebar-bg, var(--goblin-surface-base));
  --color-pane: var(--goblin-pane-bg, var(--goblin-surface-canvas));
  --color-pane-header: var(--goblin-pane-header-bg, var(--goblin-surface-raised));
  --color-detail: var(--goblin-detail-bg, var(--goblin-surface-canvas));
  --color-list-row: var(--goblin-list-row-bg, transparent);
  --color-list-row-hover: var(--goblin-list-row-hover-bg, var(--goblin-surface-hover));
  --color-list-row-selected: var(--goblin-list-row-selected-bg, var(--goblin-accent-selection));
  --color-list-row-selected-foreground: var(--goblin-list-row-selected-fg, var(--goblin-text-primary));
```

Also change control aliases to use the new app-region control tokens:

```css
  --color-control: var(--goblin-control-bg, var(--goblin-surface-control, var(--goblin-surface-raised)));
  --color-control-hover: var(--goblin-control-hover-bg, var(--goblin-surface-control-hover, var(--goblin-surface-hover)));
  --color-input: var(--goblin-control-border, var(--goblin-border-strong));
```

Add these radius aliases near the existing radius scale:

```css
  --radius-control: var(--goblin-control-radius, var(--radius-md));
  --radius-brand-sm: var(--goblin-brand-radius-sm, var(--radius-sm));
  --radius-brand-md: var(--goblin-brand-radius-md, var(--radius-md));
  --radius-brand-lg: var(--goblin-brand-radius-lg, var(--radius-lg));
```

- [ ] **Step 2: Keep font tests unchanged**

Do not change the expected font strings in `src/web/theme/font-contract.test.ts`. Run it after editing `contract.css`.

- [ ] **Step 3: Run contract/font tests**

Run:

```bash
bun run test src/web/theme/font-contract.test.ts
```

Expected: PASS. Any failure here means the font contract was accidentally changed.

---

### Task 6: Add App-Region Tokens To Existing Theme CSS Files

**Files:**
- Modify: `src/web/theme/themes/macos.css`
- Modify: `src/web/theme/themes/mono.css`
- Modify: `src/web/theme/themes/github.css`
- Modify: `src/web/theme/themes/claude.css`
- Modify: `src/web/theme/themes/cursor.css`

- [ ] **Step 1: Update `macos.css` with Apple-style values**

In both light and dark blocks of `src/web/theme/themes/macos.css`, add all app-region tokens required by `APP_REGION_TOKENS`.

Use these light app-region values:

```css
  --goblin-app-bg: #ffffff;
  --goblin-topbar-bg: #ffffff;
  --goblin-topbar-border: #e0e0e0;
  --goblin-tab-bg: transparent;
  --goblin-tab-hover-bg: #f5f5f7;
  --goblin-tab-active-bg: #fafafc;
  --goblin-sidebar-bg: #f5f5f7;
  --goblin-pane-bg: #ffffff;
  --goblin-pane-header-bg: #fafafc;
  --goblin-detail-bg: #ffffff;
  --goblin-card-bg: #ffffff;
  --goblin-list-row-bg: transparent;
  --goblin-list-row-hover-bg: #f5f5f7;
  --goblin-list-row-selected-bg: rgb(var(--goblin-accent-rgb) / 0.12);
  --goblin-list-row-selected-fg: #1d1d1f;
  --goblin-control-bg: #ffffff;
  --goblin-control-hover-bg: #f5f5f7;
  --goblin-control-border: #d2d2d7;
  --goblin-control-radius: 0.6875rem;
  --goblin-control-height-sm: 2rem;
  --goblin-control-density: 1;
  --goblin-brand-radius-sm: 0.5rem;
  --goblin-brand-radius-md: 0.6875rem;
  --goblin-brand-radius-lg: 1.125rem;
  --goblin-brand-divider-strength: 0.7;
```

Use these dark app-region values:

```css
  --goblin-app-bg: #000000;
  --goblin-topbar-bg: #000000;
  --goblin-topbar-border: rgb(255 255 255 / 0.12);
  --goblin-tab-bg: transparent;
  --goblin-tab-hover-bg: #1d1d1f;
  --goblin-tab-active-bg: #272729;
  --goblin-sidebar-bg: #1d1d1f;
  --goblin-pane-bg: #000000;
  --goblin-pane-header-bg: #1d1d1f;
  --goblin-detail-bg: #000000;
  --goblin-card-bg: #272729;
  --goblin-list-row-bg: transparent;
  --goblin-list-row-hover-bg: #1d1d1f;
  --goblin-list-row-selected-bg: rgb(var(--goblin-accent-rgb) / 0.24);
  --goblin-list-row-selected-fg: #ffffff;
  --goblin-control-bg: #272729;
  --goblin-control-hover-bg: #333336;
  --goblin-control-border: rgb(255 255 255 / 0.26);
  --goblin-control-radius: 0.6875rem;
  --goblin-control-height-sm: 2rem;
  --goblin-control-density: 1;
  --goblin-brand-radius-sm: 0.5rem;
  --goblin-brand-radius-md: 0.6875rem;
  --goblin-brand-radius-lg: 1.125rem;
  --goblin-brand-divider-strength: 0.8;
```

Also align the existing `macos` foundation and terminal values with the Apple-style contract tested in Task 3:

- light `--goblin-surface-canvas: #ffffff;`
- light `--goblin-action-primary: #0066cc;`
- light `--color-terminal-background: #272729;`
- dark `--goblin-surface-canvas: #000000;`
- dark `--goblin-action-primary: #2997ff;`

- [ ] **Step 2: Add app-region tokens to `mono.css`**

Use neutral values derived from existing mono foundation tokens:

Light block:

```css
  --goblin-app-bg: #ffffff;
  --goblin-topbar-bg: #ffffff;
  --goblin-topbar-border: #e4e4e7;
  --goblin-tab-bg: transparent;
  --goblin-tab-hover-bg: #f4f4f5;
  --goblin-tab-active-bg: #ffffff;
  --goblin-sidebar-bg: #f4f4f5;
  --goblin-pane-bg: #ffffff;
  --goblin-pane-header-bg: #f4f4f5;
  --goblin-detail-bg: #ffffff;
  --goblin-card-bg: #ffffff;
  --goblin-list-row-bg: transparent;
  --goblin-list-row-hover-bg: #e4e4e7;
  --goblin-list-row-selected-bg: rgb(var(--goblin-accent-rgb) / 0.12);
  --goblin-list-row-selected-fg: #09090b;
  --goblin-control-bg: #ffffff;
  --goblin-control-hover-bg: #f4f4f5;
  --goblin-control-border: #d4d4d8;
  --goblin-control-radius: 0.5rem;
  --goblin-control-height-sm: 2rem;
  --goblin-control-density: 1;
  --goblin-brand-radius-sm: 0.25rem;
  --goblin-brand-radius-md: 0.5rem;
  --goblin-brand-radius-lg: 0.5rem;
  --goblin-brand-divider-strength: 0.8;
```

Dark block:

```css
  --goblin-app-bg: #09090b;
  --goblin-topbar-bg: #09090b;
  --goblin-topbar-border: #27272a;
  --goblin-tab-bg: transparent;
  --goblin-tab-hover-bg: #18181b;
  --goblin-tab-active-bg: #27272a;
  --goblin-sidebar-bg: #18181b;
  --goblin-pane-bg: #09090b;
  --goblin-pane-header-bg: #18181b;
  --goblin-detail-bg: #09090b;
  --goblin-card-bg: #18181b;
  --goblin-list-row-bg: transparent;
  --goblin-list-row-hover-bg: #27272a;
  --goblin-list-row-selected-bg: rgb(var(--goblin-accent-rgb) / 0.18);
  --goblin-list-row-selected-fg: #fafafa;
  --goblin-control-bg: #18181b;
  --goblin-control-hover-bg: #27272a;
  --goblin-control-border: rgb(250 250 250 / 0.24);
  --goblin-control-radius: 0.5rem;
  --goblin-control-height-sm: 2rem;
  --goblin-control-density: 1;
  --goblin-brand-radius-sm: 0.25rem;
  --goblin-brand-radius-md: 0.5rem;
  --goblin-brand-radius-lg: 0.5rem;
  --goblin-brand-divider-strength: 0.9;
```

- [ ] **Step 3: Add app-region tokens to `github.css`**

Use GitHub-derived app-region values:

Light block:

```css
  --goblin-app-bg: #ffffff;
  --goblin-topbar-bg: #ffffff;
  --goblin-topbar-border: #d0d7de;
  --goblin-tab-bg: transparent;
  --goblin-tab-hover-bg: #f6f8fa;
  --goblin-tab-active-bg: #ffffff;
  --goblin-sidebar-bg: #f6f8fa;
  --goblin-pane-bg: #ffffff;
  --goblin-pane-header-bg: #f6f8fa;
  --goblin-detail-bg: #ffffff;
  --goblin-card-bg: #ffffff;
  --goblin-list-row-bg: transparent;
  --goblin-list-row-hover-bg: #f3f4f6;
  --goblin-list-row-selected-bg: rgb(var(--goblin-accent-rgb) / 0.12);
  --goblin-list-row-selected-fg: #1f2328;
  --goblin-control-bg: #ffffff;
  --goblin-control-hover-bg: #f6f8fa;
  --goblin-control-border: #afb8c1;
  --goblin-control-radius: 0.375rem;
  --goblin-control-height-sm: 2rem;
  --goblin-control-density: 1;
  --goblin-brand-radius-sm: 0.25rem;
  --goblin-brand-radius-md: 0.375rem;
  --goblin-brand-radius-lg: 0.5rem;
  --goblin-brand-divider-strength: 0.85;
```

Dark block:

```css
  --goblin-app-bg: #0d1117;
  --goblin-topbar-bg: #0d1117;
  --goblin-topbar-border: #30363d;
  --goblin-tab-bg: transparent;
  --goblin-tab-hover-bg: #161b22;
  --goblin-tab-active-bg: #21262d;
  --goblin-sidebar-bg: #161b22;
  --goblin-pane-bg: #0d1117;
  --goblin-pane-header-bg: #161b22;
  --goblin-detail-bg: #0d1117;
  --goblin-card-bg: #161b22;
  --goblin-list-row-bg: transparent;
  --goblin-list-row-hover-bg: #21262d;
  --goblin-list-row-selected-bg: rgb(var(--goblin-accent-rgb) / 0.2);
  --goblin-list-row-selected-fg: #e6edf3;
  --goblin-control-bg: #161b22;
  --goblin-control-hover-bg: #21262d;
  --goblin-control-border: #484f58;
  --goblin-control-radius: 0.375rem;
  --goblin-control-height-sm: 2rem;
  --goblin-control-density: 1;
  --goblin-brand-radius-sm: 0.25rem;
  --goblin-brand-radius-md: 0.375rem;
  --goblin-brand-radius-lg: 0.5rem;
  --goblin-brand-divider-strength: 0.95;
```

- [ ] **Step 4: Add app-region tokens to `claude.css`**

Use Claude-derived app-region values:

Light block:

```css
  --goblin-app-bg: #faf9f5;
  --goblin-topbar-bg: #faf9f5;
  --goblin-topbar-border: #e6dfd8;
  --goblin-tab-bg: transparent;
  --goblin-tab-hover-bg: #f5f0e8;
  --goblin-tab-active-bg: #efe9de;
  --goblin-sidebar-bg: #f5f0e8;
  --goblin-pane-bg: #faf9f5;
  --goblin-pane-header-bg: #efe9de;
  --goblin-detail-bg: #faf9f5;
  --goblin-card-bg: #ffffff;
  --goblin-list-row-bg: transparent;
  --goblin-list-row-hover-bg: #ebe6df;
  --goblin-list-row-selected-bg: rgb(var(--goblin-accent-rgb) / 0.14);
  --goblin-list-row-selected-fg: #141413;
  --goblin-control-bg: #ffffff;
  --goblin-control-hover-bg: #f5f0e8;
  --goblin-control-border: #d4cabd;
  --goblin-control-radius: 0.5rem;
  --goblin-control-height-sm: 2rem;
  --goblin-control-density: 1;
  --goblin-brand-radius-sm: 0.375rem;
  --goblin-brand-radius-md: 0.5rem;
  --goblin-brand-radius-lg: 0.75rem;
  --goblin-brand-divider-strength: 0.75;
```

Dark block:

```css
  --goblin-app-bg: #181715;
  --goblin-topbar-bg: #181715;
  --goblin-topbar-border: rgb(230 223 216 / 0.18);
  --goblin-tab-bg: transparent;
  --goblin-tab-hover-bg: #1f1e1b;
  --goblin-tab-active-bg: #252320;
  --goblin-sidebar-bg: #1f1e1b;
  --goblin-pane-bg: #181715;
  --goblin-pane-header-bg: #1f1e1b;
  --goblin-detail-bg: #181715;
  --goblin-card-bg: #252320;
  --goblin-list-row-bg: transparent;
  --goblin-list-row-hover-bg: #33302b;
  --goblin-list-row-selected-bg: rgb(var(--goblin-accent-rgb) / 0.22);
  --goblin-list-row-selected-fg: #faf9f5;
  --goblin-control-bg: #252320;
  --goblin-control-hover-bg: #33302b;
  --goblin-control-border: rgb(230 223 216 / 0.28);
  --goblin-control-radius: 0.5rem;
  --goblin-control-height-sm: 2rem;
  --goblin-control-density: 1;
  --goblin-brand-radius-sm: 0.375rem;
  --goblin-brand-radius-md: 0.5rem;
  --goblin-brand-radius-lg: 0.75rem;
  --goblin-brand-divider-strength: 0.85;
```

- [ ] **Step 5: Add app-region tokens to `cursor.css`**

Use Cursor-derived app-region values:

Light block:

```css
  --goblin-app-bg: #f7f7f4;
  --goblin-topbar-bg: #f7f7f4;
  --goblin-topbar-border: #e6e5e0;
  --goblin-tab-bg: transparent;
  --goblin-tab-hover-bg: #fafaf7;
  --goblin-tab-active-bg: #ffffff;
  --goblin-sidebar-bg: #fafaf7;
  --goblin-pane-bg: #f7f7f4;
  --goblin-pane-header-bg: #fafaf7;
  --goblin-detail-bg: #f7f7f4;
  --goblin-card-bg: #ffffff;
  --goblin-list-row-bg: transparent;
  --goblin-list-row-hover-bg: #efeee8;
  --goblin-list-row-selected-bg: rgb(var(--goblin-accent-rgb) / 0.16);
  --goblin-list-row-selected-fg: #26251e;
  --goblin-control-bg: #ffffff;
  --goblin-control-hover-bg: #fafaf7;
  --goblin-control-border: #cfcdc4;
  --goblin-control-radius: 0.5rem;
  --goblin-control-height-sm: 2rem;
  --goblin-control-density: 0.95;
  --goblin-brand-radius-sm: 0.375rem;
  --goblin-brand-radius-md: 0.5rem;
  --goblin-brand-radius-lg: 0.75rem;
  --goblin-brand-divider-strength: 0.7;
```

Dark block:

```css
  --goblin-app-bg: #1f1f1c;
  --goblin-topbar-bg: #1f1f1c;
  --goblin-topbar-border: rgb(230 229 224 / 0.16);
  --goblin-tab-bg: transparent;
  --goblin-tab-hover-bg: #26251e;
  --goblin-tab-active-bg: #2e2d26;
  --goblin-sidebar-bg: #26251e;
  --goblin-pane-bg: #1f1f1c;
  --goblin-pane-header-bg: #26251e;
  --goblin-detail-bg: #1f1f1c;
  --goblin-card-bg: #2e2d26;
  --goblin-list-row-bg: transparent;
  --goblin-list-row-hover-bg: #3d3b33;
  --goblin-list-row-selected-bg: rgb(var(--goblin-accent-rgb) / 0.2);
  --goblin-list-row-selected-fg: #f7f7f4;
  --goblin-control-bg: #2e2d26;
  --goblin-control-hover-bg: #3d3b33;
  --goblin-control-border: rgb(230 229 224 / 0.26);
  --goblin-control-radius: 0.5rem;
  --goblin-control-height-sm: 2rem;
  --goblin-control-density: 0.95;
  --goblin-brand-radius-sm: 0.375rem;
  --goblin-brand-radius-md: 0.5rem;
  --goblin-brand-radius-lg: 0.75rem;
  --goblin-brand-divider-strength: 0.85;
```

- [ ] **Step 6: Run CSS contract test**

Run:

```bash
bun run test src/web/theme/theme-presets.test.ts
```

Expected: still FAIL until `airbnb.css` and `bmw.css` are created and `apple.css` is removed.

---

### Task 7: Add Airbnb And BMW Theme CSS, Remove Apple CSS

**Files:**
- Create: `src/web/theme/themes/airbnb.css`
- Create: `src/web/theme/themes/bmw.css`
- Delete: `src/web/theme/themes/apple.css`

- [ ] **Step 1: Create `airbnb.css`**

Create `src/web/theme/themes/airbnb.css` with complete light and dark blocks. Use Airbnb Rausch red for primary action, rounded controls, and white-forward surfaces.

Use this complete light block:

```css
html[data-color-theme='airbnb'][data-theme='light'] {
  color-scheme: light;

  --goblin-surface-canvas: #ffffff;
  --goblin-surface-base: #f7f7f7;
  --goblin-surface-raised: #ffffff;
  --goblin-surface-overlay: #ffffff;
  --goblin-surface-muted: #f2f2f2;
  --goblin-surface-hover: #ebebeb;
  --goblin-surface-control: #ffffff;
  --goblin-surface-control-hover: #f7f7f7;
  --goblin-text-primary: #222222;
  --goblin-text-secondary-strong: #3f3f3f;
  --goblin-text-secondary: #6a6a6a;
  --goblin-text-selected-secondary: #3f3f3f;
  --goblin-text-disabled: #929292;
  --goblin-border-subtle: #ebebeb;
  --goblin-border-default: #dddddd;
  --goblin-border-strong: #c1c1c1;
  --goblin-focus-ring: #ff385c;
  --goblin-action-primary: #ff385c;
  --goblin-action-primary-foreground: #ffffff;
  --goblin-action-danger: #c13515;
  --goblin-action-danger-foreground: #ffffff;
  --goblin-accent: #ff385c;
  --goblin-accent-text: #e00b41;
  --goblin-accent-rgb: 255 56 92;
  --goblin-accent-selection: rgb(var(--goblin-accent-rgb) / 0.14);
  --goblin-accent-surface: rgb(var(--goblin-accent-rgb) / 0.09);
  --goblin-accent-border: rgb(var(--goblin-accent-rgb) / 0.34);
  --goblin-status-warning-text: #9a6700;
  --goblin-status-warning-rgb: 244 180 0;
  --goblin-status-warning-surface: rgb(var(--goblin-status-warning-rgb) / 0.12);
  --goblin-status-warning-border: rgb(var(--goblin-status-warning-rgb) / 0.36);
  --goblin-status-success-text: #1f7f37;
  --goblin-status-success-rgb: 15 163 54;
  --goblin-status-success-surface: rgb(var(--goblin-status-success-rgb) / 0.1);
  --goblin-status-success-border: rgb(var(--goblin-status-success-rgb) / 0.32);
  --goblin-status-danger-text: #c13515;
  --goblin-status-danger-rgb: 193 53 21;
  --goblin-status-danger-surface: rgb(var(--goblin-status-danger-rgb) / 0.1);
  --goblin-status-danger-border: rgb(var(--goblin-status-danger-rgb) / 0.34);
  --color-overlay-scrim: rgb(0 0 0 / 0.42);
  --goblin-shadow-xs: 0 1px 1px rgb(0 0 0 / 0.04);
  --goblin-shadow-sm: 0 1px 2px rgb(0 0 0 / 0.06);
  --goblin-shadow-md: 0 8px 24px rgb(0 0 0 / 0.10);
  --goblin-shadow-lg: 0 18px 48px rgb(0 0 0 / 0.14);
  --shadow-inset-highlight: inset 0 1px 0 rgb(255 255 255 / 0.42);
  --shadow-control-inset-highlight: inset 0 1px 0 rgb(255 255 255 / 0.48);
  --radius: 0.875rem;
  --goblin-app-bg: #ffffff;
  --goblin-topbar-bg: #ffffff;
  --goblin-topbar-border: #dddddd;
  --goblin-tab-bg: transparent;
  --goblin-tab-hover-bg: #f7f7f7;
  --goblin-tab-active-bg: #ffffff;
  --goblin-sidebar-bg: #f7f7f7;
  --goblin-pane-bg: #ffffff;
  --goblin-pane-header-bg: #f7f7f7;
  --goblin-detail-bg: #ffffff;
  --goblin-card-bg: #ffffff;
  --goblin-list-row-bg: transparent;
  --goblin-list-row-hover-bg: #f7f7f7;
  --goblin-list-row-selected-bg: rgb(var(--goblin-accent-rgb) / 0.14);
  --goblin-list-row-selected-fg: #222222;
  --goblin-control-bg: #ffffff;
  --goblin-control-hover-bg: #f7f7f7;
  --goblin-control-border: #c1c1c1;
  --goblin-control-radius: 1.25rem;
  --goblin-control-height-sm: 2rem;
  --goblin-control-density: 1.05;
  --goblin-brand-radius-sm: 0.5rem;
  --goblin-brand-radius-md: 0.875rem;
  --goblin-brand-radius-lg: 1.25rem;
  --goblin-brand-divider-strength: 0.65;
  --color-terminal-background: #222222;
  --color-terminal-foreground: #ffffff;
  --color-terminal-cursor: #ffffff;
  --color-terminal-selection-background: rgba(255, 56, 92, 0.3);
  --color-terminal-ansi-black: #222222;
  --color-terminal-ansi-red: #ff385c;
  --color-terminal-ansi-green: #0fa336;
  --color-terminal-ansi-yellow: #f4b400;
  --color-terminal-ansi-blue: #428bff;
  --color-terminal-ansi-magenta: #92174d;
  --color-terminal-ansi-cyan: #007a87;
  --color-terminal-ansi-white: #dddddd;
  --color-terminal-ansi-bright-black: #6a6a6a;
  --color-terminal-ansi-bright-red: #ff6b81;
  --color-terminal-ansi-bright-green: #45c26a;
  --color-terminal-ansi-bright-yellow: #ffd166;
  --color-terminal-ansi-bright-blue: #76a9ff;
  --color-terminal-ansi-bright-magenta: #b64f7b;
  --color-terminal-ansi-bright-cyan: #4bb7c5;
  --color-terminal-ansi-bright-white: #ffffff;
  --color-terminal-search-match: #f4b400;
  --color-terminal-search-active-match: #ff385c;
  --color-terminal-search-active-border: #ffffff;
}
```

Add this dark block after the light block:

```css
html[data-color-theme='airbnb'][data-theme='dark'] {
  color-scheme: dark;

  --goblin-surface-canvas: #111111;
  --goblin-surface-base: #1f1f1f;
  --goblin-surface-raised: #2a2a2a;
  --goblin-surface-overlay: #333333;
  --goblin-surface-muted: #2a2a2a;
  --goblin-surface-hover: #3a3a3a;
  --goblin-surface-control: #2a2a2a;
  --goblin-surface-control-hover: #3a3a3a;
  --goblin-text-primary: #ffffff;
  --goblin-text-secondary-strong: #f2f2f2;
  --goblin-text-secondary: #c1c1c1;
  --goblin-text-selected-secondary: #dddddd;
  --goblin-text-disabled: #929292;
  --goblin-border-subtle: rgb(255 255 255 / 0.12);
  --goblin-border-default: rgb(255 255 255 / 0.18);
  --goblin-border-strong: rgb(255 255 255 / 0.3);
  --goblin-focus-ring: #ff385c;
  --goblin-action-primary: #ff385c;
  --goblin-action-primary-foreground: #ffffff;
  --goblin-action-danger: #ff7a5f;
  --goblin-action-danger-foreground: #2a0703;
  --goblin-accent: #ff385c;
  --goblin-accent-text: #ff8aa0;
  --goblin-accent-rgb: 255 56 92;
  --goblin-accent-selection: rgb(var(--goblin-accent-rgb) / 0.24);
  --goblin-accent-surface: rgb(var(--goblin-accent-rgb) / 0.16);
  --goblin-accent-border: rgb(var(--goblin-accent-rgb) / 0.42);
  --goblin-status-warning-text: #ffd166;
  --goblin-status-warning-rgb: 255 209 102;
  --goblin-status-warning-surface: rgb(var(--goblin-status-warning-rgb) / 0.13);
  --goblin-status-warning-border: rgb(var(--goblin-status-warning-rgb) / 0.34);
  --goblin-status-success-text: #45c26a;
  --goblin-status-success-rgb: 69 194 106;
  --goblin-status-success-surface: rgb(var(--goblin-status-success-rgb) / 0.12);
  --goblin-status-success-border: rgb(var(--goblin-status-success-rgb) / 0.34);
  --goblin-status-danger-text: #ff7a5f;
  --goblin-status-danger-rgb: 255 122 95;
  --goblin-status-danger-surface: rgb(var(--goblin-status-danger-rgb) / 0.12);
  --goblin-status-danger-border: rgb(var(--goblin-status-danger-rgb) / 0.36);
  --color-overlay-scrim: rgb(0 0 0 / 0.62);
  --goblin-shadow-xs: 0 1px 1px rgb(0 0 0 / 0.24);
  --goblin-shadow-sm: 0 1px 2px rgb(0 0 0 / 0.32);
  --goblin-shadow-md: 0 8px 24px rgb(0 0 0 / 0.42);
  --goblin-shadow-lg: 0 18px 48px rgb(0 0 0 / 0.54);
  --shadow-inset-highlight: inset 0 1px 0 rgb(255 255 255 / 0.08);
  --shadow-control-inset-highlight: inset 0 1px 0 rgb(255 255 255 / 0.1);
  --radius: 0.875rem;
  --goblin-app-bg: #111111;
  --goblin-topbar-bg: #111111;
  --goblin-topbar-border: rgb(255 255 255 / 0.18);
  --goblin-tab-bg: transparent;
  --goblin-tab-hover-bg: #1f1f1f;
  --goblin-tab-active-bg: #2a2a2a;
  --goblin-sidebar-bg: #1f1f1f;
  --goblin-pane-bg: #111111;
  --goblin-pane-header-bg: #1f1f1f;
  --goblin-detail-bg: #111111;
  --goblin-card-bg: #2a2a2a;
  --goblin-list-row-bg: transparent;
  --goblin-list-row-hover-bg: #2a2a2a;
  --goblin-list-row-selected-bg: rgb(var(--goblin-accent-rgb) / 0.24);
  --goblin-list-row-selected-fg: #ffffff;
  --goblin-control-bg: #2a2a2a;
  --goblin-control-hover-bg: #3a3a3a;
  --goblin-control-border: rgb(255 255 255 / 0.3);
  --goblin-control-radius: 1.25rem;
  --goblin-control-height-sm: 2rem;
  --goblin-control-density: 1.05;
  --goblin-brand-radius-sm: 0.5rem;
  --goblin-brand-radius-md: 0.875rem;
  --goblin-brand-radius-lg: 1.25rem;
  --goblin-brand-divider-strength: 0.75;
  --color-terminal-background: #111111;
  --color-terminal-foreground: #ffffff;
  --color-terminal-cursor: #ffffff;
  --color-terminal-selection-background: rgba(255, 56, 92, 0.34);
  --color-terminal-ansi-black: #111111;
  --color-terminal-ansi-red: #ff6b81;
  --color-terminal-ansi-green: #45c26a;
  --color-terminal-ansi-yellow: #ffd166;
  --color-terminal-ansi-blue: #76a9ff;
  --color-terminal-ansi-magenta: #b64f7b;
  --color-terminal-ansi-cyan: #4bb7c5;
  --color-terminal-ansi-white: #dddddd;
  --color-terminal-ansi-bright-black: #929292;
  --color-terminal-ansi-bright-red: #ff8aa0;
  --color-terminal-ansi-bright-green: #72d68d;
  --color-terminal-ansi-bright-yellow: #ffe08f;
  --color-terminal-ansi-bright-blue: #9fc1ff;
  --color-terminal-ansi-bright-magenta: #d1729f;
  --color-terminal-ansi-bright-cyan: #77d5df;
  --color-terminal-ansi-bright-white: #ffffff;
  --color-terminal-search-match: #ffd166;
  --color-terminal-search-active-match: #ff385c;
  --color-terminal-search-active-border: #ffffff;
}
```

- [ ] **Step 2: Create `bmw.css`**

Create `src/web/theme/themes/bmw.css` with complete light and dark blocks. BMW should be square, high contrast, and M-accented.

Use this complete dark block:

```css
html[data-color-theme='bmw'][data-theme='dark'] {
  color-scheme: dark;

  --goblin-surface-canvas: #000000;
  --goblin-surface-base: #0d0d0d;
  --goblin-surface-raised: #1a1a1a;
  --goblin-surface-overlay: #262626;
  --goblin-surface-muted: #1a1a1a;
  --goblin-surface-hover: #262626;
  --goblin-surface-control: #1a1a1a;
  --goblin-surface-control-hover: #262626;
  --goblin-text-primary: #ffffff;
  --goblin-text-secondary-strong: #e6e6e6;
  --goblin-text-secondary: #bbbbbb;
  --goblin-text-selected-secondary: #e6e6e6;
  --goblin-text-disabled: #7e7e7e;
  --goblin-border-subtle: #262626;
  --goblin-border-default: #3c3c3c;
  --goblin-border-strong: #5a5a5a;
  --goblin-focus-ring: #1c69d4;
  --goblin-action-primary: #ffffff;
  --goblin-action-primary-foreground: #000000;
  --goblin-action-danger: #e22718;
  --goblin-action-danger-foreground: #ffffff;
  --goblin-accent: #1c69d4;
  --goblin-accent-text: #6fa8ff;
  --goblin-accent-rgb: 28 105 212;
  --goblin-accent-selection: rgb(var(--goblin-accent-rgb) / 0.28);
  --goblin-accent-surface: rgb(var(--goblin-accent-rgb) / 0.16);
  --goblin-accent-border: rgb(var(--goblin-accent-rgb) / 0.46);
  --goblin-status-warning-text: #f4b400;
  --goblin-status-warning-rgb: 244 180 0;
  --goblin-status-warning-surface: rgb(var(--goblin-status-warning-rgb) / 0.14);
  --goblin-status-warning-border: rgb(var(--goblin-status-warning-rgb) / 0.38);
  --goblin-status-success-text: #0fa336;
  --goblin-status-success-rgb: 15 163 54;
  --goblin-status-success-surface: rgb(var(--goblin-status-success-rgb) / 0.14);
  --goblin-status-success-border: rgb(var(--goblin-status-success-rgb) / 0.38);
  --goblin-status-danger-text: #ff5a4d;
  --goblin-status-danger-rgb: 226 39 24;
  --goblin-status-danger-surface: rgb(var(--goblin-status-danger-rgb) / 0.14);
  --goblin-status-danger-border: rgb(var(--goblin-status-danger-rgb) / 0.4);
  --color-overlay-scrim: rgb(0 0 0 / 0.68);
  --goblin-shadow-xs: 0 1px 1px rgb(0 0 0 / 0.3);
  --goblin-shadow-sm: 0 1px 2px rgb(0 0 0 / 0.38);
  --goblin-shadow-md: 0 10px 28px rgb(0 0 0 / 0.48);
  --goblin-shadow-lg: 0 20px 58px rgb(0 0 0 / 0.6);
  --shadow-inset-highlight: inset 0 1px 0 rgb(255 255 255 / 0.08);
  --shadow-control-inset-highlight: inset 0 1px 0 rgb(255 255 255 / 0.08);
  --radius: 0rem;
  --goblin-app-bg: #000000;
  --goblin-topbar-bg: #000000;
  --goblin-topbar-border: #3c3c3c;
  --goblin-tab-bg: transparent;
  --goblin-tab-hover-bg: #1a1a1a;
  --goblin-tab-active-bg: #262626;
  --goblin-sidebar-bg: #0d0d0d;
  --goblin-pane-bg: #000000;
  --goblin-pane-header-bg: #0d0d0d;
  --goblin-detail-bg: #000000;
  --goblin-card-bg: #1a1a1a;
  --goblin-list-row-bg: transparent;
  --goblin-list-row-hover-bg: #1a1a1a;
  --goblin-list-row-selected-bg: rgb(var(--goblin-accent-rgb) / 0.28);
  --goblin-list-row-selected-fg: #ffffff;
  --goblin-control-bg: #1a1a1a;
  --goblin-control-hover-bg: #262626;
  --goblin-control-border: #5a5a5a;
  --goblin-control-radius: 0rem;
  --goblin-control-height-sm: 2rem;
  --goblin-control-density: 0.95;
  --goblin-brand-radius-sm: 0rem;
  --goblin-brand-radius-md: 0rem;
  --goblin-brand-radius-lg: 0rem;
  --goblin-brand-divider-strength: 1;
  --color-terminal-background: #000000;
  --color-terminal-foreground: #ffffff;
  --color-terminal-cursor: #ffffff;
  --color-terminal-selection-background: rgba(28, 105, 212, 0.36);
  --color-terminal-ansi-black: #000000;
  --color-terminal-ansi-red: #e22718;
  --color-terminal-ansi-green: #0fa336;
  --color-terminal-ansi-yellow: #f4b400;
  --color-terminal-ansi-blue: #1c69d4;
  --color-terminal-ansi-magenta: #7a5cff;
  --color-terminal-ansi-cyan: #0066b1;
  --color-terminal-ansi-white: #bbbbbb;
  --color-terminal-ansi-bright-black: #7e7e7e;
  --color-terminal-ansi-bright-red: #ff5a4d;
  --color-terminal-ansi-bright-green: #33c95a;
  --color-terminal-ansi-bright-yellow: #ffd166;
  --color-terminal-ansi-bright-blue: #6fa8ff;
  --color-terminal-ansi-bright-magenta: #a899ff;
  --color-terminal-ansi-bright-cyan: #4ca9e8;
  --color-terminal-ansi-bright-white: #ffffff;
  --color-terminal-search-match: #f4b400;
  --color-terminal-search-active-match: #1c69d4;
  --color-terminal-search-active-border: #ffffff;
}
```

Add this light block before the dark block:

```css
html[data-color-theme='bmw'][data-theme='light'] {
  color-scheme: light;

  --goblin-surface-canvas: #f5f5f5;
  --goblin-surface-base: #ffffff;
  --goblin-surface-raised: #ffffff;
  --goblin-surface-overlay: #ffffff;
  --goblin-surface-muted: #e6e6e6;
  --goblin-surface-hover: #dcdcdc;
  --goblin-surface-control: #ffffff;
  --goblin-surface-control-hover: #e6e6e6;
  --goblin-text-primary: #0d0d0d;
  --goblin-text-secondary-strong: #262626;
  --goblin-text-secondary: #5a5a5a;
  --goblin-text-selected-secondary: #262626;
  --goblin-text-disabled: #7e7e7e;
  --goblin-border-subtle: #dcdcdc;
  --goblin-border-default: #c8c8c8;
  --goblin-border-strong: #7e7e7e;
  --goblin-focus-ring: #1c69d4;
  --goblin-action-primary: #000000;
  --goblin-action-primary-foreground: #ffffff;
  --goblin-action-danger: #e22718;
  --goblin-action-danger-foreground: #ffffff;
  --goblin-accent: #1c69d4;
  --goblin-accent-text: #0653b6;
  --goblin-accent-rgb: 28 105 212;
  --goblin-accent-selection: rgb(var(--goblin-accent-rgb) / 0.16);
  --goblin-accent-surface: rgb(var(--goblin-accent-rgb) / 0.1);
  --goblin-accent-border: rgb(var(--goblin-accent-rgb) / 0.4);
  --goblin-status-warning-text: #8a6400;
  --goblin-status-warning-rgb: 244 180 0;
  --goblin-status-warning-surface: rgb(var(--goblin-status-warning-rgb) / 0.12);
  --goblin-status-warning-border: rgb(var(--goblin-status-warning-rgb) / 0.36);
  --goblin-status-success-text: #0b7a2b;
  --goblin-status-success-rgb: 15 163 54;
  --goblin-status-success-surface: rgb(var(--goblin-status-success-rgb) / 0.1);
  --goblin-status-success-border: rgb(var(--goblin-status-success-rgb) / 0.34);
  --goblin-status-danger-text: #c42116;
  --goblin-status-danger-rgb: 226 39 24;
  --goblin-status-danger-surface: rgb(var(--goblin-status-danger-rgb) / 0.1);
  --goblin-status-danger-border: rgb(var(--goblin-status-danger-rgb) / 0.36);
  --color-overlay-scrim: rgb(0 0 0 / 0.48);
  --goblin-shadow-xs: 0 1px 1px rgb(0 0 0 / 0.05);
  --goblin-shadow-sm: 0 1px 2px rgb(0 0 0 / 0.08);
  --goblin-shadow-md: 0 8px 24px rgb(0 0 0 / 0.14);
  --goblin-shadow-lg: 0 18px 48px rgb(0 0 0 / 0.2);
  --shadow-inset-highlight: inset 0 1px 0 rgb(255 255 255 / 0.5);
  --shadow-control-inset-highlight: inset 0 1px 0 rgb(255 255 255 / 0.56);
  --radius: 0rem;
  --goblin-app-bg: #f5f5f5;
  --goblin-topbar-bg: #ffffff;
  --goblin-topbar-border: #c8c8c8;
  --goblin-tab-bg: transparent;
  --goblin-tab-hover-bg: #e6e6e6;
  --goblin-tab-active-bg: #ffffff;
  --goblin-sidebar-bg: #ffffff;
  --goblin-pane-bg: #f5f5f5;
  --goblin-pane-header-bg: #ffffff;
  --goblin-detail-bg: #f5f5f5;
  --goblin-card-bg: #ffffff;
  --goblin-list-row-bg: transparent;
  --goblin-list-row-hover-bg: #e6e6e6;
  --goblin-list-row-selected-bg: rgb(var(--goblin-accent-rgb) / 0.16);
  --goblin-list-row-selected-fg: #0d0d0d;
  --goblin-control-bg: #ffffff;
  --goblin-control-hover-bg: #e6e6e6;
  --goblin-control-border: #7e7e7e;
  --goblin-control-radius: 0rem;
  --goblin-control-height-sm: 2rem;
  --goblin-control-density: 0.95;
  --goblin-brand-radius-sm: 0rem;
  --goblin-brand-radius-md: 0rem;
  --goblin-brand-radius-lg: 0rem;
  --goblin-brand-divider-strength: 1;
  --color-terminal-background: #000000;
  --color-terminal-foreground: #ffffff;
  --color-terminal-cursor: #ffffff;
  --color-terminal-selection-background: rgba(28, 105, 212, 0.36);
  --color-terminal-ansi-black: #000000;
  --color-terminal-ansi-red: #e22718;
  --color-terminal-ansi-green: #0fa336;
  --color-terminal-ansi-yellow: #f4b400;
  --color-terminal-ansi-blue: #1c69d4;
  --color-terminal-ansi-magenta: #7a5cff;
  --color-terminal-ansi-cyan: #0066b1;
  --color-terminal-ansi-white: #bbbbbb;
  --color-terminal-ansi-bright-black: #7e7e7e;
  --color-terminal-ansi-bright-red: #ff5a4d;
  --color-terminal-ansi-bright-green: #33c95a;
  --color-terminal-ansi-bright-yellow: #ffd166;
  --color-terminal-ansi-bright-blue: #6fa8ff;
  --color-terminal-ansi-bright-magenta: #a899ff;
  --color-terminal-ansi-bright-cyan: #4ca9e8;
  --color-terminal-ansi-bright-white: #ffffff;
  --color-terminal-search-match: #f4b400;
  --color-terminal-search-active-match: #1c69d4;
  --color-terminal-search-active-border: #ffffff;
}
```

- [ ] **Step 3: Delete standalone Apple CSS**

Delete:

```text
src/web/theme/themes/apple.css
```

Delete the file via the normal file editing tool. Do not use git commands for this plan.

- [ ] **Step 4: Run CSS contract tests**

Run:

```bash
bun run test src/web/theme/theme-presets.test.ts src/shared/theme-tokens.test.ts
```

Expected: PASS.

---

### Task 8: Connect Shared Primitives And Shell Containers To App-Region Tokens

**Files:**
- Modify: `src/web/components/ui/button.tsx`
- Modify: `src/web/components/ui/input.tsx`
- Modify: `src/web/components/ui/panel.tsx`
- Modify: `src/web/components/Topbar.tsx`
- Modify: `src/web/components/settings/SettingsContentFrame.tsx`
- Modify: `src/web/components/settings/SettingsLayout.tsx`
- Modify: `src/web/components/repo-tabs/RepoTabStrip.tsx`
- Modify: `src/web/components/terminal/terminal-session.css`

- [ ] **Step 1: Update button radius and height to tokenized values**

In `src/web/components/ui/button.tsx`, change the base class from:

```ts
"inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-xs font-medium whitespace-nowrap transition-colors duration-100 cursor-pointer outline-none disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-danger-border aria-invalid:ring-danger/20 dark:aria-invalid:ring-danger/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
```

to:

```ts
"inline-flex shrink-0 items-center justify-center gap-2 rounded-[var(--goblin-control-radius,var(--radius-md))] text-xs font-medium whitespace-nowrap transition-colors duration-100 cursor-pointer outline-none disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-danger-border aria-invalid:ring-danger/20 dark:aria-invalid:ring-danger/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
```

Then change default and sm sizes:

```ts
default: 'h-[var(--goblin-control-height-sm,1.75rem)] px-2.5 gap-1.5 has-[>svg]:px-2',
sm: "h-[calc(var(--goblin-control-height-sm,1.75rem)-0.25rem)] gap-1 px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
```

- [ ] **Step 2: Update input radius and control height**

In `src/web/components/ui/input.tsx`, change:

```ts
'h-9 w-full rounded-md border border-input bg-control px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger-border aria-invalid:ring-danger/20 dark:aria-invalid:ring-danger/40',
```

to:

```ts
'h-[calc(var(--goblin-control-height-sm,2rem)+0.25rem)] w-full rounded-[var(--goblin-control-radius,var(--radius-md))] border border-input bg-control px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger-border aria-invalid:ring-danger/20 dark:aria-invalid:ring-danger/40',
```

- [ ] **Step 3: Update panel primitives**

In `src/web/components/ui/panel.tsx`, update `Panel` classes to:

```ts
'overflow-hidden rounded-[var(--goblin-brand-radius-lg,var(--radius-lg))] border border-border/60 bg-[var(--goblin-card-bg,var(--color-background))] shadow-[var(--shadow-inset-highlight)]',
```

Update `PanelHeader` to:

```ts
'flex items-center justify-between border-b border-border/60 bg-[var(--goblin-pane-header-bg,var(--color-card))] px-3 py-2',
```

Update `PanelInset` base radius to:

```ts
'rounded-[var(--goblin-brand-radius-md,var(--radius-md))] border',
```

- [ ] **Step 4: Update topbar**

In `src/web/components/Topbar.tsx`, change:

```tsx
className="topbar relative flex items-center gap-2 overflow-hidden border-b border-separator bg-background text-sm"
```

to:

```tsx
className="topbar relative flex items-center gap-2 overflow-hidden border-b border-topbar-border bg-topbar text-sm"
```

- [ ] **Step 5: Update settings shell surfaces**

In `src/web/components/settings/SettingsContentFrame.tsx`, change shell backgrounds from `bg-card` and `bg-muted/20` to app-region tokens:

```tsx
<section className="flex min-w-0 flex-1 flex-col bg-pane" style={{ paddingTop: topInset }}>
  <ScrollArea className="min-h-0 flex-1 bg-[var(--goblin-pane-bg,var(--color-background))]">
```

In `src/web/components/settings/SettingsLayout.tsx`, change the root background:

```tsx
<div className="relative flex h-full min-h-0 bg-app">
```

- [ ] **Step 6: Update repo tab strip selected and hover surfaces**

In `src/web/components/repo-tabs/RepoTabStrip.tsx`, replace selected tab background utilities with `bg-tab-active text-foreground` and hover tab background with `hover:bg-tab-hover` where the component currently uses `bg-selected`, `bg-muted`, or `bg-accent` for tab chrome.

The target classes for selected tabs should include:

```ts
'bg-tab-active text-foreground'
```

The target classes for hoverable inactive tabs should include:

```ts
'hover:bg-tab-hover'
```

- [ ] **Step 7: Update terminal CSS chrome**

In `src/web/components/terminal/terminal-session.css`, change the slot background:

```css
background: var(--goblin-pane-bg, var(--color-background));
```

Change terminal float radius variables:

```css
--goblin-terminal-float-radius: var(--goblin-control-radius, 8px);
--goblin-terminal-control-radius: var(--goblin-control-radius, 6px);
```

- [ ] **Step 8: Run focused component tests**

Run:

```bash
bun run test src/web/theme/font-contract.test.ts src/web/components/terminal/ManagedTerminalSession.test.ts
```

Expected: PASS. Terminal geometry/font assertions must remain unchanged.

---

### Task 9: Connect Feature Shells To App-Region Tokens

**Files:**
- Modify: `src/web/components/file-tree/ProjectFileTree.tsx`
- Modify: `src/web/components/BranchList.tsx`
- Modify: `src/web/components/BranchDetail.tsx`
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.tsx`
- Modify: `src/web/components/repo-workspace/ProjectChangesPanel.tsx`
- Modify: `src/web/components/repo-workspace/ProjectHistoryPanel.tsx`
- Modify: `src/web/components/repo-workspace/ProjectPortsPanel.tsx`
- Modify: `src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.tsx`

- [ ] **Step 1: Replace feature root backgrounds**

For major feature root sections, replace `bg-background` with region-specific aliases:

- File tree root in `ProjectFileTree.tsx`: `bg-sidebar`
- Branch list root in `BranchList.tsx`: `bg-sidebar`
- Branch detail root in `BranchDetail.tsx`: `bg-detail`
- Repo explorer pane root in `RepoExplorerPane.tsx`: `bg-pane`
- Changes/history/ports panel roots: `bg-pane`
- Plain workspace terminal panel root: `bg-pane`

- [ ] **Step 2: Replace panel headers**

In file tree, changes, history, and ports toolbar/header rows, replace:

```tsx
bg-card
```

or:

```tsx
bg-muted/35
```

with:

```tsx
bg-pane-header
```

- [ ] **Step 3: Replace repeated list row hover and selected surfaces**

For branch/file/history rows, replace row hover classes that use broad tokens such as:

```tsx
hover:bg-muted
hover:bg-accent/50
```

with:

```tsx
hover:bg-list-row-hover
```

For selected rows, use:

```tsx
bg-list-row-selected text-list-row-selected-foreground
```

Keep semantic status classes such as `text-success`, `text-danger`, `text-warning`, and `text-attention`.

- [ ] **Step 4: Run feature-focused tests**

Run:

```bash
bun run test src/web/components/file-tree/ProjectFileTree.test.tsx src/web/components/BranchDetail.test.tsx src/web/components/repo-tabs/RepoTabStrip.test.tsx
```

Expected: PASS. If any test relies on exact class names, update assertions to target behavior or semantic tokens, not fixed palette classes.

---

### Task 10: Add Strict Hard-Coded Color Scan

**Files:**
- Create: `src/web/theme/hardcoded-colors.test.ts`

- [ ] **Step 1: Create scan test**

Create `src/web/theme/hardcoded-colors.test.ts`:

```ts
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

const WEB_ROOT = new URL('../', import.meta.url)

const ALLOWED_PATH_PATTERNS = [
  /\/theme\/themes\/[^/]+\.css$/,
  /\.test\.[cm]?[tj]sx?$/,
  /\/terminal-theme-test-utils\.ts$/,
  /\/brand-assets\.test\.ts$/,
]

const FORBIDDEN_HEX = /#[0-9a-fA-F]{3,8}\b/
const FORBIDDEN_TAILWIND_PALETTE =
  /\b(?:bg|text|border|ring|decoration|from|via|to)-(?:white|black|zinc|slate|neutral|stone|gray|red|blue|green|yellow|orange|purple|pink|rose|amber|lime|emerald|teal|cyan|sky|indigo|violet|fuchsia)-\d{2,3}\b/

function walk(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const file = path.join(dir, entry)
    const stat = statSync(file)
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue
      files.push(...walk(file))
    } else if (/\.(ts|tsx|css)$/.test(file)) {
      files.push(file)
    }
  }
  return files
}

function relative(file: string): string {
  return file.replace(process.cwd(), '').replaceAll(path.sep, '/')
}

function isAllowed(file: string): boolean {
  const normalized = relative(file)
  return ALLOWED_PATH_PATTERNS.some((pattern) => pattern.test(normalized))
}

describe('web theme color discipline', () => {
  test('does not add hard-coded colors in component source', () => {
    const offenders: string[] = []
    for (const file of walk(WEB_ROOT.pathname)) {
      if (isAllowed(file)) continue
      const text = readFileSync(file, 'utf8')
      if (FORBIDDEN_HEX.test(text) || FORBIDDEN_TAILWIND_PALETTE.test(text)) {
        offenders.push(relative(file))
      }
    }

    expect(offenders).toEqual([])
  })
})
```

- [ ] **Step 2: Run scan test**

Run:

```bash
bun run test src/web/theme/hardcoded-colors.test.ts
```

Expected initially: may FAIL if existing component files still contain forbidden fixed palette classes. Fix only component source that affects runtime theme coverage; do not change tests or theme CSS to satisfy this scan.

---

### Task 11: Resolve Hard-Coded Component Colors Found By The Scan

**Files:**
- Modify files reported by `src/web/theme/hardcoded-colors.test.ts`

- [ ] **Step 1: Replace fixed palette utilities with semantic tokens**

Use this mapping for scan failures:

```text
bg-white      -> bg-background, bg-card, bg-control, or bg-pane depending on region
bg-black      -> bg-background or bg-pane for dark surfaces; never force black in components
bg-zinc-*     -> bg-muted, bg-accent, bg-pane, or bg-card
bg-slate-*    -> bg-muted, bg-accent, bg-pane, or bg-card
bg-gray-*     -> bg-muted, bg-accent, bg-pane, or bg-card
bg-red-*      -> bg-danger-surface or bg-destructive
text-red-*    -> text-danger or text-destructive
border-red-*  -> border-danger-border
bg-green-*    -> bg-success-surface
text-green-*  -> text-success
border-green-* -> border-success-border
bg-yellow-*   -> bg-warning-surface or bg-attention-surface
text-yellow-* -> text-warning or text-attention
border-yellow-* -> border-warning-border or border-attention-border
text-blue-*   -> text-brand-text or text-primary
bg-blue-*     -> bg-brand-surface or bg-primary
border-blue-* -> border-brand-border
```

- [ ] **Step 2: Re-run scan test**

Run:

```bash
bun run test src/web/theme/hardcoded-colors.test.ts
```

Expected: PASS.

---

### Task 12: Final Verification

**Files:**
- All files modified in previous tasks.

- [ ] **Step 1: Run focused theme suite**

Run:

```bash
bun run test src/shared/color-theme.test.ts src/shared/theme-tokens.test.ts src/web/public/boot.test.ts src/web/theme/theme-presets.test.ts src/web/theme/font-contract.test.ts src/web/theme/hardcoded-colors.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run settings and projection suite**

Run:

```bash
bun run test src/server/modules/settings-source.test.ts src/shared/native-shell-projection.test.ts src/shared/i18n/dictionaries.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run full test suite**

Run:

```bash
bun run test
```

Expected: PASS.

- [ ] **Step 4: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 5: Run architecture guard**

Run:

```bash
bun run check:architecture
```

Expected: PASS.

- [ ] **Step 6: Manual visual verification**

Run the app and switch every preset under light and dark:

```bash
bun run dev
```

Verify:

- Settings selector lists exactly `macOS`, `Mono`, `GitHub`, `Claude`, `Cursor`, `Airbnb`, and `BMW`.
- `apple` is not shown.
- Topbar, repo tabs, file tree, branch list, branch detail, changes/history/ports, settings, dialogs, menus, popovers, and terminal all visibly respond.
- BMW is dark, square, high contrast, and restrained.
- Airbnb is white, rounded, and Rausch-red accented.
- macOS carries the Apple-style white/soft-gray/blue behavior.
- Terminal font does not change.
