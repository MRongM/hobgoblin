# Terminal Binary Paste Temp File Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让终端外部输入框在 `Ctrl+V` 粘贴二进制剪贴板内容时生成临时文件，并把生成路径插入输入框。

**Architecture:** 文本粘贴继续走 textarea 原生行为；二进制 paste 由 `TerminalSlot` 读取 `File.arrayBuffer()` 后经 renderer shell bridge 交给 main 进程写入文件。临时目录是通用设置字段，空值表示使用当前 worktree 的 `tmp/`，main 进程只校验 renderer 传入的目录并负责写入，避免跨层读取 server settings。

**Tech Stack:** React, TypeScript strip-only mode, Electron preload IPC, Vitest, Bun, existing settings runtime cache.

**Repository Constraint:** Do not add git commit steps. AGENTS.md says not to plan or execute commits unless the user explicitly asks.

---

## Scope Check

这是一个单一纵向功能：settings 字段、native 文件落盘能力、preload/renderer bridge、终端外部输入框 paste 行为和测试。它不改变 xterm 原生输入，不引入包依赖，不需要 server 路由或远端上传。

## File Structure

- Create `src/shared/clipboard-binary-temp-files.ts`: shared IPC payload/result types and size constants.
- Create `src/main/clipboard-binary-temp-files.ts`: main-process validation, filename inference, directory creation, exclusive file writes.
- Create `src/main/clipboard-binary-temp-files.test.ts`: focused filesystem tests for default worktree temp dir, configured absolute dir, extension inference, limits, and no overwrite.
- Modify `src/shared/settings.ts`: add `temporaryFilesDirectory` to `SettingsPrefs`.
- Modify `src/shared/settings-defaults.ts`: default `temporaryFilesDirectory` to empty string and include it in initial snapshots.
- Modify `src/shared/settings-snapshot.ts`: include `temporaryFilesDirectory` in runtime settings snapshots.
- Modify `src/shared/bootstrap.ts`: include `temporaryFilesDirectory` in `InitialSettingsSnapshot`.
- Modify `src/server/modules/settings-source.ts`: normalize persisted `temporaryFilesDirectory`.
- Modify `src/web/settings-client.ts`: add `setTemporaryFilesDirectory`.
- Modify `src/web/settings-write-paths.ts`: add cache update helper for `temporaryFilesDirectory`.
- Modify `src/web/settings-read-projection.ts`: expose `temporaryFilesDirectory` from general and terminal runtime projections.
- Modify `src/web/runtime-settings-general.ts`: add controller method for the new setting.
- Modify `src/web/runtime-settings-terminal-buttons.ts`: expose the field through terminal runtime settings for `TerminalSlot`.
- Modify `src/web/components/settings/pages/GeneralSettings.tsx`: add the text input row under `设置 -> 通用`.
- Modify `src/shared/i18n/en.ts`, `src/shared/i18n/zh.ts`, `src/shared/i18n/ja.ts`, `src/shared/i18n/ko.ts`: add labels and hints.
- Modify `src/shared/ipc-channels.ts`: add shell IPC channel for saving binary clipboard files.
- Modify `src/shared/bootstrap.ts`: add native capability `clipboard-binary-temp-files`.
- Modify `src/web/vite-env.d.ts`: type the preload shell method.
- Modify `src/web/renderer-bridge-types.ts`: type the renderer shell method.
- Modify `src/preload/preload.cjs`: expose `shell.saveClipboardBinaryFiles`.
- Modify `src/main/shell-bridge.ts`: wire trusted IPC handler.
- Modify `src/web/app-shell-client.ts`: add safe renderer helper.
- Modify `src/web/components/terminal/terminal-external-input.tsx`: pass `onPaste` to textarea.
- Modify `src/web/components/terminal/TerminalSlot.tsx`: classify paste payloads, save binary files, insert shell-escaped paths.
- Test existing files:
  - `src/shared/settings-snapshot.test.ts`
  - `src/server/modules/settings-source.test.ts`
  - `src/web/settings-write-paths.test.ts`
  - `src/web/components/SettingsSurface.test.tsx`
  - `src/main/preload.test.ts`
  - `src/main/shell-bridge.test.ts`
  - `src/web/app-shell-client.test.ts`
  - `src/web/components/terminal/TerminalSlot.test.tsx`

## Task 1: Shared Settings Field

**Files:**
- Modify: `src/shared/settings.ts`
- Modify: `src/shared/settings-defaults.ts`
- Modify: `src/shared/settings-snapshot.ts`
- Modify: `src/shared/bootstrap.ts`
- Modify: `src/server/modules/settings-source.ts`
- Test: `src/shared/settings-snapshot.test.ts`
- Test: `src/server/modules/settings-source.test.ts`

- [ ] **Step 1: Write failing snapshot coverage**

  In `src/shared/settings-snapshot.test.ts`, add `temporaryFilesDirectory` to both fixture prefs and expected runtime snapshots.

  First test fixture:

  ```ts
  temporaryFilesDirectory: '/Users/test/tmp',
  ```

  First test expected object:

  ```ts
  temporaryFilesDirectory: '/Users/test/tmp',
  ```

  Full snapshot fixture:

  ```ts
  temporaryFilesDirectory: '',
  ```

  Runtime assertion:

  ```ts
  expect(runtimeSettingsSnapshotFromSettingsSnapshot(snapshot)).toMatchObject({
    globalShortcutRegistered: false,
    temporaryFilesDirectory: '',
    terminalExternalInputEnabled: false,
    remoteTerminalTmuxEnabled: false,
    terminalCustomButtonsVisible: true,
    terminalCustomButtonSize: 'medium',
    terminalCustomButtons: [{ label: 'status', value: 'git status --short', action: 'execute' }],
  })
  ```

- [ ] **Step 2: Write failing settings-source coverage**

  In `src/server/modules/settings-source.test.ts`, add the default expectation:

  ```ts
  temporaryFilesDirectory: '',
  ```

  In the persisted update test, add this to the main update patch:

  ```ts
  temporaryFilesDirectory: path.join(tmp, 'terminal-paste'),
  ```

  Add the same value to the reloaded expectation:

  ```ts
  temporaryFilesDirectory: path.join(tmp, 'terminal-paste'),
  ```

  Add a separate test after the persisted update test:

  ```ts
  test('normalizes invalid temporary file directories to the default project tmp mode', async () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'gbl-server-settings-'))
    previousDataDir = process.env.GOBLIN_SERVER_DATA_DIR
    process.env.GOBLIN_SERVER_DATA_DIR = tmp

    const mod = await import('#/server/modules/settings-source.ts')
    await mod.updateServerSettingsPrefs({
      temporaryFilesDirectory: ' relative/tmp ',
    })

    expect(await mod.getServerSettingsPrefs()).toMatchObject({
      temporaryFilesDirectory: '',
    })
  })
  ```

  This keeps the absolute-path persistence assertion and the invalid-path fallback assertion independent.

