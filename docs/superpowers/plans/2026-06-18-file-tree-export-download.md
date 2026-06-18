# File Tree Export Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make file-tree drag-out produce real files in Finder/Desktop, and add a right-click Download action that copies local files or downloads remote files to a user-selected local directory.

**Architecture:** Keep renderer responsibility limited to selection, context menu actions, and drag event intent. Keep Electron main responsible for trusted native drag and directory picker access. Keep repository file export, remote file reads, cache preparation, containment checks, and conflict-safe local writes in the repo server/system slice.

**Tech Stack:** TypeScript in Node strip-only mode, React, Electron IPC/preload bridge, Hono repo routes, Bun/Vitest, lucide-react, existing repo alias imports with explicit `.ts`/`.tsx` extensions.

---

## Scope Check

This is one feature slice with two entry points:

- Desktop drag-out.
- Right-click Download.

Both depend on the same file-export filtering and remote-file materialization rules, so they belong in one plan. Do not create a separate git branch or commit unless the user explicitly asks; the project AGENTS.md forbids planning or executing git commits without an explicit request.

## File Structure

- Create `src/shared/file-tree-export.ts`
  - Shared contracts and validators for export requests, remote drag-cache preparation results, and native drag start input.
- Create `src/server/modules/repo-file-export.ts`
  - Server-side file export and remote drag-cache preparation.
  - Owns local containment, ordinary-file filtering, size limits, basename conflict handling, and remote SSH reads.
- Create `src/server/modules/repo-file-export.test.ts`
  - Unit tests for local export, remote export, conflict-safe names, remote cache preparation, and invalid paths.
- Modify `src/server/routes/repo.ts`
  - Add thin boundary routes for `/file-export` and `/file-tree/desktop-drag/prepare`.
- Modify `src/server/routes/repo.test.ts`
  - Assert route body normalization and module delegation.
- Modify `src/web/repo-client.ts` and `src/web/repo-client.test.ts`
  - Add client calls for file export and remote drag-cache preparation.
- Create `src/main/file-tree-desktop-drag.ts`
  - Synchronous native drag helper used only by Electron main.
- Create `src/main/file-tree-desktop-drag.test.ts`
  - Unit tests for sync filtering and `webContents.startDrag()` calls.
- Modify `src/main/ipc/trusted-webcontents.ts`
  - Widen the trusted IPC event input type so it works for both `ipcMain.handle` and `ipcMain.on` events.
- Modify `src/main/shell-bridge.ts` and `src/main/shell-bridge.test.ts`
  - Add trusted `ipcMain.on` listener for start-drag.
- Modify `src/shared/ipc-channels.ts`
  - Add shell channel constant for native desktop drag.
- Modify `src/preload/preload.cjs` and `src/main/preload.test.ts`
  - Expose fire-and-forget `shell.startFileTreeDesktopDrag()`.
- Modify `src/shared/bootstrap.ts`
  - Add `file-tree-desktop-drag` native capability.
- Modify `src/web/renderer-bridge-types.ts`, `src/web/vite-env.d.ts`, `src/web/app-shell-client.ts`, `src/web/app-shell-client.test.ts`
  - Type and expose renderer helpers for directory selection and desktop drag start.
- Modify `src/web/components/file-tree/ProjectFileTree.tsx` and `src/web/components/file-tree/ProjectFileTree.test.tsx`
  - Filter exportable file nodes, remove `text/plain` for file drag-out, prepare remote cache, start native drag, and add context-menu Download.
- Modify `src/shared/i18n/en.ts`, `src/shared/i18n/zh.ts`, `src/shared/i18n/ja.ts`, `src/shared/i18n/ko.ts`
  - Add Download labels and result messages.

## Task 1: Shared Export Contracts

**Files:**
- Create: `src/shared/file-tree-export.ts`

- [ ] **Step 1: Add shared request/result validators**

Create `src/shared/file-tree-export.ts` with this content:

```ts
import type { RepoFileTransferEntryKind } from '#/shared/file-tree.ts'

export interface RepoFileExportRequest {
  repoId: string
  worktreePath: string
  targetDirPath: string
  paths: string[]
}

export interface RepoFileExportCopiedEntry {
  sourcePath: string
  destinationPath: string
  kind: RepoFileTransferEntryKind
}

export interface RepoFileExportRenamedEntry {
  requestedName: string
  destinationName: string
  destinationPath: string
}

export interface RepoFileExportFailedEntry {
  sourcePath: string
  message: string
}

export type RepoFileExportResult =
  | {
      ok: true
      copied: RepoFileExportCopiedEntry[]
      renamed: RepoFileExportRenamedEntry[]
      failed: RepoFileExportFailedEntry[]
    }
  | {
      ok: false
      message: string
    }

export interface FileTreeDesktopDragFile {
  sourcePath: string
  localPath: string
}

export interface FileTreeDesktopDragPrepareRequest {
  repoId: string
  worktreePath: string
  paths: string[]
}

export type FileTreeDesktopDragPrepareResult =
  | {
      ok: true
      files: FileTreeDesktopDragFile[]
      failed: RepoFileExportFailedEntry[]
    }
  | {
      ok: false
      message: string
    }

export interface FileTreeDesktopDragStartInput {
  repoId: string
  worktreePath: string
  files: FileTreeDesktopDragFile[]
}

export function isRepoFileExportRequest(value: unknown): value is RepoFileExportRequest {
  return (
    isRecord(value) &&
    typeof value.repoId === 'string' &&
    typeof value.worktreePath === 'string' &&
    typeof value.targetDirPath === 'string' &&
    isStringArray(value.paths) &&
    value.paths.length > 0
  )
}

export function isFileTreeDesktopDragPrepareRequest(value: unknown): value is FileTreeDesktopDragPrepareRequest {
  return (
    isRecord(value) &&
    typeof value.repoId === 'string' &&
    typeof value.worktreePath === 'string' &&
    isStringArray(value.paths) &&
    value.paths.length > 0
  )
}

export function isFileTreeDesktopDragStartInput(value: unknown): value is FileTreeDesktopDragStartInput {
  return (
    isRecord(value) &&
    typeof value.repoId === 'string' &&
    typeof value.worktreePath === 'string' &&
    Array.isArray(value.files) &&
    value.files.every(isFileTreeDesktopDragFile)
  )
}

function isFileTreeDesktopDragFile(value: unknown): value is FileTreeDesktopDragFile {
  return isRecord(value) && typeof value.sourcePath === 'string' && typeof value.localPath === 'string'
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
```

