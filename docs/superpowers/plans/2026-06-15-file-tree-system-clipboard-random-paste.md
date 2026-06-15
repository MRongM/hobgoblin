# File Tree System Clipboard Random Paste Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add file-tree `Ctrl/Cmd+V` and context-menu paste support for system clipboard files, using randomized destination basenames while preserving existing internal copy/paste and image/text paste behavior.

**Architecture:** Keep renderer code responsible for events and source construction only. Keep all filesystem writes in the existing transfer pipeline, extending `localPaths` with per-item `destinationName` so local and remote targets can preserve the same safety checks and conflict handling. Read system clipboard file paths through the existing trusted shell IPC bridge, not through direct renderer filesystem access.

**Tech Stack:** TypeScript strip-only mode, React 19, Electron 42, Radix context menu, Vitest, Bun.

---

## File Structure

- Modify: `src/shared/file-tree.ts`
  - Add `RepoFileTransferLocalPathItem`.
  - Replace `localPaths.paths` with `localPaths.items`.
  - Export `isValidFileTransferDestinationName`.
- Create: `src/shared/file-tree.test.ts`
  - Cover the new `localPaths` request shape and destination-name validation.
- Modify: `src/system/file-tree/transfer.ts`
  - Add `LocalCopyItem`.
  - Make local copying honor optional `destinationName`.
- Modify: `src/system/file-tree/transfer.test.ts`
  - Update existing `copyLocalPathsToLocalTarget` calls and cover randomized destination names.
- Modify: `src/server/modules/repo-file-transfer.ts`
  - Adapt local and remote `localPaths` transfer orchestration to `items`.
- Modify: `src/server/modules/repo-file-transfer.test.ts`
  - Update localPaths request shape and cover remote target `destinationName`.
- Modify: `src/web/components/file-tree/model.ts`
  - Add random pasted filename helper.
- Modify: `src/web/components/file-tree/model.test.ts`
  - Cover extension-preserving random names.
- Modify: `src/web/components/file-tree/clipboard.ts`
  - Return `localPaths.items`.
  - Randomize paste-event system file names while leaving drop names unchanged.
- Create: `src/main/clipboard-file-paths.ts`
  - Read file URL formats from Electron clipboard and convert them to paths.
- Create: `src/main/clipboard-file-paths.test.ts`
  - Cover file URL parsing and de-duplication.
- Modify: `src/shared/ipc-channels.ts`
  - Add a shell IPC channel for clipboard file paths.
- Modify: `src/main/shell-bridge.ts`
  - Wire trusted IPC handler for clipboard file paths.
- Modify: `src/main/shell-bridge.test.ts`
  - Cover handler registration, trusted access, and untrusted denial.
- Modify: `src/preload/preload.cjs`
  - Expose `shell.readClipboardFilePaths`.
- Modify: `src/main/preload.test.ts`
  - Verify preload forwards the new shell call.
- Modify: `src/shared/bootstrap.ts`
  - Add `clipboard-file-paths` renderer capability for Electron.
- Modify: `src/web/vite-env.d.ts`
  - Add the native shell bridge method type.
- Modify: `src/web/renderer-bridge-types.ts`
  - Add the renderer shell method type.
- Modify: `src/web/app-shell-client.ts`
  - Add `readSystemClipboardFilePaths`.
- Modify: `src/web/app-shell-client.test.ts`
  - Cover native and web fallback behavior.
- Modify: `src/web/components/file-tree/ProjectFileTree.tsx`
  - Add row and empty-area context-menu paste.
  - Route context paste through internal clipboard first, system clipboard second.
- Modify: `src/web/components/file-tree/ProjectFileTree.test.tsx`
  - Cover directory, file, and empty-area paste targets.
- Modify: `src/shared/i18n/en.ts`, `src/shared/i18n/zh.ts`, `src/shared/i18n/ja.ts`, `src/shared/i18n/ko.ts`
  - Add `file-tree.paste`.

---

### Task 1: Shared Transfer Source Shape

**Files:**
- Modify: `src/shared/file-tree.ts`
- Create: `src/shared/file-tree.test.ts`

- [ ] **Step 1: Write failing tests for the new `localPaths.items` shape**

Create `src/shared/file-tree.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import {
  isRepoFileTransferRequest,
  isValidFileTransferDestinationName,
} from '#/shared/file-tree.ts'

describe('file transfer request validation', () => {
  test('accepts local path items with optional destination names', () => {
    expect(
      isRepoFileTransferRequest({
        repoId: '/repo',
        worktreePath: '/repo',
        targetDirPath: '/repo/src',
        source: {
          kind: 'localPaths',
          items: [
            { path: '/tmp/report.pdf', destinationName: 'pasted-a8f31c9d.pdf' },
            { path: '/tmp/LICENSE' },
          ],
        },
      }),
    ).toBe(true)
  })

  test('rejects local path items with path separators in destination names', () => {
    expect(
      isRepoFileTransferRequest({
        repoId: '/repo',
        worktreePath: '/repo',
        targetDirPath: '/repo/src',
        source: {
          kind: 'localPaths',
          items: [{ path: '/tmp/report.pdf', destinationName: '../report.pdf' }],
        },
      }),
    ).toBe(false)
  })

  test('validates transfer destination basenames', () => {
    expect(isValidFileTransferDestinationName('pasted-a8f31c9d.pdf')).toBe(true)
    expect(isValidFileTransferDestinationName('pasted-a8f31c9d')).toBe(true)
    expect(isValidFileTransferDestinationName('')).toBe(false)
    expect(isValidFileTransferDestinationName('nested/report.pdf')).toBe(false)
    expect(isValidFileTransferDestinationName('nested\\report.pdf')).toBe(false)
    expect(isValidFileTransferDestinationName('bad\0name')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```sh
