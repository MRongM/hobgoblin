// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ProjectChangesPanel } from '#/web/components/repo-workspace/ProjectChangesPanel.tsx'
import { createRepoBranch, resetReposStore, seedRepoState } from '#/web/stores/repos/test-utils.ts'
import { InlineCommitDraftProvider } from '#/web/components/branch-list/InlineCommitDraftProvider.tsx'
import { useReposStore } from '#/web/stores/repos/store.ts'

const REPO_ID = '/tmp/gbl-project-changes-repo'
const WORKTREE_PATH = '/tmp/gbl-project-changes-repo'

const mocks = vi.hoisted(() => ({
  useRuntimeExternalAppSettings: vi.fn(),
}))

const repoClientMocks = vi.hoisted(() => ({
  discardRepositoryChanges: vi.fn(),
  getCommitMessageProviders: vi.fn(),
  generateRepositoryCommitMessage: vi.fn(),
}))

vi.mock('#/web/runtime-settings-external-apps.ts', () => ({
  useRuntimeExternalAppSettings: mocks.useRuntimeExternalAppSettings,
}))
vi.mock('#/web/repo-client.ts', async () => {
  const actual = await vi.importActual<typeof import('#/web/repo-client.ts')>('#/web/repo-client.ts')
  return {
    ...actual,
    discardRepositoryChanges: repoClientMocks.discardRepositoryChanges,
    getCommitMessageProviders: repoClientMocks.getCommitMessageProviders,
    generateRepositoryCommitMessage: repoClientMocks.generateRepositoryCommitMessage,
  }
})

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))

let container: HTMLDivElement | null = null
let root: Root | null = null
let writeText: ReturnType<typeof vi.fn>
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
const originalResizeObserver = globalThis.ResizeObserver

class MockResizeObserver implements ResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: MockResizeObserver,
  })
  writeText = vi.fn(() => Promise.resolve())
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  resetReposStore()
  mocks.useRuntimeExternalAppSettings.mockReturnValue({
    terminalApp: 'auto',
    resolvedTerminalApp: null,
    terminalAvailable: false,
    editorApp: 'vscode',
    resolvedEditorApp: 'vscode',
    editorAvailable: false,
  })
  repoClientMocks.getCommitMessageProviders.mockResolvedValue({ codex: false, claude: false })
  repoClientMocks.generateRepositoryCommitMessage.mockResolvedValue({ ok: true, message: 'feat: generated message' })
  repoClientMocks.discardRepositoryChanges.mockResolvedValue({ ok: true, message: '' })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  container?.remove()
  root = null
  container = null
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: originalResizeObserver,
  })
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

function changeSelectionToggle(): HTMLButtonElement {
  const toggle = container?.querySelector<HTMLButtonElement>('button[aria-label="changes.selection-toggle-title"]')
  expect(toggle).toBeTruthy()
  return toggle!
}

async function enableChangeSelection(): Promise<void> {
  await act(async () => {
    changeSelectionToggle().click()
  })
}

