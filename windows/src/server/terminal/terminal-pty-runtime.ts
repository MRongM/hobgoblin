import * as pty from 'node-pty'
import os from 'node:os'
import path from 'node:path'
import {
  resolveWindowsTerminalShellCandidates,
  type WindowsTerminalShellKind,
} from '#/server/terminal/windows-terminal-shell.ts'
import type { TerminalRgbColor, TerminalWindowsPty, TerminalWindowsPtyAppearance } from '#/shared/terminal.ts'

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
  windowsPtyAppearance?: TerminalWindowsPtyAppearance
}

export type SpawnTerminalPtyRuntimeResult =
  | { ok: true; runtime: TerminalPtyRuntime; windowsPty?: TerminalWindowsPty }
  | { ok: false; message: string }

const NODE_PTY_CONPTY_DEFAULT_BUILD = 18309

export function spawnTerminalPtyRuntime(input: SpawnTerminalPtyRuntimeInput): SpawnTerminalPtyRuntimeResult {
  try {
    const candidates = resolveTerminalPtySpawnCandidates(input)
    const env = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' }
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
          process.platform === 'win32' ? candidate.launchedProcessName : undefined,
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
            ? 'No supported Windows terminal shell found'
            : 'error.unknown',
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'error.unknown' }
  }
}

function resolveTerminalPtySpawnCandidates(input: SpawnTerminalPtyRuntimeInput): Array<{
  command: string
  args: string[]
  launchedProcessName?: string
  windowsShellKind?: WindowsTerminalShellKind
}> {
  const candidates = resolveDirectTerminalPtySpawnCandidates(input)
  const appearance = input.windowsPtyAppearance
  if (process.platform !== 'win32' || !appearance) return candidates
  const bootstrap = resolveWindowsTerminalShellCandidates().find(
    (candidate) => candidate.kind === 'windows-powershell' || candidate.kind === 'powershell-core',
  )
  if (!bootstrap) return candidates
  return candidates.map((candidate) => {
    if (candidate.windowsShellKind === 'wsl') return candidate
    return {
      command: bootstrap.command,
      args: [
        ...bootstrap.args,
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        encodeWindowsPtyBootstrap(candidate.command, candidate.args, appearance),
      ],
      launchedProcessName: candidate.launchedProcessName,
    }
  })
}

function resolveDirectTerminalPtySpawnCandidates(input: SpawnTerminalPtyRuntimeInput): Array<{
  command: string
  args: string[]
  launchedProcessName?: string
  windowsShellKind?: WindowsTerminalShellKind
}> {
  if (input.command) {
    return [
      {
        command: input.command,
        args: input.args ?? (process.platform === 'win32' ? [] : ['-l']),
        launchedProcessName: process.platform === 'win32' ? path.win32.basename(input.command) : undefined,
      },
    ]
  }

  if (process.platform === 'win32') {
    return resolveWindowsTerminalShellCandidates().map((candidate) => ({
      command: candidate.command,
      args: input.args ?? candidate.args,
      launchedProcessName: path.win32.basename(candidate.command),
      windowsShellKind: candidate.kind,
    }))
  }

  return [{ command: process.env.SHELL || '/bin/zsh', args: input.args ?? ['-l'] }]
}

function encodeWindowsPtyBootstrap(command: string, args: string[], appearance: TerminalWindowsPtyAppearance): string {
  const foreground = windowsColorRef(appearance.foreground)
  const background = windowsColorRef(appearance.background)
  const invocation = [command, ...args].map(quotePowerShellLiteral).join(' ')
  const script = `$source = @'
using System;
using System.Runtime.InteropServices;

public static class HobgoblinConsoleColors {
    [StructLayout(LayoutKind.Sequential)] public struct COORD { public short X; public short Y; }
    [StructLayout(LayoutKind.Sequential)] public struct SMALL_RECT { public short Left; public short Top; public short Right; public short Bottom; }
    [StructLayout(LayoutKind.Sequential)] public struct CONSOLE_SCREEN_BUFFER_INFOEX {
        public uint cbSize;
        public COORD dwSize;
        public COORD dwCursorPosition;
        public ushort wAttributes;
        public SMALL_RECT srWindow;
        public COORD dwMaximumWindowSize;
        public ushort wPopupAttributes;
        [MarshalAs(UnmanagedType.Bool)] public bool bFullscreenSupported;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 16)] public uint[] ColorTable;
    }
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr GetStdHandle(int handle);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetConsoleScreenBufferInfoEx(IntPtr output, ref CONSOLE_SCREEN_BUFFER_INFOEX info);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetConsoleScreenBufferInfoEx(IntPtr output, ref CONSOLE_SCREEN_BUFFER_INFOEX info);
    public static void SetDefaultColors(uint foreground, uint background) {
        var info = new CONSOLE_SCREEN_BUFFER_INFOEX();
        info.cbSize = (uint)Marshal.SizeOf(info);
        info.ColorTable = new uint[16];
        var output = GetStdHandle(-11);
        if (!GetConsoleScreenBufferInfoEx(output, ref info)) return;
        info.ColorTable[7] = foreground;
        info.ColorTable[0] = background;
        info.wAttributes = (ushort)((info.wAttributes & 0xff00) | 7);
        SetConsoleScreenBufferInfoEx(output, ref info);
    }
}
'@
Add-Type -TypeDefinition $source
[HobgoblinConsoleColors]::SetDefaultColors(${foreground}, ${background})
& ${invocation}
exit $LASTEXITCODE
`
  return Buffer.from(script, 'utf16le').toString('base64')
}

function windowsColorRef(color: TerminalRgbColor): number {
  return color.red | (color.green << 8) | (color.blue << 16)
}

function quotePowerShellLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
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
