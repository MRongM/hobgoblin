import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { statSync } from 'node:fs'
import { execa } from 'execa'
import { pathStyle } from '#/shared/path-semantics.ts'
import type { ExecResult } from '#/shared/git-types.ts'
import type { WindowsExternalTerminalPref } from '#/shared/settings.ts'
import { resolveUsableWindowsWslExecutable } from '#/shared/windows-wsl.ts'
import { hasCommand } from '#/system/command.ts'

const OPEN_TIMEOUT_MS = 10_000
const POWERSHELL_CWD_ENV = 'HOBGOBLIN_WINDOWS_TERMINAL_CWD'
const POWERSHELL_START_COMMAND =
  "Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoLogo', '-NoExit') -WorkingDirectory $env:HOBGOBLIN_WINDOWS_TERMINAL_CWD -WindowStyle Normal"

export type WindowsTerminalLaunchPreference = 'auto' | WindowsExternalTerminalPref

export function isWindowsTerminalAvailable(pref: WindowsTerminalLaunchPreference = 'auto'): boolean {
  if (pref === 'wsl') return hasCommand('wt.exe') && resolveUsableWindowsWslExecutable() !== null
  if (pref === 'powershell') return hasCommand('powershell.exe')
  if (pref === 'cmd') return hasCommand('cmd.exe')
  return hasCommand('wt.exe') || hasCommand('powershell.exe') || hasCommand('cmd.exe')
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

export async function openInWindowsTerminal(
  p: string,
  pref: WindowsTerminalLaunchPreference = 'auto',
): Promise<ExecResult> {
  if (!isUsableWindowsDirectory(p)) return { ok: false, message: 'error.invalid-path' }

  if (pref === 'wsl') return await openSelectedWsl(p)
  if (pref === 'powershell') return await openSelectedPowerShell(p)
  if (pref === 'cmd') return await openSelectedCmd(p)

  let windowsTerminalError: string | null = null

  if (hasCommand('wt.exe')) {
    const wslExecutable = resolveUsableWindowsWslExecutable()
    const args = wslExecutable ? ['-d', p, wslExecutable] : ['-d', p]
    try {
      await spawnDetached('wt.exe', args)
      return { ok: true, message: p }
    } catch (err) {
      windowsTerminalError = err instanceof Error ? err.message : String(err)
    }
  }

  if (hasCommand('powershell.exe')) {
    return await openPowerShellDirect(p)
  }

  if (hasCommand('cmd.exe')) {
    return await openCmdDirect(p)
  }

  if (windowsTerminalError !== null) return { ok: false, message: windowsTerminalError }
  return { ok: false, message: 'error.terminal-not-installed' }
}

async function openSelectedWsl(p: string): Promise<ExecResult> {
  const wslExecutable = resolveUsableWindowsWslExecutable()
  if (!wslExecutable || !hasCommand('wt.exe')) return { ok: false, message: 'error.terminal-not-installed' }
  try {
    await spawnDetached('wt.exe', ['-d', p, wslExecutable])
    return { ok: true, message: p }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}

async function openSelectedPowerShell(p: string): Promise<ExecResult> {
  if (!hasCommand('powershell.exe')) return { ok: false, message: 'error.terminal-not-installed' }
  if (hasCommand('wt.exe')) {
    try {
      await spawnDetached('wt.exe', ['-d', p, 'powershell.exe', '-NoLogo', '-NoExit'])
      return { ok: true, message: p }
    } catch {
      // Keep the selected shell, but fall back from Windows Terminal to its
      // standalone host when Windows Terminal itself cannot launch.
    }
  }
  return await openPowerShellDirect(p)
}

async function openPowerShellDirect(p: string): Promise<ExecResult> {
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

async function openSelectedCmd(p: string): Promise<ExecResult> {
  if (!hasCommand('cmd.exe')) return { ok: false, message: 'error.terminal-not-installed' }
  if (hasCommand('wt.exe')) {
    try {
      await spawnDetached('wt.exe', ['-d', p, 'cmd.exe', '/K'])
      return { ok: true, message: p }
    } catch {
      // Keep the selected shell and use its standalone console host.
    }
  }
  return await openCmdDirect(p)
}

async function openCmdDirect(p: string): Promise<ExecResult> {
  try {
    await spawnDetached('cmd.exe', ['/K'], p)
    return { ok: true, message: p }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}

export async function openWslInWindowsTerminal(distribution: string, linuxPath: string): Promise<ExecResult> {
  const wslExecutable = resolveUsableWindowsWslExecutable()
  if (
    !wslExecutable ||
    !distribution.trim() ||
    distribution.includes('\0') ||
    !linuxPath.startsWith('/') ||
    linuxPath.includes('\0')
  ) {
    return { ok: false, message: 'error.invalid-path' }
  }
  if (!hasCommand('wt.exe')) return { ok: false, message: 'error.terminal-not-installed' }
  try {
    await spawnDetached('wt.exe', [wslExecutable, '--distribution', distribution.trim(), '--cd', linuxPath])
    return { ok: true, message: linuxPath }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}

async function spawnDetached(command: string, args: string[], cwd?: string): Promise<void> {
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
    ...(cwd ? { cwd } : {}),
  })
  await once(child, 'spawn')
  child.unref()
}
