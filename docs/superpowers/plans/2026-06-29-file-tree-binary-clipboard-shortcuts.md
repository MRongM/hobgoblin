# File Tree Binary Clipboard Shortcuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 支持文件树单个普通文件的 `Ctrl/Cmd+Shift+C/V` 系统剪贴板内容复制和替换，覆盖文本、二进制、本地、远程，并在文件区设置中提供默认 30 MB、范围 1-100 MB 的大小上限。

**Architecture:** 保持 renderer 只负责快捷键和状态编排；repo server/system 层负责本地/远程文件内容读写、路径校验和大小限制；main/preload shell bridge 负责系统剪贴板自定义格式、文本 fallback 和 file URL 兼容格式。第一版只支持单个普通文件，不扩展目录、多选或 symlink。

**Tech Stack:** TypeScript strip-only mode, React, Hono server routes, Electron clipboard/preload IPC, Bun test runner, existing SSH command builder.

**Project Constraint:** 按 `AGENTS.md`，本计划不包含 `git commit` 或分支操作步骤，除非用户后续明确要求。

---

## Files And Responsibilities

- Modify: `src/shared/settings.ts`
  - Add file-tree clipboard size constants and `SettingsPrefs.fileTreeClipboardMaxBytesMb`.
- Modify: `src/shared/settings-defaults.ts`
  - Add default setting, include it in default snapshots and initial bootstrap projection.
- Modify: `src/shared/bootstrap.ts`
  - Add field to `InitialSettingsSnapshot`.
- Modify: `src/shared/rpc.ts`
  - Ensure runtime and persisted settings snapshots include the new `SettingsPrefs` field through the existing type extension.
- Modify: `src/shared/settings-snapshot.ts`
  - Project the setting into `RuntimeSettingsSnapshot`.
- Modify: `src/server/modules/settings-source.ts`
  - Persist and normalize `fileTreeClipboardMaxBytesMb`.
- Modify: `src/web/settings-read-projection.ts`, `src/web/settings-write-paths.ts`, `src/web/settings-client.ts`
  - Expose runtime read and write paths.
- Create: `src/web/runtime-settings-file-area.ts`
  - Aggregate file-area runtime settings and controller actions.
- Modify: `src/web/components/settings/pages/FileAreaSettings.tsx`
  - Add number input under file-area settings.
- Modify: `src/shared/i18n/en.ts`, `src/shared/i18n/zh.ts`, `src/shared/i18n/ja.ts`, `src/shared/i18n/ko.ts`
  - Add labels and error copy.
- Modify: `src/shared/file-tree.ts`
  - Add binary file read/replace request and result types plus validators.
- Modify: `src/web/repo-client.ts`
  - Add client helpers for binary read/replace routes.
- Modify: `src/server/routes/repo.ts`
  - Add `/file-tree/read-binary-file` and `/file-tree/replace-binary-file`.
- Modify: `src/server/modules/repo-read-paths.ts`, `src/server/modules/repo-write-paths.ts`
  - Dispatch binary read/replace to local or remote implementations.
- Modify: `src/system/file-tree/local.ts`
  - Add local binary read/replace functions.
- Modify: `src/system/ssh/commands.ts`, `src/system/ssh/git.ts`
  - Add remote binary read/replace commands and parsers.
- Create: `src/shared/file-tree-clipboard.ts`
  - Define clipboard payload, result types, custom format name, max normalizer.
- Create: `src/main/file-tree-clipboard.ts`
  - Implement system clipboard write/read, temporary file handling, cleanup.
- Modify: `src/shared/bootstrap.ts`, `src/web/renderer-bridge-types.ts`, `src/web/vite-env.d.ts`, `src/shared/ipc-channels.ts`, `src/preload/preload.cjs`, `src/main/shell-bridge.ts`, `src/web/app-shell-client.ts`
  - Add trusted native bridge capability and IPC methods.
- Modify: `src/web/components/file-tree/ProjectFileTree.tsx`
  - Route `Ctrl/Cmd+Shift+C/V` through binary clipboard flow and update undo.
- Tests:
  - `src/shared/settings-defaults.test.ts`
  - `src/server/modules/settings-source.test.ts`
  - `src/web/components/SettingsSurface.test.tsx` or `src/web/components/settings/pages/FileAreaSettings.test.tsx`
  - `src/shared/file-tree.test.ts`
  - `src/system/file-tree/local.test.ts`
  - `src/system/ssh/commands.test.ts`
  - `src/system/ssh/git.test.ts`
  - `src/server/modules/repo.test.ts`
  - `src/server/routes/repo.test.ts`
  - `src/main/file-tree-clipboard.test.ts`
  - `src/main/preload.test.ts`
  - `src/main/shell-bridge.test.ts`
  - `src/web/app-shell-client.test.ts`
  - `src/web/components/file-tree/ProjectFileTree.test.tsx`

## Task 1: Settings Field And File-Area UI

**Files:**
- Modify: `src/shared/settings.ts`
- Modify: `src/shared/settings-defaults.ts`
- Modify: `src/shared/bootstrap.ts`
- Modify: `src/shared/rpc.ts`
- Modify: `src/shared/settings-snapshot.ts`
- Modify: `src/server/modules/settings-source.ts`
- Modify: `src/web/settings-client.ts`
- Modify: `src/web/settings-write-paths.ts`
- Modify: `src/web/settings-read-projection.ts`
- Create: `src/web/runtime-settings-file-area.ts`
- Modify: `src/web/components/settings/pages/FileAreaSettings.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Test: `src/shared/settings-defaults.test.ts`
- Test: `src/server/modules/settings-source.test.ts`

- [ ] **Step 1: Add failing settings tests**

Add tests that prove the default value, bootstrap projection, and persisted normalization work. Use existing test helpers in each file; keep cases close to current font-size settings tests.

```ts
// src/shared/settings-defaults.test.ts
import {
  DEFAULT_FILE_TREE_CLIPBOARD_MAX_BYTES_MB,
  defaultInitialSettingsSnapshot,
  defaultSettingsPrefs,
} from '#/shared/settings-defaults.ts'

test('defaults file tree clipboard max bytes to 30 MB', () => {
  expect(DEFAULT_FILE_TREE_CLIPBOARD_MAX_BYTES_MB).toBe(30)
  expect(defaultSettingsPrefs().fileTreeClipboardMaxBytesMb).toBe(30)
  expect(defaultInitialSettingsSnapshot().fileTreeClipboardMaxBytesMb).toBe(30)
})
```

```ts
// src/server/modules/settings-source.test.ts
test('normalizes file tree clipboard max bytes setting', async () => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'gbl-server-settings-'))
  previousDataDir = process.env.GOBLIN_SERVER_DATA_DIR
  process.env.GOBLIN_SERVER_DATA_DIR = tmp

  const mod = await import('#/server/modules/settings-source.ts')
  await mod.updateServerSettingsPrefs({ fileTreeClipboardMaxBytesMb: 250 })
  await expect(mod.getServerSettingsPrefs()).resolves.toMatchObject({ fileTreeClipboardMaxBytesMb: 100 })

  await mod.updateServerSettingsPrefs({ fileTreeClipboardMaxBytesMb: -5 })
  await expect(mod.getServerSettingsPrefs()).resolves.toMatchObject({ fileTreeClipboardMaxBytesMb: 1 })

  await mod.updateServerSettingsPrefs({ fileTreeClipboardMaxBytesMb: 'large' as never })
  await expect(mod.getServerSettingsPrefs()).resolves.toMatchObject({ fileTreeClipboardMaxBytesMb: 30 })
})
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```sh
bun run test src/shared/settings-defaults.test.ts src/server/modules/settings-source.test.ts
```

Expected: fail because `fileTreeClipboardMaxBytesMb` constants and settings fields do not exist.

- [ ] **Step 3: Add shared settings constants and defaults**

In `src/shared/settings.ts`, add:

```ts
export const DEFAULT_FILE_TREE_CLIPBOARD_MAX_BYTES_MB = 30
export const MIN_FILE_TREE_CLIPBOARD_MAX_BYTES_MB = 1
export const MAX_FILE_TREE_CLIPBOARD_MAX_BYTES_MB = 100
```

Extend `SettingsPrefs`:

