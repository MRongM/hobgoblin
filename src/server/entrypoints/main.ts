import { bootstrapServer } from '#/server/bootstrap.ts'
import { readServerStartupSecret } from '#/server/common/startup-secret.ts'

if (import.meta.main) {
  bootstrapServer({ terminalWorkerDir: import.meta.dirname, internalSecret: readServerStartupSecret() })
}
