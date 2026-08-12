import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { statSync } from 'node:fs'
import { execa } from 'execa'
import { pathStyle } from '#/shared/path-semantics.ts'
import type { ExecResult } from '#/shared/git-types.ts'
import { hasCommand } from '#/system/command.ts'

const OPEN_TIMEOUT_MS = 10_000
const POWERSHELL_CWD_ENV = 'HOBGOBLIN_WINDOWS_TERMINAL_CWD'
const POWERSHELL_START_COMMAND =
  "Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoLogo', '-NoExit') -WorkingDirectory $env:HOBGOBLIN_WINDOWS_TERMINAL_CWD -WindowStyle Normal"

export function isWindowsTerminalAvailable(): boolean {
  return hasCommand('wt.exe') || hasCommand('powershell.exe')
}

function isUsableWindowsDirectory(p: string): boolean {
  const style = pathStyle(p)
  if (p.includes('\0') || (style !== 'windowsDriveAbsolute' && style !== 'windowsUncAbsolute')) return false
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

export async function openInWindowsTerminal(p: string): Promise<ExecResult> {
  if (!isUsableWindowsDirectory(p)) return { ok: false, message: 'error.invalid-path' }
  if (hasCommand('wt.exe')) {
    try {
      await spawnDetached('wt.exe', ['-d', p])
      return { ok: true, message: p }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  }

  if (hasCommand('powershell.exe')) {
    try {
      await execa('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', POWERSHELL_START_COMMAND], {
        env: { [POWERSHELL_CWD_ENV]: p },
        timeout: OPEN_TIMEOUT_MS,
        forceKillAfterDelay: 500,
        windowsHide: true,
      })
      return { ok: true, message: p }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  }

  return { ok: false, message: 'error.terminal-not-installed' }
}

async function spawnDetached(command: string, args: string[]): Promise<void> {
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  })
  await once(child, 'spawn')
  child.unref()
}
