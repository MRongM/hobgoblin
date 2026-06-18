# File Tree Context Menu Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a right-click `Upload file` action to the project file tree that uploads one or more local files into the resolved local or remote worktree directory.

**Architecture:** Add one narrow Electron shell bridge method for selecting local files, expose it through the renderer shell client, then wire the file tree context menus to the existing `transferRepositoryFiles()` `localPaths` flow. The server transfer contract and file copy implementation remain unchanged.

**Tech Stack:** Electron IPC/preload, React, Radix context menu primitives, lucide-react, Vitest, Bun.

---

## Repository Constraint

The project instructions say not to plan or execute git commits unless the user explicitly requests them. This plan intentionally contains verification checkpoints and no commit steps.

## Scope Check

This is one coherent UI capability with a small native bridge dependency. It does not require a new transfer subsystem, directory upload support, overwrite behavior, or a progress queue.

## File Structure

- Modify `src/shared/bootstrap.ts`
  - Own the `open-file-dialog` capability flag.
- Modify `src/shared/ipc-channels.ts`
  - Own the new shell IPC channel constant.
- Modify `src/main/shell-bridge.ts`
  - Own trusted native file picker handling.
- Modify `src/main/shell-bridge.test.ts`
  - Cover trusted, untrusted, and canceled file picker IPC behavior.
- Modify `src/preload/preload.cjs`
  - Forward `shell.openFileDialog()` to main.
- Modify `src/main/preload.test.ts`
  - Cover preload channel forwarding.
- Modify `src/web/renderer-bridge-types.ts`
  - Type the new renderer shell method.
- Modify `src/web/vite-env.d.ts`
  - Type the injected native bridge method.
- Modify `src/web/app-shell-client.ts`
  - Own `hasNativeFilePicker()` and `chooseFileTreeUploadFiles()`.
- Modify `src/web/app-shell-client.test.ts`
  - Cover shell client capability and fallback behavior.
- Modify `src/shared/i18n/en.ts`, `src/shared/i18n/zh.ts`, `src/shared/i18n/ja.ts`, `src/shared/i18n/ko.ts`
  - Add `file-tree.upload-file`.
- Modify `src/web/components/file-tree/ProjectFileTree.tsx`
  - Own context menu item rendering, target resolution, and transfer invocation.
- Modify `src/web/components/file-tree/ProjectFileTree.test.tsx`
  - Cover directory, file, empty-area, cancel, multi-file, and hidden-menu behavior.

## Task 1: Native File Picker Bridge

**Files:**
- Modify: `src/shared/bootstrap.ts`
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/main/shell-bridge.ts`
- Modify: `src/main/shell-bridge.test.ts`
- Modify: `src/preload/preload.cjs`
- Modify: `src/main/preload.test.ts`

- [ ] **Step 1: Write failing shell bridge tests**

Add the new channel import in `src/main/shell-bridge.test.ts`:

```ts
  SHELL_OPEN_FILE_DIALOG_CHANNEL,
```

Add this expectation to the existing `wires shell bridge handlers` test:

```ts
    expect(ipcHandlers.has(SHELL_OPEN_FILE_DIALOG_CHANNEL)).toBe(true)
