// Sidebar project list — every open repository as one slim row, sitting
// above the branch area. This replaces the topbar repo tab strip on desktop
// layouts; the "+" menu carries the previous Open local / remote / Clone
// entries. Rows activate on click and reveal their close button on hover.

import { FolderGit2, Plus, X } from 'lucide-react'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { useT } from '#/web/stores/i18n.ts'
import { useMainWindowNavigation } from '#/web/main-window-navigation.tsx'
import { useShellOverlayActions } from '#/web/shell-overlay-actions.tsx'
import { openRepoFromDialog } from '#/web/lib/open-repo-dialog.ts'
import { Button } from '#/web/components/ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/web/components/ui/dropdown-menu.tsx'
import { cn } from '#/web/lib/cn.ts'

interface Props {
  activeRepoId: string | null
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

export function ProjectListSection({ activeRepoId }: Props) {
  const t = useT()
  const navigation = useMainWindowNavigation()
  const shellActions = useShellOverlayActions()
  const ensureWorkspaceOpen = useReposStore((s) => s.ensureWorkspaceOpen)
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
    <section
      aria-label={t('repo-tabs.repos')}
      data-testid="project-list-section"
      className="flex max-h-48 shrink-0 flex-col border-b border-separator/70"
    >
      <div className="flex h-7 shrink-0 items-center justify-between pl-3 pr-1.5">
        <div className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {t('repo-tabs.repos')}
        </div>
        {shellActions && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
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
      </div>
      <ul className="min-h-0 overflow-y-auto pb-1">
        {projects.map((project) => {
          const active = project.id === activeRepoId
          return (
            <li key={project.id} className="group relative">
              <button
                type="button"
                onClick={() => navigation.activateRepo(project.id)}
                aria-current={active ? 'true' : undefined}
                title={project.unavailable ? t('repo-unavailable.title') : project.name}
                className={cn(
                  'flex w-full min-w-0 items-center gap-2 py-1 pl-3 pr-7 text-left text-xs',
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
                onClick={() => navigation.closeRepo(project.id)}
              >
                <X />
              </Button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
