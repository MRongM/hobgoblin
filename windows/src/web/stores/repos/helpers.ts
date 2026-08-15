import { produce, type Draft } from 'immer'
import { emptyRepoOperations } from '#/web/stores/repos/operations.ts'
import { emptyRepoResources } from '#/web/stores/repos/resources.ts'
import type {
  ExplorerTab,
  RepoEvent,
  RepoResultEventOptions,
  RepoState,
  ReposSet,
  ReposStore,
} from '#/web/stores/repos/types.ts'
import type { ExecResult } from '#/web/types.ts'

/** Resolve the explorer tab for the repo's currently selected branch. Falls
 *  back to the `''` key (used when no branch is selected, or as legacy
 *  per-repo state carried over from before per-branch tabs) and finally to
 *  a default based on worktree existence. */
export function explorerTabForRepo(repo: {
  ui: Pick<RepoState['ui'], 'selectedBranch' | 'explorerTabByBranch'>
  data: Pick<RepoState['data'], 'branches'>
}): ExplorerTab {
  const key = repo.ui.selectedBranch ?? ''
  const savedTab = repo.ui.explorerTabByBranch[key] ?? repo.ui.explorerTabByBranch['']

  if (savedTab) return savedTab

  // 检查是否有工作树
  const selectedBranch = repo.data.branches.find(branch => branch.name === repo.ui.selectedBranch)
  const hasWorktree = !!selectedBranch?.worktree?.path

  // 有工作树默认为 status，否则默认为 files
  return hasWorktree ? 'status' : 'files'
}

let nextInstanceToken = 1
let nextEventId = 1

const MAX_REPO_EVENTS = 50

type RepoMutator = (repo: Draft<RepoState>) => void
type ReposPatch = Pick<ReposStore, 'repos'>

export function emptyRepo(id: string, name: string): RepoState {
  return {
    id,
    name,
    isGitRepo: true,
    instanceToken: nextInstanceToken++,
    data: {
      branches: [],
      currentBranch: '',
      status: [],
      statusLoaded: false,
      worktreesByPath: {},
    },
    resources: emptyRepoResources(),
    operations: emptyRepoOperations(),
    ui: {
      selectedBranch: null,
      detailTab: 'status',
      explorerTabByBranch: {},
      workspaceLayout: 'left-right',
      worktreePathOrder: [],
    },
    projection: {
      source: 'fresh',
      savedAt: null,
    },
    remote: {
      remotes: [],
      remoteDetails: [],
      hasRemotes: false,
      hasBrowserRemote: false,
      browserRemoteProvider: undefined,
      remoteProviders: {},
      hasGitHubRemote: false,
      fetchFailed: false,
      fetchError: null,
    },
    availability: { phase: 'available' },
    events: [],
  }
}

export function clearGitProjection(repo: Draft<RepoState> | RepoState): void {
  const target = repo.remote.target
  repo.data.branches = []
  repo.data.currentBranch = ''
  repo.data.status = []
  repo.data.statusLoaded = false
  repo.data.worktreesByPath = {}
  repo.resources = emptyRepoResources()
  resetRepoOperations(repo)
  repo.ui.selectedBranch = null
  repo.ui.worktreePathOrder = []
  repo.projection = { source: 'fresh', savedAt: null }
  repo.remote = {
    ...(target ? { target } : {}),
    remotes: [],
    remoteDetails: [],
    hasRemotes: false,
    hasBrowserRemote: false,
    browserRemoteProvider: undefined,
    remoteProviders: {},
    hasGitHubRemote: false,
    fetchFailed: false,
    fetchError: null,
  }
}

export function resetRepoOperations(repo: Draft<RepoState> | RepoState): void {
  repo.operations = emptyRepoOperations()
}

export function rotateRepoInstanceToken(repo: Draft<RepoState> | RepoState): void {
  repo.instanceToken = nextInstanceToken++
}

export function resultEvent(result: ExecResult, options?: RepoResultEventOptions): RepoEvent {
  return { id: nextEventId++, kind: 'result', result, action: options?.action }
}

export function errorEvent(message: string): RepoEvent {
  return { id: nextEventId++, kind: 'error', message }
}

export function appendRepoEvent(events: RepoEvent[], event: RepoEvent): RepoEvent[] {
  return [...events, event].slice(-MAX_REPO_EVENTS)
}

/** Apply `mutator` to the repo at `id` only if its instanceToken still
 *  matches the captured one. The check runs inside the functional
 *  setter so it reads the freshest store state, not the caller's
 *  pre-await snapshot. */
export function updateIfFresh(set: ReposSet, id: string, token: number, mutator: RepoMutator): void {
  set((s) => {
    const repo = s.repos[id]
    if (!repo || repo.instanceToken !== token) return s
    return replaceRepoState(s, repo, mutator)
  })
}

export function replaceRepo(repo: RepoState, mutator: RepoMutator): RepoState {
  return produce(repo, mutator)
}

export function replaceRepoState(state: ReposPatch, repo: RepoState, mutator: RepoMutator): ReposPatch {
  const nextRepo = replaceRepo(repo, mutator)
  return nextRepo === repo ? state : { repos: { ...state.repos, [repo.id]: nextRepo } }
}
