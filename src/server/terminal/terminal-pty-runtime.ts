import * as pty from 'node-pty'
import os from 'node:os'
import path from 'node:path'
import { resolveWindowsTerminalShellCandidates } from '#/server/terminal/windows-terminal-shell.ts'
import { normalizeWindowsInternalTerminalShellPref, type WindowsInternalTerminalShellPref } from '#/shared/settings.ts'
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
  windowsInternalTerminalShell?: WindowsInternalTerminalShellPref
}

export type SpawnTerminalPtyRuntimeResult =
  | { ok: true; runtime: TerminalPtyRuntime; windowsPty?: TerminalWindowsPty }
  | { ok: false; message: string }

const NODE_PTY_CONPTY_DEFAULT_BUILD = 18309

export function spawnTerminalPtyRuntime(input: SpawnTerminalPtyRuntimeInput): SpawnTerminalPtyRuntimeResult {
  try {
    const candidates = resolveTerminalPtySpawnCandidates(input)
    const env = { ...process.env, TERM: 'xterm-256color' }
    let lastError: unknown

    for (const candidate of candidates) {
      try {
        const term = pty.spawn(candidate.command, candidate.args, {
          name: 'xterm-256color',
          cols: input.cols,
          rows: input.rows,
          cwd: input.cwd,
          env,
          ...(process.platform === 'win32' ? { useConptyDll: true } : {}),
        })
        const windowsPty = detectWindowsPtyCompatibility(process.platform, os.release())
        const runtime = new NodePtyTerminalRuntime(
          term,
          process.platform === 'win32' ? path.win32.basename(candidate.command) : undefined,
        )
        return windowsPty ? { ok: true, runtime, windowsPty } : { ok: true, runtime }
      } catch (error) {
        lastError = error
      }
    }

    return {
      ok: false,
      message:
        lastError instanceof Error
          ? lastError.message
          : process.platform === 'win32' && !input.command
            ? windowsInternalTerminalShellUnavailableMessage(input.windowsInternalTerminalShell)
            : 'error.unknown',
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'error.unknown' }
  }
}

function resolveTerminalPtySpawnCandidates(
  input: SpawnTerminalPtyRuntimeInput,
): Array<{ command: string; args: string[] }> {
  if (input.command) {
    return [
      {
        command: input.command,
        args: input.args ?? (process.platform === 'win32' ? [] : ['-l']),
      },
    ]
  }

  if (process.platform === 'win32') {
    return resolveWindowsTerminalShellCandidates({
      cwd: input.cwd,
      ...(input.windowsInternalTerminalShell
        ? { preference: normalizeWindowsInternalTerminalShellPref(input.windowsInternalTerminalShell) }
        : {}),
    }).map((candidate) => ({
      command: candidate.command,
      args: input.args ?? candidate.args,
    }))
  }

  return [{ command: process.env.SHELL || '/bin/zsh', args: input.args ?? ['-l'] }]
}

function windowsInternalTerminalShellUnavailableMessage(
  preference: WindowsInternalTerminalShellPref | undefined,
): string {
  const normalized = normalizeWindowsInternalTerminalShellPref(preference)
  return normalized === 'auto'
    ? 'No supported Windows terminal shell found'
    : `error.windows-internal-terminal-${normalized}-unavailable`
}

export function detectWindowsPtyCompatibility(
  platform: NodeJS.Platform | string,
  release: string,
): TerminalWindowsPty | null {
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
  private readonly launchedProcessName: string | undefined

  constructor(term: pty.IPty, launchedProcessName?: string) {
    this.term = term
    this.launchedProcessName = launchedProcessName
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
    return this.launchedProcessName ?? readTerminalProcessName(this.term)
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