- [ ] **Step 3: Run tests and verify they fail**

  Run:

  ```bash
  bun run test src/shared/settings-snapshot.test.ts src/server/modules/settings-source.test.ts
  ```

  Expected: FAIL with TypeScript/object shape errors because `temporaryFilesDirectory` is not part of settings yet.

- [ ] **Step 4: Extend shared settings types and defaults**

  In `src/shared/settings.ts`, add to `SettingsPrefs` after `toggleDetailOnActionBarBlankClick`:

  ```ts
  temporaryFilesDirectory: string
  ```

  In `src/shared/settings-defaults.ts`, add a default near the other settings constants:

  ```ts
  export const DEFAULT_TEMPORARY_FILES_DIRECTORY = ''
  ```

  Add to `defaultSettingsPrefs()` after `toggleDetailOnActionBarBlankClick`:

  ```ts
  temporaryFilesDirectory:
    overrides.temporaryFilesDirectory ?? DEFAULT_TEMPORARY_FILES_DIRECTORY,
  ```

  Add `temporaryFilesDirectory` to the `initialSettingsFromSnapshot()` `Pick` and return object:

  ```ts
  | 'temporaryFilesDirectory'
  ```

  ```ts
  temporaryFilesDirectory: snapshot.temporaryFilesDirectory,
  ```

- [ ] **Step 5: Add runtime snapshot and bootstrap fields**

  In `src/shared/settings-snapshot.ts`, add to `buildRuntimeSettingsSnapshot()`:

  ```ts
  temporaryFilesDirectory: input.prefs.temporaryFilesDirectory,
  ```

  Add `temporaryFilesDirectory` to `runtimeSettingsSnapshotFromSettingsSnapshot()` `Pick` and return object:

  ```ts
  | 'temporaryFilesDirectory'
  ```

  ```ts
  temporaryFilesDirectory: snapshot.temporaryFilesDirectory,
  ```

  In `src/shared/bootstrap.ts`, add to `InitialSettingsSnapshot`:

  ```ts
  temporaryFilesDirectory: string
  ```

- [ ] **Step 6: Normalize persisted setting**

  In `src/server/modules/settings-source.ts`, import `isValidAbsolutePath` alongside existing input-validation imports if not already available:

  ```ts
  import { isValidAbsolutePath, toSafeRepoLocator, toSafeSessionRepoEntry } from '#/shared/input-validation.ts'
  ```

  Add to `ServerSettingsData`:

  ```ts
  temporaryFilesDirectory: string
  ```

  Add this helper near the other normalizers:

  ```ts
  function normalizeTemporaryFilesDirectory(value: unknown): string {
    if (typeof value !== 'string') return ''
    const trimmed = value.trim()
    return isValidAbsolutePath(trimmed) ? trimmed : ''
  }
  ```

  Add to `settingsPrefsFromData()`:

  ```ts
  temporaryFilesDirectory: data.temporaryFilesDirectory,
  ```

  Add to `readServerSettingsFile()`:

  ```ts
  temporaryFilesDirectory: normalizeTemporaryFilesDirectory(parsed.temporaryFilesDirectory),
  ```

  Add to `updateServerSettingsPrefs()` after `nextToggleDetailOnActionBarBlankClick`:

  ```ts
  const nextTemporaryFilesDirectory =
    patch.temporaryFilesDirectory === undefined
      ? data.temporaryFilesDirectory
      : normalizeTemporaryFilesDirectory(patch.temporaryFilesDirectory)
  ```

  Include it in `changed`:

  ```ts
  data.temporaryFilesDirectory !== nextTemporaryFilesDirectory ||
  ```

  Assign it before writing:

  ```ts
  data.temporaryFilesDirectory = nextTemporaryFilesDirectory
  ```

- [ ] **Step 7: Run targeted tests**

  Run:

  ```bash
  bun run test src/shared/settings-snapshot.test.ts src/server/modules/settings-source.test.ts
  ```

  Expected: PASS.

## Task 2: Runtime Settings UI And Cache