bun run test src/shared/file-tree.test.ts
```

Expected: FAIL because `isValidFileTransferDestinationName` is not exported and `localPaths.items` is not accepted.

- [ ] **Step 3: Update shared transfer types and guards**

In `src/shared/file-tree.ts`, replace the current `RepoFileTransferLocalPathsSource` with:

```ts
export interface RepoFileTransferLocalPathItem {
  path: string
  destinationName?: string
}

export interface RepoFileTransferLocalPathsSource {
  kind: 'localPaths'
  items: RepoFileTransferLocalPathItem[]
}
```

Replace the `localPaths` guard branch in `isRepoFileTransferRequest`:

```ts
if (source.kind === 'localPaths') return Array.isArray(source.items) && source.items.every(isRepoFileTransferLocalPathItem)
```

Add these helpers near the existing validation helpers:

```ts
export function isValidFileTransferDestinationName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !value.includes('\0') &&
    !value.includes('/') &&
    !value.includes('\\')
  )
}

function isRepoFileTransferLocalPathItem(value: unknown): value is RepoFileTransferLocalPathItem {
  return (
    isRecord(value) &&
    typeof value.path === 'string' &&
    (value.destinationName === undefined || isValidFileTransferDestinationName(value.destinationName))
  )
}
```

Keep `isStringArray` for `fileTreePaths`.

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```sh
bun run test src/shared/file-tree.test.ts
```

Expected: PASS.

- [ ] **Step 5: Checkpoint without committing**

Run:

```sh
git diff -- src/shared/file-tree.ts src/shared/file-tree.test.ts
```

Expected: diff contains only the shared type/guard changes and the new test. Do not run `git commit`.

---

### Task 2: Local Transfer Destination Names

**Files:**
- Modify: `src/system/file-tree/transfer.ts`
- Modify: `src/system/file-tree/transfer.test.ts`

- [ ] **Step 1: Write failing tests for destination-name local copies**

In `src/system/file-tree/transfer.test.ts`, update existing `copyLocalPathsToLocalTarget` calls from `paths: [...]` to `items: [{ path: ... }]`.

Add these tests inside `describe('local file transfer', () => { ... })`:

```ts
  test('uses destinationName when copying local paths to a local target', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-file-transfer-'))
    await mkdir(join(root, 'dest'))
    await writeFile(join(root, 'report.pdf'), 'pdf')

    const result = await copyLocalPathsToLocalTarget({
      sourceRootPath: root,
      targetRootPath: root,
      targetDirPath: join(root, 'dest'),
      items: [{ path: join(root, 'report.pdf'), destinationName: 'pasted-a8f31c9d.pdf' }],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.copied).toEqual([
      expect.objectContaining({
        sourcePath: join(root, 'report.pdf'),
        destinationPath: join(root, 'dest', 'pasted-a8f31c9d.pdf'),
        kind: 'file',
      }),
    ])
    await expect(readFile(join(root, 'dest', 'pasted-a8f31c9d.pdf'), 'utf8')).resolves.toBe('pdf')
  })

  test('rejects invalid destinationName before writing local copies', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-file-transfer-'))
    await writeFile(join(root, 'report.pdf'), 'pdf')

    const result = await copyLocalPathsToLocalTarget({
      sourceRootPath: root,
      targetRootPath: root,
      targetDirPath: root,
      items: [{ path: join(root, 'report.pdf'), destinationName: '../report.pdf' }],
    })

    expect(result).toEqual({ ok: false, message: 'error.invalid-arguments' })
  })
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```sh
bun run test src/system/file-tree/transfer.test.ts
```

Expected: FAIL because `copyLocalPathsToLocalTarget` still expects `paths`.

- [ ] **Step 3: Update local transfer options and copy logic**

In `src/system/file-tree/transfer.ts`, add the shared validator import:

```ts
  isValidFileTransferDestinationName,
```

Extend local copy types:

```ts
export interface LocalCopyItem {
  path: string
  destinationName?: string
}

export interface LocalCopyOptions {
  sourceRootPath: string
  targetRootPath: string
  targetDirPath: string
  items: LocalCopyItem[]
}
```

Add a helper near `decodeUploadedItem`:

```ts
export function localCopyItemsFromPaths(paths: string[]): LocalCopyItem[] {
  return paths.map((sourcePath) => ({ path: sourcePath }))
}
```

Replace the start of `copyLocalPathsToLocalTarget` with:

