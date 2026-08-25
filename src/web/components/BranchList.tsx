// Persistent branch list. Each row shows branch name and lightweight
// scan signals. The
// selected row scrolls into view automatically when the user moves with
// j/k or arrows so a long branch list doesn't strand the cursor offscreen.
//
// Worktree branches use a folder-tree glyph and a compact chip beside the
// name. We avoid tinting the whole row so selection, hover, and status
// semantics don't compete for background colour.

import { type ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  KeyboardSensor,
  type DragEndEvent,
  type Modifier,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { FolderTree, GitCommitHorizontal, GitCompareArrows, ListRestart, RotateCcw, Trash2 } from 'lucide-react'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { useT } from '#/web/stores/i18n.ts'
import { visibleBranches } from '#/web/stores/repos/branch-view-mode.ts'
import { BranchRow } from '#/web/components/branch-list/BranchRow.tsx'
import { EmptyState } from '#/web/components/Layout.tsx'
import { ScrollArea } from '#/web/components/ui/scroll-area.tsx'
import { Badge } from '#/web/components/ui/badge.tsx'
import { useMainWindowNavigation } from '#/web/main-window-navigation.tsx'
import type { BranchActionRepo } from '#/web/hooks/branch-action-state.ts'
import type { RepoBranchState, RepoWorktreeState } from '#/web/stores/repos/types.ts'
import { formatWorktreeListPath } from '#/web/lib/paths.ts'
import { cn } from '#/web/lib/cn.ts'
import type { RemoteRepoTarget } from '#/shared/remote-repo.ts'
import { useBranchWorkspaceQuery } from '#/web/branch-workspace-queries.ts'
import { activeWorkspaceRootId } from '#/web/stores/repos/workspace-projects.ts'
import {
  WorkspaceListItemFrame,
  WorkspaceListItemMenu,
  type WorkspaceListItemAction,
} from '#/web/components/repo-workspace/WorkspaceListItem.tsx'
import { AsyncButton } from '#/web/components/AsyncButton.tsx'
import { Tip } from '#/web/components/Tip.tsx'
import { ConfirmDialog } from '#/web/components/ConfirmDialog.tsx'
import { ConfirmCheckbox } from '#/web/components/ConfirmCheckbox.tsx'
import { isSelectableDetachedWorktree } from '#/web/stores/repos/worktree-selection.ts'
import { discardRepositoryChanges } from '#/web/repo-client.ts'
import type { StatusEntry } from '#/shared/git-types.ts'
import { statusEntryPaths } from '#/shared/git-status.ts'

interface Props {
  repoId: string
  showActions?: boolean
  onBranchSelected?: () => void
  onWorktreeDoubleClick?: () => void
  onOpenFileArea?: () => void
}

type OpenActionMenu = { repoId: string; branch: string }

type BranchListRepo = BranchActionRepo & {
  data: BranchActionRepo['data'] & {
    branches: RepoBranchState[]
  }
  ui: {
    selectedBranch: string | null
    selectedDetachedWorktreePath: string | null
    worktreePathOrder: string[]
  }
}

const restrictToVerticalBranchList: Modifier = ({ transform }) => ({ ...transform, x: 0 })

function branchListRepoEqual(a: BranchListRepo | undefined, b: BranchListRepo | undefined): boolean {
  return (
    a === b ||
    (!!a &&
      !!b &&
      a.id === b.id &&
      a.instanceToken === b.instanceToken &&
      a.data.branches === b.data.branches &&
      a.data.currentBranch === b.data.currentBranch &&
      a.data.status === b.data.status &&
      a.data.worktreesByPath === b.data.worktreesByPath &&
      a.ui.selectedBranch === b.ui.selectedBranch &&
      a.ui.selectedDetachedWorktreePath === b.ui.selectedDetachedWorktreePath &&
      a.ui.worktreePathOrder === b.ui.worktreePathOrder &&
      a.operations.branchAction === b.operations.branchAction &&
      a.operations.fetch === b.operations.fetch &&
      a.operations.manualRefresh === b.operations.manualRefresh &&
      a.remote.target === b.remote.target &&
      a.remote.hasRemotes === b.remote.hasRemotes &&
      a.remote.hasBrowserRemote === b.remote.hasBrowserRemote &&
      a.remote.hasGitHubRemote === b.remote.hasGitHubRemote &&
      a.remote.browserRemoteProvider === b.remote.browserRemoteProvider &&
      a.remote.remoteProviders === b.remote.remoteProviders)
  )
}

export function BranchList({
  repoId,
  showActions = true,
  onBranchSelected,
  onWorktreeDoubleClick,
  onOpenFileArea,
}: Props) {
  const t = useT()
  const reorderWorktrees = useReposStore((s) => s.reorderWorktrees)
  const navigation = useMainWindowNavigation()
  const selectedRef = useRef<HTMLLIElement | null>(null)
  const [openActionMenu, setOpenActionMenu] = useState<OpenActionMenu | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const handleSelectBranch = useCallback(
    (branch: string) => {
      navigation.selectRepoBranch(repoId, branch)
      onBranchSelected?.()
    },
    [navigation, onBranchSelected, repoId],
  )
  const handleSelectDetachedWorktree = useCallback(
    (worktreePath: string) => {
      navigation.selectRepoDetachedWorktree(repoId, worktreePath)
      onBranchSelected?.()
    },
    [navigation, onBranchSelected, repoId],
  )
  const repo = useStoreWithEqualityFn(
    useReposStore,
    (s) => branchListRepoFromState(s.repos[repoId]),
    branchListRepoEqual,
  )
  const workspaceRootId = useReposStore(activeWorkspaceRootId)
  const workspaceRepositoryName = useReposStore((state) => {
    if (!workspaceRootId) return null
    const workspace = state.workspaceProjects[workspaceRootId]
    if (!workspace?.repositoryIds.includes(repoId)) return null
    return workspace.candidates.find((candidate) => candidate.id === repoId && candidate.selected)?.name ?? null
  })
  const branchWorkspaceQuery = useBranchWorkspaceQuery(workspaceRootId ?? '')
  const branchWorkspaceMemberPaths = useMemo(() => {
    const paths = new Set<string>()
    if (!workspaceRepositoryName || !branchWorkspaceQuery.data?.ok) return paths
    for (const item of branchWorkspaceQuery.data.items) {
      for (const member of item.repositories) {
        if (member.repositoryName === workspaceRepositoryName && member.progress !== 'removed') {
          paths.add(member.worktreePath)
        }
      }
    }
    return paths
  }, [branchWorkspaceQuery.data, workspaceRepositoryName])
  // Keep the selected row in view as the user navigates with j/k.
  useEffect(() => {
    const selectedEl = selectedRef.current
    if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest' })
  }, [repo?.ui.selectedBranch, repo?.ui.selectedDetachedWorktreePath])

  if (!repo) return null

  const repoRoot = repo.remote.target?.remotePath ?? repo.id
  const branches = visibleBranches({
    branches: repo.data.branches,
    viewMode: 'worktrees',
    worktreePathOrder: repo.ui.worktreePathOrder,
  })
  const sortableWorktreePaths = branches.map((branch) => branch.worktree?.path).filter((path): path is string => !!path)
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    reorderWorktrees(repoId, String(active.id), String(over.id))
  }
  const detachedWorktrees = Object.values(repo.data.worktreesByPath).filter((worktree) => worktree.isDetached)
  useEffect(() => {
    if (!openActionMenu) return
    if (
      openActionMenu.repoId !== repoId ||
      !showActions ||
      !branches.some((branch) => branch.name === openActionMenu.branch)
    ) {
      setOpenActionMenu(null)
    }
  }, [openActionMenu, branches, repoId, showActions])

  if (branches.length === 0 && detachedWorktrees.length === 0) {
    return <EmptyState title={t(repo.data.branches.length === 0 ? 'branches.empty' : 'branches.filter-empty')} />
  }

  const rows = branches.map((branch) => {
    const rowProps = {
      repo,
      branch,
      branchWorkspaceMember: branch.worktree?.path ? branchWorkspaceMemberPaths.has(branch.worktree.path) : false,
      selected: repo.ui.selectedBranch,
      onSelectBranch: handleSelectBranch,
      onWorktreeDoubleClick,
      onOpenFileArea,
      selectedRef,
      showActions,
      actionMenuOpen: openActionMenu?.repoId === repoId && openActionMenu.branch === branch.name,
      onActionMenuOpenChange: (open: boolean) =>
        setOpenActionMenu((current) =>
          open
            ? { repoId, branch: branch.name }
            : current?.repoId === repoId && current.branch === branch.name
              ? null
              : current,
        ),
    }
    return branch.worktree?.path ? (
      <SortableBranchRow {...rowProps} key={branch.name} id={branch.worktree.path} />
    ) : (
      <BranchRow {...rowProps} key={branch.name} />
    )
  })

  const list = (
    <ul className="pb-1.5">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalBranchList]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={sortableWorktreePaths} strategy={verticalListSortingStrategy}>
          {rows}
        </SortableContext>
      </DndContext>
      {detachedWorktrees.length > 0 && (
        <>
          <li className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">
            {t('branches.detached-worktrees')}
          </li>
          {detachedWorktrees.map((worktree) => (
            <DetachedWorktreeRow
              key={worktree.path}
              repo={repo}
              worktree={worktree}
              repoId={repo.id}
              repoInstanceToken={repo.instanceToken}
              repoRoot={repoRoot}
              remoteTarget={repo.remote.target}
              statusEntries={repo.data.status.find((status) => status.path === worktree.path)?.entries ?? null}
              selected={repo.ui.selectedDetachedWorktreePath === worktree.path}
              selectedRef={selectedRef}
              showActions={showActions}
              onSelect={handleSelectDetachedWorktree}
              onDoubleClick={onWorktreeDoubleClick}
            />
          ))}
        </>
      )}
    </ul>
  )

  return <ScrollArea className="min-h-0 flex-1 bg-sidebar">{list}</ScrollArea>
}