**Files:**
- Modify: `src/web/settings-client.ts`
- Modify: `src/web/settings-write-paths.ts`
- Modify: `src/web/settings-read-projection.ts`
- Modify: `src/web/runtime-settings-general.ts`
- Modify: `src/web/runtime-settings-terminal-buttons.ts`
- Modify: `src/web/components/settings/pages/GeneralSettings.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Test: `src/web/settings-write-paths.test.ts`
- Test: `src/web/components/SettingsSurface.test.tsx`

- [ ] **Step 1: Add failing cache update test**

  In `src/web/settings-write-paths.test.ts`, add a mock function to `appDataClientMocks`:

  ```ts
  setTemporaryFilesDirectory: vi.fn(async () => {}),
  ```

  Export it from the `vi.mock('#/web/settings-client.ts', ...)` block:

  ```ts
  setTemporaryFilesDirectory: appDataClientMocks.setTemporaryFilesDirectory,
  ```

  Reset it in `beforeEach()`:

  ```ts
  appDataClientMocks.setTemporaryFilesDirectory.mockReset()
  appDataClientMocks.setTemporaryFilesDirectory.mockResolvedValue(undefined)
  ```

  Add this test:

  ```ts
  test('setTemporaryFilesDirectoryPreference updates runtime settings cache', async () => {
    mainWindowQueryClient.setQueryData(settingsSnapshotQueryKey(), defaultSettingsSnapshot())
    const { setTemporaryFilesDirectoryPreference } = await import('#/web/settings-write-paths.ts')

    await setTemporaryFilesDirectoryPreference('/Users/test/project/tmp')

    expect(appDataClientMocks.setTemporaryFilesDirectory).toHaveBeenCalledWith('/Users/test/project/tmp')
    expect(mainWindowQueryClient.getQueryData(settingsSnapshotQueryKey())).toMatchObject({
      temporaryFilesDirectory: '/Users/test/project/tmp',
    })
  })
  ```

- [ ] **Step 2: Add failing SettingsSurface test**

  In `src/web/components/SettingsSurface.test.tsx`, add `temporaryFilesDirectory: ''` to every `settings.get`, `initialSettings`, and `goblinNative.initialSettings` fixture.

  Add this test inside `describe('SettingsSurface', ...)`:

  ```ts
  test('updates the temporary files directory from general settings', async () => {
    await render(<SettingsSurface page="general" onPageChange={() => {}} />)

    const input = document.getElementById('settings-temporary-files-directory')
    expect(input).toBeInstanceOf(HTMLInputElement)

    await act(async () => {
      setTextInputValue(input as HTMLInputElement, '/Users/test/project/tmp')
      input?.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
    })

    expect(fetchMock.mock.calls.some((call) => {
      const [url, options] = call as unknown as [unknown, RequestInit | undefined]
      if (new URL(String(url)).pathname !== '/api/settings/prefs') return false
      const body = JSON.parse(String(options?.body ?? '{}')) as { settings?: Record<string, unknown> }
      return body.settings?.temporaryFilesDirectory === '/Users/test/project/tmp'
    })).toBe(true)
  })
  ```

  If the file already has an input setter helper, reuse it. Otherwise add this helper at the bottom:

  ```ts
  function setTextInputValue(input: HTMLInputElement, value: string) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
    descriptor?.set?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }
  ```

- [ ] **Step 3: Run UI/cache tests and verify they fail**

  Run:

  ```bash
  bun run test src/web/settings-write-paths.test.ts src/web/components/SettingsSurface.test.tsx
  ```

  Expected: FAIL because the client/write helpers and UI row do not exist yet.

- [ ] **Step 4: Add client and cache write helpers**

  In `src/web/settings-client.ts`, add:

  ```ts
  export async function setTemporaryFilesDirectory(path: string): Promise<void> {
    await updateSettingsPrefsPatch({ temporaryFilesDirectory: path })
  }
  ```

  In `src/web/settings-write-paths.ts`, import it:

  ```ts
  setTemporaryFilesDirectory,
  ```

  Add:

  ```ts
  export async function setTemporaryFilesDirectoryPreference(path: string): Promise<void> {
    await setTemporaryFilesDirectory(path)
    updateRuntimeSettingsSnapshotCache(mainWindowQueryClient, (current) => ({
      ...current,
      temporaryFilesDirectory: path,
    }))
  }
  ```

- [ ] **Step 5: Expose runtime projections**

  In `src/web/settings-read-projection.ts`, update `readRuntimeGeneralSettings()`:

  ```ts
  return {
    toggleDetailOnActionBarBlankClick:
      data?.toggleDetailOnActionBarBlankClick ?? fallback?.toggleDetailOnActionBarBlankClick ?? false,
    temporaryFilesDirectory: data?.temporaryFilesDirectory ?? fallback?.temporaryFilesDirectory ?? '',
  }
  ```

  Also add `temporaryFilesDirectory` to `readRuntimeTerminalSettings()` so `TerminalSlot` can read it from its existing hook:

  ```ts
  temporaryFilesDirectory: data?.temporaryFilesDirectory ?? fallback?.temporaryFilesDirectory ?? '',
  ```

  In `src/web/runtime-settings-general.ts`, import `setTemporaryFilesDirectoryPreference` and add to `useGeneralSettingsController()`:

  ```ts
  async setTemporaryFilesDirectory(path: string): Promise<void> {
    await runSettingsControllerAction('temporary files directory update', async () => {
      await setTemporaryFilesDirectoryPreference(path)
    })
  },
  ```

- [ ] **Step 6: Add General settings input**

  In `src/web/components/settings/pages/GeneralSettings.tsx`, import `Input`:

  ```ts
  import { Input } from '#/web/components/ui/input.tsx'
  ```

  Read and write the setting:

  ```ts
  const { toggleDetailOnActionBarBlankClick, temporaryFilesDirectory } = useRuntimeGeneralSettings()
  const { setToggleDetailOnActionBarBlankClick, setTemporaryFilesDirectory } = useGeneralSettingsController()
  ```

  Add a `SettingsRow` in the first `SettingsList`, after the action-bar blank toggle:

  ```tsx
  <SettingsRow
    controlId="settings-temporary-files-directory"
    label={t('settings.temporary-files-directory')}
    hint={t('settings.temporary-files-directory-hint')}
    control={
      <Input
        id="settings-temporary-files-directory"
        value={temporaryFilesDirectory}
        placeholder={t('settings.temporary-files-directory-placeholder')}
        className="h-8 w-64 max-w-full px-2 text-xs"
        onChange={(event) => void setTemporaryFilesDirectory(event.currentTarget.value)}
        aria-label={t('settings.temporary-files-directory')}
      />
    }
  />
  ```

- [ ] **Step 7: Add i18n keys**

  Add these keys to `src/shared/i18n/en.ts` near other general settings:

  ```ts
  'settings.temporary-files-directory': 'Temporary files directory',
  'settings.temporary-files-directory-hint':
    'Used when terminal binary paste creates files. Leave empty to use the current project tmp folder.',
  'settings.temporary-files-directory-placeholder': 'Current project tmp folder',
  ```

  Add these keys to `src/shared/i18n/zh.ts`:

  ```ts
  'settings.temporary-files-directory': '临时文件目录',
  'settings.temporary-files-directory-hint':
    '用于终端二进制粘贴生成文件。留空时使用当前项目的 tmp 目录。',
  'settings.temporary-files-directory-placeholder': '当前项目 tmp 目录',
  ```

  Add these keys to `src/shared/i18n/ja.ts`, keeping dictionary parity:

  ```ts
  'settings.temporary-files-directory': '一時ファイルディレクトリ',
  'settings.temporary-files-directory-hint':
    'ターミナルでバイナリを貼り付けたときに作成するファイルに使用します。空の場合は現在のプロジェクトの tmp フォルダを使用します。',
  'settings.temporary-files-directory-placeholder': '現在のプロジェクトの tmp フォルダ',
  ```

  Add these keys to `src/shared/i18n/ko.ts`, keeping dictionary parity:

  ```ts
  'settings.temporary-files-directory': '임시 파일 디렉터리',
  'settings.temporary-files-directory-hint':
    '터미널에서 바이너리를 붙여넣을 때 생성되는 파일에 사용합니다. 비워 두면 현재 프로젝트의 tmp 폴더를 사용합니다.',
  'settings.temporary-files-directory-placeholder': '현재 프로젝트 tmp 폴더',
  ```

- [ ] **Step 8: Run targeted tests**

  Run:

  ```bash
  bun run test src/web/settings-write-paths.test.ts src/web/components/SettingsSurface.test.tsx src/shared/i18n/dictionaries.test.ts
  ```

  Expected: PASS.

## Task 3: Main-Process Binary Temp File Saver

**Files:**
- Create: `src/shared/clipboard-binary-temp-files.ts`
- Create: `src/main/clipboard-binary-temp-files.ts`
- Test: `src/main/clipboard-binary-temp-files.test.ts`

- [ ] **Step 1: Create failing main tests**

  Create `src/main/clipboard-binary-temp-files.test.ts`:

  ```ts
  import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
  import { join } from 'node:path'
  import { tmpdir } from 'node:os'
  import { afterEach, describe, expect, test } from 'vitest'
  import {
    MAX_CLIPBOARD_BINARY_FILE_BYTES,
    MAX_CLIPBOARD_BINARY_TOTAL_BYTES,
  } from '#/shared/clipboard-binary-temp-files.ts'
  import { saveClipboardBinaryFilesToTemp } from '#/main/clipboard-binary-temp-files.ts'

  const roots: string[] = []

  afterEach(async () => {
    const { rm } = await import('node:fs/promises')
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })))
    roots.length = 0
  })

  async function tempRoot(label: string): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), `gbl-${label}-`))
    roots.push(root)
    return root
  }

  function bytes(value: string): ArrayBuffer {
    const encoded = new TextEncoder().encode(value)
    return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength)
  }

  function bufferWithByteLength(byteLength: number): ArrayBuffer {
    return { byteLength } as ArrayBuffer
  }

  describe('saveClipboardBinaryFilesToTemp', () => {
    test('writes files to the worktree tmp directory by default', async () => {
      const worktreePath = await tempRoot('worktree')
      const result = await saveClipboardBinaryFilesToTemp(
        {
          worktreePath,
          temporaryFilesDirectory: '',
          files: [{ name: 'screenshot.png', type: 'image/png', bytes: bytes('png') }],
        },
        {
          now: new Date(2026, 5, 15, 22, 15, 30),
          randomHex: () => 'a8f31c9d',
        },
      )

      expect(result).toEqual({
        ok: true,
        paths: [join(worktreePath, 'tmp', 'pasted-20260615-221530-a8f31c9d.png')],
      })
      if (result.ok) await expect(readFile(result.paths[0]!, 'utf8')).resolves.toBe('png')
    })

    test('uses a configured absolute temporary directory', async () => {
      const worktreePath = await tempRoot('worktree')
      const configured = await tempRoot('configured')
      const result = await saveClipboardBinaryFilesToTemp(
        {
          worktreePath,
          temporaryFilesDirectory: configured,
          files: [{ name: 'report.pdf', type: 'application/pdf', bytes: bytes('pdf') }],
        },
        {
          now: new Date(2026, 5, 15, 22, 15, 31),
          randomHex: () => '4b91d0aa',
        },
      )

      expect(result).toEqual({
        ok: true,
        paths: [join(configured, 'pasted-20260615-221531-4b91d0aa.pdf')],
      })
    })

    test('infers extensions from mime type when the file name has no extension', async () => {
      const worktreePath = await tempRoot('worktree')
      const result = await saveClipboardBinaryFilesToTemp(
        {
          worktreePath,
          temporaryFilesDirectory: '',
          files: [{ name: 'clipboard', type: 'image/jpeg', bytes: bytes('jpg') }],
        },
        {
          now: new Date(2026, 5, 15, 22, 15, 32),
          randomHex: () => '12345678',
        },
      )

      expect(result).toEqual({
        ok: true,
        paths: [join(worktreePath, 'tmp', 'pasted-20260615-221532-12345678.jpg')],
      })
    })

    test('falls back to bin extension for unknown binary content', async () => {
      const worktreePath = await tempRoot('worktree')
      const result = await saveClipboardBinaryFilesToTemp(
        {
          worktreePath,
          temporaryFilesDirectory: '',
          files: [{ name: '', type: 'application/octet-stream', bytes: bytes('raw') }],
        },
        {
          now: new Date(2026, 5, 15, 22, 15, 33),
          randomHex: () => 'abcdef12',
        },
      )

      expect(result).toEqual({
        ok: true,
        paths: [join(worktreePath, 'tmp', 'pasted-20260615-221533-abcdef12.bin')],
      })
    })

    test('does not overwrite an existing random filename', async () => {
      const worktreePath = await tempRoot('worktree')
      const existing = join(worktreePath, 'tmp')
      const { mkdir } = await import('node:fs/promises')
      await mkdir(existing, { recursive: true })
      await writeFile(join(existing, 'pasted-20260615-221534-deadbeef.png'), 'existing')

      let index = 0
      const values = ['deadbeef', 'cafebabe']
      const result = await saveClipboardBinaryFilesToTemp(
        {
          worktreePath,
          temporaryFilesDirectory: '',
          files: [{ name: 'image.png', type: 'image/png', bytes: bytes('new') }],
        },
        {
          now: new Date(2026, 5, 15, 22, 15, 34),
          randomHex: () => values[index++] ?? 'feedface',
        },
      )

      expect(result).toEqual({
        ok: true,
        paths: [join(worktreePath, 'tmp', 'pasted-20260615-221534-cafebabe.png')],
      })
    })

    test('rejects invalid worktree paths and oversized payloads', async () => {
      await expect(
        saveClipboardBinaryFilesToTemp({
          worktreePath: 'relative',
          temporaryFilesDirectory: '',
          files: [{ name: 'x.bin', type: '', bytes: bytes('x') }],
        }),
      ).resolves.toEqual({ ok: false, message: 'error.invalid-path' })

      await expect(
        saveClipboardBinaryFilesToTemp({
          worktreePath: await tempRoot('worktree'),
          temporaryFilesDirectory: '',
          files: [{ name: 'large.bin', type: '', bytes: bufferWithByteLength(MAX_CLIPBOARD_BINARY_FILE_BYTES + 1) }],
        }),
      ).resolves.toEqual({ ok: false, message: 'error.file-too-large' })

      const eightyMb = 80 * 1024 * 1024
      await expect(
        saveClipboardBinaryFilesToTemp({
          worktreePath: await tempRoot('worktree'),
          temporaryFilesDirectory: '',
          files: [
            { name: 'a.bin', type: '', bytes: bufferWithByteLength(eightyMb) },
            { name: 'b.bin', type: '', bytes: bufferWithByteLength(eightyMb) },
            { name: 'c.bin', type: '', bytes: bufferWithByteLength(eightyMb) },
          ],
        }),
      ).resolves.toEqual({ ok: false, message: 'error.file-too-large' })
    })
  })
  ```

- [ ] **Step 2: Run tests and verify they fail**

  Run:

  ```bash
  bun run test src/main/clipboard-binary-temp-files.test.ts
  ```

  Expected: FAIL because the shared and main modules do not exist.

- [ ] **Step 3: Add shared IPC types and limits**

  Create `src/shared/clipboard-binary-temp-files.ts`:

  ```ts
  export const MAX_CLIPBOARD_BINARY_FILE_BYTES = 100 * 1024 * 1024
  export const MAX_CLIPBOARD_BINARY_TOTAL_BYTES = 200 * 1024 * 1024

  export interface ClipboardBinaryFilePayload {
    name?: string
    type?: string
    bytes: ArrayBuffer
  }

  export interface SaveClipboardBinaryFilesInput {
    worktreePath: string
    temporaryFilesDirectory?: string
    files: ClipboardBinaryFilePayload[]
  }

  export type SaveClipboardBinaryFilesResult =
    | { ok: true; paths: string[] }
    | { ok: false; message: string }
  ```

- [ ] **Step 4: Implement main saver**

  Create `src/main/clipboard-binary-temp-files.ts`:

  ```ts
  import { randomBytes } from 'node:crypto'
  import { mkdir, writeFile } from 'node:fs/promises'
  import path from 'node:path'
  import {
    MAX_CLIPBOARD_BINARY_FILE_BYTES,
    MAX_CLIPBOARD_BINARY_TOTAL_BYTES,
    type SaveClipboardBinaryFilesInput,
    type SaveClipboardBinaryFilesResult,
  } from '#/shared/clipboard-binary-temp-files.ts'
  import { isValidAbsolutePath } from '#/shared/input-validation.ts'

  interface SaveOptions {
    now?: Date
    randomHex?: () => string
  }

  const MIME_EXTENSIONS: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'application/pdf': '.pdf',
  }

  export async function saveClipboardBinaryFilesToTemp(
    input: SaveClipboardBinaryFilesInput,
    options: SaveOptions = {},
  ): Promise<SaveClipboardBinaryFilesResult> {
    if (!isValidAbsolutePath(input.worktreePath)) return { ok: false, message: 'error.invalid-path' }
    if (!Array.isArray(input.files) || input.files.length === 0) return { ok: true, paths: [] }

    const sizes = input.files.map((file) => file.bytes?.byteLength ?? -1)
    if (sizes.some((size) => size < 0 || size > MAX_CLIPBOARD_BINARY_FILE_BYTES)) {
      return { ok: false, message: 'error.file-too-large' }
    }
    const total = sizes.reduce((sum, size) => sum + size, 0)
    if (total > MAX_CLIPBOARD_BINARY_TOTAL_BYTES) return { ok: false, message: 'error.file-too-large' }

    const targetDir = resolveTargetDirectory(input.worktreePath, input.temporaryFilesDirectory)
    if (!targetDir) return { ok: false, message: 'error.invalid-path' }

    try {
      await mkdir(targetDir, { recursive: true })
      const paths: string[] = []
      for (const file of input.files) {
        const extension = extensionForFile(file.name, file.type)
        const filePath = await writeUniqueFile(targetDir, extension, new Uint8Array(file.bytes), options)
        paths.push(filePath)
      }
      return { ok: true, paths }
    } catch {
      return { ok: false, message: 'error.failed-write-file' }
    }
  }

  function resolveTargetDirectory(worktreePath: string, configured: string | undefined): string | null {
    const trimmed = typeof configured === 'string' ? configured.trim() : ''
    if (trimmed) return isValidAbsolutePath(trimmed) ? path.normalize(trimmed) : null
    return path.join(path.normalize(worktreePath), 'tmp')
  }

  function extensionForFile(name: string | undefined, type: string | undefined): string {
    const basename = path.basename(name ?? '')
    const extension = path.extname(basename)
    if (isSafeExtension(extension)) return extension
    return MIME_EXTENSIONS[(type ?? '').toLowerCase()] ?? '.bin'
  }

  function isSafeExtension(extension: string): boolean {
    return /^\.[A-Za-z0-9]{1,16}$/.test(extension)
  }

  async function writeUniqueFile(
    targetDir: string,
    extension: string,
    bytes: Uint8Array,
    options: SaveOptions,
  ): Promise<string> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const filePath = path.join(targetDir, `pasted-${formatStamp(options.now ?? new Date())}-${randomHex(options)}${extension}`)
      try {
        await writeFile(filePath, bytes, { flag: 'wx' })
        return filePath
      } catch (err) {
        if ((err as { code?: string }).code !== 'EEXIST') throw err
      }
    }
    throw new Error('unique clipboard paste filename exhausted')
  }

  function randomHex(options: SaveOptions): string {
    return options.randomHex?.() ?? randomBytes(4).toString('hex')
  }

  function formatStamp(date: Date): string {
    const parts = [
      date.getFullYear(),
      date.getMonth() + 1,
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
      date.getSeconds(),
    ]
    const [year, month, day, hour, minute, second] = parts
    return `${year}${pad(month)}${pad(day)}-${pad(hour)}${pad(minute)}${pad(second)}`
  }

  function pad(value: number): string {
    return String(value).padStart(2, '0')
  }
  ```

- [ ] **Step 5: Run targeted tests**

  Run:

  ```bash
  bun run test src/main/clipboard-binary-temp-files.test.ts
  ```

  Expected: PASS.

## Task 4: Native Bridge And IPC Wiring

**Files:**
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/shared/bootstrap.ts`
- Modify: `src/web/vite-env.d.ts`
- Modify: `src/web/renderer-bridge-types.ts`
- Modify: `src/preload/preload.cjs`
- Modify: `src/main/shell-bridge.ts`
- Modify: `src/web/app-shell-client.ts`
- Test: `src/main/preload.test.ts`
- Test: `src/main/shell-bridge.test.ts`
- Test: `src/web/app-shell-client.test.ts`

