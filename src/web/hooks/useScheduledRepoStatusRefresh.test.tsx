// @vitest-environment jsdom

import { act } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { emptyRepo } from '#/web/stores/repos/helpers.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { resetReposStore } from '#/web/stores/repos/test-utils.ts'
import { branchWorkspaceQueryKey } from '#/web/branch-workspace-query-cache.ts'
import type { BranchWorkspaceSnapshot } from '#/shared/branch-workspaces.ts'
import {
  scheduledStatusRefreshRepoIdsFromStore,
  useScheduledRepoStatusRefresh,
} from '#/web/hooks/useScheduledRepoStatusRefresh.ts'

const settings = vi.hoisted(() => ({ statusRefreshIntervalSec: 30 }))

vi.mock('#/web/runtime-settings-fetch.ts', () => ({
  useRuntimeFetchSettings: () => ({
    fetchIntervalSec: 120,
    statusRefreshIntervalSec: settings.statusRefreshIntervalSec,
    terminalNotificationsEnabled: true,
  }),
}))

const originalRefreshCoreData = useReposStore.getState().refreshCoreData
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

function Harness() {
  useScheduledRepoStatusRefresh()
  return null
}

const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } })
function ProviderHarness() {
  return (
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>
  )
}

describe('useScheduledRepoStatusRefresh', () => {
  let container: HTMLDivElement
  let root: Root
  let refreshCoreData: ReturnType<typeof vi.fn>

  beforeEach(() => {
    reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    settings.statusRefreshIntervalSec = 30
    resetReposStore()
    queryClient.clear()
    refreshCoreData = vi.fn().mockResolvedValue(undefined)
    useReposStore.setState({ refreshCoreData: refreshCoreData as typeof originalRefreshCoreData })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    resetReposStore()
    queryClient.clear()
    useReposStore.setState({ refreshCoreData: originalRefreshCoreData })
    vi.useRealTimers()
    reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
  })

  test('selects only available Git repositories from the active top-level project', () => {
    const rootRepo = emptyRepo('/workspace', 'workspace')
    rootRepo.isGitRepo = false
    const api = emptyRepo('/workspace/api', 'api')
    api.workspaceRootId = rootRepo.id
    const unavailable = emptyRepo('/workspace/web', 'web')
    unavailable.workspaceRootId = rootRepo.id
    unavailable.availability = { phase: 'unavailable', reason: 'missing', checkedAt: 1 }
    const plain = emptyRepo('/workspace/docs', 'docs')
    plain.workspaceRootId = rootRepo.id
    plain.isGitRepo = false
    const background = emptyRepo('/background', 'background')
    useReposStore.setState({
      activeId: rootRepo.id,
      activeProjectId: rootRepo.id,
      order: [rootRepo.id, background.id],
      repos: {
        [rootRepo.id]: rootRepo,
        [api.id]: api,
        [unavailable.id]: unavailable,
        [plain.id]: plain,
        [background.id]: background,
      },
      workspaceProjects: {
        [rootRepo.id]: {
          rootId: rootRepo.id,
          repositoryIds: [api.id, unavailable.id, plain.id],
          candidates: [],
          configured: true,
          configurationError: null,
          phase: 'ready',
          skipped: [],
          error: null,
        },
      },
    })

    expect(scheduledStatusRefreshRepoIdsFromStore(useReposStore.getState())).toEqual([api.id])
  })

  test('waits one interval, refreshes branch snapshots and status for every eligible member, and stops when disabled', async () => {
    const rootRepo = emptyRepo('/workspace', 'workspace')
    rootRepo.isGitRepo = false
    const api = emptyRepo('/workspace/api', 'api')
    api.workspaceRootId = rootRepo.id
    const web = emptyRepo('/workspace/web', 'web')
    web.workspaceRootId = rootRepo.id
    useReposStore.setState({
      activeId: rootRepo.id,
      activeProjectId: rootRepo.id,
      repos: { [rootRepo.id]: rootRepo, [api.id]: api, [web.id]: web },
      workspaceProjects: {
        [rootRepo.id]: {
          rootId: rootRepo.id,
          repositoryIds: [api.id, web.id],
          candidates: [],
          configured: true,
          configurationError: null,
          phase: 'ready',
          skipped: [],
          error: null,
        },
      },
    })
    refreshCoreData.mockRejectedValueOnce(new Error('api failed')).mockResolvedValue(undefined)

    await act(async () => {
      root.render(<ProviderHarness />)
    })
    expect(refreshCoreData).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(29_999)
    })
    expect(refreshCoreData).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(1)
      await Promise.resolve()
    })
    expect(refreshCoreData).toHaveBeenCalledTimes(2)
    expect(refreshCoreData).toHaveBeenCalledWith(api.id, { token: api.instanceToken })
    expect(refreshCoreData).toHaveBeenCalledWith(web.id, { token: web.instanceToken })

    settings.statusRefreshIntervalSec = 0
    await act(async () => {
      root.render(<ProviderHarness />)
    })
    await act(async () => {
      vi.advanceTimersByTime(60_000)
    })
    expect(refreshCoreData).toHaveBeenCalledTimes(2)
  })

  test('resets the timer when the active project changes and clears it on unmount', async () => {
    const repoA = emptyRepo('/repo-a', 'repo-a')
    const repoB = emptyRepo('/repo-b', 'repo-b')
    useReposStore.setState({
      activeId: repoA.id,
      activeProjectId: repoA.id,
      order: [repoA.id, repoB.id],
      repos: { [repoA.id]: repoA, [repoB.id]: repoB },
    })

    await act(async () => {
      root.render(<ProviderHarness />)
    })
    expect(vi.getTimerCount()).toBe(1)
    await act(async () => {
      vi.advanceTimersByTime(20_000)
      useReposStore.setState({ activeId: repoB.id, activeProjectId: repoB.id })
    })
    await act(async () => {
      vi.advanceTimersByTime(10_000)
    })
    expect(refreshCoreData).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(20_000)
      await Promise.resolve()
    })
    expect(refreshCoreData).toHaveBeenCalledWith(repoB.id, { token: repoB.instanceToken })

    act(() => root.unmount())
    expect(vi.getTimerCount()).toBe(0)
    root = createRoot(container)
  })

  function installWorkspaceMembers(count: number) {
    const workspace = emptyRepo('/workspace', 'workspace')
    workspace.isGitRepo = false
    const members = Array.from({ length: count }, (_, index) => {
      const repo = emptyRepo(`/workspace/repo-${index}`, `repo-${index}`)
      repo.workspaceRootId = workspace.id
      return repo
    })
    useReposStore.setState({
      activeId: workspace.id,
      activeProjectId: workspace.id,
      repos: Object.fromEntries([workspace, ...members].map((repo) => [repo.id, repo])),
      workspaceProjects: {
        [workspace.id]: {
          rootId: workspace.id,
          repositoryIds: members.map((repo) => repo.id),
          candidates: [],
          configured: true,
          configurationError: null,
          phase: 'ready',
          skipped: [],
          error: null,
        },
      },
    })
    return members
  }

  test('rotates bounded batches including independent repositories discovered in subworkspaces', async () => {
    const members = installWorkspaceMembers(11)
    const independent = emptyRepo('/workspace/hob-example/independent', 'independent')
    useReposStore.setState((state) => ({ repos: { ...state.repos, [independent.id]: independent } }))
    const folders: BranchWorkspaceSnapshot[] = [
      {
        id: 'folder',
        rootId: '/workspace',
        branch: '',
        directoryName: 'hob-example',
        path: '/workspace/hob-example',
        state: { kind: 'ready' },
        available: true,
        issues: [],
        auxiliaryEntries: [],
        repositories: [
          {
            repositoryId: independent.id,
            repositoryName: 'independent',
            worktreePath: independent.id,
            kind: 'repository',
            targetBranch: 'main',
            creationBase: { kind: 'localBranch', branch: 'main' },
            syncBeforeCreate: false,
            branchOrigin: 'pre-existing',
            progress: 'complete',
            ready: true,
          },
        ],
      },
    ]
    queryClient.setQueryData(branchWorkspaceQueryKey('/workspace'), { ok: true, items: folders })
    const all = [...members, independent]
    refreshCoreData.mockRejectedValueOnce(new Error('temporary read failure'))
    expect(scheduledStatusRefreshRepoIdsFromStore(useReposStore.getState(), folders)).toEqual(
      all.map((repo) => repo.id),
    )
    await act(async () => root.render(<ProviderHarness />))
    for (const expected of [all.slice(0, 5), all.slice(5, 10), all.slice(10), all.slice(0, 5)]) {
      refreshCoreData.mockClear()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000)
      })
      expect(refreshCoreData.mock.calls.map(([id]) => id)).toEqual(expected.map((repo) => repo.id))
    }
  })

  test('waits for a batch to settle and reads the latest instance token for the next batch', async () => {
    const members = installWorkspaceMembers(7)
    let release!: () => void
    refreshCoreData.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    await act(async () => root.render(<ProviderHarness />))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(refreshCoreData).toHaveBeenCalledTimes(5)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(refreshCoreData).toHaveBeenCalledTimes(5)
    const next = members[5]!
    act(() =>
      useReposStore.setState((state) => ({ repos: { ...state.repos, [next.id]: { ...next, instanceToken: 999 } } })),
    )
    await act(async () => release())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(refreshCoreData).toHaveBeenCalledTimes(7)
    expect(refreshCoreData).toHaveBeenCalledWith(next.id, { token: 999 })
  })

  test('preserves the batch lock when changing project or interval', async () => {
    installWorkspaceMembers(6)
    const other = emptyRepo('/other', 'other')
    useReposStore.setState((state) => ({ repos: { ...state.repos, [other.id]: other } }))
    let release!: () => void
    refreshCoreData.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    await act(async () => root.render(<ProviderHarness />))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(refreshCoreData).toHaveBeenCalledTimes(5)
    settings.statusRefreshIntervalSec = 10
    await act(async () => {
      useReposStore.setState({ activeId: other.id, activeProjectId: other.id })
      root.render(<ProviderHarness />)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(refreshCoreData).toHaveBeenCalledTimes(5)
    await act(async () => release())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(refreshCoreData).toHaveBeenLastCalledWith(other.id, { token: other.instanceToken })
  })
})
