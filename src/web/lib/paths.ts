import { homeDirectory } from '#/web/app-shell-client.ts'
import { tildifyPath, untildifyPath } from '#/shared/paths.ts'
import { remoteTargetSubtitle, remoteWorktreePathLabel, type RemoteRepoTarget } from '#/shared/remote-repo.ts'
export { tildifyPath, untildifyPath } from '#/shared/paths.ts'

/** Last segment of a path. Tolerant of either separator so worktree
 *  paths and repo roots render correctly on both POSIX and Windows. */
export function lastPathSegment(p: string): string {
  if (/^[A-Za-z]:[/\\]+$/.test(p)) return ''
  const trimmed = p.replace(/[/\\]+$/, '')
  const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed
}

/** Everything before the last segment, with the trailing separator
 *  stripped. Returns '' for paths with no separator. POSIX/Windows
 *  agnostic for the same reason as `lastPathSegment`. */
export function parentDir(p: string): string {
  if (/^[/\\]+$/.test(p)) return p[0] ?? ''
  if (/^[A-Za-z]:[/\\]+$/.test(p)) return `${p.slice(0, 2)}${p[2] === '/' ? '/' : '\\'}`
  const trimmed = p.replace(/[/\\]+$/, '')
  const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  if (idx === 2 && /^[A-Za-z]:[/\\]/.test(trimmed)) return trimmed.slice(0, 3)
  if (idx > 0) return trimmed.slice(0, idx)
  if (idx === 0) return trimmed[0] ?? ''
  return ''
}

export function joinPath(parent: string, child: string): string {
  if (!parent) return child
  if (!child) return parent
  if (/[/\\]$/.test(parent)) return parent + child
  if (/^[A-Za-z]:$/.test(parent)) return `${parent}\\${child}`
  const sep = parent.includes('\\') && !parent.includes('/') ? '\\' : '/'
  return `${parent}${sep}${child}`
}

export function defaultWorktreePath(repoId: string, branch: string): string {
  const slug = branch.trim().replaceAll('/', '-')
  if (!slug) return ''
  const parent = parentDir(repoId)
  const name = lastPathSegment(repoId) || 'worktree'
  return parent ? joinPath(parent, `${name}-${slug}`) : `${name}-${slug}`
}

export function tildify(path: string): string {
  return tildifyPath(path, homeDirectory())
}

export function untildify(path: string): string {
  return untildifyPath(path, homeDirectory())
}

export function formatRepoLocator(path: string, target?: RemoteRepoTarget): string {
  return target ? remoteTargetSubtitle(target) : tildify(path)
}

export function formatWorktreePath(path: string, target?: RemoteRepoTarget, repoRoot?: string): string {
  const relativePath = repoRoot ? relativeDisplayPath(repoRoot, path) : null
  if (relativePath) return relativePath
  return target ? remoteWorktreePathLabel(target, path) : tildify(path)
}

export function formatWorktreeListPath(path: string, target?: RemoteRepoTarget, repoRoot?: string): string {
  const relativePath = repoRoot ? relativeDisplayPath(repoRoot, path) : null
  if (relativePath) return relativePath
  return target ? path : tildify(path)
}

function relativeDisplayPath(fromPath: string, toPath: string): string | null {
  const posix = relativePosixPath(fromPath, toPath)
  if (posix) return posix
  return relativeWindowsPath(fromPath, toPath)
}

function relativePosixPath(fromPath: string, toPath: string): string | null {
  if (!fromPath.startsWith('/') || !toPath.startsWith('/')) return null
  const fromParts = posixPathParts(fromPath)
  const toParts = posixPathParts(toPath)
  return relativeParts(fromParts, toParts, '/')
}

function posixPathParts(value: string): string[] {
  return value.split('/').filter(Boolean)
}

function relativeWindowsPath(fromPath: string, toPath: string): string | null {
  const from = windowsPathParts(fromPath)
  const to = windowsPathParts(toPath)
  if (!from || !to || from.drive !== to.drive) return null
  return relativeParts(from.parts, to.parts, '\\')
}

function windowsPathParts(value: string): { drive: string; parts: string[] } | null {
  const match = /^([A-Za-z]):[/\\]*(.*)$/.exec(value)
  if (!match) return null
  return {
    drive: match[1]!.toUpperCase(),
    parts: match[2]!.split(/[/\\]+/).filter(Boolean),
  }
}

function relativeParts(fromParts: string[], toParts: string[], separator: string): string {
  let common = 0
  while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) {
    common += 1
  }

  const up = Array.from({ length: fromParts.length - common }, () => '..')
  const down = toParts.slice(common)
  return [...up, ...down].join(separator) || '.'
}
