import { readRuntimeFileAreaSettings, useRuntimeSettingsSnapshot } from '#/web/settings-read-projection.ts'
import { runSettingsControllerAction, setFileTreeClipboardMaxBytesMbPreference } from '#/web/settings-write-paths.ts'

export function useRuntimeFileAreaSettings() {
  return readRuntimeFileAreaSettings(useRuntimeSettingsSnapshot())
}

export function useFileAreaSettingsController() {
  return {
    async setFileTreeClipboardMaxBytesMb(value: number): Promise<void> {
      await runSettingsControllerAction('file tree clipboard max size update', async () => {
        await setFileTreeClipboardMaxBytesMbPreference(value)
      })
    },
  }
}
