// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ProjectStatusPanel } from '#/web/components/repo-workspace/ProjectStatusPanel.tsx'
import { createRepoBranch, resetReposStore, seedRepoState } from '#/web/stores/repos/test-utils.ts'

const REPO_ID = '/tmp/gbl-project-status-repo'
const WORKTREE_PATH = '/tmp/gbl-project-status-repo'

vi.mock('#/web/stores/i18n.ts', async () => {
  const actual = await vi.importActual<typeof import('#/web/stores/i18n.ts')>('#/web/stores/i18n.ts')
  return { ...actual, useT: () => (key: string) => key }
})

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

describe('ProjectStatusPanel', () => {
  test('renders selected branch status in the explorer surface', async () => {
    seedRepoState({
      id: REPO_ID,
      name: 'Status Project',
      branches: [
        createRepoBranch('feature/worktree', {
          lastCommitHash: 'abcdef1234567890',
          lastCommitMessage: 'feat: expose commit metadata',
          lastCommitAuthor: 'Test Author',
          lastCommitDate: '2026-06-26T09:30:00.000Z',
          createdFrom: 'develop',
          worktree: { path: WORKTREE_PATH },
        }),
      ],
      selectedBranch: 'feature/worktree',
      statusLoaded: true,
      status: [{ path: WORKTREE_PATH, branch: 'feature/worktree', isMain: true, entries: [] }],
    })

    await act(async () => {
      root!.render(<ProjectStatusPanel repoId={REPO_ID} />)
    })

    expect(container?.textContent).toContain('feature/worktree')
    expect(container?.textContent).toContain('Status Project')
    expect(container?.textContent).toContain('branch-status.signal.project')
    expect(container?.textContent).toContain(WORKTREE_PATH)
    expect(container?.textContent).toContain('branch-status.signal.branch')
    expect(container?.textContent).toContain('branch-status.signal.worktree')
    expect(container?.textContent).toContain('branch-status.signal.commit-hash')
    expect(container?.textContent).toContain('abcdef1234567890')
    expect(container?.textContent).toContain('branch-status.signal.commit-message')
    expect(container?.textContent).toContain('feat: expose commit metadata')
    expect(container?.textContent).toContain('branch-status.signal.commit-author')
    expect(container?.textContent).toContain('Test Author')
    expect(container?.textContent).toContain('branch-status.signal.commit-time')
    expect(container?.textContent).toContain('branch-status.signal.created-from')
    expect(container?.textContent).toContain('develop')
    expect(container?.textContent).toContain('2026')
    const statusRows = container?.querySelector<HTMLElement>('[role="list"]')
    const statusRowLabels = Array.from(
      statusRows?.querySelectorAll('[role="listitem"]') ?? [],
      (row) => row.children.item(1)?.textContent,
    )
    expect(statusRowLabels.slice(0, 5)).toEqual([
      'branch-status.signal.folder',
      'branch-status.signal.project',
      'branch-status.signal.branch',
      'branch-status.signal.created-from',
      'branch-status.signal.worktree',
    ])
    const statusToolbar = container?.querySelector<HTMLElement>('[data-testid="project-status-toolbar"]')
    expect(statusToolbar?.classList.contains('border-b')).toBe(false)
    expect(statusToolbar?.classList.contains('border-toolbar-border')).toBe(false)
    expect(statusRows?.className).not.toContain('divide-y')
    expect(statusRows?.className).not.toContain('border-b')
    const copyAllButton = container?.querySelector<HTMLButtonElement>('button[aria-label="branch-status.copy-all"]')
    expect(
      container?.querySelector('[data-testid="project-status-left-actions"]')?.contains(copyAllButton ?? null),
    ).toBe(true)
    expect(copyAllButton?.textContent).toBe('')
    expect(container?.querySelectorAll('button[aria-label^="branch-status.copy-"]')).toHaveLength(1)
    for (const label of [
      'branch-status.copy-folder-name',
      'branch-status.copy-project-name',
      'branch-status.copy-branch-name',
      'branch-status.copy-worktree-path',
      'branch-status.copy-commit-hash',
      'branch-status.copy-commit-message',
      'branch-status.copy-commit-author',
      'branch-status.copy-commit-time',
    ]) {
      expect(container?.querySelector(`button[aria-label="${label}"]`)).toBeNull()
    }
    expect(writeText).not.toHaveBeenCalled()

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('button[aria-label="branch-status.copy-all"]')?.click()
    })

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith(
      [
        'branch-status.signal.folder: gbl-project-status-repo',
        'branch-status.signal.project: Status Project',
        'branch-status.signal.branch: feature/worktree',
        'branch-status.signal.created-from: develop',
        `branch-status.signal.worktree: ${WORKTREE_PATH}`,
        'branch-status.signal.upstream: branches.no-upstream',
        'branch-status.signal.sync: branches.no-upstream',
        'branch-status.signal.commit-hash: abcdef1234567890',
        'branch-status.signal.commit-message: feat: expose commit metadata',
        'branch-status.signal.commit-author: Test Author',
        'branch-status.signal.commit-time: 2026-06-26T09:30:00.000Z',
      ].join('\n'),
    )
  })

  test('renders unknown when a non-default branch has no recorded creation source', async () => {
    seedRepoState({
      id: REPO_ID,
      name: 'Status Project',
      branches: [createRepoBranch('feature/legacy')],
      selectedBranch: 'feature/legacy',
      statusLoaded: true,
    })

    await act(async () => {
      root!.render(<ProjectStatusPanel repoId={REPO_ID} />)
    })

    expect(container?.textContent).toContain('branch-status.signal.created-from')
    expect(container?.textContent).toContain('branch-status.created-from-unknown')
  })

  test('omits the creation source row for the default branch', async () => {
    seedRepoState({
      id: REPO_ID,
      name: 'Status Project',
      branches: [createRepoBranch('main', { isDefault: true, createdFrom: 'develop' })],
      selectedBranch: 'main',
      statusLoaded: true,
    })

    await act(async () => {
      root!.render(<ProjectStatusPanel repoId={REPO_ID} />)
    })

    expect(container?.textContent).not.toContain('branch-status.signal.created-from')
  })
})
