import { readRuntimeFontSettings, useRuntimeSettingsSnapshot } from '#/web/settings-read-projection.ts'
import type { FontFamilyPref } from '#/shared/rpc.ts'
import {
  runSettingsControllerAction,
  setFontFamilyPreference,
  setFileTreeFontSizePreference,
  setFileTreeTopbarFontSizePreference,
  setTerminalFontSizePreference,
} from '#/web/settings-write-paths.ts'

export function useRuntimeFontSettings() {
  return readRuntimeFontSettings(useRuntimeSettingsSnapshot())
}

export function useFontSettingsController() {
  return {
    async setFileTreeFontSize(fontSize: number): Promise<void> {
      await runSettingsControllerAction('file tree font size update', async () => {
        await setFileTreeFontSizePreference(fontSize)
      })
    },
    async setFileTreeTopbarFontSize(fontSize: number): Promise<void> {
      await runSettingsControllerAction('file tree topbar font size update', async () => {
        await setFileTreeTopbarFontSizePreference(fontSize)
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
