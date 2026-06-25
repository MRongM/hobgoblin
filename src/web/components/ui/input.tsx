import * as React from 'react'
import { cn } from '#/web/lib/cn.ts'
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        ref={ref}
        data-slot="input"
        type={type}
        className={cn(
          'h-[calc(var(--goblin-control-height-sm,2rem)+0.25rem)] w-full rounded-[var(--goblin-control-radius,var(--radius-md))] border border-input-border bg-input-background px-3 py-2 text-sm text-input-foreground placeholder:text-input-placeholder hover:bg-input-hover focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger-border aria-invalid:ring-danger/20 dark:aria-invalid:ring-danger/40',
          className,
        )}
        {...props}
      />
    )
  },
)

Input.displayName = 'Input'

export { Input }
