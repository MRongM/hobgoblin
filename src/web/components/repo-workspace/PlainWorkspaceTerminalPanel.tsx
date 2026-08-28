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

interface WorktreeTerminalPanelProps extends PlainWorkspaceTerminalPanelProps {
  worktreePath: string
  terminalLabel: string
  detailId?: string
  toolbarTestId?: string
}

const PLAIN_WORKSPACE_DETAIL_ID = 'plain-workspace-terminal'

export function PlainWorkspaceTerminalPanel({
  repoId,
  layout,
  focusMode = false,
  compactFocusPresentation = false,
  onShowCompactOverview,
  onExitTerminalFocus,
}: PlainWorkspaceTerminalPanelProps) {
  const repo = useReposStore((state) => state.repos[repoId])
  const workspacePath = repoPlainWorkspacePath(repo) ?? repoId
  return (
    <WorktreeTerminalPanel
      repoId={repoId}
      layout={layout}
      worktreePath={workspacePath}
      terminalLabel={NON_GIT_WORKSPACE_TERMINAL_BRANCH}
      detailId={PLAIN_WORKSPACE_DETAIL_ID}
      toolbarTestId="plain-workspace-terminal-toolbar"
      focusMode={focusMode}
      compactFocusPresentation={compactFocusPresentation}
      onShowCompactOverview={onShowCompactOverview}
      onExitTerminalFocus={onExitTerminalFocus}
    />
  )
}

export function WorktreeTerminalPanel({
  repoId,
  layout,
  worktreePath,
  terminalLabel,
  detailId = 'worktree-terminal',
  toolbarTestId = 'worktree-terminal-toolbar',
  focusMode = false,
  compactFocusPresentation = false,
  onShowCompactOverview,
  onExitTerminalFocus,
}: WorktreeTerminalPanelProps) {
  const t = useT()
  const compact = useIsCompactUi()
  const terminalWorktreeKey = worktreeTerminalKey(repoId, worktreePath)
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
      branch: terminalLabel,
      worktreePath,
    }),
    [repoId, terminalLabel, worktreePath],
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
        data-testid={toolbarTestId}
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
            detailId={detailId}
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
          <TerminalSlot repoRoot={repoId} worktreePath={worktreePath} />
        ) : null}
      </div>
    </section>
  )
}