```ts
export async function copyLocalPathsToLocalTarget(options: LocalCopyOptions): Promise<RepoFileTransferResult> {
  const targetRoot = path.resolve(options.targetRootPath)
  const targetDir = path.resolve(options.targetDirPath)
  if (!pathInsideRoot(targetRoot, targetDir)) return { ok: false, message: 'error.file-transfer-target-outside-worktree' }
  for (const item of options.items) {
    if (item.destinationName !== undefined && !isValidFileTransferDestinationName(item.destinationName)) {
      return { ok: false, message: 'error.invalid-arguments' }
    }
  }
  const sourcePaths = options.items.map((item) => item.path)
  const inventory = await inventoryLocalTransfer({ rootPath: options.sourceRootPath, paths: sourcePaths })
  if (!inventory.ok) return inventory
  await fs.mkdir(targetDir, { recursive: true })
  const existingNames = new Set(await fs.readdir(targetDir).catch(() => []))
  const copied: RepoFileTransferCopiedEntry[] = []
  const renamed: RepoFileTransferRenamedEntry[] = []
  const failed: RepoFileTransferFailedEntry[] = []
  for (const item of options.items) {
    const sourcePath = item.path
    const requestedName = item.destinationName ?? path.basename(sourcePath)
    const destinationName = uniqueCopyName(existingNames, requestedName)
    existingNames.add(destinationName)
    const destinationPath = path.join(targetDir, destinationName)
    if (destinationName !== requestedName) renamed.push({ requestedName, destinationName, destinationPath })
    try {
      await copyPath(sourcePath, destinationPath)
      copied.push({ sourcePath, destinationPath, kind: (await kindOf(sourcePath)) ?? 'file' })
    } catch {
      failed.push({ sourcePath, message: 'error.failed-read-repo' })
    }
  }
  return { ok: true, copied, renamed, failed }
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```sh
bun run test src/system/file-tree/transfer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Checkpoint without committing**

Run:

```sh
git diff -- src/system/file-tree/transfer.ts src/system/file-tree/transfer.test.ts
```

Expected: diff shows `LocalCopyItem`, `localCopyItemsFromPaths`, destination-name validation, and updated tests. Do not run `git commit`.

---

### Task 3: Server Transfer Orchestration

**Files:**
- Modify: `src/server/modules/repo-file-transfer.ts`
- Modify: `src/server/modules/repo-file-transfer.test.ts`

- [ ] **Step 1: Write failing tests for `localPaths.items` through the server**

In `src/server/modules/repo-file-transfer.test.ts`, replace existing `source: { kind: 'localPaths', paths: [...] }` occurrences with `source: { kind: 'localPaths', items: [{ path: ... }] }`.

Add this test inside `describe('transferRepositoryFiles', () => { ... })`:

```ts
  test('uses local path destinationName when copying to a local target', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-server-transfer-'))
    await mkdir(join(root, 'docs'))
    await writeFile(join(root, 'report.pdf'), 'hello')

    const result = await transferRepositoryFiles({
      repoId: root,
      worktreePath: root,
      targetDirPath: join(root, 'docs'),
      source: {
        kind: 'localPaths',
        items: [{ path: join(root, 'report.pdf'), destinationName: 'pasted-a8f31c9d.pdf' }],
      },
    })

    expect(result.ok).toBe(true)
    await expect(readFile(join(root, 'docs', 'pasted-a8f31c9d.pdf'), 'utf8')).resolves.toBe('hello')
  })
```

Add this remote-target test near the existing remote transfer tests:

```ts
  test('uses local path destinationName when copying to a remote target', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-server-transfer-'))
    await writeFile(join(root, 'report.pdf'), 'hello')

    const result = await transferRepositoryFiles({
      repoId: REMOTE_ID,
      worktreePath: '/srv/repo',
      targetDirPath: '/srv/repo/docs',
      source: {
        kind: 'localPaths',
        items: [{ path: join(root, 'report.pdf'), destinationName: 'pasted-a8f31c9d.pdf' }],
      },
    })

    expect(result.ok).toBe(true)
    expect(writeRemoteFileBase64).toHaveBeenCalledWith(
      REMOTE_TARGET,
      '/srv/repo/docs/pasted-a8f31c9d.pdf',
      Buffer.from('hello').toString('base64'),
    )
  })
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```sh
bun run test src/server/modules/repo-file-transfer.test.ts
```

Expected: FAIL because server code still references `source.paths`.

- [ ] **Step 3: Adapt server transfer code to `items`**

In `src/server/modules/repo-file-transfer.ts`, update the transfer import:

```ts
  localCopyItemsFromPaths,
```

In `transferLocalTarget`, change the `fileTreePaths` local copy call to:

```ts
      return await copyLocalPathsToLocalTarget({
        sourceRootPath: input.source.worktreePath,
        targetRootPath: input.worktreePath,
        targetDirPath: input.targetDirPath,
        items: localCopyItemsFromPaths(input.source.paths),
      })
```

Change the `localPaths` local copy call to:

```ts
      return await copyLocalPathsToLocalTarget({
        sourceRootPath: commonAbsolutePathAncestor(input.source.items.map((item) => item.path)),
        targetRootPath: input.worktreePath,
        targetDirPath: input.targetDirPath,
        items: input.source.items,
      })
```

In `transferRemoteTarget`, change the `fileTreePaths` local-to-remote call to:

```ts
      return await copyLocalPathsToRemoteTarget(
        target,
        input.targetDirPath,
        prepared.existingNames,
        input.source.worktreePath,
        localCopyItemsFromPaths(input.source.paths),
      )
```

Change the `localPaths` remote call to:

```ts
      return await copyLocalPathsToRemoteTarget(
        target,
        input.targetDirPath,
        prepared.existingNames,
        commonAbsolutePathAncestor(input.source.items.map((item) => item.path)),
        input.source.items,
      )
