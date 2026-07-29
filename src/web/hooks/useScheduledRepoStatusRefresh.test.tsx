// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { emptyRepo } from '#/web/stores/repos/helpers.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { resetReposStore } from '#/web/stores/repos/test-utils.ts'
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

const originalRefreshStatus = useReposStore.getState().refreshStatus
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

function Harness() {
  useScheduledRepoStatusRefresh()
  return null
}

describe('useScheduledRepoStatusRefresh', () => {
  let container: HTMLDivElement
  let root: Root
  let refreshStatus: ReturnType<typeof vi.fn>

  beforeEach(() => {
    reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    settings.statusRefreshIntervalSec = 30
    resetReposStore()
    refreshStatus = vi.fn().mockResolvedValue(undefined)
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

  test('waits one interval, refreshes every eligible member, and stops when disabled', async () => {
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
    refreshStatus.mockRejectedValueOnce(new Error('api failed')).mockResolvedValue(undefined)

    await act(async () => {
      root.render(<Harness />)
    })
    expect(refreshStatus).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(29_999)
    })
    expect(refreshStatus).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(1)
      await Promise.resolve()
    })
    expect(refreshStatus).toHaveBeenCalledTimes(2)
    expect(refreshStatus).toHaveBeenCalledWith(api.id, { token: api.instanceToken })
    expect(refreshStatus).toHaveBeenCalledWith(web.id, { token: web.instanceToken })

    settings.statusRefreshIntervalSec = 0
    await act(async () => {
      root.render(<Harness />)
    })
    await act(async () => {
      vi.advanceTimersByTime(60_000)
    })
    expect(refreshStatus).toHaveBeenCalledTimes(2)
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
      root.render(<Harness />)
    })
    expect(vi.getTimerCount()).toBe(1)
    await act(async () => {
      vi.advanceTimersByTime(20_000)
      useReposStore.setState({ activeId: repoB.id, activeProjectId: repoB.id })
    })
    await act(async () => {
      vi.advanceTimersByTime(10_000)
    })
    expect(refreshStatus).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(20_000)
      await Promise.resolve()
    })
    expect(refreshStatus).toHaveBeenCalledWith(repoB.id, { token: repoB.instanceToken })

    act(() => root.unmount())
    expect(vi.getTimerCount()).toBe(0)
    root = createRoot(container)
  })
})
