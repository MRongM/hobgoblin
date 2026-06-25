import { cn } from '#/web/lib/cn.ts'
import { compositeFocusRing } from '#/web/components/ui/focus.ts'

type ToolbarTabVariant = 'repo' | 'terminal'

export function toolbarTabChromeClassName(options: {
  variant: ToolbarTabVariant
  active: boolean
  dragging?: boolean
}): string {
  const { variant, active, dragging = false } = options
  return cn(
    'group relative shrink-0 select-none items-center transition-colors duration-100',
    compositeFocusRing,
    variant === 'repo'
      ? 'flex h-8 min-w-36 max-w-56 touch-none gap-1.5 rounded-[var(--goblin-brand-radius-md,var(--radius-md))] border px-2 text-xs'
      : 'flex h-7 w-28 gap-1 rounded-[var(--goblin-brand-radius-md,var(--radius-md))] border px-2.5 text-sm',
    variant === 'repo'
      ? active
        ? 'border-input bg-tab-active text-foreground'
        : 'border-transparent text-muted-foreground hover:bg-tab-hover hover:text-foreground'
      : active
        ? 'border-transparent bg-tab-active text-foreground'
        : 'border-separator text-muted-foreground hover:bg-tab-hover hover:text-foreground',
    dragging && 'z-10 cursor-grabbing',
    dragging && !active && 'bg-tab-active text-foreground',
  )
}

export function toolbarTabButtonClassName(variant: ToolbarTabVariant): string | undefined {
  return variant === 'repo' ? 'h-full rounded-sm' : undefined
}

export function toolbarTabIconClassName(active: boolean): string {
  return cn('shrink-0', active ? 'text-foreground' : 'text-muted-foreground')
}