```

Update `copyLocalPathsToRemoteTarget` to accept items:

```ts
async function copyLocalPathsToRemoteTarget(
  target: RemoteRepoTarget,
  targetDirPath: string,
  existingNames: Set<string>,
  sourceRootPath: string,
  items: Array<{ path: string; destinationName?: string }>,
): Promise<RepoFileTransferResult> {
  const inventory = await inventoryLocalTransfer({ rootPath: sourceRootPath, paths: items.map((item) => item.path) })
  if (!inventory.ok) return inventory
  const copied: RepoFileTransferCopiedEntry[] = []
  const renamed: RepoFileTransferRenamedEntry[] = []
  const failed: RepoFileTransferFailedEntry[] = []
  for (const item of items) {
    const sourcePath = item.path
    const requestedName = item.destinationName ?? path.basename(sourcePath)
    const destinationName = uniqueCopyName(existingNames, requestedName)
    existingNames.add(destinationName)
    const destinationPath = path.posix.join(targetDirPath, destinationName)
    if (destinationName !== requestedName) renamed.push({ requestedName, destinationName, destinationPath })
    const result = await copyLocalPathToRemote(target, sourcePath, destinationPath)
    if (result.ok) {
      copied.push({ sourcePath, destinationPath, kind: (await localTransferKind(sourcePath)) ?? 'file' })
    } else {
      failed.push({ sourcePath, message: result.message })
    }
  }
  return { ok: true, copied, renamed, failed }
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```sh
bun run test src/server/modules/repo-file-transfer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Checkpoint without committing**

Run:

```sh
git diff -- src/server/modules/repo-file-transfer.ts src/server/modules/repo-file-transfer.test.ts
```

Expected: diff shows server orchestration using `items` and preserving internal file-tree path behavior through `localCopyItemsFromPaths`. Do not run `git commit`.

---

### Task 4: Random Filename and Clipboard Source Construction

**Files:**
- Modify: `src/web/components/file-tree/model.ts`
- Modify: `src/web/components/file-tree/model.test.ts`
- Modify: `src/web/components/file-tree/clipboard.ts`
- Modify: `src/web/components/file-tree/ProjectFileTree.test.tsx`

- [ ] **Step 1: Write failing model tests for randomized paste names**

In `src/web/components/file-tree/model.test.ts`, add `generatedRandomPasteFileName` to the import list and add:

```ts
  test('generates random paste filenames while preserving extensions', () => {
    expect(generatedRandomPasteFileName('/tmp/report.pdf', 'a8f31c9d')).toBe('pasted-a8f31c9d.pdf')
    expect(generatedRandomPasteFileName('/tmp/LICENSE', '4b91d0aa')).toBe('pasted-4b91d0aa')
    expect(generatedRandomPasteFileName('C:\\Users\\test\\archive.tar.gz', '12345678')).toBe('pasted-12345678.gz')
    expect(generatedRandomPasteFileName('/tmp/.env', 'abcdef12')).toBe('pasted-abcdef12')
  })
```

- [ ] **Step 2: Run the focused model test and verify it fails**

Run:

```sh
bun run test src/web/components/file-tree/model.test.ts
```

Expected: FAIL because `generatedRandomPasteFileName` does not exist.

- [ ] **Step 3: Implement the random filename helper**

In `src/web/components/file-tree/model.ts`, add:

```ts
export function generatedRandomPasteFileName(sourcePath: string, randomHex = randomHex8()): string {
  const basename = sourcePath.split(/[\\/]/).pop() ?? ''
  const dot = basename.lastIndexOf('.')
  const extension = dot > 0 && dot < basename.length - 1 ? basename.slice(dot) : ''
  return `pasted-${randomHex}${extension}`
}

function randomHex8(): string {
  const bytes = new Uint8Array(4)
  const cryptoApi = globalThis.crypto
  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}
```

- [ ] **Step 4: Run the focused model test and verify it passes**

Run:

```sh
bun run test src/web/components/file-tree/model.test.ts
```

Expected: PASS.

- [ ] **Step 5: Update clipboard source construction to use `items`**

In `src/web/components/file-tree/clipboard.ts`, update the import from the model:

```ts
import { generatedPasteFileName, generatedRandomPasteFileName } from '#/web/components/file-tree/model.ts'
```

Add:

```ts
export function sourceFromSystemClipboardPaths(paths: string[]): RepoFileTransferSource | null {
  const items = paths
    .filter((path) => path.length > 0)
    .map((path) => ({ path, destinationName: generatedRandomPasteFileName(path) }))
  return items.length > 0 ? { kind: 'localPaths', items } : null
}
```

In `sourceFromClipboardEvent`, replace:

```ts
  if (localPaths.length > 0) return { kind: 'localPaths', paths: localPaths }
```

with:

```ts
  const systemFileSource = sourceFromSystemClipboardPaths(localPaths)
  if (systemFileSource) return systemFileSource
```

In `sourceFromDroppedFiles`, replace:

```ts
  return paths.length > 0 ? { kind: 'localPaths', paths } : null
```

with:

```ts
  return paths.length > 0 ? { kind: 'localPaths', items: paths.map((path) => ({ path })) } : null
```

- [ ] **Step 6: Update existing file-tree tests for `items`**

In `src/web/components/file-tree/ProjectFileTree.test.tsx`, update the drop expectation:

```ts
      source: { kind: 'localPaths', items: [{ path: '/tmp/local.txt' }] },
```

Do not randomize drag/drop expectations.

- [ ] **Step 7: Run focused renderer tests and verify they pass**

Run:

```sh
bun run test src/web/components/file-tree/model.test.ts src/web/components/file-tree/ProjectFileTree.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Checkpoint without committing**

Run:

```sh
git diff -- src/web/components/file-tree/model.ts src/web/components/file-tree/model.test.ts src/web/components/file-tree/clipboard.ts src/web/components/file-tree/ProjectFileTree.test.tsx
```

Expected: diff shows random filename helper, system clipboard source construction, and updated `localPaths.items` tests. Do not run `git commit`.

---

### Task 5: Native Clipboard File Path Bridge

**Files:**
- Create: `src/main/clipboard-file-paths.ts`
- Create: `src/main/clipboard-file-paths.test.ts`
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/main/shell-bridge.ts`
- Modify: `src/main/shell-bridge.test.ts`
- Modify: `src/preload/preload.cjs`
- Modify: `src/main/preload.test.ts`
- Modify: `src/shared/bootstrap.ts`
- Modify: `src/web/vite-env.d.ts`
- Modify: `src/web/renderer-bridge-types.ts`
- Modify: `src/web/app-shell-client.ts`
- Modify: `src/web/app-shell-client.test.ts`

- [ ] **Step 1: Write failing tests for clipboard file URL parsing**

Create `src/main/clipboard-file-paths.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { readClipboardFilePathsFromSystem } from '#/main/clipboard-file-paths.ts'

const clipboard = vi.hoisted(() => ({
  read: vi.fn(),
  readText: vi.fn(),
  readBookmark: vi.fn(),
}))

vi.mock('electron', () => ({ clipboard }))

describe('readClipboardFilePathsFromSystem', () => {
  beforeEach(() => {
    clipboard.read.mockReset()
    clipboard.readText.mockReset()
    clipboard.readBookmark.mockReset()
    clipboard.read.mockReturnValue('')
    clipboard.readText.mockReturnValue('')
    clipboard.readBookmark.mockReturnValue({ title: '', url: '' })
  })

  test('reads file URLs from clipboard formats and removes duplicates', () => {
    clipboard.read.mockImplementation((format: string) =>
      format === 'text/uri-list'
        ? 'file:///Users/test/report.pdf\n# comment\nfile:///Users/test/report.pdf\nfile:///Users/test/LICENSE'
        : '',
    )

    expect(readClipboardFilePathsFromSystem()).toEqual(['/Users/test/report.pdf', '/Users/test/LICENSE'])
  })

  test('reads a file bookmark URL when URI list formats are empty', () => {
    clipboard.readBookmark.mockReturnValue({ title: 'report.pdf', url: 'file:///Users/test/report.pdf' })

    expect(readClipboardFilePathsFromSystem()).toEqual(['/Users/test/report.pdf'])
  })

  test('converts Windows file URLs without a leading slash before the drive', () => {
    clipboard.read.mockImplementation((format: string) =>
      format === 'text/uri-list' ? 'file:///C:/Users/test/report.pdf' : '',
    )

    expect(readClipboardFilePathsFromSystem()).toEqual(['C:/Users/test/report.pdf'])
  })

  test('ignores non-file clipboard values', () => {
    clipboard.read.mockImplementation((format: string) =>
      format === 'text/uri-list' ? 'https://example.com/report.pdf' : '',
    )
    clipboard.readText.mockReturnValue('/plain/text/path')

    expect(readClipboardFilePathsFromSystem()).toEqual([])
  })
})
```

- [ ] **Step 2: Run the focused main clipboard test and verify it fails**

Run:

```sh
bun run test src/main/clipboard-file-paths.test.ts
```

Expected: FAIL because `src/main/clipboard-file-paths.ts` does not exist.

- [ ] **Step 3: Implement clipboard file path reader**

Create `src/main/clipboard-file-paths.ts`:

```ts
import { clipboard } from 'electron'

const FILE_URL_FORMATS = ['text/uri-list', 'public/file-url'] as const

export function readClipboardFilePathsFromSystem(): string[] {
  const values: string[] = []
  for (const format of FILE_URL_FORMATS) values.push(...parseUriList(readClipboardFormat(format)))
  values.push(...parseUriList(readClipboardBookmarkUrl()))
  return [...new Set(values)]
}

function readClipboardFormat(format: string): string {
  try {
    return clipboard.read(format)
  } catch {
    return ''
  }
}

function readClipboardBookmarkUrl(): string {
  try {
    return clipboard.readBookmark().url
  } catch {
    return ''
  }
}

function parseUriList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map(fileUrlToPath)
    .filter((path): path is string => !!path)
}

