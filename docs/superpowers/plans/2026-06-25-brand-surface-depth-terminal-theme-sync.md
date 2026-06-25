# Brand Surface Depth Terminal Theme Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make brand themes visibly style topbar, toolbars, workspace section bars, all input/search controls, and embedded terminal, with a General setting that lets users keep xterm on a classic palette.

**Architecture:** Extend the existing server-owned settings model with `terminalThemeSyncEnabled`, then pass that setting into terminal theme resolution. Expand CSS token coverage and shared primitive usage so components consume semantic variables rather than branching on `colorTheme`.

**Tech Stack:** TypeScript strip-only mode, React 19, Zustand, TanStack Query, Tailwind v4 CSS tokens, Vitest/jsdom, xterm 6.

**Project Constraints:** Do not use TypeScript enums, parameter properties, namespaces with runtime code, or import aliases. Use repo-alias imports with explicit `.ts`/`.tsx` extensions. Do not plan or execute git commits or branch operations unless explicitly requested by the user.

---

## File Structure

### Settings Model

- Modify `src/shared/settings.ts`: add `terminalThemeSyncEnabled` to `SettingsPrefs`.
- Modify `src/shared/settings-defaults.ts`: add default constant and include the field in defaults/bootstrap snapshots.
- Modify `src/server/modules/settings-source.ts`: normalize, persist, and patch the new setting.
- Modify `src/shared/settings-snapshot.ts`: include the field in runtime snapshots.
- Modify `src/web/settings-read-projection.ts`: expose the field through `readRuntimeGeneralSettings()` and terminal settings where useful.
- Modify `src/web/settings-client.ts`: add `setTerminalThemeSyncEnabled()`.
- Modify `src/web/settings-write-paths.ts`: add `setTerminalThemeSyncEnabledPreference()`.
- Modify `src/web/runtime-settings-general.ts`: add controller method.

### Settings UI And Copy

- Modify `src/web/components/settings/pages/GeneralSettings.tsx`: add a General switch.
- Modify `src/shared/i18n/en.ts`, `src/shared/i18n/zh.ts`, `src/shared/i18n/ko.ts`, `src/shared/i18n/ja.ts`: add label and hint keys.

### Terminal Theme Resolution

- Modify `src/web/components/terminal/terminal-theme.ts`: add `TerminalThemeMode`, classic token reads, and mode-aware theme/search decoration functions.
- Modify `src/web/components/terminal/terminal-theme-test-utils.ts`: add classic token fixtures.
- Create `src/web/components/terminal/terminal-theme.test.ts`: unit-test themed/classic resolution.
- Modify `src/web/components/terminal/terminal-session-view.ts`: accept a theme mode getter and use it for initial theme, observer refreshes, and search decorations.
- Modify `src/web/components/terminal/ManagedTerminalSession.ts`: pass the terminal theme mode into `TerminalSessionView`.
- Modify `src/web/components/terminal/TerminalSessionRegistry.ts`: update existing sessions when runtime terminal theme sync changes.
- Modify `src/web/components/terminal/TerminalSessionProvider.tsx`: read runtime setting and wire it to the registry.

### Theme Tokens And Surfaces

- Modify `src/web/theme/contract.css`: map new toolbar/input aliases.
- Modify `src/web/theme/themes/macos.css`, `mono.css`, `github.css`, `claude.css`, `cursor.css`, `airbnb.css`, `bmw.css`: define new app-region and classic terminal tokens.
- Modify `src/web/components/Layout.tsx`: make `Toolbar` use toolbar/pane-header tokens.
- Modify `src/web/components/ui/input.tsx`: use input-specific token aliases.
- Modify `src/web/components/terminal/terminal-session.css`: make floating terminal search consume input/toolbar tokens.
- Modify targeted workspace components only if shared primitives do not cover them.

### Tests

- Modify `src/server/modules/settings-source.test.ts`.
- Modify `src/shared/settings-snapshot.test.ts`.
- Modify `src/web/runtime-settings-hooks.test.tsx`.
- Modify `src/web/components/SettingsSurface.test.tsx`.
- Modify `src/shared/theme-tokens.test.ts`.
- Keep `src/web/theme/hardcoded-colors.test.ts` green.

---

## Task 1: Add The Persisted Terminal Theme Sync Setting

**Files:**
- Modify: `src/shared/settings.ts`
- Modify: `src/shared/settings-defaults.ts`
- Modify: `src/server/modules/settings-source.ts`
- Modify: `src/shared/settings-snapshot.ts`
- Test: `src/server/modules/settings-source.test.ts`
- Test: `src/shared/settings-snapshot.test.ts`

- [ ] **Step 1: Write failing server settings tests**

In `src/server/modules/settings-source.test.ts`, update the first test's default expectation:

```ts
expect(await mod.getServerSettingsPrefs()).toMatchObject({
  lang: 'auto',
  theme: 'auto',
  colorTheme: 'macos',
  terminalNotificationsEnabled: false,
  shortcutsDisabled: false,
  globalShortcutDisabled: false,
  swapCloseShortcuts: false,
  toggleDetailOnActionBarBlankClick: false,
  terminalThemeSyncEnabled: true,
  temporaryFilesDirectory: '',
  globalShortcut: 'Alt+G',
  terminalApp: 'auto',
  editorApp: 'auto',
  fileTreeFontSize: 14,
  fileTreeTopbarFontSize: 13,
  terminalFontSize: 14,
  terminalExternalInputEnabled: false,
  remoteTerminalTmuxEnabled: false,
  terminalCustomButtonsVisible: true,
  terminalCustomButtonSize: 'medium',
  terminalCustomButtons: [],
  lanEnabled: false,
})
```

In the persistence test, include the field in the write:

