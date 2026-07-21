import { useContext, type ReactNode } from 'react'
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
import { Eye, FolderKanban, RotateCcw, SquareTerminal, Trash2, X } from 'lucide-react'
import type { BranchWorkspaceSnapshot } from '#/shared/branch-workspaces.ts'
import { AsyncButton } from '#/web/components/AsyncButton.tsx'
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
import {
  openBranchWorkspaceInternalTerminal,
} from '#/web/components/repo-workspace/BranchWorkspaceTerminalPanel.tsx'
import type { BranchWorkspaceFolderContext } from '#/web/components/repo-workspace/BranchWorkspaceFileTree.tsx'
import { useFolderExternalOpenActions } from '#/web/hooks/useFolderExternalOpenActions.ts'
import { cn } from '#/web/lib/cn.ts'
import { lastPathSegment } from '#/web/lib/paths.ts'
import { useT } from '#/web/stores/i18n.ts'

const restrictToVerticalBranchWorkspaceList: Modifier = ({ transform }) => ({ ...transform, x: 0 })

export interface BranchWorkspaceListProps {
  rootId: string
  items: BranchWorkspaceSnapshot[]
  activeId: string | null
  disabled?: boolean
  onActivate: (id: string) => void
  onReorder: (orderedIds: string[]) => void | Promise<void>
  onInspect: (item: BranchWorkspaceSnapshot) => void
  onRepair: (item: BranchWorkspaceSnapshot) => void
  onRemove: (item: BranchWorkspaceSnapshot) => void
  onCancel: (item: BranchWorkspaceSnapshot) => void | Promise<void>
  onOpenEditor?: (item: BranchWorkspaceSnapshot) => void | Promise<void>
  onOpenExternalTerminal?: (item: BranchWorkspaceSnapshot) => void | Promise<void>
  onOpenInternalTerminal?: (item: BranchWorkspaceSnapshot) => void | Promise<void>
}