- [ ] **Step 2: Run focused typecheck**

Run: `bun run typecheck`

Expected: typecheck can fail only for missing consumers not yet added in later tasks. It must not report syntax errors in `src/shared/file-tree-export.ts`.

## Task 2: Server File Export Module

**Files:**
- Create: `src/server/modules/repo-file-export.test.ts`
- Create: `src/server/modules/repo-file-export.ts`

- [ ] **Step 1: Write failing server export tests**

Create `src/server/modules/repo-file-export.test.ts` with these tests:

```ts
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  resolveRemoteRepoTarget: vi.fn(),
  inventoryRemoteFileTransfer: vi.fn(),
  readRemoteFileBase64: vi.fn(),
}))

vi.mock('#/server/modules/repo-backend.ts', () => ({
  resolveRemoteRepoTarget: mocks.resolveRemoteRepoTarget,
}))

vi.mock('#/system/ssh/git.ts', () => ({
  inventoryRemoteFileTransfer: mocks.inventoryRemoteFileTransfer,
  readRemoteFileBase64: mocks.readRemoteFileBase64,
}))

const REMOTE_TARGET = { alias: 'prod', remotePath: '/srv/repo' }

describe('repo file export', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveRemoteRepoTarget.mockResolvedValue(REMOTE_TARGET)
    mocks.inventoryRemoteFileTransfer.mockResolvedValue({
      ok: true,
      entries: [{ path: '/srv/repo/a.txt', kind: 'file', size: 5 }],
      totalBytes: 5,
    })
    mocks.readRemoteFileBase64.mockResolvedValue({
      ok: true,
      bytesBase64: Buffer.from('hello').toString('base64'),
    })
  })

  test('copies local ordinary files to the selected directory without overwriting', async () => {
    const { exportRepositoryFilesToLocalDirectory } = await import('#/server/modules/repo-file-export.ts')
    const root = await mkdtemp(path.join(tmpdir(), 'gbl-export-root-'))
    const target = await mkdtemp(path.join(tmpdir(), 'gbl-export-target-'))
    await writeFile(path.join(root, 'a.txt'), 'new')
    await writeFile(path.join(target, 'a.txt'), 'existing')

    const result = await exportRepositoryFilesToLocalDirectory({
      repoId: root,
      worktreePath: root,
      targetDirPath: target,
      paths: [path.join(root, 'a.txt')],
    })

    expect(result).toEqual({
      ok: true,
      copied: [{ sourcePath: path.join(root, 'a.txt'), destinationPath: path.join(target, 'a copy.txt'), kind: 'file' }],
      renamed: [{ requestedName: 'a.txt', destinationName: 'a copy.txt', destinationPath: path.join(target, 'a copy.txt') }],
      failed: [],
    })
    await expect(readFile(path.join(target, 'a copy.txt'), 'utf8')).resolves.toBe('new')
  })

  test('rejects local sources outside the worktree', async () => {
    const { exportRepositoryFilesToLocalDirectory } = await import('#/server/modules/repo-file-export.ts')
    const root = await mkdtemp(path.join(tmpdir(), 'gbl-export-root-'))
    const outside = await mkdtemp(path.join(tmpdir(), 'gbl-export-outside-'))
    const target = await mkdtemp(path.join(tmpdir(), 'gbl-export-target-'))
    const outsideFile = path.join(outside, 'a.txt')
    await writeFile(outsideFile, 'no')

    const result = await exportRepositoryFilesToLocalDirectory({
      repoId: root,
      worktreePath: root,
      targetDirPath: target,
      paths: [outsideFile],
    })

    expect(result).toEqual({ ok: false, message: 'error.file-transfer-source-outside-worktree' })
  })

  test('downloads remote ordinary files to the selected directory', async () => {
    const { exportRepositoryFilesToLocalDirectory } = await import('#/server/modules/repo-file-export.ts')
    const target = await mkdtemp(path.join(tmpdir(), 'gbl-export-target-'))

    const result = await exportRepositoryFilesToLocalDirectory({
      repoId: 'ssh-config://prod/srv/repo',
      worktreePath: '/srv/repo',
      targetDirPath: target,
      paths: ['/srv/repo/a.txt'],
    })

    expect(result).toEqual({
      ok: true,
      copied: [{ sourcePath: '/srv/repo/a.txt', destinationPath: path.join(target, 'a.txt'), kind: 'file' }],
      renamed: [],
      failed: [],
    })
    expect(mocks.readRemoteFileBase64).toHaveBeenCalledWith(REMOTE_TARGET, '/srv/repo/a.txt')
    await expect(readFile(path.join(target, 'a.txt'), 'utf8')).resolves.toBe('hello')
  })
})
```

- [ ] **Step 2: Run tests and verify failure**

Run: `bun run test src/server/modules/repo-file-export.test.ts`

Expected: FAIL because `src/server/modules/repo-file-export.ts` does not exist.

- [ ] **Step 3: Implement server export module**

Create `src/server/modules/repo-file-export.ts` with these exported functions and helpers:

```ts
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { serverDataFile } from '#/server/common/data-dir.ts'
import { resolveRemoteRepoTarget } from '#/server/modules/repo-backend.ts'
import { FILE_TRANSFER_MAX_FILE_BYTES, FILE_TRANSFER_MAX_TOTAL_BYTES } from '#/shared/file-tree.ts'
import type {
  FileTreeDesktopDragPrepareRequest,
  FileTreeDesktopDragPrepareResult,
  RepoFileExportCopiedEntry,
  RepoFileExportFailedEntry,
  RepoFileExportRenamedEntry,
  RepoFileExportRequest,
  RepoFileExportResult,
} from '#/shared/file-tree-export.ts'
import {
  isFileTreeDesktopDragPrepareRequest,
  isRepoFileExportRequest,
} from '#/shared/file-tree-export.ts'
import { isRemoteRepoId } from '#/shared/rpc.ts'
import { pathInsideRoot } from '#/system/file-tree/local.ts'
import { uniqueCopyName } from '#/system/file-tree/transfer.ts'
import { inventoryRemoteFileTransfer, readRemoteFileBase64 } from '#/system/ssh/git.ts'

const DESKTOP_DRAG_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000

export async function exportRepositoryFilesToLocalDirectory(input: unknown): Promise<RepoFileExportResult> {
  if (!isRepoFileExportRequest(input)) return { ok: false, message: 'error.invalid-arguments' }
  if (!path.isAbsolute(input.targetDirPath) || input.targetDirPath.includes('\0')) {
    return { ok: false, message: 'error.invalid-path' }
  }
  await fs.mkdir(input.targetDirPath, { recursive: true })
  return isRemoteRepoId(input.repoId) ? await exportRemoteFiles(input) : await exportLocalFiles(input)
}

export async function prepareRepositoryFileTreeDesktopDrag(
  input: unknown,
): Promise<FileTreeDesktopDragPrepareResult> {
  if (!isFileTreeDesktopDragPrepareRequest(input)) return { ok: false, message: 'error.invalid-arguments' }
  if (!isRemoteRepoId(input.repoId)) {
    const local = await localOrdinaryFiles(input.worktreePath, input.paths)
    if (!local.ok) return local
    return { ok: true, files: local.files.map((file) => ({ sourcePath: file.sourcePath, localPath: file.sourcePath })), failed: [] }
  }
  const target = await resolveRemoteRepoTarget(input.repoId)
  const cacheDir = desktopDragCacheDir()
  await cleanOldDesktopDragCache(cacheDir)
  await fs.mkdir(cacheDir, { recursive: true })
  const inventory = await inventoryRemoteFileTransfer(target, input.worktreePath, input.paths)
  if (!inventory.ok) return inventory
  const existingNames = new Set(await fs.readdir(cacheDir).catch(() => []))
  const files: Array<{ sourcePath: string; localPath: string }> = []
  const failed: RepoFileExportFailedEntry[] = []
  for (const sourcePath of input.paths) {
    const entry = inventory.entries.find((item) => samePath(item.path, sourcePath))
    if (!entry || entry.kind !== 'file') {
      failed.push({ sourcePath, message: 'error.invalid-path' })
      continue
    }
    const read = await readRemoteFileBase64(target, sourcePath)
    if (!read.ok) {
      failed.push({ sourcePath, message: read.message })
      continue
    }
    const destinationName = uniqueCacheName(existingNames, path.posix.basename(sourcePath))
    existingNames.add(destinationName)
    const localPath = path.join(cacheDir, destinationName)
    await fs.writeFile(localPath, Buffer.from(read.bytesBase64, 'base64'))
    files.push({ sourcePath, localPath })
  }
  return { ok: true, files, failed }
}

export function desktopDragCacheDir(): string {
  return serverDataFile('desktop-drag')
}

async function exportLocalFiles(input: RepoFileExportRequest): Promise<RepoFileExportResult> {
  const local = await localOrdinaryFiles(input.worktreePath, input.paths)
  if (!local.ok) return local
  const existingNames = new Set(await fs.readdir(input.targetDirPath).catch(() => []))
  const copied: RepoFileExportCopiedEntry[] = []
  const renamed: RepoFileExportRenamedEntry[] = []
  const failed: RepoFileExportFailedEntry[] = []
  for (const file of local.files) {
    const requestedName = path.basename(file.sourcePath)
    const destinationName = uniqueCopyName(existingNames, requestedName)
    existingNames.add(destinationName)
    const destinationPath = path.join(input.targetDirPath, destinationName)
    if (destinationName !== requestedName) renamed.push({ requestedName, destinationName, destinationPath })
    try {
      await fs.copyFile(file.sourcePath, destinationPath)
      copied.push({ sourcePath: file.sourcePath, destinationPath, kind: 'file' })
    } catch {
      failed.push({ sourcePath: file.sourcePath, message: 'error.failed-read-repo' })
    }
  }
  return { ok: true, copied, renamed, failed }
}

async function exportRemoteFiles(input: RepoFileExportRequest): Promise<RepoFileExportResult> {
  const target = await resolveRemoteRepoTarget(input.repoId)
  const inventory = await inventoryRemoteFileTransfer(target, input.worktreePath, input.paths)
  if (!inventory.ok) return inventory
  const existingNames = new Set(await fs.readdir(input.targetDirPath).catch(() => []))
  const copied: RepoFileExportCopiedEntry[] = []
  const renamed: RepoFileExportRenamedEntry[] = []
  const failed: RepoFileExportFailedEntry[] = []
  for (const sourcePath of input.paths) {
    const entry = inventory.entries.find((item) => samePath(item.path, sourcePath))
    if (!entry || entry.kind !== 'file') {
      failed.push({ sourcePath, message: 'error.invalid-path' })
      continue
    }
    if (entry.size > FILE_TRANSFER_MAX_FILE_BYTES) {
      failed.push({ sourcePath, message: 'error.file-transfer-file-too-large' })
      continue
    }
    const requestedName = path.posix.basename(sourcePath)
    const destinationName = uniqueCopyName(existingNames, requestedName)
    existingNames.add(destinationName)
    const destinationPath = path.join(input.targetDirPath, destinationName)
    if (destinationName !== requestedName) renamed.push({ requestedName, destinationName, destinationPath })
    const read = await readRemoteFileBase64(target, sourcePath)
    if (!read.ok) {
      failed.push({ sourcePath, message: read.message })
      continue
    }
    await fs.writeFile(destinationPath, Buffer.from(read.bytesBase64, 'base64'))
    copied.push({ sourcePath, destinationPath, kind: 'file' })
  }
  return { ok: true, copied, renamed, failed }
}

async function localOrdinaryFiles(
  worktreePath: string,
  paths: string[],
): Promise<{ ok: true; files: Array<{ sourcePath: string; size: number }> } | { ok: false; message: string }> {
  if (!path.isAbsolute(worktreePath) || worktreePath.includes('\0')) return { ok: false, message: 'error.invalid-arguments' }
  const root = path.resolve(worktreePath)
  let totalBytes = 0
  const files: Array<{ sourcePath: string; size: number }> = []
  for (const value of paths) {
    if (!path.isAbsolute(value) || value.includes('\0')) return { ok: false, message: 'error.invalid-arguments' }
    const sourcePath = path.resolve(value)
    if (!pathInsideRoot(root, sourcePath)) return { ok: false, message: 'error.file-transfer-source-outside-worktree' }
    const stat = await fs.lstat(sourcePath).catch(() => null)
    if (!stat) return { ok: false, message: 'error.path-not-found' }
    if (!stat.isFile()) return { ok: false, message: 'error.invalid-path' }
    if (stat.size > FILE_TRANSFER_MAX_FILE_BYTES) return { ok: false, message: 'error.file-transfer-file-too-large' }
    totalBytes += stat.size
    if (totalBytes > FILE_TRANSFER_MAX_TOTAL_BYTES) return { ok: false, message: 'error.file-transfer-total-too-large' }
    files.push({ sourcePath, size: stat.size })
  }
  return { ok: true, files }
}

async function cleanOldDesktopDragCache(cacheDir: string): Promise<void> {
  const entries = await fs.readdir(cacheDir).catch(() => [])
  const cutoff = Date.now() - DESKTOP_DRAG_CACHE_MAX_AGE_MS
  await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(cacheDir, entry)
      const stat = await fs.stat(fullPath).catch(() => null)
      if (stat && stat.mtimeMs < cutoff) await fs.rm(fullPath, { force: true, recursive: true })
    }),
  )
}

function uniqueCacheName(existingNames: Set<string>, requestedName: string): string {
  const safeName = requestedName && !requestedName.includes('\0') ? requestedName : 'download'
  const suffix = randomUUID().slice(0, 8)
  return uniqueCopyName(existingNames, `${suffix}-${safeName}`)
}

function samePath(left: string, right: string): boolean {
  return path.posix.normalize(left) === path.posix.normalize(right)
}
```

