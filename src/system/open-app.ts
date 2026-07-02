// Shared utilities for opening a path in a macOS .app.
//
// VS Code-family editors (VS Code, Cursor, Windsurf) ship a CLI binary
// inside their .app bundle at Contents/Resources/app/bin/<name>. Using
// this CLI is more reliable than `open -a` because the CLI talks to the
// editor's IPC channel directly, whereas `open -a` just activates the
// app and newer hub/home UIs may ignore the path argument.

import { execa } from 'execa'
import { existsSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { EditorOpenTarget } from '#/shared/file-path-target.ts'
import { editorTargetPath, editorTargetPathArgument } from '#/shared/file-path-target.ts'
import { pathStyle } from '#/shared/path-semantics.ts'
import { firstAvailableCommand } from '#/system/command.ts'

const OPEN_TIMEOUT_MS = 10_000

function isUsableEditorPath(p: string): boolean {
  if (!path.isAbsolute(p) || p.includes('\0')) return false
  try {
    const stat = statSync(p)
    return stat.isDirectory() || stat.isFile()
  } catch {
    return false
  }
}

/** Standard macOS install locations for a .app bundle. */
export function appCandidates(appName: string): string[] {
  return [path.join(os.homedir(), `Applications/${appName}.app`), `/Applications/${appName}.app`]
}

/** Find the first existing .app bundle path for `appName`, or null. */
function resolveAppPath(appName: string): string | null {
  return appCandidates(appName).find((p) => existsSync(p)) ?? null
}

/** Resolve the CLI binary inside a VS Code-family .app bundle.
 *  Returns null if the binary doesn't exist. */
function resolveAppCli(appName: string, cliName: string): string | null {
  const appPath = resolveAppPath(appName)
  if (!appPath) return null
  const cli = path.join(appPath, 'Contents/Resources/app/bin', cliName)
  return existsSync(cli) ? cli : null
}

export function hasAppCli(appName: string, cliName: string): boolean {
  return resolveAppCli(appName, cliName) !== null
}

function editorCliCandidates(cliName: string): string[] {
  return process.platform === 'win32' ? [`${cliName}.cmd`, `${cliName}.exe`, cliName] : [cliName]
}

function resolveEditorCommand(cliName: string): string | null {
  return firstAvailableCommand(editorCliCandidates(cliName))
}

function isUsableEditorPathForPlatform(p: string): boolean {
  if (p.includes('\0')) return false
  if (process.platform === 'win32') {
    const style = pathStyle(p)
    if (style !== 'windowsDriveAbsolute' && style !== 'windowsUncAbsolute') return false
  } else if (!path.isAbsolute(p)) {
    return false
  }
  try {
    const stat = statSync(p)
    return stat.isDirectory() || stat.isFile()
  } catch {
    return false
  }
}

export function hasEditorCli(appName: string, cliName: string): boolean {
  if (process.platform === 'darwin') return hasAppCli(appName, cliName)
  return resolveEditorCommand(cliName) !== null
}

export function openByEditorCli(
  appName: string,
  cliName: string,
  target: EditorOpenTarget,
): Promise<{ ok: boolean; message: string }> {
  if (process.platform === 'darwin') return openByAppCli(appName, cliName, target)
  const targetPath = editorTargetPath(target)
  if (!isUsableEditorPathForPlatform(targetPath)) return Promise.resolve({ ok: false, message: 'error.invalid-path' })

  const command = resolveEditorCommand(cliName)
  if (!command) return Promise.resolve({ ok: false, message: 'error.editor-not-installed' })

  const args =
    typeof target === 'string' || target.line === undefined
      ? [targetPath]
      : ['--goto', editorTargetPathArgument(target)]

  return execa(command, args, {
    timeout: OPEN_TIMEOUT_MS,
    forceKillAfterDelay: 500,
    reject: false,
  }).then((result) => {
    if (result.failed) {
      const message = result.stderr?.trim() || result.shortMessage || result.message || 'error.editor-not-installed'
      return { ok: false, message }
    }
    return { ok: true, message: targetPath }
  })
}

/** Open `targetPath` using the CLI binary inside a VS Code-family .app bundle.
 *  Returns an error if the CLI binary isn't found — `open -a` is not
 *  used as a fallback because newer editor UIs (e.g. Cursor's Home)
 *  silently ignore the path argument passed via Launch Services. */
export function openByAppCli(
  appName: string,
  cliName: string,
  target: EditorOpenTarget,
): Promise<{ ok: boolean; message: string }> {
  const targetPath = editorTargetPath(target)
  if (!isUsableEditorPath(targetPath)) return Promise.resolve({ ok: false, message: 'error.invalid-path' })

  const cli = resolveAppCli(appName, cliName)
  if (!cli) return Promise.resolve({ ok: false, message: 'error.editor-not-installed' })

  const args =
    typeof target === 'string' || target.line === undefined
      ? [targetPath]
      : ['--goto', editorTargetPathArgument(target)]

  return execa(cli, args, {
    timeout: OPEN_TIMEOUT_MS,
    forceKillAfterDelay: 500,
    reject: false,
  }).then((result) => {
    if (result.failed) {
      const message = result.stderr?.trim() || result.shortMessage || result.message || 'error.editor-not-installed'
      return { ok: false, message }
    }
    return { ok: true, message: targetPath }
  })
}

function isSafeRemoteAlias(alias: string): boolean {
  return alias.length > 0 && alias.length <= 255 && !/[\s\0/?#\\]/.test(alias)
}

function isSafeRemoteAbsolutePath(remotePath: string): boolean {
  return (
    remotePath.length > 0 &&
    remotePath.length <= 4096 &&
    remotePath.startsWith('/') &&
    !/[\0-\x1f\x7f]/.test(remotePath)
  )
}

export function openRemoteByAppCli(
  appName: string,
  cliName: string,
  alias: string,
  target: EditorOpenTarget,
): Promise<{ ok: boolean; message: string }> {
  const remotePath = editorTargetPath(target)
  if (!isSafeRemoteAlias(alias) || !isSafeRemoteAbsolutePath(remotePath)) {
    return Promise.resolve({ ok: false, message: 'error.invalid-arguments' })
  }

  const cli = resolveAppCli(appName, cliName)
  if (!cli) return Promise.resolve({ ok: false, message: 'error.editor-not-installed' })

  const args =
    typeof target === 'string' || target.line === undefined
      ? ['--remote', `ssh-remote+${alias}`, remotePath]
      : ['--remote', `ssh-remote+${alias}`, '--goto', editorTargetPathArgument(target)]

  return execa(cli, args, {
    timeout: OPEN_TIMEOUT_MS,
    forceKillAfterDelay: 500,
    reject: false,
  }).then((result) => {
    if (result.failed) {
      const message = result.stderr?.trim() || result.shortMessage || result.message || 'error.remote-editor-not-supported'
      return { ok: false, message }
    }
    return { ok: true, message: remotePath }
  })
}
