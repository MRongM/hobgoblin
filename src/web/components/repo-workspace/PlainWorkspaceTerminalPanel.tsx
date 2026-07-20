import { useCallback, useEffect, useMemo, useRef } from 'react'
import { PanelLeftOpen } from 'lucide-react'
import { NON_GIT_WORKSPACE_TERMINAL_BRANCH } from '#/shared/terminal.ts'
import { EmptyState, Toolbar } from '#/web/components/Layout.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { FocusProjectSwitcher } from '#/web/components/repo-workspace/FocusProjectSwitcher.tsx'
import { WorkspaceRepositorySwitcher } from '#/web/components/repo-workspace/WorkspaceRepositorySwitcher.tsx'
import { TerminalSlot } from '#/web/components/terminal/TerminalSlot.tsx'
import { EMPTY_TERMINAL_TAB_FOCUS_KEY, TerminalTabs } from '#/web/components/terminal/TerminalTabs.tsx'
import { useTerminalSessionContext } from '#/web/components/terminal/terminal-session-context.ts'
import { worktreeTerminalKey } from '#/web/components/terminal/terminal-session-keys.ts'
import { useWorktreeTerminalSnapshot } from '#/web/components/terminal/terminal-session-store.ts'
import { useFocusRegistry } from '#/web/components/tab-strip/useFocusRegistry.ts'
import { useT } from '#/web/stores/i18n.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { repoPlainWorkspacePath } from '#/web/stores/repos/capabilities.ts'
import type { TerminalSessionBase } from '#/web/components/terminal/types.ts'
import { useIsCompactUi } from '#/web/hooks/useResponsiveUiMode.tsx'
import { cn } from '#/web/lib/cn.ts'

interface PlainWorkspaceTerminalPanelProps {
  repoId: string
  focusMode?: boolean
}

const DETAIL_ID = 'plain-workspace-terminal'

export function PlainWorkspaceTerminalPanel({ repoId, focusMode = false }: PlainWorkspaceTerminalPanelProps) {
  const t = useT()
  const compact = useIsCompactUi()
  const repo = useReposStore((state) => state.repos[repoId])
  const toggleDetailFocusMode = useReposStore((state) => state.toggleDetailFocusMode)
  const workspacePath = repoPlainWorkspacePath(repo) ?? repoId
  const terminalWorktreeKey = worktreeTerminalKey(repoId, workspacePath)
  const snapshot = useWorktreeTerminalSnapshot(terminalWorktreeKey)
  const terminalTabFocusRegistry = useFocusRegistry<string, HTMLButtonElement>()
  const bootstrappedRef = useRef(false)
  const {
    createTerminal,
    selectTerminal,
    scrollToBottom,
    focusTerminal,
    closeTerminalAndDismissDetailIfLast,
    reorderSessions,
  } = useTerminalSessionContext()

  const terminalBase = useMemo<TerminalSessionBase>(
    () => ({
      repoRoot: repoId,
      branch: NON_GIT_WORKSPACE_TERMINAL_BRANCH,
      worktreePath: workspacePath,
    }),
    [repoId, workspacePath],
  )

  useEffect(() => {
    bootstrappedRef.current = false
  }, [terminalWorktreeKey])

  useEffect(() => {
    if (bootstrappedRef.current) return
    if (snapshot.sessions.length > 0) return
    bootstrappedRef.current = true
    void createTerminal(terminalBase)
  }, [createTerminal, snapshot.sessions.length, terminalBase])

  const handleNewTerminal = useCallback(() => {
    void createTerminal(terminalBase)
  }, [createTerminal, terminalBase])

  const handleSelectTerminal = useCallback(
    (key: string) => {
      selectTerminal(terminalWorktreeKey, key)
    },
    [selectTerminal, terminalWorktreeKey],
  )

  const handleCloseTerminal = useCallback(
    (key: string) => {
      closeTerminalAndDismissDetailIfLast(key, terminalBase)
    },
    [closeTerminalAndDismissDetailIfLast, terminalBase],
  )

  const handleReorderTerminals = useCallback(
    (worktreeKey: string, orderedKeys: string[]) => {
      void reorderSessions(worktreeKey, orderedKeys)
    },
    [reorderSessions],
  )

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-pane">
      <Toolbar
        data-testid="plain-workspace-terminal-toolbar"
        variant="detail"
        chrome={compact ? 'toolbar' : 'topbar'}
        className={cn(focusMode && 'topbar')}
      >
        <div className="flex h-full min-w-0 items-center gap-1 overflow-hidden">
          {focusMode && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleDetailFocusMode}
                aria-label={t('branch-detail.exit-focus')}
                title={t('branch-detail.exit-focus-title')}
              >
                <PanelLeftOpen />
              </Button>
              <FocusProjectSwitcher repoId={repoId} />
              <WorkspaceRepositorySwitcher repoId={repoId} />
            </>
          )}
          <TerminalTabs
            worktreeTerminalKey={terminalWorktreeKey}
            sessions={snapshot.sessions}
            detailId={DETAIL_ID}
            panelActive
            focusMode={focusMode}
            focusRegistry={terminalTabFocusRegistry}
            emptyFocusKey={EMPTY_TERMINAL_TAB_FOCUS_KEY}
            onNew={handleNewTerminal}
            onSelect={(_worktreeKey, key) => handleSelectTerminal(key)}
            onScrollToBottom={scrollToBottom}
            onFocusTerminal={focusTerminal}
            onClose={handleCloseTerminal}
            onReorder={handleReorderTerminals}
          />
        </div>
      </Toolbar>
      <div className="flex min-h-0 flex-1 flex-col">
        {snapshot.selectedDescriptor ? (
          <TerminalSlot repoRoot={repoId} branch={snapshot.selectedDescriptor.branch} worktreePath={workspacePath} />
        ) : (
          <EmptyState title={t('terminal.label')} body={t('terminal.new')} />
        )}
      </div>
    </section>
  )
}