```ts
await mod.updateServerSettingsPrefs({
  lang: 'ko',
  theme: 'dark',
  colorTheme: 'github',
  terminalNotificationsEnabled: true,
  shortcutsDisabled: true,
  globalShortcutDisabled: true,
  swapCloseShortcuts: true,
  toggleDetailOnActionBarBlankClick: true,
  terminalThemeSyncEnabled: false,
  temporaryFilesDirectory: path.join(tmp, 'terminal-paste'),
  globalShortcut: 'CommandOrControl+Alt+G',
  terminalApp: 'ghostty',
  editorApp: 'cursor',
  fileTreeFontSize: 13.4,
  fileTreeTopbarFontSize: 12.2,
  terminalFontSize: 15.6,
  terminalExternalInputEnabled: true,
  remoteTerminalTmuxEnabled: true,
  terminalCustomButtonsVisible: false,
  terminalCustomButtonSize: 'large',
  terminalCustomButtons: [
    { label: ' status ', value: ' git status --short\n', action: 'input' },
    { label: '', value: 'ignored', action: 'execute' },
    { label: 'empty', value: '   ', action: 'input' },
    { label: 'test', value: 'bun run test', action: 'bad-value' as never },
  ],
  lanEnabled: false,
} as Parameters<typeof mod.updateServerSettingsPrefs>[0] & { terminalCustomButtonSize: string })
```

And expect it after reload:

```ts
expect(await reloaded.getServerSettingsPrefs()).toMatchObject({
  lang: 'ko',
  theme: 'dark',
  colorTheme: 'github',
  terminalNotificationsEnabled: true,
  shortcutsDisabled: true,
  globalShortcutDisabled: true,
  swapCloseShortcuts: true,
  toggleDetailOnActionBarBlankClick: true,
  terminalThemeSyncEnabled: false,
  temporaryFilesDirectory: path.join(tmp, 'terminal-paste'),
  globalShortcut: 'Alt+G',
  terminalApp: 'ghostty',
  editorApp: 'cursor',
  fileTreeFontSize: 13,
  fileTreeTopbarFontSize: 12,
  terminalFontSize: 16,
  terminalExternalInputEnabled: true,
  remoteTerminalTmuxEnabled: true,
  terminalCustomButtonsVisible: false,
  terminalCustomButtonSize: 'large',
  terminalCustomButtons: [
    { label: 'status', value: ' git status --short\n', action: 'input' },
    { label: 'test', value: 'bun run test', action: 'execute' },
  ],
  lanEnabled: false,
})
```

Add an invalid-value normalization test:

```ts
test('normalizes missing and invalid terminal theme sync values to enabled', async () => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'gbl-server-settings-'))
  previousDataDir = process.env.GOBLIN_SERVER_DATA_DIR
  process.env.GOBLIN_SERVER_DATA_DIR = tmp

  const mod = await import('#/server/modules/settings-source.ts')
  await mod.updateServerSettingsPrefs({ terminalThemeSyncEnabled: 'bad-value' as never })

  expect(await mod.getServerSettingsPrefs()).toMatchObject({
    terminalThemeSyncEnabled: true,
  })
})
```

- [ ] **Step 2: Write failing snapshot tests**

In `src/shared/settings-snapshot.test.ts`, add `terminalThemeSyncEnabled` to the first `prefs` object and expected snapshot:

```ts
terminalThemeSyncEnabled: false,
```

Add it to the `buildSettingsSnapshot()` prefs in the third test:

```ts
terminalThemeSyncEnabled: true,
```

And assert it survives the runtime projection:

```ts
expect(runtimeSettingsSnapshotFromSettingsSnapshot(snapshot)).toMatchObject({
  globalShortcutRegistered: false,
  temporaryFilesDirectory: '',
  terminalThemeSyncEnabled: true,
  terminalExternalInputEnabled: false,
  remoteTerminalTmuxEnabled: false,
  fileTreeTopbarFontSize: 13,
  terminalCustomButtonsVisible: true,
  terminalCustomButtonSize: 'medium',
  terminalCustomButtons: [{ label: 'status', value: 'git status --short', action: 'execute' }],
})
```

- [ ] **Step 3: Run failing tests**

Run:

```bash
bun run test src/server/modules/settings-source.test.ts src/shared/settings-snapshot.test.ts
```

Expected: FAIL because `terminalThemeSyncEnabled` is not yet in `SettingsPrefs` or settings normalization.

- [ ] **Step 4: Implement shared setting types and defaults**

In `src/shared/settings.ts`, add the field:

```ts
export interface SettingsPrefs {
  theme: ThemePref
  colorTheme: ColorTheme
  lang: LangPref
  fetchIntervalSec: number
  terminalNotificationsEnabled: boolean
  shortcutsDisabled: boolean
  globalShortcutDisabled: boolean
  swapCloseShortcuts: boolean
  toggleDetailOnActionBarBlankClick: boolean
  terminalThemeSyncEnabled: boolean
  temporaryFilesDirectory: string
  globalShortcut: string
  terminalApp: TerminalPref
  editorApp: EditorPref
  fileTreeFontSize: number
  fileTreeTopbarFontSize: number
  terminalFontSize: number
  terminalExternalInputEnabled: boolean
  remoteTerminalTmuxEnabled: boolean
  terminalCustomButtonsVisible: boolean
  terminalCustomButtonSize: TerminalCustomButtonSize
  terminalCustomButtons: TerminalCustomButton[]
  lanEnabled: boolean
}
```

In `src/shared/settings-defaults.ts`, add:

```ts
export const DEFAULT_TERMINAL_THEME_SYNC_ENABLED = true
```

Include it in `defaultSettingsPrefs()`:

```ts
terminalThemeSyncEnabled:
  overrides.terminalThemeSyncEnabled ?? DEFAULT_TERMINAL_THEME_SYNC_ENABLED,
```

Include it in `initialSettingsFromSnapshot()` input type and returned object:

```ts
| 'terminalThemeSyncEnabled'
```

```ts
terminalThemeSyncEnabled: snapshot.terminalThemeSyncEnabled,
```

- [ ] **Step 5: Implement server normalization and patching**

In `src/server/modules/settings-source.ts`, import the default:

```ts
DEFAULT_TERMINAL_THEME_SYNC_ENABLED,
```

Add to `ServerSettingsData`:

```ts
terminalThemeSyncEnabled: boolean
```

Add a normalizer:

```ts
function normalizeTerminalThemeSyncEnabled(value: unknown): boolean {
  return typeof value === 'boolean' ? value : DEFAULT_TERMINAL_THEME_SYNC_ENABLED
}
```

Add to `settingsPrefsFromData()`:

```ts
terminalThemeSyncEnabled: data.terminalThemeSyncEnabled,
```

Add to `readServerSettingsFile()`:

```ts
terminalThemeSyncEnabled: normalizeTerminalThemeSyncEnabled(parsed.terminalThemeSyncEnabled),
```

Add to `updateServerSettingsPrefs()` after `nextToggleDetailOnActionBarBlankClick`:

```ts
const nextTerminalThemeSyncEnabled =
  patch.terminalThemeSyncEnabled === undefined
    ? data.terminalThemeSyncEnabled
    : normalizeTerminalThemeSyncEnabled(patch.terminalThemeSyncEnabled)
```

Include it in `changed`:

```ts
data.terminalThemeSyncEnabled !== nextTerminalThemeSyncEnabled ||
```

Assign it:

```ts
data.terminalThemeSyncEnabled = nextTerminalThemeSyncEnabled
```

- [ ] **Step 6: Implement runtime snapshot projection**

In `src/shared/settings-snapshot.ts`, add to `buildRuntimeSettingsSnapshot()`:

```ts
terminalThemeSyncEnabled: input.prefs.terminalThemeSyncEnabled,
```

Add to the `Pick<SettingsSnapshot, ...>` union in `runtimeSettingsSnapshotFromSettingsSnapshot()`:

```ts
| 'terminalThemeSyncEnabled'
```

Return it:

```ts
terminalThemeSyncEnabled: snapshot.terminalThemeSyncEnabled,
```

- [ ] **Step 7: Run tests again**

Run:

```bash
bun run test src/server/modules/settings-source.test.ts src/shared/settings-snapshot.test.ts
```

Expected: PASS.

---

## Task 2: Expose The Setting In Runtime Hooks And General Settings UI

**Files:**
- Modify: `src/web/settings-read-projection.ts`
- Modify: `src/web/settings-client.ts`
- Modify: `src/web/settings-write-paths.ts`
- Modify: `src/web/runtime-settings-general.ts`
- Modify: `src/web/components/settings/pages/GeneralSettings.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/shared/i18n/ja.ts`
- Test: `src/web/runtime-settings-hooks.test.tsx`
- Test: `src/web/components/SettingsSurface.test.tsx`
- Test: `src/shared/i18n/dictionaries.test.ts`

- [ ] **Step 1: Write failing runtime hook test**

In `src/web/runtime-settings-hooks.test.tsx`, update the general settings test setup:

```ts
defaultSettingsSnapshot({
  toggleDetailOnActionBarBlankClick: true,
  terminalThemeSyncEnabled: false,
}),
```

Update expected result:

```ts
expect(result).toMatchObject({
  toggleDetailOnActionBarBlankClick: true,
  terminalThemeSyncEnabled: false,
})
```

- [ ] **Step 2: Write failing Settings UI test**

In `src/web/components/SettingsSurface.test.tsx`, update `defaultRpcResult('settings.get')` to include:

```ts
terminalThemeSyncEnabled: true,
```

Add a test near the temporary files directory test:

```ts
test('updates terminal theme sync from general settings', async () => {
  await render(<SettingsSurface page="general" onPageChange={() => {}} />)

  const input = document.getElementById('settings-terminal-theme-sync')
  if (!(input instanceof HTMLButtonElement)) throw new Error('Missing terminal theme sync switch')

  await act(async () => {
    input.click()
    await Promise.resolve()
  })

  expect(
    fetchMock.mock.calls.some((call) => {
      const [url, options] = call as unknown as [unknown, RequestInit | undefined]
      if (new URL(String(url)).pathname !== '/api/settings/prefs') return false
      const body = JSON.parse(String(options?.body ?? '{}')) as { settings?: Record<string, unknown> }
      return body.settings?.terminalThemeSyncEnabled === false
    }),
  ).toBe(true)
})
```

- [ ] **Step 3: Run failing tests**

Run:

```bash
bun run test src/web/runtime-settings-hooks.test.tsx src/web/components/SettingsSurface.test.tsx
```

Expected: FAIL because runtime projections and UI do not expose the setting.

- [ ] **Step 4: Implement runtime read projection**

In `src/web/settings-read-projection.ts`, update `readRuntimeGeneralSettings()`:

```ts
export function readRuntimeGeneralSettings(data: RuntimeSettingsSnapshot | undefined) {
  const fallback = fallbackInitialSettings()
  return {
    toggleDetailOnActionBarBlankClick:
      data?.toggleDetailOnActionBarBlankClick ?? fallback?.toggleDetailOnActionBarBlankClick ?? false,
    terminalThemeSyncEnabled:
      data?.terminalThemeSyncEnabled ?? fallback?.terminalThemeSyncEnabled ?? true,
    temporaryFilesDirectory: data?.temporaryFilesDirectory ?? fallback?.temporaryFilesDirectory ?? '',
  }
}
```

Also update `readRuntimeTerminalSettings()` with the same field so terminal code can use the terminal settings hook:

```ts
terminalThemeSyncEnabled:
  data?.terminalThemeSyncEnabled ?? fallback?.terminalThemeSyncEnabled ?? true,
```

- [ ] **Step 5: Implement settings client write path**

In `src/web/settings-client.ts`, add:

```ts
export async function setTerminalThemeSyncEnabled(enabled: boolean): Promise<void> {
  await updateSettingsPrefsPatch({ terminalThemeSyncEnabled: enabled })
}
```

In `src/web/settings-write-paths.ts`, import it:

```ts
setTerminalThemeSyncEnabled,
```

Add:

```ts
export async function setTerminalThemeSyncEnabledPreference(enabled: boolean): Promise<void> {
  await setTerminalThemeSyncEnabled(enabled)
  updateRuntimeSettingsSnapshotCache(mainWindowQueryClient, (current) => ({
    ...current,
    terminalThemeSyncEnabled: enabled,
  }))
}
```

