import { spawn } from 'node:child_process'

interface OwnedProcess {
  pid?: number
  exitCode?: number | null
  signalCode?: NodeJS.Signals | null
  connected?: boolean
  send?(message: any): boolean
  kill(signal?: NodeJS.Signals | number): boolean
  once(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown
  removeListener(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown
}

export interface OwnedProcessShutdownOptions {
  message: unknown
  timeoutMs: number
  platform?: NodeJS.Platform
  terminateProcessTree?: (pid: number) => Promise<void>
}

export async function shutdownOwnedProcess(
  child: OwnedProcess,
  options: OwnedProcessShutdownOptions,
): Promise<void> {
  if (processHasExited(child)) return

  let settleExit: (exited: boolean) => void = () => {}
  let settled = false
  let timer: ReturnType<typeof setTimeout> | null = null
  const onExit = () => settle(true)
  const settle = (exited: boolean) => {
    if (settled) return
    settled = true
    child.removeListener('exit', onExit)
    if (timer) clearTimeout(timer)
    settleExit(exited)
  }
  const exit = new Promise<boolean>((resolve) => {
    settleExit = resolve
  })
  child.once('exit', onExit)

  if (processHasExited(child)) settle(true)
  else if (!requestGracefulShutdown(child, options.message)) settle(false)
  else if (!settled) timer = setTimeout(() => settle(false), Math.max(0, options.timeoutMs))

  if (await exit) return
  await forceStopOwnedProcess(child, options)
}

export async function terminateWindowsProcessTree(pid: number): Promise<void> {
  if (!Number.isInteger(pid) || pid <= 0) throw new Error('Owned process pid must be a positive integer')
  await new Promise<void>((resolve, reject) => {
    const taskkill = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    })
    let settled = false
    const settle = (error?: Error) => {
      if (settled) return
      settled = true
      if (error) reject(error)
      else resolve()
    }
    taskkill.once('error', settle)
    taskkill.once('exit', (code, signal) => {
      if (code === 0) settle()
      else settle(new Error(`taskkill exited with ${signal ? `signal ${signal}` : `code ${code ?? 'unknown'}`}`))
    })
  })
}

function processHasExited(child: OwnedProcess): boolean {
  return child.exitCode != null || child.signalCode != null
}

function requestGracefulShutdown(child: OwnedProcess, message: unknown): boolean {
  if (child.connected === false || typeof child.send !== 'function') return false
  try {
    return child.send(message)
  } catch {
    return false
  }
}

async function forceStopOwnedProcess(child: OwnedProcess, options: OwnedProcessShutdownOptions): Promise<void> {
  const platform = options.platform ?? process.platform
  if (platform === 'win32' && child.pid && child.pid > 0) {
    try {
      await (options.terminateProcessTree ?? terminateWindowsProcessTree)(child.pid)
      return
    } catch {}
  }
  try {
    child.kill('SIGKILL')
  } catch {}
}
