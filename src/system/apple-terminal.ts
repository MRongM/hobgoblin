import { execa } from 'execa'
import type { ExecResult } from '#/shared/git-types.ts'
import { statSync } from 'node:fs'
import path from 'node:path'
import { buildManagedLocalTerminalInvocation } from '#/system/local-terminal.ts'
import { buildExternalRemoteTerminalInvocation, type ExternalRemoteTerminalTarget } from '#/system/remote-terminal.ts'
import { normalizeTmuxSessionDescriptor, type TmuxSessionDescriptor } from '#/system/tmux-session.ts'

const OPEN_TIMEOUT_MS = 10_000
export const TERMINAL_APP_CANDIDATES = [
  '/System/Applications/Utilities/Terminal.app',
  '/Applications/Utilities/Terminal.app',
]

function isUsableDirectory(p: string): boolean {
  if (!path.isAbsolute(p) || p.includes('\0')) return false
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

/** Open `dir` in macOS Terminal.app.
 *
 *  `open -a Terminal <dir>` tells macOS to open a new Terminal window
 *  with its working directory set to `dir`. Works whether Terminal is
 *  already running or not — the path is passed as a native argument,
 *  so there are no escaping or injection concerns. */
export async function openInAppleTerminal(
  target: TmuxSessionDescriptor,
  options: { useTmux?: boolean } = {},
): Promise<{ ok: boolean; message: string }> {
  const descriptor = normalizeTmuxSessionDescriptor(target)
  if (!descriptor || !isUsableDirectory(descriptor.workingDirectory)) {
    return { ok: false, message: 'error.invalid-path' }
  }

  if (options.useTmux === true) {
    const invocation = buildManagedLocalTerminalInvocation(descriptor, options)
    if (!invocation) return { ok: false, message: 'error.invalid-arguments' }
    return await runCommandInAppleTerminal(invocation.shellCommand, descriptor.workingDirectory)
  }

  try {
    await execa('open', ['-a', 'Terminal', descriptor.workingDirectory], {
      timeout: OPEN_TIMEOUT_MS,
      forceKillAfterDelay: 500,
    })
    return { ok: true, message: descriptor.workingDirectory }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}

export async function openRemoteInAppleTerminal(
  target: ExternalRemoteTerminalTarget,
  options: { useTmux?: boolean } = {},
): Promise<{ ok: boolean; message: string }> {
  const invocation = buildExternalRemoteTerminalInvocation(target, options)
  if (!invocation) return { ok: false, message: 'error.invalid-arguments' }

  return await runCommandInAppleTerminal(invocation.shellCommand, target.workingDirectory)
}

async function runCommandInAppleTerminal(commandText: string, successMessage: string): Promise<ExecResult> {
  const script = `
    on run argv
      set commandText to item 1 of argv
      tell application "Terminal"
        activate
        do script commandText
      end tell
    end run
  `

  try {
    await execa('/usr/bin/osascript', ['-e', script, commandText], {
      timeout: OPEN_TIMEOUT_MS,
      forceKillAfterDelay: 500,
    })
    return { ok: true, message: successMessage }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}

export function hasAppleTerminalAtKnownPaths(candidates: readonly string[] = TERMINAL_APP_CANDIDATES): boolean {
  return candidates.some((candidate) => isUsableDirectory(candidate))
}

export async function isAppleTerminalInstalled(_signal?: AbortSignal): Promise<boolean> {
  return hasAppleTerminalAtKnownPaths()
}