- [ ] **Step 1: Add failing preload test**

  In `src/main/preload.test.ts`, import the new channel:

  ```ts
  SHELL_SAVE_CLIPBOARD_BINARY_FILES_CHANNEL,
  ```

  In `defaultArgv().settings`, add:

  ```ts
  temporaryFilesDirectory: '',
  ```

  In `forwards shell bridge calls to their IPC channels`, add:

  ```ts
  await goblinNative.shell.saveClipboardBinaryFiles({
    worktreePath: '/repo',
    temporaryFilesDirectory: '',
    files: [{ name: 'image.png', type: 'image/png', bytes: new ArrayBuffer(3) }],
  })
  ```

  And include the channel in the expected list after `SHELL_READ_CLIPBOARD_FILE_PATHS_CHANNEL`:

  ```ts
  SHELL_SAVE_CLIPBOARD_BINARY_FILES_CHANNEL,
  ```

- [ ] **Step 2: Add failing shell bridge test**

  In `src/main/shell-bridge.test.ts`, import the new channel:

  ```ts
  SHELL_SAVE_CLIPBOARD_BINARY_FILES_CHANNEL,
  ```

  Add `saveClipboardBinaryFilesToTemp` to the hoisted mocks:

  ```ts
  saveClipboardBinaryFilesToTemp: vi.fn(),
  ```

  Add a mock:

  ```ts
  vi.mock('#/main/clipboard-binary-temp-files.ts', () => ({
    saveClipboardBinaryFilesToTemp,
  }))
  ```

  In `wires shell bridge handlers`, expect the new handler:

  ```ts
  expect(ipcHandlers.has(SHELL_SAVE_CLIPBOARD_BINARY_FILES_CHANNEL)).toBe(true)
  ```

  Add trusted and untrusted tests:

  ```ts
  test('saves clipboard binary files for trusted senders', async () => {
    saveClipboardBinaryFilesToTemp.mockResolvedValue({ ok: true, paths: ['/repo/tmp/pasted.png'] })

    const input = {
      worktreePath: '/repo',
      temporaryFilesDirectory: '',
      files: [{ name: 'image.png', type: 'image/png', bytes: new ArrayBuffer(3) }],
    }
    const result = await invoke(SHELL_SAVE_CLIPBOARD_BINARY_FILES_CHANNEL, input)

    expect(result).toEqual({ ok: true, paths: ['/repo/tmp/pasted.png'] })
    expect(saveClipboardBinaryFilesToTemp).toHaveBeenCalledWith(input)
  })

  test('rejects clipboard binary saves for untrusted senders', async () => {
    const result = await invokeWithEvent(SHELL_SAVE_CLIPBOARD_BINARY_FILES_CHANNEL, {
      worktreePath: '/repo',
      temporaryFilesDirectory: '',
      files: [],
    }, {
      sender: { id: 99, once: vi.fn() },
      senderFrame: { url: 'https://example.com/' },
    } as any)

    expect(result).toEqual({ ok: false, message: 'error.invalid-path' })
    expect(saveClipboardBinaryFilesToTemp).not.toHaveBeenCalled()
  })
  ```

