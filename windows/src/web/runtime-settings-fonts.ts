import { readRuntimeFontSettings, useRuntimeSettingsSnapshot } from '#/web/settings-read-projection.ts'
import type { FontFamilyPref } from '#/shared/rpc.ts'
import {
  runSettingsControllerAction,
  setFontFamilyPreference,
  setFileTreeFontSizePreference,
  setTerminalFontSizePreference,
} from '#/web/settings-write-paths.ts'

export function useRuntimeFontSettings() {
  return readRuntimeFontSettings(useRuntimeSettingsSnapshot())
}

export function useFontSettingsController() {
  return {
    async setAppFontSize(fontSize: number): Promise<void> {
      await runSettingsControllerAction('application font size update', async () => {
        await setFileTreeFontSizePreference(fontSize)
      })
    },
    async setTerminalFontSize(fontSize: number): Promise<void> {
      await runSettingsControllerAction('terminal font size update', async () => {
        await setTerminalFontSizePreference(fontSize)
      })
    },
    async setFontFamily(fontFamily: FontFamilyPref): Promise<void> {
      await runSettingsControllerAction('font family update', async () => {
        await setFontFamilyPreference(fontFamily)
      })
    },
  }
}
