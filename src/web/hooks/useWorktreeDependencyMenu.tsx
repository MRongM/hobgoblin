import { FileMinus2, FilePlus2 } from 'lucide-react'
import type { BranchActionRepo } from '#/web/hooks/branch-action-state.ts'
import type { WorkspaceListItemAction } from '#/web/components/repo-workspace/WorkspaceListItem.tsx'
import { WorktreeDependencyDialog } from '#/web/components/repo-workspace/WorktreeDependencyDialog.tsx'
import { useRetainedDialogState } from '#/web/hooks/useRetainedDialogState.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { useT } from '#/web/stores/i18n.ts'

/** Repository rows target the primary worktree; detached rows pass their exact path. */
export function useWorktreeDependencyMenu(
  repo: (BranchActionRepo & { isGitRepo?: boolean }) | undefined,
  options: { worktreePath?: string; disabled?: boolean; visible?: boolean } = {},
) {
  const t = useT()
  const dialog = useRetainedDialogState<{ operation: 'add' | 'remove'; worktreePath: string }>()
  const worktrees = Object.values(repo?.data.worktreesByPath ?? {})
  const worktreePath = options.worktreePath ?? worktrees.find((entry) => entry.isMain)?.path
  const visible = options.visible !== false && !!repo && repo.isGitRepo !== false
  const disabled = options.disabled === true || !worktreePath || repo?.operations.branchAction.phase !== 'idle'
  const actions: WorkspaceListItemAction[] = visible
    ? (['add', 'remove'] as const).map((operation) => ({
        id: operation === 'add' ? 'addDependencies' : 'removeDependencies',
        category: 'dependencies',
        label: t(`worktree-dependencies.${operation}.action`),
        disabled,
        icon: operation === 'add' ? <FilePlus2 aria-hidden="true" /> : <FileMinus2 aria-hidden="true" />,
        onSelect: () => {
          if (worktreePath && !disabled) dialog.openWith({ operation, worktreePath })
        },
      }))
    : []
  return {
    actions,
    dialog:
      repo && dialog.payload ? (
        <WorktreeDependencyDialog
          open={dialog.open}
          operation={dialog.payload.operation}
          repoId={repo.id}
          worktreePath={dialog.payload.worktreePath}
          sourceWorktrees={worktrees
            .filter((entry) => !entry.isPrunable)
            .map((entry) => ({ path: entry.path, branch: entry.branch ?? '' }))}
          onOpenChange={(open) => {
            if (!open) dialog.close()
          }}
          onCompleted={() => useReposStore.getState().refreshCoreData(repo.id)}
        />
      ) : null,
  }
}
