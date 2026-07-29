import { useCallback, useMemo } from 'react'
import { PanelLeftOpen } from 'lucide-react'
import { NON_GIT_WORKSPACE_TERMINAL_BRANCH, type TerminalLaunchMode } from '#/shared/terminal.ts'
import { Toolbar } from '#/web/components/Layout.tsx'
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
import type { RepoWorkspaceLayout } from '#/web/stores/repos/types.ts'
import type { TerminalSessionBase } from '#/web/components/terminal/types.ts'
import { useIsCompactUi } from '#/web/hooks/useResponsiveUiMode.tsx'
import { cn } from '#/web/lib/cn.ts'

interface PlainWorkspaceTerminalPanelProps {
  repoId: string
  layout: RepoWorkspaceLayout
  focusMode?: boolean
  compactFocusPresentation?: boolean
  onShowCompactOverview?: () => void
  onExitTerminalFocus?: () => void
}

const DETAIL_ID = 'plain-workspace-terminal'

export function PlainWorkspaceTerminalPanel({
  repoId,
  layout,
  focusMode = false,
  compactFocusPresentation = false,
  onShowCompactOverview,
  onExitTerminalFocus,
}: PlainWorkspaceTerminalPanelProps) {
  const t = useT()
  const compact = useIsCompactUi()
  const repo = useReposStore((state) => state.repos[repoId])
  const workspacePath = repoPlainWorkspacePath(repo) ?? repoId
  const terminalWorktreeKey = worktreeTerminalKey(repoId, workspacePath)
  const snapshot = useWorktreeTerminalSnapshot(terminalWorktreeKey)
  const terminalTabFocusRegistry = useFocusRegistry<string, HTMLButtonElement>()
  const contextRail = focusMode || compactFocusPresentation
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

  const handleNewTerminal = useCallback(
    (launchMode: TerminalLaunchMode = 'native') => {
      void createTerminal(terminalBase, launchMode)
    },
    [createTerminal, terminalBase],
  )

  const handleSelectTerminal = useCallback(
    (key: string) => {
      selectTerminal(terminalWorktreeKey, key)
    },
    [selectTerminal, terminalWorktreeKey],
  )

  const handleCloseTerminal = useCallback(
    (key: string, options?: Parameters<typeof closeTerminalAndDismissDetailIfLast>[2]) => {
      return closeTerminalAndDismissDetailIfLast(key, terminalBase, options)
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
        tone="topbar"
        className={cn(
          'mobile-topbar-scroll',
          layout === 'left-right' && '[-webkit-app-region:drag]',
          focusMode && 'topbar',
        )}
      >
        <div className="mobile-topbar-scroll-content flex h-full min-w-0 items-center gap-1 overflow-hidden">
          {contextRail && (
            <>
              {compactFocusPresentation && onShowCompactOverview ? (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onShowCompactOverview}
                  aria-label={t('mobile.open-workspace')}
                  title={t('mobile.open-workspace')}
                >
                  <PanelLeftOpen />
                </Button>
              ) : focusMode ? (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onExitTerminalFocus}
                  aria-label={t('branch-detail.exit-focus')}
                  title={t('branch-detail.exit-focus-title')}
                >
                  <PanelLeftOpen />
                </Button>
              ) : null}
              <FocusProjectSwitcher repoId={repoId} compact={compactFocusPresentation} />
              <WorkspaceRepositorySwitcher repoId={repoId} compact={compactFocusPresentation} />
            </>
          )}
          <TerminalTabs
            worktreeTerminalKey={terminalWorktreeKey}
            sessions={snapshot.sessions}
            detailId={DETAIL_ID}
            responsiveCompact={compact}
            panelActive
            focusMode={contextRail}
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
        {snapshot.selectedDescriptor || snapshot.creating === true ? (
          <TerminalSlot repoRoot={repoId} worktreePath={workspacePath} />
        ) : null}
      </div>
    </section>
  )
}
