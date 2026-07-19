import { useCallback, useMemo, useState } from 'react'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { arrayMove } from '@dnd-kit/sortable'
import { Download, FolderPlus, FolderTree, LoaderCircle, RefreshCw, Settings2, Trash2 } from 'lucide-react'
import { Button } from '#/web/components/ui/button.tsx'
import { WorkspaceConfigurationDialog } from '#/web/components/repo-workspace/WorkspaceConfigurationDialog.tsx'
import {
  WorkspaceRepositoryList,
  type WorkspaceRepositoryListItem,
} from '#/web/components/repo-workspace/WorkspaceRepositoryList.tsx'
import { WorkspaceWorktreeDialog } from '#/web/components/repo-workspace/WorkspaceWorktreeDialog.tsx'
import { useWorkspaceWorktreeActions } from '#/web/hooks/useWorkspaceWorktreeActions.ts'
import { cn } from '#/web/lib/cn.ts'
import { useT } from '#/web/stores/i18n.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { workspaceBatchBranchChoices } from '#/web/stores/repos/workspace-worktrees.ts'
import type { WorkspaceWorktreePlanRequest } from '#/shared/workspace-worktrees.ts'

interface Props {
  workspaceRootId: string
  currentRepoId: string
  fill?: boolean
}

export function WorkspaceRepositoryRail({ workspaceRootId, currentRepoId, fill = false }: Props) {
  const t = useT()
  const workspace = useReposStore((state) => state.workspaceProjects[workspaceRootId])
  const repos = useReposStore((state) => state.repos)
  const activateWorkspaceRepository = useReposStore((state) => state.activateWorkspaceRepository)
  const rescanWorkspace = useReposStore((state) => state.rescanWorkspace)
  const configureWorkspace = useReposStore((state) => state.configureWorkspace)
  const batchChoices = useStoreWithEqualityFn(
    useReposStore,
    (state) => workspaceBatchBranchChoices(state, workspaceRootId),
    (left, right) =>
      sameStrings(left.baseBranches, right.baseBranches) &&
      sameStrings(left.removableBranches, right.removableBranches),
  )
  const [configurationOpen, setConfigurationOpen] = useState(false)
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchOperation, setBatchOperation] = useState<'create' | 'remove' | 'pull'>('create')
  const [optimisticRepositoryIds, setOptimisticRepositoryIds] = useState<string[] | null>(null)
  const [reorderPending, setReorderPending] = useState(false)
  const [reorderError, setReorderError] = useState<string | null>(null)
  const candidateNameById = useMemo(
    () => new Map((workspace?.candidates ?? []).map((candidate) => [candidate.id, candidate.name])),
    [workspace?.candidates],
  )
  const configuredRepositoryNames = useMemo(
    () =>
      (workspace?.repositoryIds ?? []).flatMap((repositoryId) => {
        const name = candidateNameById.get(repositoryId)
        return name ? [name] : []
      }),
    [candidateNameById, workspace?.repositoryIds],
  )
  const refreshWorkspaceAfterBatch = useCallback(async () => {
    const state = useReposStore.getState()
    const memberIds = state.workspaceProjects[workspaceRootId]?.repositoryIds ?? []
    await Promise.all(memberIds.map((memberId) => state.refreshCoreData(memberId)))
    await useReposStore.getState().rescanWorkspace(workspaceRootId)
  }, [workspaceRootId])
  const batchActions = useWorkspaceWorktreeActions(workspaceRootId, refreshWorkspaceAfterBatch)
  if (!workspace) return null

  const scanning = workspace.phase === 'scanning'
  const displayRepositoryIds = optimisticRepositoryIds ?? workspace.repositoryIds
  const batchReady =
    workspace.configured &&
    workspace.repositoryIds.length > 0 &&
    workspace.repositoryIds.every((repositoryId) => repos[repositoryId]?.availability.phase === 'available')
  const repositoryItems: WorkspaceRepositoryListItem[] = displayRepositoryIds.flatMap((repositoryId) => {
    const repo = repos[repositoryId]
    if (!repo) return []
    return [
      {
        id: repositoryId,
        name: repo.name,
        branch: repo.data.currentBranch,
        changeCount: repo.data.status.reduce((total, status) => total + status.entries.length, 0),
        unavailable: repo.availability.phase === 'unavailable',
      },
    ]
  })
  const reorderReady = batchReady && !reorderPending
  const openBatch = (operation: 'create' | 'remove' | 'pull') => {
    batchActions.reset()
    setBatchOperation(operation)
    setBatchOpen(true)
    if (operation === 'pull') void batchActions.requestPull()
  }
  const previewBatch = (request: WorkspaceWorktreePlanRequest) => batchActions.requestPlan(request)
  const reorderRepositories = async (fromId: string, toId: string) => {
    if (!reorderReady) return
    const fromIndex = displayRepositoryIds.indexOf(fromId)
    const toIndex = displayRepositoryIds.indexOf(toId)
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return
    const nextIds = arrayMove(displayRepositoryIds, fromIndex, toIndex)
    const nextNames = nextIds.map((repositoryId) => candidateNameById.get(repositoryId))
    if (nextNames.some((name) => !name)) {
      setReorderError('workspace.repository-reorder-failed')
      return
    }

    setOptimisticRepositoryIds(nextIds)
    setReorderPending(true)
    setReorderError(null)
    const result = await configureWorkspace(workspaceRootId, { repo: nextNames as string[] }).catch(() => ({
      ok: false as const,
      message: 'workspace.config.write-failed',
    }))
    setOptimisticRepositoryIds(null)
    setReorderPending(false)
    if (!result.ok) setReorderError(result.message)
  }

  return (
    <>
      <section
        className={cn(fill ? 'flex min-h-0 flex-1 flex-col' : 'shrink-0', 'border-b border-separator/70 bg-sidebar')}
        aria-label={t('workspace.repositories')}
      >
        <div className="flex h-7 items-center gap-2 px-3 pt-1">
          <span className="min-w-0 flex-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">
            {t('workspace.repositories')}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t('workspace.batch.create-action')}
            title={t(
              batchChoices.baseBranches.length > 0 ? 'workspace.batch.create-action' : 'workspace.batch.no-shared-base',
            )}
            disabled={!batchReady || reorderPending || batchChoices.baseBranches.length === 0}
            onClick={() => openBatch('create')}
          >
            <FolderPlus aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t('workspace.batch.remove-action')}
            title={t(
              batchChoices.removableBranches.length > 0
                ? 'workspace.batch.remove-action'
                : 'workspace.batch.no-shared-worktree',
            )}
            disabled={!batchReady || reorderPending || batchChoices.removableBranches.length === 0}
            onClick={() => openBatch('remove')}
          >
            <Trash2 aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t('workspace.batch.pull-action')}
            title={t('workspace.batch.pull-action')}
            disabled={!batchReady || reorderPending}
            onClick={() => openBatch('pull')}
          >
            <Download aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t('workspace.configure')}
            title={t('workspace.configure')}
            disabled={reorderPending}
            onClick={() => setConfigurationOpen(true)}
          >
            <Settings2 aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t('workspace.rescan')}
            title={t('workspace.rescan')}
            disabled={scanning}
            onClick={() => void rescanWorkspace(workspaceRootId)}
          >
            {scanning ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
          </Button>
        </div>
        <div className={cn('relative overflow-y-auto px-1.5 pb-1.5', fill ? 'min-h-0 flex-1' : 'max-h-40')}>
          <div
            className="pointer-events-none absolute bottom-3 left-[1.12rem] top-3 w-px bg-separator"
            aria-hidden="true"
          />
          <ManifestRow
            active={currentRepoId === workspaceRootId}
            icon={FolderTree}
            name={t('workspace.overview')}
            prefix="./"
            onActivate={() => activateWorkspaceRepository(workspaceRootId, null)}
          />
          <WorkspaceRepositoryList
            repositories={repositoryItems}
            currentRepoId={currentRepoId}
            disabled={!reorderReady}
            onActivate={(repositoryId) => activateWorkspaceRepository(workspaceRootId, repositoryId)}
            onReorder={(fromId, toId) => void reorderRepositories(fromId, toId)}
          />
        </div>
        {reorderError ? (
          <div className="border-t border-separator/60 px-3 py-1.5 text-[10px] leading-4 text-danger" role="alert">
            {t(reorderError)}
          </div>
        ) : null}
        {(workspace.error || workspace.configurationError || !workspace.configured || workspace.skipped.length > 0) && (
          <div className="border-t border-separator/60 px-3 py-1.5 text-[10px] leading-4 text-warning" role="status">
            {workspace.error
              ? t('workspace.scan-failed')
              : workspace.configurationError
                ? t('workspace.configuration-invalid')
                : !workspace.configured
                  ? t('workspace.configuration-required')
                  : t('workspace.scan-skipped', { count: workspace.skipped.length })}
          </div>
        )}
      </section>
      <WorkspaceConfigurationDialog
        open={configurationOpen}
        onOpenChange={setConfigurationOpen}
        configuredRepositoryNames={configuredRepositoryNames}
        candidates={workspace.candidates}
        onSave={(config) => configureWorkspace(workspaceRootId, config)}
      />
      <WorkspaceWorktreeDialog
        open={batchOpen}
        operation={batchOperation}
        repositoryCount={workspace.repositoryIds.length}
        baseBranches={batchChoices.baseBranches}
        removableBranches={batchChoices.removableBranches}
        plan={batchActions.plan}
        result={batchActions.result}
        pending={batchActions.pending}
        error={batchActions.error}
        onOpenChange={(open) => {
          setBatchOpen(open)
          if (!open && !batchActions.pending) batchActions.reset()
        }}
        onPreview={previewBatch}
        onConfirm={batchActions.confirm}
        onRetry={batchActions.retry}
        onCancel={batchActions.cancel}
      />
    </>
  )
}

function sameStrings(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function ManifestRow({
  active,
  icon: Icon,
  name,
  prefix,
  onActivate,
}: {
  active: boolean
  icon: typeof FolderTree
  name: string
  prefix?: string
  onActivate: () => void
}) {
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      title={name}
      className={cn(
        'group relative flex h-7 w-full min-w-0 items-center gap-2 rounded-[var(--goblin-brand-radius-sm,var(--radius-sm))] px-2 text-left text-xs transition-colors duration-100',
        active ? 'bg-selected text-selected-foreground' : 'text-foreground hover:bg-list-row-hover',
      )}
      onClick={onActivate}
    >
      <span className="relative z-10 flex size-4 shrink-0 items-center justify-center bg-sidebar group-hover:bg-list-row-hover group-aria-[current=page]:bg-selected">
        <Icon className="size-3.5" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        {prefix && <span className="shrink-0 font-mono text-muted-foreground">{prefix}</span>}
        <span className="min-w-0 truncate font-medium">{name}</span>
      </span>
    </button>
  )
}
