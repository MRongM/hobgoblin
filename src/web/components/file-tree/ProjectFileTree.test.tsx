// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ProjectFileTree } from '#/web/components/file-tree/ProjectFileTree.tsx'
import { writeInternalFileTreeClipboard } from '#/web/components/file-tree/clipboard.ts'
import { emptyRepo } from '#/web/stores/repos/helpers.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { createRepoBranch, resetReposStore } from '#/web/stores/repos/test-utils.ts'
import { GOBLIN_FILE_PATHS_MIME } from '#/shared/file-tree.ts'

type GetRepositoryFileTreeArgs = [repoId: string, worktreePath: string, dirPath: string, signal?: AbortSignal]
type SearchRepositoryFileTreeArgs = [
  repoId: string,
  worktreePath: string,
  query: string,
  limit?: number,
  signal?: AbortSignal,
]

const getRepositoryFileTree = vi.fn(
  async (_repoId: string, _worktreePath: string, dirPath: string, _signal?: AbortSignal) => ({
    ok: true as const,
    worktreePath: '/repo',
    dirPath,
    entries:
      dirPath === '/repo/src'
        ? [{ name: 'app.ts', absolutePath: '/repo/src/app.ts', relativePath: 'src/app.ts', kind: 'file' as const }]
        : [
            { name: 'src', absolutePath: '/repo/src', relativePath: 'src', kind: 'directory' as const },
            { name: 'README.md', absolutePath: '/repo/README.md', relativePath: 'README.md', kind: 'file' as const },
          ],
  }),
)
const transferRepositoryFiles = vi.fn(async (_input: unknown) => ({
  ok: true as const,
  copied: [{ destinationPath: '/repo/docs/README.md', kind: 'file' as const }],
  renamed: [],
  failed: [],
}))
const exportRepositoryFilesToLocalDirectory = vi.fn(async (_input: unknown) => ({
  ok: true as const,
  copied: [{ sourcePath: '/repo/README.md', destinationPath: '/Downloads/README.md', kind: 'file' as const }],
  renamed: [],
  failed: [],
}))
const moveRepositoryFileTreeEntries = vi.fn(async (..._args: unknown[]) => ({ ok: true as const, message: '' }))
const renameRepositoryFileTreeEntry = vi.fn(async (..._args: unknown[]) => ({ ok: true as const, message: '' }))
const deleteRepositoryFileTreeEntries = vi.fn(async (..._args: unknown[]) => ({ ok: true as const, message: '' }))
const createRepositoryFileTreeDirectory = vi.fn(async (..._args: unknown[]) => ({ ok: true as const, message: '' }))
const searchRepositoryFileTree = vi.fn(async (..._args: SearchRepositoryFileTreeArgs) => ({
  ok: true as const,
  matches: [{ relativePath: 'src/app.ts', kind: 'file' as const }],
  truncated: false,
  limit: 100,
}))
const openRepositoryEditor = vi.fn(async (_path: string) => ({ ok: true as const, message: '' }))
const openRepositoryTerminal = vi.fn(async (_path: string) => ({ ok: true as const, message: '' }))
const openInFinder = vi.fn(async (_path: string) => ({ ok: true as const, message: '' }))
const readSystemClipboardFilePaths = vi.fn(async () => ['/tmp/report.pdf'])
const chooseFileTreeDownloadDirectory = vi.fn(async () => '/Downloads')
const chooseFileTreeUploadFiles = vi.fn(async () => [
  '/Users/test/Desktop/upload-a.txt',
  '/Users/test/Desktop/upload-b.txt',
])
const hasNativeFilePicker = vi.fn(() => true)

vi.mock('#/web/repo-client.ts', () => ({
  getRepositoryFileTree: (...args: GetRepositoryFileTreeArgs) => getRepositoryFileTree(...args),
  createRepositoryFileTreeDirectory: (...args: unknown[]) => createRepositoryFileTreeDirectory(...args),
  renameRepositoryFileTreeEntry: (...args: unknown[]) => renameRepositoryFileTreeEntry(...args),
  deleteRepositoryFileTreeEntries: (...args: unknown[]) => deleteRepositoryFileTreeEntries(...args),
  moveRepositoryFileTreeEntries: (...args: unknown[]) => moveRepositoryFileTreeEntries(...args),
  searchRepositoryFileTree: (...args: SearchRepositoryFileTreeArgs) => searchRepositoryFileTree(...args),
  openRepositoryEditor: (path: string) => openRepositoryEditor(path),
  openRepositoryTerminal: (path: string) => openRepositoryTerminal(path),
  transferRepositoryFiles: (input: unknown) => transferRepositoryFiles(input),
  exportRepositoryFilesToLocalDirectory: (input: unknown) => exportRepositoryFilesToLocalDirectory(input),
}))

