// Sidebar header — the window-chrome row at the very top of the sidebar.
// With the global topbar gone on desktop, this row is the OS drag region
// (the .topbar rules pad it past the macOS traffic lights) and hosts:
//   - the project switcher: clicking the current repository name toggles a
//     flat inline list of every open project (styled like the branch rows)
//   - a "+" menu with the open local / open remote / clone entries
//   - the sidebar collapse control, which maximizes the terminal pane via
//     the existing detail focus mode

import { useId, useState } from 'react'
import { ChevronDown, FolderGit2, PanelLeftClose, Plus, X } from 'lucide-react'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { useT } from '#/web/stores/i18n.ts'
import { useMainWindowNavigation } from '#/web/main-window-navigation.tsx'
import { useShellOverlayActions } from '#/web/shell-overlay-actions.tsx'
import { openRepoFromDialog } from '#/web/lib/open-repo-dialog.ts'
import { useRuntimeChromeSettings } from '#/web/runtime-settings-chrome.ts'
import { Button } from '#/web/components/ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/web/components/ui/dropdown-menu.tsx'
import { cn } from '#/web/lib/cn.ts'

interface Props {
  repoId: string
}

interface ProjectSummary {
  id: string
  name: string
  unavailable: boolean
}

function projectSummariesEqual(a: ProjectSummary[], b: ProjectSummary[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  return a.every(
    (item, index) =>
      item.id === b[index]!.id && item.name === b[index]!.name && item.unavailable === b[index]!.unavailable,
  )
}

export function SidebarProjectHeader({ repoId }: Props) {
  const t = useT()
  const listId = useId()
  const [listExpanded, setListExpanded] = useState(false)
  const navigation = useMainWindowNavigation()
  const shellActions = useShellOverlayActions()
  const ensureWorkspaceOpen = useReposStore((s) => s.ensureWorkspaceOpen)
  const toggleDetailFocusMode = useReposStore((s) => s.toggleDetailFocusMode)
  const { topbarHeightPx } = useRuntimeChromeSettings()
  const activeName = useReposStore((s) => s.repos[repoId]?.name ?? '')
  const projects = useStoreWithEqualityFn(
    useReposStore,
    (s) =>
      s.order
        .map<ProjectSummary | null>((id) => {
          const repo = s.repos[id]
          return repo
            ? {
                id: repo.id,
                name: repo.name,
                unavailable: repo.availability.phase === 'unavailable',
              }
            : null
        })
        .filter((summary): summary is ProjectSummary => summary !== null),
    projectSummariesEqual,
  )

  async function handleOpenLocal() {
    if (!shellActions) return
    await openRepoFromDialog({
      ensureWorkspaceOpen,
      activateRepo: navigation.activateRepo,
      openRepoPathDialog: shellActions.openRepoPathDialog,
      t,
    })
  }

  return (
    <div
      data-testid="sidebar-project-header"
      className="flex shrink-0 flex-col border-b border-topbar-border bg-topbar text-topbar-foreground"
    >
      <div className="topbar flex shrink-0 items-center gap-0.5" style={{ height: topbarHeightPx }}>
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
              <DropdownMenuItem onSelect={() => void handleOpenLocal()}>{t('repo-tabs.open-local')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={shellActions.openRemoteRepo}>{t('repo-tabs.open-remote')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={shellActions.openCloneRepo}>{t('repo-tabs.clone')}</DropdownMenuItem>
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
        <ul id={listId} className="max-h-48 overflow-y-auto border-t border-separator/70 py-1">
          {projects.map((project) => {
            const active = project.id === repoId
            return (
              <li key={project.id} className="group relative">
                <button
                  type="button"
                  onClick={() => navigation.activateRepo(project.id)}
                  aria-current={active ? 'true' : undefined}
                  title={project.unavailable ? t('repo-unavailable.title') : project.name}
                  className={cn(
                    'flex w-full min-w-0 items-center gap-2 py-1 pl-4 pr-7 text-left text-xs',
                    active
                      ? 'bg-selected text-selected-foreground'
                      : 'text-muted-foreground hover:bg-tab-hover hover:text-foreground',
                    project.unavailable && 'opacity-60',
                  )}
                >
                  <FolderGit2 className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{project.name}</span>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
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
      )}
    </div>
  )
}
