import type { Hono } from 'hono'
import { createApp, type ServerAppOptions } from '#/server/app-factory.ts'
import { stopBackgroundSync } from '#/server/modules/background-sync.ts'
import { shutdownPortForwarding } from '#/server/modules/port-forwarding.ts'
import type { ServerTerminalHost } from '#/server/terminal/terminal-host.ts'
import { WorkerBackedTerminalHost } from '#/server/terminal/terminal-worker-host.ts'

export interface ServerRuntimeOptions extends Omit<ServerAppOptions, 'terminalHost'> {
  terminalHost?: ServerTerminalHost
  terminalWorkerEntry?: string
}

export interface ServerRuntime {
  app: Hono
  terminalHost: ServerTerminalHost
  shutdown(): Promise<void>
}

export function createServerRuntime(options: ServerRuntimeOptions): ServerRuntime {
  const { terminalHost: providedTerminalHost, terminalWorkerEntry, ...appOptions } = options
  const terminalHost = providedTerminalHost ?? new WorkerBackedTerminalHost({ workerEntry: terminalWorkerEntry })
  const app = createApp({ ...appOptions, terminalHost })
  let shutdownPromise: Promise<void> | null = null
  return {
    app,
    terminalHost,
    shutdown() {
      if (shutdownPromise) return shutdownPromise
      shutdownPromise = (async () => {
        stopBackgroundSync()
        shutdownPortForwarding()
        await terminalHost.shutdown()
      })()
      return shutdownPromise
    },
  }
}
