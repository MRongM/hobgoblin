// In-app Hobgoblin wordmark. Clean system typography set in the theme
// foreground colour, sitting in the macOS title bar like a native window title.
//
// The app icon carries the Git + terminal identity; this wordmark stays
// restrained and text-only.

import { cn } from '#/web/lib/cn.ts'

interface Props {
  /** Cap height of the wordmark in pixels. Default 13 (fits the topbar). */
  size?: number
  className?: string
}

export function Logo({ size = 13, className }: Props) {
  return (
    <span
      aria-label="Hobgoblin"
      className={cn('inline-flex items-baseline align-middle select-none text-foreground', className)}
      style={{
        fontFamily: 'var(--font-sans)',
        fontWeight: 600,
        fontSize: `${size}px`,
        letterSpacing: '0px',
        lineHeight: 1,
      }}
    >
      Hobgoblin
    </span>
  )
}
