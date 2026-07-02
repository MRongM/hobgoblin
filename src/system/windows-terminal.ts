import { execa } from 'execa'
import { statSync } from 'node:fs'
import { pathStyle } from '#/shared/path-semantics.ts'
import type { ExecResult } from '#/shared/git-types.ts'
import { hasCommand } from '#/system/command.ts'

const OPEN_TIMEOUT_MS = 10_000

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
      await execa('wt.exe', ['-d', p], {
        timeout: OPEN_TIMEOUT_MS,
        forceKillAfterDelay: 500,
      })
      return { ok: true, message: p }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  }

  if (hasCommand('powershell.exe')) {
    try {
      await execa('powershell.exe', ['-NoExit', '-Command', 'Set-Location -LiteralPath $args[0]', p], {
        timeout: OPEN_TIMEOUT_MS,
        forceKillAfterDelay: 500,
      })
      return { ok: true, message: p }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  }

  return { ok: false, message: 'error.terminal-not-installed' }
}
