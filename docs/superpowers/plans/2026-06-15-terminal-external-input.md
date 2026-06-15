# Terminal External Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional external terminal input box and extend custom terminal buttons with per-button action modes.

**Architecture:** Store two terminal UI preferences in settings, keep button data backward-compatible, and render input/buttons from `TerminalSlot` only for writable controller sessions. Remove the previous xterm current-line character-operation wiring while preserving terminal display improvements such as search, viewer overlays, progress, drag/drop, mobile toolbar, and bottom spacing.

**Tech Stack:** React, TypeScript strip-only mode, Vitest, Bun, existing settings runtime cache, xterm renderer boundary.

**Repository Constraint:** Do not add git commit steps. AGENTS.md says not to plan or execute commits unless the user explicitly asks.

---

## Scope Check

This is one vertical feature: settings persistence, settings UI, terminal UI behavior, and removal of obsolete native enhanced-input wiring. It does not require server protocol changes or package changes.

Before executing any file deletion step, show the AGENTS.md dangerous-operation confirmation because deleting files is high-risk. The deletion candidates are listed in Task 5.

## File Structure

- Modify `src/shared/settings.ts`: add terminal input/button visibility prefs and button action type.
- Modify `src/shared/rpc.ts`: re-export the button action type.
- Modify `src/shared/settings-defaults.ts`: add defaults and initial snapshot fields.
- Modify `src/shared/settings-snapshot.ts`: include new prefs in runtime/settings snapshots.
- Modify `src/shared/bootstrap.ts`: include new fields in initial settings snapshot type.
- Modify `src/server/modules/settings-source.ts`: normalize new prefs and button actions.
- Modify `src/web/settings-client.ts`: add client write helpers for the two booleans.
- Modify `src/web/settings-write-paths.ts`: update runtime cache after writing the booleans.
- Modify `src/web/settings-read-projection.ts`: expose terminal settings projection.
- Modify `src/web/runtime-settings-terminal-buttons.ts`: keep existing button hook and add terminal settings/controller APIs.
- Modify `src/web/components/settings/pages/TerminalSettings.tsx`: add switches and button action selector.
- Modify i18n dictionaries under `src/shared/i18n/*.ts`: add settings labels and mode text.
- Create `src/web/components/terminal/terminal-external-input.tsx`: controlled single-line input.
- Modify `src/web/components/terminal/TerminalSlot.tsx`: render input and button action behavior.
- Modify `src/web/components/terminal/terminal-session.css`: bottom dock and input/button layout.
- Modify `src/web/components/terminal/types.ts`, `ManagedTerminalSession.ts`, `terminal-session-view.ts`: remove obsolete native enhanced-input attachment path.
- Delete obsolete enhanced-input files after confirmation:
  - `src/web/components/terminal/terminal-enhanced-input-controller.ts`
  - `src/web/components/terminal/terminal-enhanced-input-controller.test.ts`
  - `src/web/components/terminal/terminal-enhanced-input-keyboard.ts`
  - `src/web/components/terminal/terminal-enhanced-input-keyboard.test.ts`
  - `src/web/components/terminal/terminal-enhanced-input-model.ts`
  - `src/web/components/terminal/terminal-enhanced-input-model.test.ts`
  - `src/web/components/terminal/terminal-enhanced-input-overlay.ts`
  - `src/web/components/terminal/terminal-enhanced-input-overlay.test.ts`

## Task 1: Shared Settings Shape

**Files:**
- Modify: `src/shared/settings.ts`
- Modify: `src/shared/rpc.ts`
- Modify: `src/shared/settings-defaults.ts`
- Modify: `src/shared/settings-snapshot.ts`
- Modify: `src/shared/bootstrap.ts`
- Test: `src/shared/settings-snapshot.test.ts`

- [ ] **Step 1: Write failing shared snapshot coverage**

  Update `src/shared/settings-snapshot.test.ts` fixture prefs and expectations so new fields must exist. In the first test, add these fields to `prefs`:

  ```ts
  terminalExternalInputEnabled: true,
  terminalCustomButtonsVisible: false,
  terminalCustomButtons: [{ label: 'status', value: 'git status --short', action: 'input' }],
  ```

  And add these expected fields:

  ```ts
  terminalExternalInputEnabled: true,
  terminalCustomButtonsVisible: false,
  terminalCustomButtons: [{ label: 'status', value: 'git status --short', action: 'input' }],
  ```

  In the full snapshot test, add these prefs:

  ```ts
  terminalExternalInputEnabled: false,
  terminalCustomButtonsVisible: true,
  terminalCustomButtons: [{ label: 'status', value: 'git status --short', action: 'execute' }],
  ```

  Extend the runtime assertion:

  ```ts
  expect(runtimeSettingsSnapshotFromSettingsSnapshot(snapshot)).toMatchObject({
    globalShortcutRegistered: false,
    terminalExternalInputEnabled: false,
    terminalCustomButtonsVisible: true,
    terminalCustomButtons: [{ label: 'status', value: 'git status --short', action: 'execute' }],
  })
  ```

- [ ] **Step 2: Run shared test and verify it fails**

  Run:

  ```bash
  bun run test src/shared/settings-snapshot.test.ts
  ```

  Expected: TypeScript/Vitest failure because `SettingsPrefs` does not yet include `terminalExternalInputEnabled`, `terminalCustomButtonsVisible`, or button `action`.

- [ ] **Step 3: Extend shared settings types**

  In `src/shared/settings.ts`, replace the button interface with:

  ```ts
  export type TerminalCustomButtonAction = 'execute' | 'input'

  export interface TerminalCustomButton {
    label: string
    value: string
    action?: TerminalCustomButtonAction
  }
  ```

  Add fields to `SettingsPrefs` after `editorApp`:

  ```ts
  terminalExternalInputEnabled: boolean
  terminalCustomButtonsVisible: boolean
  terminalCustomButtons: TerminalCustomButton[]
  ```

