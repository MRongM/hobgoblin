# Terminal Custom Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a settings-configurable terminal bottom button bar that directly sends configured values to the active controllable terminal session.

**Architecture:** Store custom buttons in the existing settings prefs pipeline, normalize them on the server, expose them through runtime settings, and render them in `TerminalSlot` only for controller sessions. The settings UI owns editing `label` and multiline `value`; the terminal UI only consumes normalized runtime data and calls the existing `writeInput(key, value)`.

**Tech Stack:** TypeScript strip-only mode, React 19, Vitest, TanStack Query, existing settings primitives, existing terminal session context, CSS modules via project CSS files.

---

### Task 1: Shared Settings Model And Server Normalization

**Files:**
- Modify: `src/shared/settings.ts`
- Modify: `src/shared/rpc.ts`
- Modify: `src/shared/settings-defaults.ts`
- Modify: `src/shared/bootstrap.ts`
- Modify: `src/shared/settings-snapshot.ts`
- Modify: `src/server/modules/settings-source.ts`
- Test: `src/shared/settings-snapshot.test.ts`
- Test: `src/server/modules/settings-source.test.ts`
- Test fixture updates: `src/main/preload.test.ts`
- Test fixture updates: `src/main/rpc.test.ts`
- Test fixture updates: `src/server/app-factory.test.ts`
- Test fixture updates: `src/server/modules/remote.test.ts`
- Test fixture updates: `src/server/modules/settings-write-paths.test.ts`
- Test fixture updates: `src/server/modules/settings.test.ts`
- Test fixture updates: `src/shared/native-shell-projection.test.ts`
- Test fixture updates: `src/web/bootstrap.test.ts`
- Test fixture updates: `src/web/components/SettingsSurface.test.tsx`
- Test fixture updates: `src/web/hooks/useBranchActionItems.test.tsx`
- Test fixture updates: `src/web/settings-client.test.ts`
- Test fixture updates: `src/web/stores/bootstrap-seed.test.ts`
- Test fixture updates: `src/web/stores/session-restore.test.ts`

- [ ] **Step 1: Add the shared button type and prefs field**

In `src/shared/settings.ts`, add a focused type near the other settings types:

```ts
export interface TerminalCustomButton {
  label: string
  value: string
}
```

Then add this field to `SettingsPrefs`:

```ts
terminalCustomButtons: TerminalCustomButton[]
```

- [ ] **Step 2: Export the shared type through the RPC module**

In `src/shared/rpc.ts`, add `TerminalCustomButton` to the type import from `#/shared/settings.ts`:

```ts
TerminalCustomButton,
```

Add it to the corresponding `export type { ... } from '#/shared/settings.ts'` block:

```ts
TerminalCustomButton,
```

- [ ] **Step 3: Add defaults and initial snapshot propagation**

In `src/shared/settings-defaults.ts`, update the import type list to include `TerminalCustomButton`:

```ts
import type {
  EditorPref,
  LangPref,
  SessionState,
  SettingsPrefs,
  SettingsSnapshot,
  TerminalCustomButton,
  TerminalPref,
  ThemePref,
} from '#/shared/rpc.ts'
```

Add the default:

```ts
export const DEFAULT_TERMINAL_CUSTOM_BUTTONS: TerminalCustomButton[] = []
```

In `defaultSettingsPrefs`, add:

```ts
terminalCustomButtons: overrides.terminalCustomButtons ?? DEFAULT_TERMINAL_CUSTOM_BUTTONS,
```

In `initialSettingsFromSnapshot`, include `terminalCustomButtons` in the `Pick` type and returned object:

```ts
| 'terminalCustomButtons'
```

```ts
terminalCustomButtons: snapshot.terminalCustomButtons,
```

In `src/shared/bootstrap.ts`, add:

```ts
import type { EditorPref, I18nSnapshot, TerminalCustomButton, TerminalPref } from '#/shared/rpc.ts'
```

Then add this field to `InitialSettingsSnapshot`:

```ts
terminalCustomButtons: TerminalCustomButton[]
```

- [ ] **Step 4: Include the field in runtime settings snapshots**

In `src/shared/settings-snapshot.ts`, add the field in `buildRuntimeSettingsSnapshot`:

```ts
terminalCustomButtons: input.prefs.terminalCustomButtons,
```

Add it to the `Pick<SettingsSnapshot, ...>` list in `runtimeSettingsSnapshotFromSettingsSnapshot`:

```ts
| 'terminalCustomButtons'
```

Return it from `runtimeSettingsSnapshotFromSettingsSnapshot`:

```ts
terminalCustomButtons: snapshot.terminalCustomButtons,
```

- [ ] **Step 5: Update hand-written settings fixtures**

In every hand-written `SettingsPrefs`, `SettingsSnapshot`, `RuntimeSettingsSnapshot`, and `InitialSettingsSnapshot` fixture that already includes `terminalApp` or `lanEnabled`, add:

```ts
terminalCustomButtons: [],
```

Use this search to catch stale fixtures:

