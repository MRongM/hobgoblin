import { Terminal } from 'lucide-react'
import { cn } from '#/web/lib/cn.ts'

const activeGlowStyle = {
  boxShadow: '0 0 10px rgb(var(--color-success-rgb) / 0.82)',
}

const activeIconStyle = {
  filter: 'drop-shadow(0 0 4px rgb(var(--color-success-rgb) / 0.9))',
}

const compactGlowStyle = {
  boxShadow: '0 0 5px rgb(var(--color-success-rgb) / 0.72)',
}

const compactIconStyle = {
  filter: 'drop-shadow(0 0 2px rgb(var(--color-success-rgb) / 0.82))',
}

const effectStyles = {
  default: {
    rootClassName: 'size-4',
    glowClassName: 'h-[145%] w-[145%]',
    pingClassName: 'h-[175%] w-[175%]',
    glowStyle: activeGlowStyle,
    iconStyle: activeIconStyle,
    iconSize: 12,
  },
  compact: {
    rootClassName: 'size-3',
    glowClassName: 'h-[120%] w-[120%]',
    pingClassName: 'h-[135%] w-[135%]',
    glowStyle: compactGlowStyle,
    iconStyle: compactIconStyle,
    iconSize: 11,
  },
}

interface TerminalOutputActivityIndicatorProps {
  label: string
  active?: boolean
  className?: string
  iconClassName?: string
  size?: number
  effectSize?: keyof typeof effectStyles
}

export function TerminalOutputActivityIndicator({
  label,
  active = true,
  className,
  iconClassName,
  size,
  effectSize = 'default',
}: TerminalOutputActivityIndicatorProps) {
  const effectStyle = effectStyles[effectSize]
  const iconSize = size ?? effectStyle.iconSize

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-terminal-output-activity-indicator={active ? 'active' : 'idle'}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-visible',
        effectStyle.rootClassName,
        className,
      )}
    >
      {active && (
        <>
          <span
            data-terminal-output-activity-glow
            className={cn(
              'absolute inline-flex animate-pulse rounded-full bg-success-surface opacity-100',
              effectStyle.glowClassName,
            )}
            style={effectStyle.glowStyle}
            aria-hidden="true"
          />
          <span
            data-terminal-output-activity-ping
            className={cn(
              'absolute inline-flex animate-ping rounded-full border border-success bg-success opacity-60',
              effectStyle.pingClassName,
            )}
            aria-hidden="true"
          />
        </>
      )}
      <Terminal
        size={iconSize}
        className={cn('relative shrink-0', active ? 'animate-pulse text-success' : 'text-current', iconClassName)}
        style={active ? effectStyle.iconStyle : undefined}
        aria-hidden="true"
      />
    </span>
  )
}
