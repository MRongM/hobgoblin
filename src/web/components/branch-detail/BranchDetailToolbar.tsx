import { PanelLeftOpen } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { useReposStore } from '#/web/stores/repos/store.ts'
import type { RepoWorkspaceLayout } from '#/web/stores/repos/types.ts'
import { useT } from '#/web/stores/i18n.ts'
import { Button } from '#/web/components/ui/button.tsx'
import { Toolbar } from '#/web/components/Layout.tsx'
import { detailTabForWorktree } from '#/web/lib/detail-tabs.ts'
import { cn } from '#/web/lib/cn.ts'
import { worktreeTerminalKey } from '#/web/components/terminal/terminal-session-keys.ts'
import { useWorktreeTerminalSnapshot } from '#/web/components/terminal/terminal-session-store.ts'
import { useTerminalSessionContext } from '#/web/components/terminal/terminal-session-context.ts'
import { EMPTY_TERMINAL_TAB_FOCUS_KEY, TerminalTabs } from '#/web/components/terminal/TerminalTabs.tsx'
import { useMainWindowNavigation } from '#/web/main-window-navigation.tsx'
import type { TerminalSessionBase } from '#/web/components/terminal/types.ts'
import type { TerminalLaunchMode } from '#/shared/terminal.ts'
import type { BranchDetailRepo, SelectedBranchDetailPresentation } from '#/web/components/branch-detail/model.ts'
import { useIsCompactUi } from '#/web/hooks/useResponsiveUiMode.tsx'
import { useFocusRegistry } from '#/web/components/tab-strip/useFocusRegistry.ts'
import { FocusProjectSwitcher } from '#/web/components/repo-workspace/FocusProjectSwitcher.tsx'
import { WorkspaceRepositorySwitcher } from '#/web/components/repo-workspace/WorkspaceRepositorySwitcher.tsx'
import {
  branchDetailToolbarStoreActionsEqual,
  branchDetailToolbarStoreActionsFromStore,
} from '#/web/stores/repos/selector-actions.ts'
interface Props {
  repo: Pick<BranchDetailRepo, 'id' | 'ui'>
  detail: SelectedBranchDetailPresentation
  detailId: string
  contentId: string
  collapsed: boolean
  detailFocusMode: boolean
  terminalFocusMode?: boolean
  compactFocusPresentation?: boolean
  layout: RepoWorkspaceLayout
  onShowCompactExplorer?: () => void
  onShowTerminal?: () => void
  onExitTerminalFocus?: () => void
}