```ts
fileTreeClipboardMaxBytesMb: number
```

In `src/shared/settings-defaults.ts`, import and re-export the constants with the existing settings constants. Add to `defaultSettingsPrefs()`:

```ts
fileTreeClipboardMaxBytesMb:
  overrides.fileTreeClipboardMaxBytesMb ?? DEFAULT_FILE_TREE_CLIPBOARD_MAX_BYTES_MB,
```

Add `fileTreeClipboardMaxBytesMb` to `initialSettingsFromSnapshot()` input pick list and return object:

```ts
fileTreeClipboardMaxBytesMb: snapshot.fileTreeClipboardMaxBytesMb,
```

In `src/shared/bootstrap.ts`, add:

```ts
fileTreeClipboardMaxBytesMb: number
```

In `src/shared/rpc.ts`, no separate property is needed if `RuntimeSettingsSnapshot extends SettingsPrefs`; run typecheck after updating `SettingsPrefs` to confirm the propagated snapshot types compile.

- [ ] **Step 4: Add server normalization and persistence**

In `src/server/modules/settings-source.ts`, import the constants and add:

```ts
function normalizeFileTreeClipboardMaxBytesMb(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_FILE_TREE_CLIPBOARD_MAX_BYTES_MB
  return Math.max(
    MIN_FILE_TREE_CLIPBOARD_MAX_BYTES_MB,
    Math.min(MAX_FILE_TREE_CLIPBOARD_MAX_BYTES_MB, Math.round(value)),
  )
}
```

Add `fileTreeClipboardMaxBytesMb: number` to `ServerSettingsData`, add it in `settingsPrefsFromData()`, and add it in `readServerSettingsFile()`:

```ts
fileTreeClipboardMaxBytesMb: normalizeFileTreeClipboardMaxBytesMb(parsed.fileTreeClipboardMaxBytesMb),
```

In `updateServerSettingsPrefs()`, add a normalized next value, include it in the `changed` expression, and write it into the `Object.assign(data, ...)` payload:

```ts
const nextFileTreeClipboardMaxBytesMb =
  patch.fileTreeClipboardMaxBytesMb === undefined
    ? data.fileTreeClipboardMaxBytesMb
    : normalizeFileTreeClipboardMaxBytesMb(patch.fileTreeClipboardMaxBytesMb)
```

```ts
data.fileTreeClipboardMaxBytesMb !== nextFileTreeClipboardMaxBytesMb
```

```ts
fileTreeClipboardMaxBytesMb: nextFileTreeClipboardMaxBytesMb,
```

- [ ] **Step 5: Add renderer read/write paths**

In `src/web/settings-client.ts`, add:

```ts
export async function setFileTreeClipboardMaxBytesMb(value: number): Promise<number> {
  const result = await updateSettingsPrefsPatch({ fileTreeClipboardMaxBytesMb: value })
  return result.settings.fileTreeClipboardMaxBytesMb
}
```

In `src/web/settings-write-paths.ts`, import it and add:

```ts
export async function setFileTreeClipboardMaxBytesMbPreference(value: number): Promise<number> {
  const fileTreeClipboardMaxBytesMb = await setFileTreeClipboardMaxBytesMb(value)
  updateRuntimeSettingsSnapshotCache(mainWindowQueryClient, (current) => ({ ...current, fileTreeClipboardMaxBytesMb }))
  return fileTreeClipboardMaxBytesMb
}
```

In `src/web/settings-read-projection.ts`, add a focused file-area projection:

```ts
export function readRuntimeFileAreaSettings(data: RuntimeSettingsSnapshot | undefined) {
  const fallback = fallbackInitialSettings()
  return {
    fileTreeFontSize:
      data?.fileTreeFontSize ?? fallback?.fileTreeFontSize ?? DEFAULT_FILE_TREE_FONT_SIZE,
    fileTreeTopbarFontSize:
      data?.fileTreeTopbarFontSize ?? fallback?.fileTreeTopbarFontSize ?? DEFAULT_FILE_TREE_TOPBAR_FONT_SIZE,
    fileTreeClipboardMaxBytesMb:
      data?.fileTreeClipboardMaxBytesMb ??
      fallback?.fileTreeClipboardMaxBytesMb ??
      DEFAULT_FILE_TREE_CLIPBOARD_MAX_BYTES_MB,
  }
}
```

Create `src/web/runtime-settings-file-area.ts`:

```ts
import { readRuntimeFileAreaSettings, useRuntimeSettingsSnapshot } from '#/web/settings-read-projection.ts'
import {
  runSettingsControllerAction,
  setFileTreeClipboardMaxBytesMbPreference,
  setFileTreeFontSizePreference,
  setFileTreeTopbarFontSizePreference,
} from '#/web/settings-write-paths.ts'

export function useRuntimeFileAreaSettings() {
  return readRuntimeFileAreaSettings(useRuntimeSettingsSnapshot())
}

export function useFileAreaSettingsController() {
  return {
    async setFileTreeFontSize(fontSize: number): Promise<void> {
      await runSettingsControllerAction('file tree font size update', async () => {
        await setFileTreeFontSizePreference(fontSize)
      })
    },
    async setFileTreeTopbarFontSize(fontSize: number): Promise<void> {
      await runSettingsControllerAction('file tree topbar font size update', async () => {
        await setFileTreeTopbarFontSizePreference(fontSize)
      })
    },
    async setFileTreeClipboardMaxBytesMb(value: number): Promise<void> {
      await runSettingsControllerAction('file tree clipboard max size update', async () => {
        await setFileTreeClipboardMaxBytesMbPreference(value)
      })
    },
  }
}
```

- [ ] **Step 6: Add file-area settings UI**

In `src/web/components/settings/pages/FileAreaSettings.tsx`, replace the `runtime-settings-fonts.ts` import with `runtime-settings-file-area.ts`. Import the min/max constants. Read `fileTreeClipboardMaxBytesMb` from `useRuntimeFileAreaSettings()` and `setFileTreeClipboardMaxBytesMb` from `useFileAreaSettingsController()`.

Add a new settings row under the file-area layout group:

```tsx
<SettingsRow
  controlId="settings-file-tree-clipboard-max-bytes"
  label={t('settings.files.clipboard-max-size')}
  hint={t('settings.files.clipboard-max-size-hint')}
  control={
    <SettingsNumberInput
      id="settings-file-tree-clipboard-max-bytes"
      min={MIN_FILE_TREE_CLIPBOARD_MAX_BYTES_MB}
      max={MAX_FILE_TREE_CLIPBOARD_MAX_BYTES_MB}
      value={fileTreeClipboardMaxBytesMb}
      onChange={(value) => void setFileTreeClipboardMaxBytesMb(value)}
    />
  }
/>
```

- [ ] **Step 7: Add i18n copy**

Add these keys to all four dictionaries:

```ts
'settings.files.clipboard-max-size': 'Clipboard size limit',
'settings.files.clipboard-max-size-hint': 'Maximum file contents copied or replaced with file-area shortcuts, in MB.',
'error.file-tree-clipboard-file-too-large': 'File exceeds the file-area clipboard size limit.',
```

Use equivalent existing-language translations in `zh`, `ja`, and `ko`.

- [ ] **Step 8: Run tests**

Run:

```sh
bun run test src/shared/settings-defaults.test.ts src/server/modules/settings-source.test.ts src/shared/settings-snapshot.test.ts src/shared/i18n/dictionaries.test.ts
```

Expected: pass.

## Task 2: Shared Binary File-Tree Types

**Files:**
- Modify: `src/shared/file-tree.ts`
- Test: `src/shared/file-tree.test.ts`

- [ ] **Step 1: Add failing validator tests**

Add tests:

