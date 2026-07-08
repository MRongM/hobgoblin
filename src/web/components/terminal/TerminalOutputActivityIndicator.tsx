import { Terminal } from 'lucide-react'
import { cn } from '#/web/lib/cn.ts'

const activeGlowStyle = {
  boxShadow: '0 0 10px rgb(var(--color-success-rgb) / 0.82)',
}

const activeIconStyle = {
  filter: 'drop-shadow(0 0 4px rgb(var(--color-success-rgb) / 0.9))',
}

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
      className={cn('relative inline-flex size-4 shrink-0 items-center justify-center overflow-visible', className)}
    >
      {active && (
        <>
          <span
            data-terminal-output-activity-glow
            className="absolute inline-flex h-[145%] w-[145%] animate-pulse rounded-full bg-success-surface opacity-100"
            style={activeGlowStyle}
            aria-hidden="true"
          />
          <span
            data-terminal-output-activity-ping
            className="absolute inline-flex h-[175%] w-[175%] animate-ping rounded-full border border-success bg-success opacity-60"
            aria-hidden="true"
          />
        </>
      )}
      <Terminal
        size={size}
        className={cn('relative shrink-0', active ? 'animate-pulse text-success' : 'text-current', iconClassName)}
        style={active ? activeIconStyle : undefined}
        aria-hidden="true"
      />
    </span>
  )
}
