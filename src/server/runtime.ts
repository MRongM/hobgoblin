import type { Hono } from 'hono'
import { createApp, type ServerAppOptions } from '#/server/app-factory.ts'
import { stopBackgroundSync } from '#/server/modules/background-sync.ts'
import { shutdownPortForwarding } from '#/server/modules/port-forwarding.ts'
import type { ServerTerminalHost } from '#/server/terminal/terminal-host.ts'
import { WorkerBackedTerminalHost } from '#/server/terminal/terminal-worker-host.ts'
import { createServerSettingsState } from '#/server/modules/settings-state.ts'
import { createTelegramTerminalInputRuntime } from '#/server/modules/telegram-terminal-input-runtime.ts'

export interface ServerRuntimeOptions
  extends Omit<ServerAppOptions, 'terminalHost' | 'settingsState' | 'onTelegramRuntimeConfigChanged'> {
  terminalHost?: ServerTerminalHost
  terminalWorkerEntry?: string
}

export interface ServerRuntime {
  app: Hono
  terminalHost: ServerTerminalHost
  shutdown(): void
}

export function createServerRuntime(options: ServerRuntimeOptions): ServerRuntime {
  const { terminalHost: providedTerminalHost, terminalWorkerEntry, ...appOptions } = options
  const terminalHost = providedTerminalHost ?? new WorkerBackedTerminalHost({ workerEntry: terminalWorkerEntry })
  const settingsState = createServerSettingsState()
  const telegramTerminalInputRuntime = createTelegramTerminalInputRuntime({ terminalHost, settingsState })
  const app = createApp({
    ...appOptions,
    terminalHost,
    settingsState,
    onTelegramRuntimeConfigChanged: () => telegramTerminalInputRuntime.reconcile(),
  })
  void telegramTerminalInputRuntime.reconcile().catch(() => undefined)
  let stopped = false
  return {
    app,
    terminalHost,
    shutdown() {
      if (stopped) return
      stopped = true
      telegramTerminalInputRuntime.shutdown()
      stopBackgroundSync()
      shutdownPortForwarding()
      terminalHost.shutdown()
    },
  }
}
