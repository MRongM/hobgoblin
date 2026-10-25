import path from 'node:path'
import { resolveRemoteRepoTarget } from '#/server/modules/repo-backend.ts'
import type { FilePreviewKind, FilePreviewReadResult } from '#/shared/file-preview.ts'
import { pathStyle } from '#/shared/path-semantics.ts'
import { isRemoteRepoId } from '#/shared/remote-repo.ts'
import { readLocalFileTreeBinaryFile, readLocalFileTreeTextFile } from '#/system/file-tree/local.ts'
import { readRemoteFileTreeBinaryFile, readRemoteFileTreeTextFile } from '#/system/ssh/git.ts'

const IMAGE_MAX_BYTES = 20 * 1024 * 1024

export async function readRepositoryFilePreview(
  repoId: string,
  filePath: string,
  kind: FilePreviewKind,
  signal?: AbortSignal,
): Promise<FilePreviewReadResult> {
  if (signal?.aborted) return { ok: false, message: 'cancelled' }
  const remote = isRemoteRepoId(repoId)
  const paths = remote ? path.posix : path
  if (
    !repoId ||
    repoId.includes('\0') ||
    !filePath ||
    filePath.includes('\0') ||
    !paths.isAbsolute(filePath) ||
    (kind !== 'text' && kind !== 'image')
  ) {
    return { ok: false, message: 'error.invalid-arguments' }
  }

  const normalizedPath = paths.normalize(filePath)
  if (paths.sep === '\\' && pathStyle(normalizedPath) !== 'windowsDriveAbsolute') {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  const readRoot = paths.dirname(normalizedPath)
  if (remote) {
    const target = await resolveRemoteRepoTarget(repoId)
    if (signal?.aborted) return { ok: false, message: 'cancelled' }
    return kind === 'text'
      ? await readRemoteFileTreeTextFile(target, readRoot, normalizedPath, { signal })
      : await readRemoteFileTreeBinaryFile(target, readRoot, normalizedPath, IMAGE_MAX_BYTES, { signal })
  }
  return kind === 'text'
    ? await readLocalFileTreeTextFile(readRoot, normalizedPath)
    : await readLocalFileTreeBinaryFile(readRoot, normalizedPath, IMAGE_MAX_BYTES)
}
