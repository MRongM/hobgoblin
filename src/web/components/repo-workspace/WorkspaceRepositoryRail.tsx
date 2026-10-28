import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { arrayMove } from '@dnd-kit/sortable'
import {
  Eye,
  EyeOff,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderTree,
  LoaderCircle,
  RefreshCw,
  Terminal,
} from 'lucide-react'
import type { BranchWorkspaceGitActionKind } from '#/shared/branch-workspace-git-actions.ts'
import type { BranchWorkspaceRepositorySnapshot, BranchWorkspaceSnapshot } from '#/shared/branch-workspaces.ts'
import { isRemoteRepoId, parseRemoteRepoId } from '#/shared/remote-repo.ts'
import { DEFAULT_WORKSPACE_REPOSITORY_LIST_HEIGHT } from '#/shared/workspace-layout.ts'
import { Badge } from '#/web/components/ui/badge.tsx'
import { BranchSyncDelta } from '#/web/components/repo-workspace/BranchSyncDelta.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '#/web/components/ui/context-menu.tsx'
import { ConfirmDialog } from '#/web/components/ConfirmDialog.tsx'
import { BranchWorkspaceDialog } from '#/web/components/repo-workspace/BranchWorkspaceDialog.tsx'
import { BranchWorkspaceRenameDialog } from '#/web/components/repo-workspace/BranchWorkspaceRenameDialog.tsx'
import { BranchWorkspaceDeleteDialog } from '#/web/components/repo-workspace/BranchWorkspaceDeleteDialog.tsx'
import { BranchWorkspaceFolderDialog } from '#/web/components/repo-workspace/BranchWorkspaceFolderDialog.tsx'
import { BranchWorkspaceCloneDialog } from '#/web/components/repo-workspace/BranchWorkspaceCloneDialog.tsx'
import { openRegisteredBranchWorkspace } from '#/web/branch-workspace-navigation-write-paths.ts'
import { useOpenDirectoryAction } from '#/web/hooks/useOpenDirectoryAction.tsx'
import type { WorkspaceListItemAction } from '#/web/components/repo-workspace/WorkspaceListItem.tsx'
import { WorkspaceActionMenuItems } from '#/web/components/repo-workspace/WorkspaceActionMenuItems.tsx'
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
import {
  WorkspaceRepositoryList,
  type WorkspaceRepositoryListItem,
} from '#/web/components/repo-workspace/WorkspaceRepositoryList.tsx'
import { TerminalBellDot } from '#/web/components/terminal/TerminalBellDot.tsx'
import { TerminalOutputActivityIndicator } from '#/web/components/terminal/TerminalOutputActivityIndicator.tsx'
import {
  TerminalSessionContext,
  TerminalSessionReadContext,
} from '#/web/components/terminal/terminal-session-context.ts'
import {
  useTerminalAggregateCount,
  useTerminalAggregateHasBell,
  useTerminalAggregateHasOutputActivity,
} from '#/web/components/terminal/terminal-session-store.ts'
import { worktreeTerminalKey } from '#/web/components/terminal/terminal-session-keys.ts'
import { useBranchWorkspaceQuery } from '#/web/branch-workspace-queries.ts'
import { projectDiscoveredBranchWorkspaceRepositories } from '#/web/branch-workspace-repository-projection.ts'
import { cleanupBranchWorkspaceRegistry, unregisterBranchWorkspace } from '#/web/workspace-client.ts'
import { useBranchWorkspaceActions } from '#/web/hooks/useBranchWorkspaceActions.ts'
import { useBranchWorkspaceDependencyActions } from '#/web/hooks/useBranchWorkspaceDependencyActions.ts'
import { useBranchWorkspaceGitActions } from '#/web/hooks/useBranchWorkspaceGitActions.ts'
import { cn } from '#/web/lib/cn.ts'
import { lastPathSegment } from '#/web/lib/paths.ts'
import { useT } from '#/web/stores/i18n.ts'
import { repoPlainWorkspacePath } from '#/web/stores/repos/capabilities.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { getBranchWorktreeState, getWorktreeChangeCount } from '#/web/stores/repos/worktree-state.ts'
import {
  activeWorkspaceRootId,
  projectRepositoryIds,
  workspaceRepositoryListExpanded,
} from '#/web/stores/repos/workspace-projects.ts'
import { repoTerminalWorktreePaths } from '#/web/components/RepoTabs.tsx'
import {
  branchWorkspaceMemberRepositoryId,
  resolveBranchWorkspaceMemberTarget,
} from '#/web/components/repo-workspace/branch-workspace-member-target.ts'
import { WorkspaceRepositoryListPane } from '#/web/components/repo-workspace/WorkspaceRepositoryListPane.tsx'
import { buildBranchWorkspaceBatchErrorAiCommand, prefillAiTerminalTargetCommand } from '#/web/ai-terminal-handoff.ts'
import { fetchWorkspaceRepositories } from '#/web/workspace-repository-fetch.ts'
import {
  activateWorkspaceParentTerminalTarget,
  resolveWorkspaceParentTerminalTarget,
} from '#/web/components/repo-workspace/workspace-parent-terminal-navigation.ts'

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
  const terminalReadContext = useContext(TerminalSessionReadContext)
  const terminalCommands = useContext(TerminalSessionContext)
  const workspace = useReposStore((state) => state.workspaceProjects[workspaceRootId])
  const repos = useReposStore((state) => state.repos)
  const workspaceProjects = useReposStore((state) => state.workspaceProjects)
  const repoOrder = useReposStore((state) => state.order)
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
  const setDetailCollapsed = useReposStore((state) => state.setDetailCollapsed)
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
  const [branchDialogOpen, setBranchDialogOpen] = useState(false)
  const [folderDialogOpen, setFolderDialogOpen] = useState(false)
  const [renameWorkspace, setRenameWorkspace] = useState<BranchWorkspaceSnapshot | null>(null)
  const [cloneSource, setCloneSource] = useState<BranchWorkspaceSnapshot | null>(null)
  const cloneTargets = useMemo(
    () =>
      [...new Set([...repoOrder, ...Object.keys(workspaceProjects)])].flatMap((rootId) => {
        const root = repos[rootId]
        if (
          !root ||
          root.isGitRepo !== false ||
          isRemoteRepoId(rootId) ||
          root.remote.target ||
          root.availability.phase !== 'available'
        )
          return []
        const project = workspaceProjects[rootId]
        const repositories = [
          ...new Set([
            ...(project?.repositoryIds ?? []),
            ...(project?.candidates.filter((candidate) => candidate.available).map((candidate) => candidate.id) ?? []),
          ]),
        ].flatMap((id) => {
          if (isRemoteRepoId(id)) return []
          const repository = repos[id]
          const candidate = project?.candidates.find((entry) => entry.id === id)
          if (
            repository?.remote.target ||
            repository?.isGitRepo === false ||
            repository?.availability.phase === 'unavailable'
          )
            return []
          return [{ id, name: repository?.name ?? candidate?.name ?? id }]
        })
        return [{ rootId, name: root.name, repositories }]
      }),
    [repoOrder, repos, workspaceProjects],
  )
  const [branchDialogMode, setBranchDialogMode] = useState<'create' | 'extend' | 'reduce' | 'repair' | 'remove'>(
    'create',
  )
  const [dialogWorkspace, setDialogWorkspace] = useState<BranchWorkspaceSnapshot | null>(null)
  const [fixedReduceRepositoryName, setFixedReduceRepositoryName] = useState<string | null>(null)
  const [dependencyDialogOpen, setDependencyDialogOpen] = useState(false)
  const [dependencyDialogMode, setDependencyDialogMode] = useState<'add' | 'remove'>('add')
  const [dependencyBranchWorkspaceId, setDependencyBranchWorkspaceId] = useState('')
  const [optimisticRepositoryIds, setOptimisticRepositoryIds] = useState<string[] | null>(null)
  const [reorderPending, setReorderPending] = useState(false)
  const [reorderError, setReorderError] = useState<string | null>(null)
  const [gitActionOpen, setGitActionOpen] = useState(false)
  const [gitActionKind, setGitActionKind] = useState<BranchWorkspaceGitActionKind>('batch-commit')
  const [gitActionTargetId, setGitActionTargetId] = useState<string | null>(null)
  const [branchReloadPending, setBranchReloadPending] = useState(false)
  const branchReloadPendingRef = useRef(false)
  const refreshingBranchChangesRef = useRef<Set<string>>(new Set())
  const [refreshingBranchChanges, setRefreshingBranchChanges] = useState<ReadonlySet<string>>(() => new Set())
  const refreshingRepositoryIdsRef = useRef<Set<string>>(new Set())
  const [refreshingRepositoryIds, setRefreshingRepositoryIds] = useState<ReadonlySet<string>>(() => new Set())
  const [registryCleanupOpen, setRegistryCleanupOpen] = useState(false)
  const [unregisteringBranchWorkspaceId, setUnregisteringBranchWorkspaceId] = useState<string | null>(null)
  const [deleteWorkspace, setDeleteWorkspace] = useState<BranchWorkspaceSnapshot | null>(null)
  const dialogProgressWorkspace = branchActions.plan
    ? (branchItems.find((item) => item.id === branchActions.plan?.branchWorkspaceId) ?? null)
    : null
  const returnBranchDialogToSelection = async () => {
    const branchWorkspaceId = branchActions.plan?.branchWorkspaceId
    const refreshed = await branchQuery.refresh().catch(() => null)
    const refreshedWorkspace =
      branchWorkspaceId && refreshed?.ok
        ? (refreshed.items.find((item) => item.id === branchWorkspaceId) ?? null)
        : null
    const latestWorkspace = refreshedWorkspace ?? dialogProgressWorkspace
    if (latestWorkspace) setDialogWorkspace(latestWorkspace)
    branchActions.returnToSelection()
  }

  const overviewRootPath = repoPlainWorkspacePath(repos[workspaceRootId]) ?? workspaceRootId
  const overviewDirectoryAction = useOpenDirectoryAction({
    repoId: workspaceRootId,
    path: parseRemoteRepoId(workspaceRootId)?.remotePath ?? overviewRootPath,
    disabled: repos[workspaceRootId]?.availability.phase === 'unavailable',
  })
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
  const handleOverviewActivate = () => {
    if (!terminalReadContext || !terminalCommands) {
      activateWorkspaceOverview(workspaceRootId)
      return
    }
    const target = resolveWorkspaceParentTerminalTarget({
      rootId: workspaceRootId,
      rootPath: overviewRootPath,
      activeBranchWorkspaceId: activeContext.kind === 'branch-workspace' ? activeContext.branchWorkspaceId : null,
      branchWorkspaces: branchItems,
      worktreeSnapshot: terminalReadContext.worktreeSnapshot,
    })
    activateWorkspaceParentTerminalTarget(target, {
      activateOverview: () => activateWorkspaceOverview(workspaceRootId),
      activateBranchWorkspace: (branchWorkspaceId) => activateBranchWorkspace(workspaceRootId, branchWorkspaceId),
      selectTerminal: terminalCommands.selectTerminal,
      focusTerminal: terminalCommands.focusTerminal,
      revealTerminal: () => setDetailCollapsed(false),
    })
  }
  const handleOverviewFileAreaOpen = onOpenFileArea
    ? () => {
        activateWorkspaceOverview(workspaceRootId)
        onOpenFileArea()
      }
    : undefined
  const candidateNameById = useMemo(
    () => new Map((workspace?.candidates ?? []).map((candidate) => [candidate.id, candidate.name])),
    [workspace?.candidates],
  )
  const branchWorkspaceChangeCountById = useMemo(
    () =>
      Object.fromEntries(
        branchItems.map((item) => [
          item.id,
          item.repositories.reduce((total, member) => {
            if (member.progress === 'removed') return total
            const repositoryId = branchWorkspaceMemberRepositoryId(
              member,
              workspace?.repositoryIds ?? [],
              workspace?.candidates ?? [],
            )
            const repository = repositoryId ? repos[repositoryId] : undefined
            const count =
              repository?.availability.phase === 'available'
                ? getWorktreeChangeCount(repository, member.worktreePath)
                : 0
            return total + count
          }, 0),
        ]),
      ),
    [branchItems, repos, workspace?.repositoryIds, workspace?.candidates],
  )
  const repositoryOptions = useMemo(() => {
    const usedNames = new Set<string>()
    return [
      ...new Set([
        ...(workspace?.repositoryIds ?? []),
        ...(dialogWorkspace?.repositories.flatMap((member) => (member.repositoryId ? [member.repositoryId] : [])) ??
          []),
      ]),
    ].flatMap((repositoryId) => {
      const repo = repos[repositoryId]
      if (!repo) return []
      const baseName =
        candidateNameById.get(repositoryId) ??
        dialogWorkspace?.repositories.find((member) => member.repositoryId === repositoryId)?.repositoryName ??
        repo.name
      let name = baseName
      for (let suffix = 2; usedNames.has(name); suffix++) name = `${baseName}-${suffix}`
      usedNames.add(name)
      const defaultBranch =
        repo.data.branches.find((branch) => branch.isDefault)?.name ||
        repo.data.currentBranch ||
        repo.data.branches[0]?.name ||
        ''
      return [
        {
          id: repositoryId,
          name,
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
          worktrees: Object.values(repo.data.worktreesByPath).flatMap((worktree) =>
            worktree.isPrunable
              ? []
              : [
                  {
                    path: worktree.path,
                    isMain: worktree.isMain,
                    ...(worktree.branch ? { branch: worktree.branch } : {}),
                    ...(worktree.head ? { head: worktree.head } : {}),
                    ...(worktree.isDetached ? { isDetached: true } : {}),
                  },
                ],
          ),
        },
      ]
    })
  }, [candidateNameById, repos, workspace?.repositoryIds, dialogWorkspace])
  const fetchAllRepositories = useCallback(
    async () => await fetchWorkspaceRepositories(workspaceRootId),
    [workspaceRootId],
  )
  const refreshWorkspaceRepositoryChanges = useCallback(async (repositoryId: string) => {
    const state = useReposStore.getState()
    const repository = state.repos[repositoryId]
    if (!repository || repository.availability.phase !== 'available' || repository.isGitRepo === false) return
    const inFlight = refreshingRepositoryIdsRef.current
    if (inFlight.has(repositoryId)) return
    inFlight.add(repositoryId)
    setRefreshingRepositoryIds(new Set(inFlight))
    try {
      await state.refreshCoreData(repositoryId, { token: repository.instanceToken })
    } catch {
      // The store normally projects refresh failures into the resource state;
      // keep menu actions safe if a caller still rejects unexpectedly.
    } finally {
      inFlight.delete(repositoryId)
      setRefreshingRepositoryIds(new Set(inFlight))
    }
  }, [])
  const refreshBranchWorkspaceChanges = useCallback(
    async (item: BranchWorkspaceSnapshot) => {
      const inFlight = refreshingBranchChangesRef.current
      if (inFlight.has(item.id)) return
      inFlight.add(item.id)
      setRefreshingBranchChanges(new Set(inFlight))
      try {
        const refreshed = await branchQuery.refresh().catch(() => null)
        const observed = refreshed?.ok ? (refreshed.items.find((folder) => folder.id === item.id) ?? item) : item
        if (refreshed?.ok) {
          const projection = projectDiscoveredBranchWorkspaceRepositories(
            useReposStore.getState(),
            workspaceRootId,
            refreshed.items,
          )
          if (projection.repos !== useReposStore.getState().repos)
            useReposStore.setState({ repos: projection.repos, order: projection.order })
        }
        const state = useReposStore.getState()
        const workspace = state.workspaceProjects[workspaceRootId]
        const repositoryIds = Array.from(
          new Set(
            observed.repositories.flatMap((member) => {
              if (member.progress === 'removed') return []
              const repositoryId = branchWorkspaceMemberRepositoryId(
                member,
                workspace?.repositoryIds ?? [],
                workspace?.candidates ?? [],
              )
              return repositoryId ? [repositoryId] : []
            }),
          ),
        )
        await Promise.allSettled(
          repositoryIds.map(async (repositoryId) => {
            const repository = useReposStore.getState().repos[repositoryId]
            if (!repository || repository.availability.phase !== 'available' || repository.isGitRepo === false) return
            await useReposStore.getState().refreshCoreData(repositoryId, { token: repository.instanceToken })
          }),
        )
      } finally {
        inFlight.delete(item.id)
        setRefreshingBranchChanges(new Set(inFlight))
      }
    },
    [workspaceRootId, branchQuery.refresh],
  )
  const refreshWorkspaceMemberSnapshots = useCallback(
    (items: readonly BranchWorkspaceSnapshot[]) => {
      const projection = projectDiscoveredBranchWorkspaceRepositories(useReposStore.getState(), workspaceRootId, items)
      if (projection.repos !== useReposStore.getState().repos)
        useReposStore.setState({ repos: projection.repos, order: projection.order })
      const state = useReposStore.getState()
      const memberIds = projectRepositoryIds(state, workspaceRootId, items)
      return Promise.allSettled(
        [...memberIds].map(async (memberId) => {
          const repo = useReposStore.getState().repos[memberId]
          if (!repo?.isGitRepo || repo.availability.phase !== 'available') return
          await useReposStore.getState().refreshSnapshot(memberId, { token: repo.instanceToken })
        }),
      )
    },
    [workspaceRootId],
  )
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

  if (!workspace) return null
  const branchReadError = branchQuery.data?.ok ? branchQuery.data.registryError : branchQuery.data?.message
  const resolveMemberTarget = (member: BranchWorkspaceRepositorySnapshot) => {
    const resolution = resolveBranchWorkspaceMemberTarget({
      member,
      repositoryIds: workspace.repositoryIds,
      candidates: workspace.candidates,
      repos,
    })
    if (!resolution.ok) return resolution
    const repo = repos[resolution.target.repositoryId]
    const branch =
      resolution.target.checkedOutBranch === null
        ? {
            name: 'HEAD',
            isCurrent: false,
            ahead: 0,
            behind: 0,
            lastCommitHash: resolution.target.head ?? '',
            lastCommitMessage: '',
            lastCommitDate: '',
            lastCommitAuthor: '',
            worktree: { path: member.worktreePath },
          }
        : repo?.data.branches.find((candidate) => candidate.name === resolution.target.checkedOutBranch)
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
  const selectRepositoryMember = (item: BranchWorkspaceSnapshot, member: BranchWorkspaceRepositorySnapshot) => {
    const resolution = resolveMemberTarget(member)
    if (!resolution.ok) return
    const selectionChanged =
      activeContext.kind !== 'branch-workspace' ||
      activeContext.branchWorkspaceId !== item.id ||
      activeContext.memberRepositoryName !== member.repositoryName
    if (resolution.target.checkedOutBranch === null)
      useReposStore.getState().selectDetachedWorktree(resolution.target.repositoryId, resolution.target.worktreePath)
    else selectBranch(resolution.target.repositoryId, resolution.target.checkedOutBranch)
    setDetailTab(resolution.target.repositoryId, 'terminal')
    onOpenDetailArea?.()
    activateBranchWorkspace(workspaceRootId, item.id, member.repositoryName)
    if (!selectionChanged || !terminalReadContext || !terminalCommands) return
    const memberWorktreeKey = worktreeTerminalKey(resolution.target.repositoryId, resolution.target.worktreePath)
    const selectedTerminal = terminalReadContext
      .worktreeSnapshot(memberWorktreeKey)
      .sessions.find((session) => session.selected)
    if (!selectedTerminal || selectedTerminal.phase === 'closed' || selectedTerminal.phase === 'error') return
    terminalCommands.focusTerminal(selectedTerminal.key)
  }
  const openRepositoryMemberTerminal = (item: BranchWorkspaceSnapshot, member: BranchWorkspaceRepositorySnapshot) => {
    const resolution = resolveMemberTarget(member)
    if (!resolution.ok) return
    if (resolution.target.checkedOutBranch === null)
      useReposStore.getState().selectDetachedWorktree(resolution.target.repositoryId, resolution.target.worktreePath)
    else selectBranch(resolution.target.repositoryId, resolution.target.checkedOutBranch)
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
    const branch =
      repo.availability.phase === 'available' && repo.isGitRepo !== false
        ? repo.data.branches.find((branch) => branch.name === repo.data.currentBranch)
        : undefined
    return [
      {
        id: repositoryId,
        name: candidateNameById.get(repositoryId) ?? repo.name,
        branch: repo.data.currentBranch,
        ahead: branch?.ahead ?? 0,
        behind: branch?.behind ?? 0,
        changeCount: repo.data.status.reduce((total, status) => total + status.entries.length, 0),
        terminalWorktreePaths: repoTerminalWorktreePaths(repo),
        unavailable: repo.availability.phase === 'unavailable',
      },
    ]
  })
  const syncDelta = repositoryItems.reduce(
    (total, repository) => ({
      ahead: total.ahead + (repository.ahead ?? 0),
      behind: total.behind + (repository.behind ?? 0),
    }),
    { ahead: 0, behind: 0 },
  )
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
  const finishWorkspaceFolderRemoval = async (item: BranchWorkspaceSnapshot) => {
    const state = useReposStore.getState()
    const context = state.workspaceActiveContextByRoot[workspaceRootId]
    if (context?.kind === 'branch-workspace' && context.branchWorkspaceId === item.id) {
      if (activeWorkspaceRootId(state) === workspaceRootId) state.activateWorkspaceOverview(workspaceRootId)
      else
        useReposStore.setState((current) => ({
          workspaceActiveContextByRoot: {
            ...current.workspaceActiveContextByRoot,
            [workspaceRootId]: { kind: 'overview' as const },
          },
        }))
    }
    await branchQuery.refresh().catch(() => undefined)
  }
  const unregisterWorkspaceFolder = async (item: BranchWorkspaceSnapshot) => {
    if (unregisteringBranchWorkspaceId !== null) return
    setUnregisteringBranchWorkspaceId(item.id)
    try {
      const result = await unregisterBranchWorkspace(workspaceRootId, item.id)
      if (!result.ok) {
        toast.error(t(result.message ?? 'workspace.branch-workspace.unregister-failed'))
        return
      }
      await finishWorkspaceFolderRemoval(item)
    } catch {
      toast.error(t('workspace.branch-workspace.unregister-failed'))
    } finally {
      setUnregisteringBranchWorkspaceId(null)
    }
  }
  const reloadBranchWorkspaces = async () => {
    if (branchReloadPendingRef.current) return
    branchReloadPendingRef.current = true
    setBranchReloadPending(true)
    try {
      const refreshed = await branchQuery.refresh()
      await refreshWorkspaceMemberSnapshots(refreshed?.ok ? refreshed.items : branchItems)
    } catch {
      // The current read error remains visible and retryable.
    } finally {
      branchReloadPendingRef.current = false
      setBranchReloadPending(false)
    }
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
  const gitActionPanelElement =
    gitActionOpen && gitActionTarget ? (
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
        onBatchDiscard={branchGitActions.executeBatchDiscard}
        onBatchAlignRemote={branchGitActions.executeBatchAlignRemote}
        onBatchSetUpstream={branchGitActions.executeBatchSetUpstream}
        onBatchMergeIn={branchGitActions.executeBatchMergeIn}
        onBatchMergeOut={branchGitActions.executeBatchMergeOut}
        onSync={branchGitActions.executeSync}
        onCancel={branchGitActions.cancel}
        onBatchErrorAiHandoff={handoffBatchErrorsToBranchWorkspace}
      />
    ) : null

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
    if (requestPlan && item && mode === 'repair') {
      void branchActions.requestPlan({ operation: 'repair', branchWorkspaceId: item.id })
    }
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
        disabled={scanning || reorderPending || branchActions.executing}
        onClick={() => openBranchDialog('create', null)}
      >
        <FolderPlus aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t('workspace.branch-workspace.folder-register.title')}
        title={t('workspace.branch-workspace.folder-register.title')}
        disabled={scanning || reorderPending || branchActions.executing}
        onClick={() => setFolderDialogOpen(true)}
      >
        <FolderOpen aria-hidden="true" />
      </Button>
    </>
  )
  const workspaceRepositoryOnlyActions = (
    <>
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
      {workspaceRepositoryOnlyActions}
      {repositoryListToggleAction}
    </>
  )
  const hiddenRepositoryActions = <>{repositoryListToggleAction}</>
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
              directoryAction={overviewDirectoryAction}
              active={activeContext.kind === 'overview'}
              name={overviewName}
              syncDelta={syncDelta}
              terminalCount={overviewTerminalCount}
              hasTerminalBell={overviewHasTerminalBell}
              hasTerminalOutputActivity={overviewHasTerminalOutputActivity}
              onActivate={handleOverviewActivate}
              onOpenFileArea={handleOverviewFileAreaOpen}
              onToggleFileArea={onToggleFileArea}
            />
            <WorkspaceRepositoryList
              repositories={repositoryItems}
              currentRepoId={currentRepoId}
              disabled={!reorderReady}
              refreshingRepositoryIds={refreshingRepositoryIds}
              onRefreshRepository={refreshWorkspaceRepositoryChanges}
              onActivate={(repositoryId) => activateWorkspaceRepository(workspaceRootId, repositoryId)}
              onReorder={(fromId, toId) => void reorderRepositories(fromId, toId)}
              onToggleFileArea={onToggleFileArea}
              onOpenFileArea={onOpenFileArea}
            />
          </WorkspaceRepositoryListPane>
        ) : null}
        {branchListVisible ? (
          <section
            aria-label={t('workspace.branch-workspace.list')}
            className={cn(fill && 'flex min-h-0 flex-1 flex-col')}
          >
            <div className="flex h-7 shrink-0 items-center gap-1 px-3 pt-1">
              <span className="min-w-0 flex-1 text-[length:var(--goblin-project-titlebar-font-size)] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">
                {t('workspace.branch-workspace.list')}
              </span>
              {branchWorkspacePrimaryActions}
              {branchListRefreshAction}
              {!repositoryListVisible ? hiddenRepositoryActions : null}
            </div>
            <div
              className={cn('px-1.5 pb-1.5', fill && 'min-h-0 flex-1 overflow-y-auto')}
              data-testid="branch-workspace-scroll-body"
            >
              {!branchQuery.isPending && branchReadError ? (
                <div className="flex items-center gap-2 px-2 py-2 text-xs text-danger" role="alert">
                  <span className="min-w-0 flex-1">{t(branchReadError)}</span>
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
                  {branchReadError === 'workspace.branch-workspace.read-failed' ? (
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
              ) : null}
              {branchQuery.isPending ? (
                <div className="px-2 py-2 text-xs text-muted-foreground">{t('workspace.branch-workspace.loading')}</div>
              ) : branchQuery.data && !branchQuery.data.ok ? null : branchItems.length === 0 ? (
                <div className="px-2 py-2 text-xs text-muted-foreground">{t('workspace.branch-workspace.empty')}</div>
              ) : (
                <BranchWorkspaceList
                  rootId={workspaceRootId}
                  items={branchItems}
                  activeId={selectedBranchWorkspaceId}
                  activeMemberRepositoryName={selectedBranchWorkspaceMemberName}
                  disabled={
                    branchActions.pending ||
                    branchDependencyActions.pending ||
                    unregisteringBranchWorkspaceId !== null ||
                    deleteWorkspace !== null
                  }
                  gitActionsDisabled={branchGitActions.pending}
                  onGitAction={openGitAction}
                  changeCountById={branchWorkspaceChangeCountById}
                  refreshingChangeIds={refreshingBranchChanges}
                  onRefreshChanges={refreshBranchWorkspaceChanges}
                  onActivate={(id) => activateBranchWorkspace(workspaceRootId, id)}
                  onToggleFileArea={onToggleFileArea ? () => onToggleFileArea() : undefined}
                  onOpenFileArea={onOpenFileArea}
                  onReorder={(orderedIds) => void branchActions.reorder(orderedIds)}
                  onExtend={(item) => openBranchDialog('extend', item)}
                  onReduce={(item) => openBranchDialog('reduce', item)}
                  onReduceMember={(item, member) => openBranchDialog('reduce', item, false, member.repositoryName)}
                  onClone={setCloneSource}
                  onAddDependencies={(item) => openDependencyDialog('add', item)}
                  onRemoveDependencies={(item) => openDependencyDialog('remove', item)}
                  onRename={setRenameWorkspace}
                  onRemove={setDeleteWorkspace}
                  onUnregister={(item) => void unregisterWorkspaceFolder(item)}
                  getMemberPresentation={(_item, member) => getMemberPresentation(member)}
                  onSelectRepositoryMember={selectRepositoryMember}
                  onOpenRepositoryMemberTerminal={openRepositoryMemberTerminal}
                  onCancel={() => branchGitActions.cancel()}
                />
              )}
            </div>
          </section>
        ) : null}
        {reorderError ? (
          <div className="px-3 py-1.5 text-[10px] leading-4 text-danger" role="alert">
            {t(reorderError)}
          </div>
        ) : null}
        {(workspace.error || workspace.configurationError || workspace.skipped.length > 0) && (
          <div className="px-3 py-1.5 text-[10px] leading-4 text-warning" role="status">
            {workspace.error
              ? t('workspace.scan-failed')
              : workspace.configurationError
                ? t('workspace.configuration-invalid')
                : t('workspace.scan-skipped', { count: workspace.skipped.length })}
          </div>
        )}
      </div>
      {gitActionPanelElement}
      <BranchWorkspaceDeleteDialog
        key={deleteWorkspace?.id ?? 'closed'}
        rootId={workspaceRootId}
        workspace={deleteWorkspace}
        onOpenChange={(open) => {
          if (!open) setDeleteWorkspace(null)
        }}
        onDeleted={async (item) => {
          await finishWorkspaceFolderRemoval(item)
          const state = useReposStore.getState()
          const ids = new Set(
            item.repositories.flatMap((member) => {
              const id = branchWorkspaceMemberRepositoryId(member, workspace.repositoryIds, workspace.candidates)
              return id ? [id] : []
            }),
          )
          await Promise.allSettled(
            [...ids].map(async (id) => {
              const repo = useReposStore.getState().repos[id]
              if (repo) await state.refreshSnapshot(id, { token: repo.instanceToken })
            }),
          )
        }}
      />
      <BranchWorkspaceRenameDialog
        rootId={workspaceRootId}
        workspace={renameWorkspace}
        onOpenChange={(open) => {
          if (!open) setRenameWorkspace(null)
        }}
        onRenamed={async () => {
          await reloadBranchWorkspaces()
        }}
      />
      <BranchWorkspaceFolderDialog
        open={folderDialogOpen}
        rootId={workspaceRootId}
        onOpenChange={setFolderDialogOpen}
        onRegistered={openRegisteredBranchWorkspace}
      />
      <BranchWorkspaceCloneDialog
        open={cloneSource !== null}
        source={cloneSource}
        targets={cloneTargets}
        onOpenChange={(open) => {
          if (!open) setCloneSource(null)
        }}
        onCloned={openRegisteredBranchWorkspace}
      />
      <BranchWorkspaceDialog
        open={branchDialogOpen}
        mode={branchDialogMode}
        repositories={repositoryOptions}
        defaultParentDirectory={
          repos[workspaceRootId]?.remote.target?.remotePath ??
          parseRemoteRepoId(workspaceRootId)?.remotePath ??
          overviewRootPath
        }
        allowNativeDirectoryPicker={!isRemoteRepoId(workspaceRootId)}
        auxiliaryCandidates={auxiliaryCandidates}
        workspace={dialogWorkspace}
        progressWorkspace={dialogProgressWorkspace}
        fixedReduceRepositoryName={fixedReduceRepositoryName}
        plan={branchActions.plan}
        result={branchActions.result}
        pending={branchActions.pending}
        executing={branchActions.executing}
        error={branchActions.error}
        onFetchAllRepositories={fetchAllRepositories}
        onRefreshAuxiliaryCandidates={branchQuery.refresh}
        onOpenChange={(open) => {
          setBranchDialogOpen(open)
          if (!open) {
            setFixedReduceRepositoryName(null)
            if (!branchActions.pending) branchActions.reset()
          }
        }}
        plannedRequest={branchActions.request}
        onPreview={branchActions.requestPlan}
        onConfirm={branchActions.confirm}
        onForceConfirm={branchActions.forceConfirm}
        onRetry={branchActions.retry}
        onReturnToSelection={returnBranchDialogToSelection}
        onCancel={branchActions.cancel}
      />
      <BranchWorkspaceDependencyDialog
        open={dependencyDialogOpen}
        mode={dependencyDialogMode}
        branchWorkspaceId={dependencyBranchWorkspaceId}
        candidates={branchDependencyActions.candidates}
        plan={branchDependencyActions.plan}
        plannedRequest={branchDependencyActions.request}
        result={branchDependencyActions.result}
        pending={branchDependencyActions.pending}
        reading={branchDependencyActions.reading}
        planning={branchDependencyActions.planning}
        executing={branchDependencyActions.executing}
        error={branchDependencyActions.error}
        onOpenChange={(open) => {
          setDependencyDialogOpen(open)
          if (!open && !branchDependencyActions.pending) branchDependencyActions.reset()
        }}
        onPreview={branchDependencyActions.requestPlan}
        onConfirm={branchDependencyActions.confirm}
        onRecheck={() => branchDependencyActions.read(dependencyBranchWorkspaceId)}
        onCancel={branchDependencyActions.cancel}
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
  directoryAction,
  active,
  name,
  syncDelta,
  terminalCount,
  hasTerminalBell,
  hasTerminalOutputActivity,
  onActivate,
  onOpenFileArea,
  onToggleFileArea,
}: {
  directoryAction: WorkspaceListItemAction
  active: boolean
  name: string
  syncDelta: { ahead: number; behind: number }
  terminalCount: number
  hasTerminalBell: boolean
  hasTerminalOutputActivity: boolean
  onActivate: () => void
  onOpenFileArea?: () => void
  onToggleFileArea?: () => void
}) {
  const t = useT()
  const actions: WorkspaceListItemAction[] = [
    {
      id: 'fileArea',
      label: t('file-area.open'),
      disabled: !onOpenFileArea,
      icon: <FolderTree aria-hidden="true" />,
      onSelect: () => onOpenFileArea?.(),
    },
    directoryAction,
  ]
  const row = (
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
        {syncDelta.ahead > 0 ? (
          <BranchSyncDelta
            direction="ahead"
            count={syncDelta.ahead}
            label={t('branch-status.sync.ahead', { n: syncDelta.ahead })}
          />
        ) : null}
        {syncDelta.behind > 0 ? (
          <BranchSyncDelta
            direction="behind"
            count={syncDelta.behind}
            label={t('branch-status.sync.behind', { n: syncDelta.behind })}
          />
        ) : null}
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

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <ContextMenuContent>
        <WorkspaceActionMenuItems context groups={[actions]} />
      </ContextMenuContent>
    </ContextMenu>
  )
}
