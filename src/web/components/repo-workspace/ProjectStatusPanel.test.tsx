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
      branches: [
        createRepoBranch('feature/worktree', {
          lastCommitHash: 'abcdef1234567890',
          lastCommitMessage: 'feat: expose commit metadata',
          lastCommitAuthor: 'Test Author',
          lastCommitDate: '2026-06-26T09:30:00.000Z',
          worktree: { path: WORKTREE_PATH },
        }),
      ],
      selectedBranch: 'feature/worktree',
      statusLoaded: true,
      status: [{ path: WORKTREE_PATH, branch: 'feature/worktree', isMain: true, entries: [] }],
    })

    await act(async () => {
      root!.render(<ProjectStatusPanel repoId={REPO_ID} layout="top-bottom" />)
    })

    expect(container?.textContent).toContain('feature/worktree')
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
    expect(container?.textContent).toContain('2026')

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('button[aria-label="branch-status.copy-commit-hash"]')?.click()
      container?.querySelector<HTMLButtonElement>('button[aria-label="branch-status.copy-commit-message"]')?.click()
      container?.querySelector<HTMLButtonElement>('button[aria-label="branch-status.copy-commit-author"]')?.click()
      container?.querySelector<HTMLButtonElement>('button[aria-label="branch-status.copy-commit-time"]')?.click()
    })

    expect(writeText).toHaveBeenCalledWith('abcdef1234567890')
    expect(writeText).toHaveBeenCalledWith('feat: expose commit metadata')
    expect(writeText).toHaveBeenCalledWith('Test Author')
    expect(writeText).toHaveBeenCalledWith('2026-06-26T09:30:00.000Z')
  })
})
