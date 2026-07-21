import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { arrayMove } from '@dnd-kit/sortable'
import {
  ChevronDown,
  ChevronRight,
  Download,
  FolderPlus,
  FolderTree,
  LoaderCircle,
  RefreshCw,
  Settings2,
  Terminal,
} from 'lucide-react'
import type { BranchWorkspaceSnapshot } from '#/shared/branch-workspaces.ts'
import type { WorkspaceConfig } from '#/shared/workspace.ts'
import type { WorkspacePullResult } from '#/shared/workspace-pull.ts'
import { Badge } from '#/web/components/ui/badge.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { BranchWorkspaceDialog } from '#/web/components/repo-workspace/BranchWorkspaceDialog.tsx'
import { BranchWorkspaceList } from '#/web/components/repo-workspace/BranchWorkspaceList.tsx'
import { WorkspaceConfigurationDialog } from '#/web/components/repo-workspace/WorkspaceConfigurationDialog.tsx'
import {
  WorkspaceRepositoryList,
  type WorkspaceRepositoryListItem,
} from '#/web/components/repo-workspace/WorkspaceRepositoryList.tsx'
import { WorkspacePullDialog } from '#/web/components/repo-workspace/WorkspacePullDialog.tsx'
import { TerminalBellDot } from '#/web/components/terminal/TerminalBellDot.tsx'
import { TerminalOutputActivityIndicator } from '#/web/components/terminal/TerminalOutputActivityIndicator.tsx'
import {
  useWorktreeTerminalCount,
  useWorktreeTerminalHasBell,
  useWorktreeTerminalHasOutputActivity,
} from '#/web/components/terminal/terminal-session-store.ts'
import { worktreeTerminalKey } from '#/web/components/terminal/terminal-session-keys.ts'
import { useBranchWorkspaceQuery } from '#/web/branch-workspace-queries.ts'
import { useBranchWorkspaceActions } from '#/web/hooks/useBranchWorkspaceActions.ts'
import { useWorkspacePullActions } from '#/web/hooks/useWorkspacePullActions.ts'
import { cn } from '#/web/lib/cn.ts'
import { useT } from '#/web/stores/i18n.ts'
import { repoPlainWorkspacePath } from '#/web/stores/repos/capabilities.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { workspaceRepositoryListExpanded } from '#/web/stores/repos/workspace-projects.ts'
import { repoTerminalWorktreePaths } from '#/web/components/RepoTabs.tsx'

interface Props {
  workspaceRootId: string
  currentRepoId: string
  fill?: boolean
}

