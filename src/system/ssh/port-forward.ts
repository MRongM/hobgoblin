import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import type { PortForwardStartRequest } from '#/shared/port-forwarding.ts'

const SSH_CONNECT_TIMEOUT_SEC = 10
const DEFAULT_READY_DELAY_MS = 300
const STDERR_LIMIT = 4096

export interface SshLocalPortForwardInput extends Omit<PortForwardStartRequest, 'repoId' | 'localPort'> {
  alias: string
  localPort: number
}

export interface SshLocalPortForwardHandle {
  pid: number | null
  stop(): void
  onExit(listener: (exit: SshLocalPortForwardExit) => void): () => void
  stderrText(): string
}

export interface SshLocalPortForwardExit {
  code: number | null
  signal: NodeJS.Signals | null
  stderr: string
}

type SpawnLike = (
  command: string,
  args: string[],
  options: SpawnOptions,
) => Pick<ChildProcess, 'pid' | 'stderr' | 'kill' | 'killed' | 'on'>

export interface StartSshLocalPortForwardOptions {
  spawn?: SpawnLike
  readyDelayMs?: number
}

export function buildSshLocalPortForwardArgs(input: SshLocalPortForwardInput): string[] {
  return [
    '-N',
    '-o',
    'ExitOnForwardFailure=yes',
    '-o',
    'StrictHostKeyChecking=yes',
    '-o',
    `ConnectTimeout=${SSH_CONNECT_TIMEOUT_SEC}`,
    '-L',
    `${input.localBindHost}:${input.localPort}:${input.remoteHost}:${input.remotePort}`,
    '--',
    input.alias,
  ]
}

export async function startSshLocalPortForward(
  input: SshLocalPortForwardInput,
  options: StartSshLocalPortForwardOptions = {},
): Promise<SshLocalPortForwardHandle> {
  const spawn = options.spawn ?? nodeSpawn
  const readyDelayMs = options.readyDelayMs ?? DEFAULT_READY_DELAY_MS
  const args = buildSshLocalPortForwardArgs(input)
  const child = spawn('ssh', args, { stdio: ['ignore', 'ignore', 'pipe'], shell: false })
  let stderr = ''
  const state: { settledExit: SshLocalPortForwardExit | null } = { settledExit: null }
  const exitListeners = new Set<(exit: SshLocalPortForwardExit) => void>()

  child.stderr?.on('data', (chunk: Buffer | string) => {
    stderr = capText(`${stderr}${String(chunk)}`, STDERR_LIMIT)
  })
  child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
    state.settledExit = { code, signal, stderr }
    for (const listener of exitListeners) listener(state.settledExit)
  })

  await waitForReadyWindow(readyDelayMs)
  const earlyExit = state.settledExit
  if (earlyExit) throw new Error(summarizeSshForwardFailure(earlyExit.stderr))

  return {
    pid: child.pid ?? null,
    stop() {
      if (!child.killed) child.kill()
    },
    onExit(listener) {
      exitListeners.add(listener)
      if (state.settledExit) listener(state.settledExit)
      return () => exitListeners.delete(listener)
    },
    stderrText() {
      return stderr
    },
  }
}

function waitForReadyWindow(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function summarizeSshForwardFailure(stderr: string): string {
  const summary = stderr.trim().split(/\r?\n/).filter(Boolean).slice(-3).join('\n')
  return summary || 'error.port-forward-start-failed'
}

function capText(value: string, limit: number): string {
  return value.length <= limit ? value : value.slice(value.length - limit)
}