- [ ] **Step 4: Add defaults**

  In `src/shared/rpc.ts`, add `TerminalCustomButtonAction` to both the import and export type lists from `#/shared/settings.ts`:

  ```ts
  TerminalCustomButtonAction,
  ```

  This keeps existing repo-alias imports such as `import type { TerminalCustomButtonAction } from '#/shared/rpc.ts'` valid.

- [ ] **Step 5: Add defaults**

  In `src/shared/settings-defaults.ts`, add constants near `DEFAULT_TERMINAL_CUSTOM_BUTTONS`:

  ```ts
  export const DEFAULT_TERMINAL_EXTERNAL_INPUT_ENABLED = false
  export const DEFAULT_TERMINAL_CUSTOM_BUTTONS_VISIBLE = true
  export const DEFAULT_TERMINAL_CUSTOM_BUTTONS: TerminalCustomButton[] = []
  ```

  Add to `defaultSettingsPrefs()` before `terminalCustomButtons`:

  ```ts
  terminalExternalInputEnabled:
    overrides.terminalExternalInputEnabled ?? DEFAULT_TERMINAL_EXTERNAL_INPUT_ENABLED,
  terminalCustomButtonsVisible:
    overrides.terminalCustomButtonsVisible ?? DEFAULT_TERMINAL_CUSTOM_BUTTONS_VISIBLE,
  terminalCustomButtons: overrides.terminalCustomButtons ?? DEFAULT_TERMINAL_CUSTOM_BUTTONS,
  ```

  Add both fields to the `initialSettingsFromSnapshot()` Pick and return object:

  ```ts
  | 'terminalExternalInputEnabled'
  | 'terminalCustomButtonsVisible'
  ```

  ```ts
  terminalExternalInputEnabled: snapshot.terminalExternalInputEnabled,
  terminalCustomButtonsVisible: snapshot.terminalCustomButtonsVisible,
  ```

- [ ] **Step 6: Include fields in snapshot partition helpers**

  In `src/shared/settings-snapshot.ts`, add both fields to `buildRuntimeSettingsSnapshot()`:

  ```ts
  terminalExternalInputEnabled: input.prefs.terminalExternalInputEnabled,
  terminalCustomButtonsVisible: input.prefs.terminalCustomButtonsVisible,
  ```

  Add both fields to the `runtimeSettingsSnapshotFromSettingsSnapshot()` Pick and return object:

  ```ts
  | 'terminalExternalInputEnabled'
  | 'terminalCustomButtonsVisible'
  ```

  ```ts
  terminalExternalInputEnabled: snapshot.terminalExternalInputEnabled,
  terminalCustomButtonsVisible: snapshot.terminalCustomButtonsVisible,
  ```

- [ ] **Step 7: Update initial bootstrap type**

  In `src/shared/bootstrap.ts`, add to `InitialSettingsSnapshot`:

  ```ts
  terminalExternalInputEnabled: boolean
  terminalCustomButtonsVisible: boolean
  ```

- [ ] **Step 8: Run shared test and typecheck**

  Run:

  ```bash
  bun run test src/shared/settings-snapshot.test.ts
  bun run typecheck
  ```

  Expected: shared snapshot test passes. Typecheck may still fail in unrelated fixtures that need the two new fields; update those fixtures by adding:

  ```ts
  terminalExternalInputEnabled: false,
  terminalCustomButtonsVisible: true,
  ```

  Then rerun `bun run typecheck`.

- [ ] **Step 9: Checkpoint**

  Run:

  ```bash
  git status --short
  ```

  Expected: only shared settings files and affected fixture tests changed for this task.

## Task 2: Server Normalization and Runtime Write Paths

**Files:**
- Modify: `src/server/modules/settings-source.ts`
- Test: `src/server/modules/settings-source.test.ts`
- Modify: `src/web/settings-client.ts`
- Modify: `src/web/settings-write-paths.ts`
- Test: `src/web/settings-write-paths.test.ts`
- Modify: `src/web/settings-read-projection.ts`
- Modify: `src/web/runtime-settings-terminal-buttons.ts`

- [ ] **Step 1: Write failing server normalization tests**

  In `src/server/modules/settings-source.test.ts`, update the first default expectation:

  ```ts
  terminalExternalInputEnabled: false,
  terminalCustomButtonsVisible: true,
  terminalCustomButtons: [],
  ```

  In `persists updates...`, add patch fields:

  ```ts
  terminalExternalInputEnabled: true,
  terminalCustomButtonsVisible: false,
  terminalCustomButtons: [
    { label: ' status ', value: ' git status --short\n', action: 'input' },
    { label: '', value: 'ignored', action: 'execute' },
    { label: 'empty', value: '   ', action: 'input' },
    { label: 'test', value: 'bun run test', action: 'bad-value' as never },
  ],
  ```

  Update the reloaded expectation:

  ```ts
  terminalExternalInputEnabled: true,
  terminalCustomButtonsVisible: false,
  terminalCustomButtons: [
    { label: 'status', value: ' git status --short\n', action: 'input' },
    { label: 'test', value: 'bun run test', action: 'execute' },
  ],
  ```

  In the 20-button test, expect explicit actions:

  ```ts
  expect(prefs.terminalCustomButtons[0]).toEqual({ label: 'button-0', value: 'echo 0', action: 'execute' })
  expect(prefs.terminalCustomButtons[19]).toEqual({ label: 'button-19', value: 'echo 19', action: 'execute' })
  ```

- [ ] **Step 2: Run server test and verify it fails**

  Run:

  ```bash
  bun run test src/server/modules/settings-source.test.ts
  ```

  Expected: failures because new settings fields and action normalization are not implemented.