describe('ProjectChangesPanel', () => {
  test('renders selected worktree changes with typed status markers without a commit entry', async () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('feature/worktree', { worktree: { path: WORKTREE_PATH } })],
      selectedBranch: 'feature/worktree',
      statusLoaded: true,
      status: [
        {
          path: WORKTREE_PATH,
          branch: 'feature/worktree',
          isMain: true,
          entries: [
            { x: '?', y: '?', path: 'src/new.ts' },
            { x: 'D', y: ' ', path: 'src/deleted.ts' },
            { x: 'M', y: ' ', path: 'src/modified.ts' },
          ],
        },
      ],
    })

    await act(async () => {
      root!.render(
        <InlineCommitDraftProvider>
          <ProjectChangesPanel repoId={REPO_ID} />
        </InlineCommitDraftProvider>,
      )
    })

    const newMarker = container?.querySelector('[aria-label="N new"]')
    const deletedMarker = container?.querySelector('[aria-label="D deleted"]')
    const modifiedMarker = container?.querySelector('[aria-label="M modified"]')

    expect(newMarker?.textContent).toBe('N')
    expect(newMarker?.className).toContain('text-success')
    expect(deletedMarker?.textContent).toBe('D')
    expect(deletedMarker?.className).toContain('text-danger')
    expect(modifiedMarker?.textContent).toBe('M')
    expect(modifiedMarker?.className).toContain('text-warning')
    expect(container?.textContent).toContain('modified.ts')
    expect(container?.querySelector('button[aria-label="action.commit-title"]')).toBeNull()
    expect(container?.textContent).not.toContain('action.merge')
  })

  test('notifies when a changed file is clicked', async () => {
    const onRevealPath = vi.fn()
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('feature/worktree', { worktree: { path: WORKTREE_PATH } })],
      selectedBranch: 'feature/worktree',
      statusLoaded: true,
      status: [
        {
          path: WORKTREE_PATH,
          branch: 'feature/worktree',
          isMain: true,
          entries: [{ x: 'M', y: ' ', path: 'src/app.ts' }],
        },
      ],
    })

    await act(async () => {
      root!.render(
        <InlineCommitDraftProvider>
          <ProjectChangesPanel repoId={REPO_ID} onRevealPath={onRevealPath} />
        </InlineCommitDraftProvider>,
      )
    })

    const pathButton = container?.querySelector<HTMLButtonElement>('button[aria-label="src/app.ts"]')
    expect(pathButton).toBeTruthy()
    expect(pathButton?.className).toContain('underline')

    await act(async () => {
      pathButton?.click()
    })

    expect(onRevealPath).toHaveBeenCalledWith('src/app.ts')
  })

  test('refresh icon refreshes only selected repository status', async () => {
    const refreshStatus = vi.fn(async () => undefined)
    const syncAndRefresh = vi.fn(async () => undefined)
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('feature/worktree', { worktree: { path: WORKTREE_PATH } })],
      selectedBranch: 'feature/worktree',
      statusLoaded: true,
      status: [
        {
          path: WORKTREE_PATH,
          branch: 'feature/worktree',
          isMain: true,
          entries: [{ x: 'M', y: ' ', path: 'src/app.ts' }],
        },
      ],
    })
    useReposStore.setState({ refreshStatus, syncAndRefresh } as Partial<ReturnType<typeof useReposStore.getState>>)
    const token = useReposStore.getState().repos[REPO_ID]!.instanceToken

    await act(async () => {
      root!.render(
        <InlineCommitDraftProvider>
          <ProjectChangesPanel repoId={REPO_ID} />
        </InlineCommitDraftProvider>,
      )
    })

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('button[aria-label="changes.refresh"]')?.click()
      await Promise.resolve()
    })

    expect(refreshStatus).toHaveBeenCalledWith(REPO_ID, { token })
    expect(syncAndRefresh).not.toHaveBeenCalled()
  })

  test('defaults changed files to a folder hierarchy and keeps reveal clicks', async () => {
    const onRevealPath = vi.fn()
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('feature/worktree', { worktree: { path: WORKTREE_PATH } })],
      selectedBranch: 'feature/worktree',
      statusLoaded: true,
      status: [
        {
          path: WORKTREE_PATH,
          branch: 'feature/worktree',
          isMain: true,
          entries: [
            { x: 'M', y: ' ', path: 'src/app.ts' },
            { x: '?', y: '?', path: 'src/components/Button.tsx' },
            { x: 'D', y: ' ', path: 'README.md' },
          ],
        },
      ],
    })

    await act(async () => {
      root!.render(
        <InlineCommitDraftProvider>
          <ProjectChangesPanel repoId={REPO_ID} onRevealPath={onRevealPath} />
        </InlineCommitDraftProvider>,
      )
    })

    expect(container?.querySelector('[data-file-folder-path="src"]')).toBeTruthy()
    expect(container?.querySelector('[data-file-folder-path="src/components"]')).toBeTruthy()
    expect(container?.textContent).toContain('Button.tsx')
    expect(
      container?.querySelector('[data-testid="project-changes-action-bar"] button[aria-label="file-list.view-list"]'),
    ).toBeTruthy()
    expect(
      container?.querySelector('[data-testid="project-changes-action-bar"] button[aria-label="file-list.view-tree"]'),
    ).toBeTruthy()

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('button[aria-label="src/components/Button.tsx"]')?.click()
    })

    expect(onRevealPath).toHaveBeenCalledWith('src/components/Button.tsx')
  })

  test('copies changed file paths from the action bar after the tree view toggle', async () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('feature/worktree', { worktree: { path: WORKTREE_PATH } })],
      selectedBranch: 'feature/worktree',
      statusLoaded: true,
      status: [
        {
          path: WORKTREE_PATH,
          branch: 'feature/worktree',
          isMain: true,
          entries: [
            { x: 'M', y: ' ', path: 'src/app.ts' },
            { x: '?', y: '?', path: 'src/components/Button.tsx' },
            { x: 'D', y: ' ', path: 'README.md' },
          ],
        },
      ],
    })

    await act(async () => {
      root!.render(
        <InlineCommitDraftProvider>
          <ProjectChangesPanel repoId={REPO_ID} />
        </InlineCommitDraftProvider>,
      )
    })

    const actionBar = container?.querySelector('[data-testid="project-changes-action-bar"]')
    const treeViewButton = actionBar?.querySelector<HTMLButtonElement>('button[aria-label="file-list.view-tree"]')
    const copyFilePaths = actionBar?.querySelector<HTMLButtonElement>('button[aria-label="history.copy-file-paths"]')
    expect(treeViewButton).toBeTruthy()
    expect(copyFilePaths).toBeTruthy()
    expect(treeViewButton!.compareDocumentPosition(copyFilePaths!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await act(async () => {
      copyFilePaths?.click()
    })
    await act(async () => {})

    expect(writeText).toHaveBeenCalledWith('src/app.ts\nsrc/components/Button.tsx\nREADME.md')
  })

  test('orders change toolbar actions and omits the commit entry', async () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('feature/worktree', { worktree: { path: WORKTREE_PATH } })],
      selectedBranch: 'feature/worktree',
      statusLoaded: true,
      status: [
        {
          path: WORKTREE_PATH,
          branch: 'feature/worktree',
          isMain: true,
          entries: [
            { x: 'M', y: ' ', path: 'src/app.ts' },
            { x: '?', y: '?', path: 'src/components/Button.tsx' },
          ],
        },
      ],
    })

    await act(async () => {
      root!.render(
        <InlineCommitDraftProvider>
          <ProjectChangesPanel repoId={REPO_ID} />
        </InlineCommitDraftProvider>,
      )
    })

    const actionBar = container?.querySelector('[data-testid="project-changes-action-bar"]')
    const leftActions = actionBar?.querySelector('[data-testid="project-changes-left-actions"]')
    const listView = actionBar?.querySelector<HTMLButtonElement>('button[aria-label="file-list.view-list"]')
    const treeView = actionBar?.querySelector<HTMLButtonElement>('button[aria-label="file-list.view-tree"]')
    const copy = actionBar?.querySelector<HTMLButtonElement>('button[aria-label="history.copy-file-paths"]')
    const refresh = actionBar?.querySelector<HTMLButtonElement>('button[aria-label="changes.refresh"]')
    const selection = actionBar?.querySelector<HTMLButtonElement>('button[aria-label="changes.selection-toggle-title"]')
    const commit = actionBar?.querySelector<HTMLButtonElement>('button[aria-label="action.commit-title"]')

    expect(leftActions).toBeTruthy()
    for (const control of [listView, treeView, copy, refresh, selection]) {
      expect(control).toBeTruthy()
      expect(leftActions!.contains(control!)).toBe(true)
    }
    expect(commit).toBeNull()
    expect(listView!.compareDocumentPosition(treeView!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(treeView!.compareDocumentPosition(copy!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(copy!.compareDocumentPosition(refresh!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(refresh!.compareDocumentPosition(selection!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(actionBar?.textContent).not.toContain('changes.selection-toggle')
  })

  test('hides selection controls by default and shows them from the pre-commit toggle', async () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('feature/worktree', { worktree: { path: WORKTREE_PATH } })],
      selectedBranch: 'feature/worktree',
      statusLoaded: true,
      status: [
        {
          path: WORKTREE_PATH,
          branch: 'feature/worktree',
          isMain: true,
          entries: [
            { x: 'M', y: ' ', path: 'src/app.ts' },
            { x: '?', y: '?', path: 'src/components/Button.tsx' },
          ],
        },
      ],
    })

    await act(async () => {
      root!.render(
        <InlineCommitDraftProvider>
          <ProjectChangesPanel repoId={REPO_ID} />
        </InlineCommitDraftProvider>,
      )
    })

    const actionBar = container?.querySelector('[data-testid="project-changes-action-bar"]')
    const toggle = changeSelectionToggle()
    expect(actionBar?.querySelector<HTMLButtonElement>('button[aria-label="action.commit-title"]')).toBeNull()
    expect(container?.querySelector('button[aria-label="changes.select-file:src/app.ts"]')).toBeNull()
    expect(container?.querySelector('button[aria-label="changes.select-folder:src"]')).toBeNull()
    expect(container?.textContent).not.toContain('changes.selected-count')

    await enableChangeSelection()

    expect(container?.querySelector('button[aria-label="changes.select-file:src/app.ts"]')).toBeTruthy()
    expect(container?.querySelector('button[aria-label="changes.select-folder:src"]')).toBeTruthy()
  })

  test('discards a selected changed file after confirmation and clears selection on success', async () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('feature/worktree', { worktree: { path: WORKTREE_PATH } })],
      selectedBranch: 'feature/worktree',
      statusLoaded: true,
      status: [
        {
          path: WORKTREE_PATH,
          branch: 'feature/worktree',
          isMain: true,
          entries: [{ x: 'M', y: ' ', path: 'src/app.ts' }],
        },
      ],
    })

    await act(async () => {
      root!.render(
        <InlineCommitDraftProvider>
          <ProjectChangesPanel repoId={REPO_ID} />
        </InlineCommitDraftProvider>,
      )
    })

    await enableChangeSelection()
    await act(async () => {
      container?.querySelector<HTMLButtonElement>('button[aria-label="changes.select-file:src/app.ts"]')?.click()
    })

    expect(container?.textContent).toContain('changes.selected-count')
    await act(async () => {
      container?.querySelector<HTMLButtonElement>('button[aria-label="changes.discard-selected"]')?.click()
    })
    expect(document.body.textContent).toContain('changes.discard-confirm-file-title')

    await act(async () => {
      Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'))
        .find((button) => button.textContent?.includes('changes.discard-confirm-confirm'))
        ?.click()
    })

    expect(repoClientMocks.discardRepositoryChanges).toHaveBeenCalledWith(REPO_ID, WORKTREE_PATH, ['src/app.ts'])
    expect(container?.textContent).not.toContain('changes.selected-count')
  })

  test('discards a selected changed folder as one pathspec target', async () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('feature/worktree', { worktree: { path: WORKTREE_PATH } })],
      selectedBranch: 'feature/worktree',
      statusLoaded: true,
      status: [
        {
          path: WORKTREE_PATH,
          branch: 'feature/worktree',
          isMain: true,
          entries: [
            { x: 'M', y: ' ', path: 'src/app.ts' },
            { x: '?', y: '?', path: 'src/components/Button.tsx' },
            { x: 'D', y: ' ', path: 'README.md' },
          ],
        },
      ],
    })

    await act(async () => {
      root!.render(
        <InlineCommitDraftProvider>
          <ProjectChangesPanel repoId={REPO_ID} />
        </InlineCommitDraftProvider>,
      )
    })

    await enableChangeSelection()
    await act(async () => {
      container?.querySelector<HTMLButtonElement>('button[aria-label="changes.select-folder:src"]')?.click()
    })

    expect(container?.textContent).toContain('changes.selected-count')
    await act(async () => {
      container?.querySelector<HTMLButtonElement>('button[aria-label="changes.discard-selected"]')?.click()
    })
    expect(document.body.textContent).toContain('changes.discard-confirm-folder-title')
    await act(async () => {
      Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'))
        .find((button) => button.textContent?.includes('changes.discard-confirm-confirm'))
        ?.click()
    })

    expect(repoClientMocks.discardRepositoryChanges).toHaveBeenCalledWith(REPO_ID, WORKTREE_PATH, ['src'])
  })

  test('keeps selected paths when discard fails', async () => {
    repoClientMocks.discardRepositoryChanges.mockResolvedValueOnce({ ok: false, message: 'fatal: clean failed' })
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('feature/worktree', { worktree: { path: WORKTREE_PATH } })],
      selectedBranch: 'feature/worktree',
      statusLoaded: true,
      status: [
        {
          path: WORKTREE_PATH,
          branch: 'feature/worktree',
          isMain: true,
          entries: [{ x: 'M', y: ' ', path: 'src/app.ts' }],
        },
      ],
    })

    await act(async () => {
      root!.render(
        <InlineCommitDraftProvider>
          <ProjectChangesPanel repoId={REPO_ID} />
        </InlineCommitDraftProvider>,
      )
    })

    await enableChangeSelection()
    await act(async () => {
      container?.querySelector<HTMLButtonElement>('button[aria-label="changes.select-file:src/app.ts"]')?.click()
    })
    await act(async () => {
      container?.querySelector<HTMLButtonElement>('button[aria-label="changes.discard-selected"]')?.click()
    })
    await act(async () => {
      Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'))
        .find((button) => button.textContent?.includes('changes.discard-confirm-confirm'))
        ?.click()
    })

    expect(container?.textContent).toContain('changes.selected-count')
  })
})