```ts
test('validates binary file read requests', () => {
  expect(isRepoFileTreeBinaryFileReadRequest({
    repoId: '/repo',
    worktreePath: '/repo',
    filePath: '/repo/image.png',
    maxBytes: 30 * 1024 * 1024,
  })).toBe(true)
  expect(isRepoFileTreeBinaryFileReadRequest({
    repoId: '/repo',
    worktreePath: '/repo',
    filePath: '/repo/image.png',
    maxBytes: 0,
  })).toBe(false)
})

test('validates binary file replace requests', () => {
  expect(isRepoFileTreeBinaryFileReplaceRequest({
    repoId: '/repo',
    worktreePath: '/repo',
    filePath: '/repo/image.png',
    maxBytes: 30 * 1024 * 1024,
    bytesBase64: Buffer.from([0, 1, 2]).toString('base64'),
  })).toBe(true)
  expect(isRepoFileTreeBinaryFileReplaceRequest({
    repoId: '/repo',
    worktreePath: '/repo',
    filePath: '/repo/image.png',
    maxBytes: 30,
    bytesBase64: 'not base64!',
  })).toBe(false)
})
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```sh
bun run test src/shared/file-tree.test.ts
```

Expected: fail because validators do not exist.

- [ ] **Step 3: Add types and validators**

In `src/shared/file-tree.ts`, add:

```ts
export interface RepoFileTreeBinaryFileReadRequest {
  repoId: string
  worktreePath: string
  filePath: string
  maxBytes: number
}

export type RepoFileTreeBinaryFileReadResult =
  | {
      ok: true
      name: string
      byteLength: number
      bytesBase64: string
      text?: string
      mimeType?: string
    }
  | {
      ok: false
      message: string
    }

export interface RepoFileTreeBinaryFileReplaceRequest {
  repoId: string
  worktreePath: string
  filePath: string
  maxBytes: number
  bytesBase64: string
}

export type RepoFileTreeBinaryFileReplaceResult =
  | {
      ok: true
      previousBytesBase64: string
      previousByteLength: number
    }
  | {
      ok: false
      message: string
    }
```

Add helper and validators:

```ts
function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function isBase64String(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(value) && value.length % 4 === 0
}

export function isRepoFileTreeBinaryFileReadRequest(value: unknown): value is RepoFileTreeBinaryFileReadRequest {
  return (
    isRecord(value) &&
    typeof value.repoId === 'string' &&
    typeof value.worktreePath === 'string' &&
    typeof value.filePath === 'string' &&
    isPositiveSafeInteger(value.maxBytes)
  )
}

export function isRepoFileTreeBinaryFileReplaceRequest(value: unknown): value is RepoFileTreeBinaryFileReplaceRequest {
  return (
    isRecord(value) &&
    typeof value.repoId === 'string' &&
    typeof value.worktreePath === 'string' &&
    typeof value.filePath === 'string' &&
    isPositiveSafeInteger(value.maxBytes) &&
    isBase64String(value.bytesBase64)
  )
}
```

- [ ] **Step 4: Run test**

Run:

```sh
bun run test src/shared/file-tree.test.ts
```

Expected: pass.

## Task 3: Local Binary File Read And Replace

**Files:**
- Modify: `src/system/file-tree/local.ts`
- Test: `src/system/file-tree/local.test.ts`

- [ ] **Step 1: Add failing local tests**

Add tests near text-file read/replace tests:

```ts
describe('readLocalFileTreeBinaryFile', () => {
  test('reads ordinary binary files as base64', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-file-tree-'))
    const filePath = join(root, 'image.bin')
    await writeFile(filePath, Buffer.from([0, 1, 2, 255]))

    await expect(readLocalFileTreeBinaryFile(root, filePath, 30)).resolves.toEqual({
      ok: true,
      name: 'image.bin',
      byteLength: 4,
      bytesBase64: Buffer.from([0, 1, 2, 255]).toString('base64'),
    })
  })

  test('rejects binary files over max bytes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-file-tree-'))
    const filePath = join(root, 'large.bin')
    await writeFile(filePath, Buffer.from([1, 2, 3, 4]))

    await expect(readLocalFileTreeBinaryFile(root, filePath, 3)).resolves.toEqual({
      ok: false,
      message: 'error.file-tree-clipboard-file-too-large',
    })
  })
})

describe('replaceLocalFileTreeBinaryFile', () => {
  test('replaces bytes and returns previous bytes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-file-tree-'))
    const filePath = join(root, 'data.bin')
    await writeFile(filePath, Buffer.from([9, 8]))

    const result = await replaceLocalFileTreeBinaryFile(root, filePath, Buffer.from([1, 2]).toString('base64'), 30)

    expect(result).toEqual({
      ok: true,
      previousBytesBase64: Buffer.from([9, 8]).toString('base64'),
      previousByteLength: 2,
    })
    await expect(readFile(filePath)).resolves.toEqual(Buffer.from([1, 2]))
  })
})
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```sh
bun run test src/system/file-tree/local.test.ts
```

Expected: fail because local binary functions do not exist.

- [ ] **Step 3: Implement local binary helpers**

In `src/system/file-tree/local.ts`, import `basename` behavior via existing `path` import and add:

```ts
function validateBinaryMaxBytes(maxBytes: number): boolean {
  return Number.isSafeInteger(maxBytes) && maxBytes > 0
}

function isBase64String(value: string): boolean {
  return /^[A-Za-z0-9+/]*={0,2}$/.test(value) && value.length % 4 === 0
}

function decodeReplacementBase64(bytesBase64: string, maxBytes: number): { ok: true; bytes: Buffer } | { ok: false; message: string } {
  if (!validateBinaryMaxBytes(maxBytes) || typeof bytesBase64 !== 'string') return { ok: false, message: 'error.invalid-arguments' }
  if (!isBase64String(bytesBase64)) return { ok: false, message: 'error.invalid-arguments' }
  const bytes = Buffer.from(bytesBase64, 'base64')
  if (bytes.toString('base64') !== bytesBase64) return { ok: false, message: 'error.invalid-arguments' }
  if (bytes.byteLength > maxBytes) return { ok: false, message: 'error.file-tree-clipboard-file-too-large' }
  return { ok: true, bytes }
}

export async function readLocalFileTreeBinaryFile(
  worktreePath: string,
  filePath: string,
  maxBytes: number,
): Promise<RepoFileTreeBinaryFileReadResult> {
  if (!isAbsolutePathInput(worktreePath) || !isAbsolutePathInput(filePath) || !validateBinaryMaxBytes(maxBytes)) {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  const root = path.resolve(worktreePath)
  const file = path.resolve(filePath)
  if (!pathInsideRoot(root, file)) return { ok: false, message: 'error.invalid-path' }
  const info = await fs.lstat(file).catch((err: unknown) => err)
  if (!isFileStat(info)) return { ok: false, message: classifyFsWriteError(info) }
  if (!info.isFile()) return { ok: false, message: 'error.file-tree-not-regular-file' }
  if (info.size > maxBytes) return { ok: false, message: 'error.file-tree-clipboard-file-too-large' }
  try {
    const bytes = await fs.readFile(file)
    if (bytes.byteLength > maxBytes) return { ok: false, message: 'error.file-tree-clipboard-file-too-large' }
    return {
      ok: true,
      name: path.basename(file),
      byteLength: bytes.byteLength,
      bytesBase64: bytes.toString('base64'),
      text: decodeUtf8Text(bytes).ok ? decodeUtf8Text(bytes).content : undefined,
    }
  } catch (err) {
    return { ok: false, message: classifyFsWriteError(err) }
  }
}

export async function replaceLocalFileTreeBinaryFile(
  worktreePath: string,
  filePath: string,
  bytesBase64: string,
  maxBytes: number,
): Promise<RepoFileTreeBinaryFileReplaceResult> {
  if (!isAbsolutePathInput(worktreePath) || !isAbsolutePathInput(filePath)) {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  const next = decodeReplacementBase64(bytesBase64, maxBytes)
  if (!next.ok) return next
  const previous = await readLocalFileTreeBinaryFile(worktreePath, filePath, maxBytes)
  if (!previous.ok) return previous
  try {
    await fs.writeFile(path.resolve(filePath), next.bytes)
    return {
      ok: true,
      previousBytesBase64: previous.bytesBase64,
      previousByteLength: previous.byteLength,
    }
  } catch (err) {
    return { ok: false, message: classifyFsWriteError(err) }
  }
}
```

- [ ] **Step 4: Run local tests**

Run:

```sh
bun run test src/system/file-tree/local.test.ts
```

Expected: pass.

## Task 4: Remote Binary File Read And Replace

