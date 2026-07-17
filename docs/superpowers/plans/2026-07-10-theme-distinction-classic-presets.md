# Theme Distinction And Classic Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make GitHub immediately distinguishable from macOS, preserve macOS as the default visual anchor, and add complete Catppuccin, Solarized, and Tokyo Night presets to every existing theme-selection path.

**Architecture:** Extend the existing `ColorTheme` registry and CSS-token pipeline without adding a new store, schema, IPC path, runtime palette table, dependency, or theme-ID branch in React. Add a narrow topbar semantic family so GitHub's dark header remains readable in light appearance, keep each preset's complete Light/Dark palette in its own CSS file, and continue deriving global settings, project settings, first paint, terminal colors, and Electron canvas backgrounds through their current owners.

**Tech Stack:** TypeScript in Node.js strip-only mode, React 19, Tailwind CSS v4 semantic-token CSS, Electron, Vitest, Bun.

---

## Project Constraints

- Use the approved design as the source of truth: `docs/superpowers/specs/2026-07-10-theme-distinction-classic-presets-design.md`.
- Work only in the existing dedicated worktree on branch `opt-color`; do not create another worktree or branch.
- Preserve all pre-existing and concurrent user changes. In particular, do not replace or roll back the explicit unread-bell work currently touching `src/web/theme/theme-presets.test.ts` and the nine existing theme CSS files.
- Before implementation, the concurrent unread-bell work must be committed or otherwise made clean by its owner. Stop if overlapping dirty files remain; do not stage them as part of this feature.
- Git commits are optional checkpoints in this plan and require a fresh, explicit user confirmation before each `git commit`. Never run `git push`, `git reset --hard`, or destructive cleanup as part of this plan.
- Do not use TypeScript enums, runtime namespaces, parameter properties, or import aliases.
- Use repo-alias imports with explicit `.ts` / `.tsx` extensions.
- Do not add package dependencies or a generated-theme pipeline.
- Do not put palette tables in production TypeScript.
- Do not compare a concrete `ColorTheme` in a React component. Components consume semantic classes only.
- Keep `DEFAULT_COLOR_THEME = 'macos'`, the legacy `apple → macos` normalization, and existing invalid-value fallback behavior.
- Keep per-project theme overrides renderer-only. Native Electron background and titlebar state continue to follow the global theme preference.
- Keep the classic terminal palette independent from the selected color preset.
- Run focused tests after every GREEN step; run `bun run typecheck`, `bun run test`, and `bun run check:architecture` before completion.

## Scope Check

This is one cohesive feature in the existing theme subsystem. Shared registration, renderer CSS, semantic topbar consumption, first-paint validation, terminal projection, selectors, translations, and native canvas backgrounds are existing consumers of the same `ColorTheme` contract. Splitting them into separate feature plans would temporarily leave registered themes incomplete and would break the registry's exhaustive tests.

The implementation deliberately defers registration until all three CSS files are complete. That ordering keeps the current nine-theme runtime stable while each new preset is developed test-first, and avoids expanding `ColorTheme` before exhaustive unread-bell and topbar expectation maps are ready.

## Dependency And Ownership Map

```text
COLOR_THEMES ─┬─ boot.js first-paint allowlist
              ├─ global settings options
              ├─ project theme menu options
              ├─ persistence/native-shell validation
              ├─ WINDOW_BACKGROUND_BY_COLOR_THEME
              └─ exhaustive CSS/tests

theme.css ── preset CSS ── --goblin-* foundations ── contract.css --color-* aliases
                                                       ├─ React semantic classes
                                                       └─ terminal CSS reader

global colorTheme ── renderer attribute + Electron canvas
project override  ── renderer attribute + terminal only
```

## File Map

### Shared topbar semantics and GitHub repaint

- Modify: `src/web/theme/contract.css`
- Modify: `src/web/theme/theme-contract.test.ts`
- Modify: `src/web/theme/theme-presets.test.ts`
- Modify: `src/web/theme/themes/github.css`
- Modify: `src/web/components/tab-strip/ToolbarClosableTab.tsx`
- Modify: `src/web/components/tab-strip/tab-variants.ts`
- Modify: `src/web/components/repo-tabs/RepoTab.tsx`
- Modify: `src/web/components/repo-tabs/RepoTabStrip.tsx`
- Modify: `src/web/components/repo-tabs/RepoTabStrip.test.tsx`
- Modify: `src/web/components/Topbar.tsx`
- Modify: `src/web/components/Topbar.test.tsx`
- Modify: `src/web/components/topbar/TopbarRepoControls.tsx`
- Modify: `src/web/components/repo-toolbar/RepoToolbar.test.tsx`
- Modify: `src/web/components/repo-activity/RepoActivityControl.tsx`
- Modify: `src/web/components/repo-activity/RepoActivityControl.component.test.tsx`
- Modify: `src/web/components/SettingsPageScreen.tsx`
- Modify: `src/web/components/SettingsPageScreen.test.tsx`

### New preset CSS

- Create: `src/web/theme/themes/catppuccin.css`
- Create: `src/web/theme/themes/solarized.css`
- Create: `src/web/theme/themes/tokyo-night.css`
- Modify: `src/web/theme/theme-presets.test.ts`
- Modify: `src/web/components/terminal/terminal-theme.test.ts`

### Registry and consumers

- Modify: `src/shared/color-theme.ts`
- Modify: `src/shared/color-theme.test.ts`
- Modify: `src/web/public/boot.js`
- Modify: `src/web/public/boot.test.ts`
- Modify: `src/web/theme/theme.css`
- Modify: `src/shared/theme-tokens.ts`
- Modify: `src/shared/theme-tokens.test.ts`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/shared/i18n/dictionaries.test.ts`
- Modify: `src/shared/native-shell-projection.test.ts`
- Modify: `src/server/modules/settings-source.test.ts`
- Modify: `src/web/components/SettingsSurface.test.tsx`
- Modify: `src/web/components/repo-toolbar/ProjectThemeMenu.test.tsx`

## Test Helpers And Exact Preset Manifests

Keep the runtime CSS as the palette source of truth. In `theme-presets.test.ts`, add test-only manifests for the changed/new themes so exact identity, semantic contrast, terminal values, and app chrome cannot drift. Do not export these values to production code.

Use this type and order:

```ts
const CHANGED_THEME_IDS = ['github', 'catppuccin', 'solarized', 'tokyo-night'] as const
type ChangedThemeId = (typeof CHANGED_THEME_IDS)[number]