```bash
rg "terminalApp: 'auto'|lanEnabled: false|initialSettings: \\{" src -g "*.test.ts" -g "*.test.tsx" -g "*.ts" -g "*.tsx"
```

Known files to update during this step:

```text
src/main/preload.test.ts
src/main/rpc.test.ts
src/server/app-factory.test.ts
src/server/modules/remote.test.ts
src/server/modules/settings-write-paths.test.ts
src/server/modules/settings.test.ts
src/shared/native-shell-projection.test.ts
src/web/bootstrap.test.ts
src/web/components/SettingsSurface.test.tsx
src/web/hooks/useBranchActionItems.test.tsx
src/web/settings-client.test.ts
src/web/stores/bootstrap-seed.test.ts
src/web/stores/session-restore.test.ts
```

- [ ] **Step 6: Write failing snapshot tests**

In `src/shared/settings-snapshot.test.ts`, add `terminalCustomButtons` to both prefs objects used in existing tests:

```ts
terminalCustomButtons: [{ label: 'status', value: 'git status --short' }],
```

Update the expected runtime settings object in the first test:

```ts
terminalCustomButtons: [{ label: 'status', value: 'git status --short' }],
```

Update the final `toMatchObject` in the split test:

```ts
expect(runtimeSettingsSnapshotFromSettingsSnapshot(snapshot)).toMatchObject({
  globalShortcutRegistered: false,
  terminalCustomButtons: [{ label: 'status', value: 'git status --short' }],
})
```

- [ ] **Step 7: Run snapshot tests and verify they fail before implementation**

Run:

```bash
bun run test src/shared/settings-snapshot.test.ts
```

Expected before implementation: FAIL with a missing `terminalCustomButtons` field in runtime settings.

- [ ] **Step 8: Add server-side normalization**

In `src/server/modules/settings-source.ts`, update imports:

```ts
import type { EditorPref, LangPref, SessionState, SettingsPrefs, TerminalCustomButton, TerminalPref, ThemePref } from '#/shared/rpc.ts'
```

Update `ServerSettingsData`:

```ts
terminalCustomButtons: TerminalCustomButton[]
```

Add a constant near other settings constants:

```ts
const MAX_TERMINAL_CUSTOM_BUTTONS = 20
```

Add this helper:

```ts
function normalizeTerminalCustomButtons(value: unknown): TerminalCustomButton[] {
  if (!Array.isArray(value)) return []
  const normalized: TerminalCustomButton[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const button = item as Partial<TerminalCustomButton>
    if (typeof button.label !== 'string' || typeof button.value !== 'string') continue
    const label = button.label.trim()
    if (!label || button.value.trim().length === 0) continue
    normalized.push({ label, value: button.value })
    if (normalized.length >= MAX_TERMINAL_CUSTOM_BUTTONS) break
  }
  return normalized
}
```

In `settingsPrefsFromData`, add:

```ts
terminalCustomButtons: data.terminalCustomButtons,
```

In `readServerSettingsFile`, add:

```ts
terminalCustomButtons: normalizeTerminalCustomButtons(parsed.terminalCustomButtons),
```

In `updateServerSettingsPrefs`, add:

```ts
const nextTerminalCustomButtons =
  patch.terminalCustomButtons === undefined
    ? data.terminalCustomButtons
    : normalizeTerminalCustomButtons(patch.terminalCustomButtons)
```

Add it to `changed`:

```ts
JSON.stringify(data.terminalCustomButtons) !== JSON.stringify(nextTerminalCustomButtons)
```

Assign it before writing:

```ts
data.terminalCustomButtons = nextTerminalCustomButtons
```

- [ ] **Step 9: Add server normalization tests**

In `src/server/modules/settings-source.test.ts`, update default expectations to include:

```ts
terminalCustomButtons: [],
```

In the persistence test patch, add:

```ts
terminalCustomButtons: [
  { label: ' status ', value: ' git status --short\n' },
  { label: '', value: 'ignored' },
  { label: 'empty', value: '   ' },
  { label: 'test', value: 'bun run test' },
],
```

Update the reloaded prefs expectation:

```ts
terminalCustomButtons: [
  { label: 'status', value: ' git status --short\n' },
  { label: 'test', value: 'bun run test' },
],
```

Add a dedicated cap test:

```ts
test('limits persisted terminal custom buttons to 20 valid entries', async () => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'gbl-server-settings-'))
  previousDataDir = process.env.GOBLIN_SERVER_DATA_DIR
  process.env.GOBLIN_SERVER_DATA_DIR = tmp

  const mod = await import('#/server/modules/settings-source.ts')
  await mod.updateServerSettingsPrefs({
    terminalCustomButtons: Array.from({ length: 25 }, (_, index) => ({
      label: `button-${index}`,
      value: `echo ${index}`,
    })),
  })

  const prefs = await mod.getServerSettingsPrefs()
  expect(prefs.terminalCustomButtons).toHaveLength(20)
  expect(prefs.terminalCustomButtons[0]).toEqual({ label: 'button-0', value: 'echo 0' })
  expect(prefs.terminalCustomButtons[19]).toEqual({ label: 'button-19', value: 'echo 19' })
})
```