- [ ] **Step 4: Run export tests**

Run: `bun run test src/server/modules/repo-file-export.test.ts`

Expected: PASS.

## Task 3: Repo Route And Client Wiring

**Files:**
- Modify: `src/server/routes/repo.ts`
- Modify: `src/server/routes/repo.test.ts`
- Modify: `src/web/repo-client.ts`
- Modify: `src/web/repo-client.test.ts`

- [ ] **Step 1: Write failing route and client tests**

In `src/server/routes/repo.test.ts`, add a hoisted mock entry:

```ts
const mocks = vi.hoisted(() => ({
  getRepositoryCommitDetail: vi.fn(),
  getRepositoryHistory: vi.fn(),
  exportRepositoryFilesToLocalDirectory: vi.fn(),
  prepareRepositoryFileTreeDesktopDrag: vi.fn(),
}))
```

Update the `vi.mock('#/server/modules/repo-file-transfer.ts'...)` area by adding a new mock:

```ts
vi.mock('#/server/modules/repo-file-export.ts', () => ({
  exportRepositoryFilesToLocalDirectory: mocks.exportRepositoryFilesToLocalDirectory,
  prepareRepositoryFileTreeDesktopDrag: mocks.prepareRepositoryFileTreeDesktopDrag,
}))
```

Add these tests:

```ts
test('serves repository file export', async () => {
  mocks.exportRepositoryFilesToLocalDirectory.mockResolvedValue({
    ok: true,
    copied: [{ sourcePath: '/repo/a.txt', destinationPath: '/Downloads/a.txt', kind: 'file' }],
    renamed: [],
    failed: [],
  })
  const { createRepoRoutes } = await import('#/server/routes/repo.ts')
  const app = createRepoRoutes()

  const response = await app.request('http://localhost/file-export', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      repoId: '/repo',
      worktreePath: '/repo',
      targetDirPath: '/Downloads',
      paths: ['/repo/a.txt'],
    }),
  })

  expect(response.status).toBe(200)
  await expect(response.json()).resolves.toEqual({
    ok: true,
    copied: [{ sourcePath: '/repo/a.txt', destinationPath: '/Downloads/a.txt', kind: 'file' }],
    renamed: [],
    failed: [],
  })
  expect(mocks.exportRepositoryFilesToLocalDirectory).toHaveBeenCalledWith({
    repoId: '/repo',
    worktreePath: '/repo',
    targetDirPath: '/Downloads',
    paths: ['/repo/a.txt'],
  })
})

test('serves file tree desktop drag preparation', async () => {
  mocks.prepareRepositoryFileTreeDesktopDrag.mockResolvedValue({
    ok: true,
    files: [{ sourcePath: '/srv/repo/a.txt', localPath: '/cache/a.txt' }],
    failed: [],
  })
  const { createRepoRoutes } = await import('#/server/routes/repo.ts')
  const app = createRepoRoutes()

  const response = await app.request('http://localhost/file-tree/desktop-drag/prepare', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      repoId: 'ssh-config://prod/srv/repo',
      worktreePath: '/srv/repo',
      paths: ['/srv/repo/a.txt'],
    }),
  })

  expect(response.status).toBe(200)
  await expect(response.json()).resolves.toEqual({
    ok: true,
    files: [{ sourcePath: '/srv/repo/a.txt', localPath: '/cache/a.txt' }],
    failed: [],
  })
})
```

In `src/web/repo-client.test.ts`, add tests next to `requests repository file transfer`:

