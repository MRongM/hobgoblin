// Root layout. Desktop shell is a pure left-right split while a repo is
// open — no global topbar and no full-width bottom bar:
//   left column:  sidebar (project header = window drag region + collapse,
//                 branches, files) with the StatusBar at its bottom
//   right column: detail pane at full window height, its toolbar carrying
//                 the terminal tabs at the window's top edge
// Compact UI keeps the classic Topbar with the RepoTabs strip; desktop
// shows a plain Topbar (drag region + wordmark) plus a full-width
// StatusBar only when no repo is open.
//
// Boots in this order:
//   1. theme.hydrate()       — reads server-backed theme settings
//   2. sessionRestore.hydrate() — saved restorable session snapshot
//   3. repos.hydrateSession  — re-opens the repos that were open last run
//
// After hydration, side-effects run for the lifetime of the app:
//   - background sync registration with the embedded server scheduler
//   - session persistence (any change to open repos / active id writes
//     through to the embedded server so the next launch can restore)
//   - renderer effect-intent listeners (menu actions / native attention events)
//   - settings write-error toast (warns the user if prefs aren't
//     persisting instead of silently dropping their changes)

import { useMemo } from 'react'
import { Settings } from 'lucide-react'
import { Toaster } from '#/web/components/ui/sonner.tsx'
import { Tip } from '#/web/components/Tip.tsx'
import { Topbar } from '#/web/components/Topbar.tsx'
import { TopbarRepoControls } from '#/web/components/topbar/TopbarRepoControls.tsx'
import { ProjectThemeMenuConnected } from '#/web/components/repo-toolbar/ProjectThemeMenu.tsx'
import { StatusBar } from '#/web/components/StatusBar.tsx'
import { Logo } from '#/web/components/Logo.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { ErrorBoundary } from '#/web/components/ErrorBoundary.tsx'
import { RepoTabs } from '#/web/components/RepoTabs.tsx'
import { RepoCloneDialog } from '#/web/components/RepoCloneDialog.tsx'
import { RepoOpenDialog } from '#/web/components/RepoOpenDialog.tsx'
import { OpenRemoteRepositoryDialog } from '#/web/components/OpenRemoteRepositoryDialog.tsx'
import { SettingsPageScreen } from '#/web/components/SettingsPageScreen.tsx'
import { ConfirmDialog } from '#/web/components/ConfirmDialog.tsx'
import { RepoView } from '#/web/components/RepoView.tsx'
import { RepoWorkspaceSkeleton } from '#/web/components/Skeleton.tsx'
import { EffectiveProjectThemeBridge } from '#/web/components/EffectiveProjectThemeBridge.tsx'
import { RepoDropOverlay } from '#/web/components/RepoDropOverlay.tsx'
import { TerminalSessionProvider } from '#/web/components/terminal/TerminalSessionProvider.tsx'
import { TerminalDeepLinkConsumer } from '#/web/components/terminal/TerminalDeepLinkConsumer.tsx'
import { InlineCommitDraftProvider } from '#/web/components/branch-list/InlineCommitDraftProvider.tsx'
import { useT } from '#/web/stores/i18n.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { openRepoFromDialog } from '#/web/lib/open-repo-dialog.ts'
import { ShellOverlayActionsProvider, useShellOverlayActions } from '#/web/shell-overlay-actions.tsx'
import { useKeyboard } from '#/web/hooks/useKeyboard.ts'
import { useMainWindowShellState } from '#/web/hooks/useMainWindowShellState.ts'
import { useRepoDrop } from '#/web/hooks/useRepoDrop.ts'
import { useAppBootstrap } from '#/web/hooks/useAppBootstrap.ts'
import { useBackgroundFetch } from '#/web/hooks/useBackgroundFetch.ts'
import { useHeuristicRepoStatusRefresh } from '#/web/hooks/useHeuristicRepoStatusRefresh.ts'
import { useRendererEffectIntentRouter } from '#/web/hooks/useRendererEffectIntentRouter.ts'
import { useSessionPersistence } from '#/web/hooks/useSessionPersistence.ts'
import { useSettingsWriteErrorToast } from '#/web/hooks/useSettingsWriteErrorToast.ts'
import { useRepoStoreInvalidationRefresh } from '#/web/hooks/useRepoStoreInvalidationRefresh.ts'
import { useSettingsQueryInvalidationSync } from '#/web/settings-queries.ts'
import { MainWindowNavigationProvider, useMainWindowNavigation } from '#/web/main-window-navigation.tsx'
import { useResponsiveUiMode } from '#/web/hooks/useResponsiveUiMode.tsx'
import type { RepoWorkspaceMode } from '#/web/lib/workspace-layout.ts'
import type { SettingsPage } from '#/shared/settings-pages.ts'