- [ ] **Step 10: Run model and server tests**

Run:

```bash
bun run test src/shared/settings-snapshot.test.ts src/server/modules/settings-source.test.ts
```

Expected: PASS.

- [ ] **Step 11: Commit this task after explicit user confirmation**

Dangerous operation policy applies. Ask the user for confirmation before running:

```bash
git add src/shared/settings.ts src/shared/rpc.ts src/shared/settings-defaults.ts src/shared/bootstrap.ts src/shared/settings-snapshot.ts src/server/modules/settings-source.ts src/shared/settings-snapshot.test.ts src/server/modules/settings-source.test.ts src/main/preload.test.ts src/main/rpc.test.ts src/server/app-factory.test.ts src/server/modules/remote.test.ts src/server/modules/settings-write-paths.test.ts src/server/modules/settings.test.ts src/shared/native-shell-projection.test.ts src/web/bootstrap.test.ts src/web/components/SettingsSurface.test.tsx src/web/hooks/useBranchActionItems.test.tsx src/web/settings-client.test.ts src/web/stores/bootstrap-seed.test.ts src/web/stores/session-restore.test.ts
git commit -m "feat: add terminal custom button settings model"
```

### Task 2: Settings Read/Write Paths And Runtime Controller

**Files:**
- Modify: `src/web/settings-client.ts`
- Modify: `src/web/settings-write-paths.ts`
- Modify: `src/web/settings-read-projection.ts`
- Create: `src/web/runtime-settings-terminal-buttons.ts`
- Test: `src/web/settings-write-paths.test.ts`

- [ ] **Step 1: Add the client setter**

In `src/web/settings-client.ts`, import the type:

```ts
import type { TerminalCustomButton } from '#/shared/rpc.ts'
```

Add:

```ts
export async function setTerminalCustomButtons(buttons: TerminalCustomButton[]): Promise<TerminalCustomButton[]> {
  const result = await updateSettingsPrefsPatch({ terminalCustomButtons: buttons })
  return result.settings.terminalCustomButtons
}
```

- [ ] **Step 2: Add the write path and cache update**

In `src/web/settings-write-paths.ts`, import the type:

```ts
import type { TerminalCustomButton } from '#/shared/rpc.ts'
```

Add `setTerminalCustomButtons` to the settings-client import list.

Add:

```ts
export async function setTerminalCustomButtonsPreference(buttons: TerminalCustomButton[]): Promise<TerminalCustomButton[]> {
  const terminalCustomButtons = await setTerminalCustomButtons(buttons)
  updateRuntimeSettingsSnapshotCache(mainWindowQueryClient, (current) => ({ ...current, terminalCustomButtons }))
  return terminalCustomButtons
}
```

- [ ] **Step 3: Add runtime read projection**

In `src/web/settings-read-projection.ts`, add:

```ts
export function readRuntimeTerminalCustomButtons(data: RuntimeSettingsSnapshot | undefined) {
  const fallback = fallbackInitialSettings()
  return data?.terminalCustomButtons ?? fallback?.terminalCustomButtons ?? []
}
```

- [ ] **Step 4: Create the runtime controller module**

Create `src/web/runtime-settings-terminal-buttons.ts`:

```ts
import type { TerminalCustomButton } from '#/shared/rpc.ts'
import { readRuntimeTerminalCustomButtons, useRuntimeSettingsSnapshot } from '#/web/settings-read-projection.ts'
import {
  runSettingsControllerAction,
  setTerminalCustomButtonsPreference,
} from '#/web/settings-write-paths.ts'

export function useRuntimeTerminalCustomButtons(): TerminalCustomButton[] {
  return readRuntimeTerminalCustomButtons(useRuntimeSettingsSnapshot())
}

export function useTerminalCustomButtonsController() {
  return {
    async setTerminalCustomButtons(buttons: TerminalCustomButton[]): Promise<void> {
      await runSettingsControllerAction('terminal custom buttons update', async () => {
        await setTerminalCustomButtonsPreference(buttons)
      })
    },
  }
}
```

- [ ] **Step 5: Add failing cache update test**

In `src/web/settings-write-paths.test.ts`, extend `appDataClientMocks`:

```ts
setTerminalCustomButtons: vi.fn(async (buttons) => buttons),
```

Expose it in the `vi.mock('#/web/settings-client.ts', ...)` return:

```ts
setTerminalCustomButtons: appDataClientMocks.setTerminalCustomButtons,
```

Reset it in `beforeEach`:

```ts
appDataClientMocks.setTerminalCustomButtons.mockReset()
appDataClientMocks.setTerminalCustomButtons.mockImplementation(async (buttons) => buttons)
```

Add this test:

```ts
test('setTerminalCustomButtonsPreference updates runtime settings cache', async () => {
  mainWindowQueryClient.setQueryData(settingsSnapshotQueryKey(), defaultSettingsSnapshot())
  const buttons = [{ label: 'status', value: 'git status --short' }]
  const { setTerminalCustomButtonsPreference } = await import('#/web/settings-write-paths.ts')

  await setTerminalCustomButtonsPreference(buttons)

  expect(appDataClientMocks.setTerminalCustomButtons).toHaveBeenCalledWith(buttons)
  expect(mainWindowQueryClient.getQueryData(settingsSnapshotQueryKey())).toMatchObject({
    terminalCustomButtons: buttons,
  })
})
```

