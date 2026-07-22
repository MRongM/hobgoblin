import type { BranchActionItem, BranchActionItemGroups } from '#/web/hooks/useBranchActionItems.tsx'
import type { WorkspaceItemOpenAction } from '#/web/components/repo-workspace/WorkspaceItemContextMenu.tsx'
import type { WorkspaceListItemAction } from '#/web/components/repo-workspace/WorkspaceListItem.tsx'

export type WorktreeListItemActionPolicy = 'ordinary-worktree' | 'branch-workspace-member'

interface WorktreeListItemActionProjectionOptions {
  policy: WorktreeListItemActionPolicy
  hasWorktree: boolean
  forceDisabled?: boolean
}

export interface WorktreeListItemActionProjection {
  editor?: WorkspaceListItemAction
  internalTerminal?: WorkspaceListItemAction
  menuGroups: WorkspaceListItemAction[][]
  contextMenu: {
    editor: WorkspaceItemOpenAction
    externalTerminal: WorkspaceItemOpenAction
    internalTerminal: WorkspaceItemOpenAction
  }
}

const ordinaryMainExclusions = new Set(['checkout', 'createWorktree', 'sync'])
const memberMainExclusions = new Set([...ordinaryMainExclusions, 'checkoutTo'])
const ordinaryDestructiveExclusions = new Set(['deleteBranch'])
const memberDestructiveExclusions = new Set([...ordinaryDestructiveExclusions, 'removeWorktree'])

export function projectWorktreeListItemActions(
  groups: BranchActionItemGroups,
  { policy, hasWorktree, forceDisabled = false }: WorktreeListItemActionProjectionOptions,
): WorktreeListItemActionProjection {
  const editorItem = hasWorktree ? groups.externalItems.find((item) => item.id === 'editor') : undefined
  const terminalItem = hasWorktree ? groups.externalItems.find((item) => item.id === 'terminal') : undefined
  const externalItems = hasWorktree
    ? groups.externalItems.filter((item) => item.id !== 'editor' && item.id !== 'terminal')
    : groups.externalItems
  const mainExclusions = policy === 'branch-workspace-member' ? memberMainExclusions : ordinaryMainExclusions
  const destructiveExclusions =
    policy === 'branch-workspace-member' ? memberDestructiveExclusions : ordinaryDestructiveExclusions
  const mainItems = hasWorktree ? groups.mainItems.filter((item) => !mainExclusions.has(item.id)) : groups.mainItems
  const destructiveItems = hasWorktree
    ? groups.destructiveItems.filter((item) => !destructiveExclusions.has(item.id))
    : groups.destructiveItems

  return {
    editor: editorItem ? branchListItemAction(editorItem, forceDisabled) : undefined,
    internalTerminal: terminalItem ? branchListItemAction(terminalItem, forceDisabled) : undefined,
    menuGroups: [externalItems, mainItems, groups.patchItems, destructiveItems].map((items) =>
      items.map((item) => branchListItemAction(item, forceDisabled)),
    ),
    contextMenu: {
      editor: branchContextMenuAction(
        groups.externalItems.find((item) => item.id === 'editor'),
        forceDisabled,
      ),
      externalTerminal: branchContextMenuAction(
        groups.externalItems.find((item) => item.id === 'externalTerminal'),
        forceDisabled,
      ),
      internalTerminal: branchContextMenuAction(
        groups.externalItems.find((item) => item.id === 'terminal'),
        forceDisabled,
      ),
    },
  }
}

export function branchListItemAction(item: BranchActionItem, forceDisabled = false): WorkspaceListItemAction {
  return {
    id: item.id,
    label: item.label,
    title: item.title,
    ariaLabel: item.ariaLabel,
    icon: item.icon,
    disabled: forceDisabled || item.disabled,
    busy: item.busy,
    destructive: item.destructive,
    shortcut: item.shortcut,
    visible: item.visible,
    onSelect: item.onSelect,
  }
}

export function branchContextMenuAction(
  item: BranchActionItem | undefined,
  forceDisabled = false,
): WorkspaceItemOpenAction {
  return item
    ? {
        disabled: forceDisabled || item.disabled || !item.visible,
        busy: item.busy,
        icon: item.icon,
        onSelect: item.onSelect,
      }
    : { disabled: true, icon: null, onSelect: () => {} }
}