```ts
test('requests repository file export', async () => {
  installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      ok: true,
      copied: [{ sourcePath: '/repo/a.txt', destinationPath: '/Downloads/a.txt', kind: 'file' }],
      renamed: [],
      failed: [],
    }),
  }))
  vi.stubGlobal('fetch', fetchMock)

  const { exportRepositoryFilesToLocalDirectory } = await import('#/web/repo-client.ts')
  const result = await exportRepositoryFilesToLocalDirectory({
    repoId: '/repo',
    worktreePath: '/repo',
    targetDirPath: '/Downloads',
    paths: ['/repo/a.txt'],
  })

  expect(result).toEqual({
    ok: true,
    copied: [{ sourcePath: '/repo/a.txt', destinationPath: '/Downloads/a.txt', kind: 'file' }],
    renamed: [],
    failed: [],
  })
  expect(fetchMock).toHaveBeenCalledWith(
    'http://127.0.0.1:32100/api/repo/file-export',
    expect.objectContaining({ method: 'POST' }),
  )
})

test('requests file tree desktop drag preparation', async () => {
  installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ ok: true, files: [{ sourcePath: '/srv/repo/a.txt', localPath: '/cache/a.txt' }], failed: [] }),
  }))
  vi.stubGlobal('fetch', fetchMock)

  const { prepareRepositoryFileTreeDesktopDrag } = await import('#/web/repo-client.ts')
  const result = await prepareRepositoryFileTreeDesktopDrag({
    repoId: 'ssh-config://prod/srv/repo',
    worktreePath: '/srv/repo',
    paths: ['/srv/repo/a.txt'],
  })

  expect(result).toEqual({ ok: true, files: [{ sourcePath: '/srv/repo/a.txt', localPath: '/cache/a.txt' }], failed: [] })
  expect(fetchMock).toHaveBeenCalledWith(
    'http://127.0.0.1:32100/api/repo/file-tree/desktop-drag/prepare',
    expect.objectContaining({ method: 'POST' }),
  )
})
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```sh
bun run test src/server/routes/repo.test.ts src/web/repo-client.test.ts
```

Expected: FAIL because routes and client functions are not wired.

- [ ] **Step 3: Wire repo route**

In `src/server/routes/repo.ts`, import:

```ts
import {
  exportRepositoryFilesToLocalDirectory,
  prepareRepositoryFileTreeDesktopDrag,
} from '#/server/modules/repo-file-export.ts'
```

Add routes near `/file-transfer`:

```ts
  app.post('/file-export', async (c) => {
    const body = await c.req.json().catch(() => null)
    return c.json(
      await jsonOr(
        () => exportRepositoryFilesToLocalDirectory(body),
        { ok: false, message: 'error.failed-read-repo' },
        'file-export',
      ),
    )
  })
  app.post('/file-tree/desktop-drag/prepare', async (c) => {
    const body = await c.req.json().catch(() => null)
    return c.json(
      await jsonOr(
        () => prepareRepositoryFileTreeDesktopDrag(body),
        { ok: false, message: 'error.failed-read-repo' },
        'file-tree-desktop-drag-prepare',
      ),
    )
  })
```

- [ ] **Step 4: Wire repo client**

In `src/web/repo-client.ts`, update the type import:

```ts
import type {
  FileTreeDesktopDragPrepareRequest,
  FileTreeDesktopDragPrepareResult,
  RepoFileExportRequest,
  RepoFileExportResult,
} from '#/shared/file-tree-export.ts'
```

Add functions next to `transferRepositoryFiles`:

```ts
export async function exportRepositoryFilesToLocalDirectory(
  input: RepoFileExportRequest,
): Promise<RepoFileExportResult> {
  return await postServerJson('/api/repo/file-export', input)
}

export async function prepareRepositoryFileTreeDesktopDrag(
  input: FileTreeDesktopDragPrepareRequest,
): Promise<FileTreeDesktopDragPrepareResult> {
  return await postServerJson('/api/repo/file-tree/desktop-drag/prepare', input)
}
```

- [ ] **Step 5: Run route and client tests**

Run:

```sh
bun run test src/server/routes/repo.test.ts src/web/repo-client.test.ts
```

Expected: PASS.

## Task 4: Native Desktop Drag Bridge

**Files:**
- Create: `src/main/file-tree-desktop-drag.test.ts`
- Create: `src/main/file-tree-desktop-drag.ts`
- Modify: `src/main/ipc/trusted-webcontents.ts`
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/shared/bootstrap.ts`
- Modify: `src/main/shell-bridge.ts`
- Modify: `src/main/shell-bridge.test.ts`
- Modify: `src/preload/preload.cjs`
- Modify: `src/main/preload.test.ts`
- Modify: `src/web/renderer-bridge-types.ts`
- Modify: `src/web/vite-env.d.ts`
- Modify: `src/web/app-shell-client.ts`
- Modify: `src/web/app-shell-client.test.ts`

- [ ] **Step 1: Write failing main native drag tests**

Create `src/main/file-tree-desktop-drag.test.ts`:

```ts
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const appGetPath = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  app: { getPath: appGetPath },
}))

describe('file tree desktop drag', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('starts native drag for local files inside the worktree', async () => {
    const { startFileTreeDesktopDrag } = await import('#/main/file-tree-desktop-drag.ts')
    const root = await mkdtemp(path.join(tmpdir(), 'gbl-drag-root-'))
    const file = path.join(root, 'a.txt')
    await writeFile(file, 'hello')
    const webContents = { startDrag: vi.fn() }

    startFileTreeDesktopDrag(webContents as never, {
      repoId: root,
      worktreePath: root,
      files: [{ sourcePath: file, localPath: file }],
    })

    expect(webContents.startDrag).toHaveBeenCalledWith(expect.objectContaining({ file, files: [file] }))
  })

  test('filters local files outside the worktree', async () => {
    const { startFileTreeDesktopDrag } = await import('#/main/file-tree-desktop-drag.ts')
    const root = await mkdtemp(path.join(tmpdir(), 'gbl-drag-root-'))
    const outside = await mkdtemp(path.join(tmpdir(), 'gbl-drag-outside-'))
    const file = path.join(outside, 'a.txt')
    await writeFile(file, 'hello')
    const webContents = { startDrag: vi.fn() }

    startFileTreeDesktopDrag(webContents as never, {
      repoId: root,
      worktreePath: root,
      files: [{ sourcePath: file, localPath: file }],
    })

    expect(webContents.startDrag).not.toHaveBeenCalled()
  })

  test('starts native drag for remote cache files under userData desktop-drag', async () => {
    const { startFileTreeDesktopDrag } = await import('#/main/file-tree-desktop-drag.ts')
    const userData = await mkdtemp(path.join(tmpdir(), 'gbl-user-data-'))
    appGetPath.mockReturnValue(userData)
    const cacheDir = path.join(userData, 'desktop-drag')
    await mkdir(cacheDir)
    const cacheFile = path.join(cacheDir, 'a.txt')
    await writeFile(cacheFile, 'hello')
    const webContents = { startDrag: vi.fn() }

    startFileTreeDesktopDrag(webContents as never, {
      repoId: 'ssh-config://prod/srv/repo',
      worktreePath: '/srv/repo',
      files: [{ sourcePath: '/srv/repo/a.txt', localPath: cacheFile }],
    })

    expect(webContents.startDrag).toHaveBeenCalledWith(expect.objectContaining({ file: cacheFile, files: [cacheFile] }))
  })
})
```

- [ ] **Step 2: Run tests and verify failure**

Run: `bun run test src/main/file-tree-desktop-drag.test.ts`