vi.mock('#/web/app-shell-client.ts', () => ({
  pathForDroppedFile: (file: File) => `/tmp/${file.name}`,
  openInFinder: (path: string) => openInFinder(path),
  readSystemClipboardFilePaths: () => readSystemClipboardFilePaths(),
  chooseFileTreeDownloadDirectory: () => chooseFileTreeDownloadDirectory(),
  chooseFileTreeUploadFiles: () => chooseFileTreeUploadFiles(),
  hasNativeFilePicker: () => hasNativeFilePicker(),
}))

vi.mock('#/web/remote-client.ts', () => ({
  openRemoteRepositoryEditor: vi.fn(async () => ({ ok: true, message: '' })),
  openRemoteRepositoryTerminal: vi.fn(async () => ({ ok: true, message: '' })),
}))

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))

vi.mock('#/web/runtime-settings-fonts.ts', () => ({
  useRuntimeFontSettings: () => ({ fileTreeFontSize: 12, terminalFontSize: 14 }),
}))

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  getRepositoryFileTree.mockClear()
  transferRepositoryFiles.mockClear()
  exportRepositoryFilesToLocalDirectory.mockClear()
  moveRepositoryFileTreeEntries.mockClear()
  renameRepositoryFileTreeEntry.mockClear()
  deleteRepositoryFileTreeEntries.mockClear()
  createRepositoryFileTreeDirectory.mockClear()
  searchRepositoryFileTree.mockClear()
  openRepositoryEditor.mockClear()
  openRepositoryTerminal.mockClear()
  openInFinder.mockClear()
  readSystemClipboardFilePaths.mockClear()
  readSystemClipboardFilePaths.mockResolvedValue(['/tmp/report.pdf'])
  chooseFileTreeDownloadDirectory.mockClear()
  chooseFileTreeDownloadDirectory.mockResolvedValue('/Downloads')
  chooseFileTreeUploadFiles.mockClear()
  chooseFileTreeUploadFiles.mockResolvedValue(['/Users/test/Desktop/upload-a.txt', '/Users/test/Desktop/upload-b.txt'])
  hasNativeFilePicker.mockClear()
  hasNativeFilePicker.mockReturnValue(true)
  writeInternalFileTreeClipboard({ repoId: '', worktreePath: '', paths: [] })
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(async () => undefined) },
  })
  resetReposStore()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  vi.useRealTimers()
  act(() => {
    root?.unmount()
  })
  container?.remove()
  container = null
  root = null
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('ProjectFileTree', () => {
  test('loads and renders the selected branch worktree root', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    expect(getRepositoryFileTree).toHaveBeenCalledWith('/repo', '/repo', '/repo', expect.any(AbortSignal))
    expect(container?.textContent).toContain('src')
    expect(container?.textContent).toContain('README.md')
  })

  test('loads a non-git local workspace from the repo root', async () => {
    seedPlainWorkspace()

    await render(<ProjectFileTree repoId="/repo" />)

    expect(getRepositoryFileTree).toHaveBeenCalledWith('/repo', '/repo', '/repo', expect.any(AbortSignal))
    expect(container?.textContent).toContain('src')
    expect(container?.textContent).toContain('README.md')
  })

  test('loads a non-git remote workspace from the remote path', async () => {
    const repoId = 'ssh-config://prod/srv/plain'
    seedPlainWorkspace({
      repoId,
      remotePath: '/srv/plain',
    })

    await render(<ProjectFileTree repoId={repoId} />)

    expect(getRepositoryFileTree).toHaveBeenCalledWith(repoId, '/srv/plain', '/srv/plain', expect.any(AbortSignal))
  })

  test('shows empty state when selected branch has no worktree', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: false })

    await render(<ProjectFileTree repoId="/repo" />)

    expect(getRepositoryFileTree).not.toHaveBeenCalled()
    expect(container?.textContent).toContain('file-tree.no-worktree-title')
  })

  test('opens the row context menu through the row context trigger', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    const row = treeItemByText('README.md')
    await act(async () => {
      row.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: 140,
          clientY: 90,
        }),
      )
      await Promise.resolve()
    })

    const menu = document.body.querySelector<HTMLElement>('[role="menu"]')
    expect(menu).not.toBeNull()
    expect(container?.querySelector('button[aria-label="file tree menu"]')).toBeNull()
    expect(menu?.textContent).toContain('file-tree.copy-path')
  })

  test('copies all selected absolute paths from the context menu', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    const directory = treeItemByText('src')
    const file = treeItemByText('README.md')
    await act(async () => {
      directory.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      file.dispatchEvent(new MouseEvent('click', { bubbles: true, metaKey: true }))
      await Promise.resolve()
    })

    await act(async () => {
      file.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }))
      await Promise.resolve()
    })

    const copyPathItem = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) =>
      item.textContent?.includes('file-tree.copy-path'),
    )
    if (!copyPathItem) throw new Error('missing copy path menu item')

    await act(async () => {
      copyPathItem.click()
      await Promise.resolve()
    })

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('/repo/src\n/repo/README.md')
  })

  test('reveals a requested changed file by expanding parents and selecting the file', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" revealRequest={{ id: 1, relativePath: 'src/app.ts' }} />)

    expect(getRepositoryFileTree).toHaveBeenCalledWith('/repo', '/repo', '/repo/src', undefined)
    const row = treeItemByText('app.ts')
    expect(row.getAttribute('aria-selected')).toBe('true')
  })

  test('searches loaded file tree nodes and jumps between matches', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    expect(container?.querySelector('input[aria-label="file-tree.search-label"]')).toBeNull()
    const searchButton = container?.querySelector<HTMLButtonElement>('button[aria-label="file-tree.search-label"]')
    expect(searchButton).toBeTruthy()
    await act(async () => {
      searchButton!.click()
      await Promise.resolve()
    })

    const input = container?.querySelector<HTMLInputElement>('input[aria-label="file-tree.search-label"]')
    expect(input).toBeTruthy()
    expect(document.activeElement).toBe(input)
    await act(async () => {
      input!.value = 'readme'
      input!.dispatchEvent(new Event('input', { bubbles: true }))
      await Promise.resolve()
    })

    expect(container?.textContent).toContain('1 / 1')
    expect(treeItemByText('README.md').getAttribute('aria-selected')).toBe('true')
    expect(searchRepositoryFileTree).not.toHaveBeenCalled()
  })

  test('falls back to whole-worktree search when loaded nodes do not match', async () => {
    vi.useFakeTimers()
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    const searchButton = container?.querySelector<HTMLButtonElement>('button[aria-label="file-tree.search-label"]')
    await act(async () => {
      searchButton?.click()
      await Promise.resolve()
    })

    const input = container?.querySelector<HTMLInputElement>('input[aria-label="file-tree.search-label"]')
    await act(async () => {
      input!.value = 'app'
      input!.dispatchEvent(new Event('input', { bubbles: true }))
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(300)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(searchRepositoryFileTree).toHaveBeenCalledWith('/repo', '/repo', 'app', 100, expect.any(AbortSignal))
    expect(getRepositoryFileTree).toHaveBeenCalledWith('/repo', '/repo', '/repo/src', undefined)
    expect(treeItemByText('app.ts').getAttribute('aria-selected')).toBe('true')
    vi.useRealTimers()
  })

  test('places file tree action buttons on the left with collapsed search last', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    const toolbar = fileTreeToolbar()
    const labels = [...toolbar.querySelectorAll<HTMLButtonElement>('button[aria-label]')].map((button) =>
      button.getAttribute('aria-label'),
    )

    expect(labels).toEqual([
      'file-tree.collapse-all',
      'file-tree.refresh',
      'file-tree.new-folder',
      'file-tree.search-label',
    ])
    expect(toolbar.querySelector('input[aria-label="file-tree.search-label"]')).toBeNull()
  })

  test('collapses expanded file tree directories from the toolbar', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    const row = treeItemByText('src')
    await act(async () => {
      row.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(container?.textContent).toContain('app.ts')

    const collapseButton = container?.querySelector<HTMLButtonElement>('button[aria-label="file-tree.collapse-all"]')
    if (!collapseButton) throw new Error('missing collapse button')
    await act(async () => {
      collapseButton.click()
      await Promise.resolve()
    })

    expect(container?.textContent).not.toContain('app.ts')
  })

  test('clicking a directory row selects and expands it', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    const row = treeItemByText('src')
    await act(async () => {
      row.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(row.getAttribute('aria-selected')).toBe('true')
    expect(container?.textContent).toContain('app.ts')
  })

  test('clicking the chevron toggles a directory exactly once', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    const chevron = container?.querySelector<HTMLButtonElement>('button[aria-label="Toggle src"]')
    await act(async () => {
      chevron?.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container?.textContent).toContain('app.ts')
  })

  test('copies selected paths and pastes them to a selected directory', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    const file = treeItemByText('README.md')
    const directory = treeItemByText('src')
    await act(async () => {
      file.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      file.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'c', metaKey: true }))
      directory.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      directory.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'v', metaKey: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(transferRepositoryFiles).toHaveBeenCalledWith({
      repoId: '/repo',
      worktreePath: '/repo',
      targetDirPath: '/repo/src',
      source: { kind: 'fileTreePaths', repoId: '/repo', worktreePath: '/repo', paths: ['/repo/README.md'] },
    })
  })

  test('does not consume primary paste keydown when the internal clipboard is empty', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    const directory = treeItemByText('src')
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'v',
      metaKey: true,
    })
    await act(async () => {
      directory.dispatchEvent(event)
      await Promise.resolve()
    })

    expect(event.defaultPrevented).toBe(false)
    expect(readSystemClipboardFilePaths).not.toHaveBeenCalled()
    expect(transferRepositoryFiles).not.toHaveBeenCalled()
  })

  test('actively reads system clipboard file paths during paste events without browser files', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    const directory = treeItemByText('src')
    await act(async () => {
      directory.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })

    const event = dispatchFileTreePaste(fileTreeRoot())
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(event.defaultPrevented).toBe(true)
    expect(readSystemClipboardFilePaths).toHaveBeenCalledTimes(1)
    expect(transferRepositoryFiles).toHaveBeenCalledWith({
      repoId: '/repo',
      worktreePath: '/repo',
      targetDirPath: '/repo/src',
      source: {
        kind: 'localPaths',
        items: [
          {
            path: '/tmp/report.pdf',
            destinationName: expect.stringMatching(/^report-20\d{6}-\d{6}\.pdf$/),
          },
        ],
      },
    })
  })

  test('falls back to paste event files when system clipboard has no file paths', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })
    readSystemClipboardFilePaths.mockResolvedValue([])

    await render(<ProjectFileTree repoId="/repo" />)

    const file = new File([new Uint8Array([1, 2, 3])], 'image.png', { type: 'image/png' })
    const event = dispatchFileTreePaste(fileTreeRoot(), {
      files: [],
      items: [
        {
          kind: 'file',
          type: 'image/png',
          getAsFile: () => file,
        },
      ],
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(event.defaultPrevented).toBe(true)
    expect(readSystemClipboardFilePaths).toHaveBeenCalledTimes(1)
    expect(transferRepositoryFiles).toHaveBeenCalledWith({
      repoId: '/repo',
      worktreePath: '/repo',
      targetDirPath: '/repo',
      source: {
        kind: 'uploadedItems',
        items: [
          {
            name: expect.stringMatching(/^image-20\d{6}-\d{6}\.png$/),
            mimeType: 'image/png',
            bytesBase64: 'AQID',
            byteLength: 3,
          },
        ],
      },
    })
  })

  test('paste events prefer system clipboard file paths over the internal file tree clipboard', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    const file = treeItemByText('README.md')
    const directory = treeItemByText('src')
    await act(async () => {
      file.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      file.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'c', metaKey: true }))
      directory.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })

    const event = dispatchFileTreePaste(fileTreeRoot())
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(event.defaultPrevented).toBe(true)
    expect(readSystemClipboardFilePaths).toHaveBeenCalledTimes(1)
    expect(transferRepositoryFiles).toHaveBeenCalledWith({
      repoId: '/repo',
      worktreePath: '/repo',
      targetDirPath: '/repo/src',
      source: {
        kind: 'localPaths',
        items: [
          {
            path: '/tmp/report.pdf',
            destinationName: expect.stringMatching(/^report-20\d{6}-\d{6}\.pdf$/),
          },
        ],
      },
    })
  })

  test('paste events fall back to the internal file tree clipboard when system clipboard has no file paths', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })
    readSystemClipboardFilePaths.mockResolvedValue([])

    await render(<ProjectFileTree repoId="/repo" />)

    const file = treeItemByText('README.md')
    const directory = treeItemByText('src')
    await act(async () => {
      file.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      file.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'c', metaKey: true }))
      directory.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })

    const event = dispatchFileTreePaste(fileTreeRoot())
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(event.defaultPrevented).toBe(true)
    expect(readSystemClipboardFilePaths).toHaveBeenCalledTimes(1)
    expect(transferRepositoryFiles).toHaveBeenCalledWith({
      repoId: '/repo',
      worktreePath: '/repo',
      targetDirPath: '/repo/src',
      source: { kind: 'fileTreePaths', repoId: '/repo', worktreePath: '/repo', paths: ['/repo/README.md'] },
    })
  })

  test('drops operating system files onto a directory target', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    const directory = treeItemByText('src')
    const file = new File(['hello'], 'local.txt', { type: 'text/plain' })
    await act(async () => {
      dropFiles(directory, [file])
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(transferRepositoryFiles).toHaveBeenCalledWith({
      repoId: '/repo',
      worktreePath: '/repo',
      targetDirPath: '/repo/src',
      source: { kind: 'localPaths', items: [{ path: '/tmp/local.txt' }] },
    })
  })

  test('drags file nodes with internal paths without text path fallback', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    const file = treeItemByText('README.md')
    const dataTransfer = createDataTransfer()
    const event = await dragStartAndFlush(file, dataTransfer)

    expect(event.defaultPrevented).toBe(false)
    expect(dataTransfer.effectAllowed).toBe('copyMove')
    expect(dataTransfer.getData(GOBLIN_FILE_PATHS_MIME)).toBe(JSON.stringify({ paths: ['/repo/README.md'] }))
    expect(dataTransfer.getData('text/plain')).toBe('')
  })

  test('file tree drag keeps the full selection internally and suppresses text path fallback for file selections', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    const directory = treeItemByText('src')
    const file = treeItemByText('README.md')
    const dataTransfer = createDataTransfer()
    await act(async () => {
      directory.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      file.dispatchEvent(new MouseEvent('click', { bubbles: true, metaKey: true }))
      await Promise.resolve()
    })
    await dragStartAndFlush(file, dataTransfer)

    expect(dataTransfer.getData(GOBLIN_FILE_PATHS_MIME)).toBe(
      JSON.stringify({ paths: ['/repo/src', '/repo/README.md'] }),
    )
    expect(dataTransfer.effectAllowed).toBe('copyMove')
    expect(dataTransfer.getData('text/plain')).toBe('')
  })

  test('keeps text path fallback for directory-only drags', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    const directory = treeItemByText('src')
    const dataTransfer = createDataTransfer()
    const event = await dragStartAndFlush(directory, dataTransfer)

    expect(event.defaultPrevented).toBe(false)
    expect(dataTransfer.effectAllowed).toBe('copyMove')
    expect(dataTransfer.getData(GOBLIN_FILE_PATHS_MIME)).toBe(JSON.stringify({ paths: ['/repo/src'] }))
    expect(dataTransfer.getData('text/plain')).toBe('/repo/src')
  })

  test('moves internally dragged file tree paths onto a directory target', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    const file = treeItemByText('README.md')
    const directory = treeItemByText('src')
    const dataTransfer = createDataTransfer()
    await act(async () => {
      file.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      dragStart(file, dataTransfer)
      dropWithDataTransfer(directory, dataTransfer)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(moveRepositoryFileTreeEntries).toHaveBeenCalledWith('/repo', '/repo', ['/repo/README.md'], '/repo/src')
    expect(transferRepositoryFiles).not.toHaveBeenCalled()
  })

  test('undoes the last internal file tree move with Ctrl+Z', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    const file = treeItemByText('README.md')
    const directory = treeItemByText('src')
    const dataTransfer = createDataTransfer()
    await act(async () => {
      file.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      dragStart(file, dataTransfer)
      dropWithDataTransfer(directory, dataTransfer)
      await Promise.resolve()
      await Promise.resolve()
      directory.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'z', ctrlKey: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(moveRepositoryFileTreeEntries).toHaveBeenNthCalledWith(1, '/repo', '/repo', ['/repo/README.md'], '/repo/src')
    expect(moveRepositoryFileTreeEntries).toHaveBeenNthCalledWith(2, '/repo', '/repo', ['/repo/src/README.md'], '/repo')
  })

  test('does not show paste in a directory context menu', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    const labels = await contextMenuLabels(treeItemByText('src'))

    expect(labels).not.toContain('file-tree.paste')
    expect(labels).toContain('file-tree.new-folder')
    expect(labels).toContain('file-tree.refresh')
  })

  test('does not show paste in a file context menu', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    const labels = await contextMenuLabels(treeItemByText('README.md'))

    expect(labels).not.toContain('file-tree.paste')
    expect(labels).toContain('file-tree.copy-path')
    expect(labels).toContain('file-tree.download')
    expect(labels).toContain('file-tree.rename')
  })

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

  test('does not show paste in the empty file tree context menu', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    const emptyArea = container?.querySelector<HTMLElement>('[data-testid="file-tree-empty-context-target"]')
    if (!emptyArea) throw new Error('missing empty context target')
    const labels = await contextMenuLabels(emptyArea)

    expect(labels).not.toContain('file-tree.paste')
    expect(labels).toContain('file-tree.new-folder')
    expect(labels).toContain('file-tree.refresh')
  })

  test('undoes the last file tree paste with Ctrl+Z', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    const directory = treeItemByText('src')
    await act(async () => {
      directory.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })
    await act(async () => {
      dispatchFileTreePaste(fileTreeRoot())
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(transferRepositoryFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        targetDirPath: '/repo/src',
      }),
    )

    await act(async () => {
      directory.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'z', ctrlKey: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(deleteRepositoryFileTreeEntries).toHaveBeenCalledWith('/repo', '/repo', ['/repo/docs/README.md'])
  })

  test('creates a folder from a directory context menu and refreshes that directory', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    await clickContextMenuItem(treeItemByText('src'), 'file-tree.new-folder')

    const input = container?.querySelector<HTMLInputElement>('input[aria-label="file-tree.new-folder-input-label"]')
    if (!input) throw new Error('missing new folder input')

    await act(async () => {
      input.value = 'components'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(createRepositoryFileTreeDirectory).toHaveBeenCalledWith('/repo', '/repo', '/repo/src', 'components')
    expect(getRepositoryFileTree).toHaveBeenCalledWith('/repo', '/repo', '/repo/src', undefined)
  })

  test('refreshes the worktree root from the file tree toolbar', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)
    getRepositoryFileTree.mockClear()

    const refreshButton = container?.querySelector<HTMLButtonElement>('button[aria-label="file-tree.refresh"]')
    if (!refreshButton) throw new Error('missing refresh button')

    await act(async () => {
      refreshButton.click()
      await Promise.resolve()
    })

    expect(getRepositoryFileTree).toHaveBeenCalledWith('/repo', '/repo', '/repo', undefined)
  })

  test('uses the same action bar chrome as the changes panel toolbar', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    const toolbar = fileTreeToolbar()

    expect(toolbar.className).toContain('min-h-8')
    expect(toolbar.className).toContain('justify-end')
    expect(toolbar.className).toContain('border-toolbar-border')
    expect(toolbar.className).toContain('bg-toolbar')
    expect(toolbar.className).toContain('px-2')
  })

  test('uses terminal-height toolbar chrome when requested by a plain workspace pane', async () => {
    seedPlainWorkspace()

    await render(<ProjectFileTree repoId="/repo" toolbarHeight="detail" />)

    const toolbar = fileTreeToolbar()

    expect(toolbar.className).toContain('h-9')
    expect(toolbar.className).not.toContain('min-h-8')
    expect(toolbar.className).toContain('border-toolbar-border')
    expect(toolbar.className).toContain('bg-toolbar')
  })

  test('shows rename and delete actions for real context nodes', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    const row = treeItemByText('README.md')
    await act(async () => {
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }))
      await Promise.resolve()
    })

    expect(document.body.textContent).toContain('file-tree.rename')
    expect(document.body.textContent).toContain('file-tree.delete')
  })

  test('renders a prefix icon for each row context menu item', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    const row = treeItemByText('README.md')
    await act(async () => {
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }))
      await Promise.resolve()
    })

    const items = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    expect(items.length).toBeGreaterThan(0)
    for (const item of items) {
      expect(item.firstElementChild?.tagName.toLowerCase()).toBe('svg')
    }
  })

  test('opens a local file tree node in Finder from the context menu', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    const row = treeItemByText('README.md')
    await act(async () => {
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }))
      await Promise.resolve()
    })

    const revealItem = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) =>
      item.textContent?.includes('worktrees.reveal-title'),
    )
    if (!revealItem) throw new Error('missing Finder menu item')

    await act(async () => {
      revealItem.click()
      await Promise.resolve()
    })

    expect(openInFinder).toHaveBeenCalledWith('/repo/README.md')
  })

  test('opens the selected local file parent directory in the editor from the context menu', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    const row = treeItemByText('README.md')
    await act(async () => {
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }))
      await Promise.resolve()
    })

    const openEditorItem = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) =>
      item.textContent?.includes('file-tree.open-editor'),
    )
    if (!openEditorItem) throw new Error('missing editor menu item')

    await act(async () => {
      openEditorItem.click()
      await Promise.resolve()
    })

    expect(openRepositoryEditor).toHaveBeenCalledWith('/repo')
  })

  test('opens the selected local directory in the editor from the context menu', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    const row = treeItemByText('src')
    await act(async () => {
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }))
      await Promise.resolve()
    })

    const openEditorItem = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) =>
      item.textContent?.includes('file-tree.open-editor'),
    )
    if (!openEditorItem) throw new Error('missing editor menu item')

    await act(async () => {
      openEditorItem.click()
      await Promise.resolve()
    })

    expect(openRepositoryEditor).toHaveBeenCalledWith('/repo/src')
  })

  test('does not show Finder action for remote file tree nodes', async () => {
    seedRepoWithSelectedBranch({ repoId: 'ssh-config://prod/repo', hasWorktree: true })

    await render(<ProjectFileTree repoId="ssh-config://prod/repo" />)

    const row = treeItemByText('README.md')
    await act(async () => {
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }))
      await Promise.resolve()
    })

    expect(document.body.textContent).not.toContain('worktrees.reveal-title')
  })

  test('starts rename from Enter and submits the new basename', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    const row = treeItemByText('README.md')
    await act(async () => {
      row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      row.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }))
      await Promise.resolve()
    })

    const input = container?.querySelector<HTMLInputElement>('input[aria-label="file-tree.rename-input-label"]')
    if (!input) throw new Error('missing rename input')

    await act(async () => {
      input.value = 'README-renamed.md'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(renameRepositoryFileTreeEntry).toHaveBeenCalledWith('/repo', '/repo', '/repo/README.md', 'README-renamed.md')
  })

  test('undoes the last file tree rename with Ctrl+Z', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    const row = treeItemByText('README.md')
    await act(async () => {
      row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      row.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }))
      await Promise.resolve()
    })

    const input = container?.querySelector<HTMLInputElement>('input[aria-label="file-tree.rename-input-label"]')
    if (!input) throw new Error('missing rename input')

    await act(async () => {
      input.value = 'README-renamed.md'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }))
      await Promise.resolve()
      await Promise.resolve()
      row.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'z', ctrlKey: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(renameRepositoryFileTreeEntry).toHaveBeenNthCalledWith(
      1,
      '/repo',
      '/repo',
      '/repo/README.md',
      'README-renamed.md',
    )
    expect(renameRepositoryFileTreeEntry).toHaveBeenNthCalledWith(
      2,
      '/repo',
      '/repo',
      '/repo/README-renamed.md',
      'README.md',
    )
  })

  test('confirms delete before sending selected paths', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    const row = treeItemByText('README.md')
    await act(async () => {
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }))
      await Promise.resolve()
    })

    const deleteItem = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) =>
      item.textContent?.includes('file-tree.delete'),
    )
    if (!deleteItem) throw new Error('missing delete menu item')

    await act(async () => {
      deleteItem.click()
      await Promise.resolve()
    })

    const confirm = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('file-tree.delete-confirm-confirm'),
    )
    if (!confirm) throw new Error('missing delete confirm button')

    await act(async () => {
      confirm.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(deleteRepositoryFileTreeEntries).toHaveBeenCalledWith('/repo', '/repo', ['/repo/README.md'])
  })
})

