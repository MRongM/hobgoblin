import { memo } from 'react'
import {
  ArrowDown,
  ArrowUp,
  CloudDownload,
  FolderMinus,
  FolderTree,
  GitBranch,
  GitBranchPlus,
  GitCommitHorizontal,
  GitMerge,
  Trash2,
} from 'lucide-react'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { Button } from '#/web/components/ui/button.tsx'
import { Tip } from '#/web/components/Tip.tsx'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { useResponsiveUiMode } from '#/web/hooks/useResponsiveUiMode.tsx'
import type { RepoEventAction } from '#/web/stores/repos/types.ts'

interface Props {
  repoId: string
}

const ACTION_ICONS: Record<RepoEventAction['kind'], typeof GitBranch> = {
  checkout: GitBranch,
  pull: ArrowDown,
  push: ArrowUp,
  commit: GitCommitHorizontal,
  merge: GitMerge,
  createWorktree: FolderTree,
  createBranch: GitBranchPlus,
  trackRemoteBranch: CloudDownload,
  deleteBranch: Trash2,
  removeWorktree: FolderMinus,
}

function actionTooltip(action: RepoEventAction): string {
  switch (action.kind) {
    case 'checkout':
      return `checkout: ${action.branch}`
    case 'pull':
      return `pull: ${action.branch}`
    case 'push':
      return `push: ${action.branch}`
    case 'commit':
      return `commit: ${action.message}`
    case 'merge':
      return `merge: ${action.sourceBranch}`
    case 'createWorktree':
      return `create worktree: ${action.branch}`
    case 'createBranch':
      return `create branch: ${action.branch}`
    case 'trackRemoteBranch':
      return `track: ${action.remoteRef}`
    case 'deleteBranch':
      return `delete: ${action.branch}`
    case 'removeWorktree':
      return `remove worktree: ${action.branch}`
  }
}

const ActionButton = memo(function ActionButton({
  action,
  repoId,
}: {
  action: RepoEventAction
  repoId: string
}) {
  const submitBranchAction = useReposStore((s) => s.submitBranchAction)
  const Icon = ACTION_ICONS[action.kind]

  function handleClick() {
    switch (action.kind) {
      case 'pull':
        submitBranchAction(repoId, { kind: 'pull', branch: action.branch, worktreePath: action.worktreePath })
        break
      case 'push':
        submitBranchAction(repoId, { kind: 'push', branch: action.branch })
        break
      case 'checkout':
        if (action.worktreePath) submitBranchAction(repoId, { kind: 'checkout', branch: action.branch })
        break
      case 'createBranch':
        submitBranchAction(repoId, { kind: 'createBranch', branch: action.branch, baseBranch: action.baseBranch })
        break
      case 'deleteBranch':
        submitBranchAction(repoId, { kind: 'deleteBranch', branch: action.branch })
        break
    }
  }

  return (
    <Tip label={actionTooltip(action)}>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={actionTooltip(action)}
        onClick={handleClick}
      >
        <Icon className="size-3.5" />
      </Button>
    </Tip>
  )
})

export function WorktreeActionHistory({ repoId }: Props) {
  const uiMode = useResponsiveUiMode()
  const actions = useStoreWithEqualityFn(
    useReposStore,
    (s) => {
      const repo = s.repos[repoId]
      if (!repo) return []
      const branch = repo.data.branches.find((b) => b.name === repo.ui.selectedBranch)
      const worktreePath = branch?.worktree?.path
      if (!worktreePath) return []
      return s.restorableRepoCache[repoId]?.ui?.worktreeActionHistories?.[worktreePath]?.slice(0, 3) ?? []
    },
    (a, b) => a.length === b.length && a.every((v, i) => v === b[i]),
  )

  if (uiMode === 'compact' || actions.length === 0) return null

  return (
    <div className="flex items-center gap-0.5">
      {actions.map((action, i) => (
        <ActionButton key={i} action={action} repoId={repoId} />
      ))}
    </div>
  )
}
