// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ProjectHistoryPanel } from '#/web/components/repo-workspace/ProjectHistoryPanel.tsx'
import { createRepoBranch, resetReposStore, seedRepoState } from '#/web/stores/repos/test-utils.ts'

const REPO_ID = '/tmp/gbl-history-repo'
const WORKTREE_PATH = '/tmp/gbl-history-repo'

const mocks = vi.hoisted(() => ({
  getRepositoryCommitDetail: vi.fn(),
  getRepositoryHistory: vi.fn(),
}))

vi.mock('#/web/repo-client.ts', () => ({
  getRepositoryCommitDetail: mocks.getRepositoryCommitDetail,
  getRepositoryHistory: mocks.getRepositoryHistory,
}))

vi.mock('#/web/components/FilePathText.tsx', () => ({
  FilePathText: ({ path }: { path: string }) => <span>{path}</span>,
}))

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  resetReposStore()
  mocks.getRepositoryHistory.mockResolvedValue([
    {
      hash: 'abc123456789',
      shortHash: 'abc1234',
      subject: 'feat: first',
      author: 'Alice',
      date: '2026-06-15T09:00:00+08:00',
      parents: ['def456'],
    },
    {
      hash: 'def456789012',
      shortHash: 'def4567',
      subject: 'fix: second',
      author: 'Bob',
      date: '2026-06-14T09:00:00+08:00',
      parents: [],
    },
  ])
  mocks.getRepositoryCommitDetail.mockResolvedValue({
    hash: 'abc123456789',
    shortHash: 'abc1234',
    subject: 'feat: first',
    author: 'Alice',
    date: '2026-06-15T09:00:00+08:00',
    parents: ['def456'],
    files: [{ path: 'src/app.ts', status: 'modified', additions: 3, deletions: 1 }],
  })
  seedRepoState({
    id: REPO_ID,
    branches: [createRepoBranch('feature/history', { worktree: { path: WORKTREE_PATH } })],
    selectedBranch: 'feature/history',
  })
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
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('ProjectHistoryPanel', () => {
  test('loads selected branch history and first commit detail', async () => {
    await act(async () => {
      root!.render(<ProjectHistoryPanel repoId={REPO_ID} onRevealPath={vi.fn()} />)
    })
    await act(async () => {})

    expect(mocks.getRepositoryHistory).toHaveBeenCalledWith(
      REPO_ID,
      'feature/history',
      { limit: 100, skip: 0 },
      expect.any(AbortSignal),
    )
    expect(mocks.getRepositoryCommitDetail).toHaveBeenCalledWith(REPO_ID, 'abc123456789', expect.any(AbortSignal))
    expect(container?.textContent).toContain('feat: first')
    expect(container?.textContent).toContain('abc123456789')
    expect(container?.querySelector('button[aria-label="src/app.ts"]')).toBeTruthy()
    expect(container?.textContent).toContain('+3')
    expect(container?.textContent).toContain('-1')
  })

  test('loads more history entries', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      hash: `abc${index.toString().padStart(9, '0')}`,
      shortHash: `abc${index.toString().padStart(4, '0')}`,
      subject: index === 0 ? 'feat: first' : `feat: page ${index}`,
      author: 'Alice',
      date: '2026-06-15T09:00:00+08:00',
      parents: [],
    }))
    mocks.getRepositoryHistory.mockResolvedValueOnce(firstPage).mockResolvedValueOnce([
      {
        hash: 'fed999999999',
        shortHash: 'fed9999',
        subject: 'feat: more',
        author: 'Carol',
        date: '2026-06-13T09:00:00+08:00',
        parents: [],
      },
    ])

    await act(async () => {
      root!.render(<ProjectHistoryPanel repoId={REPO_ID} onRevealPath={vi.fn()} />)
    })
    await act(async () => {})

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="history-load-more"]')?.click()
    })
    await act(async () => {})

    expect(mocks.getRepositoryHistory).toHaveBeenNthCalledWith(
      2,
      REPO_ID,
      'feature/history',
      { limit: 100, skip: 100 },
      expect.any(AbortSignal),
    )
    expect(container?.textContent).toContain('feat: more')
  })

  test('reveals a file path when detail file row is clicked', async () => {
    const onRevealPath = vi.fn()
    await act(async () => {
      root!.render(<ProjectHistoryPanel repoId={REPO_ID} onRevealPath={onRevealPath} />)
    })
    await act(async () => {})

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('button[aria-label="src/app.ts"]')?.click()
    })

    expect(onRevealPath).toHaveBeenCalledWith('src/app.ts')
  })

  test('shows detail errors without clearing the history list', async () => {
    mocks.getRepositoryCommitDetail.mockResolvedValueOnce(null)

    await act(async () => {
      root!.render(<ProjectHistoryPanel repoId={REPO_ID} onRevealPath={vi.fn()} />)
    })
    await act(async () => {})

    expect(container?.textContent).toContain('feat: first')
    expect(container?.textContent).toContain('history.detail-error')
  })

  test('defaults commit files to a folder hierarchy and keeps reveal clicks', async () => {
    const onRevealPath = vi.fn()
    mocks.getRepositoryCommitDetail.mockResolvedValueOnce({
      hash: 'abc123456789',
      shortHash: 'abc1234',
      subject: 'feat: first',
      author: 'Alice',
      date: '2026-06-15T09:00:00+08:00',
      parents: ['def456'],
      files: [
        { path: 'src/app.ts', status: 'modified', additions: 3, deletions: 1 },
        { path: 'src/components/Button.tsx', status: 'added', additions: 8, deletions: 0 },
        { path: 'README.md', status: 'deleted', additions: 0, deletions: 2 },
      ],
    })

    await act(async () => {
      root!.render(<ProjectHistoryPanel repoId={REPO_ID} onRevealPath={onRevealPath} />)
    })
    await act(async () => {})

    expect(container?.querySelector('[data-file-folder-path="src"]')).toBeTruthy()
    expect(container?.querySelector('[data-file-folder-path="src/components"]')).toBeTruthy()
    expect(container?.textContent).toContain('Button.tsx')

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('button[aria-label="src/components/Button.tsx"]')?.click()
    })

    expect(onRevealPath).toHaveBeenCalledWith('src/components/Button.tsx')
  })
})