function seedRepoWithSelectedBranch(options: { repoId?: string; hasWorktree: boolean }) {
  const repoId = options.repoId ?? '/repo'
  const repo = emptyRepo(repoId, 'repo')
  repo.data.branches = [createRepoBranch('main', options.hasWorktree ? { worktree: { path: '/repo' } } : {})]
  repo.data.currentBranch = 'main'
  repo.data.status = []
  repo.data.statusLoaded = true
  repo.ui.selectedBranch = 'main'
  useReposStore.setState({
    repos: { [repoId]: repo },
    activeId: repoId,
    order: [repoId],
    sessionReady: true,
  })
}

function seedPlainWorkspace(options: { repoId?: string; remotePath?: string } = {}) {
  const repoId = options.repoId ?? '/repo'
  const repo = emptyRepo(repoId, 'repo')
  repo.isGitRepo = false
  if (options.remotePath) {
    repo.remote.target = {
      id: repoId,
      alias: 'prod',
      host: 'example.com',
      user: 'alice',
      port: 22,
      remotePath: options.remotePath,
      displayName: 'prod:plain',
    }
  }
  useReposStore.setState({
    repos: { [repoId]: repo },
    activeId: repoId,
    order: [repoId],
    sessionReady: true,
  })
}

async function render(element: React.ReactNode) {
  await act(async () => {
    root!.render(element)
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

function treeItemByText(text: string): HTMLElement {
  const row = [...(container?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [])].find((item) =>
    item.textContent?.includes(text),
  )
  if (!row) throw new Error(`Missing tree item: ${text}`)
  return row
}

function fileTreeRoot(): HTMLElement {
  const root = container?.querySelector<HTMLElement>('[data-repo-id="/repo"]')
  if (!root) throw new Error('missing file tree root')
  return root
}

function fileTreeToolbar(): HTMLElement {
  const refreshButton = container?.querySelector<HTMLButtonElement>('button[aria-label="file-tree.refresh"]')
  const toolbar = refreshButton?.closest<HTMLElement>('.bg-toolbar')
  if (!toolbar) throw new Error('missing file tree toolbar')
  return toolbar
}

function dispatchFileTreePaste(
  target: HTMLElement,
  clipboardData: {
    files?: File[]
    items?: Array<Pick<DataTransferItem, 'kind' | 'type' | 'getAsFile'>>
  } = {},
): ClipboardEvent {
  const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
  Object.defineProperty(event, 'clipboardData', {
    value: {
      files: clipboardData.files ?? [],
      items: clipboardData.items ?? [],
      getData: () => '',
    },
  })
  target.dispatchEvent(event)
  return event
}

function dropFiles(target: HTMLElement, files: File[]) {
  const event = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      files,
      types: ['Files'],
      dropEffect: 'copy',
    },
  })
  target.dispatchEvent(event)
}