**Files:**
- Modify: `src/system/ssh/commands.ts`
- Modify: `src/system/ssh/git.ts`
- Test: `src/system/ssh/commands.test.ts`
- Test: `src/system/ssh/git.test.ts`

- [ ] **Step 1: Add failing remote command tests**

Add command tests that assert Python scripts are generated for:

```ts
buildRemoteCommand({
  type: 'readFileTreeBinaryFile',
  worktreePath: '/srv/repo',
  filePath: '/srv/repo/image.bin',
  maxBytes: 31457280,
})
```

Expected snippets:

```ts
expect(script).toContain('base64.b64encode(raw).decode("ascii")')
expect(script).toContain('"bytesBase64"')
expect(script).toContain('max_bytes = 31457280')
```

For replace:

```ts
buildRemoteCommand({
  type: 'replaceFileTreeBinaryFile',
  worktreePath: '/srv/repo',
  filePath: '/srv/repo/image.bin',
  maxBytes: 31457280,
})
```

Expected snippets:

```ts
expect(script).toContain('base64.b64decode(stdin_raw, validate=True)')
expect(script).toContain('"previousBytesBase64"')
expect(script).toContain('with open(file_path, "wb") as handle:')
```

- [ ] **Step 2: Add failing git parser tests**

In `src/system/ssh/git.test.ts`, add:

```ts
test('readRemoteFileTreeBinaryFile parses remote JSON binary content', async () => {
  const run = vi.fn(async () => ({
    ok: true,
    stdout: JSON.stringify({
      ok: true,
      name: 'image.bin',
      byteLength: 3,
      bytesBase64: Buffer.from([1, 2, 3]).toString('base64'),
    }),
    stderr: '',
  }))

  await expect(readRemoteFileTreeBinaryFile(TARGET, '/srv/repo', '/srv/repo/image.bin', 30, { run: run as any })).resolves.toEqual({
    ok: true,
    name: 'image.bin',
    byteLength: 3,
    bytesBase64: Buffer.from([1, 2, 3]).toString('base64'),
  })
})
```

- [ ] **Step 3: Run tests and verify they fail**

Run:

```sh
bun run test src/system/ssh/commands.test.ts src/system/ssh/git.test.ts
```

Expected: fail because command kinds and exported functions do not exist.

- [ ] **Step 4: Add remote command kinds and scripts**

In `src/system/ssh/commands.ts`, extend `RemoteCommandKind`:

```ts
| { type: 'readFileTreeBinaryFile'; worktreePath: string; filePath: string; maxBytes: number }
| { type: 'replaceFileTreeBinaryFile'; worktreePath: string; filePath: string; maxBytes: number }
```

Add cases:

```ts
case 'readFileTreeBinaryFile':
  return remoteReadFileTreeBinaryFileScript(command)
case 'replaceFileTreeBinaryFile':
  return remoteReplaceFileTreeBinaryFileScript(command)
```

Add a binary preamble based on `remoteTextFilePreamble`, but without UTF-8 decode:

```ts
function remoteBinaryFilePreamble(worktreePath: string, maxBytes: number): string[] {
  return [
    'import base64, json, os, stat, sys',
    `root = ${pythonString(worktreePath)}`,
    `max_bytes = ${Math.max(1, Math.floor(maxBytes))}`,
    'root_real = os.path.normpath(root)',
    'def finish(payload):',
    '    print(json.dumps(payload, ensure_ascii=False))',
    '    sys.exit(0)',
    'def fail(message):',
    '    finish({"ok": False, "message": message})',
    'def inside_root(value):',
    '    candidate = os.path.normpath(value)',
    "    return candidate == root_real or candidate.startswith(root_real.rstrip('/') + '/')",
    'def checked_file_path(value):',
    '    if not isinstance(value, str) or not value or "\\x00" in value:',
    '        fail("error.invalid-arguments")',
    '    candidate = os.path.normpath(value)',
    '    if not os.path.isabs(candidate):',
    '        fail("error.invalid-arguments")',
    '    if not inside_root(candidate):',
    '        fail("error.invalid-path")',
    '    return candidate',
    'def read_binary_file(path_value):',
    '    try:',
    '        info = os.lstat(path_value)',
    '    except FileNotFoundError:',
    '        fail("error.path-not-found")',
    '    except PermissionError:',
    '        fail("error.path-permission-denied")',
    '    if not stat.S_ISREG(info.st_mode):',
    '        fail("error.file-tree-not-regular-file")',
    '    if info.st_size > max_bytes:',
    '        fail("error.file-tree-clipboard-file-too-large")',
    '    try:',
    '        with open(path_value, "rb") as handle:',
    '            raw = handle.read(max_bytes + 1)',
    '    except PermissionError:',
    '        fail("error.path-permission-denied")',
    '    except OSError:',
    '        fail("error.failed-read-repo")',
    '    if len(raw) > max_bytes:',
    '        fail("error.file-tree-clipboard-file-too-large")',
    '    return raw',
  ]
}
```

Add read and replace script functions:

```ts
function remoteReadFileTreeBinaryFileScript(command: Extract<RemoteCommandKind, { type: 'readFileTreeBinaryFile' }>): string {
  return [
    "python3 - <<'PY'",
    ...remoteBinaryFilePreamble(command.worktreePath, command.maxBytes),
    `file_path = checked_file_path(${pythonString(command.filePath)})`,
    'raw = read_binary_file(file_path)',
    'finish({"ok": True, "name": os.path.basename(file_path), "byteLength": len(raw), "bytesBase64": base64.b64encode(raw).decode("ascii")})',
    'PY',
  ].join('\n')
}

function remoteReplaceFileTreeBinaryFileScript(command: Extract<RemoteCommandKind, { type: 'replaceFileTreeBinaryFile' }>): string {
  const script = [
    ...remoteBinaryFilePreamble(command.worktreePath, command.maxBytes),
    `file_path = checked_file_path(${pythonString(command.filePath)})`,
    'stdin_raw = sys.stdin.buffer.read()',
    'try:',
    '    next_raw = base64.b64decode(stdin_raw, validate=True)',
    'except Exception:',
    '    fail("error.invalid-arguments")',
    'if len(next_raw) > max_bytes:',
    '    fail("error.file-tree-clipboard-file-too-large")',
    'previous_raw = read_binary_file(file_path)',
    'try:',
    '    with open(file_path, "wb") as handle:',
    '        handle.write(next_raw)',
    'except PermissionError:',
    '    fail("error.path-permission-denied")',
    'except OSError:',
    '    fail("error.failed-read-repo")',
    'finish({"ok": True, "previousBytesBase64": base64.b64encode(previous_raw).decode("ascii"), "previousByteLength": len(previous_raw)})',
  ].join('\n')
  return `python3 -c ${shellQuote(script)}`
}
```

- [ ] **Step 5: Add remote git functions and parsers**

In `src/system/ssh/git.ts`, import binary result types and add:

```ts
export async function readRemoteFileTreeBinaryFile(
  target: RemoteRepoTarget,
  worktreePath: string,
  filePath: string,
  maxBytes: number,
  options: { signal?: AbortSignal; run?: RemoteGitRunner } = {},
): Promise<RepoFileTreeBinaryFileReadResult> {
  const run: RemoteGitRunner = options.run ?? ((command, t, runOptions) => runRemoteCommand(t, command, runOptions))
  const result = await run(
    { type: 'readFileTreeBinaryFile', worktreePath, filePath, maxBytes },
    target,
    { signal: options.signal, timeoutMs: REMOTE_FILE_TRANSFER_TIMEOUT_MS, maxBuffer: REMOTE_FILE_TRANSFER_MAX_BUFFER },
  )
  if (options.signal?.aborted) return { ok: false, message: 'cancelled' }
  if (!result.ok && !result.stdout) return { ok: false, message: remoteExecResult(result).message }
  return parseRemoteBinaryFileReadResult(result.stdout)
}

export async function replaceRemoteFileTreeBinaryFile(
  target: RemoteRepoTarget,
  worktreePath: string,
  filePath: string,
  bytesBase64: string,
  maxBytes: number,
  options: { signal?: AbortSignal; run?: RemoteGitRunner } = {},
): Promise<RepoFileTreeBinaryFileReplaceResult> {
  const run: RemoteGitRunner = options.run ?? ((command, t, runOptions) => runRemoteCommand(t, command, runOptions))
  const result = await run(
    { type: 'replaceFileTreeBinaryFile', worktreePath, filePath, maxBytes },
    target,
    { signal: options.signal, timeoutMs: REMOTE_FILE_TRANSFER_TIMEOUT_MS, stdin: bytesBase64, maxBuffer: REMOTE_FILE_TRANSFER_MAX_BUFFER },
  )
  if (options.signal?.aborted) return { ok: false, message: 'cancelled' }
  if (!result.ok && !result.stdout) return { ok: false, message: remoteExecResult(result).message }
  return parseRemoteBinaryFileReplaceResult(result.stdout)
}
```