In `src/web/runtime-settings-general.ts`, import the preference writer and expose a controller method:

```ts
setTerminalThemeSyncEnabledPreference,
```

```ts
async setTerminalThemeSyncEnabled(enabled: boolean): Promise<void> {
  await runSettingsControllerAction('terminal theme sync update', async () => {
    await setTerminalThemeSyncEnabledPreference(enabled)
  })
},
```

- [ ] **Step 6: Add General Settings UI control**

In `src/web/components/settings/pages/GeneralSettings.tsx`, read the setting:

```ts
const { toggleDetailOnActionBarBlankClick, terminalThemeSyncEnabled, temporaryFilesDirectory } =
  useRuntimeGeneralSettings()
const {
  setToggleDetailOnActionBarBlankClick,
  setTerminalThemeSyncEnabled,
  setTemporaryFilesDirectory,
} = useGeneralSettingsController()
```

Add the switch after appearance or before the action-bar setting:

```tsx
<SettingsRow
  controlId="settings-terminal-theme-sync"
  label={t('settings.terminal-theme-sync')}
  hint={t('settings.terminal-theme-sync-hint')}
  control={
    <Switch
      id="settings-terminal-theme-sync"
      checked={terminalThemeSyncEnabled}
      onCheckedChange={(enabled) => void setTerminalThemeSyncEnabled(enabled)}
      aria-label={t('settings.terminal-theme-sync')}
    />
  }
/>
```

- [ ] **Step 7: Add i18n keys**

In `src/shared/i18n/en.ts`:

```ts
'settings.terminal-theme-sync': 'Terminal follows theme',
'settings.terminal-theme-sync-hint':
  'When enabled, the embedded terminal uses the selected app theme. Turn it off to keep a classic terminal palette.',
```

In `src/shared/i18n/zh.ts`:

```ts
'settings.terminal-theme-sync': '终端跟随主题',
'settings.terminal-theme-sync-hint': '开启后，应用内终端使用当前应用主题；关闭后保留经典终端配色。',
```

In `src/shared/i18n/ko.ts`:

```ts
'settings.terminal-theme-sync': '터미널이 테마 따르기',
'settings.terminal-theme-sync-hint':
  '켜면 내장 터미널이 선택한 앱 테마를 사용합니다. 끄면 클래식 터미널 팔레트를 유지합니다.',
```

In `src/shared/i18n/ja.ts`:

```ts
'settings.terminal-theme-sync': 'ターミナルをテーマに合わせる',
'settings.terminal-theme-sync-hint':
  'オンにすると内蔵ターミナルが選択中のアプリテーマを使用します。オフにすると従来のターミナル配色を維持します。',
```

- [ ] **Step 8: Run tests again**

Run:

```bash
bun run test src/web/runtime-settings-hooks.test.tsx src/web/components/SettingsSurface.test.tsx src/shared/i18n/dictionaries.test.ts
```

Expected: PASS.

---

## Task 3: Add Mode-Aware Terminal Theme Resolution

**Files:**
- Modify: `src/web/components/terminal/terminal-theme.ts`
- Modify: `src/web/components/terminal/terminal-theme-test-utils.ts`
- Create: `src/web/components/terminal/terminal-theme.test.ts`

- [ ] **Step 1: Add classic token fixtures**

In `src/web/components/terminal/terminal-theme-test-utils.ts`, append classic tokens to both light and dark fixture blocks:

```css
--color-terminal-classic-background: #050505;
--color-terminal-classic-foreground: #f5f5f5;
--color-terminal-classic-cursor: #f5f5f5;
--color-terminal-classic-selection-background: rgba(255, 255, 255, 0.24);
--color-terminal-classic-ansi-black: #000000;
--color-terminal-classic-ansi-red: #ff5f56;
--color-terminal-classic-ansi-green: #27c93f;
--color-terminal-classic-ansi-yellow: #ffbd2e;
--color-terminal-classic-ansi-blue: #5ac8fa;
--color-terminal-classic-ansi-magenta: #bf5af2;
--color-terminal-classic-ansi-cyan: #64d2ff;
--color-terminal-classic-ansi-white: #d1d1d1;
--color-terminal-classic-ansi-bright-black: #808080;
--color-terminal-classic-ansi-bright-red: #ff6b65;
--color-terminal-classic-ansi-bright-green: #32d74b;
--color-terminal-classic-ansi-bright-yellow: #ffd60a;
--color-terminal-classic-ansi-bright-blue: #70d7ff;
--color-terminal-classic-ansi-bright-magenta: #da8fff;
--color-terminal-classic-ansi-bright-cyan: #70d7ff;
--color-terminal-classic-ansi-bright-white: #ffffff;
--color-terminal-classic-search-match: #ffd60a;
--color-terminal-classic-search-active-match: #ff9f0a;
--color-terminal-classic-search-active-border: #ffffff;
```

- [ ] **Step 2: Create failing terminal theme tests**

Create `src/web/components/terminal/terminal-theme.test.ts`:

