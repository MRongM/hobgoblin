import { Loader2 } from 'lucide-react'
import { AsyncButton } from '#/web/components/AsyncButton.tsx'
import { BranchActionsDropdown } from '#/web/components/BranchActionsMenu.tsx'
import { ScrollArea } from '#/web/components/ui/scroll-area.tsx'
import { type BranchActionItem, type BranchActionItemGroups, visibleBranchActionItems } from '#/web/hooks/useBranchActionItems.ts'
import { useOverflowCollapse } from '#/web/hooks/useOverflowCollapse.ts'
import { cn } from '#/web/lib/cn.ts'
type BranchActionControlsVariant = 'bar' | 'menu' | 'auto'

interface BranchActionControlsProps {
  actions: BranchActionItemGroups
  variant?: BranchActionControlsVariant
  iconOnly?: boolean
}

export function BranchActionControls({ actions, variant = 'bar', iconOnly = false }: BranchActionControlsProps) {
  const { patchItems, mainItems, externalItems, destructiveItems } = actions
  const visibleItems = visibleBranchActionItems(actions)

  if (variant === 'menu') {
    return (
      <BranchActionsDropdown
        patchItems={patchItems}
        mainItems={mainItems}
        externalItems={externalItems}
        destructiveItems={destructiveItems}
      />
    )
  }

  if (variant === 'auto') {
    return (
      <BranchActionAuto
        visibleItems={visibleItems}
        patchItems={patchItems}
        mainItems={mainItems}
        externalItems={externalItems}
        destructiveItems={destructiveItems}
      />
    )
  }

  return <BranchActionButtonScroller visibleItems={visibleItems} iconOnly={iconOnly} />
}

function BranchActionAuto({
  visibleItems,
  patchItems,
  mainItems,
  externalItems,
  destructiveItems,
}: {
  visibleItems: BranchActionItem[]
  patchItems: BranchActionItem[]
  mainItems: BranchActionItem[]
  externalItems: BranchActionItem[]
  destructiveItems: BranchActionItem[]
}) {
  const layoutKey = visibleItems.map((item) => `${item.id}:${item.label}:${item.disabled}`).join('|')
  const { containerRef, measureRef, collapsed } = useOverflowCollapse(layoutKey)

  return (
    <div ref={containerRef} className="relative flex min-w-0 flex-1 justify-end">
      {collapsed ? (
        <BranchActionsDropdown
          patchItems={patchItems}
          mainItems={mainItems}
          externalItems={externalItems}
          destructiveItems={destructiveItems}
        />
      ) : (
        <BranchActionButtonScroller visibleItems={visibleItems} />
      )}
      <div ref={measureRef} aria-hidden="true" className="pointer-events-none invisible absolute right-0 top-0">
        <BranchActionButtonRow visibleItems={visibleItems} measure />
      </div>
    </div>
  )
}

function BranchActionButtonScroller({
  visibleItems,
  iconOnly = false,
}: {
  visibleItems: BranchActionItem[]
  iconOnly?: boolean
}) {
  return (
    <ScrollArea orientation="horizontal" className="min-w-0">
      <BranchActionButtonRow visibleItems={visibleItems} iconOnly={iconOnly} className="min-w-full" />
    </ScrollArea>
  )
}

function BranchActionButtonRow({
  visibleItems,
  className,
  measure = false,
  iconOnly = false,
}: {
  visibleItems: BranchActionItem[]
  className?: string
  measure?: boolean
  iconOnly?: boolean
}) {
  return (
    <div className={cn('flex w-max items-center justify-end gap-1 py-1', className)}>
      {visibleItems.map((item) => (
        <BranchActionButton key={item.id} item={item} measure={measure} iconOnly={iconOnly} />
      ))}
    </div>
  )
}

function BranchActionButton({
  item,
  measure = false,
  iconOnly = false,
}: {
  item: BranchActionItem
  measure?: boolean
  iconOnly?: boolean
}) {
  return (
    <AsyncButton
      variant="ghost"
      size={iconOnly ? 'icon-sm' : 'sm'}
      loading={item.busy}
      disabled={measure || item.disabled}
      onClick={item.onSelect}
      title={item.title ?? item.label}
      aria-label={item.ariaLabel ?? item.title ?? item.label}
      className={item.destructive ? 'text-danger hover:bg-danger-surface hover:text-danger' : undefined}
    >
      {({ busy }) => (
        <>
          {busy ? <Loader2 className="size-4 animate-spin" /> : item.icon}
          {!iconOnly && item.label}
        </>
      )}
    </AsyncButton>
  )
}
