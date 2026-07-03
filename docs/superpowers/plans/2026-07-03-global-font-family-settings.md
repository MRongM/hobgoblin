# Global Font Family Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global font family preference in General settings, default it to Mono, and make it affect both app UI and in-app terminal output.

**Architecture:** Server-owned settings remain the source of truth. Shared settings types/defaults carry `fontFamily`; the server normalizes and persists it; the renderer projects it into CSS variables and passes the same resolved terminal font stack to xterm sessions without restarting them.

**Tech Stack:** TypeScript in Node strip-only mode, React, TanStack Query, Hono settings API, xterm.js, Vitest/jsdom, Tailwind CSS variables.

---

## Repository Constraints

- Do not use TypeScript enums, runtime namespaces, parameter properties, or import aliases.
- Use repo alias imports with explicit `.ts` / `.tsx` extensions.
- Do not create re-export shims.
- Do not run or plan version-control commits because project instructions explicitly forbid planning or executing commits unless the user asks.
- Before editing terminal files, re-read the current diff because these files already have unrelated uncommitted changes:
  - `src/web/components/terminal/TerminalSessionProvider.tsx`
  - `src/web/components/terminal/TerminalSessionProvider.test.tsx`
  - `src/web/components/terminal/TerminalSessionRegistry.ts`

## File Structure

- Modify `src/shared/settings.ts`: add `FontFamilyPref` and `fontFamily` to `SettingsPrefs`.
- Modify `src/shared/rpc.ts`: re-export `FontFamilyPref`.
- Modify `src/shared/settings-defaults.ts`: add `DEFAULT_FONT_FAMILY` and include `fontFamily` in default/runtime bootstrap projections.
- Modify `src/shared/bootstrap.ts`: include `fontFamily` in `InitialSettingsSnapshot`.
- Modify `src/shared/settings-snapshot.ts`: include `fontFamily` in runtime snapshot build/extract.
- Modify tests `src/shared/settings-defaults.test.ts` and `src/shared/settings-snapshot.test.ts`.
- Modify `src/server/modules/settings-source.ts`: normalize, read, persist, and update `fontFamily`.
- Modify `src/server/modules/settings-source.test.ts`: cover defaults, valid values, and invalid values.
- Modify `src/web/settings-read-projection.ts`: read `fontFamily` with fallback.
- Modify `src/web/runtime-settings-fonts.ts`: expose `fontFamily` and `setFontFamily`.
- Modify `src/web/settings-client.ts`: POST `fontFamily` patches.
- Modify `src/web/settings-write-paths.ts`: update query cache after font family writes.
- Modify `src/web/settings-write-paths.test.ts`: verify font family cache update.
- Create `src/web/font-family.ts`: central font stack definitions and DOM projection helper.
- Create `src/web/font-family.test.ts`: test stack resolution and DOM CSS variable projection.
- Create `src/web/components/GlobalFontFamilyProjection.tsx`: small React component that applies global CSS variables from runtime settings.
- Modify `src/web/main.tsx`: render `GlobalFontFamilyProjection`.
- Modify `src/web/components/settings/pages/GeneralSettings.tsx`: add the General settings row.
- Modify i18n dictionaries in `src/shared/i18n/en.ts`, `src/shared/i18n/zh.ts`, `src/shared/i18n/ko.ts`, `src/shared/i18n/ja.ts`.
- Modify `src/web/theme/font-contract.test.ts`: update font contract expectations for default Mono and Maple asset registration.
- Modify terminal files:
  - `src/web/components/terminal/terminal-geometry.ts`
  - `src/web/components/terminal/terminal-geometry.test.ts`
  - `src/web/components/terminal/terminal-session-view.ts`
  - `src/web/components/terminal/ManagedTerminalSession.ts`
  - `src/web/components/terminal/ManagedTerminalSession.test.ts`
  - `src/web/components/terminal/TerminalSessionRegistry.ts`
  - `src/web/components/terminal/TerminalSessionProvider.tsx`
  - `src/web/components/terminal/TerminalSessionProvider.test.tsx`
- Modify runtime/UI tests:
  - `src/web/runtime-settings-hooks.test.tsx`
  - `src/web/components/SettingsSurface.test.tsx`

## Task 1: Shared Settings Contract

**Files:**
- Modify: `src/shared/settings.ts`
- Modify: `src/shared/rpc.ts`
- Modify: `src/shared/settings-defaults.ts`
- Modify: `src/shared/bootstrap.ts`
- Modify: `src/shared/settings-snapshot.ts`
- Test: `src/shared/settings-defaults.test.ts`
- Test: `src/shared/settings-snapshot.test.ts`

- [ ] **Step 1: Write failing defaults tests**

Add imports and tests in `src/shared/settings-defaults.test.ts`:

```ts
import {
  DEFAULT_FILE_TREE_CLIPBOARD_MAX_BYTES_MB,
  DEFAULT_FONT_FAMILY,
  DEFAULT_GIT_NETWORK_PROXY_ENABLED,
  DEFAULT_GIT_NETWORK_PROXY_URL,
  DEFAULT_GIT_NETWORK_TIMEOUT_SEC,
  DEFAULT_FILE_TREE_FONT_SIZE,
  DEFAULT_TERMINAL_CUSTOM_BUTTON_SIZE,
  defaultInitialSettingsSnapshot,
  defaultSettingsPrefs,
} from '#/shared/settings-defaults.ts'

test('defaults global font family to mono', () => {
  expect(DEFAULT_FONT_FAMILY).toBe('mono')
  expect(defaultSettingsPrefs().fontFamily).toBe('mono')
  expect(defaultInitialSettingsSnapshot().fontFamily).toBe('mono')
})
```

- [ ] **Step 2: Write failing snapshot tests**

In `src/shared/settings-snapshot.test.ts`, add `fontFamily` to both `prefs` literals and expected runtime objects:

