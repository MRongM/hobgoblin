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

export interface WorkspaceItemOpenAction {
  disabled: boolean
  busy?: boolean
  icon: ReactNode
  onSelect: () => void | Promise<void>
}

interface WorkspaceItemContextMenuProps {
  editor: WorkspaceItemOpenAction
  externalTerminal: WorkspaceItemOpenAction
  internalTerminal: WorkspaceItemOpenAction
  worktreeTerminalKeys: readonly string[]
  children: ReactElement
}

export function WorkspaceItemContextMenu({
  editor,
  externalTerminal,
  internalTerminal,
  worktreeTerminalKeys,
  children,
}: WorkspaceItemContextMenuProps): ReactElement {
  const t = useT()
  const closeScope = useCloseTerminalScope(worktreeTerminalKeys)

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent>
          <OpenActionItem action={editor}>{t('worktrees.open-in-editor-label')}</OpenActionItem>
          <OpenActionItem action={externalTerminal}>{t('terminal.external')}</OpenActionItem>
          <OpenActionItem action={internalTerminal}>{t('terminal.internal')}</OpenActionItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" disabled={closeScope.disabled} onSelect={closeScope.requestClose}>
            <X aria-hidden="true" />
            {closeScope.label}
          </ContextMenuItem>
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