Add parsers:

```ts
function parseRemoteBinaryFileReadResult(value: string): RepoFileTreeBinaryFileReadResult {
  try {
    const parsed = JSON.parse(value) as Partial<RepoFileTreeBinaryFileReadResult>
    if (
      parsed.ok === true &&
      typeof parsed.name === 'string' &&
      typeof parsed.byteLength === 'number' &&
      typeof parsed.bytesBase64 === 'string'
    ) {
      return { ok: true, name: parsed.name, byteLength: parsed.byteLength, bytesBase64: parsed.bytesBase64 }
    }
    if (parsed.ok === false && typeof parsed.message === 'string') return { ok: false, message: parsed.message }
  } catch {
    return { ok: false, message: 'error.failed-read-repo' }
  }
  return { ok: false, message: 'error.failed-read-repo' }
}

function parseRemoteBinaryFileReplaceResult(value: string): RepoFileTreeBinaryFileReplaceResult {
  try {
    const parsed = JSON.parse(value) as Partial<RepoFileTreeBinaryFileReplaceResult>
    if (
      parsed.ok === true &&
      typeof parsed.previousBytesBase64 === 'string' &&
      typeof parsed.previousByteLength === 'number'
    ) {
      return {
        ok: true,
        previousBytesBase64: parsed.previousBytesBase64,
        previousByteLength: parsed.previousByteLength,
      }
    }
    if (parsed.ok === false && typeof parsed.message === 'string') return { ok: false, message: parsed.message }
  } catch {
    return { ok: false, message: 'error.failed-read-repo' }
  }
  return { ok: false, message: 'error.failed-read-repo' }
}
```

- [ ] **Step 6: Run remote tests**

Run:

```sh
bun run test src/system/ssh/commands.test.ts src/system/ssh/git.test.ts
```

Expected: pass.

## Task 5: Server Routes And Repo Client

**Files:**
- Modify: `src/server/modules/repo-read-paths.ts`
- Modify: `src/server/modules/repo-write-paths.ts`
- Modify: `src/server/routes/repo.ts`
- Modify: `src/web/repo-client.ts`
- Test: `src/server/modules/repo.test.ts`
- Test: `src/server/routes/repo.test.ts`
- Test: `src/web/repo-client.test.ts`

- [ ] **Step 1: Add failing server dispatch tests**

Add tests mirroring text-file tests:

```ts
test('readRepositoryFileTreeBinaryFile dispatches local and remote repos', async () => {
  const { readRepositoryFileTreeBinaryFile } = await import('#/server/modules/repo-read-paths.ts')
  await expect(readRepositoryFileTreeBinaryFile('/tmp/repo', '/tmp/repo', '/tmp/repo/image.bin', 30)).resolves.toEqual({
    ok: true,
    name: 'image.bin',
    byteLength: 3,
    bytesBase64: 'AQID',
  })
  await expect(readRepositoryFileTreeBinaryFile('ssh-config://prod/srv/repo', '/srv/repo', '/srv/repo/image.bin', 30)).resolves.toEqual({
    ok: true,
    name: 'image.bin',
    byteLength: 3,
    bytesBase64: 'AQID',
  })
})
```

Add route tests for `/file-tree/read-binary-file` and `/file-tree/replace-binary-file`, asserting body parsing and source token invalidation behavior for replace.

- [ ] **Step 2: Run tests and verify they fail**

Run:

```sh
bun run test src/server/modules/repo.test.ts src/server/routes/repo.test.ts src/web/repo-client.test.ts
```

Expected: fail because functions/routes are missing.

- [ ] **Step 3: Implement server read/write dispatch**

In `src/server/modules/repo-read-paths.ts`:

```ts
export async function readRepositoryFileTreeBinaryFile(
  repoId: string,
  worktreePath: string,
  filePath: string,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<RepoFileTreeBinaryFileReadResult> {
  if (signal?.aborted) return { ok: false, message: 'cancelled' }
  if (isRemoteRepoId(repoId)) {
    return await readRemoteFileTreeBinaryFile(await resolveRemoteRepoTarget(repoId), worktreePath, filePath, maxBytes, { signal })
  }
  return await readLocalFileTreeBinaryFile(worktreePath, filePath, maxBytes)
}
```

In `src/server/modules/repo-write-paths.ts`:

```ts
export async function replaceRepositoryFileTreeBinaryFile(
  repoId: string,
  worktreePath: string,
  filePath: string,
  bytesBase64: string,
  maxBytes: number,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<RepoFileTreeBinaryFileReplaceResult> {
  const result = isRemoteRepoId(repoId)
    ? await replaceRemoteFileTreeBinaryFile(await resolveRemoteRepoTarget(repoId), worktreePath, filePath, bytesBase64, maxBytes, { signal })
    : await replaceLocalFileTreeBinaryFile(worktreePath, filePath, bytesBase64, maxBytes)
  if (result.ok) publishRepoSnapshotInvalidation(repoId, sourceToken)
  return result
}
```

- [ ] **Step 4: Add routes**

In `src/server/routes/repo.ts`, import validators and functions. Add after text routes:

```ts
app.post('/file-tree/read-binary-file', async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!isRepoFileTreeBinaryFileReadRequest(body)) return c.json({ ok: false, message: 'error.invalid-arguments' })
  return c.json(
    await jsonOr(
      () => readRepositoryFileTreeBinaryFile(body.repoId, body.worktreePath, body.filePath, body.maxBytes, c.req.raw.signal),
      { ok: false, message: 'error.failed-read-repo' },
      'file-tree-read-binary-file',
    ),
  )
})

app.post('/file-tree/replace-binary-file', async (c) => {
  const body = await c.req.json().catch(() => null)
  const sourceToken = isRecord(body) && typeof body.sourceToken === 'string' ? body.sourceToken : undefined
  if (!isRepoFileTreeBinaryFileReplaceRequest(body)) return c.json({ ok: false, message: 'error.invalid-arguments' })
  return c.json(
    await jsonOr(
      () => replaceRepositoryFileTreeBinaryFile(body.repoId, body.worktreePath, body.filePath, body.bytesBase64, body.maxBytes, c.req.raw.signal, sourceToken),
      { ok: false, message: 'error.failed-read-repo' },
      'file-tree-replace-binary-file',
    ),
  )
})
```

`isRecord` already exists in `src/shared/file-tree.ts`; if it is not available in the route module, use the local check `typeof body === 'object' && body !== null` before reading `sourceToken`.

- [ ] **Step 5: Add repo client helpers**

In `src/web/repo-client.ts`:

```ts
export async function readRepositoryFileTreeBinaryFile(
  repoId: string,
  worktreePath: string,
  filePath: string,
  maxBytes: number,
): Promise<RepoFileTreeBinaryFileReadResult> {
  return await postServerJson('/api/repo/file-tree/read-binary-file', { repoId, worktreePath, filePath, maxBytes })
}

export async function replaceRepositoryFileTreeBinaryFile(
  repoId: string,
  worktreePath: string,
  filePath: string,
  bytesBase64: string,
  maxBytes: number,
): Promise<RepoFileTreeBinaryFileReplaceResult> {
  return await postServerJson('/api/repo/file-tree/replace-binary-file', {
    repoId,
    worktreePath,
    filePath,
    bytesBase64,
    maxBytes,
  })
}
```

- [ ] **Step 6: Run server/client tests**

Run:

```sh
bun run test src/server/modules/repo.test.ts src/server/routes/repo.test.ts src/web/repo-client.test.ts
```

Expected: pass.

## Task 6: System Clipboard Bridge

