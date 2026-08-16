import type { TerminalCustomButton, TerminalCustomButtonSize } from '#/shared/rpc.ts'
import { readRuntimeTerminalSettings, useRuntimeSettingsSnapshot } from '#/web/settings-read-projection.ts'
import {
  runSettingsControllerAction,
  setTerminalNavigationControlsVisiblePreference,
  setTerminalCustomButtonsPreference,
  setTerminalCustomButtonSizePreference,
  setTerminalCustomButtonsVisiblePreference,
} from '#/web/settings-write-paths.ts'

export function useRuntimeTerminalSettings() {
  return readRuntimeTerminalSettings(useRuntimeSettingsSnapshot())
}

export function useTerminalCustomButtonsController() {
  return {
    async setTerminalNavigationControlsVisible(visible: boolean): Promise<void> {
      await runSettingsControllerAction('terminal navigation controls visibility update', async () => {
        await setTerminalNavigationControlsVisiblePreference(visible)
      })
    },
    async setTerminalCustomButtonsVisible(visible: boolean): Promise<void> {
      await runSettingsControllerAction('terminal custom buttons visibility update', async () => {
        await setTerminalCustomButtonsVisiblePreference(visible)
      })
    },
    async setTerminalCustomButtonSize(size: TerminalCustomButtonSize): Promise<void> {
      await runSettingsControllerAction('terminal custom button size update', async () => {
        await setTerminalCustomButtonSizePreference(size)
      })
    },
    async setTerminalCustomButtons(buttons: TerminalCustomButton[]): Promise<void> {
      await runSettingsControllerAction('terminal custom buttons update', async () => {
        await setTerminalCustomButtonsPreference(buttons)
      })
    },
  }
}
