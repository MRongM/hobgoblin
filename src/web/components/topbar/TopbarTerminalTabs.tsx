// Terminal session tabs for the global topbar. Extracted from the detail
// toolbar wiring in BranchDetailToolbar: tabs always target the visible
// repo's selected worktree, and selecting/creating a session steers the
// detail pane to the terminal tab and un-collapses it so the session is
// actually visible.

import { useCallback, useId, useMemo } from 'react'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { useMainWindowNavigation } from '#/web/main-window-navigation.tsx'
import { detailTabForWorktree } from '#/web/lib/detail-tabs.ts'
import { worktreeTerminalKey } from '#/web/components/terminal/terminal-session-keys.ts'
import { useWorktreeTerminalSnapshot } from '#/web/components/terminal/terminal-session-store.ts'
import { useTerminalSessionContext } from '#/web/components/terminal/terminal-session-context.ts'
import { TerminalTabs } from '#/web/components/terminal/TerminalTabs.tsx'
import type { TerminalSessionBase } from '#/web/components/terminal/types.ts'
import type { DetailTab } from '#/web/stores/repos/types.ts'

interface Props {
  repoId: string
}

interface TopbarTerminalView {
  exists: boolean
  branchName: string | null
  worktreePath: string | null
  detailTab: DetailTab | null
}

export function TopbarTerminalTabs({ repoId }: Props) {
  const detailId = useId()
  const navigation = useMainWindowNavigation()
  const setDetailCollapsed = useReposStore((s) => s.setDetailCollapsed)
  const view = useStoreWithEqualityFn(
    useReposStore,
    (s): TopbarTerminalView => {
      const repo = s.repos[repoId]
      const selected = repo?.data.branches.find((branch) => branch.name === repo.ui.selectedBranch) ?? null
      return {
        exists: !!repo && repo.isGitRepo !== false,
        branchName: selected?.name ?? null,
        worktreePath: selected?.worktree?.path ?? null,
        detailTab: repo?.ui.detailTab ?? null,
      }
    },
    (a, b) =>
      a.exists === b.exists &&
      a.branchName === b.branchName &&
      a.worktreePath === b.worktreePath &&
      a.detailTab === b.detailTab,
  )

  const terminalWorktreeKey = view.exists && view.worktreePath ? worktreeTerminalKey(repoId, view.worktreePath) : null

  const {
    createTerminal,
    selectTerminal,
    scrollToBottom,
    focusTerminal,
    closeTerminalAndDismissDetailIfLast,
    reorderSessions,
  } = useTerminalSessionContext()
  const worktreeSnapshot = useWorktreeTerminalSnapshot(terminalWorktreeKey)

  const terminalBase = useMemo<TerminalSessionBase | null>(
    () =>
      view.branchName && view.worktreePath
        ? { repoRoot: repoId, branch: view.branchName, worktreePath: view.worktreePath }
        : null,
    [repoId, view.branchName, view.worktreePath],
  )

  const showDetailTerminal = useCallback(() => {
    if (view.detailTab !== 'terminal') {
      navigation.showRepoDetailTab(repoId, 'terminal')
    }
    setDetailCollapsed(false)
  }, [navigation, repoId, setDetailCollapsed, view.detailTab])

  const handleNew = useCallback(() => {
    if (!terminalBase) return
    showDetailTerminal()
    void createTerminal(terminalBase)
  }, [createTerminal, showDetailTerminal, terminalBase])

  const handleSelect = useCallback(
    (worktreeKey: string, key: string) => {
      showDetailTerminal()
      selectTerminal(worktreeKey, key)
    },
    [selectTerminal, showDetailTerminal],
  )

  const handleScrollToBottom = useCallback(
    (key: string) => {
      showDetailTerminal()
      scrollToBottom(key)
    },
    [scrollToBottom, showDetailTerminal],
  )

  const handleClose = useCallback(
    (key: string) => {
      if (!terminalBase) return
      closeTerminalAndDismissDetailIfLast(key, terminalBase)
    },
    [closeTerminalAndDismissDetailIfLast, terminalBase],
  )

  const handleReorder = useCallback(
    (worktreeKey: string, orderedKeys: string[]) => {
      void reorderSessions(worktreeKey, orderedKeys)
    },
    [reorderSessions],
  )

  if (!terminalWorktreeKey) return null

  const activeDetailTab = view.detailTab ? detailTabForWorktree(view.detailTab, true) : 'status'

  return (
    <div className="flex h-full min-w-0 flex-1 items-center gap-1 overflow-hidden">
      <TerminalTabs
        worktreeTerminalKey={terminalWorktreeKey}
        sessions={worktreeSnapshot.sessions}
        detailId={detailId}
        panelActive={activeDetailTab === 'terminal'}
        // Tabs sit at the very top of the window here, so session tooltips
        // must open downward (same placement focus mode uses).
        focusMode
        onNew={handleNew}
        onSelect={handleSelect}
        onScrollToBottom={handleScrollToBottom}
        onFocusTerminal={focusTerminal}
        onClose={handleClose}
        onReorder={handleReorder}
      />
    </div>
  )
}
