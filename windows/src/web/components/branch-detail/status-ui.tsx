import { createContext, forwardRef, useContext, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { cn } from '#/web/lib/cn.ts'
import { STATUS_TONE_CHIP_CLASS, STATUS_TONE_TEXT_CLASS, type StatusTone } from '#/web/components/ui/status-tones.ts'
export type Tone = StatusTone
export type StatusRowValueLayout = 'inline' | 'fill' | 'chips'

export type StatusRowsDensity = 'default' | 'compact'

const StatusRowsDensityContext = createContext<StatusRowsDensity>('default')
const ROW_CLASS: Record<StatusRowsDensity, string> = {
  default: 'grid h-9 grid-cols-[1.25rem_5.75rem_minmax(0,1fr)] items-center gap-3 px-4',
  compact: 'grid h-8 grid-cols-[1rem_5rem_minmax(0,1fr)] items-center gap-1.5 px-2',
}
const ROW_ICON_CLASS: Record<StatusRowsDensity, string> = {
  default: 'flex size-5 items-center justify-center',
  compact: 'flex size-4 items-center justify-center',
}
const ROW_VALUE_GAP_CLASS: Record<StatusRowsDensity, string> = {
  default: 'gap-2',
  compact: 'gap-1',
}
const ROW_AFTER_GAP_CLASS: Record<StatusRowsDensity, string> = {
  default: 'gap-1.5',
  compact: 'gap-1',
}
const ROW_LABEL_CLASS = 'truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground'
const MONO_VALUE_CLASS = 'font-mono'
const INLINE_TRUNCATE_CLASS = 'block min-w-0 flex-1 truncate'
export const STATUS_CHIP_CLASS =
  'inline-flex h-5 shrink-0 cursor-default items-center gap-1 rounded-sm border px-1.5 text-[11px] font-medium leading-none'
const ROW_VALUE_CLASS: Record<StatusRowValueLayout, string> = {
  inline: 'min-w-0 max-w-full text-sm text-foreground',
  fill: 'min-w-0 flex-1 text-sm text-foreground',
  chips: 'flex min-w-0 max-w-full flex-wrap items-center gap-1.5 text-sm text-foreground',
}
type StatusChipProps = ComponentPropsWithoutRef<'span'> & {
  tone?: Tone
}

export const StatusChip = forwardRef<HTMLSpanElement, StatusChipProps>(function StatusChip(
  { children, className, tone = 'neutral', ...props },
  ref,
) {
  return (
    <span ref={ref} {...props} className={cn(STATUS_CHIP_CLASS, STATUS_TONE_CHIP_CLASS[tone], className)}>
      {children}
    </span>
  )
})

export function StatusRows({ children, density = 'default' }: { children: ReactNode; density?: StatusRowsDensity }) {
  return (
    <StatusRowsDensityContext.Provider value={density}>
      <div role="list">{children}</div>
    </StatusRowsDensityContext.Provider>
  )
}

type StatusRowProps = Omit<ComponentPropsWithoutRef<'div'>, 'value'> & {
  icon: ReactNode
  label: string
  value: ReactNode
  valueLayout?: StatusRowValueLayout
  after?: ReactNode
  tone?: Tone
}

export const StatusRow = forwardRef<HTMLDivElement, StatusRowProps>(function StatusRow(
  { icon, label, value, valueLayout = 'inline', after, tone = 'neutral', className, ...props },
  ref,
) {
  const density = useContext(StatusRowsDensityContext)
  return (
    <div ref={ref} role="listitem" className={cn(ROW_CLASS[density], className)} {...props}>
      <span className={cn(ROW_ICON_CLASS[density], STATUS_TONE_TEXT_CLASS[tone])}>{icon}</span>
      <span className={ROW_LABEL_CLASS}>{label}</span>
      <div data-status-row-value className={cn('flex min-w-0 items-center', ROW_VALUE_GAP_CLASS[density])}>
        <div className={ROW_VALUE_CLASS[valueLayout]}>{value}</div>
        {after && <div className={cn('flex shrink-0 items-center', ROW_AFTER_GAP_CLASS[density])}>{after}</div>}
      </div>
    </div>
  )
})

export function MonoValue({
  children,
  title,
  tone,
  truncate = false,
}: {
  children: ReactNode
  title?: string
  tone?: Tone
  truncate?: boolean
}) {
  return (
    <span
      className={cn(MONO_VALUE_CLASS, truncate && INLINE_TRUNCATE_CLASS, tone && STATUS_TONE_TEXT_CLASS[tone])}
      title={title}
    >
      {children}
    </span>
  )
}
