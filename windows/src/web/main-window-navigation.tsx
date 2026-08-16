import { createContext, useContext, useMemo } from 'react'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { useReposStore } from '#/web/stores/repos/store.ts'
import {
  createMainWindowNavigationActions,
  type MainWindowNavigationActions,
} from '#/web/main-window-navigation-actions.ts'
import {
  mainWindowNavigationStoreActionsEqual,
  mainWindowNavigationStoreActionsFromStore,
} from '#/web/stores/repos/selector-actions.ts'
export type { MainWindowNavigationActions } from '#/web/main-window-navigation-actions.ts'

const MainWindowNavigationContext = createContext<MainWindowNavigationActions | null>(null)

export const MainWindowNavigationProvider = MainWindowNavigationContext.Provider

export function useMainWindowNavigation(): MainWindowNavigationActions {
  const context = useContext(MainWindowNavigationContext)
  const activeId = useReposStore((state) => state.activeId)
  const { setActive, activateProject, closeRepo, cycleActive, selectBranch, setDetailTab } = useStoreWithEqualityFn(
    useReposStore,
    mainWindowNavigationStoreActionsFromStore,
    mainWindowNavigationStoreActionsEqual,
  )
  const fallbackNavigation = useMemo(
    () =>
      createMainWindowNavigationActions({
        activeId,
        setActive,
        activateProject,
        closeRepo,
        cycleActive,
        selectBranch,
        setDetailTab,
      }),
    [activeId, activateProject, closeRepo, cycleActive, selectBranch, setActive, setDetailTab],
  )

  return context ?? fallbackNavigation
}
