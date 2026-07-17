import { readRuntimeGeneralSettings, useRuntimeSettingsSnapshot } from '#/web/settings-read-projection.ts'
import {
  runSettingsControllerAction,
  setServerPortPreference,
  setTemporaryFilesDirectoryPreference,
  setTerminalThemeSyncEnabledPreference,
  setToggleDetailOnActionBarBlankClickPreference,
} from '#/web/settings-write-paths.ts'

export function useRuntimeGeneralSettings() {
  const runtimeSettings = useRuntimeSettingsSnapshot()
  return readRuntimeGeneralSettings(runtimeSettings)
}

export function useGeneralSettingsController() {
  return {
    async setToggleDetailOnActionBarBlankClick(enabled: boolean): Promise<void> {
      await runSettingsControllerAction('action bar blank toggle update', async () => {
        await setToggleDetailOnActionBarBlankClickPreference(enabled)
      })
    },
    async setTerminalThemeSyncEnabled(enabled: boolean): Promise<void> {
      await runSettingsControllerAction('terminal theme sync update', async () => {
        await setTerminalThemeSyncEnabledPreference(enabled)
      })
    },
    async setTemporaryFilesDirectory(path: string): Promise<void> {
      await runSettingsControllerAction('temporary files directory update', async () => {
        await setTemporaryFilesDirectoryPreference(path)
      })
    },
    async setServerPort(port: number): Promise<void> {
      await runSettingsControllerAction('server port update', async () => {
        await setServerPortPreference(port)
      })
    },
  }
}
