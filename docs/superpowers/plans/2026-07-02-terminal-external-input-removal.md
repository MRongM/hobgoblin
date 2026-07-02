# Terminal External Input Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the terminal external input box while preserving custom terminal buttons and tightening the button dock spacing.

**Architecture:** Delete the external-input UI path, settings flag, and fill bridge. Keep terminal custom buttons in `TerminalSlot`; `execute` sends text plus enter, and `input` writes text into the xterm input stream without enter. Runtime settings remain the source of truth for button visibility, size, and button definitions.

**Tech Stack:** React, TypeScript strip-only mode, Vitest, Bun, existing runtime settings cache, xterm terminal session layer.

**Repository Constraint:** Do not add git commit steps. AGENTS.md says not to plan or execute commits unless the user explicitly asks. Use `git status --short` as checkpoints instead.

---

## Scope Check

This is one vertical cleanup: shared settings shape, server settings normalization, renderer settings UI, terminal UI behavior, command bridge, i18n text, CSS layout, and tests. It does not require a new package, server protocol change, or git branch operation.

Deletion targets are in scope and explicitly listed:

- `src/web/components/terminal/terminal-external-input.tsx`
- `src/web/components/terminal/terminal-external-input-fill.ts`

## File Structure

- Modify `src/shared/settings.ts`: remove `terminalExternalInputEnabled` from `SettingsPrefs`; keep terminal button action types.
- Modify `src/shared/settings-defaults.ts`: remove the default constant and initial snapshot plumbing for the external input flag.
- Modify `src/shared/settings-snapshot.ts`: stop projecting the external input flag into runtime snapshots.
- Modify `src/shared/bootstrap.ts`: remove the external input flag from `InitialSettingsSnapshot`.
- Modify `src/server/modules/settings-source.ts`: stop reading, normalizing, patching, comparing, and writing the external input flag.
- Modify `src/web/settings-client.ts`: remove `setTerminalExternalInputEnabled`.
- Modify `src/web/settings-write-paths.ts`: remove `setTerminalExternalInputEnabledPreference`.
- Modify `src/web/runtime-settings-terminal-buttons.ts`: remove the external input controller method.
- Modify `src/web/settings-read-projection.ts`: remove `terminalExternalInputEnabled` from `readRuntimeTerminalSettings`.
- Modify `src/web/components/settings/pages/TerminalSettings.tsx`: remove the external input switch; keep remote tmux and custom buttons.
- Modify `src/web/components/terminal/TerminalSlot.tsx`: remove external input state, handlers, component rendering, and fill handler registration; keep custom buttons.
- Delete `src/web/components/terminal/terminal-external-input.tsx`.
- Delete `src/web/components/terminal/terminal-external-input-fill.ts`.
- Modify `src/web/components/terminal/TerminalSessionRegistry.ts`: remove `fillExternalInput`.
- Modify `src/web/components/terminal/terminal-session-command-bridge.ts`: remove `fillExternalInput` from the bridge contract.
- Modify `src/web/hooks/useMergeConflictAiActions.ts`: write AI command text directly to the selected terminal without enter.
- Modify `src/web/components/terminal/terminal-session.css`: delete external input styles and reduce bottom dock padding.
- Modify `src/shared/i18n/en.ts`, `src/shared/i18n/zh.ts`, `src/shared/i18n/ko.ts`, `src/shared/i18n/ja.ts`: remove external input copy and update custom button `input` text.
- Update tests listed in each task.

## Task 1: Shared Settings Shape

**Files:**
- Modify: `src/shared/settings-snapshot.test.ts`
- Modify: `src/shared/settings.ts`
- Modify: `src/shared/settings-defaults.ts`
- Modify: `src/shared/settings-snapshot.ts`
- Modify: `src/shared/bootstrap.ts`
- Modify fixtures that still include `terminalExternalInputEnabled`