- [ ] **Step 3: Implement server normalization**

  In `src/server/modules/settings-source.ts`, import the action type:

  ```ts
  import type {
    EditorPref,
    LangPref,
    SessionState,
    SettingsPrefs,
    TerminalCustomButton,
    TerminalCustomButtonAction,
    TerminalPref,
    ThemePref,
  } from '#/shared/rpc.ts'
  ```

  Add fields to `ServerSettingsData`:

  ```ts
  terminalExternalInputEnabled: boolean
  terminalCustomButtonsVisible: boolean
  ```

  Add helpers:

  ```ts
  function normalizeTerminalExternalInputEnabled(value: unknown): boolean {
    return value === true
  }

  function normalizeTerminalCustomButtonsVisible(value: unknown): boolean {
    return value !== false
  }

  function normalizeTerminalCustomButtonAction(value: unknown): TerminalCustomButtonAction {
    return value === 'input' ? 'input' : 'execute'
  }
  ```

  Update `normalizeTerminalCustomButtons()` push:

  ```ts
  normalized.push({ label, value: button.value, action: normalizeTerminalCustomButtonAction(button.action) })
  ```

  Add new fields in `settingsPrefsFromData()`:

  ```ts
  terminalExternalInputEnabled: data.terminalExternalInputEnabled,
  terminalCustomButtonsVisible: data.terminalCustomButtonsVisible,
  ```

  Add new fields in `readServerSettingsFile()`:

  ```ts
  terminalExternalInputEnabled: normalizeTerminalExternalInputEnabled(parsed.terminalExternalInputEnabled),
  terminalCustomButtonsVisible: normalizeTerminalCustomButtonsVisible(parsed.terminalCustomButtonsVisible),
  ```

  In `updateServerSettingsPrefs()`, compute:

  ```ts
  const nextTerminalExternalInputEnabled =
    patch.terminalExternalInputEnabled === undefined
      ? data.terminalExternalInputEnabled
      : normalizeTerminalExternalInputEnabled(patch.terminalExternalInputEnabled)
  const nextTerminalCustomButtonsVisible =
    patch.terminalCustomButtonsVisible === undefined
      ? data.terminalCustomButtonsVisible
      : normalizeTerminalCustomButtonsVisible(patch.terminalCustomButtonsVisible)
  ```

  Add both to `changed` and assign them before writing:

  ```ts
  data.terminalExternalInputEnabled !== nextTerminalExternalInputEnabled ||
  data.terminalCustomButtonsVisible !== nextTerminalCustomButtonsVisible ||
  ```

  ```ts
  data.terminalExternalInputEnabled = nextTerminalExternalInputEnabled
  data.terminalCustomButtonsVisible = nextTerminalCustomButtonsVisible
  ```

- [ ] **Step 4: Run server test**

  Run:

  ```bash
  bun run test src/server/modules/settings-source.test.ts
  ```

  Expected: PASS.

- [ ] **Step 5: Write failing write-path tests**

  In `src/web/settings-write-paths.test.ts`, extend the mocks:

  ```ts
  setTerminalExternalInputEnabled: vi.fn(async () => undefined),
  setTerminalCustomButtonsVisible: vi.fn(async () => undefined),
  ```

  Add tests:

  ```ts
  test('setTerminalExternalInputEnabledPreference updates runtime settings cache', async () => {
    mainWindowQueryClient.setQueryData(settingsSnapshotQueryKey(), defaultSettingsSnapshot())
    const { setTerminalExternalInputEnabledPreference } = await import('#/web/settings-write-paths.ts')

    await setTerminalExternalInputEnabledPreference(true)

    expect(appDataClientMocks.setTerminalExternalInputEnabled).toHaveBeenCalledWith(true)
    expect(mainWindowQueryClient.getQueryData(settingsSnapshotQueryKey())).toMatchObject({
      terminalExternalInputEnabled: true,
    })
  })

  test('setTerminalCustomButtonsVisiblePreference updates runtime settings cache', async () => {
    mainWindowQueryClient.setQueryData(settingsSnapshotQueryKey(), defaultSettingsSnapshot())
    const { setTerminalCustomButtonsVisiblePreference } = await import('#/web/settings-write-paths.ts')

    await setTerminalCustomButtonsVisiblePreference(false)

    expect(appDataClientMocks.setTerminalCustomButtonsVisible).toHaveBeenCalledWith(false)
    expect(mainWindowQueryClient.getQueryData(settingsSnapshotQueryKey())).toMatchObject({
      terminalCustomButtonsVisible: false,
    })
  })
  ```

- [ ] **Step 6: Run write-path test and verify it fails**

  Run:

  ```bash
  bun run test src/web/settings-write-paths.test.ts
  ```

  Expected: failures because client and write path functions do not exist.

- [ ] **Step 7: Implement client and write paths**

  In `src/web/settings-client.ts`, add:

  ```ts
  export async function setTerminalExternalInputEnabled(enabled: boolean): Promise<void> {
    await updateSettingsPrefsPatch({ terminalExternalInputEnabled: enabled })
  }

  export async function setTerminalCustomButtonsVisible(visible: boolean): Promise<void> {
    await updateSettingsPrefsPatch({ terminalCustomButtonsVisible: visible })
  }
  ```

  In `src/web/settings-write-paths.ts`, import both and add:

  ```ts
  export async function setTerminalExternalInputEnabledPreference(enabled: boolean): Promise<void> {
    await setTerminalExternalInputEnabled(enabled)
    updateRuntimeSettingsSnapshotCache(mainWindowQueryClient, (current) => ({
      ...current,
      terminalExternalInputEnabled: enabled,
    }))
  }

  export async function setTerminalCustomButtonsVisiblePreference(visible: boolean): Promise<void> {
    await setTerminalCustomButtonsVisible(visible)
    updateRuntimeSettingsSnapshotCache(mainWindowQueryClient, (current) => ({
      ...current,
      terminalCustomButtonsVisible: visible,
    }))
  }
  ```

