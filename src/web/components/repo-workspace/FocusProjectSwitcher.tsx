// Focus mode hides the sidebar — and with it the project switcher in the
// sidebar header — so this dropdown keeps project switching reachable from
// the focus-mode window chrome. Pure single-select switcher: open/clone and
// close live in the sidebar.

import { ChevronDown, FolderGit2 } from 'lucide-react'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { useT } from '#/web/stores/i18n.ts'
import { useMainWindowNavigation } from '#/web/main-window-navigation.tsx'
import {
  ProjectTerminalStatus,
  projectLocation,
  useProjectSummaries,
} from '#/web/components/repo-workspace/project-switcher-model.tsx'
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

export function FocusProjectSwitcher({ repoId }: Props) {
  const t = useT()
  const navigation = useMainWindowNavigation()
  const activeName = useReposStore((s) => s.repos[repoId]?.name ?? '')
  const projects = useProjectSummaries()
  if (projects.length === 0) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-w-0 gap-1.5 px-1.5"
          data-testid="focus-project-switcher"
          aria-label={t('repo-tabs.repos')}
          title={activeName}
        >
          <FolderGit2 className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 max-w-40 truncate text-xs font-semibold uppercase tracking-wide">{activeName}</span>
          <ChevronDown className="size-3.5 shrink-0 text-topbar-muted-foreground" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-max max-w-80 overflow-y-auto">
        {projects.map((project) => {
          const active = project.id === repoId
          const location = projectLocation(project.id)
          return (
            <DropdownMenuItem
              key={project.id}
              aria-current={active ? 'true' : undefined}
              title={project.unavailable ? t('repo-unavailable.title') : location}
              className={cn(
                active && 'bg-selected text-selected-foreground',
                project.unavailable && 'opacity-60',
              )}
              onSelect={() => {
                if (!active) navigation.activateRepo(project.id)
              }}
            >
              <FolderGit2
                className={cn('size-4 shrink-0', active ? 'text-selected-muted-foreground' : 'text-muted-foreground')}
                aria-hidden="true"
              />
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="min-w-0 truncate text-[13px] font-medium leading-none">{project.name}</span>
                <ProjectTerminalStatus repoId={project.id} worktreePaths={project.worktreePaths} />
              </span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
