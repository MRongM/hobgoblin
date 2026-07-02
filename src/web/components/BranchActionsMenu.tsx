import { ChevronDown, Loader2 } from 'lucide-react'
import { Fragment, useState } from 'react'
import type { RepoBranchState } from '#/web/stores/repos/types.ts'
import { useT } from '#/web/stores/i18n.ts'
import { AsyncButton } from '#/web/components/AsyncButton.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '#/web/components/ui/dropdown-menu.tsx'
import {
  useBranchActionItems,
  type BranchActionItem,
  type BranchActionItemGroups,
} from '#/web/hooks/useBranchActionItems.ts'
import type { BranchActionRepo } from '#/web/hooks/branch-action-state.ts'
import { useAsyncPending } from '#/web/hooks/useAsyncPending.ts'
import { cn } from '#/web/lib/cn.ts'

export type { BranchActionItem } from '#/web/hooks/useBranchActionItems.ts'

interface Props {
  repo: BranchActionRepo
  branch: RepoBranchState
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function BranchActionsMenu({ repo, branch, open, onOpenChange }: Props) {
  const { patchItems, mainItems, externalItems, destructiveItems, dialogs } = useBranchActionItems(repo, branch)

  return (
    <>
      <BranchActionsDropdown
        repoId={repo.id}
        branchName={branch.name}
        patchItems={patchItems}
        mainItems={mainItems}
        externalItems={externalItems}
        destructiveItems={destructiveItems}
        open={open}
        onOpenChange={onOpenChange}
      />

      {dialogs}
    </>
  )
}

const DEFAULT_QUICK_ACTION_ID: BranchActionItem['id'] = 'editor'
const rememberedQuickActions = new Map<string, BranchActionItem['id']>()

function branchQuickActionKey(repoId: string, branchName: string): string {
  return `${repoId}\0${branchName}`
}

function findVisibleNonDestructiveAction(
  items: BranchActionItem[],
  id: BranchActionItem['id'],
): BranchActionItem | null {
  return items.find((item) => item.id === id && item.visible && !item.destructive) ?? null
}

function resolveQuickAction(
  items: BranchActionItem[],
  rememberedId: BranchActionItem['id'] | undefined,
): BranchActionItem | null {
  const fallback = findVisibleNonDestructiveAction(items, DEFAULT_QUICK_ACTION_ID)
  const remembered = rememberedId ? findVisibleNonDestructiveAction(items, rememberedId) : null
  if (remembered && !remembered.disabled) return remembered
  return fallback
}

export function BranchActionsDropdown({
  repoId,
  branchName,
  patchItems,
  mainItems,
  externalItems,
  destructiveItems,
  open,
  onOpenChange,
}: Pick<BranchActionItemGroups, 'patchItems' | 'mainItems' | 'externalItems' | 'destructiveItems'> & {
  repoId?: string
  branchName?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const t = useT()
  const [, setQuickActionRevision] = useState(0)
  const { pending: pendingAction, run } = useAsyncPending<BranchActionItem['id']>()
  const visiblePatchItems = patchItems.filter((item) => item.visible)
  const visibleMainItems = mainItems.filter((item) => item.visible)
  const visibleExternalItems = externalItems.filter((item) => item.visible)
  const visibleDestructiveItems = destructiveItems.filter((item) => item.visible)
  const itemGroups = [visibleExternalItems, visibleMainItems, visiblePatchItems, visibleDestructiveItems].filter(
    (items) => items.length > 0,
  )
  const visibleItems = itemGroups.flat()
  const busyAction = pendingAction ?? visibleItems.find((item) => item.busy)?.id ?? null
  const memoryKey = repoId && branchName ? branchQuickActionKey(repoId, branchName) : null
  const rememberedActionId = memoryKey ? rememberedQuickActions.get(memoryKey) : undefined
  const quickAction = resolveQuickAction(visibleItems, rememberedActionId)
  const quickActionDisabled = !quickAction || branchActionMenuItemDisabled(quickAction, busyAction)

  function runItem(item: BranchActionItem) {
    if (branchActionMenuItemDisabled(item, busyAction)) return
    if (memoryKey && !item.destructive) {
      rememberedQuickActions.set(memoryKey, item.id)
      setQuickActionRevision((revision) => revision + 1)
    }
    void run(item.id, item.onSelect)
  }

  function runQuickAction() {
    if (!quickAction || quickActionDisabled) return
    void run(quickAction.id, quickAction.onSelect)
  }

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <div
        className="inline-flex items-center"
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <AsyncButton
          variant="ghost"
          size="sm"
          loading={quickAction?.busy}
          disabled={quickActionDisabled}
          onClick={runQuickAction}
          title={quickAction?.title ?? quickAction?.label ?? t('action.menu')}
          aria-label={quickAction?.ariaLabel ?? quickAction?.title ?? quickAction?.label ?? t('action.menu')}
          className={cn(
            'rounded-r-none pr-2',
            quickAction?.destructive && 'text-danger hover:bg-danger-surface hover:text-danger',
          )}
        >
          {({ busy }) => (
            <>
              {busy ? <Loader2 className="size-4 animate-spin" /> : quickAction?.icon}
              {quickAction?.label ?? t('action.menu')}
            </>
          )}
        </AsyncButton>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            title={t('action.menu')}
            aria-label={t('action.menu')}
            aria-busy={busyAction ? true : undefined}
            className="rounded-l-none px-1 data-[state=open]:bg-accent data-[state=open]:text-accent-foreground"
          >
            {busyAction ? <Loader2 className="size-4 animate-spin" /> : <ChevronDown className="size-3" />}
          </Button>
        </DropdownMenuTrigger>
      </div>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {itemGroups.map((items, groupIndex) => (
          <Fragment key={groupIndex}>
            {groupIndex > 0 && <DropdownMenuSeparator />}
            {items.map((item) => (
              <BranchActionMenuItem key={item.id} item={item} busy={busyAction} onSelect={() => runItem(item)} />
            ))}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function BranchActionMenuItem({
  item,
  busy,
  onSelect,
}: {
  item: BranchActionItem
  busy: BranchActionItem['id'] | null
  onSelect: () => void
}) {
  return (
    <DropdownMenuItem
      disabled={branchActionMenuItemDisabled(item, busy)}
      title={item.title}
      onClick={onSelect}
      variant={item.destructive ? 'destructive' : 'default'}
      className={item.shortcut ? 'whitespace-nowrap' : undefined}
    >
      {busy === item.id || item.busy ? <Loader2 size={16} className="animate-spin" /> : item.icon}
      {item.label}
      {item.shortcut && <DropdownMenuShortcut>{item.shortcut}</DropdownMenuShortcut>}
    </DropdownMenuItem>
  )
}

export function branchActionMenuItemDisabled(item: BranchActionItem, busy: BranchActionItem['id'] | null): boolean {
  return item.disabled || busy !== null
}
