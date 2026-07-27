import type { RepoState } from '#/web/stores/repos/types.ts'
import { resourceBusy } from '#/web/stores/repos/resources.ts'
import { getBranchWorktreeState, selectedBranchStatus } from '#/web/stores/repos/worktree-state.ts'
import type { BranchActionRepo } from '#/web/hooks/branch-action-state.ts'
export type SelectedBranchDetail = ReturnType<typeof getSelectedBranchDetail>
export type SelectedBranchDetailPresentation = ReturnType<typeof getSelectedBranchDetailPresentation>

export interface BranchDetailRepo extends BranchActionRepo {
  data: BranchActionRepo['data'] & Pick<RepoState['data'], 'branches' | 'statusLoaded'>
  ui: Pick<RepoState['ui'], 'selectedBranch' | 'detailTab'>
  resources: Pick<RepoState['resources'], 'status'>
  remote: BranchActionRepo['remote'] & Pick<RepoState['remote'], 'target'>
}

// Keep this equality in sync with fields read by branch-detail consumers.
export function branchDetailRepoEqual(a: BranchDetailRepo | undefined, b: BranchDetailRepo | undefined): boolean {
  return (
    a === b ||
    (!!a &&
      !!b &&
      a.id === b.id &&
      a.instanceToken === b.instanceToken &&
      a.data.branches === b.data.branches &&
      a.data.currentBranch === b.data.currentBranch &&
      a.data.status === b.data.status &&
      a.data.statusLoaded === b.data.statusLoaded &&
      a.data.worktreesByPath === b.data.worktreesByPath &&
      a.ui.selectedBranch === b.ui.selectedBranch &&
      a.ui.detailTab === b.ui.detailTab &&
      a.resources.status === b.resources.status &&
      a.operations.branchAction === b.operations.branchAction &&
      a.operations.fetch === b.operations.fetch &&
      a.operations.manualRefresh === b.operations.manualRefresh &&
      a.remote.target === b.remote.target &&
      a.remote.hasRemotes === b.remote.hasRemotes &&
      a.remote.hasBrowserRemote === b.remote.hasBrowserRemote &&
      a.remote.hasGitHubRemote === b.remote.hasGitHubRemote &&
      a.remote.browserRemoteProvider === b.remote.browserRemoteProvider &&
      a.remote.remoteProviders === b.remote.remoteProviders)
  )
}

export function getSelectedBranchDetail(repo: BranchDetailRepo) {
  const branch = repo.data.branches.find((b) => b.name === repo.ui.selectedBranch) ?? null
  const selectedStatus = selectedBranchStatus(repo, branch)
  const worktreeState = branch ? getBranchWorktreeState(repo, branch) : null
  const statusCount = worktreeState?.changeCount ?? selectedStatus.reduce((n, wt) => n + wt.entries.length, 0)

  return { branch, selectedStatus, statusCount, worktreeState, remoteTarget: repo.remote.target }
}

export function getSelectedBranchDetailPresentation(repo: BranchDetailRepo) {
  const detail = getSelectedBranchDetail(repo)
  const statusLoading = resourceBusy(repo.resources.status)

  return {
    ...detail,
    loading: {
      status: statusLoading,
    },
    errors: {
      status: repo.resources.status.error,
    },
    stale: {
      status: repo.resources.status.stale,
    },
  }
}
