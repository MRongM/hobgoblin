import { markRepoAvailable } from '#/web/stores/repos/availability.ts'
import { selectedBranchForBranchSet } from '#/web/stores/repos/branch-view-mode.ts'
import { cancelResource, finishResourceError, finishResourceSuccess } from '#/web/stores/repos/resources.ts'
import { canStartRemoteFetch } from '#/web/stores/repos/sync-state.ts'
import { stripBranchWorktreeMetadata, worktreeStatesFromBranches } from '#/web/stores/repos/worktree-state.ts'
import type { RepoSnapshot } from '#/shared/rpc.ts'
import type { RepoState, ReposGet } from '#/web/stores/repos/types.ts'
import type { ExecResult } from '#/web/types.ts'
import { isSelectableDetachedWorktree } from '#/web/stores/repos/worktree-selection.ts'

export function applySnapshotToRepoProjection(r: RepoState, snap: RepoSnapshot): void {
  const selected = selectedBranchForBranchSet({
    branches: snap.branches,
    currentBranch: snap.current,
    selectedBranch: r.ui.selectedBranch,
    viewMode: 'worktrees',
  })
  const branches = stripBranchWorktreeMetadata(snap.branches)
  r.data.branches = branches
  r.data.currentBranch = snap.current
  r.data.worktreesByPath = worktreeStatesFromBranches(snap.branches, r.data.worktreesByPath, r.data.status)
  r.ui.selectedBranch = r.ui.selectedDetachedWorktreePath ? null : selected
  if (snap.remote) {
    r.remote.remotes = snap.remote.remotes.map((remote) => remote.name)
    r.remote.remoteDetails = snap.remote.remotes
    r.remote.hasRemotes = snap.remote.hasRemotes
    r.remote.hasBrowserRemote = snap.remote.hasBrowserRemote
    r.remote.browserRemoteProvider = snap.remote.browserRemoteProvider
    r.remote.remoteProviders = snap.remote.remoteProviders
    r.remote.hasGitHubRemote = snap.remote.hasGitHubRemote
    if (!snap.remote.hasRemotes) {
      r.remote.fetchFailed = false
      r.remote.fetchError = null
    }
  }
  markRepoAvailable(r)
  if (
    r.ui.detailTab === 'terminal' &&
    !r.ui.selectedDetachedWorktreePath &&
    !branches.some((branch) => branch.name === selected && branch.worktree?.path)
  ) {
    r.ui.detailTab = 'status'
  }
  r.projection.source = 'fresh'
  r.projection.savedAt = null
  finishResourceSuccess(r.resources.snapshot)
}

export function reconcileRepoWorktreeSelectionAfterStatus(r: RepoState): void {
  const detachedPath = r.ui.selectedDetachedWorktreePath
  if (!detachedPath) return
  if (isSelectableDetachedWorktree(r.data.worktreesByPath[detachedPath])) {
    r.ui.selectedBranch = null
    return
  }
  r.ui.selectedDetachedWorktreePath = null
  r.ui.selectedBranch = selectedBranchForBranchSet({
    branches: r.data.branches,
    currentBranch: r.data.currentBranch,
    selectedBranch: r.ui.selectedBranch,
    viewMode: 'worktrees',
  })
  if (
    r.ui.detailTab === 'terminal' &&
    !r.data.branches.some((branch) => branch.name === r.ui.selectedBranch && branch.worktree?.path)
  ) {
    r.ui.detailTab = 'status'
  }
}

export function shouldAttemptFetch(repo: RepoState | null | undefined, token: number): boolean {
  return (
    !!repo &&
    repo.instanceToken === token &&
    repo.remote.hasRemotes === true &&
    repo.availability.phase !== 'unavailable'
  )
}

export function repoIfFresh(get: ReposGet, id: string, token: number): RepoState | null {
  const repo = get().repos[id]
  return repo && repo.instanceToken === token ? repo : null
}

export function resolveActionToken(
  get: ReposGet,
  id: string,
  token?: number,
): { repo: RepoState; token: number } | null {
  const repo = get().repos[id]
  if (!repo) return null
  const nextToken = token ?? repo.instanceToken
  if (repo.instanceToken !== nextToken) return null
  return { repo, token: nextToken }
}

export function applyFetchResourceResult(r: RepoState, result: ExecResult): void {
  if (result.ok) finishResourceSuccess(r.resources.fetch)
  else if (result.message !== 'cancelled') finishResourceError(r.resources.fetch, result.message)
  else cancelResource(r.resources.fetch)
}

export function applyFetchResourceError(r: RepoState, message: string): void {
  if (message === 'cancelled') cancelResource(r.resources.fetch)
  else finishResourceError(r.resources.fetch, message)
}

export function canRunRemoteFetchNow(repo: RepoState): boolean {
  return canStartRemoteFetch(repo)
}
