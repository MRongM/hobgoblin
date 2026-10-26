import type { ReactNode } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '#/web/components/ui/button.tsx'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '#/web/components/ui/dropdown-menu.tsx'
import { useT } from '#/web/stores/i18n.ts'
import { WorkspaceActionMenuItems } from '#/web/components/repo-workspace/WorkspaceActionMenuItems.tsx'
import type { WorkspaceMenuCategory } from '#/web/components/repo-workspace/workspace-menu-groups.ts'
import type { WorkspaceListItemAction } from '#/web/components/repo-workspace/WorkspaceListItem.tsx'

export interface BranchWorkspaceItemAction {
  id?: string
  label: string
  title?: string
  icon: ReactNode
  disabled?: boolean
  busy?: boolean
  destructive?: boolean
  separated?: boolean
  category?: WorkspaceMenuCategory
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
        <WorkspaceActionMenuItems groups={branchWorkspaceActionGroups(actions, t)} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function branchWorkspaceActionGroups(
  actions: readonly BranchWorkspaceItemAction[],
  translate: (key: string) => string,
): WorkspaceListItemAction[][] {
  const groups: WorkspaceListItemAction[][] = []
  for (const action of actions) {
    if (groups.length === 0 || action.separated) groups.push([])
    groups[groups.length - 1]!.push({
      ...action,
      id: action.id ?? action.label,
      label: translate(action.label),
      disabled: action.disabled === true,
      category:
        action.category ??
        (action.label.startsWith('tmux.') || action.label.startsWith('terminal.')
          ? 'terminals'
          : action.label.startsWith('workspace.recovery.')
            ? 'manage'
            : undefined),
    })
  }
  return groups
}