function fileUrlToPath(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'file:') return null
    const decoded = decodeURIComponent(url.pathname)
    return /^\/[A-Za-z]:\//.test(decoded) ? decoded.slice(1) : decoded
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run the focused main clipboard test and verify it passes**

Run:

```sh
bun run test src/main/clipboard-file-paths.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add shell IPC channel and handler tests**

In `src/shared/ipc-channels.ts`, add:

```ts
export const SHELL_READ_CLIPBOARD_FILE_PATHS_CHANNEL = 'goblin:shell-read-clipboard-file-paths'
```

In `src/main/shell-bridge.test.ts`, add the channel import:

```ts
  SHELL_READ_CLIPBOARD_FILE_PATHS_CHANNEL,
```

Add a hoisted mock:

```ts
  readClipboardFilePathsFromSystem: vi.fn(),
```

Add this mock after the existing module mocks:

```ts
vi.mock('#/main/clipboard-file-paths.ts', () => ({
  readClipboardFilePathsFromSystem,
}))
```

Update the handler wiring test:

```ts
    expect(ipcHandlers.has(SHELL_READ_CLIPBOARD_FILE_PATHS_CHANNEL)).toBe(true)
```

Add tests:

```ts
  test('reads clipboard file paths for trusted senders', async () => {
    readClipboardFilePathsFromSystem.mockReturnValue(['/Users/test/report.pdf'])

    const result = await invoke(SHELL_READ_CLIPBOARD_FILE_PATHS_CHANNEL)

    expect(result).toEqual(['/Users/test/report.pdf'])
    expect(readClipboardFilePathsFromSystem).toHaveBeenCalled()
  })

  test('returns no clipboard file paths for untrusted senders', async () => {
    readClipboardFilePathsFromSystem.mockReturnValue(['/Users/test/report.pdf'])

    const result = await invokeWithEvent(SHELL_READ_CLIPBOARD_FILE_PATHS_CHANNEL, undefined, {
      sender: { id: 99, once: vi.fn() },
      senderFrame: { url: 'https://example.com/' },
    } as any)

    expect(result).toEqual([])
  })