- [ ] **Step 8: Add runtime projections and controller**

  In `src/web/settings-read-projection.ts`, add:

  ```ts
  export function readRuntimeTerminalSettings(data: RuntimeSettingsSnapshot | undefined) {
    const fallback = fallbackInitialSettings()
    return {
      terminalExternalInputEnabled:
        data?.terminalExternalInputEnabled ?? fallback?.terminalExternalInputEnabled ?? false,
      terminalCustomButtonsVisible:
        data?.terminalCustomButtonsVisible ?? fallback?.terminalCustomButtonsVisible ?? true,
      terminalCustomButtons: data?.terminalCustomButtons ?? fallback?.terminalCustomButtons ?? [],
    }
  }
  ```

  Keep `readRuntimeTerminalCustomButtons()` for existing callers:

  ```ts
  export function readRuntimeTerminalCustomButtons(data: RuntimeSettingsSnapshot | undefined) {
    return readRuntimeTerminalSettings(data).terminalCustomButtons
  }
  ```

  In `src/web/runtime-settings-terminal-buttons.ts`, add:

  ```ts
  import {
    readRuntimeTerminalCustomButtons,
    readRuntimeTerminalSettings,
    useRuntimeSettingsSnapshot,
  } from '#/web/settings-read-projection.ts'
  ```

  Extend write imports:

  ```ts
  setTerminalCustomButtonsVisiblePreference,
  setTerminalExternalInputEnabledPreference,
  ```

  Add:

  ```ts
  export function useRuntimeTerminalSettings() {
    return readRuntimeTerminalSettings(useRuntimeSettingsSnapshot())
  }
  ```

  Extend `useTerminalCustomButtonsController()` return object:

  ```ts
  async setTerminalExternalInputEnabled(enabled: boolean): Promise<void> {
    await runSettingsControllerAction('terminal external input update', async () => {
      await setTerminalExternalInputEnabledPreference(enabled)
    })
  },
  async setTerminalCustomButtonsVisible(visible: boolean): Promise<void> {
    await runSettingsControllerAction('terminal custom buttons visibility update', async () => {
      await setTerminalCustomButtonsVisiblePreference(visible)
    })
  },
  ```

- [ ] **Step 9: Run runtime tests**

  Run:

  ```bash
  bun run test src/server/modules/settings-source.test.ts
  bun run test src/web/settings-write-paths.test.ts
  bun run typecheck
  ```

  Expected: PASS after fixture updates.

- [ ] **Step 10: Checkpoint**

  Run:

  ```bash
  git diff -- src/server/modules/settings-source.ts src/web/settings-client.ts src/web/settings-write-paths.ts src/web/settings-read-projection.ts src/web/runtime-settings-terminal-buttons.ts
  ```

  Expected: only settings normalization/projection/write-path changes.

## Task 3: Terminal Settings UI

