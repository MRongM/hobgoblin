import { useCallback, useMemo, type ReactNode } from 'react'
import { PanelLeftOpen } from 'lucide-react'
import { Toolbar } from '#/web/components/Layout.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { FocusProjectSwitcher } from '#/web/components/repo-workspace/FocusProjectSwitcher.tsx'
import { WorkspaceRepositorySwitcher } from '#/web/components/repo-workspace/WorkspaceRepositorySwitcher.tsx'
import type { BranchWorkspaceFolderContext } from '#/web/components/repo-workspace/BranchWorkspaceFileTree.tsx'
import { TerminalSlot } from '#/web/components/terminal/TerminalSlot.tsx'
import { EMPTY_TERMINAL_TAB_FOCUS_KEY, TerminalTabs } from '#/web/components/terminal/TerminalTabs.tsx'
import { useTerminalSessionContext } from '#/web/components/terminal/terminal-session-context.ts'
import { worktreeTerminalKey } from '#/web/components/terminal/terminal-session-keys.ts'
import { useWorktreeTerminalSnapshot } from '#/web/components/terminal/terminal-session-store.ts'
import { useFocusRegistry } from '#/web/components/tab-strip/useFocusRegistry.ts'
import { useIsCompactUi } from '#/web/hooks/useResponsiveUiMode.tsx'
import { useT } from '#/web/stores/i18n.ts'
import { cn } from '#/web/lib/cn.ts'
import type { TerminalSessionBase, TerminalSessionContextValue } from '#/web/components/terminal/types.ts'
import type { TerminalLaunchMode, WindowsInternalTerminalShellOverride } from '#/shared/terminal.ts'

interface BranchWorkspaceTerminalPanelProps {
  context: BranchWorkspaceFolderContext
  toolbarLeading?: ReactNode
  terminalFocusMode?: boolean
  onExitTerminalFocus?: () => void
}

interface OpenBranchWorkspaceInternalTerminalDependencies extends Pick<TerminalSessionContextValue, 'createTerminal'> {
  activate(): void
}

export function BranchWorkspaceTerminalPanel({
  context,
  toolbarLeading,
  terminalFocusMode = false,
  onExitTerminalFocus,
}: BranchWorkspaceTerminalPanelProps) {
  const t = useT()
  const compact = useIsCompactUi()
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
  const terminalCreationAvailable = context.available && !context.busy
  const contextRail = terminalFocusMode || compact

  const handleNewTerminal = useCallback(
    async (launchMode: TerminalLaunchMode = 'native') => {
      if (!terminalCreationAvailable) return
      await createTerminal(terminalBase, launchMode)
    },
    [createTerminal, terminalBase, terminalCreationAvailable],
  )

  const handleSelectTerminal = useCallback(
    (key: string) => selectTerminal(terminalWorktreeKey, key),
    [selectTerminal, terminalWorktreeKey],
  )
  const handleCloseTerminal = useCallback(
    (key: string, options?: Parameters<typeof closeTerminalAndDismissDetailIfLast>[2]) =>
      closeTerminalAndDismissDetailIfLast(key, terminalBase, options),
    [closeTerminalAndDismissDetailIfLast, terminalBase],
  )
  const handleReorderTerminals = useCallback(
    (worktreeKey: string, orderedKeys: string[]) => void reorderSessions(worktreeKey, orderedKeys),
    [reorderSessions],
  )

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-pane">
      <Toolbar
        data-testid="branch-workspace-terminal-toolbar"
        variant="detail"
        chrome={compact ? 'toolbar' : 'topbar'}
        tone="topbar"
        className={cn('mobile-topbar-scroll', '[-webkit-app-region:drag]', terminalFocusMode && 'topbar')}
      >
        <div className="mobile-topbar-scroll-content flex h-full min-w-0 items-center gap-1 overflow-hidden">
          {terminalFocusMode ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={onExitTerminalFocus}
              aria-label={t('terminal.exit-focus')}
              title={t('terminal.exit-focus')}
            >
              <PanelLeftOpen />
            </Button>
          ) : (
            toolbarLeading
          )}
          {contextRail && (
            <>
              <FocusProjectSwitcher repoId={context.rootId} compact={compact} />
              <WorkspaceRepositorySwitcher repoId={context.rootId} compact={compact} />
            </>
          )}
          <TerminalTabs
            worktreeTerminalKey={terminalWorktreeKey}
            sessions={snapshot.sessions}
            detailId={`branch-workspace-terminal-${context.id}`}
            responsiveCompact={compact}
            panelActive
            focusMode={contextRail}
            focusRegistry={terminalTabFocusRegistry}
            emptyFocusKey={EMPTY_TERMINAL_TAB_FOCUS_KEY}
            onNew={(launchMode) => void handleNewTerminal(launchMode)}
            onSelect={(_worktreeKey, key) => handleSelectTerminal(key)}
            onScrollToBottom={scrollToBottom}
            onFocusTerminal={focusTerminal}
            onClose={handleCloseTerminal}
            onReorder={handleReorderTerminals}
          />
        </div>
        <div aria-hidden="true" className="w-2 shrink-0 self-stretch" />
      </Toolbar>
      <div className="flex min-h-0 flex-1 flex-col">
        {snapshot.selectedDescriptor || snapshot.creating === true ? (
          <TerminalSlot repoRoot={context.rootId} worktreePath={context.path} />
        ) : null}
      </div>
    </section>
  )
}

export async function openBranchWorkspaceInternalTerminal(
  context: BranchWorkspaceFolderContext,
  dependencies: OpenBranchWorkspaceInternalTerminalDependencies,
  launchMode: TerminalLaunchMode = 'native',
  windowsInternalTerminalShell?: WindowsInternalTerminalShellOverride,
): Promise<boolean> {
  if (!context.available || context.busy) return false
  dependencies.activate()
  if (windowsInternalTerminalShell) {
    await dependencies.createTerminal(branchWorkspaceTerminalBase(context), launchMode, windowsInternalTerminalShell)
  } else {
    await dependencies.createTerminal(branchWorkspaceTerminalBase(context), launchMode)
  }
  return true
}

export function branchWorkspaceTerminalBase(context: BranchWorkspaceFolderContext): TerminalSessionBase {
  return {
    repoRoot: context.rootId,
    branch: context.branch,
    worktreePath: context.path,
    targetKind: 'branch-workspace',
    branchWorkspaceId: context.id,
  }
}
