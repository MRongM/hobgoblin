import type { Hono } from 'hono'
import { createApp, type ServerAppOptions } from '#/server/app-factory.ts'
import { serverDataFile } from '#/server/common/data-dir.ts'
import { stopBackgroundSync } from '#/server/modules/background-sync.ts'
import { createConversationOpenApiStore } from '#/server/modules/conversation-open-api-source.ts'
import { createAgentOpenApiRuntime } from '#/server/modules/agent-open-api-runtime.ts'
import { createOpenApiKeySource } from '#/server/modules/open-api-key-source.ts'
import { shutdownPortForwarding } from '#/server/modules/port-forwarding.ts'
import type { ServerTerminalHost } from '#/server/terminal/terminal-host.ts'
import { WorkerBackedTerminalHost } from '#/server/terminal/terminal-worker-host.ts'
import { createTerminalRegistry } from '#/server/terminal/terminal-registry-source.ts'
import { createTerminalTranscript } from '#/server/terminal/terminal-transcript-source.ts'
import { createServerSettingsState } from '#/server/modules/settings-state.ts'
import { createTelegramTerminalInputRuntime } from '#/server/modules/telegram-terminal-input-runtime.ts'
import { readPersistedWindowsInternalTerminalShellPref } from '#/server/modules/settings-source.ts'

export interface ServerRuntimeOptions extends Omit<
  ServerAppOptions,
  'terminalHost' | 'settingsState' | 'onTelegramRuntimeConfigChanged' | 'conversationOpenApi'
> {
  terminalHost?: ServerTerminalHost
  terminalWorkerEntry?: string
  openApiToken?: string
  openApiControlToken?: string
}

export interface ServerRuntime {
  app: Hono
  terminalHost: ServerTerminalHost
  shutdown(): void
}

export function createServerRuntime(options: ServerRuntimeOptions): ServerRuntime {
  const {
    terminalHost: providedTerminalHost,
    terminalWorkerEntry,
    openApiToken,
    openApiControlToken,
    ...appOptions
  } = options
  const windowsInternalTerminalShell = readPersistedWindowsInternalTerminalShellPref()
  const terminalRegistry = createTerminalRegistry(serverDataFile('terminal-registry/terminals.sqlite'))
  const terminalTranscript = createTerminalTranscript(serverDataFile('terminal-registry/transcript.sqlite'))
  const conversationStore = createConversationOpenApiStore(serverDataFile('conversation-open-api/conversations.sqlite'))
  const agents = createAgentOpenApiRuntime(conversationStore)
  const terminalHost =
    providedTerminalHost ??
    new WorkerBackedTerminalHost({
      workerEntry: terminalWorkerEntry,
      windowsInternalTerminalShell,
      terminalRegistry,
      terminalTranscript,
      observeTerminal: agents.observeTerminal,
      onTerminalWorkerStop: agents.terminalWorkerStopped,
    })
  if (providedTerminalHost) {
    terminalHost.setWindowsInternalTerminalShellPreference?.(windowsInternalTerminalShell)
  }
  const settingsState = createServerSettingsState()
  const telegramTerminalInputRuntime = createTelegramTerminalInputRuntime({ terminalHost, settingsState })
  const conversationOpenApi = {
    keys: createOpenApiKeySource({
      file: serverDataFile('conversation-open-api/keys.json'),
      conversationToken: openApiToken,
      controlToken: openApiControlToken,
      internalSecret: options.internalSecret,
    }),
    store: conversationStore,
    agents,
    terminalRegistry,
    terminalTranscript,
  }
  const app = createApp({
    ...appOptions,
    terminalHost,
    settingsState,
    conversationOpenApi,
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
      try {
        telegramTerminalInputRuntime.shutdown()
        stopBackgroundSync()
        shutdownPortForwarding()
        terminalHost.shutdown()
      } finally {
        agents.shutdown()
        conversationOpenApi.store.close()
        terminalRegistry.close()
        terminalTranscript.close()
      }
    },
  }
}