**Files:**
- Modify: `src/web/components/settings/pages/TerminalSettings.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Test: `src/web/components/SettingsSurface.test.tsx`
- Test: `src/shared/i18n/dictionaries.test.ts`

- [ ] **Step 1: Write failing settings UI test**

  In `src/web/components/SettingsSurface.test.tsx`, extend `edits terminal custom buttons from settings`:

  After render, assert the new text keys exist:

  ```ts
  expect(document.body.textContent).toContain('settings.terminal-input.title')
  expect(document.body.textContent).toContain('settings.terminal-external-input')
  expect(document.body.textContent).toContain('settings.terminal-custom-buttons.visible')
  ```

  After adding a button, find the action select trigger by id:

  ```ts
  const actionTrigger = document.getElementById('terminal-custom-button-action-0')
  expect(actionTrigger).toBeTruthy()
  ```

  Update the request-body assertion to require explicit action:

  ```ts
  return (
    String(options?.body ?? '').includes('terminalCustomButtons') &&
    String(options?.body ?? '').includes('"action":"execute"')
  )
  ```

  Add a separate switch test:

  ```ts
  test('toggles terminal external input and custom button visibility from settings', async () => {
    await render(<SettingsSurface page="terminal" onPageChange={() => {}} />)

    const externalInputSwitch = document.getElementById('settings-terminal-external-input')
    const buttonsVisibleSwitch = document.getElementById('settings-terminal-custom-buttons-visible')
    if (!(externalInputSwitch instanceof HTMLButtonElement) || !(buttonsVisibleSwitch instanceof HTMLButtonElement)) {
      throw new Error('Missing terminal switches')
    }

    await act(async () => {
      externalInputSwitch.click()
      buttonsVisibleSwitch.click()
      await Promise.resolve()
    })

    expect(
      fetchMock.mock.calls.some((call) => {
        const [, options] = call as unknown as [unknown, RequestInit | undefined]
        return String(options?.body ?? '').includes('terminalExternalInputEnabled')
      }),
    ).toBe(true)
    expect(
      fetchMock.mock.calls.some((call) => {
        const [, options] = call as unknown as [unknown, RequestInit | undefined]
        return String(options?.body ?? '').includes('terminalCustomButtonsVisible')
      }),
    ).toBe(true)
  })
  ```

- [ ] **Step 2: Run UI test and verify it fails**

  Run:

  ```bash
  bun run test src/web/components/SettingsSurface.test.tsx
  ```

  Expected: failures because switches/action select do not exist.

- [ ] **Step 3: Update i18n dictionaries**

  Add these keys to `en.ts`, `zh.ts`, `ja.ts`, and `ko.ts`. Use accurate translations where existing file language is clear; otherwise use concise English fallback for ja/ko to keep dictionary completeness.

  ```ts
  'settings.terminal-input.title': 'Terminal input',
  'settings.terminal-input.hint': 'Use an external input box without replacing native terminal input.',
  'settings.terminal-external-input': 'External input box',
  'settings.terminal-external-input-hint': 'Show a single-line command input at the bottom of writable terminal sessions.',
  'settings.terminal-custom-buttons.visible': 'Show custom buttons',
  'settings.terminal-custom-buttons.visible-hint': 'Hide or show the terminal custom button bar without deleting configured buttons.',
  'settings.terminal-custom-buttons.action': 'Action',
  'settings.terminal-custom-buttons.action-execute': 'Run immediately',
  'settings.terminal-custom-buttons.action-input': 'Fill input box',
  ```

  In `zh.ts`, use:

  ```ts
  'settings.terminal-input.title': '终端输入',
  'settings.terminal-input.hint': '使用外部输入框增强编辑能力，同时保留原生终端输入。',
  'settings.terminal-external-input': '外部输入框',
  'settings.terminal-external-input-hint': '在可控制终端底部显示单行命令输入框。',
  'settings.terminal-custom-buttons.visible': '显示自定义按钮',
  'settings.terminal-custom-buttons.visible-hint': '隐藏或显示终端自定义按钮栏，不删除已配置按钮。',
  'settings.terminal-custom-buttons.action': '动作',
  'settings.terminal-custom-buttons.action-execute': '直接执行',
  'settings.terminal-custom-buttons.action-input': '填入输入框',
  ```

  Update existing custom button hint to mention both modes:

  ```ts
  'settings.terminal-custom-buttons.hint': '在终端底部显示按钮栏。按钮可配置为直接执行，或填入外部输入框后再编辑发送。',
  ```

- [ ] **Step 4: Implement TerminalSettings switches and action mode**

  In `TerminalSettings.tsx`, import `Switch`, `SettingsList`, `SettingsRow`, and `SettingsSelect`:

  ```ts
  import { Switch } from '#/web/components/ui/switch.tsx'
  import {
    SettingsCard,
    SettingsGroup,
    SettingsList,
    SettingsListItem,
    SettingsRow,
    SettingsSelect,
  } from '#/web/components/settings/SettingsPrimitives.tsx'
  ```

  Replace the runtime hook usage:

  ```ts
  const { terminalCustomButtons: buttons, terminalExternalInputEnabled, terminalCustomButtonsVisible } =
    useRuntimeTerminalSettings()
  ```

  Extend editable rows:

  ```ts
  type EditableTerminalCustomButton = TerminalCustomButton & {
    id: string
    action: 'execute' | 'input'
  }
  ```

  Normalize rows:

  ```ts
  function actionFromButton(button: TerminalCustomButton): 'execute' | 'input' {
    return button.action === 'input' ? 'input' : 'execute'
  }

  function editableFromButtons(buttons: TerminalCustomButton[]): EditableTerminalCustomButton[] {
    return buttons.map((button, index) => ({
      id: `${index}:${button.label}:${button.value}:${actionFromButton(button)}`,
      label: button.label,
      value: button.value,
      action: actionFromButton(button),
    }))
  }

  function validButtons(rows: EditableTerminalCustomButton[]): TerminalCustomButton[] {
    return rows
      .map((row) => ({ label: row.label.trim(), value: row.value, action: row.action }))
      .filter((row) => row.label.length > 0 && row.value.trim().length > 0)
      .slice(0, 20)
  }
  ```

  Pull controller methods:

  ```ts
  const { setTerminalCustomButtons, setTerminalExternalInputEnabled, setTerminalCustomButtonsVisible } =
    useTerminalCustomButtonsController()
  ```

  Render the input group before the custom buttons group:

  ```tsx
  <>
    <SettingsGroup label={t('settings.terminal-input.title')} hint={t('settings.terminal-input.hint')}>
      <SettingsList>
        <SettingsRow
          controlId="settings-terminal-external-input"
          label={t('settings.terminal-external-input')}
          hint={t('settings.terminal-external-input-hint')}
          control={
            <Switch
              id="settings-terminal-external-input"
              checked={terminalExternalInputEnabled}
              onCheckedChange={(enabled) => void setTerminalExternalInputEnabled(enabled)}
              aria-label={t('settings.terminal-external-input')}
            />
          }
        />
      </SettingsList>
    </SettingsGroup>
    {/* existing custom button group follows */}
  </>
  ```

  Inside the custom buttons group, add a visibility switch before rows:

  ```tsx
  <SettingsList>
    <SettingsRow
      controlId="settings-terminal-custom-buttons-visible"
      label={t('settings.terminal-custom-buttons.visible')}
      hint={t('settings.terminal-custom-buttons.visible-hint')}
      control={
        <Switch
          id="settings-terminal-custom-buttons-visible"
          checked={terminalCustomButtonsVisible}
          onCheckedChange={(visible) => void setTerminalCustomButtonsVisible(visible)}
          aria-label={t('settings.terminal-custom-buttons.visible')}
        />
      }
    />
  </SettingsList>
  ```

  When adding a row, include action:

  ```ts
  updateRows([...rows, { id: `new:${Date.now()}`, label: '', value: '', action: 'execute' }])
  ```

  In each custom button row, add action select below textarea:

  ```tsx
  <SettingsSelect
    id={`terminal-custom-button-action-${index}`}
    value={row.action}
    options={[
      { value: 'execute', label: t('settings.terminal-custom-buttons.action-execute') },
      { value: 'input', label: t('settings.terminal-custom-buttons.action-input') },
    ]}
    onChange={(action) => {
      const nextRows = rows.map((item) => (item.id === row.id ? { ...item, action } : item))
      updateRows(nextRows)
    }}
  />
  ```

- [ ] **Step 5: Run settings and i18n tests**

  Run:

  ```bash
  bun run test src/web/components/SettingsSurface.test.tsx
  bun run test src/shared/i18n/dictionaries.test.ts
  bun run typecheck
  ```

  Expected: PASS.

- [ ] **Step 6: Checkpoint**

  Run:

  ```bash
  git diff -- src/web/components/settings/pages/TerminalSettings.tsx src/shared/i18n/en.ts src/shared/i18n/zh.ts src/shared/i18n/ja.ts src/shared/i18n/ko.ts
  ```

  Expected: settings UI has two groups and each button row includes action selection.

## Task 4: Terminal External Input UI and Button Actions

**Files:**
- Create: `src/web/components/terminal/terminal-external-input.tsx`
- Modify: `src/web/components/terminal/TerminalSlot.tsx`
- Modify: `src/web/components/terminal/terminal-session.css`
- Test: `src/web/components/terminal/TerminalSlot.test.tsx`

- [ ] **Step 1: Write failing TerminalSlot runtime settings mock**

  In `TerminalSlot.test.tsx`, update hoisted settings:

  ```ts
  const runtimeSettingsMocks = vi.hoisted(() => ({
    terminalExternalInputEnabled: false,
    terminalCustomButtonsVisible: true,
    terminalCustomButtons: [] as { label: string; value: string; action?: 'execute' | 'input' }[],
  }))
  ```

  Update mock module:

  ```ts
  vi.mock('#/web/runtime-settings-terminal-buttons.ts', () => ({
    useRuntimeTerminalCustomButtons: () => runtimeSettingsMocks.terminalCustomButtons,
    useRuntimeTerminalSettings: () => ({
      terminalExternalInputEnabled: runtimeSettingsMocks.terminalExternalInputEnabled,
      terminalCustomButtonsVisible: runtimeSettingsMocks.terminalCustomButtonsVisible,
      terminalCustomButtons: runtimeSettingsMocks.terminalCustomButtons,
    }),
  }))
  ```

  Reset booleans in `afterEach()`:

  ```ts
  runtimeSettingsMocks.terminalExternalInputEnabled = false
  runtimeSettingsMocks.terminalCustomButtonsVisible = true
  runtimeSettingsMocks.terminalCustomButtons = []
  ```

- [ ] **Step 2: Write failing terminal UI tests**

  Add tests to `TerminalSlot.test.tsx`:

  ```ts
  test('renders external input when enabled for writable controller sessions', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    runtimeSettingsMocks.terminalExternalInputEnabled = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const writeInput = vi.fn()
    const { worktreeSnapshot, snapshot } = controllerFixture()
    const context = terminalContext({ writeInput })
    const readContext: TerminalSessionReadContextValue = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => snapshot,
      subscribeSnapshot: () => () => {},
    }

    await act(async () => {
      root.render(
        <TerminalSessionContext.Provider value={context}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot="/repo" branch="feature" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      const input = container.querySelector('.goblin-terminal-external-input__control')
      expect(input).toBeInstanceOf(HTMLInputElement)
      await act(async () => {
        setInputValue(input as HTMLInputElement, 'git status --short')
        input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      })
      expect(writeInput).toHaveBeenCalledWith('terminal-1', 'git status --short\r')
      expect((input as HTMLInputElement).value).toBe('')
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })
  ```

  Add helper near other test helpers if not already present:

  ```ts
  function setInputValue(input: HTMLInputElement, value: string) {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }
  ```

  Add tests for empty input, hidden readonly input, button visibility off, execute action, and input action:

  ```ts
  test('fills external input from input-mode custom button', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    runtimeSettingsMocks.terminalExternalInputEnabled = true
    runtimeSettingsMocks.terminalCustomButtons = [{ label: 'commit', value: 'git commit -m ""', action: 'input' }]
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const writeInput = vi.fn()
    const { worktreeSnapshot, snapshot } = controllerFixture()
    const context = terminalContext({ writeInput })
    const readContext: TerminalSessionReadContextValue = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => snapshot,
      subscribeSnapshot: () => () => {},
    }

    await act(async () => {
      root.render(
        <TerminalSessionContext.Provider value={context}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot="/repo" branch="feature" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      const button = Array.from(container.querySelectorAll('button')).find((node) => node.textContent === 'commit')
      await act(async () => {
        button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      const input = container.querySelector('.goblin-terminal-external-input__control') as HTMLInputElement | null
      expect(input?.value).toBe('git commit -m ""')
      expect(writeInput).not.toHaveBeenCalled()
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })
  ```

  Keep the existing custom button test but update expectation to include explicit `\r` for `execute`.

- [ ] **Step 3: Run TerminalSlot test and verify it fails**

  Run:

  ```bash
  bun run test src/web/components/terminal/TerminalSlot.test.tsx
  ```

  Expected: failures because external input component and runtime hook usage are not implemented.

- [ ] **Step 4: Create external input component**

  Create `src/web/components/terminal/terminal-external-input.tsx`:

  ```tsx
  import { forwardRef, type KeyboardEvent } from 'react'

  interface TerminalExternalInputProps {
    value: string
    placeholder: string
    onChange: (value: string) => void
    onSubmit: (value: string) => void
  }

  export const TerminalExternalInput = forwardRef<HTMLInputElement, TerminalExternalInputProps>(
    function TerminalExternalInput({ value, placeholder, onChange, onSubmit }, ref) {
      function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
        if (event.key !== 'Enter') return
        event.preventDefault()
        onSubmit(value)
      }

      return (
        <label className="goblin-terminal-external-input">
          <span className="goblin-terminal-external-input__prefix">$</span>
          <input
            ref={ref}
            className="goblin-terminal-external-input__control"
            value={value}
            placeholder={placeholder}
            aria-label={placeholder}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          <span className="goblin-terminal-external-input__hint">Enter</span>
        </label>
      )
    },
  )
  ```

- [ ] **Step 5: Wire TerminalSlot state and behavior**

  In `TerminalSlot.tsx`, import refs and hook/component:

  ```ts
  import { useCallback, useEffect, useLayoutEffect, useRef, useState, ... } from 'react'
  import { TerminalExternalInput } from '#/web/components/terminal/terminal-external-input.tsx'
  import { useRuntimeTerminalSettings } from '#/web/runtime-settings-terminal-buttons.ts'
  ```

  Replace custom-buttons hook usage:

  ```ts
  const { terminalExternalInputEnabled, terminalCustomButtonsVisible, terminalCustomButtons } =
    useRuntimeTerminalSettings()
  const externalInputRef = useRef<HTMLInputElement | null>(null)
  const [externalInputValue, setExternalInputValue] = useState('')
  ```

  Remove `enhancedInput` computation and attach handler property:

  ```ts
  attach(descriptor, host, { onRevealPath })
  ```

  Add derived flags:

  ```ts
  const showExternalInput = isController && terminalExternalInputEnabled && !!key
  const visibleCustomButtons =
    isController && terminalCustomButtonsVisible
      ? terminalCustomButtons.filter((button) => button.label.trim() && button.value.trim())
      : []
  const hasBottomDock = showExternalInput || visibleCustomButtons.length > 0
  ```

  Add submit/fill callbacks:

  ```ts
  const submitExternalInput = useCallback(
    (value: string) => {
      if (!key || value.trim().length === 0) return
      writeInput(key, `${value}\r`)
      setExternalInputValue('')
    },
    [key, writeInput],
  )

  const fillExternalInput = useCallback((value: string) => {
    setExternalInputValue(value)
    requestAnimationFrame(() => {
      externalInputRef.current?.focus({ preventScroll: true })
      externalInputRef.current?.setSelectionRange(value.length, value.length)
    })
  }, [])
  ```

  Render one bottom dock after float group and before readonly overlay:

  ```tsx
  {hasBottomDock && key && (
    <div className="goblin-terminal-bottom-dock">
      {visibleCustomButtons.length > 0 && (
        <div className="goblin-terminal-custom-buttons" aria-label={t('terminal.custom-buttons')}>
          {visibleCustomButtons.map((button, index) => {
            const action = button.action === 'input' ? 'input' : 'execute'
            const inputActionDisabled = action === 'input' && !showExternalInput
            return (
              <Button
                key={`${index}:${button.label}:${button.value}:${action}`}
                type="button"
                size="sm"
                variant="secondary"
                className="goblin-terminal-custom-buttons__button"
                title={
                  inputActionDisabled
                    ? t('terminal.custom-button-input-disabled')
                    : button.value
                }
                disabled={inputActionDisabled}
                onClick={() => {
                  if (action === 'input') {
                    fillExternalInput(button.value)
                  } else {
                    writeInput(key, `${button.value}\r`)
                  }
                }}
              >
                {button.label}
              </Button>
            )
          })}
        </div>
      )}
      {showExternalInput && (
        <TerminalExternalInput
          ref={externalInputRef}
          value={externalInputValue}
          placeholder={t('terminal.external-input-placeholder')}
          onChange={setExternalInputValue}
          onSubmit={submitExternalInput}
        />
      )}
    </div>
  )}
  ```

  Add i18n keys:

  ```ts
  'terminal.external-input-placeholder': 'Terminal command input',
  'terminal.custom-button-input-disabled': 'Enable external input box to use this button',
  ```

  In `zh.ts`:

  ```ts
  'terminal.external-input-placeholder': '终端命令输入',
  'terminal.custom-button-input-disabled': '开启外部输入框后可使用此按钮',
  ```

- [ ] **Step 6: Update CSS bottom dock**

  In `terminal-session.css`, replace the old button padding rule:

  ```css
  .goblin-terminal-slot:has(.goblin-terminal-bottom-dock) .goblin-managed-terminal-frame {
    padding-bottom: 96px;
  }

  .goblin-terminal-slot:has(.goblin-terminal-external-input):not(:has(.goblin-terminal-custom-buttons))
    .goblin-managed-terminal-frame {
    padding-bottom: 58px;
  }
  ```

  Replace `.goblin-terminal-custom-buttons` positioning with dock-local styling:

  ```css
  .goblin-terminal-bottom-dock {
    position: absolute;
    right: var(--goblin-terminal-overlay-offset);
    bottom: var(--goblin-terminal-overlay-offset);
    left: var(--goblin-terminal-overlay-offset);
    z-index: 2;
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;
  }

  .goblin-terminal-custom-buttons {
    display: flex;
    width: fit-content;
    max-width: 100%;
    min-height: 34px;
    align-items: center;
    gap: 6px;
    overflow-x: auto;
    border: 1px solid var(--color-border);
    border-radius: var(--goblin-terminal-float-radius);
    background: color-mix(in srgb, var(--color-popover) 94%, transparent);
    padding: 5px;
    box-shadow: var(--shadow-sm);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    pointer-events: auto;
  }
  ```

  Add input styles:

  ```css
  .goblin-terminal-external-input {
    display: flex;
    min-height: 36px;
    align-items: center;
    gap: 8px;
    border: 1px solid var(--color-border);
    border-radius: var(--goblin-terminal-float-radius);
    background: color-mix(in srgb, var(--color-popover) 96%, transparent);
    padding: 6px 10px;
    box-shadow: var(--shadow-sm);
    pointer-events: auto;
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }

  .goblin-terminal-external-input:focus-within {
    border-color: var(--color-ring);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-ring) 25%, transparent), var(--shadow-sm);
  }

  .goblin-terminal-external-input__prefix {
    flex: 0 0 auto;
    color: var(--color-muted-foreground);
    font-family: var(--font-mono);
    font-size: 12px;
  }

  .goblin-terminal-external-input__control {
    min-width: 0;
    flex: 1;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--color-foreground);
    font-family: var(--font-mono);
    font-size: 12px;
  }

  .goblin-terminal-external-input__hint {
    flex: 0 0 auto;
    color: var(--color-muted-foreground);
    font-size: 11px;
  }
  ```

- [ ] **Step 7: Run terminal UI tests**

  Run:

  ```bash
  bun run test src/web/components/terminal/TerminalSlot.test.tsx
  bun run typecheck
  ```

  Expected: PASS after import and i18n fixture updates.

- [ ] **Step 8: Checkpoint**

  Run:

  ```bash
  git diff -- src/web/components/terminal/TerminalSlot.tsx src/web/components/terminal/terminal-external-input.tsx src/web/components/terminal/terminal-session.css
  ```

  Expected: `TerminalSlot` owns only React state/layout orchestration; external input component is controlled and small.

## Task 5: Remove Native xterm Character-Operation Wiring

**Files:**
- Modify: `src/web/components/terminal/types.ts`
- Modify: `src/web/components/terminal/ManagedTerminalSession.ts`
- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`
- Modify: `src/web/components/terminal/terminal-session-view.ts`
- Modify: `src/web/components/terminal/terminal-session.css`
- Modify: `src/web/components/terminal/TerminalSlot.test.tsx`
- Delete after confirmation: enhanced-input source/test files listed in File Structure

