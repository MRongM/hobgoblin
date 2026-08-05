import { execa } from 'execa'
import { existsSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildManagedLocalTerminalInvocation, type LocalTerminalInvocationOptions } from '#/system/local-terminal.ts'
import {
  buildExternalRemoteTerminalInvocation,
  type ExternalRemoteTerminalTarget,
  type RemoteTerminalInvocationOptions,
} from '#/system/remote-terminal.ts'
import { normalizeTmuxSessionDescriptor, type TmuxSessionDescriptor } from '#/system/tmux-session.ts'

const GHOSTTY_BUNDLE_ID = 'com.mitchellh.ghostty'
const APPLE_SCRIPT_TIMEOUT_MS = 5_000
const OPEN_TIMEOUT_MS = 10_000

/** Whether Ghostty.app exists in either of the two locations macOS users
 *  install GUI apps to. Main probes on demand; the current renderer UI
 *  asks once per mounted branch action area, so runtime install/removal
 *  may need a remount or app restart before buttons update. */
export function isGhosttyInstalled(): boolean {
  const candidates = [path.join(os.homedir(), 'Applications/Ghostty.app'), '/Applications/Ghostty.app']
  return candidates.some((p) => existsSync(p))
}

function isUsableDirectory(p: string): boolean {
  if (!path.isAbsolute(p) || p.includes('\0')) return false
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

/** Open `dir` as a new window if Ghostty is already running,
 *  setting the initial working directory via Ghostty's scripting
 *  dictionary (see ghostty/macos/Ghostty.sdef). */
function openInRunningGhostty(dir: string): Promise<boolean> {
  // The path is passed as argv (item 1 of argv), not interpolated,
  // so AppleScript string-escaping isn't a concern. The bundle id is
  // a hardcoded app identifier, not user/settings input. We deliberately
  // don't call `activate` here — Ghostty's `new window` handler already
  // runs NSApp.activate internally (TerminalController.swift), and an
  // extra activate makes macOS pull the user to whichever Space already
  // has a Ghostty window. See ghostty-org/ghostty#11457.
  const script = `
    on run argv
      set dir to item 1 of argv
      tell application "System Events"
        set ghosttyIsRunning to exists (first process whose bundle identifier is "${GHOSTTY_BUNDLE_ID}")
      end tell
      if not ghosttyIsRunning then return "not-running"
      tell application id "${GHOSTTY_BUNDLE_ID}"
        new window with configuration {initial working directory:dir}
      end tell
      return "opened"
    end run
  `
  return execa('/usr/bin/osascript', ['-e', script, dir], {
    timeout: APPLE_SCRIPT_TIMEOUT_MS,
    forceKillAfterDelay: 500,
  }).then(({ stdout }) => stdout.trim() === 'opened')
}

// Open the given directory in Ghostty.
//
// If Ghostty is already running, we drive its AppleScript dictionary
// (com.mitchellh.ghostty) to open a new window in the existing
// instance, passing an inline `surface configuration` record with
// `initial working directory` set (see Ghostty.sdef). This avoids
// spawning a second Ghostty.app process every time.
//
// If Ghostty isn't running, fall back to `open -na Ghostty.app
// --args --working-directory=<path>`. The cold-start path can't
// use AppleScript (no process to talk to) and Ghostty parses
// --args via ghostty_init(argc, argv) at launch — so -n is needed
// to ensure the args are read instead of dropped on activation. The
// working-directory flag is one argv element, not shell text.
//
// Spawned children are detached + unref'd so quitting Goblin doesn't
// bring the terminal down with it.
export async function openInGhostty(
  target: TmuxSessionDescriptor,
  options: LocalTerminalInvocationOptions = {},
): Promise<{ ok: boolean; message: string }> {
  const descriptor = normalizeTmuxSessionDescriptor(target)
  const attachesExistingSession = options.existingTmuxSessionKind !== undefined
  if (!descriptor || (!attachesExistingSession && !isUsableDirectory(descriptor.workingDirectory))) {
    return { ok: false, message: 'error.invalid-path' }
  }
  if (!isGhosttyInstalled()) return { ok: false, message: 'error.ghostty-not-installed' }

  const invocation = buildManagedLocalTerminalInvocation(descriptor, options)
  if (options.useTmux === true && !invocation) return { ok: false, message: 'error.invalid-arguments' }

  if (invocation) {
    return await openCommandInGhostty(invocation, descriptor.workingDirectory, 'local')
  }

  try {
    if (await openInRunningGhostty(descriptor.workingDirectory)) {
      return { ok: true, message: descriptor.workingDirectory }
    }
  } catch (err) {
    console.warn('[ghostty] AppleScript open failed, falling back to launch', err)
  }

  try {
    const child = execa(
      'open',
      ['-na', 'Ghostty.app', '--args', `--working-directory=${descriptor.workingDirectory}`],
      {
        detached: true,
        stdio: 'ignore',
        cleanup: false,
        timeout: OPEN_TIMEOUT_MS,
        forceKillAfterDelay: 500,
      },
    )
    child.unref()
    await child
    return { ok: true, message: descriptor.workingDirectory }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}

function openCommandInRunningGhostty(commandText: string): Promise<boolean> {
  const script = `
    on run argv
      set commandText to item 1 of argv
      tell application "System Events"
        set ghosttyIsRunning to exists (first process whose bundle identifier is "${GHOSTTY_BUNDLE_ID}")
      end tell
      if not ghosttyIsRunning then return "not-running"
      tell application id "${GHOSTTY_BUNDLE_ID}"
        set win to new window with configuration {}
        set term to terminal 1 of selected tab of win
        input text commandText to term
        send key "enter" to term
      end tell
      return "opened"
    end run
  `
  return execa('/usr/bin/osascript', ['-e', script, commandText], {
    timeout: APPLE_SCRIPT_TIMEOUT_MS,
    forceKillAfterDelay: 500,
  }).then(({ stdout }) => stdout.trim() === 'opened')
}

export async function openRemoteInGhostty(
  target: ExternalRemoteTerminalTarget,
  options: RemoteTerminalInvocationOptions = {},
): Promise<{ ok: boolean; message: string }> {
  const invocation = buildExternalRemoteTerminalInvocation(target, options)
  if (!invocation) return { ok: false, message: 'error.invalid-arguments' }
  if (!isGhosttyInstalled()) return { ok: false, message: 'error.ghostty-not-installed' }

  return await openCommandInGhostty(invocation, target.workingDirectory, 'remote')
}

async function openCommandInGhostty(
  invocation: { command: string; args: string[]; shellCommand: string },
  successMessage: string,
  context: 'local' | 'remote',
): Promise<{ ok: boolean; message: string }> {
  try {
    if (await openCommandInRunningGhostty(invocation.shellCommand)) return { ok: true, message: successMessage }
  } catch (err) {
    console.warn(`[ghostty] AppleScript ${context} open failed, falling back to launch`, err)
  }

  try {
    const child = execa('open', ['-na', 'Ghostty.app', '--args', '-e', invocation.command, ...invocation.args], {
      detached: true,
      stdio: 'ignore',
      cleanup: false,
      timeout: OPEN_TIMEOUT_MS,
      forceKillAfterDelay: 500,
    })
    child.unref()
    await child
    return { ok: true, message: successMessage }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}