- [ ] **Step 3: Add failing app shell client test**

  In `src/web/app-shell-client.test.ts`, update `testBridge().hasCapability`:

  ```ts
  if (capability === 'clipboard-binary-temp-files') return nativeShell?.saveClipboardBinaryFiles !== undefined
  ```

  Add to the native shell test:

  ```ts
  test('saves clipboard binary files through the native shell', async () => {
    const bridgeModule = await import('#/web/renderer-bridge.ts')
    const saveClipboardBinaryFiles = vi.fn(async () => ({ ok: true as const, paths: ['/repo/tmp/pasted.png'] }))
    bridgeModule.setRendererBridgeForTests(
      testBridge({
        shell: () => ({
          openSettingsWindow: vi.fn(),
          openExternalUrl: vi.fn(),
          openDirectoryDialog: vi.fn(),
          consumeExternalOpenPaths: vi.fn(),
          openInFinder: vi.fn(),
          saveClipboardBinaryFiles,
        }),
      }),
    )

    const { saveClipboardBinaryFilesFromPaste } = await import('#/web/app-shell-client.ts')
    const input = {
      worktreePath: '/repo',
      temporaryFilesDirectory: '',
      files: [{ name: 'image.png', type: 'image/png', bytes: new ArrayBuffer(3) }],
    }
    await expect(saveClipboardBinaryFilesFromPaste(input)).resolves.toEqual({
      ok: true,
      paths: ['/repo/tmp/pasted.png'],
    })
    expect(saveClipboardBinaryFiles).toHaveBeenCalledWith(input)
  })

  test('returns an error for clipboard binary saves without a native shell', async () => {
    const { saveClipboardBinaryFilesFromPaste } = await import('#/web/app-shell-client.ts')
    await expect(saveClipboardBinaryFilesFromPaste({
      worktreePath: '/repo',
      temporaryFilesDirectory: '',
      files: [],
    })).resolves.toEqual({ ok: false, message: 'error.unsupported-native-bridge' })
  })
  ```