```ts
// @vitest-environment jsdom

import { afterEach, describe, expect, test } from 'vitest'
import { installTerminalThemeStyles } from '#/web/components/terminal/terminal-theme-test-utils.ts'
import {
  terminalSearchDecorationsForCurrentDocument,
  terminalThemeForCurrentDocument,
} from '#/web/components/terminal/terminal-theme.ts'

afterEach(() => {
  document.getElementById('terminal-theme-test-styles')?.remove()
  document.documentElement.removeAttribute('data-theme')
})

describe('terminal theme tokens', () => {
  test('reads themed terminal tokens by default', () => {
    installTerminalThemeStyles()
    document.documentElement.setAttribute('data-theme', 'light')

    expect(terminalThemeForCurrentDocument()).toMatchObject({
      background: '#fbfbfd',
      foreground: '#1d1d1f',
      cursor: '#1d1d1f',
      blue: '#0066cc',
    })
  })

  test('reads classic terminal tokens when sync is disabled', () => {
    installTerminalThemeStyles()
    document.documentElement.setAttribute('data-theme', 'light')

    expect(terminalThemeForCurrentDocument('classic')).toMatchObject({
      background: '#050505',
      foreground: '#f5f5f5',
      cursor: '#f5f5f5',
      blue: '#5ac8fa',
    })
  })

  test('falls back to themed tokens when a classic token is missing', () => {
    installTerminalThemeStyles()
    document.documentElement.setAttribute('data-theme', 'light')
    document.documentElement.style.setProperty('--color-terminal-classic-ansi-blue', '')

    expect(terminalThemeForCurrentDocument('classic')).toMatchObject({
      blue: '#0066cc',
    })
  })

  test('reads matching search decorations for each mode', () => {
    installTerminalThemeStyles()
    document.documentElement.setAttribute('data-theme', 'light')

    expect(terminalSearchDecorationsForCurrentDocument()).toMatchObject({
      matchBackground: '#bf8700',
      activeMatchBackground: '#fb8f44',
      activeMatchBorder: '#1d1d1f',
    })
    expect(terminalSearchDecorationsForCurrentDocument('classic')).toMatchObject({
      matchBackground: '#ffd60a',
      activeMatchBackground: '#ff9f0a',
      activeMatchBorder: '#ffffff',
    })
  })
})
```

- [ ] **Step 3: Run failing terminal theme test**

Run:

```bash
bun run test src/web/components/terminal/terminal-theme.test.ts
```

Expected: FAIL because `terminalThemeForCurrentDocument()` does not accept a mode argument yet.

- [ ] **Step 4: Implement mode-aware terminal theme helpers**

In `src/web/components/terminal/terminal-theme.ts`, add:

```ts
export type TerminalThemeMode = 'theme' | 'classic'
```

Refactor token reads:

```ts
const TERMINAL_THEME_TOKEN_MAP = {
  background: '--color-terminal-background',
  foreground: '--color-terminal-foreground',
  cursor: '--color-terminal-cursor',
  selectionBackground: '--color-terminal-selection-background',
  black: '--color-terminal-ansi-black',
  red: '--color-terminal-ansi-red',
  green: '--color-terminal-ansi-green',
  yellow: '--color-terminal-ansi-yellow',
  blue: '--color-terminal-ansi-blue',
  magenta: '--color-terminal-ansi-magenta',
  cyan: '--color-terminal-ansi-cyan',
  white: '--color-terminal-ansi-white',
  brightBlack: '--color-terminal-ansi-bright-black',
  brightRed: '--color-terminal-ansi-bright-red',
  brightGreen: '--color-terminal-ansi-bright-green',
  brightYellow: '--color-terminal-ansi-bright-yellow',
  brightBlue: '--color-terminal-ansi-bright-blue',
  brightMagenta: '--color-terminal-ansi-bright-magenta',
  brightCyan: '--color-terminal-ansi-bright-cyan',
  brightWhite: '--color-terminal-ansi-bright-white',
} as const

const TERMINAL_SEARCH_TOKEN_MAP = {
  match: '--color-terminal-search-match',
  activeMatch: '--color-terminal-search-active-match',
  activeBorder: '--color-terminal-search-active-border',
} as const
```

Add classic prefix resolution:

```ts
function tokenNameForMode(token: string, mode: TerminalThemeMode): string {
  return mode === 'classic' ? token.replace('--color-terminal-', '--color-terminal-classic-') : token
}

function cssTokenForMode(styles: CSSStyleDeclaration, token: string, mode: TerminalThemeMode): string {
  if (mode !== 'classic') return cssToken(styles, token)
  const classic = cssToken(styles, tokenNameForMode(token, mode))
  return classic || cssToken(styles, token)
}
```

Update exported functions:

```ts
export function terminalThemeForCurrentDocument(mode: TerminalThemeMode = 'theme'): ITheme {
  const styles = getComputedStyle(document.documentElement)
  return Object.fromEntries(
    Object.entries(TERMINAL_THEME_TOKEN_MAP).map(([key, token]) => [
      key,
      cssTokenForMode(styles, token, mode),
    ]),
  ) as ITheme
}

export function terminalSearchDecorationsForCurrentDocument(
  mode: TerminalThemeMode = 'theme',
): TerminalSearchDecorations {
  const styles = getComputedStyle(document.documentElement)
  const match = cssTokenForMode(styles, TERMINAL_SEARCH_TOKEN_MAP.match, mode)
  const activeMatch = cssTokenForMode(styles, TERMINAL_SEARCH_TOKEN_MAP.activeMatch, mode)
  return {
    matchBackground: match,
    matchOverviewRuler: match,
    activeMatchBackground: activeMatch,
    activeMatchBorder: cssTokenForMode(styles, TERMINAL_SEARCH_TOKEN_MAP.activeBorder, mode),
    activeMatchColorOverviewRuler: activeMatch,
  }
}
```

Update observer signature:

```ts
export function observeTerminalTheme(
  mode: () => TerminalThemeMode,
  onTheme: (theme: ITheme) => void,
): () => void {
  const refresh = () => onTheme(terminalThemeForCurrentDocument(mode()))
  const observer = new MutationObserver(refresh)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'data-color-theme', 'data-theme-id', 'style'],
  })
  window.addEventListener(TERMINAL_THEME_TOKENS_CHANGED_EVENT, refresh)
  return () => {
    observer.disconnect()
    window.removeEventListener(TERMINAL_THEME_TOKENS_CHANGED_EVENT, refresh)
  }
}
```

- [ ] **Step 5: Run terminal theme test**

Run:

```bash
bun run test src/web/components/terminal/terminal-theme.test.ts
```

Expected: PASS.

---

## Task 4: Wire Terminal Theme Sync Into Live Terminal Sessions

**Files:**
- Modify: `src/web/components/terminal/terminal-session-view.ts`
- Modify: `src/web/components/terminal/ManagedTerminalSession.ts`
- Modify: `src/web/components/terminal/TerminalSessionRegistry.ts`
- Modify: `src/web/components/terminal/TerminalSessionProvider.tsx`
- Test: `src/web/components/terminal/ManagedTerminalSession.test.ts`
- Test: `src/web/components/terminal/TerminalSessionProvider.test.tsx`

