import { Fragment } from 'react'
import { Loader2 } from 'lucide-react'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '#/web/components/ui/dropdown-menu.tsx'
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '#/web/components/ui/context-menu.tsx'
import type { WorkspaceListItemAction } from '#/web/components/repo-workspace/WorkspaceListItem.tsx'
import {
  groupWorkspaceMenuActions,
  workspaceMenuActionDefinition,
} from '#/web/components/repo-workspace/workspace-menu-groups.ts'
import {
  WorkspaceMenuActionIcon,
  WorkspaceMenuCategoryIcon,
} from '#/web/components/repo-workspace/workspace-menu-icons.tsx'
import { useT } from '#/web/stores/i18n.ts'

interface Props {
  groups: readonly (readonly WorkspaceListItemAction[])[]
  context?: boolean
  busyId?: string | null
  pendingId?: string | null
  onSelect?: (action: WorkspaceListItemAction) => void | Promise<void>
}

/** More and right-click menus use the same categories and leaf actions. */
export function WorkspaceActionMenuItems({ groups, context = false, busyId, pendingId, onSelect }: Props) {
  const t = useT()
  const Item = context ? ContextMenuItem : DropdownMenuItem
  const Separator = context ? ContextMenuSeparator : DropdownMenuSeparator
  const Sub = context ? ContextMenuSub : DropdownMenuSub
  const SubTrigger = context ? ContextMenuSubTrigger : DropdownMenuSubTrigger
  const SubContent = context ? ContextMenuSubContent : DropdownMenuSubContent
  const sections = groupWorkspaceMenuActions(groups.map((group) => group.filter((action) => action.visible !== false)))

  function renderGroups(actionGroups: WorkspaceListItemAction[][]) {
    return actionGroups.map((group, groupIndex) => (
      <Fragment key={`${groupIndex}-${group.map((action) => action.id).join('|')}`}>
        {groupIndex > 0 ? <Separator /> : null}
        {group.map((action) => (
          <Item
            key={action.id}
            data-action={action.id}
            disabled={action.disabled || action.busy || !!busyId}
            title={action.title}
            variant={
              (workspaceMenuActionDefinition(action.id)?.destructive ?? action.destructive) ? 'destructive' : 'default'
            }
            onSelect={() => void (onSelect ? onSelect(action) : action.onSelect())}
          >
            {pendingId === action.id || action.busy ? (
              <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
            ) : (
              <WorkspaceMenuActionIcon action={action} />
            )}
            <span className="min-w-0 flex-1">{action.label}</span>
            {action.shortcut ? <DropdownMenuShortcut>{action.shortcut}</DropdownMenuShortcut> : null}
          </Item>
        ))}
      </Fragment>
    ))
  }

  return sections.map((section) => (
    <Sub key={section.category}>
      <SubTrigger data-menu-category={section.category} className="min-w-44 gap-2">
        <WorkspaceMenuCategoryIcon category={section.category} />
        <span className="flex-1">{t(`workspace.menu.${section.category}`)}</span>
      </SubTrigger>
      <SubContent className="min-w-56 max-w-[calc(100vw-1rem)] max-h-[min(70vh,var(--radix-popper-available-height,70vh))] overflow-y-auto">
        {renderGroups(section.groups)}
      </SubContent>
    </Sub>
  ))
}
