import * as pty from 'node-pty'
import os from 'node:os'
import type { TerminalWindowsPty } from '#/shared/terminal.ts'

export interface TerminalPtyRuntime {
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
  onData(listener: (data: string) => void): { dispose(): void }
  onExit(listener: () => void): { dispose(): void }
  processName(): string
}

export interface SpawnTerminalPtyRuntimeInput {
  command?: string
  args?: string[]
  cwd: string
  cols: number
  rows: number
}

export type SpawnTerminalPtyRuntimeResult =
  | { ok: true; runtime: TerminalPtyRuntime; windowsPty?: TerminalWindowsPty }
  | { ok: false; message: string }

const NODE_PTY_CONPTY_DEFAULT_BUILD = 18309

export function spawnTerminalPtyRuntime(input: SpawnTerminalPtyRuntimeInput): SpawnTerminalPtyRuntimeResult {
  try {
    const shell = input.command || process.env.SHELL || (process.platform === 'win32' ? process.env.COMSPEC || 'cmd.exe' : '/bin/zsh')
    const args = input.args ?? (process.platform === 'win32' ? [] : ['-l'])
    const env = { ...process.env, TERM: 'xterm-256color' }
    const term = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols: input.cols,
      rows: input.rows,
      cwd: input.cwd,
      env,
    })
    const windowsPty = detectWindowsPtyCompatibility(process.platform, os.release())
    return windowsPty
      ? { ok: true, runtime: new NodePtyTerminalRuntime(term), windowsPty }
      : { ok: true, runtime: new NodePtyTerminalRuntime(term) }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'error.unknown' }
  }
}

export function detectWindowsPtyCompatibility(platform: NodeJS.Platform | string, release: string): TerminalWindowsPty | null {
  if (platform !== 'win32') return null
  const buildNumber = parseWindowsBuildNumber(release)
  const backend = buildNumber !== null && buildNumber < NODE_PTY_CONPTY_DEFAULT_BUILD ? 'winpty' : 'conpty'
  return buildNumber === null ? { backend } : { backend, buildNumber }
}

function parseWindowsBuildNumber(release: string): number | null {
  const match = /^\d+\.\d+\.(\d+)/.exec(release)
  if (!match) return null
  const buildNumber = Number.parseInt(match[1]!, 10)
  return Number.isSafeInteger(buildNumber) && buildNumber >= 0 ? buildNumber : null
}

class NodePtyTerminalRuntime implements TerminalPtyRuntime {
  private readonly term: pty.IPty

  constructor(term: pty.IPty) {
    this.term = term
  }

  write(data: string): void {
    this.term.write(data)
  }

  resize(cols: number, rows: number): void {
    this.term.resize(cols, rows)
  }

  kill(): void {
    this.term.kill()
  }

  onData(listener: (data: string) => void): { dispose(): void } {
    return this.term.onData(listener)
  }

  onExit(listener: () => void): { dispose(): void } {
    return this.term.onExit(listener)
  }

  processName(): string {
    return readTerminalProcessName(this.term)
  }
}

function readTerminalProcessName(term: pty.IPty): string {
  try {
    const processName = term.process
    if (typeof processName !== 'string') return 'terminal'
    return processName.trim() || 'terminal'
  } catch {
    return 'terminal'
  }
}
