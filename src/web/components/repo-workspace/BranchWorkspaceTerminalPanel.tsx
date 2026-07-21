import { useCallback, useMemo } from 'react'
import { EmptyState, Toolbar } from '#/web/components/Layout.tsx'
import type { BranchWorkspaceFolderContext } from '#/web/components/repo-workspace/BranchWorkspaceFileTree.tsx'
import { TerminalSlot } from '#/web/components/terminal/TerminalSlot.tsx'
import { EMPTY_TERMINAL_TAB_FOCUS_KEY, TerminalTabs } from '#/web/components/terminal/TerminalTabs.tsx'
import { useTerminalSessionContext } from '#/web/components/terminal/terminal-session-context.ts'
import { worktreeTerminalKey } from '#/web/components/terminal/terminal-session-keys.ts'
import { useWorktreeTerminalSnapshot } from '#/web/components/terminal/terminal-session-store.ts'
import { useFocusRegistry } from '#/web/components/tab-strip/useFocusRegistry.ts'
import { useT } from '#/web/stores/i18n.ts'
import type {
  TerminalSessionBase,
  TerminalSessionContextValue,
  TerminalSessionReadContextValue,
} from '#/web/components/terminal/types.ts'

interface BranchWorkspaceTerminalPanelProps {
  context: BranchWorkspaceFolderContext
}

interface OpenBranchWorkspaceInternalTerminalDependencies
  extends Pick<TerminalSessionReadContextValue, 'worktreeSnapshot'>,
    Pick<TerminalSessionContextValue, 'selectTerminal' | 'createTerminal'> {
  activate(): void
}

export function BranchWorkspaceTerminalPanel({ context }: BranchWorkspaceTerminalPanelProps) {
  const t = useT()
  const terminalWorktreeKey = worktreeTerminalKey(context.rootId, context.path)
  const snapshot = useWorktreeTerminalSnapshot(terminalWorktreeKey)
  const terminalTabFocusRegistry = useFocusRegistry<string, HTMLButtonElement>()
  const {
    createTerminal,
    selectTerminal,
    scrollToBottom,
    focusTerminal,
    closeTerminalAndDismissDetailIfLast,
    reorderSessions,
  } = useTerminalSessionContext()
  const terminalBase = useMemo(() => branchWorkspaceTerminalBase(context), [context])
  const terminalCreationAvailable =
    context.available && context.lifecycle !== 'delete-incomplete' && context.lifecycle !== 'active'

  const handleNewTerminal = useCallback(async () => {
    if (!terminalCreationAvailable) return
    await createTerminal(terminalBase)
  }, [createTerminal, terminalBase, terminalCreationAvailable])

  const handleSelectTerminal = useCallback(
    (key: string) => selectTerminal(terminalWorktreeKey, key),
    [selectTerminal, terminalWorktreeKey],
  )
  const handleCloseTerminal = useCallback(
    (key: string) => closeTerminalAndDismissDetailIfLast(key, terminalBase),
    [closeTerminalAndDismissDetailIfLast, terminalBase],
  )
  const handleReorderTerminals = useCallback(
    (worktreeKey: string, orderedKeys: string[]) => void reorderSessions(worktreeKey, orderedKeys),
    [reorderSessions],
  )

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-pane">
      <Toolbar data-testid="branch-workspace-terminal-toolbar" variant="detail">
        <TerminalTabs
          worktreeTerminalKey={terminalWorktreeKey}
          sessions={snapshot.sessions}
          detailId={`branch-workspace-terminal-${context.id}`}
          panelActive
          focusRegistry={terminalTabFocusRegistry}
          emptyFocusKey={EMPTY_TERMINAL_TAB_FOCUS_KEY}
          onNew={() => void handleNewTerminal()}
          onSelect={(_worktreeKey, key) => handleSelectTerminal(key)}
          onScrollToBottom={scrollToBottom}
          onFocusTerminal={focusTerminal}
          onClose={handleCloseTerminal}
          onReorder={handleReorderTerminals}
        />
      </Toolbar>
      <div className="flex min-h-0 flex-1 flex-col">
        {snapshot.selectedDescriptor ? (
          <TerminalSlot repoRoot={context.rootId} branch={context.branch} worktreePath={context.path} />
        ) : (
          <EmptyState title={t('terminal.label')} body={t('terminal.new')} />
        )}
      </div>
    </section>
  )
}

export async function openBranchWorkspaceInternalTerminal(
  context: BranchWorkspaceFolderContext,
  dependencies: OpenBranchWorkspaceInternalTerminalDependencies,
): Promise<boolean> {
  if (!context.available || context.lifecycle === 'delete-incomplete' || context.lifecycle === 'active') return false
  dependencies.activate()
  const terminalWorktreeKey = worktreeTerminalKey(context.rootId, context.path)
  const snapshot = dependencies.worktreeSnapshot(terminalWorktreeKey)
  const selectedKey =
    snapshot.selectedDescriptor?.key ??
    snapshot.sessions.find((session) => session.selected)?.key ??
    snapshot.sessions[0]?.key
  if (selectedKey) {
    dependencies.selectTerminal(terminalWorktreeKey, selectedKey)
    return true
  }
  await dependencies.createTerminal(branchWorkspaceTerminalBase(context))
  return true
}

function branchWorkspaceTerminalBase(context: BranchWorkspaceFolderContext): TerminalSessionBase {
  return {
    repoRoot: context.rootId,
    branch: context.branch,
    worktreePath: context.path,
    targetKind: 'branch-workspace',
    branchWorkspaceId: context.id,
  }
}
