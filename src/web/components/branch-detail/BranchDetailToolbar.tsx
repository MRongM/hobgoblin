import { ArrowUp, Maximize2, Minimize2, Minus, QrCode } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { useReposStore } from '#/web/stores/repos/store.ts'
import type { RepoWorkspaceLayout } from '#/web/stores/repos/types.ts'
import { useT } from '#/web/stores/i18n.ts'
import { Button } from '#/web/components/ui/button.tsx'
import { Toolbar } from '#/web/components/Layout.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/web/components/ui/dialog.tsx'
import { detailTabForWorktree } from '#/web/lib/detail-tabs.ts'
import { cn } from '#/web/lib/cn.ts'
import { repoWorkspaceBehavior } from '#/web/lib/workspace-layout.ts'
import { buildTerminalDeepLinkUrl } from '#/web/lib/terminal-deep-link.ts'
import { qrCodeDataUrls } from '#/web/lib/qr-code-images.ts'
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
import { useLanInfoQuery } from '#/web/settings-queries.ts'
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
  layout: RepoWorkspaceLayout
}

export function BranchDetailToolbar({ repo, detail, detailId, contentId, collapsed, detailFocusMode, layout }: Props) {
  const t = useT()
  const [lanQrOpen, setLanQrOpen] = useState(false)
  const { setDetailCollapsed, toggleDetailCollapsed, toggleDetailFocusMode } = useStoreWithEqualityFn(
    useReposStore,
    branchDetailToolbarStoreActionsFromStore,
    branchDetailToolbarStoreActionsEqual,
  )
  const navigation = useMainWindowNavigation()
  const { shortcutsDisabled, toggleDetailOnActionBarBlankClick } = useRuntimeShortcutSettings()
  const compact = useIsCompactUi()
  const { data: lanInfo } = useLanInfoQuery()
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

  const focusedTerminalSession = terminalSessions.find((session) => session.selected) ?? terminalSessions[0] ?? null
  const terminalLanUrls = useMemo(() => {
    if (!detail.branch?.worktree?.path) return []
    return (lanInfo?.lanUrls ?? []).map((url) =>
      buildTerminalDeepLinkUrl(url, {
        repoId: repo.id,
        worktreePath: detail.branch!.worktree!.path,
        branch: detail.branch!.name,
        terminalId: focusedTerminalSession?.terminalId,
      }),
    )
  }, [detail.branch, focusedTerminalSession?.terminalId, lanInfo?.lanUrls, repo.id])

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
  const focusTogglePressed = behavior.detailFocusMode
  const showCollapseControl = behavior.detailCollapseAllowed && layout !== 'left-right'
  return (
    <Toolbar variant="detail">
      <div className="flex h-full min-w-0 items-center gap-1 overflow-hidden">
        {terminalWorktreeKey && (
          <TerminalTabs
            worktreeTerminalKey={terminalWorktreeKey}
            sessions={terminalSessions}
            detailId={detailId}
            responsiveCompact={compact}
            panelActive={activeDetailTab === 'terminal'}
            focusMode={detailFocusMode}
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
        {layout === 'top-bottom' && <div className="mx-1 h-4 w-px bg-separator/70" aria-hidden="true" />}
        {terminalWorktreeKey && (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLanQrOpen(true)}
              aria-label={t('terminal.lan-qr')}
              title={t('terminal.lan-qr-title')}
            >
              <QrCode />
            </Button>
            <TerminalLanQrDialog open={lanQrOpen} onOpenChange={setLanQrOpen} urls={terminalLanUrls} />
          </>
        )}
        {behavior.detailFocusAllowed && (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleDetailFocusMode}
            aria-label={t(focusTogglePressed ? 'branch-detail.exit-focus' : 'branch-detail.focus')}
            title={t(focusTogglePressed ? 'branch-detail.exit-focus-title' : 'branch-detail.focus-title')}
            aria-pressed={focusTogglePressed}
            className={cn(
              focusTogglePressed && 'bg-tab-active text-foreground shadow-xs hover:bg-tab-active hover:text-foreground',
            )}
          >
            {focusTogglePressed ? <Minimize2 /> : <Maximize2 />}
          </Button>
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

interface TerminalLanQrDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  urls: string[]
}

function TerminalLanQrDialog({ open, onOpenChange, urls }: TerminalLanQrDialogProps) {
  const t = useT()
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({})
  const urlKey = urls.join('\n')

  useEffect(() => {
    let cancelled = false
    if (!open || urls.length === 0) {
      setQrCodes({})
      return
    }
    void qrCodeDataUrls(urls).then((next) => {
      if (!cancelled) setQrCodes(next)
    })
    return () => {
      cancelled = true
    }
  }, [open, urlKey, urls])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('terminal.lan-qr-title')}</DialogTitle>
          <DialogDescription>
            {urls.length === 0 ? t('terminal.lan-qr-empty') : t('terminal.lan-qr-description')}
          </DialogDescription>
        </DialogHeader>
        {urls.length > 0 && (
          <div className="grid max-h-[70vh] grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2">
            {urls.map((url) => (
              <div key={url} className="flex min-w-0 flex-col items-center gap-2 rounded-md border bg-muted/20 p-3">
                {qrCodes[url] ? (
                  <img
                    data-testid="terminal-lan-qr-image"
                    src={qrCodes[url]}
                    alt={t('terminal.lan-qr-image-alt', { url })}
                    width={180}
                    height={180}
                    className="rounded border bg-white"
                  />
                ) : (
                  <div
                    data-testid="terminal-lan-qr-loading"
                    className="grid h-[180px] w-[180px] place-items-center rounded border bg-background text-xs text-muted-foreground"
                  >
                    {t('terminal.lan-qr-loading')}
                  </div>
                )}
                <code
                  data-testid="terminal-lan-qr-url"
                  className="w-full break-all rounded bg-background px-2 py-1 text-xs text-muted-foreground"
                >
                  {url}
                </code>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
