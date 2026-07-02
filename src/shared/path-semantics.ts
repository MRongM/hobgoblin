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

function posixRelativeInside(worktreePath: string, candidatePath: string): string | null {
  const rootParts = splitPosix(worktreePath)
  const candidateParts = splitPosix(candidatePath)
  if (!partsStartWith(candidateParts, rootParts, false)) return null
  return candidateParts.slice(rootParts.length).join('/') || '.'
}

function splitPosix(value: string): string[] {
  return value.split('/').filter(Boolean)
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
    parts: rawTail.split(/[\\/]+/u).filter(Boolean),
  }
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