- [ ] **Step 6: Run write path tests**

Run:

```bash
bun run test src/web/settings-write-paths.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit this task after explicit user confirmation**

Dangerous operation policy applies. Ask the user for confirmation before running:

```bash
git add src/web/settings-client.ts src/web/settings-write-paths.ts src/web/settings-read-projection.ts src/web/runtime-settings-terminal-buttons.ts src/web/settings-write-paths.test.ts
git commit -m "feat: wire terminal custom button settings"
```

### Task 3: Terminal Settings Page

**Files:**
- Modify: `src/shared/settings-pages.ts`
- Modify: `src/web/components/settings/SettingsLayout.tsx`
- Modify: `src/web/components/SettingsSurface.tsx`
- Create: `src/web/components/settings/pages/TerminalSettings.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/shared/i18n/ja.ts`
- Test: `src/shared/i18n/dictionaries.test.ts`
- Test: `src/web/components/SettingsSurface.test.tsx`

- [ ] **Step 1: Add the settings page id**

In `src/shared/settings-pages.ts`, add `terminal` after `general`:

```ts
export const SETTINGS_PAGES = ['general', 'terminal', 'shortcuts', 'notifications', 'ssh', 'sync', 'apps', 'github', 'lan', 'about'] as const
```

Add the config entry:

```ts
terminal: { titleKey: 'settings.terminal-custom-buttons.title', labelKey: 'settings.nav.terminal' },
```

- [ ] **Step 2: Add the sidebar icon**

In `src/web/components/settings/SettingsLayout.tsx`, import `TerminalSquare` from `lucide-react`:

```ts
import {
  AppWindow,
  Bell,
  Globe,
  Info,
  Keyboard,
  Settings2,
  Shield,
  SlidersHorizontal,
  TerminalSquare,
  type LucideIcon,
} from 'lucide-react'
```

Add:

```ts
terminal: TerminalSquare,
```

to `SETTINGS_PAGE_ICONS`.

- [ ] **Step 3: Create the terminal settings page**

Create `src/web/components/settings/pages/TerminalSettings.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import type { TerminalCustomButton } from '#/shared/rpc.ts'
import { Button } from '#/web/components/ui/button.tsx'
import { Input } from '#/web/components/ui/input.tsx'
import { SettingsCard, SettingsGroup, SettingsListItem } from '#/web/components/settings/SettingsPrimitives.tsx'
import {
  useRuntimeTerminalCustomButtons,
  useTerminalCustomButtonsController,
} from '#/web/runtime-settings-terminal-buttons.ts'
import { useT } from '#/web/stores/i18n.ts'

type EditableTerminalCustomButton = TerminalCustomButton & {
  id: string
}

function editableFromButtons(buttons: TerminalCustomButton[]): EditableTerminalCustomButton[] {
  return buttons.map((button, index) => ({
    id: `${index}:${button.label}:${button.value}`,
    label: button.label,
    value: button.value,
  }))
}

function validButtons(rows: EditableTerminalCustomButton[]): TerminalCustomButton[] {
  return rows
    .map((row) => ({ label: row.label.trim(), value: row.value }))
    .filter((row) => row.label.length > 0 && row.value.trim().length > 0)
    .slice(0, 20)
}