```ts
const runtime = buildRuntimeSettingsSnapshot({
  prefs: {
    lang: 'ja',
    theme: 'dark',
    colorTheme: 'github',
    fontFamily: 'maple',
    fetchIntervalSec: 300,
    gitNetworkProxyEnabled: true,
    gitNetworkProxyUrl: 'socks5://127.0.0.1:7890',
    gitNetworkTimeoutSec: 180,
    terminalNotificationsEnabled: true,
    shortcutsDisabled: true,
    globalShortcutDisabled: false,
    swapCloseShortcuts: true,
    toggleDetailOnActionBarBlankClick: true,
    terminalThemeSyncEnabled: false,
    temporaryFilesDirectory: '/Users/test/tmp',
    globalShortcut: 'CommandOrControl+Shift+K',
    terminalApp: 'ghostty',
    editorApp: 'cursor',
    fileTreeFontSize: 13,
    fileTreeTopbarFontSize: 12,
    fileTreeClipboardMaxBytesMb: 30,
    terminalFontSize: 15,
    remoteTerminalTmuxEnabled: true,
    terminalCustomButtonsVisible: false,
    terminalCustomButtonSize: 'large',
    terminalCustomButtons: [{ label: 'status', value: 'git status --short', action: 'input' }],
    lanEnabled: true,
  },
  globalShortcutRegistered: true,
})

expect(runtime).toEqual({
  lang: 'ja',
  theme: 'dark',
  colorTheme: 'github',
  fontFamily: 'maple',
  fetchIntervalSec: 300,
  gitNetworkProxyEnabled: true,
  gitNetworkProxyUrl: 'socks5://127.0.0.1:7890',
  gitNetworkTimeoutSec: 180,
  terminalNotificationsEnabled: true,
  shortcutsDisabled: true,
  globalShortcutDisabled: false,
  swapCloseShortcuts: true,
  toggleDetailOnActionBarBlankClick: true,
  terminalThemeSyncEnabled: false,
  temporaryFilesDirectory: '/Users/test/tmp',
  globalShortcut: 'CommandOrControl+Shift+K',
  globalShortcutRegistered: true,
  terminalApp: 'ghostty',
  editorApp: 'cursor',
  fileTreeFontSize: 13,
  fileTreeTopbarFontSize: 12,
  fileTreeClipboardMaxBytesMb: 30,
  terminalFontSize: 15,
  remoteTerminalTmuxEnabled: true,
  terminalCustomButtonsVisible: false,
  terminalCustomButtonSize: 'large',
  terminalCustomButtons: [{ label: 'status', value: 'git status --short', action: 'input' }],
  lanEnabled: true,
})
```

In the second full snapshot test, add `fontFamily: 'system'` to `prefs` and add this assertion:

```ts
expect(runtime).toMatchObject({
  fontFamily: 'system',
  globalShortcutRegistered: false,
  gitNetworkProxyEnabled: false,
  gitNetworkProxyUrl: '',
  gitNetworkTimeoutSec: 120,
  temporaryFilesDirectory: '',
  terminalThemeSyncEnabled: true,
  remoteTerminalTmuxEnabled: false,
  fileTreeTopbarFontSize: 13,
  fileTreeClipboardMaxBytesMb: 30,
  terminalCustomButtonsVisible: true,
  terminalCustomButtonSize: 'medium',
  terminalCustomButtons: [{ label: 'status', value: 'git status --short', action: 'execute' }],
})
```

- [ ] **Step 3: Run shared tests and verify failure**

Run:

```bash
bun run test src/shared/settings-defaults.test.ts src/shared/settings-snapshot.test.ts
```

Expected: FAIL with TypeScript/runtime errors that `DEFAULT_FONT_FAMILY` or `fontFamily` is missing.

- [ ] **Step 4: Implement shared contract**

In `src/shared/settings.ts`, add:

```ts
export type FontFamilyPref = 'mono' | 'maple' | 'system'
```

In `src/shared/rpc.ts`, add `FontFamilyPref` to the type import and re-export lists:

```ts
import type {
  EditorAppAvailability,
  EditorPref,
  FontFamilyPref,
  Lang,
  LangPref,
  ResolvedEditorApp,
  ResolvedTerminalApp,
  ResolvedTheme,
  SettingsPrefs,
  TerminalCustomButton,
  TerminalCustomButtonAction,
  TerminalCustomButtonSize,
  TerminalAppAvailability,
  TerminalPref,
  ThemePref,
} from '#/shared/settings.ts'
```

```ts
export type {
  EditorAppAvailability,
  EditorPref,
  FontFamilyPref,
  Lang,
  LangPref,
  ResolvedEditorApp,
  ResolvedTerminalApp,
  ResolvedTheme,
  SettingsPrefs,
  TerminalCustomButton,
  TerminalCustomButtonAction,
  TerminalCustomButtonSize,
  TerminalAppAvailability,
  TerminalPref,
  ThemePref,
} from '#/shared/settings.ts'
```

Add `fontFamily` to `SettingsPrefs` near `colorTheme`:

```ts
export interface SettingsPrefs {
  theme: ThemePref
  colorTheme: ColorTheme
  fontFamily: FontFamilyPref
  lang: LangPref
  fetchIntervalSec: number
  gitNetworkProxyEnabled: boolean
  gitNetworkProxyUrl: string
  gitNetworkTimeoutSec: number
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
  fileTreeClipboardMaxBytesMb: number
  terminalFontSize: number
  remoteTerminalTmuxEnabled: boolean
  terminalCustomButtonsVisible: boolean
  terminalCustomButtonSize: TerminalCustomButtonSize
  terminalCustomButtons: TerminalCustomButton[]
  lanEnabled: boolean
}
```

In `src/shared/settings-defaults.ts`, import `FontFamilyPref`, add the default constant, and include the field:

