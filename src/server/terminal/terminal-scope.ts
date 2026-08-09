import path from 'node:path'
import { windowsPathIdentityKey } from '#/shared/path-semantics.ts'
import { isRemoteRepoId } from '#/shared/remote-repo.ts'

export function terminalSessionScope(repoRoot: string): string {
  if (isRemoteRepoId(repoRoot)) return repoRoot
  const windowsIdentity = windowsPathIdentityKey(repoRoot)
  if (windowsIdentity) return windowsIdentity
  return path.resolve(repoRoot)
}
