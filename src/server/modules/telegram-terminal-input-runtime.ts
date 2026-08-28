import { serverLogger } from '#/server/logger.ts'
import { publishSettingsInvalidation } from '#/server/modules/invalidation-broker.ts'
import { getServerSettingsPrefs, getServerTelegramNotificationConfig } from '#/server/modules/settings-source.ts'
import type { ServerSettingsState } from '#/server/modules/settings-state.ts'
import { telegramProxyUrlFromPrefs } from '#/server/modules/telegram-bot-api-source.ts'
import {
  runTelegramTerminalInputReceiverEpoch,
  type TelegramTerminalInputReceiverConfig,
  type TelegramTerminalInputReceiverDependencies,
} from '#/server/modules/telegram-terminal-input-polling.ts'
import type { ServerTerminalHost } from '#/server/terminal/terminal-host.ts'
import type { SettingsPrefs } from '#/shared/rpc.ts'
import { resolvePreferredLang } from '#/shared/i18n/resolve-lang.ts'
import type { TelegramTerminalInputRuntimeSnapshot } from '#/shared/telegram-terminal-input.ts'

type RunReceiverEpoch = (
  config: TelegramTerminalInputReceiverConfig,
  dependencies: TelegramTerminalInputReceiverDependencies,
  signal: AbortSignal,
) => Promise<void>

export interface TelegramTerminalInputRuntimeOptions {
  terminalHost: ServerTerminalHost
  settingsState: ServerSettingsState
  getTelegramConfig?: typeof getServerTelegramNotificationConfig
  getSettingsPrefs?: () => Promise<Pick<SettingsPrefs, 'gitNetworkProxyUrl' | 'lang'>>
  runReceiverEpoch?: RunReceiverEpoch
  publishInvalidation?: typeof publishSettingsInvalidation
}

export interface TelegramTerminalInputRuntime {
  reconcile(): Promise<void>
  shutdown(): void
}

const telegramTerminalInputLogger = serverLogger.child({ module: 'telegram-terminal-input' })

function configSignature(config: TelegramTerminalInputReceiverConfig): string {
  return JSON.stringify(config)
}

export function createTelegramTerminalInputRuntime(
  options: TelegramTerminalInputRuntimeOptions,
): TelegramTerminalInputRuntime {
  const getTelegramConfig = options.getTelegramConfig ?? getServerTelegramNotificationConfig
  const getSettingsPrefs = options.getSettingsPrefs ?? getServerSettingsPrefs
  const runReceiverEpoch = options.runReceiverEpoch ?? runTelegramTerminalInputReceiverEpoch
  const publishInvalidation = options.publishInvalidation ?? publishSettingsInvalidation
  let reconcileVersion = 0
  let currentSignature: string | null = null
  let activeController: AbortController | null = null
  let shuttingDown = false

  const publishStatus = (status: TelegramTerminalInputRuntimeSnapshot): void => {
    if (JSON.stringify(options.settingsState.telegramTerminalInputRuntime) === JSON.stringify(status)) return
    options.settingsState.telegramTerminalInputRuntime = { ...status }
    publishInvalidation(['settings-snapshot'])
  }

  const stopActiveEpoch = (): void => {
    const controller = activeController
    activeController = null
    controller?.abort()
  }

  return {
    async reconcile(): Promise<void> {
      if (shuttingDown) return
      const version = (reconcileVersion += 1)
      let telegram: Awaited<ReturnType<typeof getTelegramConfig>>
      let prefs: Awaited<ReturnType<typeof getSettingsPrefs>>
      try {
        ;[telegram, prefs] = await Promise.all([getTelegramConfig(), getSettingsPrefs()])
      } catch {
        if (!shuttingDown && version === reconcileVersion) {
          stopActiveEpoch()
          currentSignature = null
          publishStatus({ status: 'error', errorCode: 'configuration-incomplete' })
        }
        return
      }
      if (shuttingDown || version !== reconcileVersion) return
      const proxyUrl = telegramProxyUrlFromPrefs(prefs, telegram.proxyEnabled)
      const receiverConfig: TelegramTerminalInputReceiverConfig = {
        enabled: telegram.enabled,
        terminalInputEnabled: telegram.terminalInputEnabled,
        botToken: telegram.botToken,
        chatId: telegram.chatId,
        ...(proxyUrl ? { proxyUrl } : {}),
        terminalInputAllowedUserIds: [...telegram.terminalInputAllowedUserIds],
        terminalInputPollingTimeoutSeconds: telegram.terminalInputPollingTimeoutSeconds,
        lang: resolvePreferredLang(prefs.lang, Intl.DateTimeFormat().resolvedOptions().locale),
      }
      const runnable =
        receiverConfig.enabled &&
        receiverConfig.terminalInputEnabled &&
        Boolean(receiverConfig.botToken && receiverConfig.chatId) &&
        receiverConfig.terminalInputAllowedUserIds.length > 0
      if (!runnable) {
        stopActiveEpoch()
        currentSignature = null
        publishStatus({ status: 'stopped' })
        return
      }

      const signature = configSignature(receiverConfig)
      if (signature === currentSignature) return
      stopActiveEpoch()
      currentSignature = signature
      const controller = new AbortController()
      activeController = controller
      void runReceiverEpoch(
        receiverConfig,
        {
          submitTerminalInput: (text) => Promise.resolve(options.terminalHost.submitTelegramInput(text)),
          onStatusChange: publishStatus,
          warn: (code) => telegramTerminalInputLogger.warn({ code }, 'Telegram terminal input operation failed'),
        },
        controller.signal,
      )
        .catch(() => {
          if (!controller.signal.aborted) publishStatus({ status: 'error', errorCode: 'network-failed' })
        })
        .finally(() => {
          if (activeController === controller) activeController = null
        })
    },
    shutdown(): void {
      if (shuttingDown) return
      shuttingDown = true
      reconcileVersion += 1
      stopActiveEpoch()
      currentSignature = null
      publishStatus({ status: 'stopped' })
    },
  }
}
