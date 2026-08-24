import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { fetchWorkspaceRepositories } from '#/web/workspace-repository-fetch.ts'
import { resetReposStore, seedRepoState } from '#/web/stores/repos/test-utils.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'

const ROOT = '/workspace'
const API = '/workspace/api'
const WEB = '/workspace/web'

describe('workspace repository fetch', () => {
  beforeEach(() => resetReposStore())
  afterEach(() => resetReposStore())

  test('syncs every configured repository using names and tokens read when the action starts', async () => {
    const api = seedRepoState({ id: API, name: 'api repo', instanceToken: 2 })
    const web = seedRepoState({ id: WEB, name: 'web repo', instanceToken: 3 })
    const syncAndRefresh = vi.fn(async () => ({ ok: true as const, message: 'fetched' }))
    useReposStore.setState({
      repos: { [API]: api, [WEB]: web },
      workspaceProjects: {
        [ROOT]: {
          rootId: ROOT,
          repositoryIds: [API, WEB],
          candidates: [
            { id: API, name: 'api', selected: true, available: true },
            { id: WEB, name: 'web', selected: true, available: true },
          ],
          configured: true,
          configurationError: null,
          phase: 'ready',
          skipped: [],
          error: null,
        },
      },
      syncAndRefresh,
    })

    useReposStore.setState((state) => ({
      repos: {
        ...state.repos,
        [API]: { ...state.repos[API]!, instanceToken: 12 },
        [WEB]: { ...state.repos[WEB]!, instanceToken: 13 },
      },
    }))

    await expect(fetchWorkspaceRepositories(ROOT)).resolves.toEqual({
      total: 2,
      succeeded: 2,
      failures: [],
    })
    expect(syncAndRefresh).toHaveBeenCalledTimes(2)
    expect(syncAndRefresh).toHaveBeenCalledWith(API, { token: 12 })
    expect(syncAndRefresh).toHaveBeenCalledWith(WEB, { token: 13 })
  })

  test('reports a configured member missing from the renderer projection without blocking other members', async () => {
    const api = seedRepoState({ id: API, name: 'api repo', instanceToken: 2 })
    const syncAndRefresh = vi.fn(async () => ({ ok: true as const, message: 'fetched' }))
    useReposStore.setState({
      repos: { [API]: api },
      workspaceProjects: {
        [ROOT]: {
          rootId: ROOT,
          repositoryIds: [API, WEB],
          candidates: [
            { id: API, name: 'api', selected: true, available: true },
            { id: WEB, name: 'web', selected: true, available: false },
          ],
          configured: true,
          configurationError: null,
          phase: 'ready',
          skipped: [],
          error: null,
        },
      },
      syncAndRefresh,
    })

    await expect(fetchWorkspaceRepositories(ROOT)).resolves.toEqual({
      total: 2,
      succeeded: 1,
      failures: [{ repositoryName: 'web', message: 'error.failed-read-repo' }],
    })
    expect(syncAndRefresh).toHaveBeenCalledOnce()
  })
})
