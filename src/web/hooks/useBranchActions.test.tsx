// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { useBranchActions } from '#/web/hooks/useBranchActions.tsx'
import { openBranchExternalTarget } from '#/web/hooks/openBranchExternalTarget.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { createRepoBranch, resetReposStore, seedRepoState } from '#/web/stores/repos/test-utils.ts'
import { normalizeRemoteTarget } from '#/shared/remote-repo.ts'

const mocks = vi.hoisted(() => ({
  openRepositoryEditor: vi.fn(),
  openRepositoryRemote: vi.fn(),
  openRepositoryTerminal: vi.fn(),
  openRemoteRepositoryEditor: vi.fn(),
  openRemoteRepositoryTerminal: vi.fn(),
  showRepoDetailTab: vi.fn(),
  showRepoBranchDetailTab: vi.fn(),
}))

vi.mock('#/web/repo-client.ts', () => ({
  getRepositoryPatch: vi.fn(),
  openRepositoryEditor: mocks.openRepositoryEditor,
  openRepositoryRemote: mocks.openRepositoryRemote,
  openRepositoryTerminal: mocks.openRepositoryTerminal,
}))

vi.mock('#/web/remote-client.ts', () => ({
  openRemoteRepositoryEditor: mocks.openRemoteRepositoryEditor,
  openRemoteRepositoryTerminal: mocks.openRemoteRepositoryTerminal,
}))

vi.mock('#/web/main-window-navigation.tsx', () => ({
  useMainWindowNavigation: () => ({
    showRepoDetailTab: mocks.showRepoDetailTab,
    showRepoBranchDetailTab: mocks.showRepoBranchDetailTab,
  }),
}))

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))

const REPO_ID = '/tmp/gbl-use-branch-actions-test-repo'

