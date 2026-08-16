import { FolderTree } from 'lucide-react'
import { localRepoSessionEntry, remoteRepoSessionEntry } from '#/shared/remote-repo.ts'
import { ProjectFileTree } from '#/web/components/file-tree/ProjectFileTree.tsx'
import { Toolbar } from '#/web/components/Layout.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { useDetachFileArea } from '#/web/hooks/useDetachFileArea.ts'
import { cn } from '#/web/lib/cn.ts'
import { useT } from '#/web/stores/i18n.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import type { FileTreeRevealRequest } from '#/web/components/repo-workspace/RepoWorktreeExplorer.tsx'

export function PlainWorkspaceFileArea({
  repoId,
  revealRequest,
}: {
  repoId: string
  revealRequest: FileTreeRevealRequest | null
}) {
  const t = useT()
  const remoteTarget = useReposStore((state) => state.repos[repoId]?.remote.target)
  const repo = remoteTarget ? remoteRepoSessionEntry(remoteTarget) : localRepoSessionEntry(repoId)
  const detach = useDetachFileArea({ kind: 'plain-project', repo, tab: 'files' })
  return (
    <section className="project-file-area-tone flex min-h-0 flex-1 flex-col bg-pane">
      <Toolbar
        data-testid="plain-file-area-toolbar"
        className={cn('border-y-0 px-2', detach.dragging && 'opacity-70 ring-1 ring-ring')}
        variant="detail"
        tabIndex={detach.enabled ? 0 : undefined}
        {...detach.bindings}
      >
        <div role="tablist" aria-label={t('file-tree.title')}>
          <Button
            type="button"
            variant="ghost"
            role="tab"
            aria-selected="true"
            tabIndex={0}
            className={cn(
              'h-7 gap-1 border border-input bg-tab-active px-2 text-[length:var(--goblin-file-tree-topbar-font-size)] font-normal',
            )}
          >
            <FolderTree className="size-3.5" aria-hidden="true" />
            {t('file-tree.title')}
          </Button>
        </div>
      </Toolbar>
      <ProjectFileTree repoId={repoId} revealRequest={revealRequest} toolbarHeight="detail" />
    </section>
  )
}