Expected: FAIL because `src/main/file-tree-desktop-drag.ts` does not exist.

- [ ] **Step 3: Implement synchronous native drag helper**

Create `src/main/file-tree-desktop-drag.ts`:

```ts
import { existsSync, lstatSync } from 'node:fs'
import path from 'node:path'
import { app, type WebContents } from 'electron'
import { isFileTreeDesktopDragStartInput, type FileTreeDesktopDragStartInput } from '#/shared/file-tree-export.ts'
import { isRemoteRepoId } from '#/shared/rpc.ts'

export function startFileTreeDesktopDrag(webContents: Pick<WebContents, 'startDrag'>, input: unknown): void {
  if (!isFileTreeDesktopDragStartInput(input)) return
  const files = resolveNativeDragFiles(input)
  if (files.length === 0) return
  try {
    webContents.startDrag({
      file: files[0]!,
      files,
      icon: dragIconPath(),
    })
  } catch (error) {
    console.warn('[file-tree] failed to start native desktop drag', error)
  }
}

function resolveNativeDragFiles(input: FileTreeDesktopDragStartInput): string[] {
  const allowedRoot = isRemoteRepoId(input.repoId)
    ? path.join(app.getPath('userData'), 'desktop-drag')
    : input.worktreePath
  return input.files
    .map((file) => path.resolve(file.localPath))
    .filter((file) => pathInsideRoot(allowedRoot, file))
    .filter(isOrdinaryFile)
}

function isOrdinaryFile(value: string): boolean {
  try {
    const stat = lstatSync(value)
    return stat.isFile()
  } catch {
    return false
  }
}

function dragIconPath(): string {
  const candidates = [
    path.join(app.getAppPath(), 'assets/icon.png'),
    path.join(app.getAppPath(), 'assets/icon-mac-1024.png'),
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? ''
}

function pathInsideRoot(rootPath: string, candidatePath: string): boolean {
  const root = path.resolve(rootPath)
  const candidate = path.resolve(candidatePath)
  return candidate === root || candidate.startsWith(root + path.sep)
}
```

- [ ] **Step 4: Run native drag tests**

Run: `bun run test src/main/file-tree-desktop-drag.test.ts`

Expected: PASS.

- [ ] **Step 5: Add IPC channel and native capability**

In `src/shared/ipc-channels.ts`, add:

```ts
export const SHELL_START_FILE_TREE_DESKTOP_DRAG_CHANNEL = 'goblin:shell-start-file-tree-desktop-drag'
```

In `src/shared/bootstrap.ts`, add `file-tree-desktop-drag` to `RendererNativeCapability` and `ELECTRON_RENDERER_CAPABILITIES`:

```ts
  | 'file-tree-desktop-drag'
```

```ts
  'file-tree-desktop-drag',
```

- [ ] **Step 6: Widen trusted IPC event type**

In `src/main/ipc/trusted-webcontents.ts`, replace the import and signature:

```ts
import type { WebContents } from 'electron'
```

```ts
interface TrustedIpcEventLike {
  sender: WebContents
  senderFrame: { url: string } | null
}

export function isTrustedIpcEvent(event: TrustedIpcEventLike): boolean {
```

Leave the existing function body unchanged.

- [ ] **Step 7: Wire shell bridge synchronous listener**

In `src/main/shell-bridge.ts`, import the helper and channel:

```ts
import { startFileTreeDesktopDrag } from '#/main/file-tree-desktop-drag.ts'
```

```ts
  SHELL_START_FILE_TREE_DESKTOP_DRAG_CHANNEL,
```

Inside `wireShellBridgeIpc()`, add:

```ts
  ipcMain.on(SHELL_START_FILE_TREE_DESKTOP_DRAG_CHANNEL, (event, input?: unknown) => {
    if (!isTrustedIpcEvent(event)) return
    startFileTreeDesktopDrag(event.sender, input)
  })
```

In `src/main/shell-bridge.test.ts`, extend the Electron mock with `ipcMain.on`, track listeners, and add assertions:

```ts
const { ipcListeners, startFileTreeDesktopDrag } = vi.hoisted(() => ({
  ipcListeners: new Map<string, (_event: unknown, input: any) => unknown>(),
  startFileTreeDesktopDrag: vi.fn(),
}))
```

```ts
ipcMain: {
  handle: vi.fn((channel: string, handler: (_event: unknown, input: any) => unknown) => {
    ipcHandlers.set(channel, handler)
  }),
  on: vi.fn((channel: string, handler: (_event: unknown, input: any) => unknown) => {
    ipcListeners.set(channel, handler)
  }),
},
```

```ts
vi.mock('#/main/file-tree-desktop-drag.ts', () => ({
  startFileTreeDesktopDrag,
}))
```

Add test:

```ts
test('starts native file tree desktop drag for trusted senders', () => {
  const listener = ipcListeners.get(SHELL_START_FILE_TREE_DESKTOP_DRAG_CHANNEL)
  if (!listener) throw new Error('missing desktop drag listener')
  const input = { repoId: '/repo', worktreePath: '/repo', files: [{ sourcePath: '/repo/a.txt', localPath: '/repo/a.txt' }] }

  listener(trustedEvent, input)

  expect(startFileTreeDesktopDrag).toHaveBeenCalledWith(trustedSender, input)
})
```

- [ ] **Step 8: Expose preload and renderer helpers**

In `src/preload/preload.cjs`, add the channel key:

```js
    startFileTreeDesktopDrag: 'goblin:shell-start-file-tree-desktop-drag',
```

Expose the method:

```js
    startFileTreeDesktopDrag: (input) => {
      ipcRenderer.send(IPC.shell.startFileTreeDesktopDrag, input)
    },
```

In `src/main/preload.test.ts`, import `SHELL_START_FILE_TREE_DESKTOP_DRAG_CHANNEL`, call the method in the shell bridge test, and assert that it appears in `sends`:

```ts
await goblinNative.shell.startFileTreeDesktopDrag({
  repoId: '/repo',
  worktreePath: '/repo',
  files: [{ sourcePath: '/repo/a.txt', localPath: '/repo/a.txt' }],
})
expect(sends).toContainEqual({
  channel: SHELL_START_FILE_TREE_DESKTOP_DRAG_CHANNEL,
  args: [{ repoId: '/repo', worktreePath: '/repo', files: [{ sourcePath: '/repo/a.txt', localPath: '/repo/a.txt' }] }],
})
```

