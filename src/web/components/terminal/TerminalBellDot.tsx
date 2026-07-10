import { cn } from '#/web/lib/cn.ts'

interface TerminalBellDotProps {
  label: string
  className?: string
  ping?: boolean
}

export function TerminalBellDot({ label, className, ping = true }: TerminalBellDotProps) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-terminal-bell-dot
      className={cn('relative flex h-2 w-2 shrink-0', className)}
    >
      {ping && (
        <span
          data-terminal-bell-ping
          className="absolute inline-flex h-full w-full animate-ping rounded-full bg-terminal-bell opacity-75"
          aria-hidden="true"
        />
      )}
      <span
        data-terminal-bell-core
        className="relative inline-flex h-2 w-2 rounded-full bg-terminal-bell"
        aria-hidden="true"
      />
    </span>
  )
}
