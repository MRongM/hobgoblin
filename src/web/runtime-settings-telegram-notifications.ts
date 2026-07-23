import type {
  TelegramNotificationResult,
  TelegramNotificationSettingsSnapshot,
  TelegramNotificationSettingsUpdateInput,
} from '#/shared/telegram-notifications.ts'
import { sendTelegramTestNotification } from '#/web/settings-client.ts'
import { currentSettingsSnapshot } from '#/web/settings-read-projection.ts'
import { useSettingsSnapshotQuery } from '#/web/settings-queries.ts'
import { runSettingsControllerAction, saveTelegramNotificationSettingsPreference } from '#/web/settings-write-paths.ts'
import { TELEGRAM_OUTPUT_TAIL_DEFAULT_LENGTH } from '#/shared/telegram-notifications.ts'

const DEFAULT_TELEGRAM_SETTINGS: TelegramNotificationSettingsSnapshot = {
  enabled: false,
  botTokenConfigured: false,
  chatId: '',
  bellEnabled: true,
  outputCompletionEnabled: false,
  includeTerminalOutput: false,
  outputTailLength: TELEGRAM_OUTPUT_TAIL_DEFAULT_LENGTH,
}

export function getRuntimeTelegramNotificationSettings(): TelegramNotificationSettingsSnapshot {
  return currentSettingsSnapshot()?.telegramNotifications ?? DEFAULT_TELEGRAM_SETTINGS
}

export function useRuntimeTelegramNotificationSettings(): TelegramNotificationSettingsSnapshot {
  return useSettingsSnapshotQuery().data?.telegramNotifications ?? DEFAULT_TELEGRAM_SETTINGS
}

export function useTelegramNotificationSettingsController() {
  return {
    async save(input: TelegramNotificationSettingsUpdateInput): Promise<TelegramNotificationSettingsSnapshot | null> {
      return await runSettingsControllerAction('Telegram notification settings update', async () =>
        saveTelegramNotificationSettingsPreference(input),
      )
    },
    async test(): Promise<TelegramNotificationResult | null> {
      return await runSettingsControllerAction('Telegram notification test', sendTelegramTestNotification)
    },
  }
}