const NEW_CLASSIC_THEME_IDS = ['catppuccin', 'solarized', 'tokyo-night'] as const
type NewClassicThemeId = (typeof NEW_CLASSIC_THEME_IDS)[number]
```

The test manifest must lock these exact core values:

```ts
const CHANGED_THEME_CORE_EXPECTATIONS = {
  github: {
    light: {
      canvas: '#ffffff',
      text: '#1f2328',
      secondaryText: '#59636e',
      topbar: '#24292f',
      topbarForeground: '#f0f6fc',
      topbarMuted: '#b1bac4',
      topbarControl: '#30363d',
      topbarControlHover: '#3d444d',
      topbarControlBorder: '#57606a',
      topbarControlForeground: '#f0f6fc',
      action: '#1f883d',
      actionForeground: '#ffffff',
      accent: '#0969da',
      accentText: '#0969da',
      overlayScrim: 'rgb(31 35 40 / 0.4)',
      tabBackground: 'transparent',
      listRowBackground: 'transparent',
      listRowSelected: 'rgb(var(--goblin-accent-rgb) / 0.12)',
      listRowSelectedForeground: '#1f2328',
      terminalBackground: '#ffffff',
      terminalForeground: '#1f2328',
    },
    dark: {
      canvas: '#0d1117',
      text: '#e6edf3',
      secondaryText: '#8b949e',
      topbar: '#010409',
      topbarForeground: '#f0f6fc',
      topbarMuted: '#8b949e',
      topbarControl: '#161b22',
      topbarControlHover: '#21262d',
      topbarControlBorder: '#30363d',
      topbarControlForeground: '#f0f6fc',
      action: '#238636',
      actionForeground: '#ffffff',
      accent: '#58a6ff',
      accentText: '#58a6ff',
      overlayScrim: 'rgb(1 4 9 / 0.55)',
      tabBackground: 'transparent',
      listRowBackground: 'transparent',
      listRowSelected: 'rgb(var(--goblin-accent-rgb) / 0.22)',
      listRowSelectedForeground: '#e6edf3',
      terminalBackground: '#0d1117',
      terminalForeground: '#e6edf3',
    },
  },
  catppuccin: {
    light: {
      canvas: '#eff1f5', text: '#4c4f69', secondaryText: '#5c5f77', topbar: '#dce0e8',
      topbarForeground: '#4c4f69', topbarMuted: '#5c5f77', action: '#8839ef',
      actionForeground: '#ffffff', accent: '#8839ef', accentText: '#8839ef',
      overlayScrim: 'rgb(76 79 105 / 0.38)', tabBackground: 'transparent', listRowBackground: 'transparent',
      listRowSelected: 'rgb(var(--goblin-accent-rgb) / 0.14)', listRowSelectedForeground: '#4c4f69', terminalBackground: '#eff1f5',
      terminalForeground: '#4c4f69',
    },
    dark: {
      canvas: '#1e1e2e', text: '#cdd6f4', secondaryText: '#a6adc8', topbar: '#11111b',
      topbarForeground: '#cdd6f4', topbarMuted: '#a6adc8', action: '#cba6f7',
      actionForeground: '#11111b', accent: '#cba6f7', accentText: '#cba6f7',
      overlayScrim: 'rgb(17 17 27 / 0.58)', tabBackground: 'transparent', listRowBackground: 'transparent',
      listRowSelected: 'rgb(var(--goblin-accent-rgb) / 0.22)', listRowSelectedForeground: '#cdd6f4', terminalBackground: '#1e1e2e',
      terminalForeground: '#cdd6f4',
    },
  },
  solarized: {
    light: {
      canvas: '#fdf6e3', text: '#475b62', secondaryText: '#566c73', topbar: '#ded7c3',
      topbarForeground: '#475b62', topbarMuted: '#4b6168', action: '#1f6f9f',
      actionForeground: '#ffffff', accent: '#268bd2', accentText: '#1f6f9f',
      overlayScrim: 'rgb(0 43 54 / 0.32)', tabBackground: 'transparent', listRowBackground: 'transparent',
      listRowSelected: 'rgb(var(--goblin-accent-rgb) / 0.14)', listRowSelectedForeground: '#475b62', terminalBackground: '#fdf6e3',
      terminalForeground: '#475b62',
    },
    dark: {
      canvas: '#002b36', text: '#aab6b6', secondaryText: '#93a1a1', topbar: '#001f27',
      topbarForeground: '#aab6b6', topbarMuted: '#93a1a1', action: '#2aa198',
      actionForeground: '#002b36', accent: '#268bd2', accentText: '#58a6d6',
      overlayScrim: 'rgb(0 0 0 / 0.52)', tabBackground: 'transparent', listRowBackground: 'transparent',
      listRowSelected: 'rgb(var(--goblin-accent-rgb) / 0.22)', listRowSelectedForeground: '#aab6b6', terminalBackground: '#002b36',
      terminalForeground: '#93a1a1',
    },
  },
  'tokyo-night': {
    light: {
      canvas: '#e6e7ed', text: '#343b58', secondaryText: '#40434f', topbar: '#c7cbda',
      topbarForeground: '#343b58', topbarMuted: '#40434f', action: '#2959aa',
      actionForeground: '#ffffff', accent: '#2959aa', accentText: '#2959aa',
      overlayScrim: 'rgb(52 59 88 / 0.40)', tabBackground: 'transparent', listRowBackground: 'transparent',
      listRowSelected: 'rgb(var(--goblin-accent-rgb) / 0.14)', listRowSelectedForeground: '#343b58', terminalBackground: '#e6e7ed',
      terminalForeground: '#343b58',
    },
    dark: {
      canvas: '#1a1b26', text: '#c0caf5', secondaryText: '#9aa5ce', topbar: '#16161e',
      topbarForeground: '#c0caf5', topbarMuted: '#9aa5ce', action: '#7aa2f7',
      actionForeground: '#1a1b26', accent: '#7aa2f7', accentText: '#7aa2f7',
      overlayScrim: 'rgb(0 0 0 / 0.56)', tabBackground: 'transparent', listRowBackground: 'transparent',
      listRowSelected: 'rgb(var(--goblin-accent-rgb) / 0.22)', listRowSelectedForeground: '#c0caf5', terminalBackground: '#1a1b26',
      terminalForeground: '#c0caf5',
    },
  },
} as const satisfies Record<ChangedThemeId, Record<ThemeMode, Record<string, string>>>
```

Use the exact app-chrome table from the approved design:

```ts
const CHANGED_THEME_CHROME_EXPECTATIONS = {
  github: {
    light: { topbar: '#24292f', border: '#30363d', toolbar: '#eaeef2', toolbarBorder: '#d0d7de', tabHover: '#f6f8fa', tabActive: '#ffffff' },
    dark: { topbar: '#010409', border: '#30363d', toolbar: '#161b22', toolbarBorder: '#30363d', tabHover: '#161b22', tabActive: '#21262d' },
  },
  catppuccin: {
    light: { topbar: '#dce0e8', border: '#bcc0cc', toolbar: '#e6e9ef', toolbarBorder: '#bcc0cc', tabHover: '#eff1f5', tabActive: '#ffffff' },
    dark: { topbar: '#11111b', border: '#45475a', toolbar: '#181825', toolbarBorder: '#45475a', tabHover: '#313244', tabActive: '#45475a' },
  },
  solarized: {
    light: { topbar: '#ded7c3', border: '#c7bea8', toolbar: '#eee8d5', toolbarBorder: '#d8cfb9', tabHover: '#f5efdd', tabActive: '#fdf6e3' },
    dark: { topbar: '#001f27', border: '#31515a', toolbar: '#073642', toolbarBorder: '#31515a', tabHover: '#0b414d', tabActive: '#12505d' },
  },
  'tokyo-night': {
    light: { topbar: '#c7cbda', border: '#adb2c4', toolbar: '#d8dae4', toolbarBorder: '#b4b8c9', tabHover: '#dfe1e8', tabActive: '#e6e7ed' },
    dark: { topbar: '#16161e', border: '#414868', toolbar: '#24283b', toolbarBorder: '#414868', tabHover: '#2d324a', tabActive: '#343b58' },
  },
} as const satisfies Record<ChangedThemeId, Record<ThemeMode, Record<string, string>>>
```

Consume both manifests through one generic exact-value helper; do not leave them as documentation-only constants:

```ts
const CORE_EXPECTATION_TOKEN = {
  canvas: '--goblin-surface-canvas',
  text: '--goblin-text-primary',
  secondaryText: '--goblin-text-secondary',
  topbar: '--goblin-topbar-bg',
  topbarForeground: '--goblin-topbar-fg',
  topbarMuted: '--goblin-topbar-muted-fg',
  topbarControl: '--goblin-topbar-control-bg',
  topbarControlHover: '--goblin-topbar-control-hover-bg',
  topbarControlBorder: '--goblin-topbar-control-border',
  topbarControlForeground: '--goblin-topbar-control-fg',
  action: '--goblin-action-primary',
  actionForeground: '--goblin-action-primary-foreground',
  accent: '--goblin-accent',
  accentText: '--goblin-accent-text',
  overlayScrim: '--color-overlay-scrim',
  tabBackground: '--goblin-tab-bg',
  listRowBackground: '--goblin-list-row-bg',
  listRowSelected: '--goblin-list-row-selected-bg',
  listRowSelectedForeground: '--goblin-list-row-selected-fg',
  terminalBackground: '--color-terminal-background',
  terminalForeground: '--color-terminal-foreground',
} as const

const CHROME_EXPECTATION_TOKEN = {
  topbar: '--goblin-topbar-bg',
  border: '--goblin-topbar-border',
  toolbar: '--goblin-toolbar-bg',
  toolbarBorder: '--goblin-toolbar-border',
  tabHover: '--goblin-tab-hover-bg',
  tabActive: '--goblin-tab-active-bg',
} as const

function expectChangedThemeManifest(colorTheme: ChangedThemeId): void {
  const css = readThemeCss(colorTheme)
  for (const mode of THEME_MODES) {
    const block = selectorBlock(css, colorTheme, mode)
    const core = CHANGED_THEME_CORE_EXPECTATIONS[colorTheme][mode]
    const chrome = CHANGED_THEME_CHROME_EXPECTATIONS[colorTheme][mode]

    for (const [key, expected] of Object.entries(core)) {
      expect(cssTokenValue(block, CORE_EXPECTATION_TOKEN[key as keyof typeof CORE_EXPECTATION_TOKEN])).toBe(expected)
    }
    for (const [key, expected] of Object.entries(chrome)) {
      expect(cssTokenValue(block, CHROME_EXPECTATION_TOKEN[key as keyof typeof CHROME_EXPECTATION_TOKEN])).toBe(expected)
    }
  }
}

function expectCompletePreset(colorTheme: string): void {
  const css = readThemeCss(colorTheme)
  for (const mode of THEME_MODES) {
    const block = selectorBlock(css, colorTheme, mode)
    for (const token of [...FOUNDATION_TOKENS, ...APP_REGION_TOKENS, ...TERMINAL_TOKENS]) {
      expect(block, `${colorTheme}/${mode} defines ${token}`).toContain(token)
    }
  }
  for (const token of CLASSIC_TERMINAL_TOKENS) {
    expect(css, `${colorTheme} defines ${token}`).toContain(`${token}:`)
  }
}
```

Lock geometry and shadows through a second test-only manifest:

```ts
const NEW_THEME_VISUAL_EXPECTATIONS = {
  catppuccin: {
    light: {
      radius: '0.625rem', controlRadius: '0.625rem', brandSmall: '0.375rem', brandMedium: '0.625rem', brandLarge: '0.875rem', divider: '0.75',
      shadowXs: '0 1px 1px rgb(76 79 105 / 0.04)', shadowSm: '0 1px 2px rgb(76 79 105 / 0.06)',
      shadowMd: '0 8px 24px rgb(76 79 105 / 0.12)', shadowLg: '0 18px 48px rgb(76 79 105 / 0.16)',
      inset: 'inset 0 1px 0 rgb(255 255 255 / 0.45)', controlInset: 'inset 0 1px 0 rgb(255 255 255 / 0.5)',
    },
    dark: {
      radius: '0.625rem', controlRadius: '0.625rem', brandSmall: '0.375rem', brandMedium: '0.625rem', brandLarge: '0.875rem', divider: '0.85',
      shadowXs: '0 1px 1px rgb(17 17 27 / 0.28)', shadowSm: '0 1px 2px rgb(17 17 27 / 0.34)',
      shadowMd: '0 8px 24px rgb(17 17 27 / 0.44)', shadowLg: '0 18px 48px rgb(17 17 27 / 0.52)',
      inset: 'inset 0 1px 0 rgb(255 255 255 / 0.08)', controlInset: 'inset 0 1px 0 rgb(255 255 255 / 0.1)',
    },
  },
  solarized: {
    light: {
      radius: '0.25rem', controlRadius: '0.25rem', brandSmall: '0.125rem', brandMedium: '0.25rem', brandLarge: '0.375rem', divider: '0.9',
      shadowXs: '0 1px 1px rgb(0 43 54 / 0.03)', shadowSm: '0 1px 2px rgb(0 43 54 / 0.05)',
      shadowMd: '0 6px 18px rgb(0 43 54 / 0.08)', shadowLg: '0 14px 36px rgb(0 43 54 / 0.12)',
      inset: 'inset 0 1px 0 rgb(255 255 255 / 0.3)', controlInset: 'inset 0 1px 0 rgb(255 255 255 / 0.36)',
    },
    dark: {
      radius: '0.25rem', controlRadius: '0.25rem', brandSmall: '0.125rem', brandMedium: '0.25rem', brandLarge: '0.375rem', divider: '0.9',
      shadowXs: '0 1px 1px rgb(0 0 0 / 0.24)', shadowSm: '0 1px 2px rgb(0 0 0 / 0.30)',
      shadowMd: '0 6px 18px rgb(0 0 0 / 0.38)', shadowLg: '0 14px 36px rgb(0 0 0 / 0.46)',
      inset: 'inset 0 1px 0 rgb(255 255 255 / 0.06)', controlInset: 'inset 0 1px 0 rgb(255 255 255 / 0.08)',
    },
  },
  'tokyo-night': {
    light: {
      radius: '0.375rem', controlRadius: '0.375rem', brandSmall: '0.25rem', brandMedium: '0.375rem', brandLarge: '0.5rem', divider: '0.8',
      shadowXs: '0 1px 1px rgb(52 59 88 / 0.04)', shadowSm: '0 1px 2px rgb(52 59 88 / 0.06)',
      shadowMd: '0 8px 24px rgb(52 59 88 / 0.12)', shadowLg: '0 18px 48px rgb(52 59 88 / 0.16)',
      inset: 'inset 0 1px 0 rgb(255 255 255 / 0.35)', controlInset: 'inset 0 1px 0 rgb(255 255 255 / 0.42)',
    },
    dark: {
      radius: '0.375rem', controlRadius: '0.375rem', brandSmall: '0.25rem', brandMedium: '0.375rem', brandLarge: '0.5rem', divider: '0.9',
      shadowXs: '0 1px 1px rgb(0 0 0 / 0.28)', shadowSm: '0 1px 2px rgb(0 0 0 / 0.34)',
      shadowMd: '0 8px 24px rgb(0 0 0 / 0.44)', shadowLg: '0 18px 48px rgb(0 0 0 / 0.52)',
      inset: 'inset 0 1px 0 rgb(255 255 255 / 0.07)', controlInset: 'inset 0 1px 0 rgb(255 255 255 / 0.09)',
    },
  },
} as const satisfies Record<NewClassicThemeId, Record<ThemeMode, Record<string, string>>>

