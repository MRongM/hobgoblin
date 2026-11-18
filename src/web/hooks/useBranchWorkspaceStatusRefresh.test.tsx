// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { BranchWorkspaceSnapshot } from '#/shared/branch-workspaces.ts'
import { useBranchWorkspaceStatusRefresh } from '#/web/hooks/useBranchWorkspaceStatusRefresh.ts'
import { emptyRepo, replaceRepo } from '#/web/stores/repos/helpers.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { resetReposStore } from '#/web/stores/repos/test-utils.ts'

const originalRefreshStatus = useReposStore.getState().refreshStatus
const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

function Harness({ workspace, selectionKey = '' }: { workspace: BranchWorkspaceSnapshot; selectionKey?: string }) {
  useBranchWorkspaceStatusRefresh(workspace, selectionKey)
  return null
}

function member(name: string): BranchWorkspaceSnapshot['repositories'][number] {
  return {
    repositoryName: name,
    repositoryId: `/repositories/${name}`,
    targetBranch: 'feature/demo',
    creationBase: { kind: 'localBranch', branch: 'main' },
    syncBeforeCreate: false,
    branchOrigin: 'created',
    worktreePath: `/workspace/hob-demo/${name}`,
    progress: 'complete',
    ready: true,
  }
}

function seedWorkspace(): BranchWorkspaceSnapshot {
  const rootRepo = emptyRepo('/workspace', 'workspace')
  rootRepo.isGitRepo = false
  const repos = Object.fromEntries(
    ['api', 'web', 'background'].map((name) => {
      const repo = emptyRepo(`/repositories/${name}`, name)
      repo.data.statusLoaded = true
      repo.resources.status.loadedAt = Date.now() - 20_000
      return [repo.id, repo]
    }),
  )
  useReposStore.setState({
    repos: { [rootRepo.id]: rootRepo, ...repos },
    activeId: rootRepo.id,
    activeProjectId: rootRepo.id,
    workspaceProjects: {
      [rootRepo.id]: {
        rootId: rootRepo.id,
        repositoryIds: ['/repositories/api', '/repositories/web'],
        candidates: ['api', 'web'].map((name) => ({
          id: `/repositories/${name}`,
          name,
          selected: true,
          available: true,
        })),
        configured: true,
        configurationError: null,
        phase: 'ready',
        skipped: [],
        error: null,
      },
    },
    workspaceActiveContextByRoot: { [rootRepo.id]: { kind: 'branch-workspace', branchWorkspaceId: 'demo' } },
  })
  return {
    id: 'demo',
    rootId: rootRepo.id,
    branch: 'feature/demo',
    directoryName: 'hob-demo',
    path: '/workspace/hob-demo',
    state: { kind: 'ready' },
    available: true,
    repositories: [member('api'), member('web')],
    issues: [],
    auxiliaryEntries: [],
  }
}

