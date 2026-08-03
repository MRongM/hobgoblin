import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { arrayMove } from '@dnd-kit/sortable'
import { Download, Eye, EyeOff, Folder, FolderPlus, LoaderCircle, RefreshCw, Settings2, Terminal } from 'lucide-react'
import type { BranchWorkspaceGitActionKind } from '#/shared/branch-workspace-git-actions.ts'
import type { BranchWorkspaceRepositorySnapshot, BranchWorkspaceSnapshot } from '#/shared/branch-workspaces.ts'
import type { WorkspaceConfig } from '#/shared/workspace.ts'
import type { WorkspacePullResult } from '#/shared/workspace-pull.ts'
import { DEFAULT_WORKSPACE_REPOSITORY_LIST_HEIGHT } from '#/shared/workspace-layout.ts'
import { Badge } from '#/web/components/ui/badge.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { ConfirmDialog } from '#/web/components/ConfirmDialog.tsx'
import { BranchWorkspaceDialog } from '#/web/components/repo-workspace/BranchWorkspaceDialog.tsx'
import { BranchWorkspaceDependencyDialog } from '#/web/components/repo-workspace/BranchWorkspaceDependencyDialog.tsx'
import {
  BranchWorkspaceGitActionPanel,
  type BranchWorkspaceBatchErrorAiHandoffInput,
} from '#/web/components/repo-workspace/BranchWorkspaceGitActionDialog.tsx'
import {
  BranchWorkspaceList,
  branchWorkspaceFolderContext,
} from '#/web/components/repo-workspace/BranchWorkspaceList.tsx'
import { branchWorkspaceTerminalBase } from '#/web/components/repo-workspace/BranchWorkspaceTerminalPanel.tsx'
import type { BranchWorkspaceMemberPresentation } from '#/web/components/repo-workspace/BranchWorkspaceMemberRow.tsx'
import { WorkspaceConfigurationDialog } from '#/web/components/repo-workspace/WorkspaceConfigurationDialog.tsx'
import {
  WorkspaceRepositoryList,
  type WorkspaceRepositoryListItem,
} from '#/web/components/repo-workspace/WorkspaceRepositoryList.tsx'
import { WorkspacePullDialog } from '#/web/components/repo-workspace/WorkspacePullDialog.tsx'
import { TerminalBellDot } from '#/web/components/terminal/TerminalBellDot.tsx'
import { TerminalOutputActivityIndicator } from '#/web/components/terminal/TerminalOutputActivityIndicator.tsx'
import {
  useTerminalAggregateCount,
  useTerminalAggregateHasBell,
  useTerminalAggregateHasOutputActivity,
} from '#/web/components/terminal/terminal-session-store.ts'
import { worktreeTerminalKey } from '#/web/components/terminal/terminal-session-keys.ts'
import { useBranchWorkspaceQuery } from '#/web/branch-workspace-queries.ts'
import { cleanupBranchWorkspaceRegistry } from '#/web/workspace-client.ts'
import { useBranchWorkspaceActions } from '#/web/hooks/useBranchWorkspaceActions.ts'
import { useBranchWorkspaceDependencyActions } from '#/web/hooks/useBranchWorkspaceDependencyActions.ts'
import { useBranchWorkspaceGitActions } from '#/web/hooks/useBranchWorkspaceGitActions.ts'
import { useWorkspacePullActions } from '#/web/hooks/useWorkspacePullActions.ts'
import { cn } from '#/web/lib/cn.ts'
import { lastPathSegment } from '#/web/lib/paths.ts'
import { useT } from '#/web/stores/i18n.ts'
import { repoPlainWorkspacePath } from '#/web/stores/repos/capabilities.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { getBranchWorktreeState } from '#/web/stores/repos/worktree-state.ts'
import { workspaceRepositoryListExpanded } from '#/web/stores/repos/workspace-projects.ts'
import { repoTerminalWorktreePaths } from '#/web/components/RepoTabs.tsx'
import { resolveBranchWorkspaceMemberTarget } from '#/web/components/repo-workspace/branch-workspace-member-target.ts'
import { WorkspaceRepositoryListPane } from '#/web/components/repo-workspace/WorkspaceRepositoryListPane.tsx'
import { buildBranchWorkspaceBatchErrorAiCommand, prefillAiTerminalTargetCommand } from '#/web/ai-terminal-handoff.ts'

