import { X } from 'lucide-react'
import type { ComponentPropsWithoutRef, ReactElement, ReactNode, Ref } from 'react'
import { cn } from '#/web/lib/cn.ts'
import { ContextMenu, ContextMenuTrigger } from '#/web/components/ui/context-menu.tsx'

type DataAttributes = {
  [K in `data-${string}`]?: string | boolean | undefined
}

type ToolbarClosableTabContainerProps = Omit<ComponentPropsWithoutRef<'div'>, 'children' | 'className'> & DataAttributes
type ToolbarClosableTabButtonProps = Omit<ComponentPropsWithoutRef<'button'>, 'children' | 'className' | 'ref'> &
  DataAttributes

interface ToolbarClosableTabProps {
  containerRef?: Ref<HTMLDivElement>
  containerProps?: ToolbarClosableTabContainerProps
  containerClassName: string
  overlay?: ReactNode
  contextMenu?: ReactNode
  buttonRef?: Ref<HTMLButtonElement>
  buttonProps?: ToolbarClosableTabButtonProps
  buttonWrapper?: (button: ReactElement) => ReactNode
  buttonClassName?: string
  closeButtonClassName?: string
  closeLabel: string
  closeVisible: boolean
  onClose: (event: React.MouseEvent<HTMLButtonElement>) => void
  children: ReactNode
}

export function ToolbarClosableTab({
  containerRef,
  containerProps,
  containerClassName,
  overlay,
  contextMenu,
  buttonRef,
  buttonProps,
  buttonWrapper,
  buttonClassName,
  closeButtonClassName,
  closeLabel,
  closeVisible,
  onClose,
  children,
}: ToolbarClosableTabProps) {
  const button = (
    <button
      ref={buttonRef}
      type="button"
      {...buttonProps}
      className={cn(
        'flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-left text-inherit outline-none',
        buttonClassName,
      )}
    >
      {children}
    </button>
  )
  const tab = (
    <div ref={containerRef} {...containerProps} className={containerClassName}>
      {overlay}
      {buttonWrapper ? buttonWrapper(button) : button}
      <button
        type="button"
        tabIndex={-1}
        aria-label={closeLabel}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onClose}
        className={cn(
          'cursor-pointer rounded-[var(--goblin-brand-radius-sm,var(--radius-sm))] border-0 bg-transparent p-0.5 text-muted-foreground transition-colors duration-100 hover:bg-tab-hover hover:text-foreground',
          closeVisible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
          closeButtonClassName,
        )}
        title={closeLabel}
      >
        <X size={14} />
      </button>
    </div>
  )

  if (!contextMenu) return tab

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{tab}</ContextMenuTrigger>
      {contextMenu}
    </ContextMenu>
  )
}
