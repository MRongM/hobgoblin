import { isRemoteRepoId } from '#/shared/remote-repo.ts'
import { getInitialBootstrap } from '#/web/bootstrap.ts'

export function supportsWindowsInternalTerminalShellMenu(repoRoot: string): boolean {
  return getInitialBootstrap().hostPlatform === 'win32' && !isRemoteRepoId(repoRoot)
}