```ts
import type {
  EditorPref,
  FontFamilyPref,
  LangPref,
  SessionState,
  SettingsPrefs,
  SettingsSnapshot,
  TerminalCustomButton,
  TerminalCustomButtonSize,
  TerminalPref,
  ThemePref,
} from '#/shared/rpc.ts'

export const DEFAULT_FONT_FAMILY: FontFamilyPref = 'mono'
```

In `defaultSettingsPrefs`:

```ts
fontFamily: overrides.fontFamily ?? DEFAULT_FONT_FAMILY,
```

In `initialSettingsFromSnapshot` pick list, include `'fontFamily'`, and in the returned object:

```ts
fontFamily: snapshot.fontFamily,
```

Export the new default:

```ts
export {
  DEFAULT_FILE_TREE_CLIPBOARD_MAX_BYTES_MB,
  DEFAULT_FONT_FAMILY,
  MAX_FILE_TREE_FONT_SIZE,
  MAX_FILE_TREE_CLIPBOARD_MAX_BYTES_MB,
  MAX_FILE_TREE_TOPBAR_FONT_SIZE,
  MAX_GIT_NETWORK_TIMEOUT_SEC,
  MAX_TERMINAL_FONT_SIZE,
  MIN_FILE_TREE_FONT_SIZE,
  MIN_FILE_TREE_CLIPBOARD_MAX_BYTES_MB,
  MIN_FILE_TREE_TOPBAR_FONT_SIZE,
  MIN_GIT_NETWORK_TIMEOUT_SEC,
  MIN_TERMINAL_FONT_SIZE,
}
```

In `src/shared/bootstrap.ts`, import `FontFamilyPref` and add:

```ts
fontFamily: FontFamilyPref
```

to `InitialSettingsSnapshot`.

In `src/shared/settings-snapshot.ts`, add `fontFamily` to:

```ts
return {
  lang: input.prefs.lang,
  theme: input.prefs.theme,
  colorTheme: input.prefs.colorTheme,
  fontFamily: input.prefs.fontFamily,
  fetchIntervalSec: input.prefs.fetchIntervalSec,
  ...
}
```

Add `'fontFamily'` to the `Pick<SettingsSnapshot, ...>` list in `runtimeSettingsSnapshotFromSettingsSnapshot`, and return:

```ts
fontFamily: snapshot.fontFamily,
```

- [ ] **Step 5: Run shared tests and verify pass**

Run:

```bash
bun run test src/shared/settings-defaults.test.ts src/shared/settings-snapshot.test.ts
```

Expected: PASS.

## Task 2: Server Settings Persistence and Normalization

**Files:**
- Modify: `src/server/modules/settings-source.ts`
- Test: `src/server/modules/settings-source.test.ts`

- [ ] **Step 1: Write failing server tests**

In `src/server/modules/settings-source.test.ts`, add `fontFamily: 'mono'` to the defaults expectation:

```ts
expect(prefs).toMatchObject({
  lang: 'auto',
  theme: 'auto',
  colorTheme: 'macos',
  fontFamily: 'mono',
  gitNetworkProxyEnabled: false,
  gitNetworkProxyUrl: '',
  gitNetworkTimeoutSec: 120,
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
  remoteTerminalTmuxEnabled: false,
  terminalCustomButtonsVisible: true,
  terminalCustomButtonSize: 'medium',
  terminalCustomButtons: [],
  lanEnabled: false,
})
```

In the persistence test patch, add:

```ts
fontFamily: 'maple',
```

and in the reloaded expectation:

```ts
fontFamily: 'maple',
```

Add a new normalization test:

```ts
test('normalizes global font family preferences', async () => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'gbl-server-settings-'))
  previousDataDir = process.env.GOBLIN_SERVER_DATA_DIR
  process.env.GOBLIN_SERVER_DATA_DIR = tmp

  const mod = await import('#/server/modules/settings-source.ts')
  await mod.updateServerSettingsPrefs({ fontFamily: 'system' })
  await expect(mod.getServerSettingsPrefs()).resolves.toMatchObject({ fontFamily: 'system' })

  await mod.updateServerSettingsPrefs({ fontFamily: 'maple' })
  await expect(mod.getServerSettingsPrefs()).resolves.toMatchObject({ fontFamily: 'maple' })

  await mod.updateServerSettingsPrefs({ fontFamily: 'bad-value' as never })
  await expect(mod.getServerSettingsPrefs()).resolves.toMatchObject({ fontFamily: 'mono' })
})
```

- [ ] **Step 2: Run server test and verify failure**

Run:

```bash
bun run test src/server/modules/settings-source.test.ts
```

Expected: FAIL because `fontFamily` is not persisted or normalized.

- [ ] **Step 3: Implement server normalization**

In `src/server/modules/settings-source.ts`, import `FontFamilyPref`:

```ts
import type {
  EditorPref,
  FontFamilyPref,
  LangPref,
  SessionState,
  SettingsPrefs,
  TerminalCustomButton,
  TerminalCustomButtonAction,
  TerminalCustomButtonSize,
  TerminalPref,
  ThemePref,
} from '#/shared/rpc.ts'
```

Import the default:

```ts
  DEFAULT_FONT_FAMILY,
```

Add `fontFamily` to `ServerSettingsData`:

```ts
fontFamily: FontFamilyPref
```

Add a normalizer near theme/lang normalizers:

```ts
function normalizeFontFamilyPref(value: unknown): FontFamilyPref {
  return value === 'mono' || value === 'maple' || value === 'system' ? value : DEFAULT_FONT_FAMILY
}
```

In `settingsPrefsFromData`, add:

```ts
fontFamily: data.fontFamily,
```

In `readServerSettingsFile`, add:

```ts
fontFamily: normalizeFontFamilyPref(parsed.fontFamily),
```

In `updateServerSettingsPrefs`, calculate:

```ts
const nextFontFamily =
  patch.fontFamily === undefined ? data.fontFamily : normalizeFontFamilyPref(patch.fontFamily)
```

Add it to `changed`:

```ts
data.fontFamily !== nextFontFamily ||
```

Assign it before writing:

