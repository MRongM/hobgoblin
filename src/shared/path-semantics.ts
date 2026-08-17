export type PathStyle = 'posixAbsolute' | 'windowsDriveAbsolute' | 'windowsUncAbsolute' | 'relative'

interface WindowsDriveParts {
  drive: string
  parts: string[]
  separator: '\\' | '/'
}

const WINDOWS_DRIVE_RE = /^([A-Za-z]):([\\/])(.*)$/u
const WINDOWS_UNC_RE = /^\\\\[^\\/\0]+[\\/][^\\/\0]+(?:[\\/].*)?$/u

export function pathStyle(value: string): PathStyle {
  if (value.startsWith('/')) return 'posixAbsolute'
  if (WINDOWS_DRIVE_RE.test(value)) return 'windowsDriveAbsolute'
  if (WINDOWS_UNC_RE.test(value)) return 'windowsUncAbsolute'
  return 'relative'
}

export function safeRelativePath(value: string): string | null {
  let normalized = value.trim()
  while (normalized.startsWith('./')) normalized = normalized.slice(2)
  if (!normalized || normalized.includes('\0') || normalized.includes('\\')) return null
  if (normalized.startsWith('/') || pathStyle(normalized) !== 'relative') return null
  const parts = normalized.split('/')
  if (parts.some((part) => !part || part === '.' || part === '..')) return null
  return parts.join('/')
}

export function worktreeRelativePathFromAbsolute(worktreePath: string, candidatePath: string): string | null {
  const worktreeStyle = pathStyle(worktreePath)
  const candidateStyle = pathStyle(candidatePath)
  if (worktreeStyle !== candidateStyle) return null

  if (worktreeStyle === 'posixAbsolute') {
    return posixRelativeInside(worktreePath, candidatePath)
  }
  if (worktreeStyle === 'windowsDriveAbsolute') {
    return windowsDriveRelativeInside(worktreePath, candidatePath)
  }
  return null
}

export function joinWorktreeRelativePath(worktreePath: string, relativePath: string): string {
  const normalizedRelative = safeRelativePath(relativePath)
  if (!normalizedRelative || normalizedRelative === '.') return worktreePath
  const trimmedRoot = worktreePath.replace(/[\\/]+$/u, '')
  const separator = worktreePath.includes('\\') && !worktreePath.includes('/') ? '\\' : '/'
  return `${trimmedRoot}${separator}${normalizedRelative.split('/').join(separator)}`
}

export function windowsPathIdentityKey(value: string): string | null {
  const style = pathStyle(value)
  if (style === 'windowsDriveAbsolute') {
    const parsed = windowsDriveParts(value)
    if (!parsed) return null
    return `${parsed.drive}:\\${parsed.parts.map((part) => part.toLowerCase()).join('\\')}`
  }
  if (style === 'windowsUncAbsolute') {
    const parts = value.slice(2).split(/[\\/]+/u)
    const root = parts.slice(0, 2)
    const tail = normalizeAbsoluteParts(parts.slice(2))
    return `\\\\${[...root, ...tail].map((part) => part.toLowerCase()).join('\\')}`
  }
  return null
}

/** Compare local paths that may cross the native Windows / WSL boundary. */
export function sameLocalHostPath(left: string, right: string): boolean {
  const leftWindows = windowsOrWslPathIdentityKey(left)
  const rightWindows = windowsOrWslPathIdentityKey(right)
  if (leftWindows || rightWindows) return leftWindows !== null && leftWindows === rightWindows
  if (pathStyle(left) !== 'posixAbsolute' || pathStyle(right) !== 'posixAbsolute') return left === right
  return posixPathIdentityKey(left) === posixPathIdentityKey(right)
}

function windowsOrWslPathIdentityKey(value: string): string | null {
  const windows = windowsPathIdentityKey(value)
  if (windows) return windows
  const match = /^\/mnt\/([A-Za-z])(?:\/(.*))?$/u.exec(posixPathIdentityKey(value))
  if (!match) return null
  const drive = (match[1] ?? '').toUpperCase()
  const tail = normalizeAbsoluteParts((match[2] ?? '').split('/'))
  return `${drive}:\\${tail.map((part) => part.toLowerCase()).join('\\')}`
}

function posixPathIdentityKey(value: string): string {
  return `/${normalizeAbsoluteParts(value.split('/')).join('/')}`
}

function posixRelativeInside(worktreePath: string, candidatePath: string): string | null {
  const rootParts = splitPosix(worktreePath)
  const candidateParts = splitPosix(candidatePath)
  if (!partsStartWith(candidateParts, rootParts, false)) return null
  return candidateParts.slice(rootParts.length).join('/') || '.'
}

function splitPosix(value: string): string[] {
  return normalizeAbsoluteParts(value.split('/'))
}

function windowsDriveRelativeInside(worktreePath: string, candidatePath: string): string | null {
  const root = windowsDriveParts(worktreePath)
  const candidate = windowsDriveParts(candidatePath)
  if (!root || !candidate || root.drive !== candidate.drive) return null
  if (!partsStartWith(candidate.parts, root.parts, true)) return null
  return candidate.parts.slice(root.parts.length).join('/') || '.'
}

function windowsDriveParts(value: string): WindowsDriveParts | null {
  const match = WINDOWS_DRIVE_RE.exec(value)
  if (!match) return null
  const rawTail = match[3] ?? ''
  return {
    drive: (match[1] ?? '').toUpperCase(),
    separator: match[2] === '/' ? '/' : '\\',
    parts: normalizeAbsoluteParts(rawTail.split(/[\\/]+/u)),
  }
}

function normalizeAbsoluteParts(parts: string[]): string[] {
  const normalized: string[] = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') {
      normalized.pop()
      continue
    }
    normalized.push(part)
  }
  return normalized
}

function partsStartWith(candidate: string[], root: string[], insensitive: boolean): boolean {
  if (candidate.length < root.length) return false
  for (let i = 0; i < root.length; i += 1) {
    const a = candidate[i] ?? ''
    const b = root[i] ?? ''
    if (insensitive ? a.toLowerCase() !== b.toLowerCase() : a !== b) return false
  }
  return true
}