In `src/web/renderer-bridge-types.ts`, import `FileTreeDesktopDragStartInput` and extend `RendererShellBridge`:

```ts
startFileTreeDesktopDrag?: (input: FileTreeDesktopDragStartInput) => void
```

In `src/web/vite-env.d.ts`, import `FileTreeDesktopDragStartInput` and extend `shell`.

In `src/web/app-shell-client.ts`, import `FileTreeDesktopDragStartInput` and add:

```ts
export async function chooseFileTreeDownloadDirectory(): Promise<string | null> {
  return (await nativeShell()?.openDirectoryDialog?.({ title: 'Download files' })) ?? null
}

export function startFileTreeDesktopDrag(input: FileTreeDesktopDragStartInput): void {
  nativeShell()?.startFileTreeDesktopDrag?.(input)
}
```

In `src/web/app-shell-client.test.ts`, update `testBridge().hasCapability` for `file-tree-desktop-drag`, and add tests for the new helper.

- [ ] **Step 9: Run bridge tests**

Run:

```sh
bun run test src/main/file-tree-desktop-drag.test.ts src/main/shell-bridge.test.ts src/main/preload.test.ts src/web/app-shell-client.test.ts
```

Expected: PASS.

## Task 5: Project File Tree UI And Drag Behavior

**Files:**
- Modify: `src/web/components/file-tree/ProjectFileTree.test.tsx`
- Modify: `src/web/components/file-tree/ProjectFileTree.tsx`

- [ ] **Step 1: Write failing UI tests**

In `src/web/components/file-tree/ProjectFileTree.test.tsx`, add mocks:

```ts
const exportRepositoryFilesToLocalDirectory = vi.fn(async (_input: unknown) => ({
  ok: true as const,
  copied: [{ sourcePath: '/repo/README.md', destinationPath: '/Downloads/README.md', kind: 'file' as const }],
  renamed: [],
  failed: [],
}))
const prepareRepositoryFileTreeDesktopDrag = vi.fn(async (_input: unknown) => ({
  ok: true as const,
  files: [{ sourcePath: '/srv/repo/README.md', localPath: '/cache/README.md' }],
  failed: [],
}))
const chooseFileTreeDownloadDirectory = vi.fn(async () => '/Downloads')
const startFileTreeDesktopDrag = vi.fn()
```

Add them to existing `vi.mock()` blocks:

```ts
exportRepositoryFilesToLocalDirectory: (input: unknown) => exportRepositoryFilesToLocalDirectory(input),
prepareRepositoryFileTreeDesktopDrag: (input: unknown) => prepareRepositoryFileTreeDesktopDrag(input),
```

```ts
chooseFileTreeDownloadDirectory: () => chooseFileTreeDownloadDirectory(),
startFileTreeDesktopDrag: (input: unknown) => startFileTreeDesktopDrag(input),
```

Clear them in `beforeEach()`.

Replace the existing file drag expectations with:

```ts
test('drags file nodes with internal paths and native desktop drag without text path fallback', async () => {
  seedRepoWithSelectedBranch({ hasWorktree: true })
  await render(<ProjectFileTree repoId="/repo" />)

  const file = treeItemByText('README.md')
  const dataTransfer = createDataTransfer()
  await act(async () => {
    dragStart(file, dataTransfer)
    await Promise.resolve()
  })

  expect(dataTransfer.getData(GOBLIN_FILE_PATHS_MIME)).toBe(JSON.stringify({ paths: ['/repo/README.md'] }))
  expect(dataTransfer.getData('text/plain')).toBe('')
  expect(startFileTreeDesktopDrag).toHaveBeenCalledWith({
    repoId: '/repo',
    worktreePath: '/repo',
    files: [{ sourcePath: '/repo/README.md', localPath: '/repo/README.md' }],
  })
})
```

Add directory-only coverage:

```ts
test('keeps text path fallback for directory-only drags and does not start native desktop drag', async () => {
  seedRepoWithSelectedBranch({ hasWorktree: true })
  await render(<ProjectFileTree repoId="/repo" />)

  const directory = treeItemByText('src')
  const dataTransfer = createDataTransfer()
  await act(async () => {
    dragStart(directory, dataTransfer)
    await Promise.resolve()
  })

  expect(dataTransfer.getData(GOBLIN_FILE_PATHS_MIME)).toBe(JSON.stringify({ paths: ['/repo/src'] }))
  expect(dataTransfer.getData('text/plain')).toBe('/repo/src')
  expect(startFileTreeDesktopDrag).not.toHaveBeenCalled()
})
```

Add right-click download coverage:

```ts
test('downloads selected file tree files from the context menu', async () => {
  seedRepoWithSelectedBranch({ hasWorktree: true })
  await render(<ProjectFileTree repoId="/repo" />)

  await clickContextMenuItem(treeItemByText('README.md'), 'file-tree.download')
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })

  expect(chooseFileTreeDownloadDirectory).toHaveBeenCalled()
  expect(exportRepositoryFilesToLocalDirectory).toHaveBeenCalledWith({
    repoId: '/repo',
    worktreePath: '/repo',
    targetDirPath: '/Downloads',
    paths: ['/repo/README.md'],
  })
})
```

- [ ] **Step 2: Run UI tests and verify failure**

Run: `bun run test src/web/components/file-tree/ProjectFileTree.test.tsx`

Expected: FAIL because the UI still writes `text/plain`, lacks Download, and lacks desktop drag calls.

- [ ] **Step 3: Implement exportable node helpers**

In `src/web/components/file-tree/ProjectFileTree.tsx`, add imports:

```ts
import { Download } from 'lucide-react'
import { exportRepositoryFilesToLocalDirectory, prepareRepositoryFileTreeDesktopDrag } from '#/web/repo-client.ts'
import { chooseFileTreeDownloadDirectory, startFileTreeDesktopDrag } from '#/web/app-shell-client.ts'
import type { FileTreeDesktopDragFile } from '#/shared/file-tree-export.ts'
```

Add helper near existing node helpers:

```ts
function isExportableFileNode(node: FileTreeNode): boolean {
  return node.kind === 'file' && node.targetKind !== 'missing'
}

function exportableFileNodes(nodes: FileTreeNode[]): FileTreeNode[] {
  return nodes.filter(isExportableFileNode)
}
```