```ts
data.fontFamily = nextFontFamily
```

- [ ] **Step 4: Run server test and verify pass**

Run:

```bash
bun run test src/server/modules/settings-source.test.ts
```

Expected: PASS.

## Task 3: Web Settings Read/Write Projection

**Files:**
- Modify: `src/web/settings-read-projection.ts`
- Modify: `src/web/runtime-settings-fonts.ts`
- Modify: `src/web/settings-client.ts`
- Modify: `src/web/settings-write-paths.ts`
- Test: `src/web/runtime-settings-hooks.test.tsx`
- Test: `src/web/settings-write-paths.test.ts`

- [ ] **Step 1: Write failing runtime hook test**

In `src/web/runtime-settings-hooks.test.tsx`, import:

```ts
import { useRuntimeFontSettings } from '#/web/runtime-settings-fonts.ts'
```

Add this test in `describe('runtime settings hooks', () => { ... })`:

```tsx
test('reads font runtime settings from the settings snapshot', async () => {
  mainWindowQueryClient.setQueryData(
    settingsSnapshotQueryKey(),
    defaultSettingsSnapshot({
      fontFamily: 'system',
      fileTreeFontSize: 12,
      fileTreeTopbarFontSize: 13,
      terminalFontSize: 16,
    }),
  )
  let result: ReturnType<typeof useRuntimeFontSettings> | undefined

  function HookHost() {
    result = useRuntimeFontSettings()
    return null
  }

  await renderWithMainWindowQueryClient(<HookHost />)

  expect(result).toEqual({
    fontFamily: 'system',
    fileTreeFontSize: 12,
    fileTreeTopbarFontSize: 13,
    terminalFontSize: 16,
  })
})
```

- [ ] **Step 2: Write failing write-path test**

In `src/web/settings-write-paths.test.ts`, extend `appDataClientMocks`:

```ts
setFontFamily: vi.fn(async (fontFamily: 'mono' | 'maple' | 'system') => fontFamily),
```

Add it to the `vi.mock('#/web/settings-client.ts', () => ({ ... }))` object:

```ts
setFontFamily: appDataClientMocks.setFontFamily,
```

Reset it in `beforeEach`:

```ts
appDataClientMocks.setFontFamily.mockReset()
appDataClientMocks.setFontFamily.mockImplementation(async (fontFamily: 'mono' | 'maple' | 'system') => fontFamily)
```

Add this test:

```ts
test('setFontFamilyPreference updates runtime settings cache', async () => {
  mainWindowQueryClient.setQueryData(settingsSnapshotQueryKey(), defaultSettingsSnapshot())
  const { setFontFamilyPreference } = await import('#/web/settings-write-paths.ts')

  await setFontFamilyPreference('system')

  expect(appDataClientMocks.setFontFamily).toHaveBeenCalledWith('system')
  expect(mainWindowQueryClient.getQueryData(settingsSnapshotQueryKey())).toMatchObject({ fontFamily: 'system' })
})
```

- [ ] **Step 3: Run runtime hook and write-path tests and verify failure**

Run:

```bash
bun run test src/web/runtime-settings-hooks.test.tsx src/web/settings-write-paths.test.ts
```

Expected: FAIL because `useRuntimeFontSettings()` does not expose `fontFamily` and `setFontFamilyPreference` does not exist.

- [ ] **Step 4: Implement read projection**

In `src/web/settings-read-projection.ts`, import:

```ts
  DEFAULT_FONT_FAMILY,
```

from `#/shared/settings-defaults.ts`.

Update `readRuntimeFontSettings`:

```ts
export function readRuntimeFontSettings(data: RuntimeSettingsSnapshot | undefined) {
  const fallback = fallbackInitialSettings()
  return {
    fontFamily: data?.fontFamily ?? fallback?.fontFamily ?? DEFAULT_FONT_FAMILY,
    fileTreeFontSize:
      data?.fileTreeFontSize ?? fallback?.fileTreeFontSize ?? DEFAULT_FILE_TREE_FONT_SIZE,
    fileTreeTopbarFontSize:
      data?.fileTreeTopbarFontSize ?? fallback?.fileTreeTopbarFontSize ?? DEFAULT_FILE_TREE_TOPBAR_FONT_SIZE,
    terminalFontSize:
      data?.terminalFontSize ?? fallback?.terminalFontSize ?? DEFAULT_TERMINAL_FONT_SIZE,
  }
}
```

Update `readRuntimeTerminalSettings` in the same file so terminal settings read the same preference:

```ts
export function readRuntimeTerminalSettings(data: RuntimeSettingsSnapshot | undefined) {
  const fallback = fallbackInitialSettings()
  return {
    fontFamily: data?.fontFamily ?? fallback?.fontFamily ?? DEFAULT_FONT_FAMILY,
    terminalFontSize:
      data?.terminalFontSize ?? fallback?.terminalFontSize ?? DEFAULT_TERMINAL_FONT_SIZE,
    terminalThemeSyncEnabled:
      data?.terminalThemeSyncEnabled ?? fallback?.terminalThemeSyncEnabled ?? true,
    remoteTerminalTmuxEnabled:
      data?.remoteTerminalTmuxEnabled ?? fallback?.remoteTerminalTmuxEnabled ?? false,
    temporaryFilesDirectory: data?.temporaryFilesDirectory ?? fallback?.temporaryFilesDirectory ?? '',
    terminalCustomButtonsVisible:
      data?.terminalCustomButtonsVisible ?? fallback?.terminalCustomButtonsVisible ?? true,
    terminalCustomButtonSize:
      data?.terminalCustomButtonSize ?? fallback?.terminalCustomButtonSize ?? DEFAULT_TERMINAL_CUSTOM_BUTTON_SIZE,
    terminalCustomButtons: data?.terminalCustomButtons ?? fallback?.terminalCustomButtons ?? [],
  }
}
```

- [ ] **Step 5: Implement write path**

