import { beforeEach, describe, expect, test, vi } from 'vitest'
import { normalizeRemoteTarget, remoteRepoSessionEntry } from '#/shared/remote-repo.ts'
import { emptyRepo, replaceRepo } from '#/web/stores/repos/helpers.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import type { BranchSnapshotInfo } from '#/web/types.ts'
import {
  branchSnapshot,
  flushRpc,
  installGoblin,
  REPO_A,
  REPO_B,
  resetLifecycleTest,
} from '#/web/stores/repos/lifecycle-test-utils.ts'

const mocks = vi.hoisted(() => ({
  stopPortForwardSessionsForRepo: vi.fn(async () => ({ ok: true, stopped: [] })),
}))

vi.mock('#/web/port-forwarding-client.ts', () => ({
  stopPortForwardSessionsForRepo: mocks.stopPortForwardSessionsForRepo,
}))

beforeEach(resetLifecycleTest)

describe('repo lifecycle', () => {
  test('ensureWorkspaceOpen plus setActive opens the resolved repo, records it as recent, and starts initial local refresh', async () => {
    const calls = installGoblin()

    const result = await useReposStore.getState().ensureWorkspaceOpen(REPO_A)
    if (result.ok) useReposStore.getState().setActive(result.id)

    expect(result).toEqual({ ok: true, id: REPO_A })
    expect(useReposStore.getState().order).toEqual([REPO_A])
    expect(useReposStore.getState().activeId).toBe(REPO_A)
    expect(calls.recent).toEqual([{ kind: 'local', id: REPO_A }])
    expect(calls.snapshot).toEqual([REPO_A])
    await vi.waitFor(() => {
      expect(calls.status).toEqual([REPO_A])
    })
  })

  test('ensureWorkspaceOpen adds a repo to the open set without changing the active selection', async () => {
    const calls = installGoblin()

    const first = await useReposStore.getState().ensureWorkspaceOpen(REPO_A)
    if (first.ok) useReposStore.getState().setActive(first.id)
    const result = await useReposStore.getState().ensureWorkspaceOpen(REPO_B)

    expect(result).toEqual({ ok: true, id: REPO_B })
    expect(useReposStore.getState().order).toEqual([REPO_A, REPO_B])
    expect(useReposStore.getState().activeId).toBe(REPO_A)
    expect(calls.snapshot).toEqual([REPO_A, REPO_B])
    await vi.waitFor(() => {
      expect(calls.status).toEqual([REPO_A, REPO_B])
    })
  })

  test('ensureWorkspaceOpen opens without changing the active repo', async () => {
    const calls = installGoblin()

    const first = await useReposStore.getState().ensureWorkspaceOpen(REPO_A)
    if (first.ok) useReposStore.getState().setActive(first.id)
    await useReposStore.getState().ensureWorkspaceOpen(REPO_B)

    expect(useReposStore.getState().order).toEqual([REPO_A, REPO_B])
    expect(useReposStore.getState().activeId).toBe(REPO_A)
    expect(calls.snapshot).toEqual([REPO_A, REPO_B])
    await vi.waitFor(() => {
      expect(calls.status).toEqual([REPO_A, REPO_B])
    })
  })

  test('ensureWorkspaceOpen still ensures the workspace is added to the open set', async () => {
    installGoblin()

    const first = await useReposStore.getState().ensureWorkspaceOpen(REPO_A)
    if (first.ok) useReposStore.getState().setActive(first.id)
    await useReposStore.getState().ensureWorkspaceOpen(REPO_B)

    expect(Object.keys(useReposStore.getState().repos)).toEqual([REPO_A, REPO_B])
    expect(useReposStore.getState().order).toEqual([REPO_A, REPO_B])
    expect(useReposStore.getState().activeId).toBe(REPO_A)
  })

  test('ensureWorkspaceOpen plus setActive locally refreshes an already-open repo', async () => {
    const calls = installGoblin()

    const first = await useReposStore.getState().ensureWorkspaceOpen(REPO_A)
    if (first.ok) useReposStore.getState().setActive(first.id)
    const second = await useReposStore.getState().ensureWorkspaceOpen(REPO_B)
    if (second.ok) useReposStore.getState().setActive(second.id)
    const third = await useReposStore.getState().ensureWorkspaceOpen(REPO_A)
    if (third.ok) useReposStore.getState().setActive(third.id)

    expect(useReposStore.getState().order).toEqual([REPO_A, REPO_B])
    expect(useReposStore.getState().activeId).toBe(REPO_A)
    expect(calls.snapshot).toEqual([REPO_A, REPO_B, REPO_A])
    await vi.waitFor(() => {
      expect(calls.status).toEqual([REPO_A, REPO_B, REPO_A])
    })
  })

  test('ensureWorkspaceOpen updates an already-open repo when reprobe reports non-git', async () => {
    let probeCount = 0
    const calls = installGoblin({
      probe: (cwd: string) => {
        probeCount += 1
        return {
          ok: true,
          root: cwd,
          name: cwd.split('/').at(-1) ?? cwd,
          isGitRepo: probeCount === 1,
        }
      },
    })

    await useReposStore.getState().ensureWorkspaceOpen(REPO_A)
    expect(useReposStore.getState().repos[REPO_A]?.isGitRepo).toBe(true)
    await vi.waitFor(() => {
      expect(calls.snapshot).toEqual([REPO_A])
    })
    await vi.waitFor(() => {
      expect(calls.status).toEqual([REPO_A])
    })
    useReposStore.setState((s) => {
      const repo = s.repos[REPO_A]
      if (!repo) return s
      return {
        repos: {
          ...s.repos,
          [REPO_A]: replaceRepo(repo, (draft) => {
            draft.data.branches = [branchSnapshot('stale')]
            draft.data.currentBranch = 'stale'
            draft.data.status = [{ path: REPO_A, branch: 'stale', isMain: true, entries: [{ x: 'M', y: ' ', path: 'README.md' }] }]
            draft.data.statusLoaded = true
            draft.data.worktreesByPath = {
              [REPO_A]: { path: REPO_A, branch: 'stale', isMain: true, isDirty: true, changeCount: 1 },
            }
            draft.resources.pullRequestsByBranch = {
              stale: { phase: 'loading', loadedAt: null, error: null, stale: false, mode: 'full' },
            }
            draft.ui.selectedBranch = 'stale'
            draft.ui.worktreePathOrder = [REPO_A]
            draft.remote.remotes = ['origin']
            draft.remote.remoteDetails = [{ name: 'origin', fetchUrl: 'git@example.com:acme/repo.git', pushUrl: 'git@example.com:acme/repo.git' }]
            draft.remote.hasRemotes = true
            draft.remote.hasBrowserRemote = true
            draft.remote.browserRemoteProvider = 'github'
            draft.remote.remoteProviders = { origin: 'github' }
            draft.remote.hasGitHubRemote = true
            draft.remote.fetchFailed = true
            draft.remote.fetchError = 'failed'
          }),
        },
      }
    })

    await useReposStore.getState().ensureWorkspaceOpen(REPO_A)
    await flushRpc()

    const repo = useReposStore.getState().repos[REPO_A]
    expect(repo?.isGitRepo).toBe(false)
    expect(repo?.data).toMatchObject({
      branches: [],
      currentBranch: '',
      status: [],
      statusLoaded: false,
      worktreesByPath: {},
    })
    expect(repo?.resources.pullRequestsByBranch).toEqual({})
    expect(repo?.ui.selectedBranch).toBeNull()
    expect(repo?.ui.worktreePathOrder).toEqual([])
    expect(repo?.remote).toMatchObject({
      remotes: [],
      remoteDetails: [],
      hasRemotes: false,
      hasBrowserRemote: false,
      browserRemoteProvider: undefined,
      remoteProviders: {},
      hasGitHubRemote: false,
      fetchFailed: false,
      fetchError: null,
    })
    expect(calls.snapshot).toEqual([REPO_A])
    expect(calls.status).toEqual([REPO_A])
  })

  test('capability switches invalidate in-flight git refresh results', async () => {
    let probeCount = 0
    const snapshotResolvers: Array<(value: { branches: BranchSnapshotInfo[]; current: string }) => void> = []
    installGoblin({
      probe: (cwd: string) => {
        probeCount += 1
        return {
          ok: true,
          root: cwd,
          name: cwd.split('/').at(-1) ?? cwd,
          isGitRepo: probeCount === 1,
        }
      },
      snapshot: () =>
        new Promise<{ branches: BranchSnapshotInfo[]; current: string }>((resolve) => {
          snapshotResolvers.push(resolve)
        }),
    })

    await useReposStore.getState().ensureWorkspaceOpen(REPO_A)
    const gitToken = useReposStore.getState().repos[REPO_A]?.instanceToken
    await vi.waitFor(() => {
      expect(snapshotResolvers).toHaveLength(1)
    })

    await useReposStore.getState().ensureWorkspaceOpen(REPO_A)
    const plainRepo = useReposStore.getState().repos[REPO_A]
    expect(plainRepo?.isGitRepo).toBe(false)
    expect(plainRepo?.instanceToken).not.toBe(gitToken)

    snapshotResolvers[0]?.({ branches: [branchSnapshot('stale')], current: 'stale' })
    await flushRpc()

    expect(useReposStore.getState().repos[REPO_A]?.isGitRepo).toBe(false)
    expect(useReposStore.getState().repos[REPO_A]?.data.branches).toEqual([])
    expect(useReposStore.getState().repos[REPO_A]?.data.currentBranch).toBe('')
  })

  test('ensureWorkspaceOpen updates an already-open plain workspace when reprobe reports git', async () => {
    let probeCount = 0
    const calls = installGoblin({
      probe: (cwd: string) => {
        probeCount += 1
        return {
          ok: true,
          root: cwd,
          name: cwd.split('/').at(-1) ?? cwd,
          isGitRepo: probeCount > 1,
        }
      },
    })

    useReposStore.setState({
      restorableRepoCache: {
        [REPO_A]: {
          savedAt: Date.now(),
          name: 'cached',
          data: { branches: [branchSnapshot('cached')], currentBranch: 'cached' },
          ui: { selectedBranch: 'cached', branchViewMode: 'all', detailTab: 'status', worktreePathOrder: [REPO_A] },
        },
      },
    })
    await useReposStore.getState().ensureWorkspaceOpen(REPO_A)
    await flushRpc()
    const plainRepo = useReposStore.getState().repos[REPO_A]
    expect(plainRepo?.isGitRepo).toBe(false)
    expect(plainRepo?.data.branches).toEqual([])
    expect(plainRepo?.data.currentBranch).toBe('')
    expect(plainRepo?.ui.selectedBranch).toBeNull()
    expect(plainRepo?.ui.worktreePathOrder).toEqual([])
    expect(calls.snapshot).toEqual([])

    await useReposStore.getState().ensureWorkspaceOpen(REPO_A)

    expect(useReposStore.getState().repos[REPO_A]?.isGitRepo).toBe(true)
    await vi.waitFor(() => {
      expect(calls.snapshot).toEqual([REPO_A])
    })
  })

  test('initial refresh results from a closed repo instance do not overwrite a reopened repo', async () => {
    const snapshotResolvers: Array<(value: { branches: BranchSnapshotInfo[]; current: string }) => void> = []
    installGoblin({
      snapshot: () =>
        new Promise<{ branches: BranchSnapshotInfo[]; current: string }>((resolve) => {
          snapshotResolvers.push(resolve)
        }),
    })

    const first = await useReposStore.getState().ensureWorkspaceOpen(REPO_A)
    if (first.ok) useReposStore.getState().setActive(first.id)
    const firstToken = useReposStore.getState().repos[REPO_A]?.instanceToken
    useReposStore.getState().closeRepo(REPO_A)
    const second = await useReposStore.getState().ensureWorkspaceOpen(REPO_A)
    if (second.ok) useReposStore.getState().setActive(second.id)
    const secondToken = useReposStore.getState().repos[REPO_A]?.instanceToken

    snapshotResolvers[1]?.({ branches: [branchSnapshot('fresh')], current: 'fresh' })
    await flushRpc()

    expect(secondToken).not.toBe(firstToken)
    await vi.waitFor(() => {
      expect(useReposStore.getState().repos[REPO_A]?.data.currentBranch).toBe('fresh')
    })

    snapshotResolvers[0]?.({ branches: [branchSnapshot('stale')], current: 'stale' })
    await flushRpc()

    expect(useReposStore.getState().repos[REPO_A]?.data.currentBranch).toBe('fresh')
  })

  test('ensureWorkspaceOpen preserves remote target metadata for recent repos and later actions', async () => {
    const target = normalizeRemoteTarget({
      alias: 'example',
      host: 'example.com',
      user: 'alice',
      port: 22,
      remotePath: '/srv/repo',
    })
    expect(target).not.toBeNull()
    const calls = installGoblin({
      probe: (cwd: string) => ({ ok: true, root: cwd, name: 'repo' }),
    })

    const result = await useReposStore.getState().ensureWorkspaceOpen(remoteRepoSessionEntry(target!))

    expect(result).toEqual({ ok: true, id: target!.id })
    expect(useReposStore.getState().repos[target!.id]?.remote.target).toEqual(target)
    expect(calls.recent).toEqual([remoteRepoSessionEntry(target!)])
  })

  test('closeRepo requests port-forward cleanup for the closed repo', () => {
    const repoId = 'ssh-config://prod/srv/repo'
    useReposStore.setState({
      repos: {
        [repoId]: emptyRepo(repoId, 'prod:repo'),
      },
      order: [repoId],
      activeId: repoId,
    })

    useReposStore.getState().closeRepo(repoId)

    expect(mocks.stopPortForwardSessionsForRepo).toHaveBeenCalledWith(repoId)
  })
})
