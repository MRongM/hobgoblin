import { isRemoteRepoId, normalizeRemoteRepoId, parseRemoteRepoId } from '#/shared/remote-repo.ts'
import { resolveLocalFilePath } from '#/shared/local-file-path-bridge.ts'

type FileManagerTarget = { ok: true; path: string } | { ok: false; message: string }

/** Native file managers use local paths; WSL locations retain their distribution through UNC. */
export function resolveFileManagerTarget(
  repoId: string,
  targetPath: string | null,
  hostPlatform?: string,
): FileManagerTarget {
  if (!targetPath || /[\x00-\x1f\x7f]/.test(targetPath)) return { ok: false, message: 'directory-open.no-directory' }
  const remote = parseRemoteRepoId(repoId)
  if (isRemoteRepoId(repoId) && (!remote || remote.transport !== 'wsl' || hostPlatform !== 'win32')) {
    return { ok: false, message: 'directory-open.remote-unavailable' }
  }
  if (hostPlatform !== 'win32') {
    return targetPath.startsWith('/') ? { ok: true, path: targetPath } : { ok: false, message: 'error.invalid-path' }
  }
  let nativeInput = targetPath
  if (remote) {
    if (!targetPath.startsWith('/') || targetPath.includes('\\')) return { ok: false, message: 'error.invalid-path' }
    nativeInput = normalizeRemoteRepoId({ ...remote, remotePath: targetPath })
  }
  const resolved = resolveLocalFilePath(nativeInput, { kind: 'windows' })
  if (resolved?.execution === 'windows') return { ok: true, path: resolved.windowsPath }
  if (resolved?.execution === 'wsl') {
    if (
      /[\\/:*?"<>|]/.test(resolved.distribution) ||
      ['.', '..'].includes(resolved.distribution) ||
      resolved.linuxPath.includes('\\')
    ) {
      return { ok: false, message: 'error.invalid-path' }
    }
    return { ok: true, path: `\\\\wsl.localhost\\${resolved.distribution}${resolved.linuxPath.replaceAll('/', '\\')}` }
  }
  return { ok: false, message: 'error.invalid-path' }
}