```

- [ ] **Step 6: Wire the shell IPC handler**

In `src/main/shell-bridge.ts`, import the reader:

```ts
import { readClipboardFilePathsFromSystem } from '#/main/clipboard-file-paths.ts'
```

Import the channel:

```ts
  SHELL_READ_CLIPBOARD_FILE_PATHS_CHANNEL,
```

Add this handler inside `wireShellBridgeIpc`:

```ts
  ipcMain.handle(
    SHELL_READ_CLIPBOARD_FILE_PATHS_CHANNEL,
    async (event): Promise<string[]> => (isTrustedIpcEvent(event) ? readClipboardFilePathsFromSystem() : []),
  )
```

- [ ] **Step 7: Run shell bridge tests**

Run:

```sh
bun run test src/main/clipboard-file-paths.test.ts src/main/shell-bridge.test.ts
```

Expected: PASS.

- [ ] **Step 8: Add bridge capability and renderer-facing types**

In `src/shared/bootstrap.ts`, add `'clipboard-file-paths'` to `RendererNativeCapability` and `ELECTRON_RENDERER_CAPABILITIES`.

In `src/web/renderer-bridge-types.ts`, add to `RendererShellBridge`:

```ts
  readClipboardFilePaths?: () => Promise<string[]>
```

In `src/web/vite-env.d.ts`, add to `GoblinNativeBridge.shell`:

```ts
    readClipboardFilePaths?: () => Promise<string[]>
```

- [ ] **Step 9: Expose preload shell call and test forwarding**

In `src/preload/preload.cjs`, add the channel name under `IPC.shell`:

```js
    readClipboardFilePaths: 'goblin:shell-read-clipboard-file-paths',
```

Add the shell method:

```js
    readClipboardFilePaths: () => safeInvoke(IPC.shell.readClipboardFilePaths),
```

In `src/main/preload.test.ts`, import `SHELL_READ_CLIPBOARD_FILE_PATHS_CHANNEL`, call the bridge method in `forwards shell bridge calls to their IPC channels`, and update the expected channel list:

```ts
    await goblinNative.shell.readClipboardFilePaths()
```

```ts
      SHELL_READ_CLIPBOARD_FILE_PATHS_CHANNEL,
```

- [ ] **Step 10: Add app-shell client wrapper and tests**

In `src/web/app-shell-client.ts`, add:

```ts
export async function readSystemClipboardFilePaths(): Promise<string[]> {
  return (await nativeShell()?.readClipboardFilePaths?.()) ?? []
}
```

In `src/web/app-shell-client.test.ts`, update `testBridge` capability handling:

```ts
      if (capability === 'clipboard-file-paths') return nativeShell?.readClipboardFilePaths !== undefined
```

Add to shell mocks where TypeScript requires it only when the test uses it. Then add:

```ts
  test('reads system clipboard file paths through the native shell', async () => {
    const bridgeModule = await import('#/web/renderer-bridge.ts')
    const readClipboardFilePaths = vi.fn(async () => ['/Users/test/report.pdf'])
    bridgeModule.setRendererBridgeForTests(
      testBridge({
        shell: () => ({
          openSettingsWindow: vi.fn(),
          openExternalUrl: vi.fn(),
          openDirectoryDialog: vi.fn(),
          consumeExternalOpenPaths: vi.fn(),
          openInFinder: vi.fn(),
          readClipboardFilePaths,
        }),
      }),
    )

    const { readSystemClipboardFilePaths } = await import('#/web/app-shell-client.ts')
    await expect(readSystemClipboardFilePaths()).resolves.toEqual(['/Users/test/report.pdf'])
  })

  test('returns an empty clipboard file path list without a native shell', async () => {
    const { readSystemClipboardFilePaths } = await import('#/web/app-shell-client.ts')
    await expect(readSystemClipboardFilePaths()).resolves.toEqual([])
  })
```

- [ ] **Step 11: Run bridge tests**

Run:

```sh
bun run test src/main/preload.test.ts src/web/app-shell-client.test.ts src/web/bootstrap.test.ts
```

Expected: PASS. `src/web/bootstrap.test.ts` is included because it snapshots renderer capabilities.

- [ ] **Step 12: Checkpoint without committing**

Run:

```sh
git diff -- src/main/clipboard-file-paths.ts src/main/clipboard-file-paths.test.ts src/shared/ipc-channels.ts src/main/shell-bridge.ts src/main/shell-bridge.test.ts src/preload/preload.cjs src/main/preload.test.ts src/shared/bootstrap.ts src/web/vite-env.d.ts src/web/renderer-bridge-types.ts src/web/app-shell-client.ts src/web/app-shell-client.test.ts
```

Expected: diff contains only bridge, capability, and tests. Do not run `git commit`.

---

### Task 6: File Tree Context Menu Paste

**Files:**
- Modify: `src/web/components/file-tree/ProjectFileTree.tsx`
- Modify: `src/web/components/file-tree/ProjectFileTree.test.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`

- [ ] **Step 1: Write failing tests for context-menu paste targets**

In `src/web/components/file-tree/ProjectFileTree.test.tsx`, update the app-shell mock to include `readSystemClipboardFilePaths`:

```ts
const readSystemClipboardFilePaths = vi.fn(async () => ['/tmp/report.pdf'])
```

```ts
vi.mock('#/web/app-shell-client.ts', () => ({
  pathForDroppedFile: (file: File) => `/tmp/${file.name}`,
  openInFinder: (path: string) => openInFinder(path),
  readSystemClipboardFilePaths: () => readSystemClipboardFilePaths(),
}))
```

Clear the mock in `beforeEach`:

```ts
  readSystemClipboardFilePaths.mockClear()
  readSystemClipboardFilePaths.mockResolvedValue(['/tmp/report.pdf'])