- [ ] **Step 4: Implement drag candidates and remote prepare cache**

Inside `ProjectFileTree`, add refs:

```ts
  const preparedDesktopDragRef = useRef<{
    repoId: string
    worktreePath: string
    sourcePathsKey: string
    files: FileTreeDesktopDragFile[]
  } | null>(null)
```

Add callbacks:

```ts
  const dragTargetNodes = useCallback(
    (node: FileTreeNode) => {
      const selectedIds = selection.selected.has(node.id) ? selection.selected : new Set([node.id])
      return Array.from(selectedIds)
        .map((id) => flatNodeById.get(id))
        .filter((target): target is FileTreeNode => !!target)
    },
    [flatNodeById, selection.selected],
  )

  const prepareDesktopDrag = useCallback(
    (node: FileTreeNode) => {
      if (!worktreePath || !isRemoteRepoId(repoId)) return
      const files = exportableFileNodes(dragTargetNodes(node))
      if (files.length === 0) return
      const paths = files.map((file) => file.absolutePath)
      void prepareRepositoryFileTreeDesktopDrag({ repoId, worktreePath, paths }).then((result) => {
        if (!result.ok) return
        preparedDesktopDragRef.current = {
          repoId,
          worktreePath,
          sourcePathsKey: paths.join('\0'),
          files: result.files,
        }
      })
    },
    [dragTargetNodes, repoId, worktreePath],
  )
```

Update `handleDragStart`:

```ts
  const handleDragStart = useCallback(
    (node: FileTreeNode, event: DragEvent) => {
      const targets = dragTargetNodes(node)
      const paths = targets.map((target) => target.absolutePath)
      event.dataTransfer.setData(GOBLIN_FILE_PATHS_MIME, buildGoblinFilePathDragPayload(paths))
      event.dataTransfer.effectAllowed = 'copyMove'

      const exportable = exportableFileNodes(targets)
      if (exportable.length === 0) {
        event.dataTransfer.setData('text/plain', paths.join(' '))
        return
      }

      const sourcePaths = exportable.map((target) => target.absolutePath)
      const sourcePathsKey = sourcePaths.join('\0')
      const prepared = preparedDesktopDragRef.current
      const files =
        isRemoteRepoId(repoId) && prepared?.repoId === repoId && prepared.worktreePath === worktreePath && prepared.sourcePathsKey === sourcePathsKey
          ? prepared.files
          : sourcePaths.map((path) => ({ sourcePath: path, localPath: path }))
      if (files.length > 0 && worktreePath) startFileTreeDesktopDrag({ repoId, worktreePath, files })
    },
    [dragTargetNodes, repoId, worktreePath],
  )
```

Pass `prepareDesktopDrag` to rows as an `onPointerDown` prop and attach it to the draggable row:

```tsx
onPointerDown={() => onPrepareDesktopDrag(node)}
```

- [ ] **Step 5: Implement Download action**

Add `runDownload` in `ProjectFileTree`:

```ts
  const runDownload = useCallback(
    async (nodes: FileTreeNode[]) => {
      if (!worktreePath) return
      const files = exportableFileNodes(nodes)
      if (files.length === 0) return
      const targetDirPath = await chooseFileTreeDownloadDirectory()
      if (!targetDirPath) return
      await exportRepositoryFilesToLocalDirectory({
        repoId,
        worktreePath,
        targetDirPath,
        paths: files.map((file) => file.absolutePath),
      })
    },
    [repoId, worktreePath],
  )
```

Extend `FileTreeContextMenu` props:

```ts
  onDownload: (nodes: FileTreeNode[]) => void
```

Inside `FileTreeContextMenu`, compute and render:

```tsx
  const downloadTargets = exportableFileNodes(targets)
```

```tsx
      <ContextMenuItem disabled={downloadTargets.length === 0} onSelect={() => void onDownload(downloadTargets)}>
        <Download className="size-3.5" />
        {t('file-tree.download')}
      </ContextMenuItem>
```

Place Download near Copy/Open actions before the separator. Wire `onDownload={runDownload}` where `FileTreeContextMenu` is rendered.

- [ ] **Step 6: Run UI tests**

Run: `bun run test src/web/components/file-tree/ProjectFileTree.test.tsx`

Expected: PASS.

## Task 6: I18n And Final Verification

**Files:**
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`

- [ ] **Step 1: Add translation keys**

Add `file-tree.download` next to other file-tree actions in all four language files:

```ts
'file-tree.download': 'Download',
```

```ts
'file-tree.download': '下载',
```

```ts
'file-tree.download': 'ダウンロード',
```

```ts
'file-tree.download': '다운로드',
```

- [ ] **Step 2: Run focused test set**

Run:

```sh
bun run test \
  src/server/modules/repo-file-export.test.ts \
  src/server/routes/repo.test.ts \
  src/web/repo-client.test.ts \
  src/main/file-tree-desktop-drag.test.ts \
  src/main/shell-bridge.test.ts \
  src/main/preload.test.ts \
  src/web/app-shell-client.test.ts \
  src/web/components/file-tree/ProjectFileTree.test.tsx \
  src/web/components/terminal/TerminalSlot.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run architecture and type verification**

Run:

```sh
bun run typecheck
bun run check:architecture
```

Expected: PASS. If architecture fails because `src/main/**` imports `src/server/**`, remove that import and keep remote cache preparation on the server route side.

- [ ] **Step 4: Run full test suite**

Run:

```sh
bun run test
```

Expected: PASS. If unrelated existing uncommitted work causes failures outside the files in this plan, record the failing test names and verify the focused test set remains green.

## Implementation Notes

- Do not use TypeScript enum declarations, namespaces with runtime code, parameter properties, or import aliases.
- Use repo-alias imports with explicit `.ts`/`.tsx` suffixes.
- Preserve existing right-click paste removal; this plan adds Download only.
- Do not add directory recursion, zip packaging, overwrite prompts, or progress UI.
- Do not write `text/plain` when a drag contains exportable files; that is the Finder failure mode.
- Keep `GOBLIN_FILE_PATHS_MIME` for every file-tree drag so terminal drag-in continues to work.
- Do not run `git commit`, `git push`, branch operations, or destructive git commands unless the user explicitly requests them.