- [ ] **Step 1: Confirm deletion before executing this task**

  Before deleting files, show:

  ```text
  ⚠️ 危险操作检测！
  操作类型：删除上一版终端原生字符操作增强文件
  影响范围：src/web/components/terminal/terminal-enhanced-input-*.ts 与对应测试文件
  风险评估：删除后无法继续运行上一版 xterm 当前行字符操作增强；本计划会保留终端显示优化并改用外部输入框

  请确认是否继续？[需要明确的"是"、"确认"、"继续"]
  ```

  Continue only after explicit confirmation.

- [ ] **Step 2: Write failing removal checks**

  In `TerminalSlot.test.tsx`, update the first attach assertion from:

  ```ts
  expect(attach).toHaveBeenCalledWith(descriptor, expect.any(HTMLElement), { onRevealPath, enhancedInput: false })
  ```

  To:

  ```ts
  expect(attach).toHaveBeenCalledWith(descriptor, expect.any(HTMLElement), { onRevealPath })
  ```

  Delete tests named:

  - `enables enhanced input for writable controller sessions`
  - `does not enable enhanced input for readonly sessions`

  In `ManagedTerminalSession.test.ts`, delete tests named:

  - `enhanced input replaces selected current-line text through redraw sequence`
  - `enhanced input is disabled for alternate screen mode`
  - `terminal output newline invalidates enhanced input state`