- [ ] **Step 4: Run bridge tests and verify they fail**

  Run:

  ```bash
  bun run test src/main/preload.test.ts src/main/shell-bridge.test.ts src/web/app-shell-client.test.ts
  ```

  Expected: FAIL because the channel and methods are not wired yet.

- [ ] **Step 5: Add channel and capability**

  In `src/shared/ipc-channels.ts`, add:

  ```ts
  export const SHELL_SAVE_CLIPBOARD_BINARY_FILES_CHANNEL = 'goblin:shell-save-clipboard-binary-files'
  ```

  In `src/shared/bootstrap.ts`, add the capability:

  ```ts
  | 'clipboard-binary-temp-files'
  ```

  And add it to `ELECTRON_RENDERER_CAPABILITIES`:

  ```ts
  'clipboard-binary-temp-files',
  ```

- [ ] **Step 6: Type renderer and native bridge surfaces**

  In `src/web/vite-env.d.ts`, import shared types:

  ```ts
  import type {
    SaveClipboardBinaryFilesInput,
    SaveClipboardBinaryFilesResult,
  } from '#/shared/clipboard-binary-temp-files.ts'
  ```

  Add to `GoblinNativeBridge.shell`:

  ```ts
  saveClipboardBinaryFiles?: (input: SaveClipboardBinaryFilesInput) => Promise<SaveClipboardBinaryFilesResult>
  ```

  In `src/web/renderer-bridge-types.ts`, import the same types and add to `RendererShellBridge`:

  ```ts
  saveClipboardBinaryFiles?: (input: SaveClipboardBinaryFilesInput) => Promise<SaveClipboardBinaryFilesResult>
  ```

- [ ] **Step 7: Expose preload method**

  In `src/preload/preload.cjs`, add to `IPC.shell`:

  ```js
  saveClipboardBinaryFiles: 'goblin:shell-save-clipboard-binary-files',
  ```

  Add to exposed `shell`:

  ```js
  saveClipboardBinaryFiles: (input) => safeInvoke(IPC.shell.saveClipboardBinaryFiles, input),
  ```

