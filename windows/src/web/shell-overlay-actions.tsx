// App-shell overlay actions shared with components that live deep inside the
// workspace tree (sidebar project list, status bar, empty state). The dialogs
// themselves are owned by App via useAppOverlays; this context only carries
// the "open" intents so intermediate layout components stay prop-free.

import { createContext, useContext } from 'react'

export interface ShellOverlayActions {
  openRepoPathDialog: () => void
  openWslRepoPathDialog: () => void
  openRemoteRepo: () => void
  openCloneRepo: () => void
  openSettings: () => void
  settingsOpen: boolean
}

const ShellOverlayActionsContext = createContext<ShellOverlayActions | null>(null)

export const ShellOverlayActionsProvider = ShellOverlayActionsContext.Provider

/** Null outside the app shell (e.g. component tests without a provider). */
export function useShellOverlayActions(): ShellOverlayActions | null {
  return useContext(ShellOverlayActionsContext)
}