- [ ] **Step 3: Remove attach handler field**

  In `src/web/components/terminal/types.ts`, remove:

  ```ts
  enhancedInput?: boolean
  ```

  Keep `onRevealPath?: (relativePath: string) => void`.

- [ ] **Step 4: Remove ManagedTerminalSession enhanced flag call**

  In `ManagedTerminalSession.ts`, remove:

  ```ts
  this.view.setEnhancedInputAllowed(handlers?.enhancedInput === true)
  ```

  Keep the attach order:

  ```ts
  this.view.setRevealPathHandler(handlers?.onRevealPath)
  this.view.attach(host)
  ```

  Remove any call that only notified the view about output for the obsolete enhanced-input controller:

  ```ts
  this.view.handleTerminalOutput(data)
  ```

- [ ] **Step 5: Remove TerminalSessionView enhanced input imports and members**

  In `terminal-session-view.ts`, delete imports from:

  ```ts
  '#/web/components/terminal/terminal-enhanced-input-controller.ts'
  '#/web/components/terminal/terminal-enhanced-input-overlay.ts'
  ```

  Remove fields:

  ```ts
  private enhancedInputAllowed = false
  private enhancedInputController: TerminalEnhancedInputController | null = null
  private enhancedInputOverlay: TerminalEnhancedInputOverlay | null = null
  ```

  Remove methods and calls dedicated to native enhanced input:

  - `setEnhancedInputAllowed`
  - `handleTerminalOutput`
  - `installEnhancedInput`
  - `installEnhancedInputMouseHandlers`
  - `ensureEnhancedInputOverlay`
  - `enhancedInputGeometry`
  - `enhancedInputOffsetFromMouse`
  - calls to `enhancedInputController?.reset()`
  - custom key handler branch that calls `enhancedInputController?.handleKeyDown(event)`

  Preserve existing Safari Shift symbol handling, macOS Option Arrow handling, search, links, fit, drag/drop support, and reveal-path behavior.