export function BranchWorkspaceList({
  rootId,
  items,
  activeId,
  disabled = false,
  onActivate,
  onReorder,
  onInspect,
  onRepair,
  onRemove,
  onCancel,
  onOpenEditor,
  onOpenExternalTerminal,
  onOpenInternalTerminal,
}: BranchWorkspaceListProps) {
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
              active={item.id === activeId}
              disabled={disabled}
              onActivate={onActivate}
              onInspect={onInspect}
              onRepair={onRepair}
              onRemove={onRemove}
              onCancel={onCancel}
              onOpenEditor={onOpenEditor}
              onOpenExternalTerminal={onOpenExternalTerminal}
              onOpenInternalTerminal={onOpenInternalTerminal}
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
  active,
  disabled,
  onActivate,
  onInspect,
  onRepair,
  onRemove,
  onCancel,
  onOpenEditor,
  onOpenExternalTerminal,
  onOpenInternalTerminal,
}: Omit<BranchWorkspaceListProps, 'items' | 'activeId' | 'onReorder'> & {
  item: BranchWorkspaceSnapshot
  active: boolean
}) {
  const t = useT()
  const ready = item.lifecycle === 'ready'
  const folderAvailable = item.available && item.lifecycle !== 'delete-incomplete'
  const context = branchWorkspaceFolderContext(rootId, item)
  const externalActions = useFolderExternalOpenActions({ repoId: rootId, path: item.path, available: folderAvailable })
  const terminalContext = useContext(TerminalSessionContext)
  const terminalReadContext = useContext(TerminalSessionReadContext)
  const terminalKey = worktreeTerminalKey(rootId, item.path)
  const terminalCount = useWorktreeTerminalCount(terminalKey)
  const hasTerminalBell = useWorktreeTerminalHasBell(terminalKey)
  const hasTerminalOutputActivity = useWorktreeTerminalHasOutputActivity(terminalKey)
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: disabled || !ready,
  })
  const activate = () => {
    if (folderAvailable && item.lifecycle !== 'active') onActivate(item.id)
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

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-branch-workspace-lifecycle={item.lifecycle}
      className={cn('group relative', isDragging && 'z-10 rounded-md bg-card shadow-sm')}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        aria-current={active ? 'page' : undefined}
        disabled={!folderAvailable || item.lifecycle === 'active'}
        title={item.branch}
        className={cn(
          'flex h-8 w-full min-w-0 items-center gap-2 rounded-[var(--goblin-brand-radius-sm,var(--radius-sm))] px-2 pr-28 text-left text-xs transition-colors',
          ready && !disabled ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
          active ? 'bg-selected text-selected-foreground' : 'hover:bg-list-row-hover',
          !folderAvailable && 'opacity-60',
          isDragging && 'cursor-grabbing bg-card shadow-sm',
        )}
        onClick={activate}
      >
        <FolderKanban className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 truncate font-medium">{item.branch}</span>
        {terminalCount > 0 ? (
          <Badge
            data-testid="branch-workspace-terminal-count-badge"
            variant="brand"
            aria-label={t('terminal.open-count', { count: terminalCount })}
            className="h-4 shrink-0 gap-1 rounded-full px-1.5 text-[10px] tabular-nums"
          >
            {hasTerminalOutputActivity ? (
              <TerminalOutputActivityIndicator label={t('terminal.output-active')} className="size-2.5" size={10} />
            ) : (
              <SquareTerminal className="size-2.5" aria-hidden="true" />
            )}
            {terminalCount}
          </Badge>
        ) : null}
        {hasTerminalBell ? <TerminalBellDot label={t('terminal.bell-unread')} /> : null}
        <LifecycleSummary item={item} />
      </button>
      <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
        {ready ? (
          <>
            <RowAsyncAction
              label="workspace.branch-workspace.open-editor"
              busy={externalActions.editor.busy}
              disabled={externalActions.editor.disabled}
              onClick={() => (onOpenEditor ? onOpenEditor(item) : externalActions.editor.onSelect())}
            >
              <EditorAppIcon pref={externalActions.editor.iconPref} />
            </RowAsyncAction>
            <RowAsyncAction
              label="workspace.branch-workspace.open-external-terminal"
              busy={externalActions.externalTerminal.busy}
              disabled={externalActions.externalTerminal.disabled}
              onClick={() =>
                onOpenExternalTerminal ? onOpenExternalTerminal(item) : externalActions.externalTerminal.onSelect()
              }
            >
              <TerminalAppIcon pref={externalActions.externalTerminal.iconPref} />
            </RowAsyncAction>
            <RowAction label="workspace.branch-workspace.open-internal-terminal" onClick={() => void openInternal()}>
              <SquareTerminal />
            </RowAction>
            <RowAction label="workspace.branch-workspace.delete" destructive onClick={() => onRemove(item)}>
              <Trash2 />
            </RowAction>
          </>
        ) : null}
        {item.lifecycle === 'active' ? (
          <RowAction label="workspace.branch-workspace.cancel" onClick={() => void onCancel(item)}>
            <X />
          </RowAction>
        ) : null}
        {item.lifecycle === 'create-incomplete' || item.lifecycle === 'needs-repair' ? (
          <>
            <RowAction label="workspace.branch-workspace.inspect" onClick={() => onInspect(item)}>
              <Eye />
            </RowAction>
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
          </>
        ) : null}
        {item.lifecycle === 'delete-incomplete' ? (
          <>
            <RowAction label="workspace.branch-workspace.inspect" onClick={() => onInspect(item)}>
              <Eye />
            </RowAction>
            <RowAction
              label="workspace.branch-workspace.continue-delete"
              destructive
              onClick={() => onRemove(item)}
            >
              <Trash2 />
            </RowAction>
          </>
        ) : null}
      </div>
    </li>
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

function RowAsyncAction({
  label,
  busy,
  disabled,
  onClick,
  children,
}: {
  label: string
  busy: boolean
  disabled: boolean
  onClick: () => void | Promise<void>
  children: ReactNode
}) {
  const t = useT()
  return (
    <Tip label={t(label)}>
      <span className="inline-flex">
        <AsyncButton
          type="button"
          variant="ghost"
          size="icon-xs"
          loading={busy}
          disabled={disabled}
          aria-label={t(label)}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            return onClick()
          }}
        >
          {() => children}
        </AsyncButton>
      </span>
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
      new Set([
        ...item.repositories.map((member) => lastPathSegment(member.worktreePath)).filter(Boolean),
        ...item.auxiliaryEntries.map((entry) => entry.name),
      ]),
    ),
  }
}
