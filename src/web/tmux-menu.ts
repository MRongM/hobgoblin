import { isRemoteRepoId } from '#/shared/remote-repo.ts'
import { getInitialBootstrap } from '#/web/bootstrap.ts'

export function supportsTmuxMenu(projectRoot?: string): boolean {
  if (!projectRoot) return false
  if (isRemoteRepoId(projectRoot)) return true
  try {
    return getInitialBootstrap().hostPlatform !== 'win32'
  } catch {
    return true
  }
}
