import { useCallback, useMemo, useState } from 'react'
import { useOverlayRegistry } from '#/web/hooks/useOverlayRegistry.ts'
import type { OpenRepositorySource } from '#/web/lib/open-repo-dialog.ts'
export const APP_OVERLAY_KEYS = ['clone', 'openRepo', 'openRemoteRepo'] as const
export type AppOverlayKey = (typeof APP_OVERLAY_KEYS)[number]

interface AppOverlayRouteOptions {
  routeOverlay?: AppOverlayKey | null
  onRouteOverlayChange?: (overlay: AppOverlayKey | null) => void
}

export function useAppOverlays(options: AppOverlayRouteOptions = {}) {
  // App-level orchestration layer: compose the generic open/close registry with
  // any overlay-specific payload (such as settingsPage). New app overlays
  // should usually be wired here rather than expanding useOverlayRegistry.
  const registry = useOverlayRegistry<AppOverlayKey>(APP_OVERLAY_KEYS)
  const { anyOpen, closeAll, open, setOpen, state: openByKey } = registry
  const routeOverlay = options.routeOverlay ?? null
  const routeDriven = typeof options.onRouteOverlayChange === 'function'
  const [openRepoSource, setOpenRepoSource] = useState<OpenRepositorySource>('local')

  const openCloneRepo = useCallback(() => {
    if (routeDriven) {
      options.onRouteOverlayChange?.('clone')
      return
    }
    open('clone')
  }, [open, options, routeDriven])

  const setCloneOpen = useCallback(
    (open: boolean) => {
      if (routeDriven) {
        options.onRouteOverlayChange?.(open ? 'clone' : routeOverlay === 'clone' ? null : routeOverlay)
        return
      }
      setOpen('clone', open)
    },
    [options, routeDriven, routeOverlay, setOpen],
  )

  const openRepoDialog = useCallback(
    (source: OpenRepositorySource) => {
      setOpenRepoSource(source)
      if (routeDriven) {
        options.onRouteOverlayChange?.('openRepo')
        return
      }
      open('openRepo')
    },
    [open, options, routeDriven],
  )

  const openRepoPathDialog = useCallback(() => {
    openRepoDialog('local')
  }, [openRepoDialog])

  const openWslRepoPathDialog = useCallback(() => {
    openRepoDialog('wsl')
  }, [openRepoDialog])

  const setOpenRepoOpen = useCallback(
    (open: boolean) => {
      if (!open) setOpenRepoSource('local')
      if (routeDriven) {
        options.onRouteOverlayChange?.(open ? 'openRepo' : routeOverlay === 'openRepo' ? null : routeOverlay)
        return
      }
      setOpen('openRepo', open)
    },
    [options, routeDriven, routeOverlay, setOpen],
  )

  const openRemoteRepo = useCallback(() => {
    if (routeDriven) {
      options.onRouteOverlayChange?.('openRemoteRepo')
      return
    }
    open('openRemoteRepo')
  }, [open, options, routeDriven])

  const setOpenRemoteRepoOpen = useCallback(
    (open: boolean) => {
      if (routeDriven) {
        options.onRouteOverlayChange?.(
          open ? 'openRemoteRepo' : routeOverlay === 'openRemoteRepo' ? null : routeOverlay,
        )
        return
      }
      setOpen('openRemoteRepo', open)
    },
    [options, routeDriven, routeOverlay, setOpen],
  )

  const closeAllOverlays = useCallback(() => {
    setOpenRepoSource('local')
    if (routeDriven) {
      options.onRouteOverlayChange?.(null)
      return
    }
    closeAll()
  }, [closeAll, options, routeDriven])

  const state = useMemo(
    () => ({
      clone: { open: routeDriven ? routeOverlay === 'clone' : openByKey.clone },
      openRepo: { open: routeDriven ? routeOverlay === 'openRepo' : openByKey.openRepo, source: openRepoSource },
      openRemoteRepo: { open: routeDriven ? routeOverlay === 'openRemoteRepo' : openByKey.openRemoteRepo },
    }),
    [openByKey.clone, openByKey.openRepo, openByKey.openRemoteRepo, openRepoSource, routeDriven, routeOverlay],
  )

  return {
    state,
    anyOpen: routeDriven ? routeOverlay !== null : anyOpen,
    openCloneRepo,
    setCloneOpen,
    openRepoPathDialog,
    openWslRepoPathDialog,
    setOpenRepoOpen,
    openRemoteRepo,
    setOpenRemoteRepoOpen,
    closeAllOverlays,
  }
}
