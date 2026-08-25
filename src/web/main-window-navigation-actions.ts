import type { DetailTab } from '#/web/stores/repos/types.ts'
import type { SettingsPage } from '#/shared/settings-pages.ts'

export interface MainWindowNavigationActions {
  activateRepo: (repoId: string) => void
  closeRepo: (repoId: string) => void
  cycleRepo: (direction: 1 | -1) => void
  selectRepoBranch: (repoId: string, branch: string) => void
  selectRepoDetachedWorktree: (repoId: string, worktreePath: string) => void
  showRepoDetailTab: (repoId: string, tab: DetailTab) => void
  showRepoBranchDetailTab: (repoId: string, branch: string, tab: DetailTab) => void
  showRepoDetachedWorktreeDetailTab: (repoId: string, worktreePath: string, tab: DetailTab) => void
  openSettings: (page: SettingsPage) => void
}

interface CreateMainWindowNavigationActionsOptions {
  activeId: string | null
  setActive: (repoId: string) => void
  activateProject?: (projectId: string) => void
  closeRepo: (repoId: string) => void
  cycleActive: (direction: 1 | -1) => void
  selectBranch: (repoId: string, branch: string) => void
  selectDetachedWorktree: (repoId: string, worktreePath: string) => void
  setDetailTab: (repoId: string, tab: DetailTab) => void
  onOpenSettings?: (page: SettingsPage) => void
}

export function createMainWindowNavigationActions({
  activeId,
  setActive,
  activateProject,
  closeRepo,
  cycleActive,
  selectBranch,
  selectDetachedWorktree,
  setDetailTab,
  onOpenSettings,
}: CreateMainWindowNavigationActionsOptions): MainWindowNavigationActions {
  return {
    activateRepo(repoId) {
      ;(activateProject ?? setActive)(repoId)
    },
    closeRepo(repoId) {
      closeRepo(repoId)
    },
    cycleRepo(direction) {
      cycleActive(direction)
    },
    selectRepoBranch(repoId, branch) {
      if (repoId !== activeId) setActive(repoId)
      selectBranch(repoId, branch)
    },
    selectRepoDetachedWorktree(repoId, worktreePath) {
      if (repoId !== activeId) setActive(repoId)
      selectDetachedWorktree(repoId, worktreePath)
    },
    showRepoDetailTab(repoId, tab) {
      if (repoId !== activeId) setActive(repoId)
      setDetailTab(repoId, tab)
    },
    showRepoBranchDetailTab(repoId, branch, tab) {
      if (repoId !== activeId) setActive(repoId)
      selectBranch(repoId, branch)
      setDetailTab(repoId, tab)
    },
    showRepoDetachedWorktreeDetailTab(repoId, worktreePath, tab) {
      if (repoId !== activeId) setActive(repoId)
      selectDetachedWorktree(repoId, worktreePath)
      setDetailTab(repoId, tab)
    },
    openSettings(page) {
      onOpenSettings?.(page)
    },
  }
}