- [ ] **Step 1: Write failing ManagedTerminalSession test**

In `src/web/components/terminal/ManagedTerminalSession.test.ts`, add a test near existing theme/addon tests:

```ts
test('updates terminal theme mode when settings change', async () => {
  const session = createManagedSession({
    terminalThemeMode: () => 'classic',
  })
  await session.open({ cols: 80, rows: 24 })

  expect(xtermMocks.terminals[0]!.options.theme).toMatchObject({
    background: '#050505',
  })

  session.setTerminalThemeMode(() => 'theme')

  expect(xtermMocks.terminals[0]!.options.theme).toMatchObject({
    background: '#111113',
  })
})
```

If the local helper does not currently accept `terminalThemeMode`, update the test helper with:

```ts
terminalThemeMode: options.terminalThemeMode ?? (() => 'theme'),
```

- [ ] **Step 2: Run failing test**

Run:

```bash
bun run test src/web/components/terminal/ManagedTerminalSession.test.ts -t "updates terminal theme mode"
```

Expected: FAIL because sessions do not accept or update a terminal theme mode provider.

- [ ] **Step 3: Update TerminalSessionView**

In `src/web/components/terminal/terminal-session-view.ts`, import the mode type:

```ts
type TerminalThemeMode,
```

Add a field:

```ts
private terminalThemeMode: () => TerminalThemeMode
```

Initialize it in the constructor options:

```ts
options: { fontSize?: number; terminalThemeMode?: () => TerminalThemeMode } = {},
```

```ts
this.terminalThemeMode = options.terminalThemeMode ?? (() => 'theme')
```

Add:

```ts
setTerminalThemeMode(mode: () => TerminalThemeMode): void {
  this.terminalThemeMode = mode
  const term = this.term
  if (!term) return
  this.applyTerminalTheme(term, terminalThemeForCurrentDocument(this.terminalThemeMode()))
}
```

Update `openTerminal()`:

```ts
const theme = terminalThemeForCurrentDocument(this.terminalThemeMode())
```

Update the observer:

```ts
this.disposeThemeObserver = observeTerminalTheme(this.terminalThemeMode, (nextTheme) => {
  this.applyTerminalTheme(term, nextTheme)
})
```

Update `terminalSearchOptions()` to accept mode:

```ts
function terminalSearchOptions(mode: TerminalThemeMode, incremental?: boolean): ISearchOptions {
  return {
    incremental,
    decorations: terminalSearchDecorationsForCurrentDocument(mode),
  }
}
```

Update `find()`:

```ts
return direction === 'next'
  ? this.searchAddon.findNext(term, terminalSearchOptions(this.terminalThemeMode(), incremental))
  : this.searchAddon.findPrevious(term, terminalSearchOptions(this.terminalThemeMode()))
```

- [ ] **Step 4: Update ManagedTerminalSession**

In `src/web/components/terminal/ManagedTerminalSession.ts`, import the mode type:

```ts
import type { TerminalThemeMode } from '#/web/components/terminal/terminal-theme.ts'
```

Add a constructor option:

```ts
terminalThemeMode?: () => TerminalThemeMode
```

Pass it when constructing `TerminalSessionView`:

```ts
terminalThemeMode: options.terminalThemeMode,
```

Add a method:

```ts
setTerminalThemeMode(mode: () => TerminalThemeMode): void {
  this.view.setTerminalThemeMode(mode)
}
```

- [ ] **Step 5: Update TerminalSessionRegistry**

In `src/web/components/terminal/TerminalSessionRegistry.ts`, import the type:

```ts
import type { TerminalThemeMode } from '#/web/components/terminal/terminal-theme.ts'
```

Add a field:

```ts
private terminalThemeMode: () => TerminalThemeMode = () => 'theme'
```

Add a method:

```ts
setTerminalThemeMode(mode: TerminalThemeMode): void {
  this.terminalThemeMode = () => mode
  for (const session of this.sessions.values()) {
    session.setTerminalThemeMode(this.terminalThemeMode)
  }
}
```

When constructing `ManagedTerminalSession`, pass:

```ts
terminalThemeMode: this.terminalThemeMode,
```

- [ ] **Step 6: Update TerminalSessionProvider**

In `src/web/components/terminal/TerminalSessionProvider.tsx`, import:

```ts
import { useRuntimeTerminalSettings } from '#/web/runtime-settings-terminal-buttons.ts'
```

Read setting:

```tsx
const { terminalThemeSyncEnabled } = useRuntimeTerminalSettings()
```

Add an effect after registry creation:

```tsx
useEffect(() => {
  registry.setTerminalThemeMode(terminalThemeSyncEnabled ? 'theme' : 'classic')
}, [registry, terminalThemeSyncEnabled])
```

- [ ] **Step 7: Run terminal session tests**

Run:

```bash
bun run test src/web/components/terminal/ManagedTerminalSession.test.ts src/web/components/terminal/TerminalSessionProvider.test.tsx
```

Expected: PASS after updating mocks/helpers for the new option.

---

## Task 5: Expand Theme Tokens For Region Bars, Inputs, And Classic Terminal Palette

**Files:**
- Modify: `src/web/theme/contract.css`
- Modify: `src/web/theme/themes/macos.css`
- Modify: `src/web/theme/themes/mono.css`
- Modify: `src/web/theme/themes/github.css`
- Modify: `src/web/theme/themes/claude.css`
- Modify: `src/web/theme/themes/cursor.css`
- Modify: `src/web/theme/themes/airbnb.css`
- Modify: `src/web/theme/themes/bmw.css`
- Modify: `src/shared/theme-tokens.test.ts`

- [ ] **Step 1: Write failing token coverage test**

In `src/shared/theme-tokens.test.ts`, add CSS file parsing helpers:

```ts
import { readFileSync } from 'node:fs'
import path from 'node:path'
```

Add token lists:

```ts
const WEB_THEME_DIR = path.resolve(process.cwd(), 'src/web/theme/themes')

const REQUIRED_REGION_TOKENS = [
  '--goblin-toolbar-bg',
  '--goblin-toolbar-border',
  '--goblin-input-bg',
  '--goblin-input-border',
  '--goblin-input-focus-border',
] as const

const REQUIRED_CLASSIC_TERMINAL_TOKENS = [
  '--color-terminal-classic-background',
  '--color-terminal-classic-foreground',
  '--color-terminal-classic-cursor',
  '--color-terminal-classic-selection-background',
  '--color-terminal-classic-ansi-black',
  '--color-terminal-classic-ansi-red',
  '--color-terminal-classic-ansi-green',
  '--color-terminal-classic-ansi-yellow',
  '--color-terminal-classic-ansi-blue',
  '--color-terminal-classic-ansi-magenta',
  '--color-terminal-classic-ansi-cyan',
  '--color-terminal-classic-ansi-white',
  '--color-terminal-classic-ansi-bright-black',
  '--color-terminal-classic-ansi-bright-red',
  '--color-terminal-classic-ansi-bright-green',
  '--color-terminal-classic-ansi-bright-yellow',
  '--color-terminal-classic-ansi-bright-blue',
  '--color-terminal-classic-ansi-bright-magenta',
  '--color-terminal-classic-ansi-bright-cyan',
  '--color-terminal-classic-ansi-bright-white',
  '--color-terminal-classic-search-match',
  '--color-terminal-classic-search-active-match',
  '--color-terminal-classic-search-active-border',
] as const
```

Add tests:

```ts
test('defines region surface tokens for every web color theme', () => {
  for (const colorTheme of COLOR_THEMES) {
    const text = readFileSync(path.join(WEB_THEME_DIR, `${colorTheme}.css`), 'utf8')
    for (const token of REQUIRED_REGION_TOKENS) {
      expect(text, `${colorTheme} ${token}`).toContain(`${token}:`)
    }
  }
})

test('defines classic terminal tokens for every web color theme', () => {
  for (const colorTheme of COLOR_THEMES) {
    const text = readFileSync(path.join(WEB_THEME_DIR, `${colorTheme}.css`), 'utf8')
    for (const token of REQUIRED_CLASSIC_TERMINAL_TOKENS) {
      expect(text, `${colorTheme} ${token}`).toContain(`${token}:`)
    }
  }
})
```

- [ ] **Step 2: Run failing token test**

Run:

```bash
bun run test src/shared/theme-tokens.test.ts
```

Expected: FAIL because new region and classic terminal tokens are not defined in each theme file.

- [ ] **Step 3: Add contract aliases**

In `src/web/theme/contract.css`, refine aliases:

```css
--color-control: var(--goblin-control-bg, var(--goblin-surface-control, var(--goblin-surface-raised)));
--color-control-hover: var(
  --goblin-control-hover-bg,
  var(--goblin-surface-control-hover, var(--goblin-surface-hover))
);
--color-input: var(--goblin-input-border, var(--goblin-control-border, var(--goblin-border-strong)));
--color-pane-header: var(--goblin-pane-header-bg, var(--goblin-surface-raised));
--color-toolbar: var(--goblin-toolbar-bg, var(--goblin-pane-header-bg, var(--goblin-surface-raised)));
--color-toolbar-border: var(--goblin-toolbar-border, var(--goblin-border-subtle));
```

If `--color-pane-header` already exists, leave it and only add `--color-toolbar` and `--color-toolbar-border`.

- [ ] **Step 4: Add theme tokens**

In every `src/web/theme/themes/*.css` selector block, add region tokens near the existing control tokens:

```css
--goblin-toolbar-bg: var(--goblin-pane-header-bg);
--goblin-toolbar-border: var(--goblin-border-subtle);
--goblin-input-bg: var(--goblin-control-bg);
--goblin-input-border: var(--goblin-control-border);
--goblin-input-focus-border: var(--goblin-focus-ring);
```

Then tune theme-specific values where the existing theme intent calls for it:

```css
/* airbnb light/dark can keep rounded friendly input surfaces */
--goblin-input-bg: #ffffff;
--goblin-input-focus-border: #ff385c;

/* bmw light/dark should keep sharper, stronger input borders */
--goblin-input-focus-border: #1c69d4;
--goblin-toolbar-border: var(--goblin-border-default);
```

Add classic terminal tokens to every selector block. Start with the same classic palette in all themes:

```css
--color-terminal-classic-background: #050505;
--color-terminal-classic-foreground: #f5f5f5;
--color-terminal-classic-cursor: #f5f5f5;
--color-terminal-classic-selection-background: rgba(255, 255, 255, 0.24);
--color-terminal-classic-ansi-black: #000000;
--color-terminal-classic-ansi-red: #ff5f56;
--color-terminal-classic-ansi-green: #27c93f;
--color-terminal-classic-ansi-yellow: #ffbd2e;
--color-terminal-classic-ansi-blue: #5ac8fa;
--color-terminal-classic-ansi-magenta: #bf5af2;
--color-terminal-classic-ansi-cyan: #64d2ff;
--color-terminal-classic-ansi-white: #d1d1d1;
--color-terminal-classic-ansi-bright-black: #808080;
--color-terminal-classic-ansi-bright-red: #ff6b65;
--color-terminal-classic-ansi-bright-green: #32d74b;
--color-terminal-classic-ansi-bright-yellow: #ffd60a;
--color-terminal-classic-ansi-bright-blue: #70d7ff;
--color-terminal-classic-ansi-bright-magenta: #da8fff;
--color-terminal-classic-ansi-bright-cyan: #70d7ff;
--color-terminal-classic-ansi-bright-white: #ffffff;
--color-terminal-classic-search-match: #ffd60a;
--color-terminal-classic-search-active-match: #ff9f0a;
--color-terminal-classic-search-active-border: #ffffff;
```

- [ ] **Step 5: Run token test**

Run:

```bash
bun run test src/shared/theme-tokens.test.ts
```

Expected: PASS.

---

## Task 6: Apply New Tokens To Shared Surfaces