In `src/web/settings-client.ts`, import `FontFamilyPref` in the type import list and add:

```ts
export async function setFontFamily(fontFamily: FontFamilyPref): Promise<FontFamilyPref> {
  const result = await updateSettingsPrefsPatch({ fontFamily })
  return result.settings.fontFamily
}
```

In `src/web/settings-write-paths.ts`, import `FontFamilyPref` and `setFontFamily`:

```ts
  setFontFamily,
```

Add:

```ts
export async function setFontFamilyPreference(fontFamily: FontFamilyPref): Promise<FontFamilyPref> {
  const nextFontFamily = await setFontFamily(fontFamily)
  updateRuntimeSettingsSnapshotCache(mainWindowQueryClient, (current) => ({ ...current, fontFamily: nextFontFamily }))
  return nextFontFamily
}
```

In `src/web/runtime-settings-fonts.ts`, import `FontFamilyPref` and `setFontFamilyPreference`:

```ts
import type { FontFamilyPref } from '#/shared/rpc.ts'
```

Add controller action:

```ts
async setFontFamily(fontFamily: FontFamilyPref): Promise<void> {
  await runSettingsControllerAction('font family update', async () => {
    await setFontFamilyPreference(fontFamily)
  })
},
```

- [ ] **Step 6: Run runtime hook and write-path tests and verify pass**

Run:

```bash
bun run test src/web/runtime-settings-hooks.test.tsx src/web/settings-write-paths.test.ts
```

Expected: PASS.

## Task 4: Font Stack Model and DOM Projection

**Files:**
- Create: `src/web/font-family.ts`
- Create: `src/web/font-family.test.ts`
- Create: `src/web/components/GlobalFontFamilyProjection.tsx`
- Modify: `src/web/main.tsx`
- Modify: `src/web/theme/font-contract.test.ts`

- [ ] **Step 1: Write failing font model tests**

Create `src/web/font-family.test.ts`:

```ts
// @vitest-environment jsdom

import { afterEach, describe, expect, test } from 'vitest'
import {
  APP_FONT_FAMILY_STACKS,
  applyDocumentFontFamily,
  fontFamilyStackForPref,
} from '#/web/font-family.ts'

afterEach(() => {
  document.documentElement.removeAttribute('data-font-family')
  document.documentElement.style.removeProperty('--font-sans')
  document.documentElement.style.removeProperty('--font-mono')
})

describe('font family projection', () => {
  test('resolves fixed font stacks for each preference', () => {
    expect(fontFamilyStackForPref('mono')).toBe(APP_FONT_FAMILY_STACKS.mono)
    expect(fontFamilyStackForPref('maple').terminal).toContain('Maple Mono NF CN')
    expect(fontFamilyStackForPref('system').sans).toContain('-apple-system')
  })

  test('applies data attribute and css variables to the document root', () => {
    applyDocumentFontFamily(document, 'system')

    expect(document.documentElement.getAttribute('data-font-family')).toBe('system')
    expect(document.documentElement.style.getPropertyValue('--font-sans')).toContain('-apple-system')
    expect(document.documentElement.style.getPropertyValue('--font-mono')).toContain('ui-monospace')
  })
})
```

Update `src/web/theme/font-contract.test.ts` default stack test:

```ts
test('uses Mono as the default app font stacks', () => {
  const contractCss = readText(new URL('./contract.css', import.meta.url))

  expect(contractCss).toContain('--font-sans: ui-monospace')
  expect(contractCss).toContain('--font-mono: ui-monospace')
})
```

Keep the Maple asset registration test unchanged.

- [ ] **Step 2: Run font tests and verify failure**

Run:

```bash
bun run test src/web/font-family.test.ts src/web/theme/font-contract.test.ts
```

Expected: FAIL because `src/web/font-family.ts` does not exist and CSS still defaults to Maple.

- [ ] **Step 3: Implement font model**

Create `src/web/font-family.ts`:

```ts
import type { FontFamilyPref } from '#/shared/rpc.ts'

export interface AppFontFamilyStack {
  sans: string
  mono: string
  terminal: string
}

const SYSTEM_MONO_STACK =
  "ui-monospace, 'SFMono-Regular', 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace"
const SYSTEM_SANS_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Noto Sans SC', system-ui, sans-serif"
const MAPLE_SANS_STACK =
  "'Maple Mono NF CN', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Noto Sans SC', system-ui, sans-serif"
const MAPLE_MONO_STACK = "'Maple Mono NF CN', ui-monospace, monospace"

export const APP_FONT_FAMILY_STACKS: Record<FontFamilyPref, AppFontFamilyStack> = {
  mono: {
    sans: SYSTEM_MONO_STACK,
    mono: SYSTEM_MONO_STACK,
    terminal: SYSTEM_MONO_STACK,
  },
  maple: {
    sans: MAPLE_SANS_STACK,
    mono: MAPLE_MONO_STACK,
    terminal: MAPLE_MONO_STACK,
  },
  system: {
    sans: SYSTEM_SANS_STACK,
    mono: SYSTEM_MONO_STACK,
    terminal: SYSTEM_SANS_STACK,
  },
}

export function fontFamilyStackForPref(fontFamily: FontFamilyPref): AppFontFamilyStack {
  return APP_FONT_FAMILY_STACKS[fontFamily]
}

export function applyDocumentFontFamily(document: Document, fontFamily: FontFamilyPref): void {
  const stack = fontFamilyStackForPref(fontFamily)
  const root = document.documentElement
  root.setAttribute('data-font-family', fontFamily)
  root.style.setProperty('--font-sans', stack.sans)
  root.style.setProperty('--font-mono', stack.mono)
}
```

- [ ] **Step 4: Implement React DOM projection**

Create `src/web/components/GlobalFontFamilyProjection.tsx`:

