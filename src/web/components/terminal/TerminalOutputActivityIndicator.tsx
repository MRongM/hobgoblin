import { Terminal } from 'lucide-react'
import { cn } from '#/web/lib/cn.ts'

interface TerminalOutputActivityIndicatorProps {
  label: string
  active?: boolean
  className?: string
  iconClassName?: string
  size?: number
}

export function TerminalOutputActivityIndicator({
  label,
  active = true,
  className,
  iconClassName,
  size = 12,
}: TerminalOutputActivityIndicatorProps) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-terminal-output-activity-indicator={active ? 'active' : 'idle'}
      className={cn('relative inline-flex size-3 shrink-0 items-center justify-center', className)}
    >
      {active && (
        <span
          data-terminal-output-activity-ping
          className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-surface opacity-90"
          aria-hidden="true"
        />
      )}
      <Terminal
        size={size}
        className={cn('relative shrink-0', active ? 'animate-pulse text-success' : 'text-current', iconClassName)}
        aria-hidden="true"
      />
    </span>
  )
}
