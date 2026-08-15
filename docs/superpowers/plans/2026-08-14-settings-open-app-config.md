# Settings Open App Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user open Hobgoblin's entire application data/config directory in their selected external editor from General Settings.

**Architecture:** A narrow server action resolves the app data directory locally and reads the authoritative editor preference before invoking the existing editor adapter. The settings route and client expose a body-free fixed endpoint; General Settings renders the single-flight, availability-aware action and localized failure feedback.

**Tech Stack:** TypeScript, Hono, React, Vitest, existing external-editor adapters and Sonner toast UI.

## Global Constraints

- Use Node.js strip-only TypeScript: no enums, namespaces with runtime code, parameter properties, or import aliases.
- Use repository aliases with explicit `.ts`/`.tsx` suffixes.
- Do not accept or reveal an application data-directory path in Web input or output.
- Reuse `serverDataDir()`, `getServerSettingsPrefs()`, `openInPreferredEditor()`, `useAsyncPending()`, and the existing settings UI primitives.
- Add each new i18n key to `en.ts`, `zh.ts`, `ja.ts`, and `ko.ts`.
- Do not create a Git branch or commit; the user explicitly requested inline execution and repository instructions prohibit implicit commits.

---

### Task 1: Server-side trusted app-config editor action

**Files:**
- Create: `src/server/modules/settings-external-actions.ts`
- Create: `src/server/modules/settings-external-actions.test.ts`

**Interfaces:**
- Consumes: `serverDataDir(): string`, `getServerSettingsPrefs(): Promise<SettingsPrefs>`, `openInPreferredEditor(target, pref)`.
- Produces: `openAppConfigDirectoryInEditor(): Promise<ExecResult>`.

- [x] **Step 1: Write the failing test**

```ts
test('opens the fixed application data directory in the configured editor', async () => {
  mocks.serverDataDir.mockReturnValue('/app-data')
  mocks.getServerSettingsPrefs.mockResolvedValue({ editorApp: 'cursor' })
  mocks.openInPreferredEditor.mockResolvedValue({ ok: true, message: '' })

  const { openAppConfigDirectoryInEditor } = await import('#/server/modules/settings-external-actions.ts')

  await expect(openAppConfigDirectoryInEditor()).resolves.toEqual({ ok: true, message: '' })
  expect(mocks.openInPreferredEditor).toHaveBeenCalledWith('/app-data', 'cursor')
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `bun run test src/server/modules/settings-external-actions.test.ts`  
Expected: FAIL because `settings-external-actions.ts` and `openAppConfigDirectoryInEditor` do not exist.

- [x] **Step 3: Write minimal implementation**

```ts
import { serverDataDir } from '#/server/common/data-dir.ts'
import { getServerSettingsPrefs } from '#/server/modules/settings-source.ts'
import { openInPreferredEditor } from '#/system/editors.ts'
import type { ExecResult } from '#/shared/git-types.ts'