const VISUAL_EXPECTATION_TOKEN = {
  radius: '--radius',
  controlRadius: '--goblin-control-radius',
  brandSmall: '--goblin-brand-radius-sm',
  brandMedium: '--goblin-brand-radius-md',
  brandLarge: '--goblin-brand-radius-lg',
  divider: '--goblin-brand-divider-strength',
  shadowXs: '--goblin-shadow-xs',
  shadowSm: '--goblin-shadow-sm',
  shadowMd: '--goblin-shadow-md',
  shadowLg: '--goblin-shadow-lg',
  inset: '--shadow-inset-highlight',
  controlInset: '--shadow-control-inset-highlight',
} as const

function expectNewThemeVisualManifest(colorTheme: NewClassicThemeId): void {
  const css = readThemeCss(colorTheme)
  for (const mode of THEME_MODES) {
    const block = selectorBlock(css, colorTheme, mode)
    for (const [key, expected] of Object.entries(NEW_THEME_VISUAL_EXPECTATIONS[colorTheme][mode])) {
      expect(cssTokenValue(block, VISUAL_EXPECTATION_TOKEN[key as keyof typeof VISUAL_EXPECTATION_TOKEN])).toBe(expected)
    }
  }
}
```

Lock every synchronized ANSI/search value rather than sampling only one or two colors:

```ts
const ANSI_NAMES = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'] as const

