// Sidebar header — the window-chrome row at the very top of the sidebar.
// With the global topbar gone on desktop, this row is the OS drag region
// (the .topbar rules pad it past the macOS traffic lights) and hosts:
//   - the project switcher: clicking the current repository name toggles a
//     flat inline list of every open project (styled like the branch rows)
//   - a "+" menu with the open local / open remote / clone entries
//   - the sidebar collapse control, which maximizes the terminal pane via
//     the existing detail focus mode

import { useId, useState } from 'react'
import {
  ChevronDown,
  Download,
  Folder,
  FolderGit2,
  FolderOpen,
  FolderTree,
  PanelLeftClose,
  PanelRightOpen,
  Plus,
  Server,
  Trash2,
} from 'lucide-react'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { useT } from '#/web/stores/i18n.ts'
import { useMainWindowNavigation } from '#/web/main-window-navigation.tsx'
import { useShellOverlayActions } from '#/web/shell-overlay-actions.tsx'
import { openRepoFromDialog } from '#/web/lib/open-repo-dialog.ts'
import { useRuntimeChromeSettings } from '#/web/runtime-settings-chrome.ts'
import { useIsCompactUi } from '#/web/hooks/useResponsiveUiMode.tsx'
import { ProjectTerminalStatus, useProjectSummaries } from '#/web/components/repo-workspace/project-switcher-model.tsx'
import { SidebarProjectList } from '#/web/components/repo-workspace/SidebarProjectList.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { ConfirmDialog } from '#/web/components/ConfirmDialog.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/web/components/ui/dropdown-menu.tsx'
import { cn } from '#/web/lib/cn.ts'
import { activeProjectId as selectActiveProjectId } from '#/web/stores/repos/workspace-projects.ts'
import { WorkspaceRepositorySwitcher } from '#/web/components/repo-workspace/WorkspaceRepositorySwitcher.tsx'

interface Props {
  repoId: string
  onShowCompactDetail?: () => void
  onShowCompactFiles?: () => void
  onMaximizeTerminal?: () => void
  onFileAreaItemDoubleClick?: () => void
}

