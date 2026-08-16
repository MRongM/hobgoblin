import {
  currentRuntimeSettingsSnapshot,
  readRuntimeShortcutSettings,
  useRuntimeSettingsSnapshot,
} from '#/web/settings-read-projection.ts'
import { runSettingsControllerAction } from '#/web/settings-write-paths.ts'
import { setShortcutsDisabledPreference } from '#/web/settings-write-paths.ts'

export function getRuntimeShortcutSettings() {
  return readRuntimeShortcutSettings(currentRuntimeSettingsSnapshot())
}

export function useRuntimeShortcutSettings() {
  return readRuntimeShortcutSettings(useRuntimeSettingsSnapshot())
}

export function useShortcutSettingsController() {
  return {
    async setShortcutsDisabled(disabled: boolean): Promise<void> {
      await runSettingsControllerAction('shortcuts update', async () => {
        await setShortcutsDisabledPreference(disabled)
      })
    },
  }
}
