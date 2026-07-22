import { useContext, useMemo, useState, type ReactNode } from 'react'
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
import { arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Eye,
  FolderMinus,
  FolderKanban,
  FolderPlus,
  GitCompareArrows,
  GitMerge,
  RotateCcw,
  SendHorizontal,
  Terminal,
  Trash2,
  X,
} from 'lucide-react'
import type { BranchWorkspaceGitActionKind } from '#/shared/branch-workspace-git-actions.ts'
import type { BranchWorkspaceRepositorySnapshot, BranchWorkspaceSnapshot } from '#/shared/branch-workspaces.ts'
import { EditorAppIcon, TerminalAppIcon } from '#/web/components/ExternalAppIcon/index.tsx'
import { Tip } from '#/web/components/Tip.tsx'
import { Badge } from '#/web/components/ui/badge.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { TerminalBellDot } from '#/web/components/terminal/TerminalBellDot.tsx'
import { TerminalOutputActivityIndicator } from '#/web/components/terminal/TerminalOutputActivityIndicator.tsx'
import {
  TerminalSessionContext,
  TerminalSessionReadContext,
} from '#/web/components/terminal/terminal-session-context.ts'
import { worktreeTerminalKey } from '#/web/components/terminal/terminal-session-keys.ts'
import {
  useWorktreeTerminalCount,
  useWorktreeTerminalHasBell,
  useWorktreeTerminalHasOutputActivity,
} from '#/web/components/terminal/terminal-session-store.ts'
import { openBranchWorkspaceInternalTerminal } from '#/web/components/repo-workspace/BranchWorkspaceTerminalPanel.tsx'
import type { BranchWorkspaceFolderContext } from '#/web/components/repo-workspace/BranchWorkspaceFileTree.tsx'
import { useFolderExternalOpenActions } from '#/web/hooks/useFolderExternalOpenActions.ts'
import { lastPathSegment } from '#/web/lib/paths.ts'
import { useT } from '#/web/stores/i18n.ts'
import { WorkspaceItemContextMenu } from '#/web/components/repo-workspace/WorkspaceItemContextMenu.tsx'
import {
  BranchWorkspaceItemMenu,
  type BranchWorkspaceItemAction,
} from '#/web/components/repo-workspace/BranchWorkspaceItemMenu.tsx'
import {
  WorkspaceListItemActionDock,
  WorkspaceListItemFrame,
  type WorkspaceListItemAction,
} from '#/web/components/repo-workspace/WorkspaceListItem.tsx'
import {
  BranchWorkspaceMemberRow,
  type BranchWorkspaceMemberPresentation,
} from '#/web/components/repo-workspace/BranchWorkspaceMemberRow.tsx'

const restrictToVerticalBranchWorkspaceList: Modifier = ({ transform }) => ({ ...transform, x: 0 })

export interface BranchWorkspaceListProps {
  rootId: string
  items: BranchWorkspaceSnapshot[]
  activeId: string | null
  activeMemberRepositoryName?: string | null
  disabled?: boolean
  changeCountById?: Readonly<Record<string, number>>
  onActivate: (id: string) => void
  onReorder: (orderedIds: string[]) => void | Promise<void>
  onInspect: (item: BranchWorkspaceSnapshot) => void
  onRepair: (item: BranchWorkspaceSnapshot) => void
  onRemove: (item: BranchWorkspaceSnapshot) => void
  onExtend?: (item: BranchWorkspaceSnapshot) => void
  onReduce?: (item: BranchWorkspaceSnapshot, resume?: boolean) => void
  onCancel: (item: BranchWorkspaceSnapshot) => void | Promise<void>
  getMemberPresentation?: (
    item: BranchWorkspaceSnapshot,
    member: BranchWorkspaceRepositorySnapshot,
  ) => BranchWorkspaceMemberPresentation
  onOpenRepositoryMember?: (item: BranchWorkspaceSnapshot, member: BranchWorkspaceRepositorySnapshot) => void
  onOpenRepositoryMemberTerminal?: (item: BranchWorkspaceSnapshot, member: BranchWorkspaceRepositorySnapshot) => void
  onOpenEditor?: (item: BranchWorkspaceSnapshot) => void | Promise<void>
  onOpenExternalTerminal?: (item: BranchWorkspaceSnapshot) => void | Promise<void>
  onOpenInternalTerminal?: (item: BranchWorkspaceSnapshot) => void | Promise<void>
  gitActionsDisabled?: boolean
  onGitAction?: (item: BranchWorkspaceSnapshot, kind: BranchWorkspaceGitActionKind) => void
  gitActionPanel?: { itemId: string; content: ReactNode } | null
}