**Files:**
- Modify: `src/web/components/Layout.tsx`
- Modify: `src/web/components/ui/input.tsx`
- Modify: `src/web/components/terminal/terminal-session.css`
- Modify: `src/web/components/file-tree/ProjectFileTree.tsx` only if the current file-tree search input needs a token-specific class.
- Test: `src/web/components/file-tree/ProjectFileTree.test.tsx`
- Test: `src/web/theme/hardcoded-colors.test.ts`

- [ ] **Step 1: Write a focused toolbar class expectation**

In `src/web/components/file-tree/ProjectFileTree.test.tsx`, update the existing test named `uses the same action bar chrome as the changes panel toolbar`. Replace expectations that require `bg-pane-header` with toolbar aliases:

```ts
expect(toolbar.className).toContain('min-h-8')
expect(toolbar.className).toContain('justify-end')
expect(toolbar.className).toContain('border-toolbar-border')
expect(toolbar.className).toContain('bg-toolbar')
expect(toolbar.className).toContain('px-2')
```

- [ ] **Step 2: Run failing component test**

Run:

```bash
bun run test src/web/components/file-tree/ProjectFileTree.test.tsx -t "uses the same action bar chrome"
```

Expected: FAIL because `Toolbar` still emits pane/card classes.

- [ ] **Step 3: Update shared Toolbar**

In `src/web/components/Layout.tsx`, update `Toolbar()` classes:

```tsx
className={cn(
  'flex h-9 shrink-0 items-center border-b border-toolbar-border',
  variant === 'repo' && 'gap-3 bg-toolbar px-4',
  variant === 'detail' && 'min-w-0 justify-between gap-2 bg-toolbar px-2',
  className,
)}
```

If a call site passes a custom border class such as `border-separator/70`, leave it as an override.

- [ ] **Step 4: Update shared Input**

In `src/web/components/ui/input.tsx`, update the class string:

```tsx
className={cn(
  'h-[calc(var(--goblin-control-height-sm,2rem)+0.25rem)] w-full rounded-[var(--goblin-control-radius,var(--radius-md))] border border-[var(--goblin-input-border,var(--color-input))] bg-[var(--goblin-input-bg,var(--color-control))] px-3 py-2 text-sm focus:border-[var(--goblin-input-focus-border,var(--color-ring))] focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger-border aria-invalid:ring-danger/20 dark:aria-invalid:ring-danger/40',
  className,
)}
```

Keep this as token-driven arbitrary values; do not add hard-coded colors.

- [ ] **Step 5: Update terminal search floating input**

In `src/web/components/terminal/terminal-session.css`, update terminal search styles:

```css
.goblin-terminal-slot__search {
  display: flex;
  max-width: calc(100% - 20px);
  align-items: center;
  gap: 4px;
  border: 1px solid var(--color-toolbar-border, var(--color-border));
  border-radius: var(--goblin-terminal-float-radius);
  background: color-mix(in srgb, var(--color-toolbar, var(--color-popover)) 96%, transparent);
  padding: 6px;
  box-shadow: var(--shadow-sm);
}

.goblin-terminal-slot__search-input {
  height: 24px;
  min-width: 80px;
  width: clamp(80px, 32vw, 190px);
  border: 1px solid var(--goblin-input-border, var(--color-input));
  border-radius: var(--goblin-terminal-control-radius);
  background: var(--goblin-input-bg, var(--color-control));
  padding: 0 8px;
  color: var(--color-foreground);
  font-size: 12px;
  outline: none;
}

.goblin-terminal-slot__search-input:focus {
  border-color: var(--goblin-input-focus-border, var(--color-ring));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-ring) 25%, transparent);
}
```

- [ ] **Step 6: Run component and color discipline tests**

Run:

```bash
bun run test src/web/components/file-tree/ProjectFileTree.test.tsx -t "uses the same action bar chrome"
bun run test src/web/theme/hardcoded-colors.test.ts
```

Expected: PASS.

---

## Task 7: Final Integration Verification

**Files:**
- Verify only unless a previous task left a failing test.

- [ ] **Step 1: Run settings and terminal targeted tests**

Run:

```bash
bun run test src/server/modules/settings-source.test.ts src/shared/settings-snapshot.test.ts src/web/runtime-settings-hooks.test.tsx src/web/components/SettingsSurface.test.tsx src/web/components/terminal/terminal-theme.test.ts src/web/components/terminal/ManagedTerminalSession.test.ts src/web/components/terminal/TerminalSessionProvider.test.tsx src/shared/theme-tokens.test.ts src/web/theme/hardcoded-colors.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run architecture guard**

Run:

```bash
bun run check:architecture
```

Expected: PASS.

- [ ] **Step 4: Run full tests if targeted suite exposed broad impact**

Run:

```bash
bun run test
```

Expected: PASS. If this is too slow during implementation, record that only targeted tests and typecheck were run, then run the full suite before final delivery.

- [ ] **Step 5: Manual visual smoke check**

Run the dev app:

```bash
bun run dev
```

Expected: local app starts without errors.

Manual checks:

- Open Settings -> General.
- Confirm `Terminal follows theme` switch is visible and enabled by default.
- Switch between `airbnb`, `bmw`, `macos`, and `github` themes.
- Confirm topbar, workspace section bars, toolbar backgrounds, shared inputs, selected rows, and terminal palette change when sync is enabled.
- Disable terminal theme sync.
- Confirm terminal xterm canvas returns to the classic palette while terminal tabs/buttons/search chrome still follows the app theme.

Stop the dev server when done.

---

## Self-Review Notes

- Spec coverage: settings persistence, General UI, xterm sync/default, classic terminal fallback, tokenized surfaces, tests, and architecture constraints are mapped to tasks.
- No git commit or branch steps are included because the project instructions explicitly disallow planning or executing git commits/branches without a user request.
- Type names are consistent: `terminalThemeSyncEnabled`, `TerminalThemeMode`, `'theme' | 'classic'`.
- The plan keeps YAGNI: no new theme provider, no new route, no package dependency, no React branches on `colorTheme`.