const NEW_THEME_TERMINAL_EXPECTATIONS = {
  catppuccin: {
    light: {
      selection: 'rgb(136 57 239 / 0.24)',
      ansi: ['#4c4f69', '#d20f39', '#40a02b', '#df8e1d', '#1e66f5', '#8839ef', '#179299', '#8c8fa1'],
      bright: ['#6c6f85', '#e64553', '#40a02b', '#fe640b', '#209fb5', '#ea76cb', '#04a5e5', '#4c4f69'],
      searchMatch: '#df8e1d', searchActive: '#8839ef',
    },
    dark: {
      selection: 'rgb(203 166 247 / 0.28)',
      ansi: ['#45475a', '#f38ba8', '#a6e3a1', '#f9e2af', '#89b4fa', '#cba6f7', '#94e2d5', '#bac2de'],
      bright: ['#6c7086', '#eba0ac', '#a6e3a1', '#fab387', '#74c7ec', '#f5c2e7', '#89dceb', '#cdd6f4'],
      searchMatch: '#f9e2af', searchActive: '#cba6f7',
    },
  },
  solarized: {
    light: {
      selection: 'rgb(38 139 210 / 0.22)',
      ansi: ['#073642', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#eee8d5'],
      bright: ['#002b36', '#cb4b16', '#586e75', '#657b83', '#839496', '#6c71c4', '#93a1a1', '#fdf6e3'],
      searchMatch: '#b58900', searchActive: '#268bd2',
    },
    dark: {
      selection: 'rgb(38 139 210 / 0.28)',
      ansi: ['#073642', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#eee8d5'],
      bright: ['#002b36', '#cb4b16', '#586e75', '#657b83', '#839496', '#6c71c4', '#93a1a1', '#fdf6e3'],
      searchMatch: '#b58900', searchActive: '#268bd2',
    },
  },
  'tokyo-night': {
    light: {
      selection: 'rgb(41 89 170 / 0.22)',
      ansi: ['#343b58', '#8c4351', '#385f0d', '#8f5e15', '#2959aa', '#5a3e8e', '#0f4b6e', '#6c6e75'],
      bright: ['#6c6e75', '#8c4351', '#33635c', '#965027', '#2959aa', '#5a3e8e', '#006c86', '#343b58'],
      searchMatch: '#8f5e15', searchActive: '#2959aa',
    },
    dark: {
      selection: 'rgb(122 162 247 / 0.28)',
      ansi: ['#414868', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#a9b1d6'],
      bright: ['#565f89', '#f7768e', '#73daca', '#ff9e64', '#7dcfff', '#bb9af7', '#b4f9f8', '#c0caf5'],
      searchMatch: '#e0af68', searchActive: '#7aa2f7',
    },
  },
} as const

function expectNewThemeTerminalManifest(colorTheme: NewClassicThemeId): void {
  const css = readThemeCss(colorTheme)
  for (const mode of THEME_MODES) {
    const block = selectorBlock(css, colorTheme, mode)
    const expected = NEW_THEME_TERMINAL_EXPECTATIONS[colorTheme][mode]
    expect(cssTokenValue(block, '--color-terminal-cursor')).toBe(
      cssTokenValue(block, '--color-terminal-foreground'),
    )
    expect(cssTokenValue(block, '--color-terminal-selection-background')).toBe(expected.selection)
    ANSI_NAMES.forEach((name, index) => {
      expect(cssTokenValue(block, `--color-terminal-ansi-${name}`)).toBe(expected.ansi[index])
      expect(cssTokenValue(block, `--color-terminal-ansi-bright-${name}`)).toBe(expected.bright[index])
    })
    expect(cssTokenValue(block, '--color-terminal-search-match')).toBe(expected.searchMatch)
    expect(cssTokenValue(block, '--color-terminal-search-active-match')).toBe(expected.searchActive)
    expect(cssTokenValue(block, '--color-terminal-search-active-border')).toBe(
      cssTokenValue(block, '--color-terminal-foreground'),
    )
  }
}
```

Do not reuse the existing non-linear `hexLuminance()` helper for WCAG assertions. Reuse the already-added `parseHexRgb()`, `relativeLuminance()`, and `contrastRatio()` helpers from the concurrent unread-bell work.

The concurrent unread-bell contract is stricter than the original fallback described in the design spec: all themes now require explicit bell values and at least 3:1 contrast on every host surface. Preserve canonical warning/status tokens, but use these same-hue accessible bell adaptations for the three new presets:

```ts
const NEW_THEME_BELL_EXPECTATIONS = {
  catppuccin: {
    light: { hex: '#9a6500', rgb: '154 101 0' },
    dark: { hex: '#f9e2af', rgb: '249 226 175' },
  },
  solarized: {
    light: { hex: '#806000', rgb: '128 96 0' },
    dark: { hex: '#d6b84a', rgb: '214 184 74' },
  },
  'tokyo-night': {
    light: { hex: '#8f5e15', rgb: '143 94 21' },
    dark: { hex: '#e0af68', rgb: '224 175 104' },
  },
} as const satisfies Record<NewClassicThemeId, Record<ThemeMode, { hex: string; rgb: string }>>

function expectNewThemeBell(colorTheme: NewClassicThemeId): void {
  const css = readThemeCss(colorTheme)
  for (const mode of THEME_MODES) {
    const block = selectorBlock(css, colorTheme, mode)
    const expected = NEW_THEME_BELL_EXPECTATIONS[colorTheme][mode]
    const expectedSurfaceAlpha = mode === 'light' ? '0.13' : '0.14'

    expect(cssTokenValue(block, '--goblin-terminal-bell')).toBe(expected.hex)
    expect(cssTokenValue(block, '--goblin-terminal-bell-rgb')).toBe(expected.rgb)
    expect(cssTokenValue(block, '--goblin-terminal-bell-surface')).toBe(
      `rgb(var(--goblin-terminal-bell-rgb) / ${expectedSurfaceAlpha})`,
    )
    expect(cssTokenValue(block, '--goblin-terminal-bell-border')).toBe(
      'rgb(var(--goblin-terminal-bell-rgb) / 0.38)',
    )

    const bell = parseHexRgb(expected.hex)
    for (const surface of bellContrastSurfaces(block)) {
      expect(contrastRatio(bell, surface.rgb), `${colorTheme}/${mode} bell against ${surface.label}`)
        .toBeGreaterThanOrEqual(3)
    }
  }
}
```

For every new theme, define the full bell family explicitly: Light uses surface alpha `0.13`, Dark uses `0.14`, and both use border alpha `0.38`. This is an integration adaptation to a newer approved contract; it does not alter the canonical status or ANSI yellow.

The GitHub repaint also changes a bell host from light blue to charcoal. Update GitHub Light's explicit bell and its test expectation from `#1a7f37` / `26 127 55` to the approved action green `#1f883d` / `31 136 61`; the old value reaches only about 2.89:1 on `#24292f`, while the replacement passes both the charcoal topbar and light document surfaces. GitHub Dark remains `#3fb950`.

---

### Task 0: Establish A Clean, Non-Overlapping Baseline

**Files:**

- Inspect only: all files listed by `git status --short`
- Verify: `docs/superpowers/plans/2026-07-10-theme-specific-unread-bell-colors.md`

- [ ] **Step 1: Confirm the dedicated worktree and branch**

Run:

```bash
git worktree list
git branch --show-current
git rev-parse --short HEAD
```

Expected: the current directory is the `opt-color` worktree, branch is `opt-color`, and the approved design commit `09b2731` is in history. Do not create or switch branches.

- [ ] **Step 2: Audit overlapping dirty files**

Run:

```bash
git status --short
git diff -- src/web/theme/theme-presets.test.ts src/web/theme/themes/github.css
```

Expected before implementation: no unrelated or concurrent work remains dirty in any file this plan will modify. If the unread-bell files are still dirty, stop and ask their owner to finish or explicitly authorize coordinated integration. Never use checkout/reset to discard them.

- [ ] **Step 3: Establish a green baseline**

Run:

```bash
bun run typecheck
bun run test
bun run check:architecture
```

Expected: all three commands pass before feature edits. If any command fails, diagnose the baseline first and record the failure; do not attribute it to this feature.

---

### Task 1: Add The Topbar Semantic Contract Test-First

**Files:**

- Modify: `src/web/theme/theme-contract.test.ts`
- Modify: `src/web/theme/contract.css`

- [ ] **Step 1: Write failing contract-token tests**

Extend `CONTRACT_TOKENS` with these entries:

```ts
'--color-topbar-muted-foreground:',
'--color-topbar-control:',
'--color-topbar-control-hover:',
'--color-topbar-control-border:',
'--color-topbar-control-foreground:',
```

Add a focused test that extracts the `.topbar` rule and checks only the approved local remaps:

```ts
function cssRule(css: string, selector: string): string {
  const start = css.indexOf(selector)
  expect(start, `${selector} exists`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  expect(open, `${selector} opening brace`).toBeGreaterThanOrEqual(0)
  expect(close, `${selector} closing brace`).toBeGreaterThan(open)
  return css.slice(open + 1, close)
}

test('scopes topbar control semantics without replacing muted foreground', () => {
  const contract = readText(new URL('contract.css', THEME_ROOT))
  const topbar = cssRule(contract, '.topbar')

  expect(topbar).toContain('--color-control: var(--color-topbar-control);')
  expect(topbar).toContain('--color-control-hover: var(--color-topbar-control-hover);')
  expect(topbar).toContain('--color-input: var(--color-topbar-control-border);')
  expect(topbar).toContain('--color-accent: var(--color-topbar-control-hover);')
  expect(topbar).toContain('--color-accent-foreground: var(--color-topbar-control-foreground);')
  expect(topbar).not.toContain('--color-muted-foreground:')
})
```

- [ ] **Step 2: Run the focused test and observe RED**

Run:

```bash
bun run test -- src/web/theme/theme-contract.test.ts
```

Expected: failure because the five aliases and `.topbar` remaps do not exist.

- [ ] **Step 3: Add semantic aliases and scoped remapping**

In the app-region section of `contract.css`, immediately after `--color-topbar-foreground`, add:

```css
--color-topbar-muted-foreground: var(--goblin-topbar-muted-fg, var(--goblin-text-secondary));
--color-topbar-control: var(
  --goblin-topbar-control-bg,
  var(--goblin-control-bg, var(--goblin-surface-control))
);
--color-topbar-control-hover: var(
  --goblin-topbar-control-hover-bg,
  var(--goblin-control-hover-bg, var(--goblin-surface-control-hover))
);
--color-topbar-control-border: var(
  --goblin-topbar-control-border,
  var(--goblin-control-border, var(--goblin-border-strong))
);
--color-topbar-control-foreground: var(
  --goblin-topbar-control-fg,
  var(--goblin-topbar-fg, var(--goblin-text-primary))
);
```

After the closing `@theme` brace, add:

```css
.topbar {
  --color-control: var(--color-topbar-control);
  --color-control-hover: var(--color-topbar-control-hover);
  --color-input: var(--color-topbar-control-border);
  --color-accent: var(--color-topbar-control-hover);
  --color-accent-foreground: var(--color-topbar-control-foreground);
}
```

Do not remap `--color-muted-foreground`; the active GitHub light repo tab is a light surface inside the dark topbar.

- [ ] **Step 4: Run the focused test and observe GREEN**

Run:

```bash
bun run test -- src/web/theme/theme-contract.test.ts
```

Expected: all theme-contract tests pass.

- [ ] **Step 5: Optional checkpoint commit — explicit confirmation required**

After the user explicitly confirms a commit, run only:

```bash
git add src/web/theme/contract.css src/web/theme/theme-contract.test.ts
git commit -m "feat: add topbar theme semantics"
```

If no confirmation is given, leave the verified changes uncommitted and continue.

---

### Task 2: Apply Region Semantics To Topbar Consumers Test-First

**Files:**

- Modify: `src/web/components/tab-strip/ToolbarClosableTab.tsx`
- Modify: `src/web/components/tab-strip/tab-variants.ts`
- Modify: `src/web/components/repo-tabs/RepoTab.tsx`
- Modify: `src/web/components/repo-tabs/RepoTabStrip.tsx`
- Modify: `src/web/components/repo-tabs/RepoTabStrip.test.tsx`
- Modify: `src/web/components/Topbar.tsx`
- Modify: `src/web/components/Topbar.test.tsx`
- Modify: `src/web/components/topbar/TopbarRepoControls.tsx`
- Modify: `src/web/components/repo-toolbar/RepoToolbar.test.tsx`
- Modify: `src/web/components/repo-activity/RepoActivityControl.tsx`
- Modify: `src/web/components/repo-activity/RepoActivityControl.component.test.tsx`
- Modify: `src/web/components/SettingsPageScreen.tsx`
- Modify: `src/web/components/SettingsPageScreen.test.tsx`

- [ ] **Step 1: Add failing repo-tab semantic assertions**

Extend the existing desktop repo-tab test in `RepoTabStrip.test.tsx`. Render three tabs with `/tmp/repo-a` active followed by `/tmp/repo-b` and `/tmp/repo-c` inactive. The two adjacent inactive tabs force the internal `RepoTab` separator to render. Assert:

```ts
const activeTab = container!.querySelector<HTMLElement>('[data-repo-tab-tooltip-id="/tmp/repo-a"]')!
const inactiveTab = container!.querySelector<HTMLElement>('[data-repo-tab-tooltip-id="/tmp/repo-b"]')!

expect(activeTab.className).toContain('text-foreground')
expect(inactiveTab.className).toContain('text-topbar-muted-foreground')
expect(inactiveTab.querySelector('svg')?.getAttribute('class')).toContain('text-topbar-muted-foreground')

const activeClose = activeTab.querySelector<HTMLButtonElement>('button[aria-label="Close repo-a"]')!
const inactiveClose = inactiveTab.querySelector<HTMLButtonElement>('button[aria-label="Close repo-b"]')!
expect(activeClose.className).toContain('text-muted-foreground')
expect(activeClose.className).not.toContain('text-topbar-muted-foreground')
expect(inactiveClose.className).toContain('text-topbar-muted-foreground')
expect(inactiveTab.querySelector('span.border-topbar-border')).not.toBeNull()

const openTrigger = container!.querySelector<HTMLButtonElement>('button[aria-label="Open"]')!
expect(openTrigger.parentElement?.querySelector('span.border-topbar-border')).not.toBeNull()
```

If the fixture's English labels differ, derive the exact close/open strings from that fixture's `labels` object. Do not use partial `aria-label*=` selectors or a global separator query: both can produce false positives.

- [ ] **Step 2: Add failing topbar and settings-header assertions**

In `Topbar.test.tsx`, render `actions={<button>action</button>}` and add:

```ts
const divider = container!.querySelector<HTMLElement>('[aria-hidden="true"]')
expect(divider?.className).toContain('bg-topbar-border')
```

In `SettingsPageScreen.test.tsx`, add:

```ts
const title = container!.querySelector<HTMLElement>('.topbar .font-semibold')
expect(title?.className).toContain('text-topbar-foreground')
expect(title?.className.split(/\s+/)).not.toContain('text-foreground')
```

Extend the existing focus-mode case in `RepoToolbar.test.tsx`:

```ts
expect(container?.querySelector('button[aria-label="branches.switch"]')?.className)
  .toContain('text-topbar-muted-foreground')
```

Add a `RepoActivityControl.component.test.tsx` case that seeds a repo, replaces its projection with `{ source: 'cache', savedAt: 1 }`, renders `<RepoActivityControl repoId={REPO_ID} mutedForegroundClassName="text-topbar-muted-foreground" />`, and asserts the cache indicator's class contains `text-topbar-muted-foreground` and its dot uses `bg-current opacity-70`.

In the existing non-Git `TopbarRepoControls` case in `RepoToolbar.test.tsx`, set the seeded repo's projection to the same cached value before `renderControls()`. Assert the rendered `[aria-label^="tab.projectiond"]` has `text-topbar-muted-foreground`; this covers the parent-to-leaf wiring, not only the leaf prop.

- [ ] **Step 3: Run focused component tests and observe RED**

Run:

```bash
bun run test -- src/web/components/repo-tabs/RepoTabStrip.test.tsx src/web/components/Topbar.test.tsx src/web/components/SettingsPageScreen.test.tsx src/web/components/repo-toolbar/RepoToolbar.test.tsx src/web/components/repo-activity/RepoActivityControl.component.test.tsx
```

Expected: assertions fail on the current global muted/separator classes.

- [ ] **Step 4: Add the narrow close-button API**

In `ToolbarClosableTab.tsx`, add only one optional prop:

```ts
interface ToolbarClosableTabProps {
  // existing props remain unchanged
  closeButtonClassName?: string
}
```

Destructure it and append it last in the close button's `cn()` call:

```tsx
className={cn(
  'cursor-pointer rounded-[var(--goblin-brand-radius-sm,var(--radius-sm))] border-0 bg-transparent p-0.5 text-muted-foreground transition-colors duration-100 hover:bg-tab-hover hover:text-foreground',
  closeVisible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
  closeButtonClassName,
)}
```

Terminal tabs do not pass the prop and retain current behavior.

- [ ] **Step 5: Replace only topbar-region classes**

Make these exact semantic changes:

```ts
// tab-variants.ts: repo inactive only; terminal inactive stays global muted.
active
  ? 'border-input bg-tab-active text-foreground'
  : 'border-transparent text-topbar-muted-foreground hover:bg-tab-hover hover:text-foreground'

export function toolbarTabIconClassName(active: boolean): string {
  return cn(
    'shrink-0',
    active ? 'text-foreground' : 'text-topbar-muted-foreground group-hover:text-foreground',
  )
}
```

Because `toolbarTabIconClassName()` is currently used by repo tabs only, keep the function narrow; if a terminal consumer appears during implementation, add a `variant` parameter rather than leaking topbar semantics into toolbar tabs.

In `RepoTab.tsx`:

```tsx
overlay={
  showSeparator ? (
    <span className="pointer-events-none absolute right-0 top-1/2 h-4 -translate-y-1/2 border-r border-topbar-border" />
  ) : null
}
closeButtonClassName={isActive ? undefined : 'text-topbar-muted-foreground'}
```

In `RepoTabStrip.tsx`, change the edge separator from `border-separator` to `border-topbar-border`.

In `Topbar.tsx`, change the action divider from `bg-separator/70` to `bg-topbar-border`.

In `TopbarRepoControls.tsx`, change only the in-topbar `BranchSelector` trigger from `text-muted-foreground` to `text-topbar-muted-foreground`. Keep the selected branch text inside `DropdownMenuContent` as `text-muted-foreground`, because the menu is portaled outside `.topbar`.

For the cached-projection label, add an optional semantic override without changing body-toolbar behavior:

```tsx
interface Props {
  repoId: string
  compact?: boolean
  mutedForegroundClassName?: string
}

// Pass mutedForegroundClassName through RepoActivityControlView to RepoCacheIndicator.
function RepoCacheIndicator({ repo, className }: { repo: RepoState; className?: string }) {
  // existing early return and title stay unchanged
  return (
    <span
      className={cn('flex items-center gap-1 text-xs text-muted-foreground', className)}
      title={title}
      aria-label={title}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {t('tab.projectiond')}
    </span>
  )
}
```

Pass `mutedForegroundClassName="text-topbar-muted-foreground"` only from `TopbarRepoControls`. `RepoToolbarActions` passes nothing and keeps normal toolbar muted semantics.

In `SettingsPageScreen.tsx`, replace the title's `text-foreground` with `text-topbar-foreground`.

- [ ] **Step 6: Run focused tests and observe GREEN**

Run:

```bash
bun run test -- src/web/components/repo-tabs/RepoTabStrip.test.tsx src/web/components/Topbar.test.tsx src/web/components/SettingsPageScreen.test.tsx src/web/components/repo-toolbar/RepoToolbar.test.tsx src/web/components/repo-activity/RepoActivityControl.component.test.tsx
bun run typecheck
```

Expected: all focused tests and typecheck pass. Existing terminal tab tests remain unchanged.

- [ ] **Step 7: Prove components remain theme-ID agnostic**

Run:

```bash
rg -n --glob '!*.test.ts' --glob '!*.test.tsx' "github|catppuccin|solarized|tokyo-night|ColorTheme" src/web/components/tab-strip src/web/components/repo-tabs src/web/components/topbar src/web/components/Topbar.tsx src/web/components/SettingsPageScreen.tsx
```

Expected: no concrete theme-ID branch and no new `ColorTheme` import in these component files.

- [ ] **Step 8: Optional checkpoint commit — explicit confirmation required**

After explicit confirmation, stage only the files in this task and run:

```bash
git commit -m "fix: use topbar-aware component colors"
```

Otherwise continue without committing.

---

### Task 3: Repaint GitHub As Primer Header Test-First

**Files:**

- Modify: `src/web/theme/theme-presets.test.ts`
- Modify: `src/web/theme/themes/github.css`

- [ ] **Step 1: Change the GitHub expectation before the implementation**

In `TOPBAR_BRAND_TINT_EXPECTATIONS.github`, replace the old values with:

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

Add a focused GitHub identity test:

```ts
test('uses the approved GitHub Primer Header palette', () => {
  const css = readThemeCss('github')
  const light = selectorBlock(css, 'github', 'light')
  const dark = selectorBlock(css, 'github', 'dark')

  expect(cssTokenValue(light, '--goblin-topbar-bg')).toBe('#24292f')
  expect(cssTokenValue(light, '--goblin-topbar-fg')).toBe('#f0f6fc')
  expect(cssTokenValue(light, '--goblin-topbar-muted-fg')).toBe('#b1bac4')
  expect(cssTokenValue(light, '--goblin-topbar-control-bg')).toBe('#30363d')
  expect(cssTokenValue(light, '--goblin-topbar-control-hover-bg')).toBe('#3d444d')
  expect(cssTokenValue(light, '--goblin-topbar-control-border')).toBe('#57606a')
  expect(cssTokenValue(light, '--goblin-topbar-control-fg')).toBe('#f0f6fc')
  expect(cssTokenValue(light, '--goblin-toolbar-bg')).toBe('#eaeef2')
  expect(cssTokenValue(light, '--goblin-toolbar-border')).toBe('#d0d7de')
  expect(cssTokenValue(light, '--goblin-action-primary')).toBe('#1f883d')
  expect(cssTokenValue(light, '--goblin-accent')).toBe('#0969da')

  expect(cssTokenValue(dark, '--goblin-topbar-bg')).toBe('#010409')
  expect(cssTokenValue(dark, '--goblin-topbar-fg')).toBe('#f0f6fc')
  expect(cssTokenValue(dark, '--goblin-topbar-muted-fg')).toBe('#8b949e')
  expect(cssTokenValue(dark, '--goblin-topbar-control-bg')).toBe('#161b22')
  expect(cssTokenValue(dark, '--goblin-topbar-control-hover-bg')).toBe('#21262d')
  expect(cssTokenValue(dark, '--goblin-topbar-control-border')).toBe('#30363d')
  expect(cssTokenValue(dark, '--goblin-topbar-control-fg')).toBe('#f0f6fc')
  expect(cssTokenValue(dark, '--goblin-toolbar-bg')).toBe('#161b22')
  expect(cssTokenValue(dark, '--goblin-toolbar-border')).toBe('#30363d')
  expect(cssTokenValue(dark, '--goblin-action-primary')).toBe('#238636')
  expect(cssTokenValue(dark, '--goblin-accent')).toBe('#58a6ff')
})
```

In the same RED edit, change `BELL_COLOR_EXPECTATIONS.github.light` to:

```ts
light: { hex: '#1f883d', rgb: '31 136 61' },
```

Also call `expectChangedThemeManifest('github')` from the GitHub identity test so every core and chrome field is consumed.

- [ ] **Step 2: Add GitHub/macOS separation and WCAG tests**

Add a small helper and two tests:

```ts
function expectContrastAtLeast(
  block: string,
  foregroundToken: string,
  backgroundToken: string,
  minimum = 4.5,
): void {
  expect(
    contrastRatio(
      parseHexRgb(cssTokenValue(block, foregroundToken)),
      parseHexRgb(cssTokenValue(block, backgroundToken)),
    ),
    `${foregroundToken} against ${backgroundToken}`,
  ).toBeGreaterThanOrEqual(minimum)
}

test('keeps GitHub critical text pairs at 4.5 to 1', () => {
  const css = readThemeCss('github')
  for (const mode of THEME_MODES) {
    const block = selectorBlock(css, 'github', mode)
    expectContrastAtLeast(block, '--goblin-text-primary', '--goblin-surface-canvas')
    expectContrastAtLeast(block, '--goblin-text-secondary', '--goblin-surface-base')
    expectContrastAtLeast(block, '--goblin-topbar-fg', '--goblin-topbar-bg')
    expectContrastAtLeast(block, '--goblin-topbar-muted-fg', '--goblin-topbar-bg')
    expectContrastAtLeast(block, '--goblin-topbar-control-fg', '--goblin-topbar-control-bg')
    expectContrastAtLeast(block, '--goblin-topbar-control-fg', '--goblin-topbar-control-hover-bg')
    expectContrastAtLeast(block, '--goblin-action-primary-foreground', '--goblin-action-primary')
    expectContrastAtLeast(block, '--color-terminal-foreground', '--color-terminal-background')
  }
})

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

- [ ] **Step 3: Run the preset test and observe RED**

Run:

```bash
bun run test -- src/web/theme/theme-presets.test.ts
```

Expected: GitHub identity, chrome, and separation tests fail against the old blue-tinted header.

- [ ] **Step 4: Repaint only the approved GitHub tokens**

Keep the explicit unread-bell token family and existing Primer status/terminal colors, but adapt the GitHub Light bell for the new charcoal host. Apply these replacements:

```css
/* GitHub light */
--goblin-action-primary: #1f883d;
--goblin-terminal-bell: #1f883d;
--goblin-terminal-bell-rgb: 31 136 61;
--goblin-topbar-bg: #24292f;
--goblin-topbar-border: #30363d;
--goblin-topbar-fg: #f0f6fc;
--goblin-topbar-muted-fg: #b1bac4;
--goblin-topbar-control-bg: #30363d;
--goblin-topbar-control-hover-bg: #3d444d;
--goblin-topbar-control-border: #57606a;
--goblin-topbar-control-fg: #f0f6fc;
--goblin-toolbar-bg: #eaeef2;
--goblin-toolbar-border: #d0d7de;
--goblin-tab-hover-bg: #f6f8fa;
--goblin-tab-active-bg: #ffffff;

/* GitHub dark */
--goblin-focus-ring: #58a6ff;
--goblin-action-primary: #238636;
--goblin-accent: #58a6ff;
--goblin-accent-text: #58a6ff;
--goblin-accent-rgb: 88 166 255;
--goblin-topbar-bg: #010409;
--goblin-topbar-border: #30363d;
--goblin-topbar-fg: #f0f6fc;
--goblin-topbar-muted-fg: #8b949e;
--goblin-topbar-control-bg: #161b22;
--goblin-topbar-control-hover-bg: #21262d;
--goblin-topbar-control-border: #30363d;
--goblin-topbar-control-fg: #f0f6fc;
--goblin-toolbar-bg: #161b22;
--goblin-toolbar-border: #30363d;
--goblin-tab-hover-bg: #161b22;
--goblin-tab-active-bg: #21262d;
--goblin-list-row-selected-bg: rgb(var(--goblin-accent-rgb) / 0.22);
```

Do not change the GitHub native canvas mapping (`#ffffff` / `#0d1117`) and do not modify macOS palette values.

- [ ] **Step 5: Run focused tests and observe GREEN**

Run:

```bash
bun run test -- src/web/theme/theme-presets.test.ts src/web/theme/theme-contract.test.ts
bun run typecheck
```

Expected: GitHub identity, 4.5:1 contrast, separation, unread-bell, and existing preset tests pass.

- [ ] **Step 6: Optional checkpoint commit — explicit confirmation required**

After explicit confirmation:

```bash
git add src/web/theme/theme-presets.test.ts src/web/theme/themes/github.css
git commit -m "feat: distinguish GitHub from macOS theme"
```

Otherwise continue without committing.
### Task 4: Add Catppuccin Latte And Mocha Test-First

**Files:**

- Modify: `src/web/theme/theme-presets.test.ts`
- Create: `src/web/theme/themes/catppuccin.css`

- [ ] **Step 1: Add a failing Catppuccin identity test**

Add the Catppuccin entry from `CHANGED_THEME_CORE_EXPECTATIONS` and `CHANGED_THEME_CHROME_EXPECTATIONS`, then add:

```ts
test('keeps Catppuccin aligned with Latte and Mocha', () => {
  expectChangedThemeManifest('catppuccin')
  expectCompletePreset('catppuccin')
  expectNewThemeBell('catppuccin')
  expectNewThemeVisualManifest('catppuccin')
  expectNewThemeTerminalManifest('catppuccin')

  const css = readThemeCss('catppuccin')
  const light = selectorBlock(css, 'catppuccin', 'light')
  const dark = selectorBlock(css, 'catppuccin', 'dark')

  expect(cssTokenValue(light, '--goblin-surface-canvas')).toBe('#eff1f5')
  expect(cssTokenValue(light, '--goblin-action-primary')).toBe('#8839ef')
  expect(cssTokenValue(light, '--goblin-control-radius')).toBe('0.625rem')
  expect(cssTokenValue(dark, '--goblin-surface-canvas')).toBe('#1e1e2e')
  expect(cssTokenValue(dark, '--goblin-action-primary')).toBe('#cba6f7')
  expect(cssTokenValue(dark, '--goblin-action-primary-foreground')).toBe('#11111b')
})
```

Add a temporary direct file-presence assertion for `catppuccin`; do not add it to `COLOR_THEMES` yet.

- [ ] **Step 2: Run the focused test and observe RED**

Run:

```bash
bun run test -- src/web/theme/theme-presets.test.ts
```

Expected: `catppuccin.css` does not exist.

- [ ] **Step 3: Create the complete Catppuccin file**

Copy the unchanged classic terminal root block from an existing preset, changing only the selector to `html[data-color-theme='catppuccin']`. Then add complete Light/Dark blocks in the same token order as `signal.css`.

Use these exact foundation and app values:

```text
Latte surfaces: canvas #eff1f5; base #e6e9ef; raised/overlay/control #ffffff;
  muted #e6e9ef; hover #dce0e8; control-hover #eff1f5.
Latte text: primary #4c4f69; secondary-strong/secondary/selected-secondary #5c5f77;
  disabled #9ca0b0.
Latte borders: subtle #ccd0da; default #bcc0cc; strong #9ca0b0.
Latte focus/action/accent/accent-text: #8839ef; action foreground #ffffff; RGB 136 57 239.
Latte danger: #d20f39 / foreground #ffffff / RGB 210 15 57.
Latte status: warning #df8e1d (223 142 29), success #40a02b (64 160 43), danger #d20f39.
Latte bell: #9a6500 (154 101 0), surface alpha .13, border alpha .38.

Mocha surfaces: canvas #1e1e2e; base #181825; raised/control #313244; overlay #45475a;
  muted #313244; hover/control-hover #45475a.
Mocha text: primary #cdd6f4; secondary-strong #bac2de; secondary #a6adc8;
  selected-secondary #bac2de; disabled #6c7086.
Mocha borders: subtle #313244; default #45475a; strong #585b70.
Mocha focus/action/accent/accent-text: #cba6f7; action foreground #11111b; RGB 203 166 247.
Mocha danger: #f38ba8 / foreground #11111b / RGB 243 139 168.
Mocha status: warning #f9e2af (249 226 175), success #a6e3a1 (166 227 161), danger #f38ba8.
Mocha bell: #f9e2af (249 226 175), surface alpha .14, border alpha .38.
```

Use the approved derived alphas: accent selection `.14` Light / `.22` Dark; accent surface `.09` / `.14`; accent border `.34` / `.42`; every status surface `.12`; every status border `.34`.

Use exact Catppuccin app/chrome and geometry:

```text
Latte: app/pane/detail #eff1f5; topbar #dce0e8; topbar border #bcc0cc;
  topbar fg #4c4f69; topbar muted fg #5c5f77; toolbar #e6e9ef; toolbar border #bcc0cc;
  tab hover #eff1f5; active #ffffff; sidebar/pane-header #e6e9ef; card #ffffff;
  list hover #eff1f5; control #ffffff; control hover #eff1f5; control border #9ca0b0.
  tab/list-row base transparent; selected list bg accent-selection; selected list fg #4c4f69;
  overlay scrim rgb(76 79 105 / 0.38).
Mocha: app/pane/detail #1e1e2e; topbar #11111b; topbar border #45475a;
  topbar fg #cdd6f4; topbar muted fg #a6adc8; toolbar #181825; toolbar border #45475a;
  tab hover #313244; active #45475a; sidebar/pane-header #181825; card #313244;
  list hover #313244; control #313244; control hover #45475a; control border #585b70.
  tab/list-row base transparent; selected list bg accent-selection; selected list fg #cdd6f4;
  overlay scrim rgb(17 17 27 / 0.58).
Geometry: radius/control .625rem; brand sm .375rem; md .625rem; lg .875rem;
  control height 2rem; density 1; divider strength .75 Light / .85 Dark.
```

Use the exact shadow strings from the design spec's Catppuccin rows. Use inset highlights `inset 0 1px 0 rgb(255 255 255 / 0.45)` / `0.5` for Light and `0.08` / `0.1` for Dark.

Use the exact synchronized terminal core and ANSI arrays:

```text
Latte core: background #eff1f5; foreground/cursor #4c4f69; selection rgb(136 57 239 / 0.24).
Latte ANSI: #4c4f69 #d20f39 #40a02b #df8e1d #1e66f5 #8839ef #179299 #8c8fa1
Latte bright: #6c6f85 #e64553 #40a02b #fe640b #209fb5 #ea76cb #04a5e5 #4c4f69
Mocha core: background #1e1e2e; foreground/cursor #cdd6f4; selection rgb(203 166 247 / 0.28).
Mocha ANSI: #45475a #f38ba8 #a6e3a1 #f9e2af #89b4fa #cba6f7 #94e2d5 #bac2de
Mocha bright: #6c7086 #eba0ac #a6e3a1 #fab387 #74c7ec #f5c2e7 #89dceb #cdd6f4
Search: warning yellow; active accent; active border terminal foreground.
```

- [ ] **Step 4: Run Catppuccin and contract tests and observe GREEN**

Run:

```bash
bun run test -- src/web/theme/theme-presets.test.ts src/web/theme/theme-contract.test.ts
```

Expected: Catppuccin file, full token blocks, classic terminal tokens, identity, and bell assertions pass. The runtime registry remains nine themes.

---

### Task 5: Add Solarized Light And Dark Test-First

**Files:**

- Modify: `src/web/theme/theme-presets.test.ts`
- Create: `src/web/theme/themes/solarized.css`

- [ ] **Step 1: Add a failing Solarized identity test**

Add the Solarized manifest entries and a focused test for canvas, adapted text, action, topbar, and `0.25rem` control radius. The test must call `expectChangedThemeManifest('solarized')`, `expectCompletePreset('solarized')`, `expectNewThemeBell('solarized')`, `expectNewThemeVisualManifest('solarized')`, and `expectNewThemeTerminalManifest('solarized')`; this enforces the full unregistered file rather than relying on loops over the still-nine-item `COLOR_THEMES`.

```ts
test('keeps Solarized aligned with its Light and Dark palette', () => {
  expectChangedThemeManifest('solarized')
  expectCompletePreset('solarized')
  expectNewThemeBell('solarized')
  expectNewThemeVisualManifest('solarized')
  expectNewThemeTerminalManifest('solarized')

  const css = readThemeCss('solarized')
  const light = selectorBlock(css, 'solarized', 'light')
  const dark = selectorBlock(css, 'solarized', 'dark')
  expect(cssTokenValue(light, '--goblin-text-primary')).toBe('#475b62')
  expect(cssTokenValue(light, '--goblin-action-primary')).toBe('#1f6f9f')
  expect(cssTokenValue(light, '--goblin-control-radius')).toBe('0.25rem')
  expect(cssTokenValue(dark, '--goblin-surface-canvas')).toBe('#002b36')
  expect(cssTokenValue(dark, '--goblin-action-primary')).toBe('#2aa198')
})
```

- [ ] **Step 2: Run the preset test and observe RED**

Run `bun run test -- src/web/theme/theme-presets.test.ts`.

Expected: `solarized.css` does not exist.

- [ ] **Step 3: Create the complete Solarized file**

Copy the unchanged classic terminal root block and use the existing preset token order. Use these exact values:

```text
Light surfaces: canvas #fdf6e3; base/muted #eee8d5; raised/overlay/control #fffdf5;
  hover #e6dfca; control-hover #f5efdd.
Light text: primary #475b62; secondary-strong/topbar-muted #4b6168; secondary #566c73;
  selected-secondary #475b62; disabled #839496.
Light borders: subtle #e1d9c4; default #d8cfb9; strong #c7bea8.
Light focus/accent #268bd2 (38 139 210); accent-text/action #1f6f9f with #ffffff action foreground.
Light danger #c62d2a with #ffffff foreground; warning #b58900 (181 137 0);
  success #6f8100 (111 129 0); danger RGB 198 45 42.
Light bell #806000 (128 96 0), surface alpha .13, border alpha .38.

Dark surfaces: canvas #002b36; base/muted/control #073642; raised/hover/control-hover #0b414d;
  overlay #12505d.
Dark text: primary/secondary-strong #aab6b6; secondary #93a1a1;
  selected-secondary #aab6b6; disabled #657b83.
Dark borders: subtle #183f49; default #31515a; strong #4b6971.
Dark focus/accent #268bd2 (38 139 210); accent-text #58a6d6; action #2aa198 with #002b36 foreground.
Dark danger #dc322f with #002b36 foreground; warning #b58900 (181 137 0);
  success #859900 (133 153 0); danger RGB 220 50 47.
Dark bell #d6b84a (214 184 74), surface alpha .14, border alpha .38.
```

Use the same exact derived alphas as Task 4. In Dark, keep controls at `#073642` / `#0b414d`; do not use active-tab `#12505d` as the control background because it drops normal control text below 4.5:1.

```text
Light chrome: app/pane/detail #fdf6e3; topbar #ded7c3; border #c7bea8;
  topbar fg #475b62; muted #4b6168; toolbar #eee8d5; toolbar border #d8cfb9;
  tab hover/list hover #f5efdd; active #fdf6e3; sidebar/pane-header #eee8d5;
  card/control #fffdf5; control hover #f5efdd; control border #c7bea8.
  tab/list-row base transparent; selected list bg accent-selection; selected list fg #475b62;
  overlay scrim rgb(0 43 54 / 0.32).
Dark chrome: app/pane/detail #002b36; topbar #001f27; border #31515a;
  topbar fg #aab6b6; muted #93a1a1; toolbar #073642; toolbar border #31515a;
  tab/list hover #0b414d; active #12505d; sidebar/pane-header #073642;
  card/control #073642; control hover #0b414d; control border #4b6971.
  tab/list-row base transparent; selected list bg accent-selection; selected list fg #aab6b6;
  overlay scrim rgb(0 0 0 / 0.52).
Geometry: radius/control .25rem; brand sm .125rem; md .25rem; lg .375rem;
  control height 2rem; density 1; divider strength .9 Light / Dark.
```

Use the design spec's Solarized shadow strings and inset highlights `0.3` / `0.36` Light, `0.06` / `0.08` Dark.

```text
Light core: #fdf6e3; foreground/cursor #475b62; selection rgb(38 139 210 / 0.22).
Dark core: #002b36; foreground/cursor #93a1a1; selection rgb(38 139 210 / 0.28).
Both standard ANSI: #073642 #dc322f #859900 #b58900 #268bd2 #d33682 #2aa198 #eee8d5
Both bright ANSI: #002b36 #cb4b16 #586e75 #657b83 #839496 #6c71c4 #93a1a1 #fdf6e3
Search: #b58900; active #268bd2; active border equals terminal foreground.
```

- [ ] **Step 4: Run Solarized and contract tests and observe GREEN**

Run:

```bash
bun run test -- src/web/theme/theme-presets.test.ts src/web/theme/theme-contract.test.ts
```

Expected: all Catppuccin, Solarized, existing theme, classic terminal, and bell tests pass.

---

### Task 6: Add Tokyo Night Day And Night Test-First

**Files:**

- Modify: `src/web/theme/theme-presets.test.ts`
- Create: `src/web/theme/themes/tokyo-night.css`

- [ ] **Step 1: Add a failing Tokyo Night identity and completeness test**

Add the Tokyo Night manifests and a direct presence/identity test covering canvas, primary text, action, topbar, and `0.375rem` radius. Call `expectChangedThemeManifest('tokyo-night')`, `expectCompletePreset('tokyo-night')`, `expectNewThemeBell('tokyo-night')`, `expectNewThemeVisualManifest('tokyo-night')`, and `expectNewThemeTerminalManifest('tokyo-night')` in this test.

```ts
test('keeps Tokyo Night aligned with Day and Night', () => {
  expectChangedThemeManifest('tokyo-night')
  expectCompletePreset('tokyo-night')
  expectNewThemeBell('tokyo-night')
  expectNewThemeVisualManifest('tokyo-night')
  expectNewThemeTerminalManifest('tokyo-night')

  const css = readThemeCss('tokyo-night')
  const light = selectorBlock(css, 'tokyo-night', 'light')
  const dark = selectorBlock(css, 'tokyo-night', 'dark')
  expect(cssTokenValue(light, '--goblin-surface-canvas')).toBe('#e6e7ed')
  expect(cssTokenValue(light, '--goblin-action-primary')).toBe('#2959aa')
  expect(cssTokenValue(light, '--goblin-control-radius')).toBe('0.375rem')
  expect(cssTokenValue(dark, '--goblin-surface-canvas')).toBe('#1a1b26')
  expect(cssTokenValue(dark, '--goblin-action-primary')).toBe('#7aa2f7')
})
```

- [ ] **Step 2: Run the focused tests and observe RED**

Run:

```bash
bun run test -- src/web/theme/theme-presets.test.ts
```

Expected: `tokyo-night.css` is missing.

- [ ] **Step 3: Create the complete Tokyo Night file**

Copy the unchanged classic terminal root block and use this exact manifest:

```text
Day surfaces: canvas #e6e7ed; base/muted #d8dae4; raised/overlay/control #f2f3f7;
  hover/control-hover #dfe1e8.
Day text: primary #343b58; secondary-strong #3b4261; secondary #40434f;
  selected-secondary #343b58; disabled #8990a3.
Day borders: subtle #c6c9d5; default #b4b8c9; strong #969db1.
Day focus/action/accent/accent-text #2959aa (41 89 170), action foreground #ffffff.
Day danger #8c4351 with #ffffff foreground; warning #8f5e15 (143 94 21);
  success #385f0d (56 95 13); danger RGB 140 67 81.
Day bell #8f5e15 (143 94 21), surface alpha .13, border alpha .38.

Night surfaces: canvas #1a1b26; base/muted/control #24283b; raised/hover/control-hover #2d324a;
  overlay #343b58.
Night text: primary #c0caf5; secondary-strong #a9b1d6; secondary #9aa5ce;
  selected-secondary #a9b1d6; disabled #565f89.
Night borders: subtle #2d324a; default #414868; strong #565f89.
Night focus/action/accent/accent-text #7aa2f7 (122 162 247), action foreground #1a1b26.
Night danger #f7768e with #1a1b26 foreground; warning #e0af68 (224 175 104);
  success #9ece6a (158 206 106); danger RGB 247 118 142.
Night bell #e0af68 (224 175 104), surface alpha .14, border alpha .38.
```

Use the same derived status/accent alpha rules as Tasks 4–5.

```text
Day chrome: app/pane/detail #e6e7ed; topbar #c7cbda; border #adb2c4;
  topbar fg #343b58; muted #40434f; toolbar #d8dae4; toolbar border #b4b8c9;
  tab/list hover #dfe1e8; active #e6e7ed; sidebar/pane-header #d8dae4;
  card/control #f2f3f7; control hover #dfe1e8; control border #969db1.
  tab/list-row base transparent; selected list bg accent-selection; selected list fg #343b58;
  overlay scrim rgb(52 59 88 / 0.40).
Night chrome: app/pane/detail #1a1b26; topbar #16161e; border #414868;
  topbar fg #c0caf5; muted #9aa5ce; toolbar #24283b; toolbar border #414868;
  tab/list hover #2d324a; active #343b58; sidebar/pane-header #24283b;
  card/control #2d324a; control hover #343b58; control border #565f89.
  tab/list-row base transparent; selected list bg accent-selection; selected list fg #c0caf5;
  overlay scrim rgb(0 0 0 / 0.56).
Geometry: radius/control .375rem; brand sm .25rem; md .375rem; lg .5rem;
  control height 2rem; density 1; divider strength .8 Light / .9 Dark.
```

Use the design spec's Tokyo Night shadow strings and inset highlights `0.35` / `0.42` Day, `0.07` / `0.09` Night.

```text
Day core: #e6e7ed; foreground/cursor #343b58; selection rgb(41 89 170 / 0.22).
Day ANSI: #343b58 #8c4351 #385f0d #8f5e15 #2959aa #5a3e8e #0f4b6e #6c6e75
Day bright: #6c6e75 #8c4351 #33635c #965027 #2959aa #5a3e8e #006c86 #343b58
Night core: #1a1b26; foreground/cursor #c0caf5; selection rgb(122 162 247 / 0.28).
Night ANSI: #414868 #f7768e #9ece6a #e0af68 #7aa2f7 #bb9af7 #7dcfff #a9b1d6
Night bright: #565f89 #f7768e #73daca #ff9e64 #7dcfff #bb9af7 #b4f9f8 #c0caf5
Search: warning yellow; active accent; active border terminal foreground.
```

- [ ] **Step 4: Add the reusable changed-theme contrast loop**

For the three new themes, add the exact loop below. Their topbar control aliases use approved fallbacks, so test topbar foreground against the surface-control pair; keep GitHub assertions against its explicit topbar-control tokens.

```ts
test.each(NEW_CLASSIC_THEME_IDS)('keeps %s critical text pairs at 4.5 to 1', (colorTheme) => {
  const css = readThemeCss(colorTheme)
  for (const mode of THEME_MODES) {
    const block = selectorBlock(css, colorTheme, mode)
    expectContrastAtLeast(block, '--goblin-text-primary', '--goblin-surface-canvas')
    expectContrastAtLeast(block, '--goblin-text-secondary', '--goblin-surface-base')
    expectContrastAtLeast(block, '--goblin-topbar-fg', '--goblin-topbar-bg')
    expectContrastAtLeast(block, '--goblin-topbar-muted-fg', '--goblin-topbar-bg')
    expectContrastAtLeast(block, '--goblin-topbar-fg', '--goblin-surface-control')
    expectContrastAtLeast(block, '--goblin-topbar-fg', '--goblin-surface-control-hover')
    expectContrastAtLeast(block, '--goblin-action-primary-foreground', '--goblin-action-primary')
    expectContrastAtLeast(block, '--color-terminal-foreground', '--color-terminal-background')
  }
})
```

- [ ] **Step 5: Run focused tests and observe GREEN**

Run:

```bash
bun run test -- src/web/theme/theme-presets.test.ts src/web/theme/theme-contract.test.ts
bun run typecheck
```

Expected: all three unregistered files are complete, every changed/new critical text pair reaches 4.5:1, every new bell reaches 3:1, and typecheck remains green because no test passes an unregistered literal to a `ColorTheme` API yet.

- [ ] **Step 6: Optional checkpoint commit — explicit confirmation required**

After explicit confirmation, stage only the three new CSS files and their focused test changes, then run:

```bash
git commit -m "feat: add classic developer theme presets"
```

Otherwise continue without committing.


---

### Task 7: Register All Three Presets Atomically Across Existing Consumers

**Files:**

- Modify: `src/shared/color-theme.ts`
- Modify: `src/shared/color-theme.test.ts`
- Modify: `src/web/public/boot.js`
- Modify: `src/web/public/boot.test.ts`
- Modify: `src/web/theme/theme.css`
- Modify: `src/shared/theme-tokens.ts`
- Modify: `src/shared/theme-tokens.test.ts`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/shared/i18n/dictionaries.test.ts`
- Modify: `src/shared/native-shell-projection.test.ts`
- Modify: `src/server/modules/settings-source.test.ts`
- Modify: `src/web/theme/theme-presets.test.ts`
- Modify: `src/web/components/terminal/terminal-theme.test.ts`
- Modify: `src/web/components/SettingsSurface.test.tsx`
- Modify: `src/web/components/repo-toolbar/ProjectThemeMenu.test.tsx`

- [ ] **Step 1: Write failing shared-registry and boot assertions**

Update `color-theme.test.ts` to expect this exact order and validate all three IDs:

```ts
expect(COLOR_THEMES).toEqual([
  'macos',
  'mono',
  'github',
  'claude',
  'cursor',
  'airbnb',
  'bmw',
  'signal',
  'forge',
  'catppuccin',
  'solarized',
  'tokyo-night',
])

for (const theme of ['catppuccin', 'solarized', 'tokyo-night'] as const) {
  expect(isColorTheme(theme)).toBe(true)
  expect(normalizeColorTheme(theme)).toBe(theme)
}
```

In `boot.test.ts`, keep the existing registry-equality test and add:

```ts
test('allows classic presets before React boots', () => {
  expect(readBootColorThemes()).toEqual(
    expect.arrayContaining(['catppuccin', 'solarized', 'tokyo-night']),
  )
})
```

- [ ] **Step 2: Write failing native-background and translation assertions**

Add to `theme-tokens.test.ts`:

```ts
test('uses each classic preset canvas for the native window background', () => {
  expect(WINDOW_BACKGROUND_BY_COLOR_THEME).toMatchObject({
    catppuccin: { light: '#eff1f5', dark: '#1e1e2e' },
    solarized: { light: '#fdf6e3', dark: '#002b36' },
    'tokyo-night': { light: '#e6e7ed', dark: '#1a1b26' },
  })
})
```

Add to `dictionaries.test.ts`:

```ts
test('preserves official classic theme names in every dictionary', () => {
  const expected = {
    'settings.theme-preset.catppuccin': 'Catppuccin',
    'settings.theme-preset.solarized': 'Solarized',
    'settings.theme-preset.tokyo-night': 'Tokyo Night',
  }

  for (const [lang, dict] of Object.entries(dicts)) {
    expect(dict, lang).toMatchObject(expected)
  }
})
```

- [ ] **Step 3: Expand validation-path tests from hand-picked IDs to the registry**

In `native-shell-projection.test.ts` and the global-theme validation test in `settings-source.test.ts`, import `COLOR_THEMES` and iterate it instead of `['claude', 'cursor', 'airbnb', 'bmw']`. Retain invalid, `apple`, and fallback cases.

In the project-theme settings test, add one valid new ID such as `tokyo-night` while keeping invalid-value rejection and bootstrap-trust preservation assertions.

- [ ] **Step 4: Add failing global/project selector tests**

In `ProjectThemeMenu.test.tsx`, first complete the translation mock for all twelve labels; it currently omits even `signal` and `forge`. Assert the exact menu order after “Follow global”, then parameterize new writes:

```ts
test.each([
  ['catppuccin', 'Catppuccin'],
  ['solarized', 'Solarized'],
  ['tokyo-night', 'Tokyo Night'],
] as const)('writes %s project theme', async (colorTheme, label) => {
  await render(<ProjectThemeMenu repoId="/repo-a" projectColorTheme={null} />)
  await act(async () => {
    openProjectThemeMenu()
    await Promise.resolve()
  })
  await act(async () => {
    Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitemradio"]'))
      .find((item) => item.textContent?.includes(label))
      ?.click()
    await Promise.resolve()
  })
  expect(writeMocks.setProjectColorThemePreference).toHaveBeenCalledWith('/repo-a', colorTheme)
})
```

In `SettingsSurface.test.tsx`, render the general page and open `#settings-theme-preset`. This harness intentionally boots with `initialI18n: null`, so assert the twelve derived translation keys in registry order rather than official English labels. Choose the option whose text is `settings.theme-preset.tokyo-night`, then assert a `/api/settings/prefs` request whose parsed body has `settings.colorTheme === 'tokyo-night'`. `dictionaries.test.ts` and `ProjectThemeMenu.test.tsx` separately prove the official labels; do not change this broad harness's i18n setup.

Also add the synchronized-terminal runtime test in `terminal-theme.test.ts` now, in the same task that expands `ColorTheme`. Import `terminalSearchDecorationsForCurrentDocument` alongside the existing theme reader and use the actual API fields:

```ts
test.each([
  ['catppuccin', 'light', '#eff1f5', '#4c4f69', 'rgb(136 57 239 / 0.24)', '#1e66f5', '#ea76cb', '#df8e1d', '#8839ef'],
  ['catppuccin', 'dark', '#1e1e2e', '#cdd6f4', 'rgb(203 166 247 / 0.28)', '#89b4fa', '#f5c2e7', '#f9e2af', '#cba6f7'],
  ['solarized', 'light', '#fdf6e3', '#475b62', 'rgb(38 139 210 / 0.22)', '#268bd2', '#6c71c4', '#b58900', '#268bd2'],
  ['solarized', 'dark', '#002b36', '#93a1a1', 'rgb(38 139 210 / 0.28)', '#268bd2', '#6c71c4', '#b58900', '#268bd2'],
  ['tokyo-night', 'light', '#e6e7ed', '#343b58', 'rgb(41 89 170 / 0.22)', '#2959aa', '#5a3e8e', '#8f5e15', '#2959aa'],
  ['tokyo-night', 'dark', '#1a1b26', '#c0caf5', 'rgb(122 162 247 / 0.28)', '#7aa2f7', '#bb9af7', '#e0af68', '#7aa2f7'],
] as const)(
  'reads %s/%s synchronized terminal tokens',
  (colorTheme, mode, background, foreground, selectionBackground, blue, brightMagenta, searchMatch, searchActive) => {
    installRealTerminalPresetStyles(colorTheme)
    document.documentElement.dataset.theme = mode
    document.documentElement.dataset.colorTheme = colorTheme

    const terminal = terminalThemeForCurrentDocument()
    expect(terminal).toMatchObject({
      background,
      foreground,
      cursor: foreground,
      blue,
      brightMagenta,
    })
    expect(String(terminal.selectionBackground).replace(/\s*\/\s*/g, '/')).toBe(
      selectionBackground.replace(/\s*\/\s*/g, '/'),
    )
    expect(terminalSearchDecorationsForCurrentDocument()).toMatchObject({
      matchBackground: searchMatch,
      activeMatchBackground: searchActive,
      activeMatchBorder: foreground,
    })
  },
)
```

Do not add this test in Task 6: `installRealTerminalPresetStyles()` accepts `ColorTheme`, so it becomes type-correct only after the registry implementation in this task.

- [ ] **Step 5: Run the focused tests and observe RED**

Run:

```bash
bun run test -- src/shared/color-theme.test.ts src/web/public/boot.test.ts src/shared/theme-tokens.test.ts src/shared/i18n/dictionaries.test.ts src/shared/native-shell-projection.test.ts src/server/modules/settings-source.test.ts src/web/components/SettingsSurface.test.tsx src/web/components/repo-toolbar/ProjectThemeMenu.test.tsx
```

Expected: new IDs, mappings, translations, and menu entries are not yet registered.

- [ ] **Step 6: Expand the canonical registry and first-paint allowlist**

In `color-theme.ts`:

```ts
export const COLOR_THEMES = [
  'macos',
  'mono',
  'github',
  'claude',
  'cursor',
  'airbnb',
  'bmw',
  'signal',
  'forge',
  'catppuccin',
  'solarized',
  'tokyo-night',
] as const
```

Keep the rest of the module unchanged. Mirror the same values and order in `boot.js`:

```js
var colorThemes = [
  'macos',
  'mono',
  'github',
  'claude',
  'cursor',
  'airbnb',
  'bmw',
  'signal',
  'forge',
  'catppuccin',
  'solarized',
  'tokyo-night',
]
```

Do not modernize `boot.js`; it deliberately runs before the application bundle.

- [ ] **Step 7: Import CSS and add exhaustive native mappings**

Append to `theme.css` after Forge:

```css
@import './themes/catppuccin.css';
@import './themes/solarized.css';
@import './themes/tokyo-night.css';
```

Append to `WINDOW_BACKGROUND_BY_COLOR_THEME`:

```ts
catppuccin: {
  light: '#eff1f5',
  dark: '#1e1e2e',
},
solarized: {
  light: '#fdf6e3',
  dark: '#002b36',
},
'tokyo-night': {
  light: '#e6e7ed',
  dark: '#1a1b26',
},
```

These values are global native canvas mappings only. Do not change `window-shell.ts`, `window-chrome.ts`, RPC, or project-theme state.

- [ ] **Step 8: Add all four locale keys in one edit**

Add the following exact names to `en.ts`, `zh.ts`, `ja.ts`, and `ko.ts` beside the existing preset labels:

```ts
'settings.theme-preset.catppuccin': 'Catppuccin',
'settings.theme-preset.solarized': 'Solarized',
'settings.theme-preset.tokyo-night': 'Tokyo Night',
```

All four dictionaries must change together because non-English dictionaries are exhaustive over English `DictKey`.

- [ ] **Step 9: Complete exhaustive test-only maps in the same atomic edit**

Now that `ColorTheme` includes the new IDs, append the accessible values from “Test Helpers And Exact Preset Manifests” to `BELL_COLOR_EXPECTATIONS`. Ensure `TOPBAR_BRAND_TINT_EXPECTATIONS` contains the three exact new-theme entries and the repainted GitHub entry.

Add a generic completeness test for the three new CSS files:

```ts
test('defines complete light and dark blocks for the classic presets', () => {
  for (const colorTheme of NEW_CLASSIC_THEME_IDS) {
    const css = readThemeCss(colorTheme)
    for (const mode of THEME_MODES) {
      const block = selectorBlock(css, colorTheme, mode)
      for (const token of [...FOUNDATION_TOKENS, ...APP_REGION_TOKENS, ...TERMINAL_TOKENS]) {
        expect(block, `${colorTheme}/${mode} defines ${token}`).toContain(token)
      }
    }
  }
})
```

This preserves the strengthened explicit-bell contract instead of weakening or deleting concurrent tests.

- [ ] **Step 10: Run registry, selector, and full theme tests and observe GREEN**

Run:

```bash
bun run test -- src/shared/color-theme.test.ts src/web/public/boot.test.ts src/shared/theme-tokens.test.ts src/shared/i18n/dictionaries.test.ts src/shared/native-shell-projection.test.ts src/server/modules/settings-source.test.ts src/web/theme/theme-contract.test.ts src/web/theme/theme-presets.test.ts src/web/components/terminal/terminal-theme.test.ts src/web/components/SettingsSurface.test.tsx src/web/components/repo-toolbar/ProjectThemeMenu.test.tsx
bun run typecheck
```

Expected: all focused tests pass, TypeScript sees exhaustive mappings for twelve themes, and no production selector component required structural changes.

- [ ] **Step 11: Optional checkpoint commit — explicit confirmation required**

After explicit confirmation, stage only registry/consumer/test files from this task and run:

```bash
git commit -m "feat: register classic theme presets"
```

Otherwise leave verified changes uncommitted.

---

### Task 8: Run Integration Gates And Visual Acceptance

**Files:**

- Verify: all files in this plan
- Verify unchanged: `src/web/theme/themes/macos.css` palette values
- Verify unchanged production structure: settings, persistence, native-shell, and terminal consumers not listed for modification

- [ ] **Step 1: Audit the final diff for scope and accidental overwrite**

Run:

```bash
git status --short
git diff --check
git diff --stat
git diff -- src/web/theme/themes/macos.css
```

Expected:

- no whitespace errors;
- no unrelated files staged or modified by this feature;
- macOS palette values remain unchanged;
- the concurrent unread-bell changes for all original nine themes remain present;
- the only new runtime files are the three approved preset CSS files.

- [ ] **Step 2: Run the complete focused regression set**

Run:

```bash
bun run test -- src/shared/color-theme.test.ts src/web/public/boot.test.ts src/shared/theme-tokens.test.ts src/shared/i18n/dictionaries.test.ts src/shared/native-shell-projection.test.ts src/server/modules/settings-source.test.ts src/web/theme/theme-contract.test.ts src/web/theme/theme-presets.test.ts src/web/components/terminal/terminal-theme.test.ts src/web/components/repo-tabs/RepoTabStrip.test.tsx src/web/components/Topbar.test.tsx src/web/components/SettingsPageScreen.test.tsx src/web/components/repo-toolbar/RepoToolbar.test.tsx src/web/components/repo-activity/RepoActivityControl.component.test.tsx src/web/components/SettingsSurface.test.tsx src/web/components/repo-toolbar/ProjectThemeMenu.test.tsx
```

Expected: every focused suite passes with no snapshots silently regenerated.

- [ ] **Step 3: Run mandatory repository gates**

Run each command separately so a failure is attributable:

```bash
bun run typecheck
bun run test
bun run check:architecture
```

Expected: exit code `0` for all three commands. Do not claim completion from a partial or stale run.

- [ ] **Step 4: Verify static architecture invariants**

Run:

```bash
rg -n "data-color-theme.*(github|catppuccin|solarized|tokyo-night)|colorTheme\s*===|switch\s*\(.*colorTheme" src/web/components src/web/stores src/main src/server
rg -n "@import './themes/(catppuccin|solarized|tokyo-night)\.css'" src/web/theme/theme.css
```

Expected:

- no new component/store/main/server branch keyed to a concrete new theme ID;
- exactly one import for each new CSS file;
- no new dependency, store, schema, IPC channel, or re-export shim.

- [ ] **Step 5: Perform manual Light/Dark visual verification**

Start the existing development app using the repository's documented command. In both Light and Dark appearances, verify:

1. Global settings show exactly twelve presets in registry order with official labels.
2. Project theme menu shows the same twelve presets plus “Follow global”.
3. GitHub and macOS are distinguishable at thumbnail scale; GitHub Light has a charcoal topbar and green primary action, while macOS retains cool-blue chrome and blue action.
4. GitHub topbar title, inactive tabs/icons/close buttons, active tab/close button, branch selector, settings button, outline controls, hover states, and separators are readable.
5. Settings-page title remains readable on the GitHub topbar.
6. Catppuccin Latte/Mocha, Solarized Light/Dark, and Tokyo Night Day/Night each show their approved identity across file tree, branch list, changes, history, detail, ports, dialogs, menus, popovers, and toasts.
7. Theme-synchronized terminals update background, foreground, cursor, selection, ANSI, search, activity, and bell colors immediately.
8. Classic terminal mode remains visually unchanged across preset switches.
9. Global theme startup uses the selected preset without flashing macOS, and the Electron canvas matches the global preset.
10. A per-project override updates renderer and terminal colors but does not change native Electron canvas/titlebar state.

Record any visual defect with preset, appearance, surface, and screenshot before changing tokens. Any token correction must add or update a focused assertion first.

- [ ] **Step 6: Re-run gates after any visual correction**

If manual QA caused any edit, repeat Steps 1–3 in full. Expected: clean diff check and all mandatory gates pass on the final content.

- [ ] **Step 7: Optional final commit — explicit confirmation required**

If checkpoint commits were skipped and the user now explicitly confirms committing the finished feature, review `git status --short`, stage only files listed in this plan, and run:

```bash
git commit -m "feat: distinguish themes and add classic presets"
```

If the user does not explicitly confirm, do not stage or commit anything.

## Completion Criteria

- Twelve presets are available globally and per project in the approved order.
- macOS remains the default and its runtime palette is unchanged.
- GitHub uses the approved Primer Header chrome and green action color in both appearances.
- Catppuccin, Solarized, and Tokyo Night have complete Light/Dark application and terminal tokens.
- All twelve themes have exact global native canvas mappings.
- Critical changed/new text pairs pass 4.5:1 and explicit unread-bell colors pass 3:1 on every tested host surface.
- Active and inactive repo-tab semantics remain readable without global muted remapping.
- Invalid values and legacy `apple` still normalize to macOS.
- No React theme-ID branch, dependency, generated pipeline, new schema, or new IPC path is introduced.
- `bun run typecheck`, `bun run test`, and `bun run check:architecture` pass on the final tree.