export function BranchWorkspaceList({
  rootId,
  items,
  activeId,
  activeMemberRepositoryName = null,
  disabled = false,
  changeCountById = {},
  onActivate,
  onReorder,
  onInspect,
  onRepair,
  onRemove,
  onExtend,
  onReduce,
  onCancel,
  getMemberPresentation,
  onOpenRepositoryMember,
  onOpenRepositoryMemberTerminal,
  onOpenEditor,
  onOpenExternalTerminal,
  onOpenInternalTerminal,
  gitActionsDisabled = false,
  onGitAction,
  gitActionPanel = null,
}: BranchWorkspaceListProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (disabled || !over || active.id === over.id) return
    const fromIndex = items.findIndex((item) => item.id === active.id)
    const toIndex = items.findIndex((item) => item.id === over.id)
    if (fromIndex < 0 || toIndex < 0) return
    void onReorder(arrayMove(items, fromIndex, toIndex).map((item) => item.id))
  }

  const selectRoot = (id: string) => {
    onActivate(id)
  }

  const toggleExpanded = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalBranchWorkspaceList]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <ul data-testid="branch-workspace-list">
          {items.map((item) => (
            <BranchWorkspaceRow
              key={item.id}
              rootId={rootId}
              item={item}
              scopeActive={item.id === activeId}
              activeMemberRepositoryName={item.id === activeId ? activeMemberRepositoryName : null}
              expanded={expandedIds.has(item.id)}
              disabled={disabled}
              changeCountById={changeCountById}
              onActivate={selectRoot}
              onToggleExpanded={() => toggleExpanded(item.id)}
              onInspect={onInspect}
              onRepair={onRepair}
              onRemove={onRemove}
              onExtend={onExtend}
              onReduce={onReduce}
              onCancel={onCancel}
              getMemberPresentation={getMemberPresentation}
              onOpenRepositoryMember={onOpenRepositoryMember}
              onOpenRepositoryMemberTerminal={onOpenRepositoryMemberTerminal}
              onOpenEditor={onOpenEditor}
              onOpenExternalTerminal={onOpenExternalTerminal}
              onOpenInternalTerminal={onOpenInternalTerminal}
              gitActionsDisabled={gitActionsDisabled}
              onGitAction={onGitAction}
              gitActionPanel={gitActionPanel}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

function BranchWorkspaceRow({
  rootId,
  item,
  scopeActive,
  activeMemberRepositoryName,
  expanded,
  disabled,
  changeCountById,
  onActivate,
  onToggleExpanded,
  onInspect,
  onRepair,
  onRemove,
  onExtend,
  onReduce,
  onCancel,
  getMemberPresentation,
  onOpenRepositoryMember,
  onOpenRepositoryMemberTerminal,
  onOpenEditor,
  onOpenExternalTerminal,
  onOpenInternalTerminal,
  gitActionsDisabled,
  onGitAction,
  gitActionPanel,
}: Omit<BranchWorkspaceListProps, 'items' | 'activeId' | 'activeMemberRepositoryName' | 'onReorder'> & {
  item: BranchWorkspaceSnapshot
  scopeActive: boolean
  activeMemberRepositoryName: string | null
  expanded: boolean
  onToggleExpanded: () => void
}) {
  const t = useT()
  const ready = item.lifecycle === 'ready'
  const folderAvailable = item.available && item.lifecycle !== 'delete-incomplete'
  const context = branchWorkspaceFolderContext(rootId, item)
  const externalActions = useFolderExternalOpenActions({ repoId: rootId, path: item.path, available: folderAvailable })
  const terminalContext = useContext(TerminalSessionContext)
  const terminalReadContext = useContext(TerminalSessionReadContext)
  const terminalKey = worktreeTerminalKey(rootId, item.path)
  const terminalKeys = useMemo(() => [terminalKey], [terminalKey])
  const terminalCount = useWorktreeTerminalCount(terminalKey)
  const changeCount = changeCountById?.[item.id] ?? 0
  const hasTerminalBell = useWorktreeTerminalHasBell(terminalKey)
  const hasTerminalOutputActivity = useWorktreeTerminalHasOutputActivity(terminalKey)
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: disabled || !ready,
  })
  const rootSelected = scopeActive && !activeMemberRepositoryName
  const activate = () => {
    if (!folderAvailable || item.lifecycle === 'active') return
    if (!rootSelected) onActivate(item.id)
  }
  const openInternal = async () => {
    if (onOpenInternalTerminal) return await onOpenInternalTerminal(item)
    if (!terminalContext || !terminalReadContext) return
    await openBranchWorkspaceInternalTerminal(context, {
      worktreeSnapshot: terminalReadContext.worktreeSnapshot,
      selectTerminal: terminalContext.selectTerminal,
      createTerminal: terminalContext.createTerminal,
      activate,
    })
  }
  const openActionsDisabled = disabled || !ready || !folderAvailable
  const memberListId = `branch-workspace-members-${item.id}`
  const editorAction: WorkspaceListItemAction | undefined = ready
    ? {
        id: 'editor',
        label: t('worktrees.open-in-editor-label'),
        icon: <EditorAppIcon pref={externalActions.editor.iconPref} />,
        disabled: openActionsDisabled || externalActions.editor.disabled,
        busy: externalActions.editor.busy,
        onSelect: () => (onOpenEditor ? onOpenEditor(item) : externalActions.editor.onSelect()),
      }
    : undefined
  const internalTerminalAction: WorkspaceListItemAction | undefined = ready
    ? {
        id: 'terminal',
        label: t('terminal.internal'),
        icon: <Terminal aria-hidden="true" />,
        disabled: openActionsDisabled,
        onSelect: openInternal,
      }
    : undefined
  const readyOpenMenuActions: BranchWorkspaceItemAction[] = ready
    ? [
        {
          label: 'terminal.external',
          icon: <TerminalAppIcon pref={externalActions.externalTerminal.iconPref} />,
          disabled: openActionsDisabled || externalActions.externalTerminal.disabled,
          busy: externalActions.externalTerminal.busy,
          onSelect: () =>
            onOpenExternalTerminal ? onOpenExternalTerminal(item) : externalActions.externalTerminal.onSelect(),
        },
      ]
    : []
  const readyGitActions: BranchWorkspaceItemAction[] =
    ready && onGitAction
      ? [
          {
            label: 'workspace.branch-workspace.git-action.batch-commit',
            icon: <SendHorizontal aria-hidden="true" />,
            disabled: disabled || gitActionsDisabled,
            separated: true,
            onSelect: () => onGitAction(item, 'batch-commit'),
          },
          {
            label: 'workspace.branch-workspace.git-action.pull',
            icon: <ArrowDown aria-hidden="true" />,
            disabled: disabled || gitActionsDisabled,
            onSelect: () => onGitAction(item, 'pull'),
          },
          {
            label: 'workspace.branch-workspace.git-action.push',
            icon: <ArrowUp aria-hidden="true" />,
            disabled: disabled || gitActionsDisabled,
            onSelect: () => onGitAction(item, 'push'),
          },
          {
            label: 'workspace.branch-workspace.git-action.merge-back',
            icon: <GitMerge aria-hidden="true" />,
            disabled: disabled || gitActionsDisabled,
            onSelect: () => onGitAction(item, 'merge-back'),
          },
        ]
      : []
  const readyMembershipActions: BranchWorkspaceItemAction[] = ready
    ? [
        ...(onExtend
          ? [
              {
                label: 'workspace.branch-workspace.add-members',
                icon: <FolderPlus aria-hidden="true" />,
                disabled,
                separated: true,
                onSelect: () => onExtend(item),
              },
            ]
          : []),
        ...(onReduce
          ? [
              {
                label: 'workspace.branch-workspace.remove-members',
                icon: <FolderMinus aria-hidden="true" />,
                disabled,
                destructive: true,
                onSelect: () => onReduce(item),
              },
            ]
          : []),
      ]
    : []
  const lowFrequencyActions: BranchWorkspaceItemAction[] =
    item.lifecycle === 'ready'
      ? [
          {
            label: 'workspace.branch-workspace.delete',
            icon: <Trash2 aria-hidden="true" />,
            disabled,
            destructive: true,
            separated: true,
            onSelect: () => onRemove(item),
          },
        ]
      : item.lifecycle === 'create-incomplete' || item.lifecycle === 'reduce-incomplete'
        ? [
            {
              label: 'workspace.branch-workspace.inspect',
              icon: <Eye aria-hidden="true" />,
              disabled,
              onSelect: () => onInspect(item),
            },
          ]
        : item.lifecycle === 'needs-repair'
          ? [
              {
                label: 'workspace.branch-workspace.inspect',
                icon: <Eye aria-hidden="true" />,
                disabled,
                onSelect: () => onInspect(item),
              },
              {
                label: 'workspace.branch-workspace.delete',
                icon: <Trash2 aria-hidden="true" />,
                disabled,
                destructive: true,
                separated: true,
                onSelect: () => onRemove(item),
              },
            ]
          : item.lifecycle === 'delete-incomplete'
            ? [
                {
                  label: 'workspace.branch-workspace.inspect',
                  icon: <Eye aria-hidden="true" />,
                  disabled,
                  onSelect: () => onInspect(item),
                },
              ]
            : []
  const rowMenuActions = [
    ...readyOpenMenuActions,
    ...readyMembershipActions,
    ...readyGitActions,
    ...lowFrequencyActions,
  ]
  const moreMenu = rowMenuActions.length > 0 ? <BranchWorkspaceItemMenu actions={rowMenuActions} /> : undefined
  const lifecycleAction =
    item.lifecycle === 'active' ? (
      <RowAction label="workspace.branch-workspace.cancel" onClick={() => void onCancel(item)}>
        <X />
      </RowAction>
    ) : item.lifecycle === 'create-incomplete' || item.lifecycle === 'needs-repair' ? (
      <RowAction
        label={
          item.lifecycle === 'create-incomplete'
            ? 'workspace.branch-workspace.retry'
            : 'workspace.branch-workspace.repair'
        }
        onClick={() => onRepair(item)}
      >
        <RotateCcw />
      </RowAction>
    ) : item.lifecycle === 'reduce-incomplete' && onReduce ? (
      <RowAction label="workspace.branch-workspace.continue-reduce" destructive onClick={() => onReduce(item, true)}>
        <FolderMinus />
      </RowAction>
    ) : item.lifecycle === 'delete-incomplete' ? (
      <RowAction label="workspace.branch-workspace.continue-delete" destructive onClick={() => onRemove(item)}>
        <Trash2 />
      </RowAction>
    ) : null
  const branchWorkspaceAuxiliaryActions = (
    <div className="flex w-10 shrink-0 items-center justify-end gap-0.5">
      <span className="inline-flex size-5">
        {item.repositories.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t(expanded ? 'workspace.branch-workspace.collapse' : 'workspace.branch-workspace.expand')}
            aria-expanded={expanded}
            aria-controls={memberListId}
            disabled={disabled || item.lifecycle === 'active'}
            onClick={onToggleExpanded}
          >
            {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
          </Button>
        ) : null}
      </span>
      <span className="inline-flex size-5">{lifecycleAction}</span>
    </div>
  )
  const memberList =
    expanded && item.repositories.length > 0 ? (
      <ul
        id={memberListId}
        data-testid="branch-workspace-member-list"
        data-branch-workspace-scope-spine
        className="relative ml-5 border-l border-brand-border/50 pl-2"
      >
        {item.repositories.map((member) => (
          <BranchWorkspaceMemberRow
            key={member.repositoryName}
            item={item}
            member={member}
            selected={scopeActive && activeMemberRepositoryName === member.repositoryName}
            disabled={disabled || item.lifecycle === 'active'}
            presentation={
              getMemberPresentation?.(item, member) ?? {
                dirty: false,
                changeCount: null,
                navigable: false,
              }
            }
            onOpenRepositoryMember={onOpenRepositoryMember}
            onOpenInternalTerminal={onOpenRepositoryMemberTerminal}
          />
        ))}
      </ul>
    ) : null

  return (
    <WorkspaceItemContextMenu
      editor={{
        ...externalActions.editor,
        disabled: openActionsDisabled || externalActions.editor.disabled,
        icon: <EditorAppIcon pref={externalActions.editor.iconPref} />,
        onSelect: () => (onOpenEditor ? onOpenEditor(item) : externalActions.editor.onSelect()),
      }}
      externalTerminal={{
        ...externalActions.externalTerminal,
        disabled: openActionsDisabled || externalActions.externalTerminal.disabled,
        icon: <TerminalAppIcon pref={externalActions.externalTerminal.iconPref} />,
        onSelect: () =>
          onOpenExternalTerminal ? onOpenExternalTerminal(item) : externalActions.externalTerminal.onSelect(),
      }}
      internalTerminal={{
        disabled: openActionsDisabled,
        icon: <Terminal aria-hidden="true" />,
        onSelect: openInternal,
      }}
      worktreeTerminalKeys={terminalKeys}
      additionalActions={lowFrequencyActions}
    >
      <WorkspaceListItemFrame
        itemRef={setNodeRef}
        itemStyle={{ transform: CSS.Transform.toString(transform), transition }}
        itemProps={{
          'data-branch-workspace-lifecycle': item.lifecycle,
          'data-branch-workspace-id': item.id,
        }}
        selected={rootSelected}
        unavailable={!folderAvailable}
        dragging={isDragging}
        busy={item.lifecycle === 'active'}
        leadingIcon={<FolderKanban className="size-3.5" aria-hidden="true" />}
        dragHandle={
          ready && !disabled
            ? {
                label: t('workspace.branch-workspace.reorder'),
                setActivatorNodeRef,
                props: { ...attributes, ...listeners },
              }
            : undefined
        }
        buttonProps={{
          'data-testid': `branch-workspace-root-${item.id}`,
          'aria-current': rootSelected ? 'page' : undefined,
          disabled: disabled || !folderAvailable || item.lifecycle === 'active',
          title: item.branch,
          className: 'pr-[7.25rem]',
          onClick: activate,
          onDoubleClick: item.repositories.length > 0 ? onToggleExpanded : undefined,
        }}
        auxiliaryActions={branchWorkspaceAuxiliaryActions}
        actions={
          <WorkspaceListItemActionDock
            editor={editorAction}
            internalTerminal={internalTerminalAction}
            moreMenu={moreMenu}
          />
        }
        expandedContent={
          <>
            {memberList}
            {gitActionPanel?.itemId === item.id ? gitActionPanel.content : null}
          </>
        }
      >
        {scopeActive && activeMemberRepositoryName ? (
          <span
            data-testid="branch-workspace-scope-marker"
            className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-brand-border"
            aria-hidden="true"
          />
        ) : null}
        <span className="min-w-0 truncate font-medium">{item.branch}</span>
        {terminalCount > 0 ? (
          <Badge
            data-testid="branch-workspace-terminal-count-badge"
            variant="brand"
            aria-label={t('terminal.open-count', { count: terminalCount })}
            className="h-4 shrink-0 gap-1 rounded-full px-1.5 text-[10px] font-semibold tabular-nums"
          >
            {hasTerminalOutputActivity ? (
              <TerminalOutputActivityIndicator label={t('terminal.output-active')} className="size-2.5" size={10} />
            ) : (
              <Terminal className="size-2.5" aria-hidden="true" />
            )}
            {terminalCount}
          </Badge>
        ) : null}
        {changeCount > 0 ? (
          <Badge
            data-testid="branch-workspace-change-count-badge"
            aria-label={t('branch-status.worktree-dirty', { n: changeCount })}
            title={t('branch-status.worktree-dirty', { n: changeCount })}
            variant="attention"
            className="h-4 shrink-0 gap-1 rounded-full px-1.5 text-[10px] font-semibold tabular-nums"
          >
            <GitCompareArrows size={10} aria-hidden="true" />
            {changeCount}
          </Badge>
        ) : null}
        {hasTerminalBell ? <TerminalBellDot label={t('terminal.bell-unread')} /> : null}
        <LifecycleSummary item={item} />
      </WorkspaceListItemFrame>
    </WorkspaceItemContextMenu>
  )
}

