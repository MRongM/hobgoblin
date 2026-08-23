// Terminal backend registry. Each terminal app implements TerminalBackend
// and registers itself here. The resolver picks the right one based on
// the user's TerminalPref setting.
//
// Adding a new terminal:
// 1. Create src/main/system/<name>.ts implementing TerminalBackend
// 2. Register it in the `backends` map below
// 3. Add the new id to TerminalPref in shared/rpc.ts
// 4. Add i18n keys for the settings picker

import path from 'node:path'
import type { ExecResult } from '#/shared/git-types.ts'
import { pathStyle } from '#/shared/path-semantics.ts'
import type { ResolvedTerminalApp, TerminalAppAvailability, TerminalPref } from '#/shared/rpc.ts'
import { isGhosttyInstalled, openInGhostty, openRemoteInGhostty } from '#/system/ghostty.ts'
import { isAppleTerminalInstalled, openInAppleTerminal, openRemoteInAppleTerminal } from '#/system/apple-terminal.ts'
import type { ExternalRemoteTerminalTarget } from '#/system/remote-terminal.ts'
import {
  normalizeTmuxSessionDescriptor,
  type ExistingTmuxSessionKind,
  type TmuxSessionDescriptor,
} from '#/system/tmux-session.ts'
import { isWindowsTerminalAvailable, openInWindowsTerminal } from '#/system/windows-terminal.ts'

export type ExternalLocalTerminalTarget = TmuxSessionDescriptor

export interface TerminalOpenOptions {
  useTmux?: boolean
  existingTmuxSessionKind?: ExistingTmuxSessionKind
  existingTmuxSessionName?: string
  existingTmuxServerName?: string
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
  wsl: {
    isInstalled: () => isWin32() && isWindowsTerminalAvailable('wsl'),
    open: (target) => openInSelectedWindowsTerminal(target, 'wsl'),
  },
  powershell: {
    isInstalled: () => isWin32() && isWindowsTerminalAvailable('powershell'),
    open: (target) => openInSelectedWindowsTerminal(target, 'powershell'),
  },
  cmd: {
    isInstalled: () => isWin32() && isWindowsTerminalAvailable('cmd'),
    open: (target) => openInSelectedWindowsTerminal(target, 'cmd'),
  },
}

/** Auto-detection priority — first installed backend wins. */
const AUTO_PRIORITY: ResolvedTerminalApp[] = ['ghostty', 'terminal']
const pendingTerminalOpens = new Map<string, Promise<ExecResult>>()

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

function openInSelectedWindowsTerminal(
  target: ExternalLocalTerminalTarget,
  pref: 'wsl' | 'powershell' | 'cmd',
): Promise<ExecResult> {
  if (!isWin32()) return Promise.resolve({ ok: false, message: 'error.terminal-not-installed' })
  return openInWindowsTerminal(target.workingDirectory, pref)
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
      wsl: false,
      powershell: false,
      cmd: false,
    }
  }
  if (isWin32()) {
    return {
      ghostty: false,
      terminal: isWindowsTerminalAvailable(),
      wsl: backends.wsl.isInstalled(),
      powershell: backends.powershell.isInstalled(),
      cmd: backends.cmd.isInstalled(),
    }
  }
  return {
    ghostty: false,
    terminal: false,
    wsl: false,
    powershell: false,
    cmd: false,
  }
}

/** Open a local workspace in the terminal selected by `pref`. */
export async function openInPreferredTerminal(
  target: ExternalLocalTerminalTarget,
  pref: TerminalPref,
  options: TerminalOpenOptions = {},
): Promise<{ ok: boolean; message: string }> {
  const resolved = resolveTerminalApp(pref, await getTerminalAppAvailability())
  if (!resolved) return { ok: false, message: 'error.terminal-not-installed' }
  const keyTarget = normalizeTerminalOpenKeyTarget(target)
  return await runTerminalOpenSingleFlight(
    [
      'local',
      resolved,
      keyTarget.projectRoot,
      keyTarget.workingDirectory,
      keyTarget.terminalNumber,
      options.useTmux === true,
      options.existingTmuxSessionKind ?? '',
      options.existingTmuxServerName ?? '',
      options.existingTmuxSessionName ?? '',
    ],
    () => backends[resolved].open(target, options),
  )
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
  if (!resolved) return { ok: false, message: 'error.terminal-not-installed' }
  const keyTarget = normalizeTerminalOpenKeyTarget(target)
  return await runTerminalOpenSingleFlight(
    [
      'remote',
      resolved,
      target.alias,
      keyTarget.projectRoot,
      keyTarget.workingDirectory,
      keyTarget.terminalNumber,
      options.useTmux === true,
      options.existingTmuxSessionKind ?? '',
      options.existingTmuxServerName ?? '',
      options.existingTmuxSessionName ?? '',
    ],
    () => openRemoteInTerminalBackend(backends[resolved], target, options),
  )
}

function runTerminalOpenSingleFlight(
  keyParts: readonly (string | number | boolean)[],
  open: () => Promise<ExecResult>,
): Promise<ExecResult> {
  const key = JSON.stringify(keyParts)
  const existing = pendingTerminalOpens.get(key)
  if (existing) return existing

  const pending = Promise.resolve().then(open)
  pendingTerminalOpens.set(key, pending)
  const clear = () => {
    if (pendingTerminalOpens.get(key) === pending) pendingTerminalOpens.delete(key)
  }
  void pending.then(clear, clear)
  return pending
}

function normalizeTerminalOpenKeyTarget(target: TmuxSessionDescriptor): TmuxSessionDescriptor {
  const normalized = normalizeTmuxSessionDescriptor(target)
  if (normalized) return normalized
  return {
    projectRoot: normalizeWindowsTerminalOpenKeyPath(target.projectRoot),
    workingDirectory: normalizeWindowsTerminalOpenKeyPath(target.workingDirectory),
    terminalNumber: target.terminalNumber,
  }
}

function normalizeWindowsTerminalOpenKeyPath(value: string): string {
  const style = pathStyle(value)
  return style === 'windowsDriveAbsolute' || style === 'windowsUncAbsolute'
    ? path.win32.normalize(value).toLowerCase()
    : value
}