```

Add a helper near `dropFiles`:

```ts
async function clickContextMenuItem(row: HTMLElement, label: string) {
  await act(async () => {
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }))
    await Promise.resolve()
  })
  const item = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((candidate) =>
    candidate.textContent?.includes(label),
  )
  if (!item) throw new Error(`missing context menu item: ${label}`)
  await act(async () => {
    item.click()
    await Promise.resolve()
    await Promise.resolve()
  })
}
```

Add tests:

```ts
  test('pastes system clipboard files from a directory context menu into that directory', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    await clickContextMenuItem(treeItemByText('src'), 'file-tree.paste')

    expect(transferRepositoryFiles).toHaveBeenCalledWith({
      repoId: '/repo',
      worktreePath: '/repo',
      targetDirPath: '/repo/src',
      source: {
        kind: 'localPaths',
        items: [
          {
            path: '/tmp/report.pdf',
            destinationName: expect.stringMatching(/^pasted-[0-9a-f]{8}\.pdf$/),
          },
        ],
      },
    })
  })

  test('pastes system clipboard files from a file context menu into the parent directory', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    await clickContextMenuItem(treeItemByText('README.md'), 'file-tree.paste')

    expect(transferRepositoryFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        targetDirPath: '/repo',
      }),
    )
  })

  test('pastes system clipboard files from the empty file tree area into the worktree root', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    const emptyArea = container?.querySelector<HTMLElement>('[data-testid="file-tree-empty-context-target"]')
    if (!emptyArea) throw new Error('missing empty context target')
    await clickContextMenuItem(emptyArea, 'file-tree.paste')

    expect(transferRepositoryFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        targetDirPath: '/repo',
      }),
    )
  })

  test('context menu paste prefers the internal file tree clipboard over system clipboard files', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    const file = treeItemByText('README.md')
    await act(async () => {
      file.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      file.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'c', metaKey: true }))
      await Promise.resolve()
    })

    await clickContextMenuItem(treeItemByText('src'), 'file-tree.paste')

    expect(readSystemClipboardFilePaths).not.toHaveBeenCalled()
    expect(transferRepositoryFiles).toHaveBeenCalledWith({
      repoId: '/repo',
      worktreePath: '/repo',
      targetDirPath: '/repo/src',
      source: { kind: 'fileTreePaths', repoId: '/repo', worktreePath: '/repo', paths: ['/repo/README.md'] },
    })
  })
```

- [ ] **Step 2: Run the focused file-tree test and verify it fails**

Run:

```sh
bun run test src/web/components/file-tree/ProjectFileTree.test.tsx
```

Expected: FAIL because `file-tree.paste`, the app-shell wrapper, and context-menu paste are not wired.

- [ ] **Step 3: Add i18n entries**

Add `file-tree.paste` near the other file-tree action labels:

`src/shared/i18n/en.ts`:

```ts
  'file-tree.paste': 'Paste',
```

`src/shared/i18n/zh.ts`:

```ts
  'file-tree.paste': '粘贴',
```

`src/shared/i18n/ja.ts`:

```ts
  'file-tree.paste': '貼り付け',
```

`src/shared/i18n/ko.ts`:

```ts
  'file-tree.paste': '붙여넣기',
```

- [ ] **Step 4: Wire context paste source resolution**

In `src/web/components/file-tree/ProjectFileTree.tsx`, update imports:

```ts
import { ChevronDown, ChevronRight, ClipboardPaste, File, FileSymlink, Folder, FolderOpen, Pencil, RefreshCw, Trash2 } from 'lucide-react'
```

```ts
import { openInFinder, readSystemClipboardFilePaths } from '#/web/app-shell-client.ts'
```

```ts
  sourceFromSystemClipboardPaths,
```

Add this callback near `runTransfer`:

```ts
  const sourceForContextPaste = useCallback(async () => {
    const internal = readInternalFileTreeClipboard()
    if (internal) return internal
    return sourceFromSystemClipboardPaths(await readSystemClipboardFilePaths())
  }, [])
```

Add this callback:

```ts
  const runContextPaste = useCallback(
    async (node: FileTreeNode | null) => {
      if (!worktreePath) return
      const source = await sourceForContextPaste()
      if (!source) return
      await runTransfer(resolveFileTreePasteTarget(worktreePath, node), source)
    },
    [runTransfer, sourceForContextPaste, worktreePath],
  )
```

- [ ] **Step 5: Pass paste handlers into row context menus**

In the root `FileTreeRow` call, pass:

```tsx
                onPaste={runContextPaste}
