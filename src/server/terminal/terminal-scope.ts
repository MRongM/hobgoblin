import path from 'node:path'
import { pathStyle } from '#/shared/path-semantics.ts'
import { isRemoteRepoId } from '#/shared/remote-repo.ts'

export function terminalSessionScope(repoRoot: string): string {
  if (isRemoteRepoId(repoRoot)) return repoRoot
  const style = pathStyle(repoRoot)
  if (style === 'windowsDriveAbsolute' || style === 'windowsUncAbsolute') {
    return path.win32.resolve(repoRoot).replace(/^[a-z]:/u, (drive) => drive.toUpperCase())
  }
  return path.resolve(repoRoot)
}
