import { describe, expect, test } from 'vitest'
import { backgroundSyncRepoIdsFromStore } from '#/web/hooks/useBackgroundFetch.ts'
import { emptyRepo } from '#/web/stores/repos/helpers.ts'
import type { RepoState } from '#/web/stores/repos/types.ts'

describe('backgroundSyncRepoIdsFromStore', () => {
  test('registers all eligible members from either the workspace root or a selected member', () => {
    const root = emptyRepo('/workspace', 'workspace')
    root.isGitRepo = false
    const members = ['api', 'web', 'local', 'offline', 'docs'].map((name) => {
      const repo = emptyRepo(`/workspace/${name}`, name)
      repo.workspaceRootId = root.id
      repo.remote.hasRemotes = name !== 'local'
      return repo
    })
    members[3]!.availability = { phase: 'unavailable', reason: 'missing', checkedAt: 1 }
    members[4]!.isGitRepo = false
    const other = emptyRepo('/other', 'other')
    other.remote.hasRemotes = true
    const state = {
      activeId: root.id,
      repos: Object.fromEntries([root, ...members, other].map((repo) => [repo.id, repo])),
      workspaceProjects: {
        [root.id]: {
          rootId: root.id,
          repositoryIds: members.map((repo) => repo.id),
          candidates: [],
          configured: true,
          configurationError: null,
          phase: 'ready' as const,
          skipped: [],
          error: null,
        },
      },
    }
    expect(backgroundSyncRepoIdsFromStore(state)).toEqual(['/workspace/api', '/workspace/web'])
    expect(backgroundSyncRepoIdsFromStore({ ...state, activeId: members[0]!.id })).toEqual([
      '/workspace/api',
      '/workspace/web',
    ])
    expect(backgroundSyncRepoIdsFromStore({ ...state, activeId: other.id })).toEqual(['/other'])
    expect(backgroundSyncRepoIdsFromStore({ ...state, activeId: null })).toEqual([])
  })

  test('keeps the active remotely backed repo registered while local refresh resources are busy', () => {
    const repo = createRepo({
      id: '/repo',
      remote: { hasRemotes: true, hasGitHubRemote: true },
      availability: { phase: 'available' },
    })
    repo.resources.snapshot.phase = 'refreshing'
    repo.resources.status.phase = 'refreshing'
    repo.operations.snapshot.phase = 'running'
    repo.operations.status.phase = 'running'

    expect(
      backgroundSyncRepoIdsFromStore({ workspaceProjects: {}, activeId: '/repo', repos: { '/repo': repo } }),
    ).toEqual(['/repo'])
  })

  test('only registers the active repo and excludes local-only and unavailable repos', () => {
    const localOnly = createRepo({
      id: '/local',
      remote: { hasRemotes: false, hasGitHubRemote: false },
      availability: { phase: 'available' },
    })
    const unavailable = createRepo({
      id: '/down',
      remote: { hasRemotes: true, hasGitHubRemote: true },
      availability: { phase: 'unavailable', reason: 'error.failed-read-repo', checkedAt: Date.now() },
    })

    expect(
      backgroundSyncRepoIdsFromStore({
        workspaceProjects: {},
        activeId: '/local',
        repos: { '/local': localOnly, '/down': unavailable },
      }),
    ).toEqual([])
    expect(
      backgroundSyncRepoIdsFromStore({
        workspaceProjects: {},
        activeId: '/down',
        repos: { '/local': localOnly, '/down': unavailable },
      }),
    ).toEqual([])
  })
})

function createRepo(input: {
  id: string
  remote: { hasRemotes: boolean; hasGitHubRemote: boolean }
  availability: RepoState['availability']
}): RepoState {
  return {
    id: input.id,
    name: 'repo',
    isGitRepo: true,
    instanceToken: 1,
    data: {
      branches: [],
      currentBranch: '',
      status: [],
      statusLoaded: false,
      worktreesByPath: {},
    },
    resources: {
      fetch: { phase: 'idle', loadedAt: null, stale: false, error: null },
      snapshot: { phase: 'idle', loadedAt: null, stale: false, error: null },
      status: { phase: 'idle', loadedAt: null, stale: false, error: null },
    },
    operations: {
      fetch: {
        operationId: 0,
        phase: 'idle',
        reason: null,
        target: null,
        startedAt: null,
        settledAt: null,
        error: null,
      },
      manualRefresh: {
        operationId: 0,
        phase: 'idle',
        reason: null,
        target: null,
        startedAt: null,
        settledAt: null,
        error: null,
      },
      snapshot: {
        operationId: 0,
        phase: 'idle',
        reason: null,
        target: null,
        startedAt: null,
        settledAt: null,
        error: null,
      },
      status: {
        operationId: 0,
        phase: 'idle',
        reason: null,
        target: null,
        startedAt: null,
        settledAt: null,
        error: null,
      },
      branchAction: {
        operationId: 0,
        phase: 'idle',
        reason: null,
        target: null,
        startedAt: null,
        settledAt: null,
        error: null,
      },
    },
    ui: {
      selectedBranch: null,
      selectedDetachedWorktreePath: null,
      branchViewMode: 'all',
      detailTab: 'status',
      explorerTabByBranch: {},
      workspaceLayout: 'left-right',
      worktreePathOrder: [],
    },
    projection: { source: 'fresh', savedAt: null },
    remote: {
      remotes: [],
      remoteDetails: [],
      hasRemotes: input.remote.hasRemotes,
      hasBrowserRemote: input.remote.hasGitHubRemote,
      browserRemoteProvider: input.remote.hasGitHubRemote ? 'github' : undefined,
      remoteProviders: {},
      hasGitHubRemote: input.remote.hasGitHubRemote,
      fetchFailed: false,
      fetchError: null,
    },
    availability: input.availability,
    events: [],
  } as RepoState
}