**Files:**
- Create: `src/shared/file-tree-clipboard.ts`
- Create: `src/main/file-tree-clipboard.ts`
- Modify: `src/shared/bootstrap.ts`
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/web/renderer-bridge-types.ts`
- Modify: `src/web/vite-env.d.ts`
- Modify: `src/preload/preload.cjs`
- Modify: `src/main/shell-bridge.ts`
- Modify: `src/web/app-shell-client.ts`
- Test: `src/main/file-tree-clipboard.test.ts`
- Test: `src/main/preload.test.ts`
- Test: `src/main/shell-bridge.test.ts`
- Test: `src/web/app-shell-client.test.ts`

- [ ] **Step 1: Add failing clipboard tests**

Create `src/main/file-tree-clipboard.test.ts` with tests using mocked Electron clipboard:

```ts
test('writes and reads Hobgoblin custom file content format', async () => {
  const file = {
    name: 'image.bin',
    byteLength: 3,
    bytesBase64: Buffer.from([1, 2, 3]).toString('base64'),
  }

  await expect(writeFileTreeClipboardFile(file, { now: new Date('2026-06-29T00:00:00Z'), randomHex: () => 'aabbccdd' })).resolves.toEqual({
    ok: true,
  })
  clipboard.readBuffer.mockReturnValue(Buffer.from(JSON.stringify({ version: 1, ...file }), 'utf8'))

  await expect(readFileTreeClipboardFile(30 * 1024 * 1024)).resolves.toEqual({ ok: true, file })
})
```

Add app-shell and shell-bridge tests for new methods:

```ts
expect(ipcHandlers.has(SHELL_WRITE_FILE_TREE_CLIPBOARD_FILE_CHANNEL)).toBe(true)
expect(ipcHandlers.has(SHELL_READ_FILE_TREE_CLIPBOARD_FILE_CHANNEL)).toBe(true)
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```sh
bun run test src/main/file-tree-clipboard.test.ts src/main/preload.test.ts src/main/shell-bridge.test.ts src/web/app-shell-client.test.ts
```

Expected: fail because bridge types and functions are missing.

- [ ] **Step 3: Add shared clipboard types**

Create `src/shared/file-tree-clipboard.ts`:

```ts
export const FILE_TREE_CLIPBOARD_FORMAT = 'application/x-hobgoblin-file-content+json;version=1'
export const FILE_TREE_CLIPBOARD_SCHEMA_VERSION = 1

export interface FileTreeClipboardFilePayload {
  name: string
  bytesBase64: string
  byteLength: number
  text?: string
  mimeType?: string
}

export type FileTreeClipboardWriteResult = { ok: true } | { ok: false; message: string }
export type FileTreeClipboardReadResult = { ok: true; file: FileTreeClipboardFilePayload } | { ok: false; message: string }

export function fileTreeClipboardMaxBytes(maxBytesMb: number): number {
  return Math.max(1, Math.round(maxBytesMb)) * 1024 * 1024
}
```

- [ ] **Step 4: Implement main clipboard module**

Create `src/main/file-tree-clipboard.ts`:

```ts
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, clipboard } from 'electron'
import {
  FILE_TREE_CLIPBOARD_FORMAT,
  FILE_TREE_CLIPBOARD_SCHEMA_VERSION,
  type FileTreeClipboardFilePayload,
  type FileTreeClipboardReadResult,
  type FileTreeClipboardWriteResult,
} from '#/shared/file-tree-clipboard.ts'
import { readClipboardFilePathsFromSystem } from '#/main/clipboard-file-paths.ts'

const MAX_TEMP_FILE_AGE_MS = 24 * 60 * 60 * 1000

export async function writeFileTreeClipboardFile(
  file: FileTreeClipboardFilePayload,
  options: { now?: Date; randomHex?: () => string } = {},
): Promise<FileTreeClipboardWriteResult> {
  if (!isValidPayload(file, Number.POSITIVE_INFINITY)) return { ok: false, message: 'error.invalid-arguments' }
  const payload = { version: FILE_TREE_CLIPBOARD_SCHEMA_VERSION, ...file }
  const buffer = Buffer.from(JSON.stringify(payload), 'utf8')
  const fileUrl = await writeClipboardTempFile(file, options).catch((err) => {
    console.warn('[file-tree-clipboard] file-url compatibility write failed', err)
    return null
  })
  if (file.text !== undefined || fileUrl) {
    clipboard.write({
      text: file.text ?? fileUrl ?? '',
      ...(file.text === undefined && fileUrl && process.platform === 'darwin' ? { bookmark: file.name } : {}),
    })
  }
  clipboard.writeBuffer(FILE_TREE_CLIPBOARD_FORMAT, buffer)
  if (fileUrl) writeFileUrlClipboardFormats(fileUrl)
  return { ok: true }
}

export async function readFileTreeClipboardFile(maxBytes: number): Promise<FileTreeClipboardReadResult> {
  const custom = readCustomClipboard(maxBytes)
  if (custom.ok) return custom
  const fromPath = await readFirstClipboardPath(maxBytes)
  if (fromPath.ok) return fromPath
  const text = clipboard.readText()
  if (!text) return { ok: false, message: 'error.invalid-arguments' }
  const bytes = Buffer.from(text, 'utf8')
  if (bytes.byteLength > maxBytes) return { ok: false, message: 'error.file-tree-clipboard-file-too-large' }
  return {
    ok: true,
    file: {
      name: 'clipboard.txt',
      byteLength: bytes.byteLength,
      bytesBase64: bytes.toString('base64'),
      text,
      mimeType: 'text/plain',
    },
  }
}
```

Complete the helper functions in the same file:

```ts
function isValidPayload(file: FileTreeClipboardFilePayload, maxBytes: number): boolean {
  if (
    typeof file.name !== 'string' ||
    file.name.length === 0 ||
    typeof file.bytesBase64 !== 'string' ||
    !Number.isSafeInteger(file.byteLength) ||
    file.byteLength < 0 ||
    file.byteLength > maxBytes
  ) {
    return false
  }
  const bytes = Buffer.from(file.bytesBase64, 'base64')
  return (
    /^[A-Za-z0-9+/]*={0,2}$/.test(file.bytesBase64) &&
    file.bytesBase64.length % 4 === 0 &&
    bytes.toString('base64') === file.bytesBase64 &&
    bytes.byteLength === file.byteLength
  )
}

function readCustomClipboard(maxBytes: number): FileTreeClipboardReadResult {
  try {
    const raw = clipboard.readBuffer(FILE_TREE_CLIPBOARD_FORMAT)
    if (!raw || raw.byteLength === 0) return { ok: false, message: 'error.invalid-arguments' }
    const parsed = JSON.parse(raw.toString('utf8')) as { version?: unknown } & Partial<FileTreeClipboardFilePayload>
    if (parsed.version !== FILE_TREE_CLIPBOARD_SCHEMA_VERSION) return { ok: false, message: 'error.invalid-arguments' }
    const file = {
      name: parsed.name,
      bytesBase64: parsed.bytesBase64,
      byteLength: parsed.byteLength,
      text: parsed.text,
      mimeType: parsed.mimeType,
    } as FileTreeClipboardFilePayload
    return isValidPayload(file, maxBytes) ? { ok: true, file } : { ok: false, message: 'error.invalid-arguments' }
  } catch {
    return { ok: false, message: 'error.invalid-arguments' }
  }
}

async function readFirstClipboardPath(maxBytes: number): Promise<FileTreeClipboardReadResult> {
  const [first] = readClipboardFilePathsFromSystem()
  if (!first) return { ok: false, message: 'error.invalid-arguments' }
  const info = await stat(first).catch(() => null)
  if (!info?.isFile()) return { ok: false, message: 'error.invalid-arguments' }
  if (info.size > maxBytes) return { ok: false, message: 'error.file-tree-clipboard-file-too-large' }
  const bytes = await readFile(first)
  return {
    ok: true,
    file: {
      name: path.basename(first),
      byteLength: bytes.byteLength,
      bytesBase64: bytes.toString('base64'),
    },
  }
}

async function writeClipboardTempFile(file: FileTreeClipboardFilePayload, options: { now?: Date; randomHex?: () => string }): Promise<string> {
  const dir = path.join(app.getPath('userData'), 'file-tree-clipboard')
  await cleanupOldClipboardTempFiles(dir, options.now ?? new Date())
  await mkdir(dir, { recursive: true })
  const safeName = path.basename(file.name).replace(/[^A-Za-z0-9._-]/g, '_') || 'clipboard.bin'
  const filePath = path.join(dir, `${Date.now()}-${options.randomHex?.() ?? randomBytes(4).toString('hex')}-${safeName}`)
  await writeFile(filePath, Buffer.from(file.bytesBase64, 'base64'), { flag: 'wx' })
  return pathToFileURL(filePath).toString()
}

function writeFileUrlClipboardFormats(fileUrl: string): void {
  clipboard.writeBuffer('text/uri-list', Buffer.from(`${fileUrl}\n`, 'utf8'))
  if (process.platform === 'darwin') {
    clipboard.writeBuffer('public/file-url', Buffer.from(fileUrl, 'utf8'))
  }
}

async function cleanupOldClipboardTempFiles(dir: string, now: Date): Promise<void> {
  const fs = await import('node:fs/promises')
  const entries = await fs.readdir(dir).catch(() => [])
  await Promise.all(entries.map(async (entry) => {
    const target = path.join(dir, entry)
    const info = await fs.stat(target).catch(() => null)
    if (info && now.getTime() - info.mtimeMs > MAX_TEMP_FILE_AGE_MS) await rm(target, { force: true })
  }))
}
```

