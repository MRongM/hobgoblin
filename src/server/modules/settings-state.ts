import type { TelegramTerminalInputRuntimeSnapshot } from '#/shared/telegram-terminal-input.ts'

export interface ServerSettingsState {
  globalShortcutRegistered: boolean
  telegramTerminalInputRuntime: TelegramTerminalInputRuntimeSnapshot
}

export function createServerSettingsState(): ServerSettingsState {
  return { globalShortcutRegistered: false, telegramTerminalInputRuntime: { status: 'stopped' } }
}
