import { useSyncExternalStore } from 'react'
import { mainWindowQueryClient } from '#/web/main-window-queries.ts'
import { currentRuntimeSettingsSnapshot, readRuntimeChromeSettings } from '#/web/settings-read-projection.ts'
import {
  runSettingsControllerAction,
  setToolbarHeightPxPreference,
  setTopbarHeightPxPreference,
} from '#/web/settings-write-paths.ts'

type RuntimeChromeSettings = ReturnType<typeof readRuntimeChromeSettings>

let cachedChromeSettings: { key: string; value: RuntimeChromeSettings } | null = null

function currentRuntimeChromeSettings(): RuntimeChromeSettings {
  const value = readRuntimeChromeSettings(currentRuntimeSettingsSnapshot())
  const key = `${value.topbarHeightPx}:${value.toolbarHeightPx}`
  if (cachedChromeSettings?.key === key) return cachedChromeSettings.value
  cachedChromeSettings = { key, value }
  return value
}

function subscribeRuntimeChromeSettings(listener: () => void): () => void {
  return mainWindowQueryClient.getQueryCache().subscribe(listener)
}

export function useRuntimeChromeSettings() {
  return useSyncExternalStore(
    subscribeRuntimeChromeSettings,
    currentRuntimeChromeSettings,
    currentRuntimeChromeSettings,
  )
}

export function useChromeSettingsController() {
  return {
    async setTopbarHeightPx(heightPx: number): Promise<void> {
      await runSettingsControllerAction('topbar height update', async () => {
        await setTopbarHeightPxPreference(heightPx)
      })
    },
    async setToolbarHeightPx(heightPx: number): Promise<void> {
      await runSettingsControllerAction('toolbar height update', async () => {
        await setToolbarHeightPxPreference(heightPx)
      })
    },
  }
}