The write order is intentional: create the temp file first, write high-level text/bookmark data once, then write the Hobgoblin custom format, then write file URL buffers. Do not call `clipboard.writeText()` or `clipboard.writeBookmark()` after `clipboard.writeBuffer(FILE_TREE_CLIPBOARD_FORMAT, ...)`, because those higher-level writes can replace the clipboard contents on some Electron versions. The `src/main/file-tree-clipboard.test.ts` suite must assert that `readFileTreeClipboardFile()` can still read the custom format after file URL buffers have been written.

- [ ] **Step 5: Add IPC channels and bridge types**

In `src/shared/ipc-channels.ts`:

```ts
export const SHELL_WRITE_FILE_TREE_CLIPBOARD_FILE_CHANNEL = 'goblin:shell-write-file-tree-clipboard-file'
export const SHELL_READ_FILE_TREE_CLIPBOARD_FILE_CHANNEL = 'goblin:shell-read-file-tree-clipboard-file'
```

In `src/shared/bootstrap.ts`, add capability:

```ts
| 'file-tree-clipboard'
```

Add it to `ELECTRON_RENDERER_CAPABILITIES`.

In `src/web/renderer-bridge-types.ts` and `src/web/vite-env.d.ts`, add methods to shell bridge:

```ts
writeFileTreeClipboardFile?: (input: FileTreeClipboardFilePayload) => Promise<FileTreeClipboardWriteResult>
readFileTreeClipboardFile?: (input: { maxBytes: number }) => Promise<FileTreeClipboardReadResult>
```

- [ ] **Step 6: Wire preload, shell bridge, and app-shell client**

In `src/preload/preload.cjs`, add IPC names and shell methods:

```js
writeFileTreeClipboardFile: 'goblin:shell-write-file-tree-clipboard-file',
readFileTreeClipboardFile: 'goblin:shell-read-file-tree-clipboard-file',
```

```js
writeFileTreeClipboardFile: (input) => safeInvoke(IPC.shell.writeFileTreeClipboardFile, input),
readFileTreeClipboardFile: (input) => safeInvoke(IPC.shell.readFileTreeClipboardFile, input),
```

In `src/main/shell-bridge.ts`:

```ts
ipcMain.handle(SHELL_WRITE_FILE_TREE_CLIPBOARD_FILE_CHANNEL, async (event, input?: FileTreeClipboardFilePayload) => {
  if (!isTrustedIpcEvent(event)) return { ok: false, message: 'error.invalid-path' }
  return await writeFileTreeClipboardFile(input as FileTreeClipboardFilePayload)
})

ipcMain.handle(SHELL_READ_FILE_TREE_CLIPBOARD_FILE_CHANNEL, async (event, input?: { maxBytes?: unknown }) => {
  if (!isTrustedIpcEvent(event)) return { ok: false, message: 'error.invalid-path' }
  const maxBytes = typeof input?.maxBytes === 'number' ? input.maxBytes : 0
  return await readFileTreeClipboardFile(maxBytes)
})
```

In `src/web/app-shell-client.ts`:

```ts
export async function writeFileTreeClipboardFile(input: FileTreeClipboardFilePayload): Promise<FileTreeClipboardWriteResult> {
  return (await nativeShell()?.writeFileTreeClipboardFile?.(input)) ?? { ok: false, message: 'error.unsupported-native-bridge' }
}

export async function readFileTreeClipboardFile(maxBytes: number): Promise<FileTreeClipboardReadResult> {
  return (await nativeShell()?.readFileTreeClipboardFile?.({ maxBytes })) ?? { ok: false, message: 'error.unsupported-native-bridge' }
}
```

- [ ] **Step 7: Run bridge tests**

Run:

```sh
bun run test src/main/file-tree-clipboard.test.ts src/main/preload.test.ts src/main/shell-bridge.test.ts src/web/app-shell-client.test.ts
```

Expected: pass.

## Task 7: File Tree Shortcut Integration

**Files:**
- Modify: `src/web/components/file-tree/ProjectFileTree.tsx`
- Modify: `src/web/components/file-tree/ProjectFileTree.test.tsx`

- [ ] **Step 1: Add failing component tests**

Update repo-client mocks to include:

```ts
const readRepositoryFileTreeBinaryFile = vi.fn(async () => ({
  ok: true as const,
  name: 'README.md',
  byteLength: 14,
  bytesBase64: Buffer.from('file contents\n', 'utf8').toString('base64'),
  text: 'file contents\n',
}))

const replaceRepositoryFileTreeBinaryFile = vi.fn(async () => ({
  ok: true as const,
  previousBytesBase64: Buffer.from('old contents\n', 'utf8').toString('base64'),
  previousByteLength: 13,
}))
```

Mock app-shell methods:

```ts
const writeFileTreeClipboardFile = vi.fn(async () => ({ ok: true as const }))
const readFileTreeClipboardFile = vi.fn(async () => ({
  ok: true as const,
  file: {
    name: 'clipboard.bin',
    byteLength: 3,
    bytesBase64: Buffer.from([1, 2, 3]).toString('base64'),
  },
}))
```

Replace text-specific expectations:

```ts
test('copies focused file contents with primary shift c through system file clipboard', async () => {
  seedRepoWithSelectedBranch({ hasWorktree: true })
  await render(<ProjectFileTree repoId="/repo" />)

  const file = treeItemByText('README.md')
  await act(async () => {
    file.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    file.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'c', metaKey: true, shiftKey: true }))
    await Promise.resolve()
    await Promise.resolve()
  })

  expect(readRepositoryFileTreeBinaryFile).toHaveBeenCalledWith('/repo', '/repo', '/repo/README.md', 30 * 1024 * 1024)
  expect(writeFileTreeClipboardFile).toHaveBeenCalledWith({
    name: 'README.md',
    byteLength: 14,
    bytesBase64: Buffer.from('file contents\n', 'utf8').toString('base64'),
    text: 'file contents\n',
  })
})
```

Add replace and undo test:

```ts
test('replaces focused file contents with primary shift v and undoes binary replacement', async () => {
  seedRepoWithSelectedBranch({ hasWorktree: true })
  await render(<ProjectFileTree repoId="/repo" />)

  const file = treeItemByText('README.md')
  await act(async () => {
    file.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    file.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'v', metaKey: true, shiftKey: true }))
    await Promise.resolve()
    await Promise.resolve()
  })

  expect(readFileTreeClipboardFile).toHaveBeenCalledWith(30 * 1024 * 1024)
  expect(replaceRepositoryFileTreeBinaryFile).toHaveBeenNthCalledWith(
    1,
    '/repo',
    '/repo',
    '/repo/README.md',
    Buffer.from([1, 2, 3]).toString('base64'),
    30 * 1024 * 1024,
  )

  await act(async () => {
    file.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'z', ctrlKey: true }))
    await Promise.resolve()
    await Promise.resolve()
  })

  expect(replaceRepositoryFileTreeBinaryFile).toHaveBeenNthCalledWith(
    2,
    '/repo',
    '/repo',
    '/repo/README.md',
    Buffer.from('old contents\n', 'utf8').toString('base64'),
    30 * 1024 * 1024,
  )
})
```