export async function openAppConfigDirectoryInEditor(): Promise<ExecResult> {
  const prefs = await getServerSettingsPrefs()
  return await openInPreferredEditor(serverDataDir(), prefs.editorApp)
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `bun run test src/server/modules/settings-external-actions.test.ts`  
Expected: PASS.

### Task 2: Fixed settings route and Web client contract

**Files:**
- Modify: `src/server/routes/settings.ts`
- Modify: `src/server/routes/settings.test.ts`
- Modify: `src/web/settings-client.ts`
- Modify: `src/web/settings-client.test.ts`

**Interfaces:**
- Consumes: `openAppConfigDirectoryInEditor(): Promise<ExecResult>` from Task 1.
- Produces: `POST /api/settings/open-app-config-editor` and `openAppConfigEditor(): Promise<ExecResult>`.

- [x] **Step 1: Write failing route and client tests**

```ts
test('delegates app-config editor opens without accepting a request path', async () => {
  mocks.openAppConfigDirectoryInEditor.mockResolvedValue({ ok: true, message: '' })
  const app = createSettingsRoutes(createServerSettingsState())
  const response = await app.request('/open-app-config-editor', { method: 'POST' })

  await expect(response.json()).resolves.toEqual({ ok: true, message: '' })
  expect(mocks.openAppConfigDirectoryInEditor).toHaveBeenCalledWith()
})

test('opens the fixed app-config endpoint', async () => {
  const { openAppConfigEditor } = await import('#/web/settings-client.ts')
  await expect(openAppConfigEditor()).resolves.toEqual({ ok: true, message: '' })
  expect(fetchMock).toHaveBeenCalledWith(
    'http://127.0.0.1:32100/api/settings/open-app-config-editor',
    expect.objectContaining({ method: 'POST', body: JSON.stringify({}) }),
  )
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `bun run test src/server/routes/settings.test.ts src/web/settings-client.test.ts`  
Expected: FAIL because the route and client method do not exist.

- [x] **Step 3: Add the minimal route and client method**

```ts
// src/server/routes/settings.ts
app.post('/open-app-config-editor', async (c) => c.json(await openAppConfigDirectoryInEditor()))

// src/web/settings-client.ts
export async function openAppConfigEditor(): Promise<ExecResult> {
  return await postServerJson<{}, ExecResult>('/api/settings/open-app-config-editor', {})
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `bun run test src/server/routes/settings.test.ts src/web/settings-client.test.ts`  
Expected: PASS.

### Task 3: General Settings action, localization, and interaction feedback

**Files:**
- Modify: `src/web/components/settings/pages/GeneralSettings.tsx`
- Create: `src/web/components/settings/pages/GeneralSettings.test.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`

**Interfaces:**
- Consumes: `openAppConfigEditor(): Promise<ExecResult>`, `useRuntimeExternalAppSettings()`, `useAsyncPending<'open-app-config-editor'>()`, `toast`, and the i18n keys below.
- Produces: an enabled only when an editor is available “Open configuration directory” button in General Settings.

- [x] **Step 1: Write failing UI tests**

```tsx
test('opens the app configuration directory once through the selected editor', async () => {
  mocks.openAppConfigEditor.mockResolvedValue({ ok: true, message: '' })
  await render(<GeneralSettings />)

  await act(async () => buttonByText('settings.general.open-app-config-action').click())

  expect(mocks.openAppConfigEditor).toHaveBeenCalledTimes(1)
})

test('disables the action when no selected editor is available', async () => {
  mocks.useRuntimeExternalAppSettings.mockReturnValue({ editorAvailable: false })
  await render(<GeneralSettings />)

  expect(buttonByText('settings.general.open-app-config-action')).toBeDisabled()
})
```

- [x] **Step 2: Run UI test to verify it fails**

Run: `bun run test src/web/components/settings/pages/GeneralSettings.test.tsx`  
Expected: FAIL because the configuration action is absent.

- [x] **Step 3: Add localized copy and minimal UI behavior**

```ts
// Add the same four keys in all four dictionaries.
'settings.general.open-app-config-title': 'Open application configuration',
'settings.general.open-app-config-body': 'Open the directory containing application settings and workspace configuration in the selected editor.',
'settings.general.open-app-config-action': 'Open configuration directory',
'settings.general.open-app-config-failed': 'Could not open application configuration',
```

```tsx
const { editorAvailable } = useRuntimeExternalAppSettings()
const { pending, isPending, run } = useAsyncPending<'open-app-config-editor'>()

function openAppConfigDirectory(): void {
  if (!editorAvailable || isPending) return
  void run('open-app-config-editor', async () => {
    try {
      const result = await openAppConfigEditor()
      if (!result.ok) toast.error(t('settings.general.open-app-config-failed'), { description: t(result.message) })
    } catch {
      toast.error(t('settings.general.open-app-config-failed'))
    }
  })
}
```

Render this handler in a `SettingsRow` with a `Button`, `FolderOpen` icon, `disabled={!editorAvailable || isPending}`, and its pending state exposed through `aria-busy` and button label.

- [x] **Step 4: Run UI and dictionary tests to verify they pass**

Run: `bun run test src/web/components/settings/pages/GeneralSettings.test.tsx src/shared/i18n/dictionaries.test.ts`  
Expected: PASS.

### Task 4: Focused integration verification

**Files:**
- Verify only: files from Tasks 1–3.

**Interfaces:**
- Consumes: the completed server action, route, client, UI, and translations.
- Produces: verified feature behavior with no architecture-boundary violations.

- [x] **Step 1: Run the complete focused feature suite**

Run: `bun run test src/server/modules/settings-external-actions.test.ts src/server/routes/settings.test.ts src/web/settings-client.test.ts src/web/components/settings/pages/GeneralSettings.test.tsx src/shared/i18n/dictionaries.test.ts`  
Expected: PASS.

- [x] **Step 2: Run repository validation**

Run: `bun run typecheck && bun run test && bun run check:architecture`  
Expected: all commands PASS. If an unrelated concurrent worktree edit fails typecheck or tests, record the exact failure without editing its files.

- [x] **Step 3: Inspect the feature diff**

Run: `git diff --check -- src/server/modules/settings-external-actions.ts src/server/modules/settings-external-actions.test.ts src/server/routes/settings.ts src/server/routes/settings.test.ts src/web/settings-client.ts src/web/settings-client.test.ts src/web/components/settings/pages/GeneralSettings.tsx src/web/components/settings/pages/GeneralSettings.test.tsx src/shared/i18n/en.ts src/shared/i18n/zh.ts src/shared/i18n/ja.ts src/shared/i18n/ko.ts`  
Expected: no whitespace errors.