describe('useBranchActions', () => {
  let container: HTMLDivElement
  let root: Root | null = null
  const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

  beforeEach(() => {
    resetReposStore()
    mocks.openRepositoryEditor.mockReset()
    mocks.openRepositoryRemote.mockReset()
    mocks.openRepositoryTerminal.mockReset()
    mocks.openRemoteRepositoryEditor.mockReset()
    mocks.openRemoteRepositoryTerminal.mockReset()
    mocks.showRepoDetailTab.mockReset()
    mocks.showRepoBranchDetailTab.mockReset()
    reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(async () => {
    await act(async () => {
      root?.unmount()
    })
    container.remove()
    reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
    root = null
  })

  test('opens the branch remote URL', async () => {
    const branch = createRepoBranch('feature/no-pr')
    const repo = seedRepoState({
      id: REPO_ID,
      branches: [branch],
      remote: {
        remotes: ['origin'],
        hasRemotes: true,
        hasBrowserRemote: true,
        browserRemoteProvider: 'github',
        remoteProviders: { origin: 'github' },
        hasGitHubRemote: true,
      },
    })
    mocks.openRepositoryRemote.mockResolvedValue({ ok: true, message: '' })

    let actions: ReturnType<typeof useBranchActions>['actions'] | null = null
    root = createRoot(container)
    await act(async () => {
      root!.render(<BranchActionsHarness repo={repo} onReady={(value) => (actions = value)} />)
    })

    await act(async () => {
      await actions?.openRemote?.()
    })

    expect(mocks.openRepositoryRemote).toHaveBeenCalledWith(REPO_ID, 'feature/no-pr')
  })

  test('resets and submits explicit force removal independently from branch force', async () => {
    const branch = createRepoBranch('feature/dirty', { worktree: { path: '/tmp/repo-feature' } })
    const repo = seedRepoState({ id: REPO_ID, branches: [branch] })
    const runBranchAction = vi.fn(async () => ({ ok: true as const, message: 'ok' }))
    useReposStore.setState({ runBranchAction })

    let actions: ReturnType<typeof useBranchActions>['actions'] | null = null
    root = createRoot(container)
    await act(async () => {
      root!.render(<BranchActionsDialogHarness repo={repo} onReady={(value) => (actions = value)} />)
    })

    act(() => actions?.requestRemoveWorktree())
    const firstForceCheckbox = checkboxForLabel('action.confirm-remove-worktree-force')
    expect(firstForceCheckbox.dataset.state).toBe('unchecked')
    act(() => firstForceCheckbox.click())
    expect(firstForceCheckbox.dataset.state).toBe('checked')
    act(() => document.querySelector<HTMLButtonElement>('[data-slot="alert-dialog-cancel"]')?.click())

    act(() => actions?.requestRemoveWorktree())
    const resetForceCheckbox = checkboxForLabel('action.confirm-remove-worktree-force')
    expect(resetForceCheckbox.dataset.state).toBe('unchecked')
    act(() => resetForceCheckbox.click())
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-slot="alert-dialog-footer"] button:last-child')?.click()
      await Promise.resolve()
    })

    expect(runBranchAction).toHaveBeenCalledWith(
      REPO_ID,
      {
        kind: 'removeWorktree',
        branch: 'feature/dirty',
        worktreePath: '/tmp/repo-feature',
        alsoDeleteBranch: true,
        forceRemoveWorktree: true,
        forceDeleteBranch: false,
        alsoDeleteUpstream: false,
      },
      expect.objectContaining({ token: repo.instanceToken }),
    )
  })

  test('retains explicit force removal through the separate force-branch confirmation', async () => {
    const branch = createRepoBranch('feature/dirty', { worktree: { path: '/tmp/repo-feature' } })
    const repo = seedRepoState({ id: REPO_ID, branches: [branch] })
    const runBranchAction = vi
      .fn()
      .mockResolvedValueOnce({ ok: false as const, message: 'error.cannot-remove-unpushed-worktree' })
      .mockResolvedValueOnce({ ok: true as const, message: 'ok' })
    useReposStore.setState({ runBranchAction })

    let actions: ReturnType<typeof useBranchActions>['actions'] | null = null
    root = createRoot(container)
    await act(async () => {
      root!.render(<BranchActionsDialogHarness repo={repo} onReady={(value) => (actions = value)} />)
    })

    act(() => actions?.requestRemoveWorktree())
    act(() => checkboxForLabel('action.confirm-remove-worktree-force').click())
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-slot="alert-dialog-footer"] button:last-child')?.click()
      await Promise.resolve()
    })

    expect(document.body.textContent).toContain('action.confirm-force-delete-branch-title')
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-slot="alert-dialog-footer"] button:last-child')?.click()
      await Promise.resolve()
    })

    expect(runBranchAction).toHaveBeenNthCalledWith(
      2,
      REPO_ID,
      {
        kind: 'removeWorktree',
        branch: 'feature/dirty',
        worktreePath: '/tmp/repo-feature',
        alsoDeleteBranch: true,
        forceRemoveWorktree: true,
        forceDeleteBranch: true,
        alsoDeleteUpstream: false,
      },
      expect.objectContaining({ token: repo.instanceToken }),
    )
  })

  test('confirms invalid worktree cleanup before submitting the repository action', async () => {
    const branch = createRepoBranch('feature/stale', { worktree: { path: '/tmp/repo-stale' } })
    const repo = seedRepoState({ id: REPO_ID, branches: [branch] })
    const runBranchAction = vi.fn(async () => ({ ok: true as const, message: 'pruned' }))
    useReposStore.setState({ runBranchAction })

    let actions: ReturnType<typeof useBranchActions>['actions'] | null = null
    root = createRoot(container)
    await act(async () => {
      root!.render(<BranchActionsDialogHarness repo={repo} onReady={(value) => (actions = value)} />)
    })
    const requestCleanupWorktree = (actions as unknown as Record<string, unknown>)?.requestCleanupWorktree
    expect(requestCleanupWorktree).toBeTypeOf('function')

    act(() => (requestCleanupWorktree as () => void)())
    expect(document.body.textContent).toContain('action.confirm-cleanup-invalid-worktree-title')
    expect(document.body.textContent).toContain('/tmp/repo-stale')
    act(() => document.querySelector<HTMLButtonElement>('[data-slot="alert-dialog-cancel"]')?.click())
    expect(runBranchAction).not.toHaveBeenCalled()

    act(() => (requestCleanupWorktree as () => void)())
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-slot="alert-dialog-footer"] button:last-child')?.click()
      await Promise.resolve()
    })

    expect(runBranchAction).toHaveBeenCalledWith(
      REPO_ID,
      {
        kind: 'cleanupWorktree',
        branch: 'feature/stale',
        worktreePath: '/tmp/repo-stale',
      },
      expect.objectContaining({ token: repo.instanceToken }),
    )
  })

  test('opens remote terminals through the remote terminal client without selecting the in-app terminal tab', async () => {
    mocks.openRemoteRepositoryTerminal.mockResolvedValue({ ok: true, message: '' })
    const branch = createRepoBranch('feature/remote-terminal', { worktree: { path: '/srv/repo-feature' } })
    const target = normalizeRemoteTarget({
      alias: 'prod',
      host: 'example.com',
      user: 'alice',
      port: 22,
      remotePath: '/srv/repo',
    })
    expect(target).not.toBeNull()
    const repo = seedRepoState({
      id: target!.id,
      branches: [branch],
      remote: { target: target!, hasRemotes: true, hasBrowserRemote: true, hasGitHubRemote: true },
    })

    let actions: ReturnType<typeof useBranchActions>['actions'] | null = null
    root = createRoot(container)
    await act(async () => {
      root!.render(<BranchActionsHarness repo={repo} onReady={(value) => (actions = value)} />)
    })

    await act(async () => {
      await actions?.openExternalTerminal?.()
    })

    expect(mocks.openRemoteRepositoryTerminal).toHaveBeenCalledWith(target!.id, '/srv/repo-feature')
    expect(mocks.openRepositoryTerminal).not.toHaveBeenCalled()
    expect(mocks.showRepoDetailTab).not.toHaveBeenCalled()
    expect(mocks.showRepoBranchDetailTab).not.toHaveBeenCalled()
  })

  test('keeps local terminal actions on the external terminal route', async () => {
    mocks.openRepositoryTerminal.mockResolvedValue({ ok: true, message: '' })
    const branch = createRepoBranch('feature/local-terminal', { worktree: { path: '/tmp/repo-feature' } })
    const repo = seedRepoState({
      id: REPO_ID,
      branches: [branch],
    })

    let actions: ReturnType<typeof useBranchActions>['actions'] | null = null
    root = createRoot(container)
    await act(async () => {
      root!.render(<BranchActionsHarness repo={repo} onReady={(value) => (actions = value)} />)
    })

    await act(async () => {
      await actions?.openExternalTerminal?.()
    })

    expect(mocks.openRepositoryTerminal).toHaveBeenCalledWith('/tmp/repo-feature')
    expect(mocks.openRemoteRepositoryTerminal).not.toHaveBeenCalled()
    expect(mocks.showRepoBranchDetailTab).not.toHaveBeenCalled()
  })

  test('tracks external terminal launches with a distinct pending action id', async () => {
    let resolveOpenTerminal: ((result: { ok: boolean; message: string }) => void) | null = null
    mocks.openRepositoryTerminal.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOpenTerminal = resolve
        }),
    )
    const branch = createRepoBranch('feature/pending-external-terminal', {
      worktree: { path: '/tmp/repo-feature' },
    })
    const repo = seedRepoState({
      id: REPO_ID,
      branches: [branch],
    })

    let actions: ReturnType<typeof useBranchActions>['actions'] | null = null
    let busyAction: ReturnType<typeof useBranchActions>['busyAction'] = null
    root = createRoot(container)
    await act(async () => {
      root!.render(
        <BranchActionsStateHarness
          repo={repo}
          onReady={(value) => {
            actions = value.actions
            busyAction = value.busyAction
          }}
        />,
      )
    })

    let pending: Promise<void> | void
    await act(async () => {
      pending = actions?.openExternalTerminal()
      await Promise.resolve()
    })

    expect(busyAction).toBe('externalTerminal')

    await act(async () => {
      resolveOpenTerminal?.({ ok: true, message: '' })
      await pending
    })
    expect(busyAction).toBeNull()
  })

  test('opens remote editors through the remote editor client', async () => {
    mocks.openRemoteRepositoryEditor.mockResolvedValue({ ok: true, message: '' })
    const branch = createRepoBranch('feature/remote-editor', { worktree: { path: '/srv/repo-feature' } })
    const target = normalizeRemoteTarget({
      alias: 'prod',
      host: 'example.com',
      user: 'alice',
      port: 22,
      remotePath: '/srv/repo',
    })
    expect(target).not.toBeNull()
    const repo = seedRepoState({
      id: target!.id,
      branches: [branch],
      remote: { target: target!, hasRemotes: true, hasBrowserRemote: true, hasGitHubRemote: true },
    })

    let actions: ReturnType<typeof useBranchActions>['actions'] | null = null
    root = createRoot(container)
    await act(async () => {
      root!.render(<BranchActionsHarness repo={repo} onReady={(value) => (actions = value)} />)
    })

    await act(async () => {
      await actions?.openEditor?.()
    })

    expect(mocks.openRemoteRepositoryEditor).toHaveBeenCalledWith(target!.id, '/srv/repo-feature')
    expect(mocks.openRepositoryEditor).not.toHaveBeenCalled()
  })
})

