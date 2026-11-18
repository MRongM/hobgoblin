import { X } from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'
import { useCloseTerminalScope } from '#/web/components/terminal/TerminalScopeContextMenu.tsx'
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '#/web/components/ui/context-menu.tsx'
import { useT } from '#/web/stores/i18n.ts'
import {
  branchWorkspaceActionGroups,
  type BranchWorkspaceItemAction,
} from '#/web/components/repo-workspace/BranchWorkspaceItemMenu.tsx'
import { WorkspaceActionMenuItems } from '#/web/components/repo-workspace/WorkspaceActionMenuItems.tsx'
import type { WorkspaceListItemAction } from '#/web/components/repo-workspace/WorkspaceListItem.tsx'

type WorkspaceItemContextAction = Pick<
  WorkspaceListItemAction,
  | 'id'
  | 'label'
  | 'icon'
  | 'disabled'
  | 'busy'
  | 'destructive'
  | 'onSelect'
  | 'category'
  | 'shortcut'
  | 'visible'
  | 'title'
>

export interface WorkspaceItemOpenAction {
  disabled: boolean
  busy?: boolean
  icon: ReactNode
  onSelect: () => void | Promise<void>
}

interface WorkspaceItemContextMenuProps {
  fileArea?: WorkspaceItemOpenAction
  editor: WorkspaceItemOpenAction
  directory?: WorkspaceListItemAction
  remote?: WorkspaceItemOpenAction
  externalTerminal: WorkspaceItemOpenAction
  internalTerminal: WorkspaceItemOpenAction
  windowsInternalTerminals?: {
    powershell: WorkspaceItemOpenAction
    wsl: WorkspaceItemOpenAction
  }
  tmuxTerminal?: WorkspaceItemOpenAction
  restoreTmuxTerminals?: WorkspaceItemOpenAction
  actions?: readonly WorkspaceItemContextAction[]
  worktreeTerminalKeys: readonly string[]
  additionalActions?: readonly BranchWorkspaceItemAction[]
  children: ReactElement
}

export function WorkspaceItemContextMenu({
  fileArea,
  editor,
  directory,
  remote,
  externalTerminal,
  internalTerminal,
  windowsInternalTerminals,
  tmuxTerminal,
  restoreTmuxTerminals,
  actions = [],
  worktreeTerminalKeys,
  additionalActions = [],
  children,
}: WorkspaceItemContextMenuProps): ReactElement {
  const t = useT()
  const closeScope = useCloseTerminalScope(worktreeTerminalKeys)

  const opening: WorkspaceListItemAction[] = [
    ...(fileArea ? [{ id: 'fileArea', label: t('file-area.open'), ...fileArea }] : []),
    { id: 'editor', label: t('worktrees.open-in-editor-label'), ...editor },
    ...(directory ? [directory] : []),
    ...(remote ? [{ id: 'remote', label: t('action.remote'), ...remote }] : []),
  ]
  const terminals: WorkspaceListItemAction[] = [
    { id: 'externalTerminal', label: t('terminal.external'), ...externalTerminal },
    { id: 'terminal', label: t('terminal.internal'), ...internalTerminal },
    ...(windowsInternalTerminals
      ? [
          {
            id: 'terminalPowerShell',
            label: t('terminal.internal-powershell'),
            ...windowsInternalTerminals.powershell,
          },
          { id: 'terminalWsl', label: t('terminal.internal-wsl'), ...windowsInternalTerminals.wsl },
        ]
      : []),
    ...(tmuxTerminal ? [{ id: 'terminalTmux', label: t('terminal.new-with-tmux'), ...tmuxTerminal }] : []),
    ...(restoreTmuxTerminals
      ? [{ id: 'restoreTmuxTerminals', label: t('terminal.restore-directory-tmux'), ...restoreTmuxTerminals }]
      : []),
    {
      id: 'closeAllTerminals',
      label: closeScope.label,
      icon: <X aria-hidden="true" />,
      disabled: closeScope.disabled,
      destructive: true,
      onSelect: closeScope.requestClose,
    },
  ].map((action) => ({ ...action, category: 'terminals' as const }))

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent>
          <WorkspaceActionMenuItems
            context
            groups={[opening, terminals, [...actions], ...branchWorkspaceActionGroups(additionalActions, t)]}
          />
        </ContextMenuContent>
      </ContextMenu>
      {closeScope.dialog}
    </>
  )
}
