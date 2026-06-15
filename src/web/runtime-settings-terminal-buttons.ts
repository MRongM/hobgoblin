import type { TerminalCustomButton } from '#/shared/rpc.ts'
import {
  readRuntimeTerminalCustomButtons,
  readRuntimeTerminalSettings,
  useRuntimeSettingsSnapshot,
} from '#/web/settings-read-projection.ts'
import {
  runSettingsControllerAction,
  setTerminalCustomButtonsPreference,
  setTerminalCustomButtonsVisiblePreference,
  setTerminalExternalInputEnabledPreference,
} from '#/web/settings-write-paths.ts'

export function useRuntimeTerminalCustomButtons(): TerminalCustomButton[] {
  return readRuntimeTerminalCustomButtons(useRuntimeSettingsSnapshot())
}

export function useRuntimeTerminalSettings() {
  return readRuntimeTerminalSettings(useRuntimeSettingsSnapshot())
}

export function useTerminalCustomButtonsController() {
  return {
    async setTerminalExternalInputEnabled(enabled: boolean): Promise<void> {
      await runSettingsControllerAction('terminal external input update', async () => {
        await setTerminalExternalInputEnabledPreference(enabled)
      })
    },
    async setTerminalCustomButtonsVisible(visible: boolean): Promise<void> {
      await runSettingsControllerAction('terminal custom buttons visibility update', async () => {
        await setTerminalCustomButtonsVisiblePreference(visible)
      })
    },
    async setTerminalCustomButtons(buttons: TerminalCustomButton[]): Promise<void> {
      await runSettingsControllerAction('terminal custom buttons update', async () => {
        await setTerminalCustomButtonsPreference(buttons)
      })
    },
  }
}
