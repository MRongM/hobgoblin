import { Fragment, type ReactNode } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '#/web/components/ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/web/components/ui/dropdown-menu.tsx'
import { useT } from '#/web/stores/i18n.ts'

export interface BranchWorkspaceItemAction {
  label: string
  icon: ReactNode
  disabled?: boolean
  busy?: boolean
  destructive?: boolean
  separated?: boolean
  onSelect: () => void | Promise<void>
}

export function BranchWorkspaceItemMenu({ actions }: { actions: readonly BranchWorkspaceItemAction[] }) {
  const t = useT()
  if (actions.length === 0) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={t('workspace.branch-workspace.more')}
          title={t('workspace.branch-workspace.more')}
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {actions.map((action, index) => (
          <Fragment key={`${action.label}-${index}`}>
            {action.separated ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              disabled={action.disabled || action.busy}
              variant={action.destructive ? 'destructive' : 'default'}
              onSelect={() => void action.onSelect()}
            >
              {action.icon}
              {t(action.label)}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