```tsx
import { useEffect } from 'react'
import { applyDocumentFontFamily } from '#/web/font-family.ts'
import { useRuntimeFontSettings } from '#/web/runtime-settings-fonts.ts'

export function GlobalFontFamilyProjection() {
  const { fontFamily } = useRuntimeFontSettings()

  useEffect(() => {
    applyDocumentFontFamily(document, fontFamily)
  }, [fontFamily])

  return null
}
```

In `src/web/main.tsx`, import and render it inside `QueryClientProvider`:

```tsx
import { GlobalFontFamilyProjection } from '#/web/components/GlobalFontFamilyProjection.tsx'
```

```tsx
<QueryClientProvider client={mainWindowQueryClient}>
  <GlobalFontFamilyProjection />
  <ResponsiveUiProvider>
    <MainWindowRouterProvider />
  </ResponsiveUiProvider>
  {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />}
</QueryClientProvider>
```

- [ ] **Step 5: Update CSS default token**

In `src/web/theme/contract.css`, replace default font tokens:

```css
  --font-sans: ui-monospace, 'SFMono-Regular', 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
  --font-mono: ui-monospace, 'SFMono-Regular', 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
```

Do not remove the Maple `@font-face` declarations from `src/web/styles.css`.

- [ ] **Step 6: Run font tests and verify pass**

Run:

```bash
bun run test src/web/font-family.test.ts src/web/theme/font-contract.test.ts
```

Expected: PASS.

## Task 5: General Settings UI and Localization

**Files:**
- Modify: `src/web/components/settings/pages/GeneralSettings.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/web/components/SettingsSurface.test.tsx`
- Test: `src/shared/i18n/dictionaries.test.ts`

- [ ] **Step 1: Write failing settings surface expectations**

In `src/web/components/SettingsSurface.test.tsx`, add `fontFamily: 'mono'` to every fake `settings.get`, `initialSettings`, and `goblinNative.initialSettings` object.

Add a test near other General settings tests:

```tsx
test('renders global font family setting from general settings', async () => {
  await render(<SettingsSurface page="general" onPageChange={() => {}} />)

  expect(document.body.textContent).toContain('settings.font-family')
  expect(document.body.textContent).toContain('settings.font-family-hint')
  expect(document.body.textContent).toContain('settings.font-family.mono')
  expect(document.body.textContent).toContain('settings.font-family.maple')
  expect(document.body.textContent).toContain('settings.font-family.system')
  expect(document.getElementById('settings-font-family')).not.toBeNull()
})
```

- [ ] **Step 2: Run UI/i18n tests and verify failure**

Run:

```bash
bun run test src/web/components/SettingsSurface.test.tsx src/shared/i18n/dictionaries.test.ts
```

Expected: FAIL because UI copy and settings row do not exist.

- [ ] **Step 3: Implement General settings row**

In `src/web/components/settings/pages/GeneralSettings.tsx`, import `FontFamilyPref` and `useFontSettingsController`:

```tsx
import type { FontFamilyPref, LangPref, ThemePref } from '#/shared/rpc.ts'
import { useRuntimeFontSettings, useFontSettingsController } from '#/web/runtime-settings-fonts.ts'
```

Add runtime read/controller in `GeneralSettings`:

```tsx
const { fontFamily } = useRuntimeFontSettings()
const { setFontFamily } = useFontSettingsController()
```

Add options after `appearanceOptions`:

```tsx
const fontFamilyOptions: { value: FontFamilyPref; labelKey: string }[] = [
  { value: 'mono', labelKey: 'settings.font-family.mono' },
  { value: 'maple', labelKey: 'settings.font-family.maple' },
  { value: 'system', labelKey: 'settings.font-family.system' },
]
```

Insert the settings row between Appearance and Language:

```tsx
<SettingsRow
  controlId="settings-font-family"
  label={t('settings.font-family')}
  hint={t('settings.font-family-hint')}
  control={
    <SettingsSelect<FontFamilyPref>
      id="settings-font-family"
      value={fontFamily}
      options={fontFamilyOptions.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
      onChange={(v) => void setFontFamily(v)}
    />
  }
/>
```

- [ ] **Step 4: Add i18n keys**

Add these keys to `src/shared/i18n/en.ts`:

```ts
'settings.font-family': 'Font',
'settings.font-family-hint': 'Controls the font used by the app interface and built-in terminal.',
'settings.font-family.mono': 'Mono',
'settings.font-family.maple': 'Maple Mono',
'settings.font-family.system': 'System font',
```

Add these keys to `src/shared/i18n/zh.ts`:

```ts
'settings.font-family': '字体',
'settings.font-family-hint': '控制应用界面和内置终端使用的字体。',
'settings.font-family.mono': 'Mono',
'settings.font-family.maple': 'Maple Mono',
'settings.font-family.system': '系统字体',
```

Add these keys to `src/shared/i18n/ko.ts`:

```ts
'settings.font-family': '글꼴',
'settings.font-family-hint': '앱 인터페이스와 내장 터미널에서 사용할 글꼴을 제어합니다.',
'settings.font-family.mono': 'Mono',
'settings.font-family.maple': 'Maple Mono',
'settings.font-family.system': '시스템 글꼴',
```

Add these keys to `src/shared/i18n/ja.ts`:

```ts
'settings.font-family': 'フォント',
'settings.font-family-hint': 'アプリのインターフェイスと内蔵ターミナルで使うフォントを制御します。',
'settings.font-family.mono': 'Mono',
'settings.font-family.maple': 'Maple Mono',
'settings.font-family.system': 'システムフォント',
```

- [ ] **Step 5: Run UI/i18n tests and verify pass**

Run:

```bash
bun run test src/web/components/SettingsSurface.test.tsx src/shared/i18n/dictionaries.test.ts
```

Expected: PASS.

## Task 6: Terminal Font Family Runtime Update

