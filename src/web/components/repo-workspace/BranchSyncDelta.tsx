import { ArrowDown, ArrowUp } from 'lucide-react'
import { cn } from '#/web/lib/cn.ts'

interface BranchSyncDeltaProps {
  direction: 'ahead' | 'behind'
  count: number
  label: string
}

export function BranchSyncDelta({ direction, count, label }: BranchSyncDeltaProps) {
  const Icon = direction === 'ahead' ? ArrowUp : ArrowDown
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center gap-0.5 font-mono text-xs',
        direction === 'ahead' ? 'text-success' : 'text-attention',
      )}
    >
      <Icon size={11} />
      {count}
    </span>
  )
}
