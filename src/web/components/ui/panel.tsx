import type { ComponentPropsWithoutRef } from 'react'
import { cn } from '#/web/lib/cn.ts'

function PanelInset({
  className,
  tone = 'default',
  size = 'md',
  ...props
}: ComponentPropsWithoutRef<'div'> & {
  tone?: 'default' | 'muted' | 'subtle' | 'dashed'
  size?: 'sm' | 'md' | 'lg'
}) {
  return (
    <div
      className={cn(
        'rounded-[var(--goblin-brand-radius-md,var(--radius-md))] border',
        tone === 'default' && 'border-border/50 bg-background/60',
        tone === 'muted' && 'border-border/60 bg-muted/20',
        tone === 'subtle' && 'border-border/60 bg-muted/15',
        tone === 'dashed' && 'border-dashed border-border bg-transparent',
        size === 'sm' && 'px-2.5 py-2',
        size === 'md' && 'px-3 py-2',
        size === 'lg' && 'px-4 py-3',
        className,
      )}
      {...props}
    />
  )
}

export { PanelInset }
