import { spawn, type ChildProcess } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { Readable } from 'node:stream'
import path from 'node:path'
import { app } from 'electron'
import { createStartupDiagnostics, type StartupDiagnostics } from '#/main/startup-diagnostics.ts'
import { EMBEDDED_SERVER_SHUTDOWN_MESSAGE } from '#/shared/server-lifecycle.ts'
import { shutdownOwnedProcess } from '#/system/owned-process-shutdown.ts'
import { reserveAvailablePort } from '#/system/port-allocation.ts'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 32200
const HEALTH_PATH = '/api/health'
const SERVER_READY_TIMEOUT_MS = 8_000
const SERVER_STOP_TIMEOUT_MS = 5_000

interface EmbeddedServerRuntime {
  host: string
  port: number
  url: string
  secret: string
  clientId: string
}

type ServerChildProcess = ChildProcess & {
  stdin: null
  stdout: Readable
  stderr: Readable
}

let serverProcess: ServerChildProcess | null = null
let runtime: EmbeddedServerRuntime | null = null
let startPromise: Promise<EmbeddedServerRuntime | null> | null = null

function embeddedServerEnabled(): boolean {
  if (typeof app.getAppPath !== 'function') return false
  const raw = process.env.GOBLIN_ENABLE_LOCAL_SERVER?.trim()?.toLowerCase()
  if (raw === '0' || raw === 'false') return false
  if (raw === '1' || raw === 'true') return true
  return true
}

export function resolveEmbeddedServerEntryPath(appPath: string): string {
  return path.join(appPath, 'src/server/entrypoints/main.ts')
}

export function resolveEmbeddedServerWorkingDirectory(appPath: string, isPackaged: boolean): string {
  return isPackaged && path.extname(appPath) === '.asar' ? path.dirname(appPath) : appPath
}

function serverEntryPath(): string {
  return resolveEmbeddedServerEntryPath(app.getAppPath())
}

function serverWorkingDirectory(): string {
  return resolveEmbeddedServerWorkingDirectory(app.getAppPath(), app.isPackaged)
}

export function embeddedServerSpawnStdio(): ['ignore', 'pipe', 'pipe', 'ipc'] {
  return ['ignore', 'pipe', 'pipe', 'ipc']
}

function serverCommand(): { bin: string; args: string[]; env: NodeJS.ProcessEnv } {
  const entry = serverEntryPath()
  return {
    bin: process.execPath,
    args: [entry],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
    },
  }
}

function parseServerPort(value: string | undefined): number {
  const port = Number(value)
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : DEFAULT_PORT
}

async function reserveEmbeddedServerPort(host: string, preferredPort: number): Promise<number> {
  return await reserveAvailablePort(host, preferredPort, 'Failed to allocate local server port')
}

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (!serverProcess) throw new Error('Embedded server exited before becoming ready')
    try {
      const response = await fetch(`${url}${HEALTH_PATH}`)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error('Timed out waiting for embedded server')
}

function deriveServerClientId(secret: string): string {
  return `client_${createHash('sha256').update(secret).digest('hex').slice(0, 32)}`
}

function diagnostics(): StartupDiagnostics {
  return createStartupDiagnostics(path.join(app.getPath('userData'), 'startup.log'))
}

function pipeProcessLogs(proc: ServerChildProcess, log: StartupDiagnostics): void {
  proc.stdout.setEncoding('utf8')
  proc.stderr.setEncoding('utf8')
  proc.stdout.on('data', (chunk) => {
    const output = chunk.trim()
    if (output) {
      console.log(`[server] ${output}`)
      log.log('server-stdout', { output })
    }
  })
  proc.stderr.on('data', (chunk) => {
    const output = chunk.trim()
    if (output) {
      console.error(`[server] ${output}`)
      log.log('server-stderr', { output })
    }
  })
}

