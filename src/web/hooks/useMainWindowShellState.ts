import { useCallback, useMemo, useState } from 'react'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { createMainWindowNavigationActions } from '#/web/main-window-navigation-actions.ts'
import { useAppOverlays } from '#/web/hooks/useAppOverlays.ts'
import { useResponsiveUiMode } from '#/web/hooks/useResponsiveUiMode.tsx'
import { repoWorkspaceBehavior } from '#/web/lib/workspace-layout.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import {
  mainWindowNavigationStoreActionsEqual,
  mainWindowNavigationStoreActionsFromStore,
} from '#/web/stores/repos/selector-actions.ts'
import { mainWindowWorkspaceStateEqual, mainWindowWorkspaceStateFromStore } from '#/web/stores/repos/selector-state.ts'
import type { SettingsPage } from '#/shared/settings-pages.ts'

interface UseMainWindowShellStateOptions {
  routeSettingsPage?: SettingsPage | null
  onRouteSettingsPageChange?: (page: SettingsPage | null) => void
}

export function useMainWindowShellState({
  routeSettingsPage = null,
  onRouteSettingsPageChange,
}: UseMainWindowShellStateOptions) {
  const uiMode = useResponsiveUiMode()
  const [closeRepoCandidateId, setCloseRepoCandidateId] = useState<string | null>(null)
  const { activeId, sessionReady, detailCollapsed, detailFocusMode, workspaceLayout, order } = useStoreWithEqualityFn(
    useReposStore,
    mainWindowWorkspaceStateFromStore,
    mainWindowWorkspaceStateEqual,
  )
  const closeRepoCandidateName = useReposStore((s) =>
    closeRepoCandidateId ? (s.repos[closeRepoCandidateId]?.name ?? closeRepoCandidateId) : '',
  )
  const { setActive, closeRepo, cycleActive, selectBranch, setDetailTab } = useStoreWithEqualityFn(
    useReposStore,
    mainWindowNavigationStoreActionsFromStore,
    mainWindowNavigationStoreActionsEqual,
  )
  const overlays = useAppOverlays()
  const workspaceBehavior = repoWorkspaceBehavior(workspaceLayout, detailCollapsed, detailFocusMode)
  const visibleRepoId = activeId
  const settingsOpen = routeSettingsPage !== null
  const closeRepoConfirmationOpen = closeRepoCandidateId !== null
  const modalOpen = overlays.anyOpen || closeRepoConfirmationOpen
  const workspaceShortcutsSuppressed = modalOpen || settingsOpen
  const requestCloseRepo = useCallback((repoId: string) => {
    setCloseRepoCandidateId(repoId)
  }, [])
  const cancelCloseRepo = useCallback(() => {
    setCloseRepoCandidateId(null)
  }, [])
  const confirmCloseRepo = useCallback(() => {
    if (!closeRepoCandidateId) return
    closeRepo(closeRepoCandidateId)
    setCloseRepoCandidateId(null)
  }, [closeRepo, closeRepoCandidateId])
  const openSettings = useCallback(
    (page: SettingsPage = 'general') => {
      onRouteSettingsPageChange?.(page)
    },
    [onRouteSettingsPageChange],
  )
  const showHelp = useCallback(() => {
    openSettings('shortcuts')
  }, [openSettings])
  const exitSettings = useCallback(() => {
    onRouteSettingsPageChange?.(null)
  }, [onRouteSettingsPageChange])
  const navigation = useMemo(
    () =>
      createMainWindowNavigationActions({
        activeId,
        order,
        setActive,
        closeRepo: requestCloseRepo,
        cycleActive,
        selectBranch,
        setDetailTab,
        onOpenSettings: openSettings,
      }),
    [
      activeId,
      cycleActive,
      openSettings,
      order,
      requestCloseRepo,
      selectBranch,
      setActive,
      setDetailTab,
    ],
  )
  const closeRepoConfirmation = useMemo(
    () => ({
      open: closeRepoConfirmationOpen,
      repoId: closeRepoCandidateId,
      repoName: closeRepoCandidateName,
      cancel: cancelCloseRepo,
      confirm: confirmCloseRepo,
    }),
    [
      cancelCloseRepo,
      closeRepoCandidateId,
      closeRepoCandidateName,
      closeRepoConfirmationOpen,
      confirmCloseRepo,
    ],
  )

  return {
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
  }
}
