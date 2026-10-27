import { useWorktreeDependencyMenu } from '#/web/hooks/useWorktreeDependencyMenu.tsx'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { FolderGit2, FolderTree, GitCompareArrows, RefreshCw, Terminal, X } from 'lucide-react'
import { useMemo } from 'react'
import { Badge } from '#/web/components/ui/badge.tsx'
import { BranchSyncDelta } from '#/web/components/repo-workspace/BranchSyncDelta.tsx'
import { TerminalBellDot } from '#/web/components/terminal/TerminalBellDot.tsx'
import { TerminalOutputActivityIndicator } from '#/web/components/terminal/TerminalOutputActivityIndicator.tsx'
import {
  useRepoTerminalCount,
  useRepoTerminalHasBell,
  useRepoTerminalHasOutputActivity,
} from '#/web/components/terminal/terminal-session-store.ts'
import { cn } from '#/web/lib/cn.ts'
import { useT } from '#/web/stores/i18n.ts'
import { worktreeTerminalKey } from '#/web/components/terminal/terminal-session-keys.ts'
import { EditorAppIcon, TerminalAppIcon } from '#/web/components/ExternalAppIcon/index.tsx'
import { WorkspaceItemContextMenu } from '#/web/components/repo-workspace/WorkspaceItemContextMenu.tsx'
import { useProjectExternalOpenActions } from '#/web/hooks/useProjectExternalOpenActions.ts'
import { useOpenDirectoryAction } from '#/web/hooks/useOpenDirectoryAction.tsx'
import { parseRemoteRepoId } from '#/shared/remote-repo.ts'
import { useProjectInternalTerminalAction } from '#/web/hooks/useProjectInternalTerminalAction.ts'
import { useCloseTerminalScope } from '#/web/components/terminal/TerminalScopeContextMenu.tsx'
import {
  WorkspaceListItemActionDock,
  WorkspaceListItemFrame,
  WorkspaceListItemMenu,
  type WorkspaceListItemAction,
} from '#/web/components/repo-workspace/WorkspaceListItem.tsx'
import { useRepositoryCreationActions } from '#/web/hooks/useRepositoryCreationActions.tsx'
import { supportsTmuxMenu } from '#/web/tmux-menu.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'

const restrictToVerticalRepositoryList: Modifier = ({ transform }) => ({ ...transform, x: 0 })

export interface WorkspaceRepositoryListItem {
  id: string
  name: string
  branch?: string
  ahead?: number
  behind?: number
  changeCount: number
  terminalWorktreePaths: string[]
  unavailable: boolean
}

interface Props {
  repositories: WorkspaceRepositoryListItem[]
  currentRepoId: string
  disabled: boolean
  refreshingRepositoryIds?: ReadonlySet<string>
  onRefreshRepository?: (repositoryId: string) => void | Promise<void>
  onActivate: (id: string) => void
  onReorder: (fromId: string, toId: string) => void
  onToggleFileArea?: () => void
  onOpenFileArea?: () => void
}