interface AppProps {
  routeSettingsPage?: SettingsPage | null
  onRouteSettingsPageChange?: (page: SettingsPage | null) => void
}

export function App({ routeSettingsPage = null, onRouteSettingsPageChange }: AppProps) {
  const {
    overlays,
    closeRepoConfirmation,
    sessionReady,
    visibleRepoId,
    workspaceLayout,
    workspaceBehavior,
    settingsOpen,
    modalOpen,
    workspaceShortcutsSuppressed,
    openSettings,
    showHelp,
    exitSettings,
    navigation,
  } = useMainWindowShellState({
    routeSettingsPage,
    onRouteSettingsPageChange,
  })
  // Shared gate: any modal overlay suppresses both
  // keyboard shortcuts and the file-drop dashed border.
  const repoDrop = useRepoDrop({ blocked: modalOpen })

  useAppBootstrap()
  useSessionPersistence()
  useSettingsWriteErrorToast()
  useBackgroundFetch()
  useHeuristicRepoStatusRefresh()
  useRepoStoreInvalidationRefresh()
  useSettingsQueryInvalidationSync()
  useRendererEffectIntentRouter({
    navigation,
    currentRepoId: visibleRepoId,
    closeAllOverlays: overlays.closeAllOverlays,
    openRepoPathDialog: overlays.openRepoPathDialog,
    openCloneRepo: overlays.openCloneRepo,
    openRemoteRepo: overlays.openRemoteRepo,
    isOverlayOpen: () => modalOpen,
    isWorkspaceShortcutSuppressed: () => workspaceShortcutsSuppressed,
  })

  useKeyboard({
    navigation,
    currentRepoId: visibleRepoId,
    onShowHelp: showHelp,
    isWorkspaceShortcutSuppressed: () => workspaceShortcutsSuppressed,
    isSettingsOpen: () => settingsOpen,
    onExitSettings: exitSettings,
  })

  const shellOverlayActions = useMemo(
    () => ({
      openRepoPathDialog: overlays.openRepoPathDialog,
      openRemoteRepo: overlays.openRemoteRepo,
      openCloneRepo: overlays.openCloneRepo,
      openSettings: () => openSettings(),
    }),
    [overlays.openRepoPathDialog, overlays.openRemoteRepo, overlays.openCloneRepo, openSettings],
  )

  return (
    <ErrorBoundary>
      <EffectiveProjectThemeBridge />
      <TerminalSessionProvider currentRepoId={visibleRepoId}>
        <TerminalDeepLinkConsumer sessionReady={sessionReady} navigation={navigation} />
        <InlineCommitDraftProvider>
          <MainWindowNavigationProvider value={navigation}>
            <ShellOverlayActionsProvider value={shellOverlayActions}>
              <MainWindowViewport
                routeSettingsPage={routeSettingsPage}
                onRouteSettingsPageChange={onRouteSettingsPageChange}
                openSettings={openSettings}
                visibleRepoId={visibleRepoId}
                sessionReady={sessionReady}
                workspaceLayout={workspaceLayout}
                workspaceMode={workspaceBehavior.mode}
                detailCollapsed={workspaceBehavior.detailCollapsed}
                detailFocusMode={workspaceBehavior.detailFocusMode}
                overlays={overlays}
                closeRepoConfirmation={closeRepoConfirmation}
                repoDrop={repoDrop}
              />
            </ShellOverlayActionsProvider>
          </MainWindowNavigationProvider>
        </InlineCommitDraftProvider>
      </TerminalSessionProvider>
    </ErrorBoundary>
  )
}

interface MainWindowViewportProps {
  routeSettingsPage: SettingsPage | null
  onRouteSettingsPageChange?: (page: SettingsPage | null) => void
  openSettings: (page?: SettingsPage) => void
  visibleRepoId: string | null
  sessionReady: boolean
  workspaceLayout: 'top-bottom' | 'left-right'
  workspaceMode: RepoWorkspaceMode
  detailCollapsed: boolean
  detailFocusMode: boolean
  overlays: ReturnType<typeof useMainWindowShellState>['overlays']
  closeRepoConfirmation: ReturnType<typeof useMainWindowShellState>['closeRepoConfirmation']
  repoDrop: ReturnType<typeof useRepoDrop>
}

