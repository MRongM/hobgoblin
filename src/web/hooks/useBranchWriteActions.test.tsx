// @vitest-environment jsdom

import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useBranchWriteActions } from '#/web/hooks/useBranchWriteActions.tsx'
import { createRepoBranch, resetReposStore, seedRepoState } from '#/web/stores/repos/test-utils.ts'
import type { RepoState } from '#/web/stores/repos/types.ts'

const mocks = vi.hoisted(() => ({
  checkoutBranchInWorktree: vi.fn(),
  commitRepositoryChanges: vi.fn(),
  getCommitMessageProviders: vi.fn(),
  generateRepositoryCommitMessage: vi.fn(),
  mergeRepositoryBranch: vi.fn(),
  pullRepositoryBranch: vi.fn(),
  resetRepositoryHard: vi.fn(),
}))

vi.mock('#/web/repo-client.ts', () => ({
  checkoutBranchInWorktree: mocks.checkoutBranchInWorktree,
  commitRepositoryChanges: mocks.commitRepositoryChanges,
  getCommitMessageProviders: mocks.getCommitMessageProviders,
  generateRepositoryCommitMessage: mocks.generateRepositoryCommitMessage,
  mergeRepositoryBranch: mocks.mergeRepositoryBranch,
  pullRepositoryBranch: mocks.pullRepositoryBranch,
  resetRepositoryHard: mocks.resetRepositoryHard,
}))

const toastMock = vi.hoisted(() => ({ info: vi.fn() }))
vi.mock('sonner', () => ({ toast: toastMock }))

const draftMocks = vi.hoisted(() => ({ openDraft: vi.fn() }))
vi.mock('#/web/components/branch-list/InlineCommitDraftProvider.tsx', () => ({
  useInlineCommitDraft: () => null,
  useInlineCommitDraftActions: () => ({
    openDraft: draftMocks.openDraft,
    clearDraft: vi.fn(),
    setMessage: vi.fn(),
    setError: vi.fn(),
    generateMessage: vi.fn(),
    applyPendingGeneratedMessage: vi.fn(),
    clearPendingGeneratedMessage: vi.fn(),
  }),
  useInlineCommitMessageProviders: () => [],
}))

const REPO_ID = '/tmp/use-branch-write-actions-test'

describe('useBranchWriteActions', () => {
  let container: HTMLDivElement
  let root: Root | null = null
  const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

  beforeEach(() => {
    reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
    resetReposStore()
    vi.clearAllMocks()
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    act(() => root?.unmount())
    container.remove()
    document.body.innerHTML = ''
    root = null
    reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
  })

  test('commit action shows toast and does not open draft when worktree has no changes', async () => {
    const repo = seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('feature/current', { worktree: { path: '/tmp/repo-feature' } })],
      currentBranch: 'feature/current',
      status: [{ path: '/tmp/repo-feature', isMain: false, entries: [] }],
    })
    let actions: ReturnType<typeof useBranchWriteActions> | null = null

    root = createRoot(container)
    await act(async () => {
      root!.render(
        <BranchWriteActionsHarness repo={repo} onPush={vi.fn()} onReady={(value) => (actions = value)} />,
      )
    })

    await act(async () => {
      actions?.mainItems.find((item) => item.id === 'commit')?.onSelect()
    })

    expect(toastMock.info).toHaveBeenCalledWith('action.commit-no-changes')
    expect(draftMocks.openDraft).not.toHaveBeenCalled()
  })

  test('commit action opens draft when worktree has changes', async () => {
    const repo = seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('feature/current', { worktree: { path: '/tmp/repo-feature' } })],
      currentBranch: 'feature/current',
      status: [{ path: '/tmp/repo-feature', isMain: false, entries: [{ path: 'README.md', x: ' ', y: 'M' }] }],
    })
    let actions: ReturnType<typeof useBranchWriteActions> | null = null

    root = createRoot(container)
    await act(async () => {
      root!.render(
        <BranchWriteActionsHarness repo={repo} onPush={vi.fn()} onReady={(value) => (actions = value)} />,
      )
    })

    await act(async () => {
      actions?.mainItems.find((item) => item.id === 'commit')?.onSelect()
    })

    expect(toastMock.info).not.toHaveBeenCalled()
    expect(draftMocks.openDraft).toHaveBeenCalledWith(REPO_ID, '/tmp/repo-feature')
  })

  test('wires pull, merge and push from the branch write merge dialog', async () => {
    const calls: string[] = []
    const repo = seedRepoState({
      id: REPO_ID,
      branches: [
        createRepoBranch('feature/current', { worktree: { path: '/tmp/repo-feature' } }),
        createRepoBranch('main'),
      ],
      currentBranch: 'feature/current',
      remote: { hasRemotes: true },
    })
    mocks.mergeRepositoryBranch.mockImplementation(async () => {
      calls.push('merge')
      return { ok: true, message: 'merged' }
    })
    mocks.pullRepositoryBranch.mockImplementation(async () => {
      calls.push('pull')
      return { ok: true, message: 'pulled' }
    })
    const onPush = vi.fn(() => {
      calls.push('push')
    })
    let actions: ReturnType<typeof useBranchWriteActions> | null = null

    root = createRoot(container)
    await act(async () => {
      root!.render(<BranchWriteActionsHarness repo={repo} onPush={onPush} onReady={(value) => (actions = value)} />)
    })

    await act(async () => {
      actions?.mainItems.find((item) => item.id === 'merge')?.onSelect()
    })
    selectFirstMergeCandidate()
    clickButtonByText('action.merge-and-push-confirm')
    await flush()

    expect(mocks.pullRepositoryBranch).toHaveBeenCalledWith(REPO_ID, 'feature/current', '/tmp/repo-feature')
    expect(mocks.mergeRepositoryBranch).toHaveBeenCalledWith(REPO_ID, '/tmp/repo-feature', 'main')
    expect(onPush).toHaveBeenCalled()
    expect(calls).toEqual(['pull', 'merge', 'push'])
  })
})

function BranchWriteActionsHarness({
  repo,
  onPush,
  onReady,
}: {
  repo: RepoState
  onPush: () => void
  onReady: (value: ReturnType<typeof useBranchWriteActions>) => void
}) {
  const branch = repo.data.branches[0]!
  const value = useBranchWriteActions(repo, branch, { canPush: true, onPush })
  useEffect(() => {
    onReady(value)
  }, [onReady, value])
  return <>{value.dialogs}</>
}

function buttonByText(text: string): HTMLButtonElement {
  const element = [...document.body.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === text,
  )
  if (!(element instanceof HTMLButtonElement)) throw new Error(`Missing button text: ${text}`)
  return element
}

function clickButtonByText(text: string) {
  const element = buttonByText(text)
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function openSelect(selector: string) {
  const element = document.body.querySelector(selector)
  if (!(element instanceof HTMLButtonElement)) throw new Error(`Missing select: ${selector}`)
  if (!Element.prototype.scrollIntoView) {
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  }
  act(() => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
  })
}

function selectFirstMergeCandidate() {
  openSelect('#merge-select')
  const item = document.body.querySelector<HTMLElement>('[role="option"]')
  if (!item) throw new Error('Missing merge candidate option')
  act(() => {
    item.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
  })
}
