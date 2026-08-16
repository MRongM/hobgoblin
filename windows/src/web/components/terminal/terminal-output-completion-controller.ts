import type { TelegramOutputCompletionNotificationContext } from '#/shared/telegram-notifications.ts'
import { terminalNotificationContext } from '#/web/components/terminal/terminal-notification-context.ts'
import type { TerminalOutputCompletionIntent } from '#/web/components/terminal/types.ts'
import { getRuntimeFetchSettings } from '#/web/runtime-settings-fetch.ts'
import { getRuntimeTelegramNotificationSettings } from '#/web/runtime-settings-telegram-notifications.ts'
import { sendTelegramOutputCompletionNotification } from '#/web/settings-client.ts'

export function notifyTerminalOutputCompletion(intent: TerminalOutputCompletionIntent): void {
  if (!getRuntimeFetchSettings().terminalNotificationsEnabled) return
  const telegram = getRuntimeTelegramNotificationSettings()
  if (!telegram.enabled || !telegram.outputCompletionEnabled || !telegram.botTokenConfigured || !telegram.chatId) return
  if (intent.activityDurationMs < telegram.outputCompletionMinimumActivitySeconds * 1_000) return
  const context: TelegramOutputCompletionNotificationContext = {
    ...terminalNotificationContext(intent.descriptor, {
      processName: intent.processName,
      canonicalTitle: intent.canonicalTitle,
      visible: false,
      sessionId: intent.sessionId,
    }),
    sessionId: intent.sessionId,
    finalOutputSeq: intent.finalOutputSeq,
    activityDurationMs: intent.activityDurationMs,
  }
  void sendTelegramOutputCompletionNotification(context).catch(() => {})
}