function branchListRepoFromState(
  repo: ReturnType<typeof useReposStore.getState>['repos'][string] | undefined,
): BranchListRepo | undefined {
  if (!repo) return undefined
  return {
    id: repo.id,
    instanceToken: repo.instanceToken,
    data: {
      branches: repo.data.branches,
      currentBranch: repo.data.currentBranch,
      status: repo.data.status,
      worktreesByPath: repo.data.worktreesByPath,
    },
    ui: {
      selectedBranch: repo.ui.selectedBranch,
      selectedDetachedWorktreePath: repo.ui.selectedDetachedWorktreePath,
      worktreePathOrder: repo.ui.worktreePathOrder,
    },
    operations: {
      branchAction: repo.operations.branchAction,
      fetch: repo.operations.fetch,
      manualRefresh: repo.operations.manualRefresh,
    },
    remote: {
      target: repo.remote.target,
      hasRemotes: repo.remote.hasRemotes,
      hasBrowserRemote: repo.remote.hasBrowserRemote,
      hasGitHubRemote: repo.remote.hasGitHubRemote,
      browserRemoteProvider: repo.remote.browserRemoteProvider,
      remoteProviders: repo.remote.remoteProviders,
    },
  }
}

function SortableBranchRow(props: ComponentProps<typeof BranchRow> & { id: string }) {
  const { id, ...rowProps } = props
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
  })
  const verticalTransform = transform ? { ...transform, x: 0, scaleX: 1, scaleY: 1 } : null
  return (
    <BranchRow
      {...rowProps}
      sortable={{
        setNodeRef,
        style: {
          transform: CSS.Transform.toString(verticalTransform),
          transition,
        },
        isDragging,
        dragHandle: {
          setActivatorNodeRef,
          props: { ...attributes, ...listeners },
        },
      }}
    />
  )
}