export function TerminalSettings() {
  const t = useT()
  const buttons = useRuntimeTerminalCustomButtons()
  const initialRows = useMemo(() => editableFromButtons(buttons), [buttons])
  const [rows, setRows] = useState<EditableTerminalCustomButton[]>(initialRows)
  const [dirty, setDirty] = useState(false)
  const { setTerminalCustomButtons } = useTerminalCustomButtonsController()

  useEffect(() => {
    if (dirty) return
    setRows(initialRows)
  }, [dirty, initialRows])

  function updateRows(nextRows: EditableTerminalCustomButton[]) {
    setRows(nextRows)
    setDirty(true)
  }

  async function save() {
    const nextButtons = validButtons(rows)
    await setTerminalCustomButtons(nextButtons)
    setRows(editableFromButtons(nextButtons))
    setDirty(false)
  }

  return (
    <SettingsGroup
      label={t('settings.terminal-custom-buttons.title')}
      hint={t('settings.terminal-custom-buttons.hint')}
      action={
        <Button
          type="button"
          data-interactive
          variant="ghost"
          size="sm"
          onClick={() => {
            updateRows([...rows, { id: `new:${Date.now()}`, label: '', value: '' }])
          }}
        >
          <Plus className="size-3" />
          {t('settings.terminal-custom-buttons.add')}
        </Button>
      }
    >
      <SettingsCard>
        {rows.length === 0 ? (
          <SettingsListItem size="lg">
            <p className="text-sm text-muted-foreground">{t('settings.terminal-custom-buttons.empty')}</p>
          </SettingsListItem>
        ) : (
          rows.map((row, index) => (
            <SettingsListItem key={row.id} size="xl" className="items-start">
              <div className="grid min-w-0 flex-1 gap-2">
                <Input
                  id={`terminal-custom-button-label-${index}`}
                  value={row.label}
                  placeholder={t('settings.terminal-custom-buttons.label-placeholder')}
                  aria-label={t('settings.terminal-custom-buttons.label')}
                  onChange={(event) => {
                    const nextRows = rows.map((item) =>
                      item.id === row.id ? { ...item, label: event.target.value } : item,
                    )
                    updateRows(nextRows)
                  }}
                />
                <textarea
                  id={`terminal-custom-button-value-${index}`}
                  className="min-h-[64px] w-full resize-y rounded-md border border-input bg-control px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={row.value}
                  placeholder={t('settings.terminal-custom-buttons.value-placeholder')}
                  aria-label={t('settings.terminal-custom-buttons.value')}
                  onChange={(event) => {
                    const nextRows = rows.map((item) =>
                      item.id === row.id ? { ...item, value: event.target.value } : item,
                    )
                    updateRows(nextRows)
                  }}
                />
              </div>
              <Button
                type="button"
                data-interactive
                variant="ghost"
                size="icon"
                aria-label={t('settings.terminal-custom-buttons.remove')}
                onClick={() => {
                  updateRows(rows.filter((item) => item.id !== row.id))
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </SettingsListItem>
          ))
        )}
      </SettingsCard>
      <div className="flex justify-end px-3">
        <Button
          type="button"
          data-interactive
          size="sm"
          disabled={!dirty}
          onClick={() => {
            void save()
          }}
        >
          <Save className="size-3" />
          {t('settings.terminal-custom-buttons.save')}
        </Button>
      </div>
    </SettingsGroup>
  )
}
```

- [ ] **Step 4: Mount the page**

In `src/web/components/SettingsSurface.tsx`, import:

```ts
import { TerminalSettings } from '#/web/components/settings/pages/TerminalSettings.tsx'
```

Render it:

```tsx
{page === 'terminal' && <TerminalSettings />}
```

- [ ] **Step 5: Add i18n keys**

Add these English keys to `src/shared/i18n/en.ts`:

```ts
'settings.nav.terminal': 'Terminal',
'settings.terminal-custom-buttons.title': 'Custom terminal buttons',
'settings.terminal-custom-buttons.hint': 'Show a terminal bottom button bar that sends configured text directly to the active terminal.',
'settings.terminal-custom-buttons.add': 'Add',
'settings.terminal-custom-buttons.save': 'Save',
'settings.terminal-custom-buttons.empty': 'No custom buttons configured.',
'settings.terminal-custom-buttons.label': 'Label',
'settings.terminal-custom-buttons.label-placeholder': 'Label',
'settings.terminal-custom-buttons.value': 'Value',
'settings.terminal-custom-buttons.value-placeholder': 'Text to send',
'settings.terminal-custom-buttons.remove': 'Remove custom terminal button',
```

Add matching keys to `src/shared/i18n/zh.ts`:

```ts
'settings.nav.terminal': '终端',
'settings.terminal-custom-buttons.title': '自定义终端按钮',
'settings.terminal-custom-buttons.hint': '在终端底部显示按钮栏，点击后把配置文本直接发送到当前终端。',
'settings.terminal-custom-buttons.add': '添加',
'settings.terminal-custom-buttons.save': '保存',
'settings.terminal-custom-buttons.empty': '未配置自定义按钮。',
'settings.terminal-custom-buttons.label': '标签',
'settings.terminal-custom-buttons.label-placeholder': '标签',
'settings.terminal-custom-buttons.value': '内容',
'settings.terminal-custom-buttons.value-placeholder': '要发送的文本',
'settings.terminal-custom-buttons.remove': '删除自定义终端按钮',
```

Add Korean keys to `src/shared/i18n/ko.ts`:

```ts
'settings.nav.terminal': '터미널',
'settings.terminal-custom-buttons.title': '사용자 지정 터미널 버튼',
'settings.terminal-custom-buttons.hint': '터미널 하단 버튼 막대를 표시하고, 클릭하면 설정한 텍스트를 현재 터미널로 바로 보냅니다.',
'settings.terminal-custom-buttons.add': '추가',
'settings.terminal-custom-buttons.save': '저장',
'settings.terminal-custom-buttons.empty': '설정된 사용자 지정 버튼이 없습니다.',
'settings.terminal-custom-buttons.label': '레이블',
'settings.terminal-custom-buttons.label-placeholder': '레이블',
'settings.terminal-custom-buttons.value': '값',
'settings.terminal-custom-buttons.value-placeholder': '보낼 텍스트',
'settings.terminal-custom-buttons.remove': '사용자 지정 터미널 버튼 삭제',
```

Add Japanese keys to `src/shared/i18n/ja.ts`:

```ts
'settings.nav.terminal': 'ターミナル',
'settings.terminal-custom-buttons.title': 'カスタムターミナルボタン',
'settings.terminal-custom-buttons.hint': 'ターミナル下部にボタンバーを表示し、クリックすると設定したテキストを現在のターミナルへ直接送信します。',
'settings.terminal-custom-buttons.add': '追加',
'settings.terminal-custom-buttons.save': '保存',
'settings.terminal-custom-buttons.empty': 'カスタムボタンは設定されていません。',
'settings.terminal-custom-buttons.label': 'ラベル',
'settings.terminal-custom-buttons.label-placeholder': 'ラベル',
'settings.terminal-custom-buttons.value': '値',
'settings.terminal-custom-buttons.value-placeholder': '送信するテキスト',
'settings.terminal-custom-buttons.remove': 'カスタムターミナルボタンを削除',
```

- [ ] **Step 6: Add settings page tests**

In `src/web/components/SettingsSurface.test.tsx`, add `terminalCustomButtons` to every `settings.get` and bootstrap `initialSettings` fixture:

```ts
terminalCustomButtons: [],
```

Change the test `fetchMock` callback signature so it can inspect request bodies:

```ts
const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
```

Add a fetch handler branch for prefs writes:

```ts
else if (url.pathname === '/api/settings/prefs') {
  const body = JSON.parse(String((init?.body ?? '{}') as string)) as { settings?: Record<string, unknown> }
  result = {
    ok: true,
    settings: {
      ...defaultRpcResult('settings.get'),
      ...(body.settings ?? {}),
    },
  }
}
```

Add this test:

```ts
test('edits terminal custom buttons from settings', async () => {
  await render(<SettingsSurface page="terminal" onPageChange={() => {}} />)

  await act(async () => {
    buttonByText('settings.terminal-custom-buttons.add').click()
    await Promise.resolve()
  })

  const labelInput = document.getElementById('terminal-custom-button-label-0') as HTMLInputElement | null
  const valueInput = document.getElementById('terminal-custom-button-value-0') as HTMLTextAreaElement | null
  if (!labelInput || !valueInput) throw new Error('Missing terminal custom button fields')

  await act(async () => {
    setInputValue(labelInput, 'status')
    setTextAreaValue(valueInput, 'git status --short')
    await Promise.resolve()
  })

  await act(async () => {
    buttonByText('settings.terminal-custom-buttons.save').click()
    await Promise.resolve()
  })

  expect(
    fetchMock.mock.calls.some((call) => {
      const [url, options] = call as unknown as [unknown, RequestInit | undefined]
      if (new URL(String(url)).pathname !== '/api/settings/prefs') return false
      return String(options?.body ?? '').includes('terminalCustomButtons')
    }),
  ).toBe(true)
})
```

Add helpers near existing `buttonByText` helper:

```ts
function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  descriptor?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function setTextAreaValue(textarea: HTMLTextAreaElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')
  descriptor?.set?.call(textarea, value)
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
}
```

- [ ] **Step 7: Run settings UI and dictionary tests**

Run:

```bash
bun run test src/shared/i18n/dictionaries.test.ts src/web/components/SettingsSurface.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit this task after explicit user confirmation**

Dangerous operation policy applies. Ask the user for confirmation before running:

```bash
git add src/shared/settings-pages.ts src/web/components/settings/SettingsLayout.tsx src/web/components/SettingsSurface.tsx src/web/components/settings/pages/TerminalSettings.tsx src/shared/i18n/en.ts src/shared/i18n/zh.ts src/shared/i18n/ko.ts src/shared/i18n/ja.ts src/shared/i18n/dictionaries.test.ts src/web/components/SettingsSurface.test.tsx
git commit -m "feat: add terminal custom button settings page"
```

### Task 4: Terminal Button Bar Rendering And Sending

**Files:**
- Modify: `src/web/components/terminal/TerminalSlot.tsx`
- Modify: `src/web/components/terminal/terminal-session.css`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/shared/i18n/ja.ts`
- Test: `src/web/components/terminal/TerminalSlot.test.tsx`
- Test: `src/shared/i18n/dictionaries.test.ts`

- [ ] **Step 1: Write failing terminal interaction tests**

In `src/web/components/terminal/TerminalSlot.test.tsx`, mock runtime buttons:

```ts
const runtimeSettingsMocks = vi.hoisted(() => ({
  terminalCustomButtons: [] as { label: string; value: string }[],
}))

vi.mock('#/web/runtime-settings-terminal-buttons.ts', () => ({
  useRuntimeTerminalCustomButtons: () => runtimeSettingsMocks.terminalCustomButtons,
}))
```

Reset in `afterEach`:

```ts
runtimeSettingsMocks.terminalCustomButtons = []
```

Add a helper near the bottom:

```ts
function controllerSnapshot() {
  const descriptor = {
    key: 'terminal-1',
    worktreeTerminalKey: '/repo\0/worktree',
    terminalId: 'terminal-1',
    index: 1,
    repoRoot: '/repo',
    branch: 'feature',
    worktreePath: '/worktree',
  }
  return {
    descriptor,
    worktreeSnapshot: {
      worktreeTerminalKey: '/repo\0/worktree',
      selectedDescriptor: descriptor,
      sessions: [{ ...descriptor, title: 'zsh', phase: 'open' as const, selected: true, hasBell: false }],
      count: 1,
    },
    snapshot: {
      phase: 'open' as const,
      message: null,
      processName: 'zsh',
      attachment: {
        role: 'controller' as const,
        controllerStatus: 'connected' as const,
        active: true,
        canTakeover: false,
        canonicalCols: 120,
        canonicalRows: 40,
      },
    },
  }
}
```

Add this test:

```tsx
test('renders custom terminal buttons and sends values directly to the active terminal', async () => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  runtimeSettingsMocks.terminalCustomButtons = [{ label: 'status', value: 'git status --short' }]
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  const writeInput = vi.fn()
  const { worktreeSnapshot, snapshot } = controllerSnapshot()
  const context: TerminalSessionContextValue = {
    createTerminal: vi.fn(async () => 'terminal-1'),
    selectTerminal: vi.fn(),
    scrollToBottom: vi.fn(),
    scrollLines: vi.fn(),
    clearBell: vi.fn(() => false),
    closeTerminalAndDismissDetailIfLast: vi.fn(() => []),
    attach: vi.fn(),
    detach: vi.fn(),
    restart: vi.fn(),
    isTerminalFocusTarget: vi.fn(() => false),
    findNext: vi.fn(() => ({ resultIndex: -1, resultCount: 0, found: false })),
    findPrevious: vi.fn(() => ({ resultIndex: -1, resultCount: 0, found: false })),
    clearSearch: vi.fn(),
    writeInput,
    takeover: vi.fn(),
    reorderSessions: vi.fn(async () => true),
    serialize: vi.fn(() => ''),
  }
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
    const button = Array.from(container.querySelectorAll('button')).find((node) => node.textContent === 'status')
    expect(button).toBeDefined()

    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(writeInput).toHaveBeenCalledWith('terminal-1', 'git status --short')
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})
```

Add the readonly test:

```tsx
test('does not render custom terminal buttons for readonly sessions', async () => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  runtimeSettingsMocks.terminalCustomButtons = [{ label: 'status', value: 'git status --short' }]
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  const { worktreeSnapshot, snapshot } = controllerSnapshot()
  const readonlySnapshot = {
    ...snapshot,
    attachment: {
      ...snapshot.attachment,
      role: 'viewer' as const,
      active: false,
      canTakeover: true,
    },
  }
  const context: TerminalSessionContextValue = {
    createTerminal: vi.fn(async () => 'terminal-1'),
    selectTerminal: vi.fn(),
    scrollToBottom: vi.fn(),
    scrollLines: vi.fn(),
    clearBell: vi.fn(() => false),
    closeTerminalAndDismissDetailIfLast: vi.fn(() => []),
    attach: vi.fn(),
    detach: vi.fn(),
    restart: vi.fn(),
    isTerminalFocusTarget: vi.fn(() => false),
    findNext: vi.fn(() => ({ resultIndex: -1, resultCount: 0, found: false })),
    findPrevious: vi.fn(() => ({ resultIndex: -1, resultCount: 0, found: false })),
    clearSearch: vi.fn(),
    writeInput: vi.fn(),
    takeover: vi.fn(),
    reorderSessions: vi.fn(async () => true),
    serialize: vi.fn(() => ''),
  }
  const readContext: TerminalSessionReadContextValue = {
    worktreeSnapshot: () => worktreeSnapshot,
    subscribeWorktree: () => () => {},
    repoSyncReady: () => true,
    subscribeRepoSync: () => () => {},
    snapshot: () => readonlySnapshot,
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
    expect(container.querySelector('.goblin-terminal-custom-buttons')).toBeNull()
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})
```

- [ ] **Step 2: Run terminal tests and verify they fail**

Run:

```bash
bun run test src/web/components/terminal/TerminalSlot.test.tsx
```

Expected before implementation: FAIL because `.goblin-terminal-custom-buttons` and `status` button do not exist.

- [ ] **Step 3: Implement `TerminalSlot` rendering**

In `src/web/components/terminal/TerminalSlot.tsx`, import:

```ts
import { useRuntimeTerminalCustomButtons } from '#/web/runtime-settings-terminal-buttons.ts'
```

Inside `TerminalSlot`, after `hasSessions`:

```ts
const terminalCustomButtons = useRuntimeTerminalCustomButtons()
```

After `isController`, derive visible buttons:

```ts
const visibleCustomButtons = isController
  ? terminalCustomButtons.filter((button) => button.label.trim() && button.value.trim())
  : []
```

Add the render block after `goblin-terminal-float-group`:

```tsx
{key && visibleCustomButtons.length > 0 && (
  <div className="goblin-terminal-custom-buttons" aria-label={t('terminal.custom-buttons')}>
    {visibleCustomButtons.map((button, index) => (
      <Button
        key={`${index}:${button.label}:${button.value}`}
        type="button"
        size="sm"
        variant="secondary"
        className="goblin-terminal-custom-buttons__button"
        title={button.value}
        onClick={() => writeInput(key, button.value)}
      >
        {button.label}
      </Button>
    ))}
  </div>
)}
```

- [ ] **Step 4: Add terminal button i18n key**

Add to `src/shared/i18n/en.ts`:

```ts
'terminal.custom-buttons': 'Custom terminal buttons',
```

Add to `src/shared/i18n/zh.ts`:

```ts
'terminal.custom-buttons': '自定义终端按钮',
```

Add to `src/shared/i18n/ko.ts`:

```ts
'terminal.custom-buttons': '사용자 지정 터미널 버튼',
```

Add to `src/shared/i18n/ja.ts`:

```ts
'terminal.custom-buttons': 'カスタムターミナルボタン',
```

- [ ] **Step 5: Add terminal CSS**

In `src/web/components/terminal/terminal-session.css`, add:

```css
.goblin-terminal-slot:has(.goblin-terminal-custom-buttons) .goblin-managed-terminal-frame {
  padding-bottom: 48px;
}

.goblin-terminal-custom-buttons {
  position: absolute;
  right: var(--goblin-terminal-overlay-offset);
  bottom: var(--goblin-terminal-overlay-offset);
  left: var(--goblin-terminal-overlay-offset);
  z-index: 2;
  display: flex;
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
}

.goblin-terminal-custom-buttons__button {
  max-width: 180px;
  min-width: 0;
  flex: 0 0 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- [ ] **Step 6: Run terminal and dictionary tests**

Run:

```bash
bun run test src/web/components/terminal/TerminalSlot.test.tsx src/shared/i18n/dictionaries.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit this task after explicit user confirmation**

Dangerous operation policy applies. Ask the user for confirmation before running:

```bash
git add src/web/components/terminal/TerminalSlot.tsx src/web/components/terminal/terminal-session.css src/web/components/terminal/TerminalSlot.test.tsx src/shared/i18n/en.ts src/shared/i18n/zh.ts src/shared/i18n/ko.ts src/shared/i18n/ja.ts
git commit -m "feat: render terminal custom button bar"
```

### Task 5: Full Verification And Integration Sweep

**Files:**
- Read: `docs/superpowers/specs/2026-06-14-terminal-custom-buttons-design.md`
- Verify: all files changed in Tasks 1-4

- [ ] **Step 1: Run targeted tests**

Run:

```bash
bun run test src/shared/settings-snapshot.test.ts src/server/modules/settings-source.test.ts src/web/settings-write-paths.test.ts src/shared/i18n/dictionaries.test.ts src/web/components/SettingsSurface.test.tsx src/web/components/terminal/TerminalSlot.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run architecture check**

Run:

```bash
bun run check:architecture
```

Expected: PASS.

- [ ] **Step 4: Run full test suite if targeted verification is clean**

Run:

```bash
bun run test
```

Expected: PASS.

- [ ] **Step 5: Manual smoke test in the app**

Run the dev server:

```bash
bun run dev
```

Manual checks:

- Open Settings -> Terminal.
- Add `label = status`, `value = git status --short`.
- Open a controllable terminal session.
- Confirm the bottom bar appears.
- Click `status`.
- Confirm the command is sent directly to the terminal and is not prefilled into a separate input.
- Remove all custom buttons.
- Confirm the terminal bottom bar disappears.

- [ ] **Step 6: Final commit after explicit user confirmation**

If the user wants one combined implementation commit instead of per-task commits, ask for confirmation before running:

```bash
git add src/shared/settings.ts src/shared/rpc.ts src/shared/settings-defaults.ts src/shared/bootstrap.ts src/shared/settings-snapshot.ts src/server/modules/settings-source.ts src/web/settings-client.ts src/web/settings-write-paths.ts src/web/settings-read-projection.ts src/web/runtime-settings-terminal-buttons.ts src/shared/settings-pages.ts src/web/components/settings/SettingsLayout.tsx src/web/components/SettingsSurface.tsx src/web/components/settings/pages/TerminalSettings.tsx src/shared/i18n/en.ts src/shared/i18n/zh.ts src/shared/i18n/ko.ts src/shared/i18n/ja.ts src/web/components/terminal/TerminalSlot.tsx src/web/components/terminal/terminal-session.css src/shared/settings-snapshot.test.ts src/server/modules/settings-source.test.ts src/web/settings-write-paths.test.ts src/shared/i18n/dictionaries.test.ts src/web/components/SettingsSurface.test.tsx src/web/components/terminal/TerminalSlot.test.tsx src/main/preload.test.ts src/main/rpc.test.ts src/server/app-factory.test.ts src/server/modules/remote.test.ts src/server/modules/settings-write-paths.test.ts src/server/modules/settings.test.ts src/shared/native-shell-projection.test.ts src/web/bootstrap.test.ts src/web/hooks/useBranchActionItems.test.tsx src/web/settings-client.test.ts src/web/stores/bootstrap-seed.test.ts src/web/stores/session-restore.test.ts docs/superpowers/specs/2026-06-14-terminal-custom-buttons-design.md docs/superpowers/plans/2026-06-14-terminal-custom-buttons.md
git commit -m "feat: add terminal custom buttons"
```