```

Add these tests after `parents directory dialogs to the sender window`:

```ts
  test('parents file dialogs to the sender window', async () => {
    const senderWindow = {} as any
    browserWindowFromWebContents.mockReturnValue(senderWindow)
    showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['/tmp/a.txt', '/tmp/b.txt'] })

    const result = await invoke(SHELL_OPEN_FILE_DIALOG_CHANNEL, { title: 'Upload files' })

    expect(result).toEqual(['/tmp/a.txt', '/tmp/b.txt'])
    expect(browserWindowFromWebContents).toHaveBeenCalledWith(trustedSender)
    expect(showOpenDialog).toHaveBeenCalledWith(senderWindow, {
      properties: ['openFile', 'multiSelections'],
      title: 'Upload files',
    })
  })

  test('returns an empty file list when the file dialog is canceled', async () => {
    showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: ['/tmp/a.txt'] })

    const result = await invoke(SHELL_OPEN_FILE_DIALOG_CHANNEL, { title: 'Upload files' })

    expect(result).toEqual([])
  })

  test('returns no file paths for untrusted file dialog senders', async () => {
    const result = await invokeWithEvent(SHELL_OPEN_FILE_DIALOG_CHANNEL, { title: 'Upload files' }, {
      sender: { id: 99, once: vi.fn() },
      senderFrame: { url: 'https://example.com/' },
    } as any)

    expect(result).toEqual([])
    expect(showOpenDialog).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run the failing shell bridge test**

Run:

```bash
bun run test src/main/shell-bridge.test.ts
```

Expected: FAIL because `SHELL_OPEN_FILE_DIALOG_CHANNEL` does not exist and no handler is registered.

- [ ] **Step 3: Add the shared capability and IPC channel**

In `src/shared/bootstrap.ts`, add the capability to `RendererNativeCapability`:

```ts
  | 'open-file-dialog'
```

Add the capability to `ELECTRON_RENDERER_CAPABILITIES` immediately after `open-directory-dialog`:

```ts
  'open-file-dialog',
```

In `src/shared/ipc-channels.ts`, add this constant after `SHELL_OPEN_DIRECTORY_DIALOG_CHANNEL`:

```ts
export const SHELL_OPEN_FILE_DIALOG_CHANNEL = 'goblin:shell-open-file-dialog'
```

- [ ] **Step 4: Implement the main-process IPC handler**

In `src/main/shell-bridge.ts`, add the channel import:

```ts
  SHELL_OPEN_FILE_DIALOG_CHANNEL,
```

Add this handler after the directory dialog handler:

```ts
  ipcMain.handle(
    SHELL_OPEN_FILE_DIALOG_CHANNEL,
    async (event, input?: { title?: unknown }): Promise<string[]> => {
      if (!isTrustedIpcEvent(event)) return []
      const title = typeof input?.title === 'string' && input.title.trim() ? input.title.trim() : 'Choose Files'
      const win = callerWindow(event)
      const opts: Electron.OpenDialogOptions = { properties: ['openFile', 'multiSelections'], title }
      const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
      if (result.canceled || result.filePaths.length === 0) return []
      return result.filePaths
    },
  )
```

- [ ] **Step 5: Verify the shell bridge test passes**

Run:

```bash
bun run test src/main/shell-bridge.test.ts
```

Expected: PASS.

- [ ] **Step 6: Write failing preload forwarding test**

In `src/main/preload.test.ts`, add the channel import:

```ts
  SHELL_OPEN_FILE_DIALOG_CHANNEL,
```

In `forwards shell bridge calls to their IPC channels`, call the new method after `openDirectoryDialog`:

```ts
    await goblinNative.shell.openFileDialog({ title: 'Upload files' })
```

Update the expected shell channel list to include the new channel after `SHELL_OPEN_DIRECTORY_DIALOG_CHANNEL`:

```ts
      SHELL_OPEN_FILE_DIALOG_CHANNEL,
```

- [ ] **Step 7: Run the failing preload test**

Run:

```bash
bun run test src/main/preload.test.ts
```

Expected: FAIL because `goblinNative.shell.openFileDialog` is not exposed.

- [ ] **Step 8: Expose `openFileDialog()` in preload**

In `src/preload/preload.cjs`, add the IPC key:

```js
    openFileDialog: 'goblin:shell-open-file-dialog',
```

Expose it under `shell`:

```js
    openFileDialog: (input) => safeInvoke(IPC.shell.openFileDialog, input),
```

- [ ] **Step 9: Verify native bridge tests pass together**

Run:

```bash
bun run test src/main/shell-bridge.test.ts src/main/preload.test.ts
```

Expected: PASS.

## Task 2: Renderer Shell Client and i18n

**Files:**
- Modify: `src/web/renderer-bridge-types.ts`
- Modify: `src/web/vite-env.d.ts`
- Modify: `src/web/app-shell-client.ts`
- Modify: `src/web/app-shell-client.test.ts`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`

- [ ] **Step 1: Write failing app shell client tests**

In `src/web/app-shell-client.test.ts`, update `testBridge().hasCapability` with the new capability branch:

```ts
      if (capability === 'open-file-dialog') return nativeShell?.openFileDialog !== undefined
```

Add these tests after `chooses a file tree download directory through the renderer bridge shell`:

```ts
  test('chooses file tree upload files through the renderer bridge shell', async () => {
    const bridgeModule = await import('#/web/renderer-bridge.ts')
    const openFileDialog = vi.fn(async () => ['/Users/test/Desktop/a.txt', '/Users/test/Desktop/b.txt'])
    bridgeModule.setRendererBridgeForTests(
      testBridge({
        shell: () => ({
          openSettingsWindow: vi.fn(),
          openExternalUrl: vi.fn(),
          openDirectoryDialog: vi.fn(),
          openFileDialog,
          consumeExternalOpenPaths: vi.fn(),
          openInFinder: vi.fn(),
        }),
      }),
    )

    const { chooseFileTreeUploadFiles, hasNativeFilePicker } = await import('#/web/app-shell-client.ts')
    expect(hasNativeFilePicker()).toBe(true)
    await expect(chooseFileTreeUploadFiles()).resolves.toEqual([
      '/Users/test/Desktop/a.txt',
      '/Users/test/Desktop/b.txt',
    ])
    expect(openFileDialog).toHaveBeenCalledWith({ title: 'Upload files' })
  })

  test('returns an empty upload file list without a native shell', async () => {
    const { chooseFileTreeUploadFiles, hasNativeFilePicker } = await import('#/web/app-shell-client.ts')
    expect(hasNativeFilePicker()).toBe(false)
    await expect(chooseFileTreeUploadFiles()).resolves.toEqual([])
  })
```

- [ ] **Step 2: Run the failing app shell client test**

Run:

```bash
bun run test src/web/app-shell-client.test.ts
```

Expected: FAIL because the renderer shell type and client methods do not exist.

- [ ] **Step 3: Type the new renderer shell method**

In `src/web/renderer-bridge-types.ts`, add this method to `RendererShellBridge` after `openDirectoryDialog`:

```ts
  openFileDialog: (input?: { title?: string }) => Promise<string[]>
```

In `src/web/vite-env.d.ts`, add the same method to `GoblinNativeBridge.shell` after `openDirectoryDialog`:

```ts
    openFileDialog: (input?: { title?: string }) => Promise<string[]>
```

- [ ] **Step 4: Add shell client helpers**

In `src/web/app-shell-client.ts`, add this helper after `hasNativeDirectoryPicker()`:

```ts
export function hasNativeFilePicker(): boolean {
  try {
    return getRendererBridge().hasCapability('open-file-dialog')
  } catch {
    return false
  }
}
```

Add this function after `chooseFileTreeDownloadDirectory()`:

```ts
export async function chooseFileTreeUploadFiles(): Promise<string[]> {
  return (await nativeShell()?.openFileDialog?.({ title: 'Upload files' })) ?? []
}
```

- [ ] **Step 5: Add i18n labels**

In each dictionary, insert `file-tree.upload-file` after `file-tree.download`.

`src/shared/i18n/en.ts`:

```ts
  'file-tree.upload-file': 'Upload file',
```

`src/shared/i18n/zh.ts`:

```ts
  'file-tree.upload-file': '上传文件',
```

`src/shared/i18n/ja.ts`:

```ts
  'file-tree.upload-file': 'ファイルをアップロード',
```

`src/shared/i18n/ko.ts`:

```ts
  'file-tree.upload-file': '파일 업로드',
```

- [ ] **Step 6: Verify shell client and dictionaries**

Run:

```bash
bun run test src/web/app-shell-client.test.ts src/shared/i18n/dictionaries.test.ts
```

Expected: PASS.

## Task 3: File Tree Context Menu Upload Action

**Files:**
- Modify: `src/web/components/file-tree/ProjectFileTree.tsx`
- Modify: `src/web/components/file-tree/ProjectFileTree.test.tsx`

- [ ] **Step 1: Write failing file tree upload tests**

In `src/web/components/file-tree/ProjectFileTree.test.tsx`, add a file picker mock near the existing shell mocks:

```ts
const chooseFileTreeUploadFiles = vi.fn(async () => ['/Users/test/Desktop/upload-a.txt', '/Users/test/Desktop/upload-b.txt'])
const hasNativeFilePicker = vi.fn(() => true)
```

Update the `#/web/app-shell-client.ts` mock:

```ts
vi.mock('#/web/app-shell-client.ts', () => ({
  pathForDroppedFile: (file: File) => `/tmp/${file.name}`,
  openInFinder: (path: string) => openInFinder(path),
  readSystemClipboardFilePaths: () => readSystemClipboardFilePaths(),
  chooseFileTreeDownloadDirectory: () => chooseFileTreeDownloadDirectory(),
  chooseFileTreeUploadFiles: () => chooseFileTreeUploadFiles(),
  hasNativeFilePicker: () => hasNativeFilePicker(),
}))
```

Reset the mocks in `beforeEach()`:

```ts
  chooseFileTreeUploadFiles.mockClear()
  chooseFileTreeUploadFiles.mockResolvedValue(['/Users/test/Desktop/upload-a.txt', '/Users/test/Desktop/upload-b.txt'])
  hasNativeFilePicker.mockClear()
  hasNativeFilePicker.mockReturnValue(true)
```

Add these tests after `downloads selected file tree files from the context menu`:

```ts
  test('uploads selected files into a directory context target', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    await clickContextMenuItem(treeItemByText('src'), 'file-tree.upload-file')
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(chooseFileTreeUploadFiles).toHaveBeenCalledTimes(1)
    expect(transferRepositoryFiles).toHaveBeenCalledWith({
      repoId: '/repo',
      worktreePath: '/repo',
      targetDirPath: '/repo/src',
      source: {
        kind: 'localPaths',
        items: [{ path: '/Users/test/Desktop/upload-a.txt' }, { path: '/Users/test/Desktop/upload-b.txt' }],
      },
    })
  })

  test('uploads selected files into a file context target parent directory', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    await clickContextMenuItem(treeItemByText('README.md'), 'file-tree.upload-file')
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(transferRepositoryFiles).toHaveBeenCalledWith({
      repoId: '/repo',
      worktreePath: '/repo',
      targetDirPath: '/repo',
      source: {
        kind: 'localPaths',
        items: [{ path: '/Users/test/Desktop/upload-a.txt' }, { path: '/Users/test/Desktop/upload-b.txt' }],
      },
    })
  })

  test('uploads selected files into the worktree root from the empty context menu', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    const emptyArea = container?.querySelector<HTMLElement>('[data-testid="file-tree-empty-context-target"]')
    if (!emptyArea) throw new Error('missing empty context target')
    await clickContextMenuItem(emptyArea, 'file-tree.upload-file')
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(transferRepositoryFiles).toHaveBeenCalledWith({
      repoId: '/repo',
      worktreePath: '/repo',
      targetDirPath: '/repo',
      source: {
        kind: 'localPaths',
        items: [{ path: '/Users/test/Desktop/upload-a.txt' }, { path: '/Users/test/Desktop/upload-b.txt' }],
      },
    })
  })

  test('does not upload when the file picker is canceled', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })
    chooseFileTreeUploadFiles.mockResolvedValue([])

    await render(<ProjectFileTree repoId="/repo" />)

    await clickContextMenuItem(treeItemByText('src'), 'file-tree.upload-file')
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(chooseFileTreeUploadFiles).toHaveBeenCalledTimes(1)
    expect(transferRepositoryFiles).not.toHaveBeenCalled()
  })

  test('hides upload file actions when the native file picker is unavailable', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })
    hasNativeFilePicker.mockReturnValue(false)

    await render(<ProjectFileTree repoId="/repo" />)

    const labels = await contextMenuLabels(treeItemByText('src'))

    expect(labels).not.toContain('file-tree.upload-file')
  })
```

- [ ] **Step 2: Run the failing file tree test**

Run:

```bash
bun run test src/web/components/file-tree/ProjectFileTree.test.tsx
```

Expected: FAIL because `file-tree.upload-file` is not rendered and upload shell helpers are not imported.

- [ ] **Step 3: Import upload dependencies**

In `src/web/components/file-tree/ProjectFileTree.tsx`, add `Upload` to the lucide import:

```ts
  Upload,
```

Update the app shell client import:

```ts
import {
  chooseFileTreeDownloadDirectory,
  chooseFileTreeUploadFiles,
  hasNativeFilePicker,
  openInFinder,
  readSystemClipboardFilePaths,
} from '#/web/app-shell-client.ts'
```

- [ ] **Step 4: Add upload orchestration in `ProjectFileTree`**

Add this constant near `rootState`:

```ts
  const canUploadFiles = hasNativeFilePicker()
```

Add this target helper after `pasteTargetNode`:

```ts
  const uploadTargetForNode = useCallback(
    (node: FileTreeNode | null) => {
      if (!worktreePath) return null
      return resolveFileTreePasteTarget(worktreePath, node)
    },
    [worktreePath],
  )
```

Add this callback after `runTransfer`:

```ts
  const runUpload = useCallback(
    async (targetDirPath: string) => {
      if (!worktreePath) return
      const paths = await chooseFileTreeUploadFiles()
      if (paths.length === 0) return
      await runTransfer(targetDirPath, {
        kind: 'localPaths',
        items: paths.map((path) => ({ path })),
      })
    },
    [runTransfer, worktreePath],
  )
```

Add this callback immediately after `runUpload`:

```ts
  const runUploadForNode = useCallback(
    (node: FileTreeNode | null) => {
      const targetDirPath = uploadTargetForNode(node)
      if (!targetDirPath) return
      void runUpload(targetDirPath)
    },
    [runUpload, uploadTargetForNode],
  )
```

- [ ] **Step 5: Pass upload props to row and empty menus**

Extend `FileTreeRow` props:

```ts
  canUploadFiles: boolean
  onUpload: (node: FileTreeNode | null) => void
```

Pass the props from the root row render:

```tsx
                    canUploadFiles={canUploadFiles}
                    onUpload={runUploadForNode}
```

Pass the props through the recursive child row render:

```tsx
            canUploadFiles={canUploadFiles}
            onUpload={onUpload}
```

Pass the props into `FileTreeContextMenu`:

```tsx
          canUploadFiles={canUploadFiles}
          onUpload={onUpload}
```

Update `FileTreeEmptyContextMenu` usage:

```tsx
                  <FileTreeEmptyContextMenu
                    canUploadFiles={canUploadFiles}
                    onUpload={() => runUploadForNode(null)}
                    onCreateDirectory={() => beginCreateDirectory(rootCreateDirectoryTarget())}
                    onRefresh={() => refreshTreeDirectory(rootCreateDirectoryTarget())}
                  />
```

- [ ] **Step 6: Render upload menu items**

Update `FileTreeContextMenu` parameters and type:

```ts
  canUploadFiles,
  onUpload,
}: {
  repoId: string
  node: FileTreeNode
  targets: FileTreeNode[]
  canUploadFiles: boolean
  onUpload: (node: FileTreeNode | null) => void
  onBeginRename: (node: FileTreeNode) => void
  onBeginDelete: (node: FileTreeNode) => void
  onBeginCreateDirectory: (node: FileTreeNode | null) => void
  onRefresh: (node: FileTreeNode | null) => void
  onDownload: (nodes: FileTreeNode[]) => void
}) {
```

Render this item after `Download`:

```tsx
      {canUploadFiles ? (
        <ContextMenuItem onSelect={() => onUpload(node)}>
          <Upload className="size-3.5" />
          {t('file-tree.upload-file')}
        </ContextMenuItem>
      ) : null}
```

Update `FileTreeEmptyContextMenu`:

```ts
function FileTreeEmptyContextMenu({
  canUploadFiles,
  onUpload,
  onCreateDirectory,
  onRefresh,
}: {
  canUploadFiles: boolean
  onUpload: () => void
  onCreateDirectory: () => void
  onRefresh: () => void
}) {
```

Render this item before `New folder`:

```tsx
      {canUploadFiles ? (
        <ContextMenuItem onSelect={onUpload}>
          <Upload className="size-3.5" />
          {t('file-tree.upload-file')}
        </ContextMenuItem>
      ) : null}
```

- [ ] **Step 7: Verify file tree upload behavior**

Run:

```bash
bun run test src/web/components/file-tree/ProjectFileTree.test.tsx
```

Expected: PASS.

## Task 4: Final Verification

**Files:**
- Read: changed files from `git status --short`

- [ ] **Step 1: Run focused tests**

Run:

```bash
bun run test src/main/shell-bridge.test.ts src/main/preload.test.ts src/web/app-shell-client.test.ts src/shared/i18n/dictionaries.test.ts src/web/components/file-tree/ProjectFileTree.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run architecture guard**

Run:

```bash
bun run check:architecture
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 4: Run full test suite**

Run:

```bash
bun run test
```

Expected: PASS.

- [ ] **Step 5: Inspect worktree status**

Run:

```bash
git status --short
```

Expected: only the files listed in this plan and the already-approved spec/plan documents are changed.

## Self-Review

- Spec coverage: native file selection, row context menu upload, empty-area upload, target directory resolution, local and remote transfer reuse, pure-web hidden behavior, cancel behavior, i18n, and focused tests all map to tasks above.
- Type consistency: the new capability is consistently named `open-file-dialog`, the IPC channel is `SHELL_OPEN_FILE_DIALOG_CHANNEL`, the native method is `openFileDialog()`, and the renderer helper is `chooseFileTreeUploadFiles()`.
- Scope check: the plan does not add directory upload, overwrite prompts, progress UI, or server transfer contract changes.