function createDataTransfer(): DataTransfer {
  const values = new Map<string, string>()
  const dataTransfer = {
    files: [],
    get types() {
      return Array.from(values.keys())
    },
    dropEffect: 'none',
    effectAllowed: 'none',
    setData(type: string, value: string) {
      values.set(type, value)
    },
    getData(type: string) {
      return values.get(type) ?? ''
    },
  }
  return dataTransfer as unknown as DataTransfer
}

function dragStart(target: HTMLElement, dataTransfer: DataTransfer, options: { altKey?: boolean } = {}) {
  const event = new MouseEvent('dragstart', {
    bubbles: true,
    cancelable: true,
    altKey: options.altKey ?? false,
  }) as DragEvent
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer })
  target.dispatchEvent(event)
  return event
}

async function dragStartAndFlush(
  target: HTMLElement,
  dataTransfer: DataTransfer,
  options: { altKey?: boolean } = {},
): Promise<DragEvent> {
  let event: DragEvent | undefined
  await act(async () => {
    event = dragStart(target, dataTransfer, options)
    await Promise.resolve()
  })
  if (!event) throw new Error('missing dragstart event')
  return event
}

function dropWithDataTransfer(target: HTMLElement, dataTransfer: DataTransfer) {
  const event = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer })
  target.dispatchEvent(event)
}

async function contextMenuLabels(row: HTMLElement): Promise<string[]> {
  await act(async () => {
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }))
    await Promise.resolve()
  })
  return [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    .map((candidate) => candidate.textContent?.trim() ?? '')
    .filter((label) => label.length > 0)
}

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
