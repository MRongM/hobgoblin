import {
  Fragment,
  forwardRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type ForwardedRef,
  type ReactNode,
} from 'react'
import { Ellipsis, GripVertical, Loader2 } from 'lucide-react'
import { AsyncButton } from '#/web/components/AsyncButton.tsx'
import { Tip } from '#/web/components/Tip.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '#/web/components/ui/dropdown-menu.tsx'
import { cn } from '#/web/lib/cn.ts'

export interface WorkspaceListItemAction {
  id: string
  label: string
  title?: string
  ariaLabel?: string
  icon: ReactNode
  disabled: boolean
  busy?: boolean
  destructive?: boolean
  shortcut?: string
  visible?: boolean
  onSelect: () => void | Promise<void>
}

type DataAttributes = {
  'data-sortable-id'?: string
  'data-project-kind'?: string
  'data-testid'?: string
  'data-branch-workspace-state'?: string
  'data-branch-workspace-id'?: string
}

type WorkspaceListItemButtonProps = ComponentProps<'button'> & DataAttributes
type WorkspaceListItemNativeProps = Omit<ComponentProps<'li'>, 'children' | 'style' | 'ref' | 'itemRef'> &
  DataAttributes

export interface WorkspaceListItemDragHandle {
  label: string
  setActivatorNodeRef?: (node: HTMLElement | null) => void
  props: WorkspaceListItemButtonProps
}

type WorkspaceListItemFrameProps = WorkspaceListItemNativeProps & {
  size?: 'project' | 'primary' | 'member'
  selected?: boolean
  unavailable?: boolean
  dragging?: boolean
  busy?: boolean
  leadingIcon?: ReactNode
  dragHandle?: WorkspaceListItemDragHandle
  itemRef?: (node: HTMLLIElement | null) => void
  itemStyle?: CSSProperties
  itemProps?: WorkspaceListItemNativeProps
  buttonProps: Omit<WorkspaceListItemButtonProps, 'children' | 'type'>
  auxiliaryActions?: ReactNode
  actions?: ReactNode
  children: ReactNode
  expandedContent?: ReactNode
}

export const WorkspaceListItemFrame = forwardRef<HTMLLIElement, WorkspaceListItemFrameProps>(
  function WorkspaceListItemFrame(
    {
      size = 'primary',
      selected = false,
      unavailable = false,
      dragging = false,
      busy = false,
      leadingIcon,
      dragHandle,
      itemRef,
      itemStyle,
      itemProps,
      buttonProps,
      auxiliaryActions,
      actions,
      children,
      expandedContent,
      className,
      ...nativeItemProps
    },
    forwardedRef,
  ) {
    const { className: itemClassName, ...restItemProps } = itemProps ?? {}
    const { className: buttonClassName, ...restButtonProps } = buttonProps
    const dragProps = dragHandle?.props

    return (
      <li
        {...nativeItemProps}
        {...restItemProps}
        ref={(node) => {
          setForwardedRef(forwardedRef, node)
          itemRef?.(node)
        }}
        style={itemStyle}
        data-workspace-list-item=""
        data-size={size}
        data-selected={selected}
        data-busy={busy}
        data-has-drag-handle={dragHandle ? 'true' : 'false'}
        className={cn('relative', dragging && 'z-10 rounded-md bg-card shadow-sm', className, itemClassName)}
      >
        <div className="workspace-list-item group relative">
          <button
            {...restButtonProps}
            type="button"
            data-workspace-list-item-main=""
            className={cn(
              'relative flex w-full min-w-0 items-center gap-2 rounded-[var(--goblin-brand-radius-sm,var(--radius-sm))] pl-2 pr-[4.25rem] text-left transition-colors duration-100',
              size === 'project' ? 'h-9 text-sm' : size === 'member' ? 'h-7 text-xs' : 'h-8 text-sm',
              selected
                ? 'bg-list-row-selected text-list-row-selected-foreground'
                : 'text-foreground hover:bg-list-row-hover',
              unavailable && 'opacity-60',
              dragging && 'bg-card',
              buttonClassName,
            )}
          >
            {leadingIcon ? (
              <span className="workspace-list-item-leading-icon flex size-4 shrink-0 items-center justify-center transition-[opacity,transform] duration-100">
                {leadingIcon}
              </span>
            ) : null}
            <span className="flex min-w-0 flex-1 items-center gap-1.5">{children}</span>
          </button>
          {dragHandle ? (
            <Button
              {...dragProps}
              ref={dragHandle.setActivatorNodeRef}
              type="button"
              variant="ghost"
              size="icon-xs"
              data-workspace-list-item-drag-handle=""
              aria-label={dragHandle.label}
              className={cn(
                'workspace-list-item-drag-handle absolute left-1.5 top-1/2 z-20 -translate-y-1/2 opacity-0',
                dragProps?.disabled ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
                dragProps?.className,
              )}
              onClick={(event) => {
                event.stopPropagation()
                dragProps?.onClick?.(event)
              }}
              onDoubleClick={(event) => {
                event.stopPropagation()
                dragProps?.onDoubleClick?.(event)
              }}
              onPointerDown={(event) => {
                event.stopPropagation()
                dragProps?.onPointerDown?.(event)
              }}
            >
              <GripVertical aria-hidden="true" />
            </Button>
          ) : null}
          {auxiliaryActions || actions ? (
            <div
              data-workspace-list-item-trailing=""
              className="absolute right-1 top-1/2 z-20 flex -translate-y-1/2 items-center gap-0.5"
            >
              {auxiliaryActions}
              {actions}
            </div>
          ) : null}
        </div>
        {expandedContent}
      </li>
    )
  },
)

