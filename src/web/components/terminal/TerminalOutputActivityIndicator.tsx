import { Terminal } from 'lucide-react'
import { cn } from '#/web/lib/cn.ts'

const toneStyles = {
  activity: {
    glowClassName: 'bg-terminal-activity-surface',
    pingClassName: 'border-terminal-activity-border bg-terminal-activity',
    iconClassName: 'text-terminal-activity',
    rgbToken: '--color-terminal-activity-rgb',
  },
  bell: {
    glowClassName: 'bg-terminal-bell-surface',
    pingClassName: 'border-terminal-bell-border bg-terminal-bell',
    iconClassName: 'text-terminal-bell',
    rgbToken: '--color-terminal-bell-rgb',
  },
} as const

type TerminalOutputActivityIndicatorTone = keyof typeof toneStyles

const effectStyles = {
  default: {
    rootClassName: 'size-4',
    glowClassName: 'h-[145%] w-[145%]',
    pingClassName: 'h-[175%] w-[175%]',
    glowBlurPx: 10,
    glowAlpha: 0.82,
    iconBlurPx: 4,
    iconAlpha: 0.9,
    iconSize: 12,
  },
  compact: {
    rootClassName: 'size-3',
    glowClassName: 'h-[120%] w-[120%]',
    pingClassName: 'h-[135%] w-[135%]',
    glowBlurPx: 5,
    glowAlpha: 0.72,
    iconBlurPx: 2,
    iconAlpha: 0.82,
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
  tone?: TerminalOutputActivityIndicatorTone
}

export function TerminalOutputActivityIndicator({
  label,
  active = true,
  className,
  iconClassName,
  size,
  effectSize = 'default',
  tone = 'activity',
}: TerminalOutputActivityIndicatorProps) {
  const effectStyle = effectStyles[effectSize]
  const toneStyle = toneStyles[tone]
  const iconSize = size ?? effectStyle.iconSize
  const glowStyle = {
    boxShadow: `0 0 ${effectStyle.glowBlurPx}px rgb(var(${toneStyle.rgbToken}) / ${effectStyle.glowAlpha})`,
  }
  const iconStyle = {
    filter: `drop-shadow(0 0 ${effectStyle.iconBlurPx}px rgb(var(${toneStyle.rgbToken}) / ${effectStyle.iconAlpha}))`,
  }

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
              'absolute inline-flex animate-pulse rounded-full opacity-100',
              toneStyle.glowClassName,
              effectStyle.glowClassName,
            )}
            style={glowStyle}
            aria-hidden="true"
          />
          <span
            data-terminal-output-activity-ping
            className={cn(
              'absolute inline-flex animate-ping rounded-full border opacity-60',
              toneStyle.pingClassName,
              effectStyle.pingClassName,
            )}
            aria-hidden="true"
          />
        </>
      )}
      <Terminal
        size={iconSize}
        className={cn(
          'relative shrink-0',
          active ? cn('animate-pulse', toneStyle.iconClassName) : 'text-current',
          iconClassName,
        )}
        style={active ? iconStyle : undefined}
        aria-hidden="true"
      />
    </span>
  )
}