- [ ] **Step 8: Wire main IPC handler**

  In `src/main/shell-bridge.ts`, import:

  ```ts
  import { saveClipboardBinaryFilesToTemp } from '#/main/clipboard-binary-temp-files.ts'
  ```

  Add channel import:

  ```ts
  SHELL_SAVE_CLIPBOARD_BINARY_FILES_CHANNEL,
  ```

  Add handler after `SHELL_READ_CLIPBOARD_FILE_PATHS_CHANNEL`:

  ```ts
  ipcMain.handle(
    SHELL_SAVE_CLIPBOARD_BINARY_FILES_CHANNEL,
    async (event, input): Promise<{ ok: true; paths: string[] } | { ok: false; message: string }> => {
      if (!isTrustedIpcEvent(event)) return { ok: false, message: 'error.invalid-path' }
      return await saveClipboardBinaryFilesToTemp(input as never)
    },
  )
  ```

  Keep the handler thin; validation remains in `saveClipboardBinaryFilesToTemp()`.

- [ ] **Step 9: Add renderer helper**

  In `src/web/app-shell-client.ts`, import:

  ```ts
  import type {
    SaveClipboardBinaryFilesInput,
    SaveClipboardBinaryFilesResult,
  } from '#/shared/clipboard-binary-temp-files.ts'
  ```

  Add:

  ```ts
  export async function saveClipboardBinaryFilesFromPaste(
    input: SaveClipboardBinaryFilesInput,
  ): Promise<SaveClipboardBinaryFilesResult> {
    return (await nativeShell()?.saveClipboardBinaryFiles?.(input)) ?? {
      ok: false,
      message: 'error.unsupported-native-bridge',
    }
  }
  ```

- [ ] **Step 10: Run bridge tests**

  Run:

  ```bash
  bun run test src/main/preload.test.ts src/main/shell-bridge.test.ts src/web/app-shell-client.test.ts
  ```

  Expected: PASS.

## Task 5: Terminal External Input Paste Integration

**Files:**
- Modify: `src/web/components/terminal/terminal-external-input.tsx`
- Modify: `src/web/components/terminal/TerminalSlot.tsx`
- Test: `src/web/components/terminal/TerminalSlot.test.tsx`

