// Focus mode hides the sidebar — and with it the project switcher in the
// sidebar header — so this dropdown keeps project switching reachable from
// the focus-mode window chrome. Pure single-select switcher: open/clone and
// close live in the sidebar.

import { ChevronDown, Folder, FolderGit2 } from 'lucide-react'
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
import { workspaceRootIdForRepo } from '#/web/stores/repos/workspace-projects.ts'

interface Props {
  repoId: string
  compact?: boolean
}

export function FocusProjectSwitcher({ repoId, compact = false }: Props) {
  const t = useT()
  const navigation = useMainWindowNavigation()
  const activeProjectId = useReposStore((s) => workspaceRootIdForRepo(s, repoId) ?? repoId)
  const activeName = useReposStore((s) => s.repos[activeProjectId]?.name ?? '')
  const projects = useProjectSummaries()
  if (projects.length === 0) return null
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null
  const ActiveProjectIcon = activeProject?.isGitRepo === false ? Folder : FolderGit2

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
          <ActiveProjectIcon className="size-4 shrink-0" aria-hidden="true" />
          <span
            className={cn(
              'min-w-0 truncate text-xs font-semibold uppercase tracking-wide',
              compact ? 'max-w-16' : 'max-w-40',
            )}
          >
            {activeName}
          </span>
          <ChevronDown
            className={cn('size-3.5 shrink-0', compact ? 'text-muted-foreground' : 'text-topbar-muted-foreground')}
            aria-hidden="true"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-max max-w-80 overflow-y-auto">
        {projects.map((project) => {
          const active = project.id === activeProjectId
          const location = projectLocation(project.id)
          const ProjectIcon = project.isGitRepo ? FolderGit2 : Folder
          return (
            <DropdownMenuItem
              key={project.id}
              aria-current={active ? 'true' : undefined}
              title={project.unavailable ? t('repo-unavailable.title') : location}
              className={cn(active && 'bg-selected text-selected-foreground', project.unavailable && 'opacity-60')}
              onSelect={() => {
                if (!active) navigation.activateRepo(project.id)
              }}
            >
              <ProjectIcon
                className={cn('size-4 shrink-0', active ? 'text-selected-muted-foreground' : 'text-muted-foreground')}
                aria-hidden="true"
              />
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="min-w-0 truncate text-[13px] font-medium leading-none">{project.name}</span>
                <ProjectTerminalStatus
                  terminalWorktreeKeys={project.terminalWorktreeKeys}
                  branchWorkspaceRootId={project.branchWorkspaceRootId}
                />
              </span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