```

Add `onPaste` to `FileTreeRow` props:

```ts
  onPaste: (node: FileTreeNode | null) => void
```

Pass it into child `FileTreeRow` calls and into `FileTreeContextMenu`:

```tsx
          onPaste={onPaste}
```

```tsx
          onPaste={onPaste}
```

Add it to `FileTreeContextMenu` props:

```ts
  onPaste: (node: FileTreeNode | null) => void
```

Insert this menu item after the relative-path copy item:

```tsx
      <ContextMenuItem onSelect={() => void onPaste(node)}>
        <ClipboardPaste className="size-3.5" />
        {t('file-tree.paste')}
      </ContextMenuItem>
```

- [ ] **Step 6: Add an empty-area context menu target**

In `ProjectFileTree.tsx`, wrap the list area in a flex column and add a filler context target after `rootNodes.map(...)`.

Replace the list container class:

```tsx
        <div className="flex min-h-0 flex-1 flex-col overflow-auto py-1 text-xs">
```

After the `rootNodes.map(...)` block, render:

```tsx
            <>
              {rootNodes.map((node) => (
                <FileTreeRow
                  key={node.id}
                  repoId={repoId}
                  node={node}
                  depth={0}
                  selected={selection.selected.has(node.id)}
                  selectedIds={selection.selected}
                  directories={directories}
                  directoryState={directories[node.relativePath]}
                  onSelect={handleSelect}
                  onToggle={toggleDirectory}
                  onDragStart={handleDragStart}
                  onContextMenu={handleContextMenu}
                  onContextMenuOpenChange={handleContextMenuOpenChange}
                  contextTargets={contextTargets}
                  onBeginRename={beginRename}
                  onBeginDelete={beginDelete}
                  onKeyDown={handleKeyDown}
                  onFocus={setFocusedNodeId}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onPaste={runContextPaste}
                  renameNodeId={renameNode?.id ?? null}
                  renameValue={renameValue}
                  renamePending={renamePending}
                  renameError={renameError}
                  onRenameValueChange={setRenameValue}
                  onRenameCancel={cancelRename}
                  onRenameSubmit={submitRename}
                />
              ))}
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <div
                    className="min-h-6 flex-1"
                    data-testid="file-tree-empty-context-target"
                    onDrop={(event) => handleDrop(null, event)}
                    onDragOver={handleDragOver}
                  />
                </ContextMenuTrigger>
                <FileTreeEmptyContextMenu onPaste={() => void runContextPaste(null)} />
              </ContextMenu>
            </>
```

Add:

```tsx
function FileTreeEmptyContextMenu({ onPaste }: { onPaste: () => void }) {
  const t = useT()
  return (
    <ContextMenuContent>
      <ContextMenuItem onSelect={onPaste}>
        <ClipboardPaste className="size-3.5" />
        {t('file-tree.paste')}
      </ContextMenuItem>
    </ContextMenuContent>
  )
}
```

- [ ] **Step 7: Run the focused file-tree test and verify it passes**

Run:

```sh
bun run test src/web/components/file-tree/ProjectFileTree.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Run i18n snapshot tests**

Run:

```sh
bun run test src/shared/i18n/snapshot.test.ts src/shared/i18n/dictionaries.test.ts
```

Expected: PASS.

- [ ] **Step 9: Checkpoint without committing**

Run:

```sh
git diff -- src/web/components/file-tree/ProjectFileTree.tsx src/web/components/file-tree/ProjectFileTree.test.tsx src/shared/i18n/en.ts src/shared/i18n/zh.ts src/shared/i18n/ja.ts src/shared/i18n/ko.ts
```

Expected: diff shows row context paste, empty-area context paste, tests, and translations. Do not run `git commit`.

---

### Task 7: Integration Verification

**Files:**
- No new files.
- Verify all files modified by Tasks 1-6.

- [ ] **Step 1: Run architecture check**

Run:

```sh
bun run check:architecture
```

Expected: PASS. This confirms main/server/web boundaries remain valid.

- [ ] **Step 2: Run typecheck**

Run:

```sh
bun run typecheck
```

Expected: PASS. Pay special attention to tests that construct `RendererShellBridge` and `RepoFileTransferLocalPathsSource`.

- [ ] **Step 3: Run the full test suite**

Run:

```sh
bun run test
```

Expected: PASS.

- [ ] **Step 4: Inspect final diff**

Run:

```sh
git diff --stat
```

Expected: diff contains only the planned implementation files. Do not run `git commit`.

---

## Self-Review

- Spec coverage:
  - `Ctrl/Cmd+V` remains on the existing paste event path and now randomizes system file paths through `sourceFromClipboardEvent`.
  - Right-click paste is covered for directory, file, and empty-area targets.
  - Internal file-tree paste remains unchanged because it still uses `fileTreePaths`.
  - Drag/drop keeps original filenames by using `localPaths.items` without `destinationName`.
  - Existing image/text paste remains in the `uploadedItems` branch and uses `generatedPasteFileName`.
  - Filesystem writes remain in server/system transfer layers.
- Placeholder scan:
  - The plan intentionally contains no implementation placeholders. All snippets define the new names they use.
- Type consistency:
  - The plan consistently uses `RepoFileTransferLocalPathItem`, `localPaths.items`, `destinationName`, `generatedRandomPasteFileName`, `sourceFromSystemClipboardPaths`, and `readSystemClipboardFilePaths`.
- Project rule:
  - No task includes `git commit`; checkpoints are read-only `git diff` commands because project instructions prohibit commits unless explicitly requested.