interface MainWindowViewportContentProps {
  routeSettingsPage: SettingsPage | null
  onRouteSettingsPageChange?: (page: SettingsPage | null) => void
  openSettings: (page?: SettingsPage) => void
  visibleRepoId: string | null
  sessionReady: boolean
  workspaceLayout: 'top-bottom' | 'left-right'
  workspaceMode: RepoWorkspaceMode
  detailCollapsed: boolean
  detailFocusMode: boolean
  overlays: ReturnType<typeof useMainWindowShellState>['overlays']
}

interface MainWindowOverlaysProps {
  overlays: ReturnType<typeof useMainWindowShellState>['overlays']
  closeRepoConfirmation: ReturnType<typeof useMainWindowShellState>['closeRepoConfirmation']
  repoDrop: ReturnType<typeof useRepoDrop>
}

function MainWindowViewport({
  routeSettingsPage,
  onRouteSettingsPageChange,
  openSettings,
  visibleRepoId,
  sessionReady,
  workspaceLayout,
  workspaceMode,
  detailCollapsed,
  detailFocusMode,
  overlays,
  closeRepoConfirmation,
  repoDrop,
}: MainWindowViewportProps) {
  return (
    // Outer ErrorBoundary catches crashes in Topbar/Sidebar — without
    // this, a corrupt settings.json or rendering bug elsewhere blanks
    // the entire window. The inner ErrorBoundary around RepoView still
    // exists so a tab-specific crash doesn't take down the rest of the
    // app.
    <div
      className="relative flex h-full flex-col"
      onDragEnter={repoDrop.onDragEnter}
      onDragOver={repoDrop.onDragOver}
      onDragLeave={repoDrop.onDragLeave}
      onDrop={repoDrop.onDrop}
    >
      <MainWindowViewportContent
        routeSettingsPage={routeSettingsPage}
        onRouteSettingsPageChange={onRouteSettingsPageChange}
        openSettings={openSettings}
        visibleRepoId={visibleRepoId}
        sessionReady={sessionReady}
        workspaceLayout={workspaceLayout}
        workspaceMode={workspaceMode}
        detailCollapsed={detailCollapsed}
        detailFocusMode={detailFocusMode}
        overlays={overlays}
      />
      <MainWindowOverlays overlays={overlays} closeRepoConfirmation={closeRepoConfirmation} repoDrop={repoDrop} />
    </div>
  )
}

function MainWindowViewportContent({
  routeSettingsPage,
  onRouteSettingsPageChange,
  openSettings,
  visibleRepoId,
  sessionReady,
  workspaceLayout,
  workspaceMode,
  detailCollapsed,
  detailFocusMode,
  overlays,
}: MainWindowViewportContentProps) {
  const uiMode = useResponsiveUiMode()
  const visibleRepoUnavailable = useReposStore((state) =>
    visibleRepoId ? state.repos[visibleRepoId]?.availability.phase === 'unavailable' : false,
  )
  if (routeSettingsPage) {
    return (
      <SettingsPageScreen
        page={routeSettingsPage}
        onBack={() => onRouteSettingsPageChange?.(null)}
        onPageChange={(page) => onRouteSettingsPageChange?.(page)}
      />
    )
  }
  const compact = uiMode === 'compact'
  // Desktop has no global topbar while a repo is open — the sidebar's
  // project header and the detail toolbar form the window's top edge.
  // It comes back as a plain chrome strip (drag region + wordmark) when
  // nothing is open. Compact UI keeps the classic repo tab strip except
  // in focus mode, where the detail pane takes the whole viewport. Same
  // rules for web and Electron so both shells look identical.
  const showGlobalTopbar = compact ? workspaceMode !== 'focus' || visibleRepoUnavailable : !visibleRepoId
  return (
    <>
      {showGlobalTopbar && (
        <Topbar
          actions={
            // Compact UI never shows the status bar, so the ambient controls
            // it hosts on desktop (project theme menu, settings entry) live
            // here instead.
            compact ? (
              <>
                {visibleRepoId && <TopbarRepoControls repoId={visibleRepoId} />}
                {visibleRepoId && <ProjectThemeMenuConnected repoId={visibleRepoId} />}
                <CompactSettingsButton onOpenSettings={() => openSettings()} />
              </>
            ) : null
          }
        >
          {compact ? (
            <RepoTabs
              currentRepoId={visibleRepoId}
              onOpenRepoPathDialog={overlays.openRepoPathDialog}
              onOpenRemote={overlays.openRemoteRepo}
              onClone={overlays.openCloneRepo}
            />
          ) : (
            <Logo className="shrink-0 text-topbar-foreground" />
          )}
        </Topbar>
      )}
      <main className="flex flex-1 min-h-0 min-w-0">
        <ErrorBoundary resetKey={visibleRepoId}>
          {visibleRepoId ? (
            <RepoView repoId={visibleRepoId} />
          ) : !sessionReady ? (
            <RepoWorkspaceSkeleton
              layout={workspaceLayout}
              detailCollapsed={detailCollapsed}
              detailFocusMode={detailFocusMode}
              compact={compact}
            />
          ) : (
            <EmptyState />
          )}
        </ErrorBoundary>
      </main>
      {/* With a repo open the status bar lives at the bottom of the sidebar
       * (inside RepoView) so the terminal pane owns the window's full
       * height; the empty state keeps a full-width one for the settings
       * entry. */}
      {!compact && !visibleRepoId && <StatusBar repoId={null} />}
    </>
  )
}