function LifecycleSummary({ item }: { item: BranchWorkspaceSnapshot }) {
  const t = useT()
  if (item.lifecycle === 'ready') return null
  if (item.lifecycle === 'active' && item.activeOperation) {
    return (
      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
        {item.activeOperation.completedCount}/{item.activeOperation.totalCount}
      </span>
    )
  }
  return (
    <span className="ml-auto shrink-0 text-[9px] text-warning">
      {t(`workspace.branch-workspace.lifecycle.${item.lifecycle}`)}
    </span>
  )
}

function RowAction({
  label,
  destructive = false,
  onClick,
  children,
}: {
  label: string
  destructive?: boolean
  onClick: () => void
  children: ReactNode
}) {
  const t = useT()
  return (
    <Tip label={t(label)}>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={t(label)}
        className={destructive ? 'text-danger hover:text-danger' : undefined}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          onClick()
        }}
      >
        {children}
      </Button>
    </Tip>
  )
}

export function branchWorkspaceFolderContext(
  rootId: string,
  item: BranchWorkspaceSnapshot,
): BranchWorkspaceFolderContext {
  return {
    rootId,
    id: item.id,
    branch: item.branch,
    path: item.path,
    lifecycle: item.lifecycle,
    available: item.available,
    managedRootNames: Array.from(
      new Set(item.repositories.map((member) => lastPathSegment(member.worktreePath)).filter(Boolean)),
    ),
  }
}
