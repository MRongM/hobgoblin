// Bottom status bar of the sidebar column — uses the sidebar header's token
// family while remaining visually continuous with navigation. The terminal
// pane keeps the window's full height. Left corner is the ambient app chrome
// (settings entry + project theme); the right side shows the selected branch.
// App also renders it full-width on the desktop empty state (repoId null) so
// the settings entry never disappears.

import { GitBranch, PanelBottomClose, PanelBottomOpen, Settings } from 'lucide-react'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { useT } from '#/web/stores/i18n.ts'
import { useShellOverlayActions } from '#/web/shell-overlay-actions.tsx'
import { Tip } from '#/web/components/Tip.tsx'
import { AsyncButton } from '#/web/components/AsyncButton.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { ProjectThemeMenuConnected } from '#/web/components/repo-toolbar/ProjectThemeMenu.tsx'
import { RepoActivityControl } from '#/web/components/repo-activity/RepoActivityControl.tsx'
import { TerminalStatusActions } from '#/web/components/terminal/TerminalStatusActions.tsx'
import { refreshBranchWorkspaceQuery } from '#/web/branch-workspace-queries.ts'
import { mainWindowQueryClient } from '#/web/main-window-queries.ts'
import { cn } from '#/web/lib/cn.ts'

interface Props {
  repoId: string | null
  fileAreaCollapsed?: boolean
  onToggleFileArea?: () => void
}

interface StatusBarRepoSummary {
  branch: string | null
  isGitRepo: boolean
}

export function StatusBar({ repoId, fileAreaCollapsed, onToggleFileArea }: Props) {
  const t = useT()
  const shellActions = useShellOverlayActions()
  const summary = useStoreWithEqualityFn(
    useReposStore,
    (s): StatusBarRepoSummary | null => {
      const repo = repoId ? s.repos[repoId] : undefined
      if (!repo) return null
      return {
        branch: repo.ui.selectedBranch ?? repo.data.currentBranch ?? null,
        isGitRepo: repo.isGitRepo !== false,
      }
    },
    (a, b) => a === b || (!!a && !!b && a.branch === b.branch && a.isGitRepo === b.isGitRepo),
  )

  async function refreshRepositoryState() {
    if (!repoId) return
    const state = useReposStore.getState()
    const repo = state.repos[repoId]
    if (!repo || repo.isGitRepo === false) return
    const refreshes: Promise<unknown>[] = [state.refreshCoreData(repo.id, { token: repo.instanceToken })]
    if (repo.workspaceRootId) {
      refreshes.push(refreshBranchWorkspaceQuery(mainWindowQueryClient, repo.workspaceRootId))
    }
    await Promise.allSettled(refreshes)
  }

  return (
    <footer
      data-testid="statusbar"
      className="flex h-7 shrink-0 items-center gap-1 bg-topbar px-1.5 text-xs text-topbar-muted-foreground"
    >
      {shellActions && (
        <Tip label={t('topbar.settings')}>
          <Button
            data-settings-trigger
            variant="ghost"
            size="icon-sm"
            className={cn(
              shellActions.settingsOpen && 'pointer-events-auto relative z-[60] bg-accent text-accent-foreground',
            )}
            onClick={shellActions.openSettings}
            aria-label={t('topbar.settings')}
            aria-pressed={shellActions.settingsOpen}
          >
            <Settings />
          </Button>
        </Tip>
      )}
      {repoId && <ProjectThemeMenuConnected repoId={repoId} />}
      {repoId && <TerminalStatusActions repoId={repoId} />}
      {repoId && onToggleFileArea && fileAreaCollapsed !== undefined && (
        <Tip label={t(fileAreaCollapsed ? 'file-area.expand' : 'file-area.collapse')}>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onToggleFileArea}
            aria-label={t(fileAreaCollapsed ? 'file-area.expand' : 'file-area.collapse')}
            aria-expanded={!fileAreaCollapsed}
          >
            {fileAreaCollapsed ? <PanelBottomOpen /> : <PanelBottomClose />}
          </Button>
        </Tip>
      )}
      <div className="min-w-0 flex-1" aria-hidden="true" />
      {summary && (
        <div className="flex min-w-0 items-center gap-1.5 pr-1">
          {/* Sync/activity for plain (non-git) workspaces — its previous
           * home was the topbar, which desktop no longer renders. */}
          {repoId && !summary.isGitRepo && (
            <RepoActivityControl repoId={repoId} compact mutedForegroundClassName="text-topbar-muted-foreground" />
          )}
          {summary.branch && (
            <Tip label={t('action.fetch-local-title')}>
              <AsyncButton
                type="button"
                variant="ghost"
                size="sm"
                className="min-w-0 max-w-full shrink gap-1.5 px-1 font-normal text-topbar-foreground"
                aria-label={t('action.fetch-local-title')}
                onClick={refreshRepositoryState}
              >
                {({ busy }) => (
                  <>
                    <GitBranch className={cn('size-3 shrink-0', busy && 'animate-pulse')} aria-hidden="true" />
                    <span className="min-w-0 truncate">{summary.branch}</span>
                  </>
                )}
              </AsyncButton>
            </Tip>
          )}
        </div>
      )}
    </footer>
  )
}