- [ ] **Step 1: Add failing TerminalSlot paste tests**

  In `src/web/components/terminal/TerminalSlot.test.tsx`, update the `#/web/app-shell-client.ts` mock:

  ```ts
  const appShellMocks = vi.hoisted(() => ({
    saveClipboardBinaryFilesFromPaste: vi.fn(),
  }))

  vi.mock('#/web/app-shell-client.ts', () => ({
    pathForDroppedFile: () => '',
    saveClipboardBinaryFilesFromPaste: appShellMocks.saveClipboardBinaryFilesFromPaste,
  }))
  ```

  Add `temporaryFilesDirectory` to `runtimeSettingsMocks`:

  ```ts
  temporaryFilesDirectory: '',
  ```

  Return it from `useRuntimeTerminalSettings()`:

  ```ts
  temporaryFilesDirectory: runtimeSettingsMocks.temporaryFilesDirectory,
  ```

  Reset it in `afterEach()`:

  ```ts
  runtimeSettingsMocks.temporaryFilesDirectory = ''
  appShellMocks.saveClipboardBinaryFilesFromPaste.mockReset()
  ```

  Add these tests near the existing external input tests:

  ```ts
  test('does not intercept text paste in external input', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    runtimeSettingsMocks.terminalExternalInputEnabled = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const { worktreeSnapshot, snapshot } = controllerFixture()
    const context = terminalContext()
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
      expect(input).toBeInstanceOf(HTMLTextAreaElement)
      const event = new Event('paste', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'clipboardData', {
        value: {
          getData: (type: string) => (type === 'text/plain' ? 'plain text' : ''),
          files: [new File([new Uint8Array([1, 2, 3])], 'image.png', { type: 'image/png' })],
          items: [],
        },
      })

      await act(async () => {
        input?.dispatchEvent(event)
      })

      expect(event.defaultPrevented).toBe(false)
      expect(appShellMocks.saveClipboardBinaryFilesFromPaste).not.toHaveBeenCalled()
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('saves binary paste files and inserts returned paths into external input', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    runtimeSettingsMocks.terminalExternalInputEnabled = true
    runtimeSettingsMocks.temporaryFilesDirectory = '/Users/test/project/tmp'
    appShellMocks.saveClipboardBinaryFilesFromPaste.mockResolvedValue({
      ok: true,
      paths: ['/Users/test/project/tmp/pasted image.png'],
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const { worktreeSnapshot, snapshot } = controllerFixture()
    const context = terminalContext()
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
      const input = container.querySelector('.goblin-terminal-external-input__control') as HTMLTextAreaElement | null
      expect(input).toBeInstanceOf(HTMLTextAreaElement)
      const event = new Event('paste', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'clipboardData', {
        value: {
          getData: () => '',
          files: [new File([new Uint8Array([1, 2, 3])], 'image.png', { type: 'image/png' })],
          items: [],
        },
      })

      await act(async () => {
        input?.dispatchEvent(event)
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(event.defaultPrevented).toBe(true)
      expect(appShellMocks.saveClipboardBinaryFilesFromPaste).toHaveBeenCalledWith({
        worktreePath: '/worktree',
        temporaryFilesDirectory: '/Users/test/project/tmp',
        files: [{ name: 'image.png', type: 'image/png', bytes: expect.any(ArrayBuffer) }],
      })
      expect(input?.value).toBe("'/Users/test/project/tmp/pasted image.png'")
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('keeps external input unchanged when binary paste save fails', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    runtimeSettingsMocks.terminalExternalInputEnabled = true
    appShellMocks.saveClipboardBinaryFilesFromPaste.mockResolvedValue({ ok: false, message: 'error.failed-write-file' })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const { worktreeSnapshot, snapshot } = controllerFixture()
    const context = terminalContext()
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
      const input = container.querySelector('.goblin-terminal-external-input__control') as HTMLTextAreaElement | null
      expect(input).toBeInstanceOf(HTMLTextAreaElement)
      setInputValue(input, 'echo ')
      const event = new Event('paste', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'clipboardData', {
        value: {
          getData: () => '',
          files: [new File([new Uint8Array([1])], 'image.png', { type: 'image/png' })],
          items: [],
        },
      })

      await act(async () => {
        input?.dispatchEvent(event)
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(input?.value).toBe('echo ')
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

  Expected: FAIL because `onPaste` is not passed and terminal paste handling is missing.

- [ ] **Step 3: Pass paste handler through external input**

  In `src/web/components/terminal/terminal-external-input.tsx`, import `ClipboardEvent` type:

  ```ts
  type ClipboardEvent,
  ```

  Add prop:

  ```ts
  onPaste?: (event: ClipboardEvent<HTMLTextAreaElement>) => void
  ```

  Destructure it and pass to textarea:

  ```tsx
  onPaste={onPaste}
  ```

- [ ] **Step 4: Implement TerminalSlot paste handling**

  In `src/web/components/terminal/TerminalSlot.tsx`, import `ClipboardEvent` type:

  ```ts
  type ClipboardEvent,
  ```

  Import renderer helper and shared payload type:

  ```ts
  import { pathForDroppedFile, saveClipboardBinaryFilesFromPaste } from '#/web/app-shell-client.ts'
  import type { ClipboardBinaryFilePayload } from '#/shared/clipboard-binary-temp-files.ts'
  ```

  Read `temporaryFilesDirectory` from `useRuntimeTerminalSettings()`:

  ```ts
  const {
    terminalExternalInputEnabled,
    terminalCustomButtonsVisible,
    terminalCustomButtonSize,
    terminalCustomButtons,
    temporaryFilesDirectory,
  } = useRuntimeTerminalSettings()
  ```

  Add this callback near the external input drop handler:

  ```ts
  const handleExternalInputPaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const clipboardData = event.clipboardData
      if (!clipboardData || clipboardData.getData('text/plain').length > 0) return
      const files = binaryPasteFiles(clipboardData)
      if (files.length === 0) return
      event.preventDefault()
      event.stopPropagation()
      const textarea = externalInputRef.current
      const selectionStart = textarea?.selectionStart ?? externalInputValue.length
      const selectionEnd = textarea?.selectionEnd ?? selectionStart
      void savePastedBinaryFiles(files, {
        worktreePath,
        temporaryFilesDirectory,
        externalInputValue,
        selectionStart,
        selectionEnd,
        setExternalInputValue,
        focusInput: () => externalInputRef.current,
      })
    },
    [externalInputValue, temporaryFilesDirectory, worktreePath],
  )
  ```

  Pass it to `TerminalExternalInput`:

  ```tsx
  onPaste={handleExternalInputPaste}
  ```

  Add helpers at the bottom of `TerminalSlot.tsx`:

  ```ts
  function binaryPasteFiles(data: DataTransfer): File[] {
    const files = Array.from(data.files ?? []).filter((file) => file.size > 0)
    if (files.length > 0) return files
    return Array.from(data.items ?? [])
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => !!file && file.size > 0)
  }

  async function savePastedBinaryFiles(
    files: File[],
    options: {
      worktreePath: string
      temporaryFilesDirectory: string
      externalInputValue: string
      selectionStart: number
      selectionEnd: number
      setExternalInputValue: (value: string) => void
      focusInput: () => HTMLTextAreaElement | null
    },
  ): Promise<void> {
    const payload = await Promise.all(files.map(fileToClipboardPayload))
    const result = await saveClipboardBinaryFilesFromPaste({
      worktreePath: options.worktreePath,
      temporaryFilesDirectory: options.temporaryFilesDirectory,
      files: payload,
    })
    if (!result.ok || result.paths.length === 0) return
    const text = result.paths.map(shellEscapePath).join(' ')
    const next = insertExternalInputText(
      options.externalInputValue,
      options.selectionStart,
      options.selectionEnd,
      text,
    )
    options.setExternalInputValue(next.value)
    queueMicrotask(() => {
      const input = options.focusInput()
      if (!input) return
      input.focus({ preventScroll: true })
      input.setSelectionRange(next.cursor, next.cursor)
    })
  }

  async function fileToClipboardPayload(file: File): Promise<ClipboardBinaryFilePayload> {
    return {
      name: file.name,
      type: file.type,
      bytes: await file.arrayBuffer(),
    }
  }
  ```

- [ ] **Step 5: Run terminal tests**

  Run:

  ```bash
  bun run test src/web/components/terminal/TerminalSlot.test.tsx
  ```

  Expected: PASS.

## Task 6: Full Verification

**Files:**
- All files modified by Tasks 1-5.
- Check: `docs/superpowers/specs/2026-06-15-terminal-binary-paste-temp-file-design.md`

- [ ] **Step 1: Run architecture guard**

  Run:

  ```bash
  bun run check:architecture
  ```

  Expected: PASS. This is important because `src/main/**` must not import `src/server/**`; the design keeps settings reads in renderer/server and file writes in main.

- [ ] **Step 2: Run typecheck**

  Run:

  ```bash
  bun run typecheck
  ```

  Expected: PASS. If fixtures fail because `InitialSettingsSnapshot` now requires `temporaryFilesDirectory`, add:

  ```ts
  temporaryFilesDirectory: '',
  ```

  to the local fixture object and rerun typecheck.

- [ ] **Step 3: Run targeted test suite**

  Run:

  ```bash
  bun run test src/shared/settings-snapshot.test.ts src/server/modules/settings-source.test.ts src/web/settings-write-paths.test.ts src/web/components/SettingsSurface.test.tsx src/main/clipboard-binary-temp-files.test.ts src/main/preload.test.ts src/main/shell-bridge.test.ts src/web/app-shell-client.test.ts src/web/components/terminal/TerminalSlot.test.tsx src/shared/i18n/dictionaries.test.ts
  ```

  Expected: PASS.

- [ ] **Step 4: Run full test suite**

  Run:

  ```bash
  bun run test
  ```

  Expected: PASS.

- [ ] **Step 5: Manual smoke path**

  Run the app with the project’s normal dev command if needed:

  ```bash
  bun run dev
  ```

  In the app:

  - Open `设置 -> 通用`.
  - Confirm “临时文件目录” exists and is empty by default.
  - Enable terminal external input if it is disabled.
  - Copy an image or binary file to the system clipboard.
  - Paste into the terminal external input.
  - Confirm the input receives a shell-escaped path under `<worktree>/tmp` when the setting is empty.
  - Set an absolute temporary directory in settings.
  - Paste again and confirm the inserted path uses the configured directory.

## Self-Review

- Spec coverage: settings default/configuration is covered by Tasks 1-2; main-process write, filename policy, size limits, and no overwrite are covered by Task 3; bridge/preload/trusted sender is covered by Task 4; terminal text/binary paste behavior is covered by Task 5; verification commands are covered by Task 6.
- Type consistency: shared payload type is `SaveClipboardBinaryFilesInput`, result type is `SaveClipboardBinaryFilesResult`, renderer helper is `saveClipboardBinaryFilesFromPaste`, main helper is `saveClipboardBinaryFilesToTemp`.
- Scope discipline: the plan does not change xterm native input, does not add cleanup, preview, directory picker, package dependencies, or server routes.
