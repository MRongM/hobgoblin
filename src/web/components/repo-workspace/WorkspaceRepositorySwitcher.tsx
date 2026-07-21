import { ChevronDown, FolderGit2, FolderTree } from 'lucide-react'
import { Button } from '#/web/components/ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/web/components/ui/dropdown-menu.tsx'
import { cn } from '#/web/lib/cn.ts'
import { useT } from '#/web/stores/i18n.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { workspaceRootIdForRepo } from '#/web/stores/repos/workspace-projects.ts'

interface Props {
  repoId: string
  compact?: boolean
}

export function WorkspaceRepositorySwitcher({ repoId, compact = false }: Props) {
  const t = useT()
  const workspaceRootId = useReposStore(
    (state) => workspaceRootIdForRepo(state, repoId) ?? (state.workspaceProjects[repoId] ? repoId : null),
  )
  const workspace = useReposStore((state) =>
    workspaceRootId ? state.workspaceProjects[workspaceRootId] : undefined,
  )
  const currentName = useReposStore((state) =>
    repoId === workspaceRootId ? t('workspace.overview') : (state.repos[repoId]?.name ?? ''),
  )
  const repos = useReposStore((state) => state.repos)
  const activateWorkspaceOverview = useReposStore((state) => state.activateWorkspaceOverview)
  const activateWorkspaceRepository = useReposStore((state) => state.activateWorkspaceRepository)
  if (!workspaceRootId || !workspace) return null

  const repositories = workspace.repositoryIds.flatMap((id) => {
    const repo = repos[id]
    return repo ? [{ id, name: repo.name, unavailable: repo.availability.phase === 'unavailable' }] : []
  })

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-w-0 gap-1.5 px-1.5"
          aria-label={t('workspace.repositories')}
          title={currentName}
        >
          {repoId === workspaceRootId ? (
            <FolderTree className="size-4 shrink-0" aria-hidden="true" />
          ) : (
            <FolderGit2 className="size-4 shrink-0" aria-hidden="true" />
          )}
          <span className={cn('min-w-0 truncate text-xs font-medium', compact ? 'max-w-20' : 'max-w-36')}>
            {currentName}
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-max max-w-72 overflow-y-auto">
        <DropdownMenuItem
          aria-current={repoId === workspaceRootId ? 'page' : undefined}
          onSelect={() => activateWorkspaceOverview(workspaceRootId)}
        >
          <FolderTree />
          <span className="font-mono text-muted-foreground">./</span>
          <span>{t('workspace.overview')}</span>
        </DropdownMenuItem>
        {repositories.map((repository) => (
          <DropdownMenuItem
            key={repository.id}
            aria-current={repoId === repository.id ? 'page' : undefined}
            className={cn(repository.unavailable && 'opacity-60')}
            onSelect={() => activateWorkspaceRepository(workspaceRootId, repository.id)}
          >
            <FolderGit2 />
            <span className="min-w-0 truncate">{repository.name}</span>
            {repository.unavailable && (
              <span className="text-[10px] text-danger">{t('workspace.repository-unavailable')}</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