describe('useBranchWorkspaceStatusRefresh', () => {
  let container: HTMLDivElement
  let root: Root
  let workspace: BranchWorkspaceSnapshot
  let refreshStatus: ReturnType<typeof vi.fn>

  beforeEach(() => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-04T12:00:00Z'))
    resetReposStore()
    workspace = seedWorkspace()
    refreshStatus = vi.fn(async (id: string) => {
      const state = useReposStore.getState()
      useReposStore.setState({
        repos: {
          ...state.repos,
          [id]: replaceRepo(state.repos[id]!, (repo) => {
            repo.data.statusLoaded = true
            repo.resources.status.loadedAt = Date.now()
            repo.resources.status.stale = false
          }),
        },
      })
    })
    useReposStore.setState({ refreshStatus: refreshStatus as typeof originalRefreshStatus })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    resetReposStore()
    useReposStore.setState({ refreshStatus: originalRefreshStatus })
    vi.useRealTimers()
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = false
  })

  test('refreshes stale members on entry while preserving the parent context', async () => {
    await act(async () => root.render(<Harness workspace={workspace} />))
    expect(refreshStatus).toHaveBeenCalledTimes(2)
    expect(refreshStatus).toHaveBeenCalledWith('/repositories/api', { token: expect.any(Number) })
    expect(refreshStatus).toHaveBeenCalledWith('/repositories/web', { token: expect.any(Number) })
    expect(useReposStore.getState().activeId).toBe('/workspace')
    expect(useReposStore.getState().workspaceActiveContextByRoot['/workspace']).toEqual({
      kind: 'branch-workspace',
      branchWorkspaceId: 'demo',
    })
  })

  test('does not reread fresh members or reset the configured polling timer', async () => {
    const state = useReposStore.getState()
    useReposStore.setState({
      repos: Object.fromEntries(
        Object.entries(state.repos).map(([id, repo]) => [
          id,
          replaceRepo(repo, (draft) => {
            draft.resources.status.loadedAt = Date.now() - 1_000
          }),
        ]),
      ),
    })
    await act(async () => root.render(<Harness workspace={workspace} />))
    expect(refreshStatus).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  test('loads missing initial status and respects an in-progress read', async () => {
    const state = useReposStore.getState()
    useReposStore.setState({
      repos: {
        ...state.repos,
        '/repositories/api': replaceRepo(state.repos['/repositories/api']!, (repo) => {
          repo.data.statusLoaded = false
          repo.resources.status.loadedAt = null
        }),
        '/repositories/web': replaceRepo(state.repos['/repositories/web']!, (repo) => {
          repo.resources.status.phase = 'refreshing'
        }),
      },
    })
    await act(async () => root.render(<Harness workspace={workspace} />))
    expect(refreshStatus).toHaveBeenCalledTimes(1)
    expect(refreshStatus).toHaveBeenCalledWith('/repositories/api', { token: expect.any(Number) })
  })

  test('deduplicates member repositories and excludes removed, unavailable and non-Git members', async () => {
    const state = useReposStore.getState()
    const plain = emptyRepo('/repositories/docs', 'docs')
    plain.isGitRepo = false
    const unavailable = replaceRepo(state.repos['/repositories/web']!, (repo) => {
      repo.availability = { phase: 'unavailable', reason: 'missing', checkedAt: 1 }
    })
    useReposStore.setState({ repos: { ...state.repos, [plain.id]: plain, [unavailable.id]: unavailable } })
    workspace = {
      ...workspace,
      repositories: [
        ...workspace.repositories,
        { ...member('api'), repositoryName: 'api-alias' },
        member('docs'),
        { ...member('background'), progress: 'removed' },
      ],
    }
    await act(async () => root.render(<Harness workspace={workspace} />))
    expect(refreshStatus).toHaveBeenCalledTimes(1)
    expect(refreshStatus).toHaveBeenCalledWith('/repositories/api', { token: expect.any(Number) })
  })

  test('refreshes expired data when switching member or Git panel context', async () => {
    await act(async () => root.render(<Harness workspace={workspace} selectionKey="api" />))
    refreshStatus.mockClear()
    vi.setSystemTime(Date.now() + 11_000)
    await act(async () => root.render(<Harness workspace={workspace} selectionKey="changes:web" />))
    expect(refreshStatus).toHaveBeenCalledTimes(2)
  })

  test('refreshes expired members on focus and visible return, then removes its listeners', async () => {
    await act(async () => root.render(<Harness workspace={workspace} />))
    refreshStatus.mockClear()
    vi.setSystemTime(Date.now() + 11_000)
    await act(async () => window.dispatchEvent(new Event('focus')))
    expect(refreshStatus).toHaveBeenCalledTimes(2)
    refreshStatus.mockClear()
    vi.setSystemTime(Date.now() + 11_000)
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    await act(async () => document.dispatchEvent(new Event('visibilitychange')))
    expect(refreshStatus).not.toHaveBeenCalled()
    visibility.mockReturnValue('visible')
    await act(async () => document.dispatchEvent(new Event('visibilitychange')))
    expect(refreshStatus).toHaveBeenCalledTimes(2)
    act(() => root.render(null))
    refreshStatus.mockClear()
    vi.setSystemTime(Date.now() + 11_000)
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(refreshStatus).not.toHaveBeenCalled()
  })

  test('uses the latest instance token when a member repository is reopened', async () => {
    await act(async () => root.render(<Harness workspace={workspace} />))
    refreshStatus.mockClear()
    const state = useReposStore.getState()
    const reopened = replaceRepo(state.repos['/repositories/api']!, (repo) => {
      repo.instanceToken += 1
      repo.resources.status.loadedAt = Date.now() - 20_000
    })
    await act(async () => useReposStore.setState({ repos: { ...state.repos, [reopened.id]: reopened } }))
    expect(refreshStatus).toHaveBeenCalledTimes(1)
    expect(refreshStatus).toHaveBeenCalledWith(reopened.id, { token: reopened.instanceToken })
  })

  test('lets other members refresh when one read fails', async () => {
    refreshStatus.mockRejectedValueOnce(new Error('read failed'))
    await act(async () => root.render(<Harness workspace={workspace} />))
    expect(refreshStatus).toHaveBeenCalledTimes(2)
    expect(useReposStore.getState().repos['/repositories/web']!.resources.status.loadedAt).toBe(Date.now())
  })
})
