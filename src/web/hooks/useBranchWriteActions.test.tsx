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
  getRepositoryBranchMergeOutPlan: vi.fn(),
  mergeRepositoryBranchOut: vi.fn(),
  pullRepositoryBranch: vi.fn(),
  resetRepositoryHard: vi.fn(),
}))

vi.mock('#/web/repo-client.ts', () => ({
  checkoutBranchInWorktree: mocks.checkoutBranchInWorktree,
  commitRepositoryChanges: mocks.commitRepositoryChanges,
  getCommitMessageProviders: mocks.getCommitMessageProviders,
  generateRepositoryCommitMessage: mocks.generateRepositoryCommitMessage,
  mergeRepositoryBranch: mocks.mergeRepositoryBranch,
  getRepositoryBranchMergeOutPlan: mocks.getRepositoryBranchMergeOutPlan,
  mergeRepositoryBranchOut: mocks.mergeRepositoryBranchOut,
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
    mocks.getRepositoryBranchMergeOutPlan.mockResolvedValue({
      ok: true,
      plan: {
        token: 'sha256:plan',
        repoId: REPO_ID,
        sourceBranch: 'feature/current',
        sourceWorktreePath: '/tmp/repo-feature',
        sourceHead: 'source-head',
        ready: true,
        destinations: [
          {
            branch: 'main',
            head: 'main-head',
            ready: true,
            requiresTemporaryWorktree: true,
            pullMergePushReady: true,
          },
        ],
      },
    })
    mocks.mergeRepositoryBranchOut.mockResolvedValue({ ok: true, message: 'merged out' })
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
    clickButtonByText('action.merge-in-and-push-confirm')
    await flush()

    expect(mocks.pullRepositoryBranch).toHaveBeenCalledWith(REPO_ID, 'feature/current', '/tmp/repo-feature')
    expect(mocks.mergeRepositoryBranch).toHaveBeenCalledWith(REPO_ID, '/tmp/repo-feature', 'main')
    expect(onPush).toHaveBeenCalled()
    expect(calls).toEqual(['pull', 'merge', 'push'])
  })

  test('keeps merge-in identity and exposes adjacent merge-out only for a clean source', async () => {
    const repo = seedRepoState({
      id: REPO_ID,
      branches: [
        createRepoBranch('feature/current', { worktree: { path: '/tmp/repo-feature' } }),
        createRepoBranch('main'),
      ],
      currentBranch: 'feature/current',
      status: [{ path: '/tmp/repo-feature', isMain: false, entries: [] }],
    })
    const captured: { current: ReturnType<typeof useBranchWriteActions> | null } = { current: null }

    root = createRoot(container)
    await act(async () => {
      root!.render(
        <BranchWriteActionsHarness repo={repo} onPush={vi.fn()} onReady={(value) => (captured.current = value)} />,
      )
    })

    if (!captured.current) throw new Error('actions not ready')
    const ids = captured.current.mainItems.map((item) => item.id)
    expect(ids.indexOf('mergeOut')).toBe(ids.indexOf('merge') + 1)
    expect(captured.current.mainItems.find((item) => item.id === 'merge')).toMatchObject({
      label: 'action.merge-in',
      disabled: false,
    })
    expect(captured.current.mainItems.find((item) => item.id === 'mergeOut')).toMatchObject({
      label: 'action.merge-out',
      disabled: false,
    })
  })

  test('keeps merge-out visible but disabled when the exact source status is dirty or missing', async () => {
    const repo = seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('feature/current', { worktree: { path: '/tmp/repo-feature' } })],
      currentBranch: 'feature/current',
      status: [{ path: '/tmp/repo-feature', isMain: false, entries: [{ path: 'src/a.ts', x: 'M', y: ' ' }] }],
    })
    const captured: { current: ReturnType<typeof useBranchWriteActions> | null } = { current: null }
    root = createRoot(container)
    await act(async () => {
      root!.render(
        <BranchWriteActionsHarness repo={repo} onPush={vi.fn()} onReady={(value) => (captured.current = value)} />,
      )
    })

    if (!captured.current) throw new Error('actions not ready')
    expect(captured.current.mainItems.find((item) => item.id === 'mergeOut')).toMatchObject({
      visible: true,
      disabled: true,
      title: 'action.merge-out-source-dirty',
    })
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
