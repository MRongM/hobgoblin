import { ArrowUp, Minus, PanelLeftOpen } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { useReposStore } from '#/web/stores/repos/store.ts'
import type { RepoWorkspaceLayout } from '#/web/stores/repos/types.ts'
import { useT } from '#/web/stores/i18n.ts'
import { Button } from '#/web/components/ui/button.tsx'
import { Toolbar } from '#/web/components/Layout.tsx'
import { detailTabForWorktree } from '#/web/lib/detail-tabs.ts'
import { cn } from '#/web/lib/cn.ts'
import { repoWorkspaceBehavior } from '#/web/lib/workspace-layout.ts'
import { worktreeTerminalKey } from '#/web/components/terminal/terminal-session-keys.ts'
import { useWorktreeTerminalSnapshot } from '#/web/components/terminal/terminal-session-store.ts'
import { useTerminalSessionContext } from '#/web/components/terminal/terminal-session-context.ts'
import { EMPTY_TERMINAL_TAB_FOCUS_KEY, TerminalTabs } from '#/web/components/terminal/TerminalTabs.tsx'
import { useMainWindowNavigation } from '#/web/main-window-navigation.tsx'
import type { TerminalSessionBase } from '#/web/components/terminal/types.ts'
import type { BranchDetailRepo, SelectedBranchDetailPresentation } from '#/web/components/branch-detail/model.ts'
import { useRuntimeShortcutSettings } from '#/web/runtime-settings-shortcuts.ts'
import { useIsCompactUi } from '#/web/hooks/useResponsiveUiMode.tsx'
import { useFocusRegistry } from '#/web/components/tab-strip/useFocusRegistry.ts'
import { TopbarRepoControls } from '#/web/components/topbar/TopbarRepoControls.tsx'
import { FocusProjectSwitcher } from '#/web/components/repo-workspace/FocusProjectSwitcher.tsx'
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
  compactFocusPresentation?: boolean
  layout: RepoWorkspaceLayout
  onShowCompactExplorer?: () => void
}

