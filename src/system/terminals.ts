// Terminal backend registry. Each terminal app implements TerminalBackend
// and registers itself here. The resolver picks the right one based on
// the user's TerminalPref setting.
//
// Adding a new terminal:
// 1. Create src/main/system/<name>.ts implementing TerminalBackend
// 2. Register it in the `backends` map below
// 3. Add the new id to TerminalPref in shared/rpc.ts
// 4. Add i18n keys for the settings picker

import type { ExecResult } from '#/shared/git-types.ts'
import type { ResolvedTerminalApp, TerminalAppAvailability, TerminalPref } from '#/shared/rpc.ts'
import { isGhosttyInstalled, openInGhostty, openRemoteInGhostty } from '#/system/ghostty.ts'
import { isAppleTerminalInstalled, openInAppleTerminal, openRemoteInAppleTerminal } from '#/system/apple-terminal.ts'
import type { ExternalRemoteTerminalTarget } from '#/system/remote-terminal.ts'
import type { TmuxSessionDescriptor } from '#/system/tmux-session.ts'
import { isWindowsTerminalAvailable, openInWindowsTerminal } from '#/system/windows-terminal.ts'

export type ExternalLocalTerminalTarget = TmuxSessionDescriptor

export interface TerminalOpenOptions {
  useTmux?: boolean
}

export interface TerminalBackend {
  /** Whether this terminal is available on the current system.
   *  Sync — backed by file-existence checks that are cheap on macOS.
   *  If a future backend needs async detection (e.g. mdfind), resolve
   *  it at registration time and cache the result. */
  isInstalled: () => boolean
  /** Open a local workspace in this terminal. */
  open: (target: ExternalLocalTerminalTarget, options?: TerminalOpenOptions) => Promise<ExecResult>
  /** Open a remote SSH workspace in this terminal. */
  openRemote?: (target: ExternalRemoteTerminalTarget, options?: TerminalOpenOptions) => Promise<ExecResult>
}

/** Concrete terminal pref values (excludes 'auto'). */
const backends: Record<ResolvedTerminalApp, TerminalBackend> = {
  ghostty: { isInstalled: isGhosttyInstalled, open: openInGhostty, openRemote: openRemoteInGhostty },
  terminal: { isInstalled: () => true, open: openInNativeTerminal, openRemote: openRemoteInNativeTerminal },
}

/** Auto-detection priority — first installed backend wins. */
const AUTO_PRIORITY: ResolvedTerminalApp[] = ['ghostty', 'terminal']

function isDarwin(): boolean {
  return process.platform === 'darwin'
}

function isWin32(): boolean {
  return process.platform === 'win32'
}

function openInNativeTerminal(target: ExternalLocalTerminalTarget, options?: TerminalOpenOptions): Promise<ExecResult> {
  if (isDarwin()) return openInAppleTerminal(target, options)
  if (isWin32()) return openInWindowsTerminal(target.workingDirectory)
  return Promise.resolve({ ok: false, message: 'error.terminal-not-installed' })
}

function openRemoteInNativeTerminal(
  target: ExternalRemoteTerminalTarget,
  options?: TerminalOpenOptions,
): Promise<ExecResult> {
  if (isDarwin()) return openRemoteInAppleTerminal(target, options)
  return Promise.resolve({ ok: false, message: 'error.remote-terminal-not-supported' })
}

export function resolveTerminalApp(
  pref: TerminalPref,
  availability: TerminalAppAvailability,
): ResolvedTerminalApp | null {
  if (pref !== 'auto') {
    return availability[pref] ? pref : null
  }
  for (const id of AUTO_PRIORITY) {
    if (availability[id]) return id
  }
  return null
}

export async function getTerminalAppAvailability(signal?: AbortSignal): Promise<TerminalAppAvailability> {
  if (isDarwin()) {
    return {
      ghostty: backends.ghostty.isInstalled(),
      terminal: await isAppleTerminalInstalled(signal),
    }
  }
  if (isWin32()) {
    return {
      ghostty: false,
      terminal: isWindowsTerminalAvailable(),
    }
  }
  return {
    ghostty: false,
    terminal: false,
  }
}

/** Open a local workspace in the terminal selected by `pref`. */
export async function openInPreferredTerminal(
  target: ExternalLocalTerminalTarget,
  pref: TerminalPref,
  options: TerminalOpenOptions = {},
): Promise<{ ok: boolean; message: string }> {
  const resolved = resolveTerminalApp(pref, await getTerminalAppAvailability())
  return resolved
    ? backends[resolved].open(target, options)
    : Promise.resolve({ ok: false, message: 'error.terminal-not-installed' })
}

export function openRemoteInTerminalBackend(
  backend: TerminalBackend | null,
  target: ExternalRemoteTerminalTarget,
  options: TerminalOpenOptions = {},
): Promise<ExecResult> {
  if (!backend) return Promise.resolve({ ok: false, message: 'error.terminal-not-installed' })
  return backend.openRemote
    ? backend.openRemote(target, options)
    : Promise.resolve({ ok: false, message: 'error.remote-terminal-not-supported' })
}

export async function openRemoteInPreferredTerminal(
  target: ExternalRemoteTerminalTarget,
  pref: TerminalPref,
  options: TerminalOpenOptions = {},
): Promise<ExecResult> {
  const resolved = resolveTerminalApp(pref, await getTerminalAppAvailability())
  return await openRemoteInTerminalBackend(resolved ? backends[resolved] : null, target, options)
}