function readServerSettings(): { lanEnabled: boolean; serverPort: number | null } {
  try {
    const file = path.join(app.getPath('userData'), 'server-settings.json')
    const raw = readFileSync(file, 'utf-8')
    const parsed = JSON.parse(raw)
    const port = Number(parsed.serverPort)
    return {
      lanEnabled: parsed.lanEnabled === true,
      serverPort: Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : null,
    }
  } catch {
    return { lanEnabled: false, serverPort: null }
  }
}

export async function startEmbeddedServer(): Promise<EmbeddedServerRuntime | null> {
  if (runtime) return runtime
  if (startPromise) return await startPromise
  if (!embeddedServerEnabled()) return null
  startPromise = (async () => {
    const settings = readServerSettings()
    let host = process.env.GOBLIN_SERVER_HOST?.trim()
    if (!host) {
      host = settings.lanEnabled ? '0.0.0.0' : DEFAULT_HOST
    }
    // The env var wins for dev overrides; otherwise the configured port from
    // settings applies (restart-effective), falling back to the default.
    const preferredPort = process.env.GOBLIN_SERVER_PORT
      ? parseServerPort(process.env.GOBLIN_SERVER_PORT)
      : (settings.serverPort ?? DEFAULT_PORT)
    const port = await reserveEmbeddedServerPort(host, preferredPort)
    const secret = randomBytes(32).toString('hex')
    const clientId = deriveServerClientId(secret)
    const accessHost = host === '0.0.0.0' ? '127.0.0.1' : host
    const url = `http://${accessHost}:${port}`
    const command = serverCommand()
    const cwd = serverWorkingDirectory()
    const log = diagnostics()
    log.log('embedded-server-start', {
      appPath: app.getAppPath(),
      isPackaged: app.isPackaged,
      processExecPath: process.execPath,
      entry: command.args[0],
      cwd,
      host,
      port,
    })
    const proc = spawn(command.bin, command.args, {
      cwd,
      env: {
        ...command.env,
        GOBLIN_SERVER_HOST: host,
        GOBLIN_SERVER_PORT: String(port),
        GOBLIN_SERVER_INTERNAL_SECRET: secret,
        GOBLIN_SERVER_DATA_DIR: app.getPath('userData'),
      },
      stdio: embeddedServerSpawnStdio(),
    }) as ServerChildProcess
    serverProcess = proc
    pipeProcessLogs(proc, log)
    proc.once('exit', (code, signal) => {
      log.log('embedded-server-exit', { code, signal })
      if (serverProcess === proc) serverProcess = null
      runtime = null
    })
    proc.once('error', (error) => {
      log.log('embedded-server-process-error', { name: error.name, message: error.message })
      console.error('[server] process failed', error)
    })
    try {
      await waitForServer(url, SERVER_READY_TIMEOUT_MS)
      runtime = { host, port, url, secret, clientId }
      log.log('embedded-server-ready', { url, host, port, hasClientId: Boolean(clientId) })
      console.log(`[server] ready at ${url}`)
      return runtime
    } catch (error) {
      log.log('embedded-server-ready-failed', {
        url,
        message: error instanceof Error ? error.message : String(error),
      })
      await stopEmbeddedServer()
      throw error
    } finally {
      startPromise = null
    }
  })()
  return await startPromise
}

export function getEmbeddedServerRuntime(): EmbeddedServerRuntime | null {
  return runtime
}

export async function stopEmbeddedServer(): Promise<void> {
  const proc = serverProcess
  serverProcess = null
  runtime = null
  startPromise = null
  if (!proc) return
  await shutdownOwnedProcess(proc, {
    message: EMBEDDED_SERVER_SHUTDOWN_MESSAGE,
    timeoutMs: SERVER_STOP_TIMEOUT_MS,
  })
}

export { DEFAULT_PORT as DEFAULT_EMBEDDED_SERVER_PORT, parseServerPort, reserveEmbeddedServerPort }
