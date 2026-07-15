import { ChevronDown, ChevronRight } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { RepoGroupMeta } from '#/web/stores/repos/types.ts'
import { getGroupColorClasses } from '#/web/components/repo-tabs/group-colors.ts'
import { cn } from '#/web/lib/cn.ts'

interface GroupChipProps {
  group: RepoGroupMeta
  hasActiveRepo: boolean
  onClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
}

export function GroupChip({ group, hasActiveRepo, onClick, onContextMenu }: GroupChipProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `group:${group.id}`,
  })

  const colorClasses = getGroupColorClasses(group.color)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <button
      ref={setNodeRef}
      style={style}
      className={cn(
        'group-chip flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors',
        colorClasses.bg,
        colorClasses.border,
        colorClasses.hover,
        isDragging && 'opacity-50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
      onClick={onClick}
      onContextMenu={onContextMenu}
      aria-label={group.name}
      data-group-id={group.id}
      {...attributes}
      {...listeners}
    >
      {/* Color dot */}
      <span className={cn('size-2 rounded-full shrink-0', colorClasses.dot)} aria-hidden="true" />

      {/* Group name */}
      <span className="text-sm truncate max-w-[120px]">{group.name}</span>

      {/* Active indicator dot (when active repo is in this collapsed group) */}
      {hasActiveRepo && <span className="size-1.5 rounded-full bg-accent shrink-0" aria-hidden="true" />}

      {/* Collapse/expand icon */}
      {group.collapsed ? (
        <ChevronRight className="size-3 shrink-0" aria-hidden="true" />
      ) : (
        <ChevronDown className="size-3 shrink-0" aria-hidden="true" />
      )}
    </button>
  )
}
