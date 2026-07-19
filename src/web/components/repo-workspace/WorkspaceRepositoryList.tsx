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
import { FolderGit2 } from 'lucide-react'
import { Badge } from '#/web/components/ui/badge.tsx'
import { cn } from '#/web/lib/cn.ts'
import { useT } from '#/web/stores/i18n.ts'

const restrictToVerticalRepositoryList: Modifier = ({ transform }) => ({ ...transform, x: 0 })

export interface WorkspaceRepositoryListItem {
  id: string
  name: string
  branch?: string
  changeCount: number
  unavailable: boolean
}

interface Props {
  repositories: WorkspaceRepositoryListItem[]
  currentRepoId: string
  disabled: boolean
  onActivate: (id: string) => void
  onReorder: (fromId: string, toId: string) => void
}

export function WorkspaceRepositoryList({ repositories, currentRepoId, disabled, onActivate, onReorder }: Props) {
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
          {repositories.map((repository, index) => (
            <SortableWorkspaceRepositoryRow
              key={repository.id}
              repository={repository}
              active={currentRepoId === repository.id}
              disabled={disabled}
              terminal={index === repositories.length - 1}
              onActivate={onActivate}
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
  terminal,
  onActivate,
}: {
  repository: WorkspaceRepositoryListItem
  active: boolean
  disabled: boolean
  terminal: boolean
  onActivate: (id: string) => void
}) {
  const t = useT()
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: repository.id,
    disabled,
  })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group relative',
        isDragging && 'z-10 rounded-[var(--goblin-brand-radius-sm,var(--radius-sm))] bg-card shadow-sm',
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        aria-current={active ? 'page' : undefined}
        aria-label={`${repository.name}. ${t('workspace.repository-reorder')}`}
        title={repository.unavailable ? t('workspace.repository-unavailable') : repository.name}
        className={cn(
          'relative flex h-7 w-full min-w-0 items-center gap-2 rounded-[var(--goblin-brand-radius-sm,var(--radius-sm))] px-2 text-left text-xs transition-colors duration-100',
          disabled ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
          active ? 'bg-selected text-selected-foreground' : 'text-foreground hover:bg-list-row-hover',
          repository.unavailable && 'opacity-60',
          isDragging && 'cursor-grabbing bg-card shadow-sm',
        )}
        onClick={() => onActivate(repository.id)}
      >
        <span
          className={cn(
            'relative z-10 flex size-4 shrink-0 items-center justify-center',
            active ? 'bg-selected' : 'bg-sidebar group-hover:bg-list-row-hover',
          )}
        >
          <FolderGit2 className="size-3.5" aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="min-w-0 truncate font-medium">{repository.name}</span>
          {repository.branch ? (
            <span className="min-w-0 truncate font-mono text-[10px] text-muted-foreground">{repository.branch}</span>
          ) : null}
        </span>
        {repository.changeCount > 0 ? (
          <Badge variant="attention" className="h-4 min-w-4 justify-center rounded-full px-1 text-[9px] tabular-nums">
            {repository.changeCount}
          </Badge>
        ) : null}
        {repository.unavailable ? (
          <span className="shrink-0 text-[9px] text-danger">{t('workspace.repository-unavailable')}</span>
        ) : null}
        {terminal ? (
          <span
            className="absolute bottom-0 left-[0.68rem] h-1.5 w-1.5 border-b border-l border-separator"
            aria-hidden="true"
          />
        ) : null}
      </button>
    </li>
  )
}
