import type { TerminalCustomButton } from '#/shared/rpc.ts'
import { readRuntimeTerminalCustomButtons, useRuntimeSettingsSnapshot } from '#/web/settings-read-projection.ts'
import {
  runSettingsControllerAction,
  setTerminalCustomButtonsPreference,
} from '#/web/settings-write-paths.ts'

export function useRuntimeTerminalCustomButtons(): TerminalCustomButton[] {
  return readRuntimeTerminalCustomButtons(useRuntimeSettingsSnapshot())
}

export function useTerminalCustomButtonsController() {
  return {
    async setTerminalCustomButtons(buttons: TerminalCustomButton[]): Promise<void> {
      await runSettingsControllerAction('terminal custom buttons update', async () => {
        await setTerminalCustomButtonsPreference(buttons)
      })
    },
  }
}