export function WorkspaceRepositoryRail({ workspaceRootId, currentRepoId, fill = false }: Props) {
  const t = useT()
  const workspace = useReposStore((state) => state.workspaceProjects[workspaceRootId])
  const repos = useReposStore((state) => state.repos)
  const activeContext = useReposStore(
    (state) => state.workspaceActiveContextByRoot[workspaceRootId] ?? { kind: 'overview' as const },
  )
  const repositoryListExpanded = useReposStore((state) => workspaceRepositoryListExpanded(state, workspaceRootId))
  const toggleRepositoryList = useReposStore((state) => state.toggleWorkspaceRepositoryList)
  const activateWorkspaceOverview = useReposStore((state) => state.activateWorkspaceOverview)
  const activateWorkspaceRepository = useReposStore((state) => state.activateWorkspaceRepository)
  const activateBranchWorkspace = useReposStore((state) => state.activateBranchWorkspace)
  const rescanWorkspace = useReposStore((state) => state.rescanWorkspace)
  const configureWorkspace = useReposStore((state) => state.configureWorkspace)
  const branchQuery = useBranchWorkspaceQuery(workspaceRootId)
  const branchItems = branchQuery.data?.ok ? branchQuery.data.items : []
  const auxiliaryCandidates = branchQuery.data?.ok ? branchQuery.data.auxiliaryCandidates : []
  const branchActions = useBranchWorkspaceActions(workspaceRootId)
  const [configurationOpen, setConfigurationOpen] = useState(false)
  const [branchDialogOpen, setBranchDialogOpen] = useState(false)
  const [branchDialogMode, setBranchDialogMode] = useState<'create' | 'repair' | 'remove'>('create')
  const [dialogWorkspace, setDialogWorkspace] = useState<BranchWorkspaceSnapshot | null>(null)
  const [pullOpen, setPullOpen] = useState(false)
  const [optimisticRepositoryIds, setOptimisticRepositoryIds] = useState<string[] | null>(null)
  const [reorderPending, setReorderPending] = useState(false)
  const [reorderError, setReorderError] = useState<string | null>(null)

  const overviewTerminalWorktreeKey = worktreeTerminalKey(
    workspaceRootId,
    repoPlainWorkspacePath(repos[workspaceRootId]) ?? workspaceRootId,
  )
  const overviewTerminalCount = useWorktreeTerminalCount(overviewTerminalWorktreeKey)
  const overviewHasTerminalBell = useWorktreeTerminalHasBell(overviewTerminalWorktreeKey)
  const overviewHasTerminalOutputActivity = useWorktreeTerminalHasOutputActivity(overviewTerminalWorktreeKey)
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
  const repositoryOptions = useMemo(
    () =>
      (workspace?.repositoryIds ?? []).flatMap((repositoryId) => {
        const repo = repos[repositoryId]
        if (!repo) return []
        const defaultBranch =
          repo.data.branches.find((branch) => branch.isDefault)?.name ||
          repo.data.currentBranch ||
          repo.data.branches[0]?.name ||
          ''
        return [
          {
            id: repositoryId,
            name: candidateNameById.get(repositoryId) ?? repo.name,
            available: repo.availability.phase === 'available',
            branches: repo.data.branches.map((branch) => branch.name),
            defaultBranch,
          },
        ]
      }),
    [candidateNameById, repos, workspace?.repositoryIds],
  )
  const settlePull = useCallback(
    async (result: WorkspacePullResult) => {
      if (result.ok) toast.success(t('workspace.pull-all-success'))
      else
        toast.error(t('workspace.pull-all-incomplete'), result.message ? { description: t(result.message) } : undefined)
      const state = useReposStore.getState()
      const memberIds = state.workspaceProjects[workspaceRootId]?.repositoryIds ?? []
      await Promise.all(memberIds.map((memberId) => state.refreshCoreData(memberId)))
    },
    [t, workspaceRootId],
  )
  const pullActions = useWorkspacePullActions(workspaceRootId, settlePull)

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
        terminalWorktreePaths: repoTerminalWorktreePaths(repo),
        unavailable: repo.availability.phase === 'unavailable',
      },
    ]
  })
  const reorderReady = batchReady && !reorderPending
  const branchListVisible = currentRepoId === workspaceRootId
  const selectedBranchWorkspaceId = activeContext.kind === 'branch-workspace' ? activeContext.branchWorkspaceId : null

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
  const openConfiguration = async () => {
    await rescanWorkspace(workspaceRootId)
    setConfigurationOpen(true)
  }
  const openBranchDialog = (
    mode: 'create' | 'repair' | 'remove',
    item: BranchWorkspaceSnapshot | null,
    requestPlan = false,
  ) => {
    branchActions.reset()
    setBranchDialogMode(mode)
    setDialogWorkspace(item)
    setBranchDialogOpen(true)
    if (requestPlan && item) {
      void branchActions.requestPlan(
        mode === 'repair'
          ? { operation: 'repair', branchWorkspaceId: item.id }
          : {
              operation: 'remove',
              branchWorkspaceId: item.id,
              alsoDeleteBranch: false,
              alsoDeleteUpstream: false,
              forceRemoveWorktrees: false,
            },
      )
    }
  }
  const openPull = () => {
    pullActions.reset()
    setPullOpen(true)
    void pullActions.requestPlan()
  }

  return (
    <>
      <section
        className={cn(fill ? 'flex min-h-0 flex-1 flex-col' : 'shrink-0', 'border-b border-separator/70 bg-sidebar')}
        aria-label={t('workspace.repositories')}
      >
        <div className="flex h-7 items-center gap-1 px-3 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-expanded={repositoryListExpanded}
            aria-label={t(repositoryListExpanded ? 'workspace.repositories.collapse' : 'workspace.repositories.expand')}
            onClick={() => toggleRepositoryList(workspaceRootId)}
          >
            {repositoryListExpanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
          </Button>
          <span className="min-w-0 flex-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">
            {t('workspace.repositories')}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t('workspace.branch-workspace.create')}
            title={t('workspace.branch-workspace.create')}
            disabled={!batchReady || reorderPending}
            onClick={() => openBranchDialog('create', null)}
          >
            <FolderPlus aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t('workspace.pull-all')}
            title={t('workspace.pull-all')}
            disabled={!batchReady || reorderPending}
            onClick={openPull}
          >
            <Download aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t('workspace.configure')}
            title={t('workspace.configure')}
            disabled={scanning || reorderPending}
            onClick={() => void openConfiguration()}
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
        {repositoryListExpanded ? (
          <div
            className="relative max-h-40 overflow-y-auto px-1.5 pb-1.5"
            data-testid="workspace-repository-upper-list"
          >
            <div
              className="pointer-events-none absolute bottom-3 left-[1.12rem] top-3 w-px bg-separator"
              aria-hidden="true"
            />
            <ManifestRow
              active={activeContext.kind === 'overview'}
              name={t('workspace.overview')}
              terminalCount={overviewTerminalCount}
              hasTerminalBell={overviewHasTerminalBell}
              hasTerminalOutputActivity={overviewHasTerminalOutputActivity}
              onActivate={() => activateWorkspaceOverview(workspaceRootId)}
            />
            <WorkspaceRepositoryList
              repositories={repositoryItems}
              currentRepoId={currentRepoId}
              disabled={!reorderReady}
              onActivate={(repositoryId) => activateWorkspaceRepository(workspaceRootId, repositoryId)}
              onReorder={(fromId, toId) => void reorderRepositories(fromId, toId)}
            />
          </div>
        ) : null}
        {branchListVisible ? (
          <div className={cn('border-t border-separator/60 px-1.5 pb-1.5', fill && 'min-h-0 flex-1 overflow-y-auto')}>
            <div className="flex h-7 items-center px-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">
              {t('workspace.branch-workspace.list')}
            </div>
            {branchQuery.isPending ? (
              <div className="px-2 py-2 text-xs text-muted-foreground">{t('workspace.branch-workspace.loading')}</div>
            ) : branchQuery.data && !branchQuery.data.ok ? (
              <div className="px-2 py-2 text-xs text-danger">{t(branchQuery.data.message)}</div>
            ) : branchItems.length === 0 ? (
              <div className="px-2 py-2 text-xs text-muted-foreground">{t('workspace.branch-workspace.empty')}</div>
            ) : (
              <BranchWorkspaceList
                rootId={workspaceRootId}
                items={branchItems}
                activeId={selectedBranchWorkspaceId}
                disabled={branchActions.pending}
                onActivate={(id) => activateBranchWorkspace(workspaceRootId, id)}
                onReorder={(orderedIds) => void branchActions.reorder(orderedIds)}
                onInspect={(item) =>
                  openBranchDialog(item.lifecycle === 'delete-incomplete' ? 'remove' : 'repair', item)
                }
                onRepair={(item) => openBranchDialog('repair', item, true)}
                onRemove={(item) => openBranchDialog('remove', item, item.lifecycle === 'delete-incomplete')}
                onCancel={() => branchActions.cancel()}
              />
            )}
          </div>
        ) : null}
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
        onSave={(config: WorkspaceConfig) => configureWorkspace(workspaceRootId, config)}
      />
      <BranchWorkspaceDialog
        open={branchDialogOpen}
        mode={branchDialogMode}
        repositories={repositoryOptions}
        auxiliaryCandidates={auxiliaryCandidates}
        workspace={dialogWorkspace}
        plan={branchActions.plan}
        result={branchActions.result}
        pending={branchActions.pending}
        error={branchActions.error}
        onOpenChange={(open) => {
          setBranchDialogOpen(open)
          if (!open && !branchActions.pending) branchActions.reset()
        }}
        onPreview={branchActions.requestPlan}
        onConfirm={branchActions.confirm}
        onRetry={branchActions.retry}
        onCancel={branchActions.cancel}
      />
      <WorkspacePullDialog
        open={pullOpen}
        plan={pullActions.plan}
        result={pullActions.result}
        pending={pullActions.pending}
        error={pullActions.error}
        onOpenChange={(open) => {
          setPullOpen(open)
          if (!open && !pullActions.pending) pullActions.reset()
        }}
        onConfirm={pullActions.confirm}
        onRetry={pullActions.retry}
        onCancel={pullActions.cancel}
      />
    </>
  )
}

