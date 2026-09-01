import { X } from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'
import { useCloseTerminalScope } from '#/web/components/terminal/TerminalScopeContextMenu.tsx'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '#/web/components/ui/context-menu.tsx'
import { useT } from '#/web/stores/i18n.ts'
import type { BranchWorkspaceItemAction } from '#/web/components/repo-workspace/BranchWorkspaceItemMenu.tsx'
import type { WorkspaceListItemAction } from '#/web/components/repo-workspace/WorkspaceListItem.tsx'

type WorkspaceItemContextAction = Pick<
  WorkspaceListItemAction,
  'id' | 'label' | 'icon' | 'disabled' | 'busy' | 'destructive' | 'onSelect'
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

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent>
          {fileArea ? <OpenActionItem action={fileArea}>{t('file-area.open')}</OpenActionItem> : null}
          <OpenActionItem action={editor}>{t('worktrees.open-in-editor-label')}</OpenActionItem>
          {remote ? <OpenActionItem action={remote}>{t('action.remote')}</OpenActionItem> : null}
          <OpenActionItem action={externalTerminal}>{t('terminal.external')}</OpenActionItem>
          {windowsInternalTerminals ? (
            <>
              <OpenActionItem action={windowsInternalTerminals.powershell}>
                {t('terminal.internal-powershell')}
              </OpenActionItem>
              <OpenActionItem action={windowsInternalTerminals.wsl}>{t('terminal.internal-wsl')}</OpenActionItem>
            </>
          ) : (
            <OpenActionItem action={internalTerminal}>{t('terminal.internal')}</OpenActionItem>
          )}
          {tmuxTerminal ? <OpenActionItem action={tmuxTerminal}>{t('terminal.new-with-tmux')}</OpenActionItem> : null}
          {restoreTmuxTerminals ? (
            <OpenActionItem action={restoreTmuxTerminals}>{t('terminal.restore-directory-tmux')}</OpenActionItem>
          ) : null}
          {actions.length > 0 ? <ContextMenuSeparator /> : null}
          {actions.map((action) => (
            <ContextMenuItem
              key={action.id}
              variant={action.destructive ? 'destructive' : 'default'}
              disabled={action.disabled || action.busy}
              onSelect={() => void action.onSelect()}
            >
              {action.icon}
              {action.label}
            </ContextMenuItem>
          ))}
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" disabled={closeScope.disabled} onSelect={closeScope.requestClose}>
            <X aria-hidden="true" />
            {closeScope.label}
          </ContextMenuItem>
          {additionalActions.length > 0 ? <ContextMenuSeparator /> : null}
          {additionalActions.map((action, index) => (
            <ContextMenuItem
              key={`${action.label}-${index}`}
              variant={action.destructive ? 'destructive' : 'default'}
              disabled={action.disabled || action.busy}
              onSelect={() => void action.onSelect()}
            >
              {action.icon}
              {t(action.label)}
            </ContextMenuItem>
          ))}
        </ContextMenuContent>
      </ContextMenu>
      {closeScope.dialog}
    </>
  )
}

function OpenActionItem({ action, children }: { action: WorkspaceItemOpenAction; children: ReactNode }) {
  return (
    <ContextMenuItem disabled={action.disabled || action.busy} onSelect={() => void action.onSelect()}>
      {action.icon}
      {children}
    </ContextMenuItem>
  )
}