**Files:**
- Modify: `src/web/components/terminal/terminal-geometry.ts`
- Modify: `src/web/components/terminal/terminal-geometry.test.ts`
- Modify: `src/web/components/terminal/terminal-session-view.ts`
- Modify: `src/web/components/terminal/ManagedTerminalSession.ts`
- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`
- Modify: `src/web/components/terminal/TerminalSessionRegistry.ts`
- Modify: `src/web/components/terminal/TerminalSessionProvider.tsx`
- Modify: `src/web/components/terminal/TerminalSessionProvider.test.tsx`

- [ ] **Step 1: Re-read terminal diffs before editing**

Run:

```bash
git diff -- src/web/components/terminal/TerminalSessionProvider.tsx src/web/components/terminal/TerminalSessionProvider.test.tsx src/web/components/terminal/TerminalSessionRegistry.ts
```

Expected: shows existing unrelated local changes. Preserve them while editing.

- [ ] **Step 2: Write failing terminal geometry test**

In `src/web/components/terminal/terminal-geometry.test.ts`, update the measure cell test:

```ts
test('uses current font size and family when measuring cells', () => {
  const measureCell = vi.fn((fontSize: number, fontFamily: string) => ({
    width: fontFamily.includes('Maple') ? fontSize / 2 : fontSize,
    height: fontSize,
  }))

  expect(
    measureTerminalGeometry({
      host: measurableHost(700, 420),
      fontSize: 14,
      fontFamily: "'Maple Mono NF CN', monospace",
      measureCell,
    }),
  ).toEqual({ cols: 100, rows: 30 })
  expect(
    measureTerminalGeometry({
      host: measurableHost(700, 420),
      fontSize: 20,
      fontFamily: 'system-ui, sans-serif',
      measureCell,
    }),
  ).toEqual({ cols: 35, rows: 21 })
  expect(measureCell).toHaveBeenCalledWith(14, "'Maple Mono NF CN', monospace")
  expect(measureCell).toHaveBeenCalledWith(20, 'system-ui, sans-serif')
})
```

Update all other `measureTerminalGeometry` calls in the test file to pass:

```ts
fontFamily: 'ui-monospace, monospace',
```

- [ ] **Step 3: Write failing ManagedTerminalSession tests**

In `src/web/components/terminal/ManagedTerminalSession.test.ts`, update the first test expectation to default Mono:

```ts
expect(xtermMocks.terminals[0]!.options.fontFamily).toContain('ui-monospace')
```

Add a new test near the font size tests:

```ts
test('updates xterm font family and refits the terminal without restarting', async () => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const session = new ManagedTerminalSession(descriptor, vi.fn())
  hydrateManagedSession(session)

  session.attach(host)
  await flushTerminalStart()
  await flushUntil(() => session.snapshot().phase === 'open')

  const term = xtermMocks.terminals[0]!
  const fitAddon = xtermMocks.fitAddons[0]!
  fitAddon.fit.mockClear()
  terminalCalls.restart.mockClear()

  session.setFontFamily("'Maple Mono NF CN', ui-monospace, monospace")

  expect(term.options.fontFamily).toBe("'Maple Mono NF CN', ui-monospace, monospace")
  expect(fitAddon.fit).toHaveBeenCalledTimes(1)
  expect(terminalCalls.restart).not.toHaveBeenCalled()
})
```

- [ ] **Step 4: Run terminal tests and verify failure**

Run:

```bash
bun run test src/web/components/terminal/terminal-geometry.test.ts src/web/components/terminal/ManagedTerminalSession.test.ts
```

Expected: FAIL because terminal geometry and session classes do not accept runtime font family.

- [ ] **Step 5: Implement terminal geometry font family**

In `src/web/components/terminal/terminal-geometry.ts`, remove the hardcoded Maple constant and define the default Mono terminal stack:

```ts
export const DEFAULT_TERMINAL_FONT_FAMILY =
  "ui-monospace, 'SFMono-Regular', 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace"