function setForwardedRef<T>(ref: ForwardedRef<T>, value: T | null): void {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}

interface WorkspaceListItemActionDockProps {
  editor?: WorkspaceListItemAction
  internalTerminal?: WorkspaceListItemAction
  moreMenu?: ReactNode
}

export function WorkspaceListItemActionDock({ editor, internalTerminal, moreMenu }: WorkspaceListItemActionDockProps) {
  const dockBusy = editor?.busy === true || internalTerminal?.busy === true

  return (
    <div data-workspace-list-item-action-dock="" className="flex w-16 items-center justify-end gap-0.5">
      <span
        className={cn(
          'workspace-list-item-action-editor inline-flex size-5',
          dockBusy && 'pointer-events-auto opacity-100',
        )}
      >
        {editor ? <WorkspaceListItemQuickAction action={editor} /> : null}
      </span>
      <span className="inline-flex size-5">
        {internalTerminal ? <WorkspaceListItemQuickAction action={internalTerminal} /> : null}
      </span>
      <span className="inline-flex size-5">{moreMenu}</span>
    </div>
  )
}

interface WorkspaceListItemMenuProps {
  label: string
  groups: WorkspaceListItemAction[][]
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function WorkspaceListItemMenu({ label, groups, open, onOpenChange }: WorkspaceListItemMenuProps) {
  const [pendingId, setPendingId] = useState<string | null>(null)
  const visibleGroups = groups
    .map((group) => group.filter((action) => action.visible !== false))
    .filter((group) => group.length > 0)
  const busyId = pendingId ?? visibleGroups.flat().find((action) => action.busy)?.id ?? null

  async function runMenuAction(action: WorkspaceListItemAction): Promise<void> {
    if (action.disabled || busyId !== null) return
    setPendingId(action.id)
    try {
      await action.onSelect()
    } finally {
      setPendingId(null)
    }
  }

  if (visibleGroups.length === 0) return null

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          title={label}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          {busyId ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Ellipsis aria-hidden="true" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        {visibleGroups.map((group, groupIndex) => (
          <Fragment key={group.map((action) => action.id).join('|')}>
            {groupIndex > 0 ? <DropdownMenuSeparator /> : null}
            {group.map((action) => {
              const busy = pendingId === action.id || action.busy
              return (
                <DropdownMenuItem
                  key={action.id}
                  data-action={action.id}
                  disabled={action.disabled || busyId !== null}
                  title={action.title}
                  variant={action.destructive ? 'destructive' : 'default'}
                  onSelect={() => void runMenuAction(action)}
                >
                  {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : action.icon}
                  {action.label}
                  {action.shortcut ? <DropdownMenuShortcut>{action.shortcut}</DropdownMenuShortcut> : null}
                </DropdownMenuItem>
              )
            })}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function WorkspaceListItemQuickAction({ action }: { action: WorkspaceListItemAction }) {
  return (
    <Tip label={action.title ?? action.label}>
      <span className="inline-flex">
        <AsyncButton
          type="button"
          variant="ghost"
          size="icon-xs"
          data-workspace-list-item-action={action.id}
          loading={action.busy}
          disabled={action.disabled || action.busy}
          aria-label={action.ariaLabel ?? action.title ?? action.label}
          onClick={(event) => {
            event.stopPropagation()
            return action.onSelect()
          }}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          {() => action.icon}
        </AsyncButton>
      </span>
    </Tip>
  )
}