- [ ] **Step 6: Remove obsolete CSS**

  Delete from `terminal-session.css`:

  ```css
  .goblin-terminal-input-selection-layer { ... }
  .goblin-terminal-input-selection { ... }
  ```

- [ ] **Step 7: Delete obsolete enhanced input files**

  After confirmation in Step 1, delete the eight enhanced-input source/test files listed in File Structure.

- [ ] **Step 8: Run terminal tests**

  Run:

  ```bash
  bun run test src/web/components/terminal
  bun run typecheck
  ```

  Expected: PASS. No import references to `terminal-enhanced-input-*` remain.

- [ ] **Step 9: Search for stale references**

  Run:

  ```bash
  rg -n "enhancedInput|terminal-enhanced-input|goblin-terminal-input-selection" "src/web/components/terminal"
  ```

  Expected: no results.

- [ ] **Step 10: Checkpoint**

  Run:

  ```bash
  git status --short
  ```

  Expected: enhanced-input files deleted or no longer referenced; terminal display files still present.

## Task 6: Full Verification and Review

**Files:**
- No planned source edits unless verification exposes a defect.

- [ ] **Step 1: Run focused tests**

  Run:

  ```bash
  bun run test src/shared/settings-snapshot.test.ts
  bun run test src/server/modules/settings-source.test.ts
  bun run test src/web/settings-write-paths.test.ts
  bun run test src/web/components/SettingsSurface.test.tsx
  bun run test src/web/components/terminal
  ```

  Expected: all pass.

- [ ] **Step 2: Run architecture and type checks**

  Run:

  ```bash
  bun run typecheck
  bun run check:architecture
  ```

  Expected: both pass.

- [ ] **Step 3: Run full test suite**

  Run:

  ```bash
  bun run test
  ```

  Expected: pass. Known jsdom canvas/window warnings may appear if they already existed; new failures must be fixed.

- [ ] **Step 4: Manual smoke test**

  Start the app with the repo's normal dev command:

  ```bash
  bun run dev
  ```

  In the app:

  - Open `设置 -> 终端`.
  - Enable `外部输入框`.
  - Ensure `显示自定义按钮` is enabled.
  - Add one `直接执行` button: label `status`, value `git status --short`.
  - Add one `填入输入框` button: label `commit`, value `git commit -m ""`.
  - Open a writable terminal session.
  - Verify the input box appears at the bottom.
  - Verify buttons float above the input, not inside it.
  - Type in the external input, select part of the text, copy/edit/delete, then press Enter.
  - Verify the command executes and input clears.
  - Click the `status` button and verify it executes immediately.
  - Click the `commit` button and verify it fills the input without executing.
  - Click the terminal body and verify native terminal input still works.
  - Disable `显示自定义按钮` and verify the input remains while buttons disappear.

- [ ] **Step 5: Final diff review**

  Run:

  ```bash
  git diff --stat
  git diff -- src/web/components/terminal/terminal-session-view.ts src/web/components/terminal/TerminalSlot.tsx src/web/components/settings/pages/TerminalSettings.tsx
  ```

  Review for:

  - No xterm current-line character-operation code remains.
  - Terminal display optimizations are not removed.
  - Settings defaults are privacy-safe and deterministic.
  - Button default action is `execute`.
  - `input` action does not execute when external input is disabled.

- [ ] **Step 6: Report outcome**

  Provide a concise Chinese summary:

  - Files changed by category.
  - Verification commands and results.
  - Any warnings or manual-test gaps.
  - No commit was created unless the user explicitly requested one.
