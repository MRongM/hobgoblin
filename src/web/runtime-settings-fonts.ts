import { readRuntimeFontSettings, useRuntimeSettingsSnapshot } from '#/web/settings-read-projection.ts'
import {
  runSettingsControllerAction,
  setFileTreeFontSizePreference,
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
    async setTerminalFontSize(fontSize: number): Promise<void> {
      await runSettingsControllerAction('terminal font size update', async () => {
        await setTerminalFontSizePreference(fontSize)
      })
    },
  }
}
