import { NON_GIT_WORKSPACE_TERMINAL_BRANCH, type TerminalLaunchMode } from '#/shared/terminal.ts'
import { useTerminalSessionContext } from '#/web/components/terminal/terminal-session-context.ts'
import type { TerminalSessionBase } from '#/web/components/terminal/types.ts'
import { useAsyncPending } from '#/web/hooks/useAsyncPending.ts'
import { useMainWindowNavigation } from '#/web/main-window-navigation.tsx'
import { repoPlainWorkspacePath } from '#/web/stores/repos/capabilities.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import type { RepoState } from '#/web/stores/repos/types.ts'
import { selectedRepoWorktree } from '#/web/stores/repos/worktree-selection.ts'

export interface ProjectInternalTerminalAction {
  disabled: boolean
  busy: boolean
  onSelect: (launchMode?: TerminalLaunchMode) => Promise<void>
}

export function resolveProjectInternalTerminalBase(repo: RepoState | null | undefined): TerminalSessionBase | null {
  if (!repo) return null
  const plainWorkspacePath = repoPlainWorkspacePath(repo)
  if (plainWorkspacePath) {
    return {
      repoRoot: repo.id,
      branch: NON_GIT_WORKSPACE_TERMINAL_BRANCH,
      worktreePath: plainWorkspacePath,
    }
  }
  if (repo.isGitRepo === false) return null
  const context = selectedRepoWorktree(repo)
  if (!context) return null
  return { repoRoot: repo.id, branch: context.terminalLabel, worktreePath: context.worktreePath }
}

export function useProjectInternalTerminalAction(projectId: string): ProjectInternalTerminalAction {
  const repo = useReposStore((state) => state.repos[projectId])
  const workspaceProject = useReposStore((state) => state.workspaceProjects[projectId])
  const activateWorkspaceOverview = useReposStore((state) => state.activateWorkspaceOverview)
  const setDetailCollapsed = useReposStore((state) => state.setDetailCollapsed)
  const navigation = useMainWindowNavigation()
  const { createTerminal } = useTerminalSessionContext()
  const { pending, isPending, run } = useAsyncPending<'internalTerminal'>()
  const terminalBase = resolveProjectInternalTerminalBase(repo)
  const disabled = !repo || repo.availability.phase === 'unavailable' || !terminalBase || isPending

  async function onSelect(launchMode: TerminalLaunchMode = 'native'): Promise<void> {
    if (disabled || !repo || !terminalBase) return
    await run('internalTerminal', async () => {
      if (repo.isGitRepo === false) {
        if (workspaceProject) activateWorkspaceOverview(projectId)
        else navigation.activateRepo(projectId)
      } else {
        const context = selectedRepoWorktree(repo)
        if (context?.kind === 'detached') {
          navigation.showRepoDetachedWorktreeDetailTab(projectId, context.worktreePath, 'terminal')
        } else {
          navigation.showRepoBranchDetailTab(projectId, terminalBase.branch, 'terminal')
        }
      }
      setDetailCollapsed(false)
      await createTerminal(terminalBase, launchMode)
    })
  }

  return { disabled, busy: pending === 'internalTerminal', onSelect }
}
