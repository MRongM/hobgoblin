import type { RepoBranchActionKind } from '#/web/stores/repos/branch-action-types.ts'
import type { RepoEventAction } from '#/web/stores/repos/types.ts'
export interface RepoActionLabel {
  labelKey: string
  labelParams?: Record<string, string | number>
}

const BRANCH_ACTION_LOADING_LABEL_KEYS: Record<RepoBranchActionKind, string> = {
  checkout: 'action.checkout-loading',
  pull: 'action.pull-loading',
  push: 'action.push-loading',
  alignRemote: 'action.align-remote-loading',
  createWorktree: 'action.create-worktree-creating-title',
  createBranch: 'action.create-branch-loading',
  trackRemoteBranch: 'action.pull-remote-branch-loading',
  setBranchUpstream: 'action.branch-upstream-updating',
  deleteBranch: 'action.delete-branch-deleting-title',
  cleanupWorktree: 'action.cleanup-invalid-worktree-cleaning-title',
  removeWorktree: 'action.remove-worktree-removing-title',
}

const BRANCH_ACTION_QUEUED_LABEL_KEYS: Record<RepoBranchActionKind, string> = {
  checkout: 'action.checkout-queued',
  pull: 'action.pull-queued',
  push: 'action.push-queued',
  alignRemote: 'action.align-remote-queued',
  createWorktree: 'action.create-worktree-queued-title',
  createBranch: 'action.create-branch-queued',
  trackRemoteBranch: 'action.pull-remote-branch-queued',
  setBranchUpstream: 'action.branch-upstream-queued',
  deleteBranch: 'action.delete-branch-queued-title',
  cleanupWorktree: 'action.cleanup-invalid-worktree-queued-title',
  removeWorktree: 'action.remove-worktree-queued-title',
}

export function repoBranchActionLoadingLabel(
  kind: RepoBranchActionKind,
  phase: 'queued' | 'running' = 'running',
): RepoActionLabel {
  return {
    labelKey:
      phase === 'queued'
        ? (BRANCH_ACTION_QUEUED_LABEL_KEYS[kind] ?? BRANCH_ACTION_LOADING_LABEL_KEYS[kind])
        : BRANCH_ACTION_LOADING_LABEL_KEYS[kind],
  }
}

export function repoEventActionSuccessLabel(action: RepoEventAction | undefined): RepoActionLabel | null {
  if (!action) return null
  switch (action.kind) {
    case 'createWorktree':
      return { labelKey: 'action.create-worktree-created-title' }
    case 'createBranch':
      return { labelKey: 'action.create-branch-created-title' }
    case 'trackRemoteBranch':
      return { labelKey: 'action.pull-remote-branch-created-title' }
    case 'setBranchUpstream':
      return { labelKey: 'action.branch-upstream-updated' }
    case 'removeWorktree':
      return {
        labelKey: action.alsoDeleteBranch
          ? 'action.remove-worktree-removed-with-branch-title'
          : 'action.remove-worktree-removed-title',
      }
    case 'cleanupWorktree':
      return { labelKey: 'action.cleanup-invalid-worktree-cleaned-title' }
    case 'deleteBranch':
      return { labelKey: 'action.delete-branch-deleted-title' }
    case 'checkout':
    case 'pull':
    case 'push':
    case 'alignRemote':
    case 'commit':
    case 'merge':
    case 'mergeOut':
      return null
  }
}