```

Change the input type:

```ts
export function measureTerminalGeometry(input: {
  host: HTMLElement
  fontSize: number
  fontFamily?: string
  measureCell?: (fontSize: number, fontFamily: string) => { width: number; height: number } | null
}): TerminalGeometry | null {
  const rect = input.host.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null

  const fontFamily = input.fontFamily ?? DEFAULT_TERMINAL_FONT_FAMILY
  const cell = input.measureCell
    ? input.measureCell(input.fontSize, fontFamily)
    : measureTerminalCell(input.host, input.fontSize, fontFamily)
  if (!cell || cell.width <= 0 || cell.height <= 0) return null

  const cols = clamp(Math.floor(rect.width / cell.width), TERMINAL_SIZE_LIMITS.minCols, TERMINAL_SIZE_LIMITS.maxCols)
  const rows = clamp(Math.floor(rect.height / cell.height), TERMINAL_SIZE_LIMITS.minRows, TERMINAL_SIZE_LIMITS.maxRows)
  return normalizeTerminalSize(cols, rows)
}
```

Change `measureTerminalCell`:

```ts
function measureTerminalCell(host: HTMLElement, fontSize: number, fontFamily: string): { width: number; height: number } | null {
  const document = host.ownerDocument
  const body = document.body
  if (!body) return fallbackCell(fontSize)

  const probe = document.createElement('span')
  probe.textContent = 'MMMMMMMMMM'
  probe.style.position = 'absolute'
  probe.style.visibility = 'hidden'
  probe.style.whiteSpace = 'pre'
  probe.style.fontFamily = fontFamily
  probe.style.fontSize = `${fontSize}px`
  probe.style.lineHeight = '1'
  body.appendChild(probe)
  try {
    const rect = probe.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return fallbackCell(fontSize)
    return { width: rect.width / 10, height: rect.height }
  } finally {
    probe.remove()
  }
}
```

- [ ] **Step 6: Implement session/view font family setters**

In `src/web/components/terminal/terminal-session-view.ts`, replace the terminal geometry import with:

```ts
import {
  DEFAULT_TERMINAL_FONT_FAMILY,
  measureTerminalGeometry,
  type TerminalGeometry,
} from '#/web/components/terminal/terminal-geometry.ts'
```

Add a field:

```ts
private fontFamily: string
```

Initialize in constructor options:

```ts
options: { fontSize?: number; fontFamily?: string; terminalThemeMode?: () => TerminalThemeMode } = {},
```

```ts
this.fontFamily = options.fontFamily ?? DEFAULT_TERMINAL_FONT_FAMILY
```

Add setter:

```ts
setFontFamily(fontFamily: string): void {
  if (this.fontFamily === fontFamily) return
  this.fontFamily = fontFamily
  const term = this.term
  if (!term) return
  term.options.fontFamily = fontFamily
  this.fitForFontLoad(term)
}
```

Update geometry and xterm creation:

```ts
measureGeometry(): TerminalGeometry | null {
  return measureTerminalGeometry({ host: this.xtermHost, fontSize: this.fontSize, fontFamily: this.fontFamily })
}
```

```ts
fontFamily: this.fontFamily,
```

In `src/web/components/terminal/ManagedTerminalSession.ts`, import `DEFAULT_TERMINAL_FONT_FAMILY`, update constructor:

```ts
fontSize = DEFAULT_TERMINAL_FONT_SIZE,
fontFamily = DEFAULT_TERMINAL_FONT_FAMILY,
terminalThemeMode: () => TerminalThemeMode = () => 'theme',
```

Pass to view options:

```ts
}, { fontSize, fontFamily, terminalThemeMode })
```

Add:

```ts
setFontFamily(fontFamily: string): void {
  this.view.setFontFamily(fontFamily)
}
```

- [ ] **Step 7: Implement registry/provider propagation**

In `src/web/components/terminal/TerminalSessionRegistry.ts`, import `DEFAULT_TERMINAL_FONT_FAMILY`, add:

```ts
private terminalFontFamily = DEFAULT_TERMINAL_FONT_FAMILY
```

Add:

```ts
setFontFamily(fontFamily: string): void {
  if (this.terminalFontFamily === fontFamily) return
  this.terminalFontFamily = fontFamily
  for (const session of this.sessions.values()) session.setFontFamily(fontFamily)
}
```

When constructing `ManagedTerminalSession`, pass both `this.terminalFontSize` and `this.terminalFontFamily` before `this.getTerminalThemeMode`. If the constructor call currently looks different because of local changes, keep existing arguments and insert the font family argument in the new constructor position.

Where the registry calls `measureTerminalGeometry`, add:

```ts
fontFamily: this.terminalFontFamily,
```

In `src/web/components/terminal/TerminalSessionProvider.tsx`, import:

```ts
import { fontFamilyStackForPref } from '#/web/font-family.ts'
```

Use the font family runtime value:

```tsx
const { terminalFontSize, terminalThemeSyncEnabled = true, fontFamily } = useRuntimeTerminalSettings()
const terminalFontFamily = fontFamilyStackForPref(fontFamily).terminal
```

Add effect:

```tsx
useEffect(() => {
  registry.setFontFamily(terminalFontFamily)
}, [registry, terminalFontFamily])
```

- [ ] **Step 8: Run terminal tests and verify pass**

Run:

```bash
bun run test src/web/components/terminal/terminal-geometry.test.ts src/web/components/terminal/ManagedTerminalSession.test.ts src/web/components/terminal/TerminalSessionProvider.test.tsx
```

Expected: PASS.

## Task 7: Bootstrap Fixtures and Integration Test Cleanup

**Files:**
- Modify tests that construct settings snapshots manually:
  - `src/web/components/SettingsSurface.test.tsx`
  - `src/web/stores/session-restore.test.ts`
  - `src/web/components/repo-workspace/RepoExplorerPane.test.tsx`
  - any file found by the search command below

- [ ] **Step 1: Find manual settings fixtures missing `fontFamily`**

Run:

```bash
rg -n "initialSettings: \\{|settings\\.get|defaultSettingsSnapshot\\(\\{|fontFamily" "src"
```

Expected: list of files that construct settings data. Inspect each manually; only edit fixtures that use object literals requiring `SettingsPrefs`, `SettingsSnapshot`, or `InitialSettingsSnapshot`.

- [ ] **Step 2: Add `fontFamily` to manual fixtures**

For each manual fixture, add:

```ts
fontFamily: 'mono',
```

near `colorTheme`, `theme`, or `terminalFontSize`. For runtime test-specific cases, use the value required by the assertion, such as:

```ts
fontFamily: 'system',
```

- [ ] **Step 3: Run focused compile and settings tests**

Run:

```bash
bun run typecheck
```

Expected: PASS. If typecheck reports a missing `fontFamily` field, add it to the fixture or projection reported by the error.

Run:

```bash
bun run test src/shared/settings-defaults.test.ts src/shared/settings-snapshot.test.ts src/server/modules/settings-source.test.ts src/web/runtime-settings-hooks.test.tsx src/web/components/SettingsSurface.test.tsx src/web/font-family.test.ts src/web/theme/font-contract.test.ts
```

Expected: PASS.

## Task 8: Full Verification

**Files:**
- No new files expected.
- Modify only if verification exposes a defect in the touched files.

- [ ] **Step 1: Run architecture guard**

Run:

```bash
bun run check:architecture
```

Expected: PASS. If it fails, fix imports so `src/main/**` does not import web/server, `src/web/**` does not import main, and shared/server do not import Electron.

- [ ] **Step 2: Run full test suite**

Run:

```bash
bun run test
```

Expected: PASS.

- [ ] **Step 3: Run typecheck again**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 4: Manual runtime sanity check**

Start the app using the project’s normal dev command:

```bash
bun run dev
```

Expected: app starts without runtime errors. In `设置 > 通用`, the Font row appears between Appearance and Language. Selecting `Maple Mono` changes the UI and existing terminal output font without restarting terminal sessions. Selecting `System font` changes app UI and terminal output to the system UI stack. Selecting `Mono` returns both to the default system monospace stack.

Stop the dev server after the check.
