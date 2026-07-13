import type { RepoEventAction, RestorableRepoSnapshot } from '#/web/stores/repos/types.ts'

const MAX_HISTORY_PER_WORKTREE = 10

export function extractWorktreePathFromAction(action: RepoEventAction): string | undefined {
  switch (action.kind) {
    case 'checkout':
    case 'push':
      return action.worktreePath
    case 'pull':
    case 'commit':
    case 'merge':
    case 'createWorktree':
    case 'removeWorktree':
      return action.worktreePath
    default:
      return undefined
  }
}

export function addActionToWorktreeHistory(
  snapshot: RestorableRepoSnapshot,
  action: RepoEventAction,
): RestorableRepoSnapshot | null {
  const worktreePath = extractWorktreePathFromAction(action)
  if (!worktreePath) return null
  const histories = snapshot.ui.worktreeActionHistories ?? {}
  const history = histories[worktreePath] ?? []
  const newHistory = [action, ...history].slice(0, MAX_HISTORY_PER_WORKTREE)
  return {
    ...snapshot,
    ui: {
      ...snapshot.ui,
      worktreeActionHistories: { ...histories, [worktreePath]: newHistory },
    },
  }
}
