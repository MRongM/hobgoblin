import { isWslRepoId, normalizeRemoteRepoId, parseRemoteRepoId } from '#/shared/remote-repo.ts'
import { pathStyle, windowsPathIdentityKey } from '#/shared/path-semantics.ts'

export type LocalFilePathContext = { kind: 'windows' } | { kind: 'wsl'; distribution: string } | { kind: 'posix' }

export type LocalFilePathResolution =
  | {
      execution: 'windows'
      inputKind: 'windows-drive' | 'windows-unc' | 'wsl-drive-mount'
      identityKey: string
      projectPath: string
      windowsPath: string
    }
  | {
      execution: 'wsl'
      inputKind: 'wsl-repo-id' | 'wsl-unc' | 'posix'
      identityKey: string
      projectPath: string
      distribution: string
      linuxPath: string
    }
  | {
      execution: 'posix'
      inputKind: 'posix'
      identityKey: string
      projectPath: string
      posixPath: string
    }

const WINDOWS_DRIVE_RE = /^([A-Za-z]):[\\/](.*)$/u
const WSL_MOUNT_RE = /^\/mnt\/([A-Za-z])(?:\/(.*))?$/u
const WSL_UNC_RE = /^\\\\(wsl\.localhost|wsl\$)[\\/]([^\\/\0]+)(?:[\\/](.*))?$/iu

export function resolveLocalFilePath(input: string, context?: LocalFilePathContext): LocalFilePathResolution | null {
  if (hasUnsafeText(input)) return null

  const wslRepo = resolveWslRepoId(input)
  if (wslRepo) return wslRepo

  const wslUnc = resolveWslUnc(input)
  if (wslUnc) return wslUnc

  const windowsDrive = resolveWindowsDrive(input, 'windows-drive')
  if (windowsDrive) return windowsDrive

  const posixPath = normalizePosixAbsolute(input)
  if (posixPath) {
    const mount = WSL_MOUNT_RE.exec(posixPath)
    if (mount) {
      const drive = (mount[1] ?? '').toUpperCase()
      const tail = mount[2] ?? ''
      return resolveWindowsDrive(`${drive}:/${tail}`, 'wsl-drive-mount')
    }
    if (context?.kind === 'wsl') return wslResolution('posix', context.distribution, posixPath)
    return {
      execution: 'posix',
      inputKind: 'posix',
      identityKey: `posix:${posixPath}`,
      projectPath: posixPath,
      posixPath,
    }
  }

  if (pathStyle(input) === 'windowsUncAbsolute') return resolveWindowsUnc(input)
  return null
}

export function localFilePathIdentityKey(input: string, context?: LocalFilePathContext): string | null {
  return resolveLocalFilePath(input, context)?.identityKey ?? null
}

export function sameLocalFilePath(left: string, right: string, context?: LocalFilePathContext): boolean {
  const leftIdentity = localFilePathIdentityKey(left, context)
  const rightIdentity = localFilePathIdentityKey(right, context)
  return leftIdentity !== null && leftIdentity === rightIdentity
}

function resolveWslRepoId(input: string): LocalFilePathResolution | null {
  if (!isWslRepoId(input)) return null
  const ref = parseRemoteRepoId(input)
  if (!ref || ref.transport !== 'wsl') return null
  return wslResolution('wsl-repo-id', ref.alias, ref.remotePath)
}

function resolveWslUnc(input: string): LocalFilePathResolution | null {
  const match = WSL_UNC_RE.exec(input)
  if (!match) return null
  const distribution = match[2] ?? ''
  const linuxPath = normalizePosixAbsolute(`/${(match[3] ?? '').replace(/\\/gu, '/')}`)
  return linuxPath ? wslResolution('wsl-unc', distribution, linuxPath) : null
}

function wslResolution(
  inputKind: 'wsl-repo-id' | 'wsl-unc' | 'posix',
  distribution: string,
  linuxPath: string,
): LocalFilePathResolution | null {
  const normalizedDistribution = distribution.trim()
  try {
    const projectPath = normalizeRemoteRepoId({
      transport: 'wsl',
      alias: normalizedDistribution,
      remotePath: linuxPath,
    })
    return {
      execution: 'wsl',
      inputKind,
      identityKey: `wsl:${encodeURIComponent(normalizedDistribution.toLowerCase())}:${linuxPath}`,
      projectPath,
      distribution: normalizedDistribution,
      linuxPath,
    }
  } catch {
    return null
  }
}

function resolveWindowsDrive(
  input: string,
  inputKind: 'windows-drive' | 'wsl-drive-mount',
): LocalFilePathResolution | null {
  const match = WINDOWS_DRIVE_RE.exec(input)
  if (!match) return null
  const drive = (match[1] ?? '').toUpperCase()
  const tail = normalizeAbsoluteParts((match[2] ?? '').split(/[\\/]+/u))
  const windowsPath = `${drive}:\\${tail.join('\\')}`
  const windowsIdentity = windowsPathIdentityKey(windowsPath)
  if (!windowsIdentity) return null
  return {
    execution: 'windows',
    inputKind,
    identityKey: `windows:${windowsIdentity}`,
    projectPath: windowsPath,
    windowsPath,
  }
}

function resolveWindowsUnc(input: string): LocalFilePathResolution | null {
  const parts = input.slice(2).split(/[\\/]+/u)
  const root = parts.slice(0, 2)
  if (root.length !== 2 || root.some((part) => !part)) return null
  const tail = normalizeAbsoluteParts(parts.slice(2))
  const windowsPath = `\\\\${[...root, ...tail].join('\\')}`
  const windowsIdentity = windowsPathIdentityKey(windowsPath)
  if (!windowsIdentity) return null
  return {
    execution: 'windows',
    inputKind: 'windows-unc',
    identityKey: `windows:${windowsIdentity}`,
    projectPath: windowsPath,
    windowsPath,
  }
}

function normalizeAbsoluteParts(parts: string[]): string[] {
  const normalized: string[] = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') normalized.pop()
    else normalized.push(part)
  }
  return normalized
}

function normalizePosixAbsolute(value: string): string | null {
  if (!value.startsWith('/') || hasUnsafeText(value)) return null
  return `/${normalizeAbsoluteParts(value.split('/')).join('/')}`
}

function hasUnsafeText(value: string): boolean {
  return value.length === 0 || /[\x00-\x1f\x7f]/u.test(value)
}
