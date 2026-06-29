import { readRuntimeFileAreaSettings, useRuntimeSettingsSnapshot } from '#/web/settings-read-projection.ts'
import {
  runSettingsControllerAction,
  setFileTreeClipboardMaxBytesMbPreference,
  setFileTreeFontSizePreference,
  setFileTreeTopbarFontSizePreference,
} from '#/web/settings-write-paths.ts'

export function useRuntimeFileAreaSettings() {
  return readRuntimeFileAreaSettings(useRuntimeSettingsSnapshot())
}

export function useFileAreaSettingsController() {
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
    async setFileTreeClipboardMaxBytesMb(value: number): Promise<void> {
      await runSettingsControllerAction('file tree clipboard max size update', async () => {
        await setFileTreeClipboardMaxBytesMbPreference(value)
      })
    },
  }
}
