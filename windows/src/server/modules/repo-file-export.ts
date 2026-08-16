import { promises as fs } from 'node:fs'
import path from 'node:path'
import { resolveRemoteRepoTarget } from '#/server/modules/repo-backend.ts'
import { FILE_TRANSFER_MAX_FILE_BYTES, FILE_TRANSFER_MAX_TOTAL_BYTES } from '#/shared/file-tree.ts'
import {
  isRepoFileExportRequest,
  type RepoFileExportCopiedEntry,
  type RepoFileExportFailedEntry,
  type RepoFileExportRenamedEntry,
  type RepoFileExportRequest,
  type RepoFileExportResult,
} from '#/shared/file-tree-export.ts'
import { isRemoteRepoId } from '#/shared/rpc.ts'
import { pathInsideRoot } from '#/system/file-tree/local.ts'
import { uniqueCopyName } from '#/system/file-tree/transfer.ts'
import { inventoryRemoteFileTransfer, readRemoteFileBase64 } from '#/system/ssh/git.ts'

export async function exportRepositoryFilesToLocalDirectory(input: unknown): Promise<RepoFileExportResult> {
  if (!isRepoFileExportRequest(input)) return { ok: false, message: 'error.invalid-arguments' }
  if (!path.isAbsolute(input.targetDirPath) || input.targetDirPath.includes('\0')) {
    return { ok: false, message: 'error.invalid-path' }
  }
  await fs.mkdir(input.targetDirPath, { recursive: true })
  return isRemoteRepoId(input.repoId) ? await exportRemoteFiles(input) : await exportLocalFiles(input)
}

async function exportLocalFiles(input: RepoFileExportRequest): Promise<RepoFileExportResult> {
  const local = await localOrdinaryFiles(input.worktreePath, input.paths)
  if (!local.ok) return local
  const existingNames = new Set(await fs.readdir(input.targetDirPath).catch(() => []))
  const copied: RepoFileExportCopiedEntry[] = []
  const renamed: RepoFileExportRenamedEntry[] = []
  const failed: RepoFileExportFailedEntry[] = []
  for (const file of local.files) {
    const requestedName = path.basename(file.sourcePath)
    const destinationName = uniqueCopyName(existingNames, requestedName)
    existingNames.add(destinationName)
    const destinationPath = path.join(input.targetDirPath, destinationName)
    if (destinationName !== requestedName) renamed.push({ requestedName, destinationName, destinationPath })
    try {
      await fs.copyFile(file.sourcePath, destinationPath)
      copied.push({ sourcePath: file.sourcePath, destinationPath, kind: 'file' })
    } catch {
      failed.push({ sourcePath: file.sourcePath, message: 'error.failed-read-repo' })
    }
  }
  return { ok: true, copied, renamed, failed }
}

async function exportRemoteFiles(input: RepoFileExportRequest): Promise<RepoFileExportResult> {
  const target = await resolveRemoteRepoTarget(input.repoId)
  const inventory = await inventoryRemoteFileTransfer(target, input.worktreePath, input.paths)
  if (!inventory.ok) return inventory
  if (inventory.totalBytes > FILE_TRANSFER_MAX_TOTAL_BYTES) {
    return { ok: false, message: 'error.file-transfer-total-too-large' }
  }
  const existingNames = new Set(await fs.readdir(input.targetDirPath).catch(() => []))
  const copied: RepoFileExportCopiedEntry[] = []
  const renamed: RepoFileExportRenamedEntry[] = []
  const failed: RepoFileExportFailedEntry[] = []
  for (const sourcePath of input.paths) {
    const entry = inventory.entries.find((item) => samePath(item.path, sourcePath))
    if (!entry || entry.kind !== 'file') {
      failed.push({ sourcePath, message: 'error.invalid-path' })
      continue
    }
    if (entry.size > FILE_TRANSFER_MAX_FILE_BYTES) {
      failed.push({ sourcePath, message: 'error.file-transfer-file-too-large' })
      continue
    }
    const requestedName = path.posix.basename(sourcePath)
    const destinationName = uniqueCopyName(existingNames, requestedName)
    existingNames.add(destinationName)
    const destinationPath = path.join(input.targetDirPath, destinationName)
    if (destinationName !== requestedName) renamed.push({ requestedName, destinationName, destinationPath })
    const read = await readRemoteFileBase64(target, sourcePath)
    if (!read.ok) {
      failed.push({ sourcePath, message: read.message })
      continue
    }
    await fs.writeFile(destinationPath, Buffer.from(read.bytesBase64, 'base64'))
    copied.push({ sourcePath, destinationPath, kind: 'file' })
  }
  return { ok: true, copied, renamed, failed }
}

async function localOrdinaryFiles(
  worktreePath: string,
  paths: string[],
): Promise<{ ok: true; files: Array<{ sourcePath: string; size: number }> } | { ok: false; message: string }> {
  if (!path.isAbsolute(worktreePath) || worktreePath.includes('\0')) return { ok: false, message: 'error.invalid-arguments' }
  const root = path.resolve(worktreePath)
  let totalBytes = 0
  const files: Array<{ sourcePath: string; size: number }> = []
  for (const value of paths) {
    if (!path.isAbsolute(value) || value.includes('\0')) return { ok: false, message: 'error.invalid-arguments' }
    const sourcePath = path.resolve(value)
    if (!pathInsideRoot(root, sourcePath)) return { ok: false, message: 'error.file-transfer-source-outside-worktree' }
    const stat = await fs.lstat(sourcePath).catch(() => null)
    if (!stat) return { ok: false, message: 'error.path-not-found' }
    if (!stat.isFile()) return { ok: false, message: 'error.invalid-path' }
    if (stat.size > FILE_TRANSFER_MAX_FILE_BYTES) return { ok: false, message: 'error.file-transfer-file-too-large' }
    totalBytes += stat.size
    if (totalBytes > FILE_TRANSFER_MAX_TOTAL_BYTES) return { ok: false, message: 'error.file-transfer-total-too-large' }
    files.push({ sourcePath, size: stat.size })
  }
  return { ok: true, files }
}

function samePath(left: string, right: string): boolean {
  return path.posix.normalize(left) === path.posix.normalize(right)
}