export function SidebarProjectHeader({
  repoId,
  onShowCompactDetail,
  onShowCompactFiles,
  onMaximizeTerminal,
  onFileAreaItemDoubleClick,
}: Props) {
  const t = useT()
  const listId = useId()
  const listExpanded = useReposStore((state) => state.projectListExpanded)
  const toggleProjectListExpanded = useReposStore((state) => state.toggleProjectListExpanded)
  const [confirmClearCacheOpen, setConfirmClearCacheOpen] = useState(false)
  const navigation = useMainWindowNavigation()
  const shellActions = useShellOverlayActions()
  const ensureWorkspaceOpen = useReposStore((s) => s.ensureWorkspaceOpen)
  const reorderRepos = useReposStore((s) => s.reorderRepos)
  const { topbarHeightPx } = useRuntimeChromeSettings()
  const compact = useIsCompactUi()
  const activeProjectId = useReposStore(selectActiveProjectId) ?? repoId
  const activeName = useReposStore((s) => s.repos[activeProjectId]?.name ?? '')
  const projects = useProjectSummaries()

  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null
  const activeProjectKind = activeProject?.isGitRepo === false ? 'plain' : 'git'
  const ActiveProjectIcon = activeProjectKind === 'plain' ? Folder : FolderGit2

  async function handleOpenLocal() {
    if (!shellActions) return
    await openRepoFromDialog({
      ensureWorkspaceOpen,
      activateRepo: navigation.activateRepo,
      openRepoPathDialog: shellActions.openRepoPathDialog,
      t,
    })
  }

  const handleClearCacheConfirmed = () => {
    // Clears the storage for ALL repos on this origin (goblin.repo-store,
    // terminal client id) — hence the confirm gate before it runs. Same
    // behavior as the repo tab strip's entry (compact UI).
    try {
      localStorage.clear()
      sessionStorage.clear()
      window.location.reload()
    } catch (err) {
      console.error('[gbl] failed to clear cache', err)
    } finally {
      setConfirmClearCacheOpen(false)
    }
  }

  return (
    <div data-testid="sidebar-project-header" className="flex shrink-0 flex-col bg-topbar text-topbar-foreground">
      <div
        className="topbar flex min-w-0 shrink-0 items-center gap-0.5 overflow-hidden"
        style={{ height: topbarHeightPx }}
      >
        {onShowCompactDetail && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onShowCompactDetail}
            aria-label={t('mobile.show-terminal')}
            title={t('mobile.show-terminal')}
          >
            <PanelRightOpen />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn('min-w-0 gap-1.5 px-1.5', compact && 'flex-1 shrink overflow-hidden')}
          onClick={toggleProjectListExpanded}
          data-project-kind={activeProjectKind}
          aria-expanded={listExpanded}
          aria-controls={listExpanded ? listId : undefined}
          aria-label={t('repo-tabs.repos')}
          title={activeName}
        >
          <ActiveProjectIcon className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide">{activeName}</span>
          {activeProject && !listExpanded && (
            <ProjectTerminalStatus
              terminalWorktreeKeys={activeProject.terminalWorktreeKeys}
              branchWorkspaceRootId={activeProject.branchWorkspaceRootId}
            />
          )}
          <ChevronDown
            className={cn(
              'size-3.5 shrink-0 text-topbar-muted-foreground transition-transform',
              !listExpanded && '-rotate-90',
            )}
            aria-hidden="true"
          />
        </Button>
        {onShowCompactDetail && <WorkspaceRepositorySwitcher repoId={repoId} compact />}
        <div className={cn('min-w-0 flex-1', compact && 'hidden')} aria-hidden="true" />
        {shellActions && !compact && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('topbar.open')}
                title={t('topbar.open')}
              >
                <Plus />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => void handleOpenLocal()}>
                <FolderOpen />
                {t('repo-tabs.open-local')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={shellActions.openRemoteRepo}>
                <Server />
                {t('repo-tabs.open-remote')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={shellActions.openCloneRepo}>
                <Download />
                {t('repo-tabs.clone')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setConfirmClearCacheOpen(true)}>
                <Trash2 />
                {t('error.clear-cache')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {!compact && onShowCompactFiles && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onShowCompactFiles}
            aria-label={t('file-tree.title')}
            title={t('file-tree.title')}
          >
            <FolderTree />
          </Button>
        )}
        {!onShowCompactDetail && onMaximizeTerminal && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onMaximizeTerminal}
            aria-label={t('branch-detail.focus')}
            title={t('branch-detail.focus-title')}
          >
            <PanelLeftClose />
          </Button>
        )}
      </div>
      {listExpanded && (
        <div>
          <div className="flex h-7 shrink-0 items-center px-4 pt-1 text-[length:var(--goblin-project-titlebar-font-size)] font-semibold uppercase tracking-[0.08em] text-topbar-muted-foreground">
            {t('repo-tabs.repos')}
          </div>
          <SidebarProjectList
            id={listId}
            projects={projects}
            activeRepoId={activeProjectId}
            onActivate={navigation.activateRepo}
            onClose={navigation.closeRepo}
            onReorder={reorderRepos}
            onToggleFileArea={onFileAreaItemDoubleClick}
          />
        </div>
      )}
      <ConfirmDialog
        open={confirmClearCacheOpen}
        title={t('repo-tabs.clear-cache-confirm-title')}
        message={t('repo-tabs.clear-cache-confirm-message')}
        confirmLabel={t('repo-tabs.clear-cache-confirm')}
        destructive
        onCancel={() => setConfirmClearCacheOpen(false)}
        onConfirm={handleClearCacheConfirmed}
      />
    </div>
  )
}