export function WorkspaceRepositoryList({
  repositories,
  currentRepoId,
  disabled,
  refreshingRepositoryIds = new Set(),
  onRefreshRepository,
  onActivate,
  onReorder,
  onToggleFileArea,
  onOpenFileArea,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (disabled || !over || active.id === over.id) return
    onReorder(String(active.id), String(over.id))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalRepositoryList]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={repositories.map((repository) => repository.id)} strategy={verticalListSortingStrategy}>
        <ul>
          {repositories.map((repository) => (
            <SortableWorkspaceRepositoryRow
              key={repository.id}
              repository={repository}
              active={currentRepoId === repository.id}
              disabled={disabled}
              refreshing={refreshingRepositoryIds.has(repository.id)}
              onRefreshRepository={onRefreshRepository}
              onActivate={onActivate}
              onToggleFileArea={onToggleFileArea}
              onOpenFileArea={onOpenFileArea}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

function SortableWorkspaceRepositoryRow({
  repository,
  active,
  disabled,
  refreshing,
  onRefreshRepository,
  onActivate,
  onToggleFileArea,
  onOpenFileArea,
}: {
  repository: WorkspaceRepositoryListItem
  active: boolean
  disabled: boolean
  refreshing: boolean
  onRefreshRepository?: (repositoryId: string) => void | Promise<void>
  onActivate: (id: string) => void
  onToggleFileArea?: () => void
  onOpenFileArea?: () => void
}) {
  const t = useT()
  const terminalCount = useRepoTerminalCount(repository.id, repository.terminalWorktreePaths)
  const hasTerminalBell = useRepoTerminalHasBell(repository.id, repository.terminalWorktreePaths)
  const hasTerminalOutputActivity = useRepoTerminalHasOutputActivity(repository.id, repository.terminalWorktreePaths)
  const terminalCountLabel = terminalCount > 0 ? t('terminal.open-count', { count: terminalCount }) : null
  const changeCountLabel =
    repository.changeCount > 0 ? t('branch-status.worktree-dirty', { n: repository.changeCount }) : null
  const ahead = repository.ahead ?? 0
  const behind = repository.behind ?? 0
  const aheadLabel = ahead > 0 ? t('branch-status.sync.ahead', { n: ahead }) : null
  const behindLabel = behind > 0 ? t('branch-status.sync.behind', { n: behind }) : null
  const terminalBellLabel = t('terminal.bell-unread')
  const terminalOutputActiveLabel = t('terminal.output-active')
  const terminalWorktreeKeys = useMemo(
    () => repository.terminalWorktreePaths.map((path) => worktreeTerminalKey(repository.id, path)),
    [repository.id, repository.terminalWorktreePaths],
  )
  const closeTerminalScope = useCloseTerminalScope(terminalWorktreeKeys)
  const externalActions = useProjectExternalOpenActions(repository.id)
  const directoryAction = useOpenDirectoryAction({
    repoId: repository.id,
    path: parseRemoteRepoId(repository.id)?.remotePath ?? repository.id,
    disabled: repository.unavailable,
  })
  const internalTerminalAction = useProjectInternalTerminalAction(repository.id)
  const tmuxMenuVisible = supportsTmuxMenu(repository.id)
  const repo = useReposStore((state) => state.repos[repository.id])
  const dependencyMenu = useWorktreeDependencyMenu(repo, { disabled: repository.unavailable || disabled })
  const creation = useRepositoryCreationActions(repo, {
    forceDisabled: repository.unavailable,
  })
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: repository.id,
    disabled,
  })
  const editorMenuAction: WorkspaceListItemAction = {
    id: 'editor',
    label: t('worktrees.open-in-editor-label'),
    icon: <EditorAppIcon pref={externalActions.editor.iconPref} />,
    disabled: externalActions.editor.disabled,
    busy: externalActions.editor.busy,
    onSelect: externalActions.editor.onSelect,
  }
  const editorAction = externalActions.visible ? editorMenuAction : undefined
  const internalAction: WorkspaceListItemAction = {
    id: 'terminal',
    category: 'terminals',
    label: t('terminal.internal'),
    icon: <Terminal aria-hidden="true" />,
    disabled: internalTerminalAction.disabled,
    busy: internalTerminalAction.busy,
    onSelect: internalTerminalAction.onSelect,
  }
  const closeTerminalsAction: WorkspaceListItemAction = {
    id: 'closeAllTerminals',
    category: 'terminals',
    label: closeTerminalScope.label,
    disabled: closeTerminalScope.disabled,
    destructive: true,
    icon: <X aria-hidden="true" />,
    onSelect: closeTerminalScope.requestClose,
  }
  const externalTerminalAction: WorkspaceListItemAction = {
    id: 'externalTerminal',
    category: 'terminals',
    label: t('terminal.external'),
    icon: <TerminalAppIcon pref={externalActions.externalTerminal.iconPref} />,
    disabled: externalActions.externalTerminal.disabled,
    busy: externalActions.externalTerminal.busy,
    visible: externalActions.visible,
    onSelect: externalActions.externalTerminal.onSelect,
  }
  const tmuxTerminalAction: WorkspaceListItemAction = {
    id: 'terminalTmux',
    category: 'terminals',
    label: t('terminal.new-with-tmux'),
    icon: <Terminal aria-hidden="true" />,
    disabled: internalTerminalAction.disabled,
    busy: internalTerminalAction.busy,
    visible: tmuxMenuVisible,
    onSelect: () => internalTerminalAction.onSelect('tmux-if-available'),
  }
  const refreshChangesAction: WorkspaceListItemAction = {
    id: 'refreshChanges',
    label: t('workspace.repository.refresh-changes'),
    icon: <RefreshCw aria-hidden="true" />,
    disabled: repository.unavailable || repo?.isGitRepo === false || !onRefreshRepository,
    busy: refreshing || repo?.operations.status.phase !== 'idle',
    onSelect: () => onRefreshRepository?.(repository.id),
  }
  const handleOpenFileArea = onOpenFileArea
    ? () => {
        onActivate(repository.id)
        onOpenFileArea()
      }
    : undefined
  const fileAreaAction: WorkspaceListItemAction | undefined = handleOpenFileArea
    ? {
        id: 'fileArea',
        label: t('file-area.open'),
        disabled: repository.unavailable,
        icon: <FolderTree aria-hidden="true" />,
        onSelect: handleOpenFileArea,
      }
    : undefined

  const row = (
    <WorkspaceItemContextMenu
      fileArea={fileAreaAction}
      editor={editorMenuAction}
      directory={directoryAction}
      externalTerminal={{
        ...externalActions.externalTerminal,
        icon: <TerminalAppIcon pref={externalActions.externalTerminal.iconPref} />,
      }}
      internalTerminal={{ ...internalTerminalAction, icon: <Terminal aria-hidden="true" /> }}
      tmuxTerminal={
        tmuxMenuVisible
          ? {
              ...internalTerminalAction,
              icon: <Terminal aria-hidden="true" />,
              onSelect: () => internalTerminalAction.onSelect('tmux-if-available'),
            }
          : undefined
      }
      actions={[...creation.items, ...dependencyMenu.actions, refreshChangesAction]}
      worktreeTerminalKeys={terminalWorktreeKeys}
    >
      <WorkspaceListItemFrame
        size="primary"
        itemRef={setNodeRef}
        itemStyle={{ transform: CSS.Transform.toString(transform), transition }}
        selected={active}
        unavailable={repository.unavailable}
        dragging={isDragging}
        leadingIcon={
          <span
            className={cn(
              'relative z-10 flex size-4 shrink-0 items-center justify-center',
              active ? 'bg-list-row-selected' : 'bg-sidebar group-hover:bg-list-row-hover',
            )}
          >
            <FolderGit2 className="size-3.5" aria-hidden="true" />
          </span>
        }
        dragHandle={{
          label: t('workspace.repository-reorder'),
          setActivatorNodeRef,
          props: { ...attributes, ...listeners, disabled },
        }}
        buttonProps={{
          'aria-current': active ? 'page' : undefined,
          'aria-label': [
            repository.name,
            repository.branch,
            terminalCountLabel,
            changeCountLabel,
            aheadLabel,
            behindLabel,
            hasTerminalBell ? terminalBellLabel : null,
          ]
            .filter(Boolean)
            .join('. '),
          title: repository.unavailable ? t('workspace.repository-unavailable') : repository.name,
          onClick: () => onActivate(repository.id),
          onDoubleClick: onToggleFileArea,
        }}
        actions={
          <WorkspaceListItemActionDock
            editor={editorAction}
            internalTerminal={internalAction}
            moreMenu={
              <WorkspaceListItemMenu
                label={t('action.menu')}
                groups={[
                  [...(fileAreaAction ? [fileAreaAction] : []), directoryAction, editorMenuAction],
                  creation.items,
                  dependencyMenu.actions,
                  [refreshChangesAction],
                  [internalAction, tmuxTerminalAction, externalTerminalAction, closeTerminalsAction],
                ]}
              />
            }
          />
        }
      >
        <span data-testid="workspace-repository-primary-content" className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="min-w-0 truncate font-medium">{repository.name}</span>
          {repository.branch ? (
            <span className="min-w-0 truncate font-mono text-[10px] text-muted-foreground">{repository.branch}</span>
          ) : null}
          {terminalCount > 0 || repository.changeCount > 0 || ahead > 0 || behind > 0 || hasTerminalBell ? (
            <span data-testid="workspace-repository-status-badges" className="flex shrink-0 items-center gap-1">
              {terminalCount > 0 ? (
                <Badge
                  data-testid="workspace-repository-terminal-count-badge"
                  aria-label={terminalCountLabel ?? undefined}
                  title={terminalCountLabel ?? undefined}
                  variant="brand"
                  className="h-4 gap-1 rounded-full px-1.5 text-[10px] font-semibold tabular-nums"
                >
                  {hasTerminalOutputActivity ? (
                    <TerminalOutputActivityIndicator label={terminalOutputActiveLabel} className="size-2.5" size={10} />
                  ) : (
                    <Terminal size={10} aria-hidden="true" />
                  )}
                  {terminalCount}
                </Badge>
              ) : null}
              {repository.changeCount > 0 ? (
                <Badge
                  data-testid="workspace-repository-change-count-badge"
                  aria-label={changeCountLabel ?? undefined}
                  title={changeCountLabel ?? undefined}
                  variant="attention"
                  className="h-4 gap-1 rounded-full px-1.5 text-[10px] font-semibold tabular-nums"
                >
                  <GitCompareArrows size={10} aria-hidden="true" />
                  {repository.changeCount}
                </Badge>
              ) : null}
              {ahead > 0 ? <BranchSyncDelta direction="ahead" count={ahead} label={aheadLabel!} /> : null}
              {behind > 0 ? <BranchSyncDelta direction="behind" count={behind} label={behindLabel!} /> : null}
              {hasTerminalBell ? <TerminalBellDot label={terminalBellLabel} /> : null}
            </span>
          ) : null}
        </span>
        {repository.unavailable ? (
          <span className="shrink-0 text-[9px] text-danger">{t('workspace.repository-unavailable')}</span>
        ) : null}
      </WorkspaceListItemFrame>
    </WorkspaceItemContextMenu>
  )

  return (
    <>
      {row}
      {creation.dialogs}
      {dependencyMenu.dialog}
      {closeTerminalScope.dialog}
    </>
  )
}
