// Sidebar header — the window-chrome row at the very top of the sidebar.
// With the global topbar gone on desktop, this row is the OS drag region
// (the .topbar rules pad it past the macOS traffic lights) and hosts:
//   - the project switcher: clicking the current repository name toggles a
//     flat inline list of every open project (styled like the branch rows)
//   - a "+" menu with the open local / open remote / clone entries
//   - the sidebar collapse control, which maximizes the terminal pane via
//     the existing detail focus mode

import { useId, useState } from 'react'
import { ChevronDown, Download, FolderGit2, FolderOpen, PanelLeftClose, Plus, Server, Trash2, X } from 'lucide-react'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { useT } from '#/web/stores/i18n.ts'
import { useMainWindowNavigation } from '#/web/main-window-navigation.tsx'
import { useShellOverlayActions } from '#/web/shell-overlay-actions.tsx'
import { openRepoFromDialog } from '#/web/lib/open-repo-dialog.ts'
import { useRuntimeChromeSettings } from '#/web/runtime-settings-chrome.ts'
import {
  ProjectTerminalStatus,
  projectLocation,
  useProjectSummaries,
} from '#/web/components/repo-workspace/project-switcher-model.tsx'
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

interface Props {
  repoId: string
}

export function SidebarProjectHeader({ repoId }: Props) {
  const t = useT()
  const listId = useId()
  const [listExpanded, setListExpanded] = useState(false)
  const [confirmClearCacheOpen, setConfirmClearCacheOpen] = useState(false)
  const navigation = useMainWindowNavigation()
  const shellActions = useShellOverlayActions()
  const ensureWorkspaceOpen = useReposStore((s) => s.ensureWorkspaceOpen)
  const toggleDetailFocusMode = useReposStore((s) => s.toggleDetailFocusMode)
  const { topbarHeightPx } = useRuntimeChromeSettings()
  const activeName = useReposStore((s) => s.repos[repoId]?.name ?? '')
  const projects = useProjectSummaries()

  const activeProject = projects.find((project) => project.id === repoId) ?? null

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
    <div
      data-testid="sidebar-project-header"
      className="flex shrink-0 flex-col border-b border-topbar-border bg-topbar text-topbar-foreground"
    >
      {/* The bottom border lives on the outer wrapper (it must also wrap the
          expanded project list), so subtract it here to keep the collapsed
          header at exactly topbarHeightPx — the same border-box height every
          other topbar row (Toolbar chrome="topbar", Topbar) renders with. */}
      <div className="topbar flex shrink-0 items-center gap-0.5" style={{ height: topbarHeightPx - 1 }}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-w-0 gap-1.5 px-1.5"
          onClick={() => setListExpanded((expanded) => !expanded)}
          aria-expanded={listExpanded}
          aria-controls={listExpanded ? listId : undefined}
          aria-label={t('repo-tabs.repos')}
          title={activeName}
        >
          <FolderGit2 className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide">{activeName}</span>
          {activeProject && (
            <ProjectTerminalStatus repoId={activeProject.id} worktreePaths={activeProject.worktreePaths} />
          )}
          <ChevronDown
            className={cn(
              'size-3.5 shrink-0 text-topbar-muted-foreground transition-transform',
              !listExpanded && '-rotate-90',
            )}
            aria-hidden="true"
          />
        </Button>
        <div className="min-w-0 flex-1" aria-hidden="true" />
        {shellActions && (
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
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={toggleDetailFocusMode}
          aria-label={t('branch-detail.focus')}
          title={t('branch-detail.focus-title')}
        >
          <PanelLeftClose />
        </Button>
      </div>
      {listExpanded && (
        <div id={listId} className="border-t border-separator/70">
          <div className="flex h-7 shrink-0 items-center px-4 pt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-topbar-muted-foreground">
            {t('repo-tabs.repos')}
          </div>
          <ul className="max-h-72 overflow-y-auto px-1.5 pb-2">
            {projects.map((project) => {
              const active = project.id === repoId
              const location = projectLocation(project.id)
              return (
                <li key={project.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => navigation.activateRepo(project.id)}
                    aria-current={active ? 'true' : undefined}
                    title={project.unavailable ? t('repo-unavailable.title') : location}
                    className={cn(
                      'flex w-full min-w-0 items-start gap-2.5 rounded-[var(--goblin-brand-radius-md,var(--radius-md))] py-2 pl-2.5 pr-9 text-left transition-colors duration-100',
                      active ? 'bg-selected text-selected-foreground' : 'text-foreground hover:bg-tab-hover',
                      project.unavailable && 'opacity-60',
                    )}
                  >
                    <FolderGit2
                      className={cn(
                        'mt-px size-4 shrink-0',
                        active ? 'text-selected-muted-foreground' : 'text-muted-foreground',
                      )}
                      aria-hidden="true"
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="min-w-0 truncate text-[13px] font-medium leading-none">{project.name}</span>
                        <ProjectTerminalStatus repoId={project.id} worktreePaths={project.worktreePaths} />
                      </span>
                      <span
                        className={cn(
                          'min-w-0 truncate font-mono text-[11px] leading-none',
                          active ? 'text-selected-muted-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {location}
                      </span>
                    </span>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                    aria-label={t('repo-tabs.close-named', { name: project.name })}
                    title={t('repo-tabs.close-named', { name: project.name })}
                    onClick={() => navigation.closeRepo(project.id)}
                  >
                    <X />
                  </Button>
                </li>
              )
            })}
          </ul>
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