function DetachedWorktreeRow({
  repo,
  worktree,
  repoId,
  repoInstanceToken,
  repoRoot,
  remoteTarget,
  statusEntries,
  selected,
  selectedRef,
  showActions,
  onSelect,
  onDoubleClick,
}: {
  repo: BranchListRepo
  worktree: RepoWorktreeState
  repoId: string
  repoInstanceToken: number
  repoRoot: string
  remoteTarget?: RemoteRepoTarget
  statusEntries: StatusEntry[] | null
  selected: boolean
  selectedRef: React.RefObject<HTMLLIElement | null>
  showActions: boolean
  onSelect: (worktreePath: string) => void
  onDoubleClick?: () => void
}) {
  const t = useT()
  const runBranchAction = useReposStore((state) => state.runBranchAction)
  const setLastResult = useReposStore((state) => state.setLastResult)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false)
  const [forceRemove, setForceRemove] = useState(false)
  const displayPath = formatWorktreeListPath(worktree.path, remoteTarget, repoRoot)
  const head = worktree.head ? worktree.head.slice(0, 12) : t('branches.detached-head')
  const dirty = worktree.isDirty || (worktree.changeCount ?? 0) > 0
  const dirtyChangeCount = dirty && (worktree.changeCount ?? 0) > 0 ? (worktree.changeCount ?? null) : null
  const dirtyLabel =
    dirtyChangeCount === null ? t('branches.dirty') : t('branch-status.worktree-dirty', { n: dirtyChangeCount })
  const title = [t('branches.detached-worktree'), worktree.head ?? null, displayPath, dirty ? dirtyLabel : null]
    .filter(Boolean)
    .join(', ')
  const selectable = isSelectableDetachedWorktree(worktree)
  const prunable = worktree.isPrunable === true
  const actionLabel = t(prunable ? 'action.cleanup-invalid-worktree' : 'action.remove-worktree')
  const actionBusy =
    repo.operations.branchAction.phase !== 'idle' && repo.operations.branchAction.target === worktree.path

  const setItemRef = useCallback(
    (node: HTMLLIElement | null) => {
      if (selected) (selectedRef as { current: HTMLLIElement | null }).current = node
    },
    [selected, selectedRef],
  )
  const discardPaths = statusEntries ? statusEntryPaths(statusEntries) : []
  const discardAction: WorkspaceListItemAction = {
    id: 'discardDetachedWorktreeChanges',
    label: t('action.reset-hard'),
    title: discardPaths.length > 0 ? undefined : t('workspace.branch-workspace.dirty-state-unknown'),
    disabled: discardPaths.length === 0,
    destructive: true,
    icon: <RotateCcw aria-hidden="true" />,
    onSelect: () => setDiscardConfirmOpen(true),
  }

  async function confirmAction() {
    const action = prunable
      ? ({ kind: 'cleanupWorktree', worktreePath: worktree.path } as const)
      : ({
          kind: 'removeWorktree',
          worktreePath: worktree.path,
          alsoDeleteBranch: false,
          forceRemoveWorktree: forceRemove,
        } as const)
    await runBranchAction(repo.id, action, { token: repo.instanceToken })
    setConfirmOpen(false)
    setForceRemove(false)
  }

  return (
    <WorkspaceListItemFrame
      selected={selected}
      unavailable={prunable}
      busy={actionBusy}
      itemRef={selected ? setItemRef : undefined}
      itemProps={{ className: 'mx-1.5', title }}
      buttonProps={{
        'aria-current': selected ? 'page' : undefined,
        disabled: !selectable,
        className: showActions ? undefined : 'pr-2',
        onClick: () => onSelect(worktree.path),
        onDoubleClick: selectable ? onDoubleClick : undefined,
      }}
      leadingIcon={<GitCommitHorizontal size={14} className={dirty ? 'text-attention' : 'text-muted-foreground'} />}
      auxiliaryActions={
        dirty && showActions ? <WorkspaceListItemMenu label={t('action.menu')} groups={[[discardAction]]} /> : undefined
      }
      actions={
        showActions ? (
          <Tip label={actionLabel}>
            <span className="inline-flex">
              <AsyncButton
                type="button"
                variant="ghost"
                size="icon-xs"
                loading={actionBusy}
                disabled={repo.operations.branchAction.phase !== 'idle' || worktree.isLocked === true}
                aria-label={actionLabel}
                className={prunable ? undefined : 'text-danger hover:bg-danger-surface hover:text-danger'}
                onClick={(event) => {
                  event.stopPropagation()
                  setConfirmOpen(true)
                }}
              >
                {() => (prunable ? <ListRestart aria-hidden="true" /> : <Trash2 aria-hidden="true" />)}
              </AsyncButton>
            </span>
          </Tip>
        ) : undefined
      }
      expandedContent={
        <>
          <ConfirmDialog
            open={confirmOpen}
            title={t(
              prunable ? 'action.confirm-cleanup-invalid-worktree-title' : 'action.confirm-remove-worktree-title',
            )}
            message={
              <div className="space-y-2">
                <span className="block">
                  {t(prunable ? 'action.confirm-cleanup-invalid-worktree-body' : 'action.confirm-remove-worktree-body')}
                </span>
                <span className="block break-all font-mono text-foreground">{displayPath}</span>
                {prunable ? (
                  <span className="block">{t('action.confirm-cleanup-invalid-worktree-note')}</span>
                ) : (
                  <ConfirmCheckbox checked={forceRemove} onCheckedChange={setForceRemove} destructive>
                    {t('action.confirm-remove-worktree-force')}
                  </ConfirmCheckbox>
                )}
              </div>
            }
            confirmLabel={t(
              prunable ? 'action.confirm-cleanup-invalid-worktree-confirm' : 'action.confirm-remove-worktree-confirm',
            )}
            destructive={!prunable}
            onCancel={() => {
              setConfirmOpen(false)
              setForceRemove(false)
            }}
            onConfirm={confirmAction}
          />
          <ConfirmDialog
            open={discardConfirmOpen}
            title={t('action.confirm-reset-hard-title')}
            message={t('action.confirm-discard-detached-worktree-body')}
            confirmLabel={t('action.confirm-reset-hard-confirm')}
            destructive
            onCancel={() => setDiscardConfirmOpen(false)}
            onConfirm={async () => {
              const result = await discardRepositoryChanges(repoId, worktree.path, discardPaths)
              setLastResult(repoId, result, repoInstanceToken)
              setDiscardConfirmOpen(false)
            }}
          />
        </>
      }
    >
        <span className="flex min-w-0 items-center gap-2 overflow-hidden">
          <span className="shrink-0 truncate font-mono text-sm text-foreground">{head}</span>
          {dirty ? (
            <Badge
              data-testid="dirty-detached-worktree-badge"
              variant="attention"
              aria-label={dirtyLabel}
              title={dirtyLabel}
              className={cn(
                'h-4 px-1',
                dirtyChangeCount !== null && 'gap-1 rounded-full px-1.5 text-[10px] font-semibold tabular-nums',
              )}
            >
              <GitCompareArrows size={10} aria-hidden="true" />
              {dirtyChangeCount}
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1">
              <FolderTree size={10} />
              {t('branches.detached')}
            </Badge>
          )}
          <span className="min-w-0 truncate text-[11px] leading-none text-muted-foreground/85">{displayPath}</span>
        </span>
    </WorkspaceListItemFrame>
  )
}