describe('openBranchExternalTarget', () => {
  beforeEach(() => {
    mocks.openRepositoryRemote.mockReset()
  })

  test('opens the branch remote target', async () => {
    mocks.openRepositoryRemote.mockResolvedValue({ ok: true, message: '' })

    await openBranchExternalTarget(REPO_ID, {
      name: 'feature/no-pr',
    })

    expect(mocks.openRepositoryRemote).toHaveBeenCalledWith(REPO_ID, 'feature/no-pr')
  })
})

function BranchActionsHarness({
  repo,
  onReady,
}: {
  repo: ReturnType<typeof seedRepoState>
  onReady: (actions: ReturnType<typeof useBranchActions>['actions']) => void
}) {
  const branch = repo.data.branches[0]!
  const { actions } = useBranchActions(repo, branch)
  React.useEffect(() => {
    onReady(actions)
  }, [actions, onReady])
  return null
}

function BranchActionsStateHarness({
  repo,
  onReady,
}: {
  repo: ReturnType<typeof seedRepoState>
  onReady: (state: ReturnType<typeof useBranchActions>) => void
}) {
  const branch = repo.data.branches[0]!
  const state = useBranchActions(repo, branch)
  React.useEffect(() => {
    onReady(state)
  }, [state, onReady])
  return null
}

function BranchActionsDialogHarness({
  repo,
  onReady,
}: {
  repo: ReturnType<typeof seedRepoState>
  onReady: (actions: ReturnType<typeof useBranchActions>['actions']) => void
}) {
  const branch = repo.data.branches[0]!
  const state = useBranchActions(repo, branch)
  React.useEffect(() => {
    onReady(state.actions)
  }, [onReady, state.actions])
  return state.dialogs
}

function checkboxForLabel(text: string): HTMLButtonElement {
  const label = Array.from(document.querySelectorAll('label')).find((candidate) => candidate.textContent === text)
  if (!label?.htmlFor) throw new Error(`Missing checkbox label: ${text}`)
  const checkbox = document.getElementById(label.htmlFor)
  if (!(checkbox instanceof HTMLButtonElement)) throw new Error(`Missing checkbox control: ${text}`)
  return checkbox
}
