import type { WindowsInternalTerminalShellPref } from '#/shared/rpc.ts'
import {
  readRuntimeWindowsInternalTerminalShellSettings,
  useRuntimeSettingsSnapshot,
} from '#/web/settings-read-projection.ts'
import { runSettingsControllerAction, setWindowsInternalTerminalShellPreference } from '#/web/settings-write-paths.ts'

export function useRuntimeWindowsInternalTerminalShellSettings() {
  return readRuntimeWindowsInternalTerminalShellSettings(useRuntimeSettingsSnapshot())
}

export function useWindowsInternalTerminalShellController() {
  return {
    async setWindowsInternalTerminalShell(pref: WindowsInternalTerminalShellPref): Promise<void> {
      await runSettingsControllerAction('Windows internal terminal shell update', async () => {
        await setWindowsInternalTerminalShellPreference(pref)
      })
    },
  }
}