interface Props {
  workspaceRootId: string
  currentRepoId: string
  fill?: boolean
  onOpenFileArea?: () => void
  onCollapseFileArea?: () => void
  onToggleFileArea?: () => void
  onOpenDetailArea?: () => void
}

export function WorkspaceRepositoryRail({
  workspaceRootId,
  currentRepoId,
  fill = false,
  onOpenFileArea,
  onCollapseFileArea,
  onToggleFileArea,
  onOpenDetailArea,
}: Props) {
  const t = useT()
  const workspace = useReposStore((state) => state.workspaceProjects[workspaceRootId])
  const repos = useReposStore((state) => state.repos)
  const activeContext = useReposStore(
    (state) => state.workspaceActiveContextByRoot[workspaceRootId] ?? { kind: 'overview' as const },
  )
  const repositoryListVisible = useReposStore((state) => workspaceRepositoryListExpanded(state, workspaceRootId))
  const repositoryListHeight = useReposStore(
    (state) => state.workspaceRepositoryListHeightByRoot[workspaceRootId] ?? DEFAULT_WORKSPACE_REPOSITORY_LIST_HEIGHT,
  )
  const toggleRepositoryList = useReposStore((state) => state.toggleWorkspaceRepositoryList)
  const setRepositoryListHeight = useReposStore((state) => state.setWorkspaceRepositoryListHeight)
  const handleRepositoryListHeightChange = useCallback(
    (height: number) => setRepositoryListHeight(workspaceRootId, height),
    [setRepositoryListHeight, workspaceRootId],
  )
  const activateWorkspaceOverview = useReposStore((state) => state.activateWorkspaceOverview)
  const activateWorkspaceRepository = useReposStore((state) => state.activateWorkspaceRepository)
  const selectBranch = useReposStore((state) => state.selectBranch)
  const setDetailTab = useReposStore((state) => state.setDetailTab)
  const activateBranchWorkspace = useReposStore((state) => state.activateBranchWorkspace)
  const rescanWorkspace = useReposStore((state) => state.rescanWorkspace)
  const configureWorkspace = useReposStore((state) => state.configureWorkspace)
  const handleRepositoryListToggle = useCallback(() => {
    if (repositoryListVisible) {
      onCollapseFileArea?.()
      activateWorkspaceOverview(workspaceRootId)
    }
    toggleRepositoryList(workspaceRootId)
  }, [activateWorkspaceOverview, onCollapseFileArea, repositoryListVisible, toggleRepositoryList, workspaceRootId])
  const branchQuery = useBranchWorkspaceQuery(workspaceRootId)
  const branchItems = branchQuery.data?.ok ? branchQuery.data.items : []
  const auxiliaryCandidates = branchQuery.data?.ok ? branchQuery.data.auxiliaryCandidates : []
  const branchActions = useBranchWorkspaceActions(workspaceRootId)
  const branchDependencyActions = useBranchWorkspaceDependencyActions(workspaceRootId)
  const branchGitActions = useBranchWorkspaceGitActions(workspaceRootId)
  const [configurationOpen, setConfigurationOpen] = useState(false)
  const [branchDialogOpen, setBranchDialogOpen] = useState(false)
  const [branchDialogMode, setBranchDialogMode] = useState<'create' | 'extend' | 'reduce' | 'repair' | 'remove'>(
    'create',
  )
  const [dialogWorkspace, setDialogWorkspace] = useState<BranchWorkspaceSnapshot | null>(null)
  const [fixedReduceRepositoryName, setFixedReduceRepositoryName] = useState<string | null>(null)
  const [dependencyDialogOpen, setDependencyDialogOpen] = useState(false)
  const [dependencyDialogMode, setDependencyDialogMode] = useState<'add' | 'remove'>('add')
  const [dependencyBranchWorkspaceId, setDependencyBranchWorkspaceId] = useState('')
  const [pullOpen, setPullOpen] = useState(false)
  const [optimisticRepositoryIds, setOptimisticRepositoryIds] = useState<string[] | null>(null)
  const [reorderPending, setReorderPending] = useState(false)
  const [reorderError, setReorderError] = useState<string | null>(null)
  const [gitActionOpen, setGitActionOpen] = useState(false)
  const [gitActionKind, setGitActionKind] = useState<BranchWorkspaceGitActionKind>('batch-commit')
  const [gitActionTargetId, setGitActionTargetId] = useState<string | null>(null)
  const [branchReloadPending, setBranchReloadPending] = useState(false)
  const branchReloadPendingRef = useRef(false)
  const [registryCleanupOpen, setRegistryCleanupOpen] = useState(false)
  const autoRefreshedDriftIds = useRef<Set<string>>(new Set())
  const dialogProgressWorkspace = branchActions.plan
    ? (branchItems.find((item) => item.id === branchActions.plan?.branchWorkspaceId) ?? null)
    : null

  const overviewRootPath = repoPlainWorkspacePath(repos[workspaceRootId]) ?? workspaceRootId
  const overviewName = lastPathSegment(overviewRootPath) || repos[workspaceRootId]?.name || workspaceRootId
  const overviewTerminalWorktreeKey = worktreeTerminalKey(workspaceRootId, overviewRootPath)
  const overviewTerminalWorktreeKeys = useMemo(
    () =>
      Array.from(
        new Set([
          overviewTerminalWorktreeKey,
          ...branchItems.map((item) => worktreeTerminalKey(workspaceRootId, item.path)),
        ]),
      ).sort(),
    [branchItems, overviewTerminalWorktreeKey, workspaceRootId],
  )
  const overviewTerminalCount = useTerminalAggregateCount(overviewTerminalWorktreeKeys)
  const overviewHasTerminalBell = useTerminalAggregateHasBell(overviewTerminalWorktreeKeys)
  const overviewHasTerminalOutputActivity = useTerminalAggregateHasOutputActivity(overviewTerminalWorktreeKeys)
  const candidateNameById = useMemo(
    () => new Map((workspace?.candidates ?? []).map((candidate) => [candidate.id, candidate.name])),
    [workspace?.candidates],
  )
  const repositoryIdByName = useMemo(
    () =>
      new Map(
        (workspace?.repositoryIds ?? []).flatMap((repositoryId) => {
          const name = candidateNameById.get(repositoryId)
          return name ? [[name, repositoryId] as const] : []
        }),
      ),
    [candidateNameById, workspace?.repositoryIds],
  )
  const branchWorkspaceChangeCountById = useMemo(
    () =>
      Object.fromEntries(
        branchItems.map((item) => [
          item.id,
          item.repositories.reduce((total, member) => {
            const repositoryId = repositoryIdByName.get(member.repositoryName)
            const repository = repositoryId ? repos[repositoryId] : undefined
            const status =
              repository?.availability.phase === 'available'
                ? repository.data.status.find((entry) => entry.path === member.worktreePath)
                : undefined
            return total + (status?.entries.length ?? 0)
          }, 0),
        ]),
      ),
    [branchItems, repos, repositoryIdByName],
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
            branchDetails: Object.fromEntries(
              repo.data.branches.map((branch) => [
                branch.name,
                {
                  ...(branch.tracking ? { tracking: branch.tracking } : {}),
                  ...(branch.trackingGone ? { trackingGone: true } : {}),
                },
              ]),
            ),
            primaryWorktreePath: Object.values(repo.data.worktreesByPath).find((worktree) => worktree.isMain)?.path,
            sourceWorktreeByBranch: Object.fromEntries(
              repo.data.branches.flatMap((branch) =>
                branch.worktree?.path ? [[branch.name, branch.worktree.path]] : [],
              ),
            ),
          },
        ]
      }),
    [candidateNameById, repos, workspace?.repositoryIds],
  )
  const refreshWorkspaceMemberCoreData = useCallback(() => {
    const state = useReposStore.getState()
    const memberIds = state.workspaceProjects[workspaceRootId]?.repositoryIds ?? []
    return Promise.all(memberIds.map((memberId) => state.refreshCoreData(memberId)))
  }, [workspaceRootId])
  const settlePull = useCallback(
    async (result: WorkspacePullResult) => {
      if (result.ok) toast.success(t('workspace.pull-all-success'))
      else
        toast.error(t('workspace.pull-all-incomplete'), result.message ? { description: t(result.message) } : undefined)
      await refreshWorkspaceMemberCoreData()
    },
    [refreshWorkspaceMemberCoreData, t],
  )
  const pullActions = useWorkspacePullActions(workspaceRootId, settlePull)

  useEffect(() => {
    if (activeContext.kind !== 'branch-workspace' || !activeContext.memberRepositoryName) return
    const branchWorkspace = branchItems.find((item) => item.id === activeContext.branchWorkspaceId)
    if (!branchWorkspace) return
    const member = branchWorkspace.repositories.find(
      (repository) => repository.repositoryName === activeContext.memberRepositoryName,
    )
    if (member && member.progress !== 'removed') return
    activateBranchWorkspace(workspaceRootId, branchWorkspace.id)
  }, [activeContext, activateBranchWorkspace, branchItems, workspaceRootId])

  useEffect(() => {
    if (!branchQuery.data?.ok) return
    const driftedIds = new Set(
      branchItems.flatMap((item) =>
        item.state.kind === 'needs-action' && item.state.action === 'repair' && item.state.reason === 'drift'
          ? [item.id]
          : [],
      ),
    )
    const attemptedIds = autoRefreshedDriftIds.current
    for (const id of attemptedIds) {
      if (!driftedIds.has(id)) attemptedIds.delete(id)
    }
    const newIds = [...driftedIds].filter((id) => !attemptedIds.has(id))
    if (newIds.length === 0) return
    for (const id of newIds) attemptedIds.add(id)
    void branchQuery.refresh().catch(() => undefined)
  }, [branchItems, branchQuery.data, branchQuery.refresh])

  if (!workspace) return null
  const resolveMemberTarget = (member: BranchWorkspaceRepositorySnapshot) => {
    const resolution = resolveBranchWorkspaceMemberTarget({
      member,
      repositoryIds: workspace.repositoryIds,
      candidates: workspace.candidates,
      repos,
    })
    if (!resolution.ok) return resolution
    const repo = repos[resolution.target.repositoryId]
    const branch = repo?.data.branches.find((candidate) => candidate.name === resolution.target.checkedOutBranch)
    if (!repo || !branch) {
      return { ok: false as const, reason: 'workspace.branch-workspace.member-branch-missing' }
    }
    return {
      ok: true as const,
      target: { ...resolution.target, repo, branch },
      ...(resolution.warning ? { warning: resolution.warning } : {}),
    }
  }
  const getMemberPresentation = (member: BranchWorkspaceRepositorySnapshot): BranchWorkspaceMemberPresentation => {
    const candidate = workspace.candidates.find(
      (entry) => entry.name === member.repositoryName && workspace.repositoryIds.includes(entry.id),
    )
    const resolution = resolveMemberTarget(member)
    if (!resolution.ok) {
      return {
        dirty: false,
        changeCount: null,
        navigable: false,
        reason: resolution.reason,
        repositoryId: candidate?.id,
        worktreePath: member.worktreePath,
      }
    }
    const worktree = getBranchWorktreeState(resolution.target.repo, resolution.target.branch)
    return {
      dirty: worktree?.dirty ?? false,
      changeCount: worktree?.dirty && worktree.changeCountKnown ? worktree.changeCount : null,
      navigable: true,
      repositoryId: resolution.target.repositoryId,
      worktreePath: resolution.target.worktreePath,
      ...(resolution.warning ? { warning: resolution.warning } : {}),
      actionTarget: { repo: resolution.target.repo, branch: resolution.target.branch },
    }
  }
  const openRepositoryMember = (item: BranchWorkspaceSnapshot, member: BranchWorkspaceRepositorySnapshot) => {
    const resolution = resolveMemberTarget(member)
    if (!resolution.ok) return
    selectBranch(resolution.target.repositoryId, resolution.target.checkedOutBranch)
    onOpenFileArea?.()
    activateBranchWorkspace(workspaceRootId, item.id, member.repositoryName)
  }
  const openRepositoryMemberTerminal = (item: BranchWorkspaceSnapshot, member: BranchWorkspaceRepositorySnapshot) => {
    const resolution = resolveMemberTarget(member)
    if (!resolution.ok) return
    selectBranch(resolution.target.repositoryId, resolution.target.checkedOutBranch)
    setDetailTab(resolution.target.repositoryId, 'terminal')
    onOpenDetailArea?.()
    activateBranchWorkspace(workspaceRootId, item.id, member.repositoryName)
  }
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
        name: candidateNameById.get(repositoryId) ?? repo.name,
        branch: repo.data.currentBranch,
        changeCount: repo.data.status.reduce((total, status) => total + status.entries.length, 0),
        terminalWorktreePaths: repoTerminalWorktreePaths(repo),
        unavailable: repo.availability.phase === 'unavailable',
      },
    ]
  })
  const reorderReady = batchReady && !reorderPending
  const branchListVisible = currentRepoId === workspaceRootId || !repositoryListVisible
  const selectedBranchWorkspaceId = activeContext.kind === 'branch-workspace' ? activeContext.branchWorkspaceId : null
  const selectedBranchWorkspaceMemberName =
    activeContext.kind === 'branch-workspace' ? activeContext.memberRepositoryName : null
  const gitActionTarget = branchItems.find((item) => item.id === gitActionTargetId) ?? null

  const handoffBatchErrorsToBranchWorkspace = async (
    input: BranchWorkspaceBatchErrorAiHandoffInput,
  ): Promise<boolean> => {
    if (!gitActionTarget) return false
    const context = branchWorkspaceFolderContext(workspaceRootId, gitActionTarget)
    return await prefillAiTerminalTargetCommand({
      terminalBase: branchWorkspaceTerminalBase(context),
      activate: () => {
        activateBranchWorkspace(workspaceRootId, gitActionTarget.id)
        onOpenDetailArea?.()
      },
      command: buildBranchWorkspaceBatchErrorAiCommand(input.provider, input.kind, input.failures),
    })
  }

  const openGitAction = (item: BranchWorkspaceSnapshot, kind: BranchWorkspaceGitActionKind) => {
    branchGitActions.reset()
    setGitActionTargetId(item.id)
    setGitActionKind(kind)
    setGitActionOpen(true)
    void branchGitActions.requestPlan(kind, item.id)
  }
  const reloadBranchWorkspaces = async () => {
    if (branchReloadPendingRef.current) return
    branchReloadPendingRef.current = true
    setBranchReloadPending(true)
    try {
      await branchQuery.refresh()
    } catch {
      // The current read error remains visible and retryable.
    } finally {
      branchReloadPendingRef.current = false
      setBranchReloadPending(false)
    }
    void refreshWorkspaceMemberCoreData().catch(() => undefined)
  }
  const cleanupRegistry = async () => {
    const result = await cleanupBranchWorkspaceRegistry(workspaceRootId).catch(() => ({
      ok: false as const,
      message: 'workspace.branch-workspace.cleanup-failed',
    }))
    if (!result.ok) {
      toast.error(t(result.message))
      return
    }
    setRegistryCleanupOpen(false)
    await branchQuery.refresh().catch(() => undefined)
    toast.success(t(`workspace.branch-workspace.cleanup-success.${result.outcome}`))
  }
  const gitActionPanel =
    gitActionOpen && gitActionTarget
      ? {
          itemId: gitActionTarget.id,
          content: (
            <BranchWorkspaceGitActionPanel
              open
              kind={gitActionKind}
              plan={branchGitActions.plan}
              result={branchGitActions.result}
              activeOperation={gitActionTarget.activeOperation ?? null}
              pending={branchGitActions.pending}
              error={branchGitActions.error}
              onOpenChange={(open) => {
                setGitActionOpen(open)
                if (!open) {
                  setGitActionTargetId(null)
                  if (!branchGitActions.pending) branchGitActions.reset()
                }
              }}
              onBatchCommit={branchGitActions.executeBatchCommit}
              onBatchCommitAndPush={branchGitActions.executeBatchCommitAndPush}
              onBatchMergeIn={branchGitActions.executeBatchMergeIn}
              onBatchMergeOut={branchGitActions.executeBatchMergeOut}
              onSync={branchGitActions.executeSync}
              onCancel={branchGitActions.cancel}
              onBatchErrorAiHandoff={handoffBatchErrorsToBranchWorkspace}
            />
          ),
        }
      : null

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
    mode: 'create' | 'extend' | 'reduce' | 'repair' | 'remove',
    item: BranchWorkspaceSnapshot | null,
    requestPlan = false,
    reduceRepositoryName: string | null = null,
  ) => {
    branchActions.reset()
    setBranchDialogMode(mode)
    setDialogWorkspace(item)
    setFixedReduceRepositoryName(reduceRepositoryName)
    setBranchDialogOpen(true)
    if (requestPlan && item) {
      void branchActions.requestPlan(
        mode === 'repair'
          ? { operation: 'repair', branchWorkspaceId: item.id }
          : mode === 'reduce'
            ? {
                operation: 'reduce',
                branchWorkspaceId: item.id,
                repositories: item.repositories
                  .filter((repository) => repository.progress !== 'complete')
                  .map((repository) => repository.repositoryName),
              }
            : {
                operation: 'remove',
                branchWorkspaceId: item.id,
                alsoDeleteBranch: false,
                alsoDeleteUpstream: false,
              },
      )
    }
  }
  const openPull = () => {
    pullActions.reset()
    setPullOpen(true)
    void pullActions.requestPlan()
  }
  const openDependencyDialog = (mode: 'add' | 'remove', item: BranchWorkspaceSnapshot) => {
    branchDependencyActions.reset()
    setDependencyDialogMode(mode)
    setDependencyBranchWorkspaceId(item.id)
    setDependencyDialogOpen(true)
    void branchDependencyActions.read(item.id)
  }
  const branchWorkspacePrimaryActions = (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
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
        size="icon-sm"
        aria-label={t('workspace.pull-all')}
        title={t('workspace.pull-all')}
        disabled={!batchReady || reorderPending}
        onClick={openPull}
      >
        <Download aria-hidden="true" />
      </Button>
    </>
  )
  const workspaceRepositoryOnlyActions = (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
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
        size="icon-sm"
        aria-label={t('workspace.rescan')}
        title={t('workspace.rescan')}
        disabled={scanning}
        onClick={() => void rescanWorkspace(workspaceRootId)}
      >
        {scanning ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
      </Button>
    </>
  )
  const repositoryListToggleAction = (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={t(repositoryListVisible ? 'workspace.repositories.hide' : 'workspace.repositories.show')}
      title={t(repositoryListVisible ? 'workspace.repositories.hide' : 'workspace.repositories.show')}
      onClick={handleRepositoryListToggle}
    >
      {repositoryListVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
    </Button>
  )
  const repositoryHeaderActions = (
    <>
      {branchWorkspacePrimaryActions}
      {workspaceRepositoryOnlyActions}
      {repositoryListToggleAction}
    </>
  )
  const hiddenRepositoryActions = (
    <>
      {branchWorkspacePrimaryActions}
      {repositoryListToggleAction}
    </>
  )
  const branchListRefreshAction = (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      disabled={branchReloadPending}
      aria-label={t('workspace.branch-workspace.reload')}
      title={t('workspace.branch-workspace.reload')}
      onClick={() => void reloadBranchWorkspaces()}
    >
      {branchReloadPending ? (
        <LoaderCircle className="animate-spin" aria-hidden="true" />
      ) : (
        <RefreshCw aria-hidden="true" />
      )}
    </Button>
  )

  return (
    <>
      <div className={cn(fill ? 'flex min-h-0 flex-1 flex-col' : 'shrink-0', 'bg-sidebar')}>
        {repositoryListVisible ? (
          <WorkspaceRepositoryListPane
            label={t('workspace.repositories')}
            actions={repositoryHeaderActions}
            height={repositoryListHeight}
            onHeightChange={handleRepositoryListHeightChange}
          >
            <ManifestRow
              active={activeContext.kind === 'overview'}
              name={overviewName}
              terminalCount={overviewTerminalCount}
              hasTerminalBell={overviewHasTerminalBell}
              hasTerminalOutputActivity={overviewHasTerminalOutputActivity}
              onActivate={() => activateWorkspaceOverview(workspaceRootId)}
              onToggleFileArea={onToggleFileArea}
            />
            <WorkspaceRepositoryList
              repositories={repositoryItems}
              currentRepoId={currentRepoId}
              disabled={!reorderReady}
              onActivate={(repositoryId) => activateWorkspaceRepository(workspaceRootId, repositoryId)}
              onReorder={(fromId, toId) => void reorderRepositories(fromId, toId)}
              onToggleFileArea={onToggleFileArea}
            />
          </WorkspaceRepositoryListPane>
        ) : null}
        {branchListVisible ? (
          <section
            aria-label={t('workspace.branch-workspace.list')}
            className={cn('px-1.5 pb-1.5', fill && 'min-h-0 flex-1 overflow-y-auto')}
          >
            <div className="flex h-7 items-center gap-1 px-2 pt-1">
              <span className="min-w-0 flex-1 text-[length:var(--goblin-project-titlebar-font-size)] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">
                {t('workspace.branch-workspace.list')}
              </span>
              {branchListRefreshAction}
              {!repositoryListVisible ? hiddenRepositoryActions : null}
            </div>
            {branchQuery.isPending ? (
              <div className="px-2 py-2 text-xs text-muted-foreground">{t('workspace.branch-workspace.loading')}</div>
            ) : branchQuery.data && !branchQuery.data.ok ? (
              <div className="flex items-center gap-2 px-2 py-2 text-xs text-danger" role="alert">
                <span className="min-w-0 flex-1">{t(branchQuery.data.message)}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={branchReloadPending}
                  aria-label={t('workspace.branch-workspace.reload')}
                  onClick={() => void reloadBranchWorkspaces()}
                >
                  {branchReloadPending ? (
                    <LoaderCircle className="animate-spin" aria-hidden="true" />
                  ) : (
                    <RefreshCw aria-hidden="true" />
                  )}
                  {t('workspace.branch-workspace.reload')}
                </Button>
                {branchQuery.data.message === 'workspace.branch-workspace.read-failed' ? (
                  <Button
                    type="button"
                    variant="destructive-soft"
                    size="sm"
                    aria-label={t('workspace.branch-workspace.cleanup')}
                    onClick={() => setRegistryCleanupOpen(true)}
                  >
                    {t('workspace.branch-workspace.cleanup')}
                  </Button>
                ) : null}
              </div>
            ) : branchItems.length === 0 ? (
              <div className="px-2 py-2 text-xs text-muted-foreground">{t('workspace.branch-workspace.empty')}</div>
            ) : (
              <BranchWorkspaceList
                rootId={workspaceRootId}
                items={branchItems}
                activeId={selectedBranchWorkspaceId}
                activeMemberRepositoryName={selectedBranchWorkspaceMemberName}
                disabled={branchActions.pending || branchDependencyActions.pending}
                gitActionsDisabled={branchGitActions.pending}
                onGitAction={openGitAction}
                gitActionPanel={gitActionPanel}
                changeCountById={branchWorkspaceChangeCountById}
                onActivate={(id) => activateBranchWorkspace(workspaceRootId, id)}
                onToggleFileArea={onToggleFileArea ? () => onToggleFileArea() : undefined}
                onReorder={(orderedIds) => void branchActions.reorder(orderedIds)}
                onInspect={(item) =>
                  openBranchDialog(
                    item.state.kind === 'needs-action' && item.state.action === 'continue-delete'
                      ? 'remove'
                      : item.state.kind === 'needs-action' && item.state.action === 'continue-reduce'
                        ? 'reduce'
                        : 'repair',
                    item,
                  )
                }
                onExtend={(item) => openBranchDialog('extend', item)}
                onReduce={(item, resume = false) => openBranchDialog('reduce', item, resume)}
                onReduceMember={(item, member) => openBranchDialog('reduce', item, false, member.repositoryName)}
                onAddDependencies={(item) => openDependencyDialog('add', item)}
                onRemoveDependencies={(item) => openDependencyDialog('remove', item)}
                onRepair={(item) => openBranchDialog('repair', item, true)}
                onRemove={(item) =>
                  openBranchDialog(
                    'remove',
                    item,
                    item.state.kind === 'needs-action' && item.state.action === 'continue-delete',
                  )
                }
                getMemberPresentation={(_item, member) => getMemberPresentation(member)}
                onOpenRepositoryMember={openRepositoryMember}
                onOpenRepositoryMemberTerminal={openRepositoryMemberTerminal}
                onCancel={() => branchGitActions.cancel()}
              />
            )}
          </section>
        ) : null}
        {reorderError ? (
          <div className="px-3 py-1.5 text-[10px] leading-4 text-danger" role="alert">
            {t(reorderError)}
          </div>
        ) : null}
        {(workspace.error || workspace.configurationError || !workspace.configured || workspace.skipped.length > 0) && (
          <div className="px-3 py-1.5 text-[10px] leading-4 text-warning" role="status">
            {workspace.error
              ? t('workspace.scan-failed')
              : workspace.configurationError
                ? t('workspace.configuration-invalid')
                : !workspace.configured
                  ? t('workspace.configuration-required')
                  : t('workspace.scan-skipped', { count: workspace.skipped.length })}
          </div>
        )}
      </div>
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
        progressWorkspace={dialogProgressWorkspace}
        fixedReduceRepositoryName={fixedReduceRepositoryName}
        plan={branchActions.plan}
        result={branchActions.result}
        pending={branchActions.pending}
        error={branchActions.error}
        onRefreshAuxiliaryCandidates={branchQuery.refresh}
        onOpenChange={(open) => {
          setBranchDialogOpen(open)
          if (!open) {
            setFixedReduceRepositoryName(null)
            if (!branchActions.pending) branchActions.reset()
          }
        }}
        onPreview={branchActions.requestPlan}
        onConfirm={branchActions.confirm}
        onRetry={branchActions.retry}
        onCancel={branchActions.cancel}
      />
      <BranchWorkspaceDependencyDialog
        open={dependencyDialogOpen}
        mode={dependencyDialogMode}
        branchWorkspaceId={dependencyBranchWorkspaceId}
        candidates={branchDependencyActions.candidates}
        plan={branchDependencyActions.plan}
        result={branchDependencyActions.result}
        pending={branchDependencyActions.pending}
        error={branchDependencyActions.error}
        onOpenChange={(open) => {
          setDependencyDialogOpen(open)
          if (!open && !branchDependencyActions.pending) branchDependencyActions.reset()
        }}
        onPreview={branchDependencyActions.requestPlan}
        onConfirm={branchDependencyActions.confirm}
        onCancel={branchDependencyActions.cancel}
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
      <ConfirmDialog
        open={registryCleanupOpen}
        title={t('workspace.branch-workspace.cleanup-title')}
        message={t('workspace.branch-workspace.cleanup-description')}
        confirmLabel={t('workspace.branch-workspace.cleanup-confirm')}
        destructive
        onCancel={() => setRegistryCleanupOpen(false)}
        onConfirm={cleanupRegistry}
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
  onToggleFileArea,
}: {
  active: boolean
  name: string
  terminalCount: number
  hasTerminalBell: boolean
  hasTerminalOutputActivity: boolean
  onActivate: () => void
  onToggleFileArea?: () => void
}) {
  const t = useT()
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      title={name}
      className={cn(
        'group relative flex h-7 w-full min-w-0 items-center gap-2 rounded-[var(--goblin-brand-radius-sm,var(--radius-sm))] px-2 text-left text-[13px] transition-colors',
        active ? 'bg-selected text-selected-foreground' : 'hover:bg-list-row-hover',
      )}
      onClick={onActivate}
      onDoubleClick={onToggleFileArea}
    >
      <Folder className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="shrink-0 font-mono text-muted-foreground">./</span>
        <span className="min-w-0 truncate font-medium">{name}</span>
        {terminalCount > 0 ? (
          <Badge
            data-testid="overview-terminal-count-badge"
            aria-label={t('terminal.open-count', { count: terminalCount })}
            variant="brand"
            className="h-4 gap-1 rounded-full px-1.5 text-[10px] font-semibold tabular-nums"
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