export function BranchDetailToolbar({
  repo,
  detail,
  detailId,
  contentId,
  collapsed,
  detailFocusMode,
  compactFocusPresentation = false,
  layout,
  onShowCompactExplorer,
}: Props) {
  const t = useT()
  const { setDetailCollapsed, toggleDetailCollapsed, toggleDetailFocusMode } = useStoreWithEqualityFn(
    useReposStore,
    branchDetailToolbarStoreActionsFromStore,
    branchDetailToolbarStoreActionsEqual,
  )
  const navigation = useMainWindowNavigation()
  const { shortcutsDisabled, toggleDetailOnActionBarBlankClick } = useRuntimeShortcutSettings()
  const compact = useIsCompactUi()
  const behavior = repoWorkspaceBehavior(layout, collapsed, detailFocusMode)
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

  const terminalBase = useMemo<TerminalSessionBase | null>(
    () =>
      detail.branch?.worktree?.path
        ? { repoRoot: repo.id, branch: detail.branch.name, worktreePath: detail.branch.worktree.path }
        : null,
    [repo.id, detail.branch],
  )

  const handleNewTerminal = useCallback(() => {
    if (!terminalBase) return
    if (repo.ui.detailTab !== 'terminal') {
      navigation.showRepoDetailTab(repo.id, 'terminal')
    }
    setDetailCollapsed(false)
    void createTerminal(terminalBase)
  }, [createTerminal, terminalBase, navigation, repo.id, repo.ui.detailTab, setDetailCollapsed])

  const handleSelectTerminal = useCallback(
    (worktreeKey: string, key: string) => {
      if (repo.ui.detailTab !== 'terminal') {
        navigation.showRepoDetailTab(repo.id, 'terminal')
      }
      setDetailCollapsed(false)
      selectTerminal(worktreeKey, key)
    },
    [repo.ui.detailTab, repo.id, navigation, selectTerminal, setDetailCollapsed],
  )

  const handleScrollToBottom = useCallback(
    (key: string) => {
      if (repo.ui.detailTab !== 'terminal') {
        navigation.showRepoDetailTab(repo.id, 'terminal')
      }
      setDetailCollapsed(false)
      scrollToBottom(key)
    },
    [repo.ui.detailTab, repo.id, navigation, scrollToBottom, setDetailCollapsed],
  )

  const handleCloseTerminal = useCallback(
    (key: string) => {
      if (!terminalBase) return
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

  // No selected branch means there is no tab/action target; BranchDetailContent renders the empty state.
  if (!detail.branch) return null

  function focusTerminalTab() {
    terminalTabFocusRegistry.focus(focusedTerminalSession?.key ?? EMPTY_TERMINAL_TAB_FOCUS_KEY)
  }

  const detailToggleTitle = t(
    shortcutsDisabled
      ? collapsed
        ? 'branch-detail.expand'
        : 'branch-detail.collapse'
      : collapsed
        ? 'branch-detail.expand-title'
        : 'branch-detail.collapse-title',
  )
  const showCollapseControl =
    !compactFocusPresentation && behavior.detailCollapseAllowed && layout !== 'left-right'
  const contextRail = behavior.mode === 'focus' || compactFocusPresentation
  // In the desktop left-right layout this toolbar is the right half of the
  // window's top edge, so its unused surface is a drag region without the
  // traffic-light padding owned by `.topbar`. Focus mode hides the sidebar,
  // making this toolbar the full native window chrome instead.
  const isWindowChrome = behavior.mode === 'focus'
  return (
    <Toolbar
      variant="detail"
      chrome={compact ? 'toolbar' : 'topbar'}
      className={cn(layout === 'left-right' && '[-webkit-app-region:drag]', isWindowChrome && 'topbar')}
    >
      <div className="flex h-full min-w-0 items-center gap-1 overflow-hidden">
        {/* Keep workspace and branch context reachable whenever the detail
         * toolbar is presented as the compact or desktop context rail. */}
        {contextRail && (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={compactFocusPresentation ? onShowCompactExplorer : toggleDetailFocusMode}
              aria-label={t(compactFocusPresentation ? 'mobile.open-workspace' : 'branch-detail.exit-focus')}
              title={t(compactFocusPresentation ? 'mobile.open-workspace' : 'branch-detail.exit-focus-title')}
            >
              <PanelLeftOpen />
            </Button>
            <FocusProjectSwitcher repoId={repo.id} compact={compactFocusPresentation} />
            {/* Branch switcher / actions — previously topbar content. */}
            <TopbarRepoControls
              repoId={repo.id}
              menuAlign="start"
              focusPresentation={contextRail}
              tone={compactFocusPresentation ? 'toolbar' : 'topbar'}
            />
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
              if (repo.ui.detailTab !== 'terminal') {
                navigation.showRepoDetailTab(repo.id, 'terminal')
              }
              setDetailCollapsed(false)
              focusTerminalTab()
            }}
          />
        )}
      </div>
      <div
        aria-hidden="true"
        className={cn('min-w-2 flex-1 self-stretch', compact && 'hidden')}
        onClick={
          behavior.detailCollapseAllowed && toggleDetailOnActionBarBlankClick ? toggleDetailCollapsed : undefined
        }
      />
      <div className="flex shrink-0 items-center gap-1">
        {!compactFocusPresentation && layout === 'top-bottom' && (
          <div className="mx-1 h-4 w-px bg-separator/70" aria-hidden="true" />
        )}
        {showCollapseControl && (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleDetailCollapsed}
            aria-label={t(collapsed ? 'branch-detail.expand' : 'branch-detail.collapse')}
            title={detailToggleTitle}
            aria-expanded={!collapsed}
            aria-controls={collapsed ? undefined : contentId}
          >
            {collapsed ? <ArrowUp /> : <Minus />}
          </Button>
        )}
      </div>
    </Toolbar>
  )
}