export function BranchDetailToolbar({
  repo,
  detail,
  detailId,
  detailFocusMode,
  terminalFocusMode = false,
  compactFocusPresentation = false,
  onShowCompactExplorer,
  onShowTerminal,
  onExitTerminalFocus,
}: Props) {
  const t = useT()
  const { setDetailCollapsed } = useStoreWithEqualityFn(
    useReposStore,
    branchDetailToolbarStoreActionsFromStore,
    branchDetailToolbarStoreActionsEqual,
  )
  const navigation = useMainWindowNavigation()
  const compact = useIsCompactUi()
  const activeDetailTab = detailTabForWorktree(repo.ui.detailTab, !!detail.branch?.worktree?.path)
  const terminalWorktreeKey = detail.branch?.worktree?.path
    ? worktreeTerminalKey(repo.id, detail.branch.worktree.path)
    : null

  const {
    createTerminal,
    selectTerminal,
    scrollToBottom,
    focusTerminal,
    closeTerminalAndDismissDetailIfLast,
    reorderSessions,
  } = useTerminalSessionContext()

  const worktreeSnapshot = useWorktreeTerminalSnapshot(terminalWorktreeKey)
  const terminalSessions = worktreeSnapshot.sessions
  const focusedTerminalSession = terminalSessions.find((session) => session.selected) ?? terminalSessions[0] ?? null
  const terminalTabFocusRegistry = useFocusRegistry<string, HTMLButtonElement>()

  const showTerminal = useCallback(() => {
    if (repo.ui.detailTab === 'terminal') return
    if (onShowTerminal) {
      onShowTerminal()
      return
    }
    navigation.showRepoDetailTab(repo.id, 'terminal')
  }, [navigation, onShowTerminal, repo.id, repo.ui.detailTab])

  const terminalBase = useMemo<TerminalSessionBase | null>(
    () =>
      detail.branch?.worktree?.path
        ? { repoRoot: repo.id, branch: detail.branch.name, worktreePath: detail.branch.worktree.path }
        : null,
    [repo.id, detail.branch],
  )

  const handleNewTerminal = useCallback(
    (launchMode: TerminalLaunchMode = 'native') => {
      if (!terminalBase) return
      showTerminal()
      setDetailCollapsed(false)
      void createTerminal(terminalBase, launchMode)
    },
    [createTerminal, terminalBase, setDetailCollapsed, showTerminal],
  )

  const handleSelectTerminal = useCallback(
    (worktreeKey: string, key: string) => {
      showTerminal()
      setDetailCollapsed(false)
      selectTerminal(worktreeKey, key)
    },
    [selectTerminal, setDetailCollapsed, showTerminal],
  )

  const handleScrollToBottom = useCallback(
    (key: string) => {
      showTerminal()
      setDetailCollapsed(false)
      scrollToBottom(key)
    },
    [scrollToBottom, setDetailCollapsed, showTerminal],
  )

  const handleCloseTerminal = useCallback(
    (key: string, options?: Parameters<typeof closeTerminalAndDismissDetailIfLast>[2]) => {
      if (!terminalBase) return
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

  // No selected branch means there is no tab/action target; BranchDetailContent renders the empty state.
  if (!detail.branch) return null

  function focusTerminalTab() {
    terminalTabFocusRegistry.focus(focusedTerminalSession?.key ?? EMPTY_TERMINAL_TAB_FOCUS_KEY)
  }

  const contextRail = detailFocusMode || terminalFocusMode || compactFocusPresentation
  // In the desktop left-right layout this toolbar is the right half of the
  // window's top edge, so its unused surface is a drag region without the
  // traffic-light padding owned by `.topbar`. Focus mode hides the sidebar,
  // making this toolbar the full native window chrome instead.
  return (
    <Toolbar
      variant="detail"
      chrome={compact ? 'toolbar' : 'topbar'}
      tone="topbar"
      className={cn('mobile-topbar-scroll', '[-webkit-app-region:drag]', contextRail && !compact && 'topbar')}
    >
      <div className="mobile-topbar-scroll-content flex h-full min-w-0 items-center gap-1 overflow-hidden">
        {/* Keep workspace and branch context reachable whenever the detail
         * toolbar is presented as the compact or desktop context rail. */}
        {contextRail && (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={compactFocusPresentation ? onShowCompactExplorer : onExitTerminalFocus}
              aria-label={t(compactFocusPresentation ? 'mobile.open-workspace' : 'terminal.exit-focus')}
              title={t(compactFocusPresentation ? 'mobile.open-workspace' : 'terminal.exit-focus')}
            >
              <PanelLeftOpen />
            </Button>
            <FocusProjectSwitcher repoId={repo.id} compact={compactFocusPresentation} />
            <WorkspaceRepositorySwitcher repoId={repo.id} compact={compactFocusPresentation} />
          </>
        )}
        {terminalWorktreeKey && (
          <TerminalTabs
            worktreeTerminalKey={terminalWorktreeKey}
            sessions={terminalSessions}
            detailId={detailId}
            responsiveCompact={compact}
            panelActive={activeDetailTab === 'terminal'}
            focusMode={contextRail}
            focusRegistry={terminalTabFocusRegistry}
            emptyFocusKey={EMPTY_TERMINAL_TAB_FOCUS_KEY}
            onNew={handleNewTerminal}
            onSelect={handleSelectTerminal}
            onScrollToBottom={handleScrollToBottom}
            onFocusTerminal={focusTerminal}
            onClose={handleCloseTerminal}
            onReorder={handleReorderTerminals}
            onNavigateOut={() => {
              showTerminal()
              setDetailCollapsed(false)
              focusTerminalTab()
            }}
          />
        )}
      </div>
      <div aria-hidden="true" className={cn('min-w-2 flex-1 self-stretch', compact && 'hidden')} />
    </Toolbar>
  )
}
