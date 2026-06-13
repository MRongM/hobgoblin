import { cn } from '#/web/lib/cn.ts'

interface TerminalBellDotProps {
  label: string
  className?: string
  ping?: boolean
}

export function TerminalBellDot({ label, className, ping = true }: TerminalBellDotProps) {
  return (
    <span role="img" aria-label={label} title={label} className={cn('relative flex h-2 w-2 shrink-0', className)}>
      {ping && (
        <span
          className="absolute inline-flex h-full w-full animate-ping rounded-full bg-attention opacity-75"
          aria-hidden="true"
        />
      )}
      <span className="relative inline-flex h-2 w-2 rounded-full bg-attention" aria-hidden="true" />
    </span>
  )
}
