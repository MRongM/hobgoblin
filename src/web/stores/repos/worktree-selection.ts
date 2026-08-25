import type { RepoBranchState, RepoState, RepoWorktreeState } from '#/web/stores/repos/types.ts'

type RepoSelectionSource = {
  data: Pick<RepoState['data'], 'branches' | 'worktreesByPath'>
  ui: Pick<RepoState['ui'], 'selectedBranch' | 'selectedDetachedWorktreePath'>
}

export interface SelectedRepoWorktreeContext {
  kind: 'branch' | 'detached'
  branch: RepoBranchState | null
  worktree: RepoWorktreeState
  worktreePath: string
  historyRef: string | null
  terminalLabel: string
}

export function detachedHeadTerminalLabel(worktree: Pick<RepoWorktreeState, 'head'>): string {
  return worktree.head ? `HEAD@${worktree.head.slice(0, 12)}` : 'HEAD'
}

export function isSelectableDetachedWorktree(worktree: RepoWorktreeState | undefined): worktree is RepoWorktreeState {
  return !!worktree && worktree.isDetached === true && !worktree.isMain && !worktree.isPrunable
}

export function selectedRepoWorktree(repo: RepoSelectionSource): SelectedRepoWorktreeContext | null {
  const detachedPath = repo.ui.selectedDetachedWorktreePath
  const detached = detachedPath ? repo.data.worktreesByPath[detachedPath] : undefined
  if (isSelectableDetachedWorktree(detached)) {
    return {
      kind: 'detached',
      branch: null,
      worktree: detached,
      worktreePath: detached.path,
      historyRef: detached.head ?? null,
      terminalLabel: detachedHeadTerminalLabel(detached),
    }
  }

  const branch = repo.data.branches.find((candidate) => candidate.name === repo.ui.selectedBranch)
  const worktreePath = branch?.worktree?.path
  if (!branch || !worktreePath) return null
  const worktree = repo.data.worktreesByPath[worktreePath] ?? {
    path: worktreePath,
    branch: branch.name,
    isMain: false,
  }
  return {
    kind: 'branch',
    branch,
    worktree,
    worktreePath,
    historyRef: branch.name,
    terminalLabel: branch.name,
  }
}

export function selectedWorktreeTabKey(repo: RepoSelectionSource): string {
  const context = selectedRepoWorktree(repo)
  if (context?.kind === 'detached') return `detached:${context.worktreePath}`
  return repo.ui.selectedBranch ?? ''
}