- [ ] **Step 1: Write failing shared snapshot coverage**

  In `src/shared/settings-snapshot.test.ts`, remove `terminalExternalInputEnabled` from both `prefs` objects and expected runtime objects. Add absence assertions after the first runtime snapshot assertion and inside the third test:

  ```ts
  const runtime = buildRuntimeSettingsSnapshot({
    prefs: {
      lang: 'ja',
      theme: 'dark',
      colorTheme: 'github',
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
  expect(runtime).not.toHaveProperty('terminalExternalInputEnabled')
  expect(runtime).toEqual({
    lang: 'ja',
    theme: 'dark',
    colorTheme: 'github',
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

  In the third test, assign the runtime projection before assertions:

  ```ts
  const runtime = runtimeSettingsSnapshotFromSettingsSnapshot(snapshot)
  expect(runtime).not.toHaveProperty('terminalExternalInputEnabled')
  expect(runtime).toMatchObject({
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

- [ ] **Step 2: Run shared test and verify failure**

  Run:

  ```bash
  bun run test src/shared/settings-snapshot.test.ts
  ```

  Expected: FAIL because runtime snapshots still include `terminalExternalInputEnabled`.

- [ ] **Step 3: Remove the shared settings field**

  In `src/shared/settings.ts`, delete this line from `SettingsPrefs`:

  ```ts
  terminalExternalInputEnabled: boolean
  ```

  Keep this button action type unchanged:

  ```ts
  export type TerminalCustomButtonAction = 'execute' | 'input'
  ```

- [ ] **Step 4: Remove defaults and initial snapshot plumbing**

  In `src/shared/settings-defaults.ts`, delete:

  ```ts
  export const DEFAULT_TERMINAL_EXTERNAL_INPUT_ENABLED = false
  ```

  Delete this property from `defaultSettingsPrefs()`:

  ```ts
  terminalExternalInputEnabled:
    overrides.terminalExternalInputEnabled ?? DEFAULT_TERMINAL_EXTERNAL_INPUT_ENABLED,
  ```

  Delete this union member from the `initialSettingsFromSnapshot()` `Pick`:

  ```ts
  | 'terminalExternalInputEnabled'
  ```

  Delete this return property:

  ```ts
  terminalExternalInputEnabled: snapshot.terminalExternalInputEnabled,
  ```

- [ ] **Step 5: Remove snapshot projection plumbing**

  In `src/shared/settings-snapshot.ts`, delete this property from `buildRuntimeSettingsSnapshot()`:

  ```ts
  terminalExternalInputEnabled: input.prefs.terminalExternalInputEnabled,
  ```

  Delete this union member from the `runtimeSettingsSnapshotFromSettingsSnapshot()` `Pick`:

  ```ts
  | 'terminalExternalInputEnabled'
  ```

  Delete this return property:

  ```ts
  terminalExternalInputEnabled: snapshot.terminalExternalInputEnabled,
  ```

- [ ] **Step 6: Remove bootstrap payload field**

  In `src/shared/bootstrap.ts`, delete this line from `InitialSettingsSnapshot`:

  ```ts
  terminalExternalInputEnabled: boolean
  ```

- [ ] **Step 7: Remove fixture fields exposed by typecheck**

  Run:

  ```bash
  rg -n "terminalExternalInputEnabled" "src/shared" "src/server" "src/main" "src/web" --glob "*.test.ts" --glob "*.test.tsx"
  ```

  In each test fixture that only adds the field to satisfy `SettingsPrefs`, remove this line:

  ```ts
  terminalExternalInputEnabled: false,
  ```

  If a fixture used `true`, remove this line too:

  ```ts
  terminalExternalInputEnabled: true,
  ```

- [ ] **Step 8: Run shared verification**

  Run:

  ```bash
  bun run test src/shared/settings-snapshot.test.ts
  bun run typecheck
  ```

  Expected after this task: `src/shared/settings-snapshot.test.ts` passes. `bun run typecheck` may still fail in server/web settings code that is handled by Task 2; the remaining errors should mention `terminalExternalInputEnabled`, `setTerminalExternalInputEnabled`, or external input UI references.

- [ ] **Step 9: Checkpoint**

  Run:

  ```bash
  git status --short
  ```

  Expected: shared settings files and fixture tests changed; no commits created.

## Task 2: Server and Renderer Settings Paths

**Files:**
- Modify: `src/server/modules/settings-source.test.ts`
- Modify: `src/server/modules/settings-source.ts`
- Modify: `src/web/settings-client.ts`
- Modify: `src/web/settings-write-paths.ts`
- Modify: `src/web/settings-write-paths.test.ts`
- Modify: `src/web/settings-read-projection.ts`
- Modify: `src/web/runtime-settings-terminal-buttons.ts`

- [ ] **Step 1: Write failing server settings tests**

  In `src/server/modules/settings-source.test.ts`, remove `terminalExternalInputEnabled` from default and persisted `toMatchObject` expectations. Add explicit absence assertions:

  ```ts
  const prefs = await mod.getServerSettingsPrefs()
  expect(prefs).not.toHaveProperty('terminalExternalInputEnabled')
  expect(prefs).toMatchObject({
    lang: 'auto',
    theme: 'auto',
    colorTheme: 'macos',
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

  In the update patch, remove:

  ```ts
  terminalExternalInputEnabled: true,
  ```

  After reload, use the same absence assertion:

  ```ts
  const reloadedPrefs = await reloaded.getServerSettingsPrefs()
  expect(reloadedPrefs).not.toHaveProperty('terminalExternalInputEnabled')
  expect(reloadedPrefs).toMatchObject({
    lang: 'ko',
    theme: 'dark',
    colorTheme: 'github',
    gitNetworkProxyEnabled: true,
    gitNetworkProxyUrl: 'socks5://127.0.0.1:7890',
    gitNetworkTimeoutSec: 240,
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

- [ ] **Step 2: Write failing renderer settings path test**

  In `src/web/settings-write-paths.test.ts`, delete the full test named:

  ```ts
  test('setTerminalExternalInputEnabledPreference updates runtime settings cache', async () => {
  ```

  At the top-level app data client mock in the same file, remove:

  ```ts
  setTerminalExternalInputEnabled: vi.fn(async () => {}),
  ```

  and remove the bridge assignment:

  ```ts
  setTerminalExternalInputEnabled: appDataClientMocks.setTerminalExternalInputEnabled,
  ```

  and remove reset lines for that mock.

- [ ] **Step 3: Run targeted settings tests and verify failure**

  Run:

  ```bash
  bun run test src/server/modules/settings-source.test.ts src/web/settings-write-paths.test.ts
  ```

  Expected: FAIL because production code still returns and writes `terminalExternalInputEnabled`.

- [ ] **Step 4: Remove server settings storage field**

  In `src/server/modules/settings-source.ts`, delete this line from `ServerSettingsData`:

  ```ts
  terminalExternalInputEnabled: boolean
  ```

  Delete the normalizer:

  ```ts
  function normalizeTerminalExternalInputEnabled(value: unknown): boolean {
    return value === true
  }
  ```

  Delete this property from `settingsPrefsFromData()`:

  ```ts
  terminalExternalInputEnabled: data.terminalExternalInputEnabled,
  ```

  Delete this property from `readServerSettingsFile()`:

  ```ts
  terminalExternalInputEnabled: normalizeTerminalExternalInputEnabled(parsed.terminalExternalInputEnabled),
  ```

  Delete these lines from `updateServerSettingsPrefs()`:

  ```ts
  const nextTerminalExternalInputEnabled =
    patch.terminalExternalInputEnabled === undefined
      ? data.terminalExternalInputEnabled
      : normalizeTerminalExternalInputEnabled(patch.terminalExternalInputEnabled)
  ```

  Delete this comparison from `changed`:

  ```ts
  data.terminalExternalInputEnabled !== nextTerminalExternalInputEnabled ||
  ```

  Delete this assignment:

  ```ts
  data.terminalExternalInputEnabled = nextTerminalExternalInputEnabled
  ```

- [ ] **Step 5: Remove renderer write API**

  In `src/web/settings-client.ts`, delete:

  ```ts
  export async function setTerminalExternalInputEnabled(enabled: boolean): Promise<void> {
    await updateSettingsPrefsPatch({ terminalExternalInputEnabled: enabled })
  }
  ```

  In `src/web/settings-write-paths.ts`, remove `setTerminalExternalInputEnabled` from the import list and delete:

  ```ts
  export async function setTerminalExternalInputEnabledPreference(enabled: boolean): Promise<void> {
    await setTerminalExternalInputEnabled(enabled)
    updateRuntimeSettingsSnapshotCache(mainWindowQueryClient, (current) => ({
      ...current,
      terminalExternalInputEnabled: enabled,
    }))
  }
  ```

- [ ] **Step 6: Remove runtime read and controller fields**

  In `src/web/settings-read-projection.ts`, delete this property from `readRuntimeTerminalSettings()`:

  ```ts
  terminalExternalInputEnabled:
    data?.terminalExternalInputEnabled ?? fallback?.terminalExternalInputEnabled ?? false,
  ```

  In `src/web/runtime-settings-terminal-buttons.ts`, remove `setTerminalExternalInputEnabledPreference` from the import list and delete this controller method:

  ```ts
  async setTerminalExternalInputEnabled(enabled: boolean): Promise<void> {
    await runSettingsControllerAction('terminal external input update', async () => {
      await setTerminalExternalInputEnabledPreference(enabled)
    })
  },
  ```

- [ ] **Step 7: Run settings verification**

  Run:

  ```bash
  bun run test src/server/modules/settings-source.test.ts src/web/settings-write-paths.test.ts
  bun run typecheck
  ```

  Expected after this task: targeted settings tests pass. `bun run typecheck` may still fail in UI and terminal code that still references external input.

- [ ] **Step 8: Checkpoint**

  Run:

  ```bash
  git status --short
  ```

  Expected: settings source, settings client/write paths, runtime projection, and related tests changed.

## Task 3: Terminal UI Removal and Button Behavior

**Files:**
- Modify: `src/web/components/terminal/TerminalSlot.test.tsx`
- Modify: `src/web/components/terminal/TerminalSlot.tsx`
- Delete: `src/web/components/terminal/terminal-external-input.tsx`
- Delete: `src/web/components/terminal/terminal-external-input-fill.ts`

- [ ] **Step 1: Update terminal slot tests for the new behavior**

  In `src/web/components/terminal/TerminalSlot.test.tsx`, remove this import:

  ```ts
  import { fillTerminalExternalInput } from '#/web/components/terminal/terminal-external-input-fill.ts'
  ```

  Remove `terminalExternalInputEnabled` from `runtimeSettingsMocks` and from the mocked `useRuntimeTerminalSettings()` return object.

  Delete tests whose names contain these phrases:

  ```ts
  renders external input
  fills terminal external input
  does not register external input fill
  submits external input
  inserts dragged file tree paths into external input
  does not intercept text paste in external input
  inserts returned paths into external input
  keeps external input unchanged
  clears external input on ctrl c
  does not submit empty external input
  submits multiline external input
  keeps multiline external input editable
  resizes external input
  does not render external input
  ```

  Replace the test named `fills external input from input-mode custom button` with:

  ```ts
  test('sends input-mode custom button text without enter', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
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
      expect(button).toBeInstanceOf(HTMLButtonElement)
      expect(container.querySelector('.goblin-terminal-external-input__control')).toBeNull()

      await act(async () => {
        button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      expect(writeInput).toHaveBeenCalledWith('terminal-1', 'git commit -m ""')
      expect(writeInput.mock.calls[0]![1]).not.toContain('\r')
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })
  ```

  Keep the existing execute-button test and make sure it still expects:

  ```ts
  expect(writeInput).toHaveBeenCalledWith('terminal-1', 'git status --short\r')
  ```

- [ ] **Step 2: Run terminal slot tests and verify failure**

  Run:

  ```bash
  bun run test src/web/components/terminal/TerminalSlot.test.tsx
  ```

  Expected: FAIL because `TerminalSlot` still imports and renders external input code.

- [ ] **Step 3: Remove external input imports and state**

  In `src/web/components/terminal/TerminalSlot.tsx`, remove these imports:

  ```ts
  type ClipboardEvent,
  ```

  only if no remaining code needs `ClipboardEvent` after cleanup. Keep `ClipboardEvent` if the root `handlePasteCapture` still uses it.

  Remove these imports:

  ```ts
  import { TerminalExternalInput } from '#/web/components/terminal/terminal-external-input.tsx'
  import { setTerminalExternalInputFillHandler } from '#/web/components/terminal/terminal-external-input-fill.ts'
  ```

  Remove these refs and state:

  ```ts
  const externalInputRef = useRef<HTMLTextAreaElement | null>(null)
  const [externalInputValue, setExternalInputValue] = useState('')
  ```

  Remove `terminalExternalInputEnabled` from the `useRuntimeTerminalSettings()` destructuring.

- [ ] **Step 4: Remove external input paste/drop handlers**

  In `TerminalSlot.tsx`, delete:

  ```ts
  if (isExternalInputPasteTarget(event.target, externalInputRef.current)) return
  ```

  Delete the full callback declarations whose constants are named:

  ```text
  handleExternalInputDragOver
  handleExternalInputDrop
  handleExternalInputPaste
  submitExternalInput
  fillExternalInput
  ```

  Delete the `useEffect()` that calls `setTerminalExternalInputFillHandler()`.

- [ ] **Step 5: Keep only the button dock**

  Replace:

  ```ts
  const showExternalInput = isController && terminalExternalInputEnabled && !!key
  const visibleCustomButtons = isController && terminalCustomButtonsVisible
    ? terminalCustomButtons.filter((button) => button.label.trim() && button.value.trim())
    : []
  const hasBottomDock = showExternalInput || visibleCustomButtons.length > 0
  ```

  with:

  ```ts
  const visibleCustomButtons =
    isController && terminalCustomButtonsVisible
      ? terminalCustomButtons.filter((button) => button.label.trim() && button.value.trim())
      : []
  const hasBottomDock = visibleCustomButtons.length > 0
  ```

  Change the dock height layout effect dependency from:

  ```ts
  }, [hasBottomDock, showExternalInput, visibleCustomButtons.length])
  ```

  to:

  ```ts
  }, [hasBottomDock, visibleCustomButtons.length])
  ```

- [ ] **Step 6: Update custom button click behavior**

  In the custom button `onClick`, replace:

  ```ts
  if (action === 'input') {
    if (showExternalInput) fillExternalInput(button.value)
    else writeInput(key, button.value)
  } else {
    writeInput(key, `${button.value}\r`)
  }
  ```

  with:

  ```ts
  if (action === 'input') writeInput(key, button.value)
  else writeInput(key, `${button.value}\r`)
  ```

  Delete the entire JSX block:

  ```tsx
  {showExternalInput && (
    <TerminalExternalInput
      ref={externalInputRef}
      value={externalInputValue}
      placeholder={t('terminal.external-input-placeholder')}
      submitLabel={t('terminal.external-input-send')}
      resizeLabel={t('terminal.external-input-resize')}
      onChange={setExternalInputValue}
      onSubmit={submitExternalInput}
      onPaste={handleExternalInputPaste}
      onDragOver={handleExternalInputDragOver}
      onDrop={handleExternalInputDrop}
    />
  )}
  ```

- [ ] **Step 7: Delete external-input-only helpers**

  In `TerminalSlot.tsx`, delete the complete declarations with these names:

  ```text
  isExternalInputPasteTarget
  SavePastedFilesIntoExternalInputOptions
  savePastedFilesIntoExternalInput
  insertExternalInputText
  clampSelectionIndex
  ```

  Keep these helpers because root terminal paste/drop still uses them:

  ```ts
  function shellEscapePath(path: string): string
  function hasPathDrop(event: DragEvent<HTMLElement>): boolean
  function pathsForDrop(event: DragEvent<HTMLElement>, worktreePath: string): string[]
  function binaryPasteFiles(data: DataTransfer): File[]
  async function resolvePastedFilePaths(files: File[], options: ResolvePastedFilePathsOptions): Promise<string[]>
  ```

- [ ] **Step 8: Delete external input files**

  Delete these files with `apply_patch` delete hunks:

  ```text
  src/web/components/terminal/terminal-external-input.tsx
  src/web/components/terminal/terminal-external-input-fill.ts
  ```

- [ ] **Step 9: Run terminal UI verification**

  Run:

  ```bash
  bun run test src/web/components/terminal/TerminalSlot.test.tsx
  bun run typecheck
  ```

  Expected after this task: `TerminalSlot.test.tsx` passes. `bun run typecheck` may still fail in command bridge, settings UI, i18n, or deleted file references handled by later tasks.

- [ ] **Step 10: Checkpoint**

  Run:

  ```bash
  git status --short
  ```

  Expected: `TerminalSlot.tsx`, `TerminalSlot.test.tsx`, and the two deleted external input files are changed.

## Task 4: Terminal Command Bridge and Merge Conflict AI

**Files:**
- Modify: `src/web/components/terminal/terminal-session-command-bridge.ts`
- Modify: `src/web/components/terminal/TerminalSessionRegistry.ts`
- Modify: `src/web/components/terminal/TerminalSessionProvider.tsx`
- Modify: `src/web/hooks/useMergeConflictAiActions.ts`
- Modify: `src/web/hooks/useMergeConflictAiActions.test.tsx`
- Modify: `src/web/commands/workspace-commands.test.ts`

- [ ] **Step 1: Write failing hook tests**

  In `src/web/hooks/useMergeConflictAiActions.test.tsx`, remove `fillExternalInput` from `mocks.bridge` and delete `runtimeSettings`.

  Remove this mock entirely:

  ```ts
  vi.mock('#/web/runtime-settings-terminal-buttons.ts', () => ({
    useRuntimeTerminalSettings: () => mocks.runtimeSettings,
  }))
  ```

  Replace the first test name and final assertions with:

  ```ts
  test('creates a worktree terminal and writes merge conflict command without executing', async () => {
    let actions: ReturnType<typeof useMergeConflictAiActions> | null = null
    await act(async () => {
      root!.render(<Harness onReady={(value) => (actions = value)} />)
    })
    await act(async () => {})

    await act(async () => {
      await actions!.actions.find((action) => action.provider === 'codex')!.onSelect()
    })

    expect(mocks.bridge.createTerminal).toHaveBeenCalledWith({
      repoRoot: '/repo',
      branch: 'feature/conflict',
      worktreePath: '/worktree',
    })
    expect(mocks.bridge.writeInput).toHaveBeenCalledWith(
      '/repo\u0000/worktree\u0000terminal-1',
      expect.stringContaining('codex exec'),
    )
    expect(mocks.bridge.writeInput.mock.calls[0]![1]).not.toContain('\r')
  })
  ```

  In the selected terminal test, replace `fillExternalInput` assertions with:

  ```ts
  expect(mocks.bridge.writeInput).toHaveBeenCalledWith(
    '/repo\u0000/worktree\u0000terminal-1',
    expect.stringContaining('claude --print'),
  )
  expect(mocks.bridge.writeInput.mock.calls[0]![1]).not.toContain('\r')
  ```

  Delete the tests named:

  ```ts
  keeps detected providers clickable when terminal external input is disabled
  writes to the selected terminal when external input is unavailable
  ```

- [ ] **Step 2: Run hook tests and verify failure**

  Run:

  ```bash
  bun run test src/web/hooks/useMergeConflictAiActions.test.tsx
  ```

  Expected: FAIL because the bridge interface and hook still call `fillExternalInput`.

- [ ] **Step 3: Remove bridge fill API**

  In `src/web/components/terminal/terminal-session-command-bridge.ts`, delete this field from `TerminalSessionCommandBridge`:

  ```ts
  fillExternalInput: (worktreeTerminalKey: string, value: string) => boolean
  ```

  In `src/web/components/terminal/TerminalSessionRegistry.ts`, remove:

  ```ts
  import { fillTerminalExternalInput } from '#/web/components/terminal/terminal-external-input-fill.ts'
  ```

  and delete:

  ```ts
  fillExternalInput = (worktreeTerminalKey: string, value: string): boolean => {
    return fillTerminalExternalInput(worktreeTerminalKey, value)
  }
  ```

  In `src/web/components/terminal/TerminalSessionProvider.tsx`, remove this property from the bridge object:

  ```ts
  fillExternalInput: registry.fillExternalInput,
  ```

- [ ] **Step 4: Write merge conflict commands directly to the terminal**

  In `src/web/hooks/useMergeConflictAiActions.ts`, replace:

  ```ts
  const command = buildMergeConflictAiCommand(provider)
  if (bridge.fillExternalInput(scope, command)) return true
  if (!key) return false
  bridge.writeInput(key, command)
  return true
  ```

  with:

  ```ts
  if (!key) return false
  bridge.writeInput(key, buildMergeConflictAiCommand(provider))
  return true
  ```

  Keep `buildMergeConflictAiCommand()` unchanged so it does not append `\r`.

- [ ] **Step 5: Update command bridge test fixtures**

  In `src/web/commands/workspace-commands.test.ts`, remove this property from every bridge fixture:

  ```ts
  fillExternalInput: vi.fn(() => false),
  ```

  There should be no replacement field.

- [ ] **Step 6: Run bridge and hook verification**

  Run:

  ```bash
  bun run test src/web/hooks/useMergeConflictAiActions.test.tsx src/web/commands/workspace-commands.test.ts
  bun run typecheck
  ```

  Expected after this task: hook and command tests pass. `bun run typecheck` should have no remaining `fillExternalInput` errors.

- [ ] **Step 7: Checkpoint**

  Run:

  ```bash
  rg -n "fillExternalInput|fillTerminalExternalInput|setTerminalExternalInputFillHandler" "src"
  git status --short
  ```

  Expected: `rg` prints no matches. Git status shows bridge and hook files changed.

## Task 5: Settings UI and i18n Copy

**Files:**
- Modify: `src/web/components/settings/pages/TerminalSettings.tsx`
- Modify: `src/web/components/SettingsSurface.test.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/shared/i18n/ja.ts`
- Run existing i18n snapshot tests

- [ ] **Step 1: Update settings surface tests**

  In `src/web/components/SettingsSurface.test.tsx`, update the terminal page assertions in `edits terminal custom buttons from settings`:

  ```ts
  expect(document.body.textContent).toContain('settings.terminal-remote.title')
  expect(document.body.textContent).not.toContain('settings.terminal-external-input')
  expect(document.body.textContent).toContain('settings.terminal-custom-buttons.visible')
  ```

  Replace the test named `toggles terminal external input, remote tmux, and custom button visibility from settings` with:

  ```ts
  test('toggles remote tmux and custom button visibility from settings', async () => {
    await render(<SettingsSurface page="terminal" onPageChange={() => {}} />)

    const remoteTmuxSwitch = switchById('settings-terminal-remote-tmux')
    const buttonsVisibleSwitch = switchById('settings-terminal-custom-buttons-visible')

    expect(document.getElementById('settings-terminal-external-input')).toBeNull()

    await act(async () => {
      remoteTmuxSwitch.click()
      buttonsVisibleSwitch.click()
      await Promise.resolve()
    })

    expect(
      fetchMock.mock.calls.some((call) => {
        const [, options] = call as unknown as [unknown, RequestInit | undefined]
        return String(options?.body ?? '').includes('remoteTerminalTmuxEnabled')
      }),
    ).toBe(true)
    expect(
      fetchMock.mock.calls.some((call) => {
        const [, options] = call as unknown as [unknown, RequestInit | undefined]
        return String(options?.body ?? '').includes('terminalCustomButtonsVisible')
      }),
    ).toBe(true)
    expect(
      fetchMock.mock.calls.some((call) => {
        const [, options] = call as unknown as [unknown, RequestInit | undefined]
        return String(options?.body ?? '').includes('terminalExternalInputEnabled')
      }),
    ).toBe(false)
  })
  ```

- [ ] **Step 2: Run settings surface test and verify failure**

  Run:

  ```bash
  bun run test src/web/components/SettingsSurface.test.tsx
  ```

  Expected: FAIL because `TerminalSettings` still renders the external input switch and i18n keys have not been updated.

- [ ] **Step 3: Remove the external input switch from TerminalSettings**

  In `src/web/components/settings/pages/TerminalSettings.tsx`, remove `terminalExternalInputEnabled` from runtime settings destructuring:

  ```ts
  terminalExternalInputEnabled,
  ```

  Remove `setTerminalExternalInputEnabled` from controller destructuring:

  ```ts
  setTerminalExternalInputEnabled,
  ```

  Replace the `SettingsGroup` that currently uses `settings.terminal-input.title` with:

  ```tsx
  <SettingsGroup label={t('settings.terminal-remote.title')} hint={t('settings.terminal-remote.hint')}>
    <SettingsList>
      <SettingsRow
        controlId="settings-terminal-remote-tmux"
        label={t('settings.terminal-remote-tmux')}
        hint={t('settings.terminal-remote-tmux-hint')}
        control={
          <Switch
            id="settings-terminal-remote-tmux"
            checked={remoteTerminalTmuxEnabled}
            onCheckedChange={(enabled) => void setRemoteTerminalTmuxEnabled(enabled)}
            aria-label={t('settings.terminal-remote-tmux')}
          />
        }
      />
    </SettingsList>
  </SettingsGroup>
  ```

- [ ] **Step 4: Update English and Chinese i18n copy**

  In `src/shared/i18n/en.ts`, delete:

  ```ts
  'terminal.external-input-placeholder': 'Terminal command input',
  'terminal.external-input-send': 'Send terminal input',
  'terminal.external-input-resize': 'Resize terminal input',
  'action.merge-conflict-ai-external-input-required': 'Enable terminal external input to prefill this command',
  'settings.terminal-input.title': 'Terminal input',
  'settings.terminal-input.hint': 'Use an external input box without replacing native terminal input.',
  'settings.terminal-external-input': 'External input box',
  'settings.terminal-external-input-hint':
    'Show a single-line command input at the bottom of writable terminal sessions.',
  ```

  Add:

  ```ts
  'settings.terminal-remote.title': 'Remote terminal',
  'settings.terminal-remote.hint': 'Controls how in-app remote terminal shells are started.',
  ```

  Change:

  ```ts
  'settings.terminal-custom-buttons.hint':
    'Show a terminal bottom button bar. Buttons can run immediately or fill the external input box for editing.',
  'settings.terminal-custom-buttons.action-input': 'Fill input box',
  ```

  to:

  ```ts
  'settings.terminal-custom-buttons.hint':
    'Show a terminal bottom button bar. Buttons can run immediately or fill the terminal input line for editing.',
  'settings.terminal-custom-buttons.action-input': 'Fill input line',
  ```

  In `src/shared/i18n/zh.ts`, delete the corresponding external input keys and add:

  ```ts
  'settings.terminal-remote.title': '远程终端',
  'settings.terminal-remote.hint': '控制应用内远程终端 shell 的启动方式。',
  ```

  Change:

  ```ts
  'settings.terminal-custom-buttons.hint': '在终端底部显示按钮栏。按钮可配置为直接执行，或填入外部输入框后再编辑发送。',
  'settings.terminal-custom-buttons.action-input': '填入输入框',
  ```

  to:

  ```ts
  'settings.terminal-custom-buttons.hint': '在终端底部显示按钮栏。按钮可配置为直接执行，或填入终端输入行后再编辑发送。',
  'settings.terminal-custom-buttons.action-input': '填入输入行',
  ```

- [ ] **Step 5: Update Korean and Japanese i18n copy**

  In `src/shared/i18n/ko.ts`, delete external input keys and add:

  ```ts
  'settings.terminal-remote.title': '원격 터미널',
  'settings.terminal-remote.hint': '앱 내 원격 터미널 셸을 시작하는 방식을 제어합니다.',
  ```

  Change:

  ```ts
  'settings.terminal-custom-buttons.action-input': '입력 상자에 채우기',
  ```

  to:

  ```ts
  'settings.terminal-custom-buttons.action-input': '입력 줄에 채우기',
  ```

  Also update the custom buttons hint so it mentions the terminal input line, not the external input box:

  ```ts
  'settings.terminal-custom-buttons.hint':
    '터미널 하단 버튼 막대를 표시합니다. 버튼은 즉시 실행하거나 편집할 수 있도록 터미널 입력 줄에 채울 수 있습니다.',
  ```

  In `src/shared/i18n/ja.ts`, delete external input keys and add:

  ```ts
  'settings.terminal-remote.title': 'リモートターミナル',
  'settings.terminal-remote.hint': 'アプリ内リモートターミナルのシェル起動方法を制御します。',
  ```

  Change:

  ```ts
  'settings.terminal-custom-buttons.action-input': '入力ボックスへ入力',
  ```

  to:

  ```ts
  'settings.terminal-custom-buttons.action-input': '入力行へ入力',
  ```

  Also update the custom buttons hint so it mentions the terminal input line, not the external input box:

  ```ts
  'settings.terminal-custom-buttons.hint':
    'ターミナル下部のボタンバーを表示します。ボタンはすぐ実行するか、編集できるようターミナル入力行へ入力できます。',
  ```

- [ ] **Step 6: Run settings UI and dictionary verification**

  Run:

  ```bash
  bun run test src/web/components/SettingsSurface.test.tsx src/shared/i18n/dictionaries.test.ts src/shared/i18n/snapshot.test.ts
  bun run typecheck
  ```

  Expected: settings surface and i18n tests pass. `bun run typecheck` should have no `settings.terminal-external-input` or `terminal.external-input-*` errors.

- [ ] **Step 7: Checkpoint**

  Run:

  ```bash
  rg -n "external input|External input|external-input|外部输入框|입력 상자|入力ボックス" "src/shared/i18n" "src/web/components/settings"
  git status --short
  ```

  Expected: no external input matches in settings/i18n files. Git status shows settings UI and dictionary files changed.

## Task 6: Terminal Dock CSS

**Files:**
- Modify: `src/web/components/terminal/terminal-session-css.test.ts`
- Modify: `src/web/components/terminal/terminal-session.css`

- [ ] **Step 1: Write failing CSS contract tests**

  Replace the first three tests in `src/web/components/terminal/terminal-session-css.test.ts` with:

  ```ts
  test('keeps button dock padding tight without an extra top margin', () => {
    expect(css).toContain('--goblin-terminal-bottom-dock-height: 44px;')
    expect(css).toContain(
      'padding-bottom: calc(var(--goblin-terminal-bottom-dock-height) + var(--goblin-terminal-overlay-offset));',
    )
    expect(css).not.toContain('padding-bottom: calc(var(--goblin-terminal-bottom-dock-height) + 24px);')
  })

  test('removes external input styles from the terminal dock', () => {
    expect(css).not.toContain('.goblin-terminal-external-input')
    expect(css).not.toContain('goblin-terminal-external-input__control')
    expect(css).not.toContain('goblin-terminal-external-input__resize')
  })
  ```

  Keep the scrollbar test unchanged.

- [ ] **Step 2: Run CSS test and verify failure**

  Run:

  ```bash
  bun run test src/web/components/terminal/terminal-session-css.test.ts
  ```

  Expected: FAIL because CSS still contains external input selectors and the old `+ 24px` padding.

- [ ] **Step 3: Tighten dock padding**

  In `src/web/components/terminal/terminal-session.css`, replace:

  ```css
  .goblin-terminal-slot:has(.goblin-terminal-bottom-dock) .goblin-managed-terminal-frame {
    padding-bottom: calc(var(--goblin-terminal-bottom-dock-height) + 24px);
  }
  ```

  with:

  ```css
  .goblin-terminal-slot:has(.goblin-terminal-bottom-dock) .goblin-managed-terminal-frame {
    padding-bottom: calc(var(--goblin-terminal-bottom-dock-height) + var(--goblin-terminal-overlay-offset));
  }
  ```

  In `.goblin-terminal-bottom-dock`, replace:

  ```css
  gap: 8px;
  ```

  with:

  ```css
  gap: 0;
  ```

- [ ] **Step 4: Delete external input CSS**

  In `terminal-session.css`, delete the complete selector blocks with these selectors:

  ```text
  .goblin-terminal-external-input
  .goblin-terminal-external-input:focus-within
  .goblin-terminal-external-input__prefix
  .goblin-terminal-external-input__control
  .goblin-terminal-external-input__resize
  .goblin-terminal-external-input__resize:hover
  .goblin-terminal-external-input__resize span
  .goblin-terminal-external-input__control::placeholder
  .goblin-terminal-external-input__send
  .goblin-terminal-external-input__send:hover
  ```

- [ ] **Step 5: Run CSS verification**

  Run:

  ```bash
  bun run test src/web/components/terminal/terminal-session-css.test.ts
  ```

  Expected: PASS.

- [ ] **Step 6: Checkpoint**

  Run:

  ```bash
  git status --short
  ```

  Expected: terminal CSS and CSS test changed.

## Task 7: Global Cleanup and Full Verification

**Files:**
- Modify any remaining tests or fixtures found by search.
- Do not create commits.

- [ ] **Step 1: Search for removed identifiers**

  Run:

  ```bash
  rg -n "terminalExternalInputEnabled|TerminalExternalInput|terminal-external-input|fillExternalInput|fillTerminalExternalInput|setTerminalExternalInputFillHandler|terminal.external-input|settings.terminal-external-input|merge-conflict-ai-external-input-required" "src"
  ```

  Expected: no matches.

  If matches remain, remove the reference or update it to the new `writeInput`/button input-line behavior. For test fixtures, remove `terminalExternalInputEnabled` properties. For copy, replace external-input text with terminal-input-line text.

- [ ] **Step 2: Run targeted tests**

  Run:

  ```bash
  bun run test src/shared/settings-snapshot.test.ts
  bun run test src/server/modules/settings-source.test.ts
  bun run test src/web/settings-write-paths.test.ts
  bun run test src/web/components/terminal/TerminalSlot.test.tsx
  bun run test src/web/components/terminal/terminal-session-css.test.ts
  bun run test src/web/hooks/useMergeConflictAiActions.test.tsx
  bun run test src/web/components/SettingsSurface.test.tsx
  bun run test src/shared/i18n/dictionaries.test.ts src/shared/i18n/snapshot.test.ts
  ```

  Expected: all targeted tests pass.

- [ ] **Step 3: Run required project verification**

  Run:

  ```bash
  bun run typecheck
  bun run test
  ```

  Expected: both commands pass.

- [ ] **Step 4: Run architecture guard**

  Run:

  ```bash
  bun run check:architecture
  ```

  Expected: PASS. This confirms no renderer/main/server boundary regressions were introduced.

- [ ] **Step 5: Final status check**

  Run:

  ```bash
  git status --short
  ```

  Expected: only files related to the external input removal, design doc, and plan doc are changed. No commits are created.

## Self-Review Notes

- Spec coverage: shared settings, server settings, renderer settings UI, terminal UI, command bridge, merge conflict AI, i18n, CSS dock spacing, tests, and verification are covered.
- Type consistency: the plan removes `terminalExternalInputEnabled` from `SettingsPrefs`, `InitialSettingsSnapshot`, runtime settings projection, server data, renderer write paths, and UI consumers in the same direction.
- Button behavior: `execute` remains `value + "\r"`; `input` becomes `value` without enter in both `TerminalSlot` and merge conflict AI.
- Git safety: no commit steps are present; every checkpoint uses `git status --short`.