function ManifestRow({
  active,
  name,
  terminalCount,
  hasTerminalBell,
  hasTerminalOutputActivity,
  onActivate,
}: {
  active: boolean
  name: string
  terminalCount: number
  hasTerminalBell: boolean
  hasTerminalOutputActivity: boolean
  onActivate: () => void
}) {
  const t = useT()
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      title={name}
      className={cn(
        'group relative flex h-7 w-full min-w-0 items-center gap-2 rounded-[var(--goblin-brand-radius-sm,var(--radius-sm))] px-2 text-left text-xs transition-colors',
        active ? 'bg-selected text-selected-foreground' : 'hover:bg-list-row-hover',
      )}
      onClick={onActivate}
    >
      <FolderTree className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="shrink-0 font-mono text-muted-foreground">./</span>
        <span className="min-w-0 truncate font-medium">{name}</span>
        {terminalCount > 0 ? (
          <Badge
            data-testid="overview-terminal-count-badge"
            aria-label={t('terminal.open-count', { count: terminalCount })}
            variant="brand"
            className="h-4 gap-1 rounded-full px-1.5 text-[10px] tabular-nums"
          >
            {hasTerminalOutputActivity ? (
              <TerminalOutputActivityIndicator label={t('terminal.output-active')} className="size-2.5" size={10} />
            ) : (
              <Terminal size={10} aria-hidden="true" />
            )}
            {terminalCount}
          </Badge>
        ) : null}
        {hasTerminalBell ? <TerminalBellDot label={t('terminal.bell-unread')} /> : null}
      </span>
    </button>
  )
}