- [ ] **Step 2: Run component tests and verify they fail**

Run:

```sh
bun run test src/web/components/file-tree/ProjectFileTree.test.tsx
```

Expected: fail because component still calls text clipboard APIs.

- [ ] **Step 3: Update imports and undo type**

In `ProjectFileTree.tsx`, replace text API imports with binary API imports:

```ts
readRepositoryFileTreeBinaryFile,
replaceRepositoryFileTreeBinaryFile,
```

Import app-shell functions:

```ts
readFileTreeClipboardFile,
writeFileTreeClipboardFile,
```

Import file-area runtime settings:

```ts
import { useRuntimeFileAreaSettings } from '#/web/runtime-settings-file-area.ts'
```

Read setting from file-area runtime settings:

```ts
const { fileTreeFontSize, fileTreeClipboardMaxBytesMb } = useRuntimeFileAreaSettings()
const fileTreeClipboardMaxBytes = fileTreeClipboardMaxBytesMb * 1024 * 1024
```

Change undo action:

```ts
| {
    kind: 'replaceBinaryFile'
    path: string
    relativePath: string
    previousBytesBase64: string
  }
```

- [ ] **Step 4: Replace copy/replace callbacks**

Replace `copyFocusedFileContents`:

```ts
const copyFocusedFileContents = useCallback(
  async (node: FileTreeNode) => {
    if (!worktreePath) return
    const result = await readRepositoryFileTreeBinaryFile(repoId, worktreePath, node.absolutePath, fileTreeClipboardMaxBytes)
    if (!result.ok) {
      toast.error(t(result.message))
      return
    }
    const written = await writeFileTreeClipboardFile({
      name: result.name,
      byteLength: result.byteLength,
      bytesBase64: result.bytesBase64,
      text: result.text,
      mimeType: result.mimeType,
    })
    if (!written.ok) {
      toast.error(t(written.message))
      return
    }
    toast.success(t('file-tree.copy-file-contents-ok'))
  },
  [fileTreeClipboardMaxBytes, repoId, t, worktreePath],
)
```

Replace `replaceFocusedFileContents`:

```ts
const replaceFocusedFileContents = useCallback(
  async (node: FileTreeNode) => {
    if (!worktreePath) return
    const clipboardFile = await readFileTreeClipboardFile(fileTreeClipboardMaxBytes)
    if (!clipboardFile.ok) {
      toast.error(t(clipboardFile.message))
      return
    }
    const result = await replaceRepositoryFileTreeBinaryFile(
      repoId,
      worktreePath,
      node.absolutePath,
      clipboardFile.file.bytesBase64,
      fileTreeClipboardMaxBytes,
    )
    if (!result.ok) {
      toast.error(t(result.message))
      return
    }
    undoStackRef.current.push({
      kind: 'replaceBinaryFile',
      path: node.absolutePath,
      relativePath: node.relativePath,
      previousBytesBase64: result.previousBytesBase64,
    })
    await refreshParentDirectoryForPath(node.absolutePath)
    setSelection({ selected: new Set([node.relativePath]), anchor: node.relativePath })
    setFocusedNodeId(node.relativePath)
    toast.success(t('file-tree.replace-file-contents-ok'))
  },
  [fileTreeClipboardMaxBytes, refreshParentDirectoryForPath, repoId, t, worktreePath],
)
```

- [ ] **Step 5: Update undo handling**

In `runUndo`, replace text undo branch with:

```ts
if (action.kind === 'replaceBinaryFile') {
  const result = await replaceRepositoryFileTreeBinaryFile(
    repoId,
    worktreePath,
    action.path,
    action.previousBytesBase64,
    fileTreeClipboardMaxBytes,
  )
  if (!result.ok) {
    toast.error(t(result.message))
    undoStackRef.current.push(action)
    return
  }
  await refreshParentDirectoryForPath(action.path)
  setSelection({ selected: new Set([action.relativePath]), anchor: action.relativePath })
  setFocusedNodeId(action.relativePath)
  return
}
```

Add `fileTreeClipboardMaxBytes` to `runUndo` dependencies.

- [ ] **Step 6: Preserve single-file guard**

Keep `singleFocusedFileNode()` unchanged. Verify the existing test for directories and mixed selections still asserts no clipboard read/write calls. Update mocked function names in expectations:

```ts
expect(readRepositoryFileTreeBinaryFile).not.toHaveBeenCalled()
expect(replaceRepositoryFileTreeBinaryFile).not.toHaveBeenCalled()
expect(writeFileTreeClipboardFile).not.toHaveBeenCalled()
expect(readFileTreeClipboardFile).not.toHaveBeenCalled()
```

- [ ] **Step 7: Run component tests**

Run:

```sh
bun run test src/web/components/file-tree/ProjectFileTree.test.tsx
```

Expected: pass.

## Task 8: Full Verification And Architecture Guard

**Files:**
- No planned source changes.

- [ ] **Step 1: Run targeted feature tests**

Run:

```sh
bun run test \
  src/shared/settings-defaults.test.ts \
  src/server/modules/settings-source.test.ts \
  src/shared/file-tree.test.ts \
  src/system/file-tree/local.test.ts \
  src/system/ssh/commands.test.ts \
  src/system/ssh/git.test.ts \
  src/server/modules/repo.test.ts \
  src/server/routes/repo.test.ts \
  src/web/repo-client.test.ts \
  src/main/file-tree-clipboard.test.ts \
  src/main/preload.test.ts \
  src/main/shell-bridge.test.ts \
  src/web/app-shell-client.test.ts \
  src/web/components/file-tree/ProjectFileTree.test.tsx
```

Expected: pass.

- [ ] **Step 2: Run typecheck**

Run:

```sh
bun run typecheck
```

Expected: pass.

- [ ] **Step 3: Run architecture guard**

Run:

```sh
bun run check:architecture
```

Expected: pass. If it fails, fix imports so:

- `src/main/**` does not import `src/web/**` or `src/server/**` unless the project already permits that specific data-dir dependency. Prefer moving shared constants to `src/shared/**`.
- `src/web/**` does not import `src/main/**`.
- `src/server/**` and `src/shared/**` do not import `electron`.

- [ ] **Step 4: Run full test suite**

Run:

```sh
bun run test
```

Expected: pass.

- [ ] **Step 5: Manual smoke in Electron**

Run the app with the existing dev command:

```sh
bun run dev
```

Smoke checks:

- Open a local repo with file tree.
- Select a small text file and press `Cmd/Ctrl+Shift+C`; paste into an external text field and verify text is present.
- Select another file and press `Cmd/Ctrl+Shift+V`; verify contents replace and `Cmd/Ctrl+Z` restores.
- Select a small binary file and press `Cmd/Ctrl+Shift+C`; select another binary file and press `Cmd/Ctrl+Shift+V`; verify size and bytes change through a hex/file comparison.
- Set file-area clipboard limit to `1 MB`; verify copying a larger file shows the size-limit error.

Stop the dev server after smoke testing.

## Self-Review

- Spec coverage:
  - System clipboard custom format: Task 6.
  - Text and binary support: Tasks 3, 4, 6, 7.
  - Local and remote support: Tasks 3, 4, 5.
  - Single ordinary file only: Task 7.
  - 30 MB default and 1-100 MB setting: Task 1.
  - File-area settings placement: Task 1.
  - Size enforcement in renderer/main/server/system: Tasks 1, 3, 4, 6, 7.
  - Temp file compatibility and 24-hour cleanup: Task 6.
  - Verification commands: Task 8.
- Red-flag scan: no incomplete marker terms are intentionally present in this plan.
- Type consistency:
  - Shared request/result names match route, server, client, and component tasks.
  - Clipboard payload names match bridge and app-shell tasks.
  - `fileTreeClipboardMaxBytesMb` setting name is consistent across settings tasks.