function MainWindowOverlays({ overlays, closeRepoConfirmation, repoDrop }: MainWindowOverlaysProps) {
  const t = useT()
  return (
    <>
      <RepoOpenDialog open={overlays.state.openRepo.open} onOpenChange={overlays.setOpenRepoOpen} />
      <RepoCloneDialog open={overlays.state.clone.open} onOpenChange={overlays.setCloneOpen} />
      <OpenRemoteRepositoryDialog
        open={overlays.state.openRemoteRepo.open}
        onOpenChange={overlays.setOpenRemoteRepoOpen}
      />
      <ConfirmDialog
        open={closeRepoConfirmation.open}
        title={t('repo-tabs.close-confirm-title')}
        message={t('repo-tabs.close-confirm-body', { name: closeRepoConfirmation.repoName })}
        confirmLabel={t('repo-tabs.close-confirm-confirm')}
        destructive
        onCancel={closeRepoConfirmation.cancel}
        onConfirm={closeRepoConfirmation.confirm}
      />
      <RepoDropOverlay active={repoDrop.active} />
      {/* shadcn/ui Toaster wrapper — owns its own theme + style hooks.
       * App-level only sets position + closeButton; the rest of the
       * visual contract is in components/ui/sonner.tsx. */}
      <Toaster position="bottom-right" closeButton />
    </>
  )
}

function CompactSettingsButton({ onOpenSettings }: { onOpenSettings: () => void }) {
  const t = useT()
  return (
    <Tip label={t('topbar.settings')}>
      <Button variant="ghost" size="icon" onClick={onOpenSettings} aria-label={t('topbar.settings')}>
        <Settings />
      </Button>
    </Tip>
  )
}

function EmptyState() {
  const t = useT()
  // With the repo tab strip gone from the desktop topbar, the empty state
  // is the only visible home for the open actions, so it renders them as
  // real buttons instead of pointing at chrome that no longer exists.
  const shellActions = useShellOverlayActions()
  const navigation = useMainWindowNavigation()
  const ensureWorkspaceOpen = useReposStore((s) => s.ensureWorkspaceOpen)

  async function handleOpenLocal() {
    if (!shellActions) return
    await openRepoFromDialog({
      ensureWorkspaceOpen,
      activateRepo: navigation.activateRepo,
      openRepoPathDialog: shellActions.openRepoPathDialog,
      t,
    })
  }

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center max-w-sm">
        <div className="text-sm font-medium text-foreground mb-1">{t('empty.title')}</div>
        <div className="text-xs text-muted-foreground leading-relaxed">{t('empty.body')}</div>
        {shellActions && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void handleOpenLocal()}>
              {t('repo-tabs.open-local')}
            </Button>
            <Button variant="outline" size="sm" onClick={shellActions.openRemoteRepo}>
              {t('repo-tabs.open-remote')}
            </Button>
            <Button variant="outline" size="sm" onClick={shellActions.openCloneRepo}>
              {t('repo-tabs.clone')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
