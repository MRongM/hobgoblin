// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ProjectFileTree } from '#/web/components/file-tree/ProjectFileTree.tsx'
import { writeInternalFileTreeClipboard } from '#/web/components/file-tree/clipboard.ts'
import { emptyRepo } from '#/web/stores/repos/helpers.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { createRepoBranch, resetReposStore } from '#/web/stores/repos/test-utils.ts'

type GetRepositoryFileTreeArgs = [repoId: string, worktreePath: string, dirPath: string, signal?: AbortSignal]

const getRepositoryFileTree = vi.fn(async (_repoId: string, _worktreePath: string, dirPath: string, _signal?: AbortSignal) => ({
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
}))
const transferRepositoryFiles = vi.fn(async (_input: unknown) => ({
  ok: true as const,
  copied: [{ destinationPath: '/repo/docs/README.md', kind: 'file' as const }],
  renamed: [],
  failed: [],
}))
const renameRepositoryFileTreeEntry = vi.fn(async (..._args: unknown[]) => ({ ok: true as const, message: '' }))
const deleteRepositoryFileTreeEntries = vi.fn(async (..._args: unknown[]) => ({ ok: true as const, message: '' }))
const openRepositoryEditor = vi.fn(async (_path: string) => ({ ok: true as const, message: '' }))
const openRepositoryTerminal = vi.fn(async (_path: string) => ({ ok: true as const, message: '' }))
const openInFinder = vi.fn(async (_path: string) => ({ ok: true as const, message: '' }))
const readSystemClipboardFilePaths = vi.fn(async () => ['/tmp/report.pdf'])

vi.mock('#/web/repo-client.ts', () => ({
  getRepositoryFileTree: (...args: GetRepositoryFileTreeArgs) => getRepositoryFileTree(...args),
  renameRepositoryFileTreeEntry: (...args: unknown[]) => renameRepositoryFileTreeEntry(...args),
  deleteRepositoryFileTreeEntries: (...args: unknown[]) => deleteRepositoryFileTreeEntries(...args),
  openRepositoryEditor: (path: string) => openRepositoryEditor(path),
  openRepositoryTerminal: (path: string) => openRepositoryTerminal(path),
  transferRepositoryFiles: (input: unknown) => transferRepositoryFiles(input),
}))

vi.mock('#/web/app-shell-client.ts', () => ({
  pathForDroppedFile: (file: File) => `/tmp/${file.name}`,
  openInFinder: (path: string) => openInFinder(path),
  readSystemClipboardFilePaths: () => readSystemClipboardFilePaths(),
}))

vi.mock('#/web/remote-client.ts', () => ({
  openRemoteRepositoryEditor: vi.fn(async () => ({ ok: true, message: '' })),
  openRemoteRepositoryTerminal: vi.fn(async () => ({ ok: true, message: '' })),
}))

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  getRepositoryFileTree.mockClear()
  transferRepositoryFiles.mockClear()
  renameRepositoryFileTreeEntry.mockClear()
  deleteRepositoryFileTreeEntries.mockClear()
  openRepositoryEditor.mockClear()
  openRepositoryTerminal.mockClear()
  openInFinder.mockClear()
  readSystemClipboardFilePaths.mockClear()
  readSystemClipboardFilePaths.mockResolvedValue(['/tmp/report.pdf'])
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
      row.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: 140,
        clientY: 90,
      }))
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

    expect(renameRepositoryFileTreeEntry).toHaveBeenCalledWith(
      '/repo',
      '/repo',
      '/repo/README.md',
      'README-renamed.md',
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
  repo.data.branches = [
    createRepoBranch('main', options.hasWorktree ? { worktree: { path: '/repo' } } : {}),
  ]
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
